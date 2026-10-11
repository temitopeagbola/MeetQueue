import type { TimeRange } from '@meetqueue/core';
import type {
  CalendarAccount,
  CalendarEventInput,
  CalendarProvider,
  CalendarTokens,
  CreatedCalendarEvent,
} from './types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

export interface GoogleOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
  /** Per-request timeout; a slow Google API must not hold a booking request open. */
  timeoutMs?: number;
}

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly operation: string,
  ) {
    super(`Google ${operation} failed with HTTP ${status}`);
    this.name = 'GoogleApiError';
  }
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
}

/** Reads the email claim from an ID token received directly from Google's token endpoint. */
function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
    };
    return claims.email ?? null;
  } catch {
    return null;
  }
}

function eventBody(event: CalendarEventInput) {
  return {
    summary: event.summary,
    description: event.description,
    location: event.location ?? undefined,
    start: { dateTime: event.start.toISOString(), timeZone: event.timezone },
    end: { dateTime: event.end.toISOString(), timeZone: event.timezone },
    attendees: [{ email: event.attendee.email, displayName: event.attendee.name }],
    reminders: { useDefault: true },
    extendedProperties: { private: { meetqueueBookingId: event.bookingId } },
  };
}

/** Google Calendar over plain REST + OAuth 2.0 (no SDK; keeps the bundle small and testable). */
export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = 'google' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: GoogleOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private fetch(url: string, init: RequestInit) {
    return this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
  }

  authorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  private async tokenRequest(params: Record<string, string>, operation: string) {
    const response = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        ...params,
      }),
    });
    if (!response.ok) throw new GoogleApiError(response.status, await response.text(), operation);
    return (await response.json()) as TokenResponse;
  }

  async exchangeCode(code: string): Promise<CalendarAccount> {
    const tokens = await this.tokenRequest(
      { code, grant_type: 'authorization_code', redirect_uri: this.options.redirectUri },
      'token exchange',
    );
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      accountEmail: emailFromIdToken(tokens.id_token) ?? 'Google account',
    };
  }

  async refresh(tokens: CalendarTokens): Promise<CalendarTokens> {
    if (!tokens.refreshToken) return tokens;
    const refreshed = await this.tokenRequest(
      { refresh_token: tokens.refreshToken, grant_type: 'refresh_token' },
      'token refresh',
    );
    return {
      accessToken: refreshed.access_token,
      // Google usually omits refresh_token on refresh; keep the one we have.
      refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
      expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
    };
  }

  private async api<T>(
    tokens: CalendarTokens,
    method: string,
    path: string,
    operation: string,
    body?: unknown,
  ): Promise<T | null> {
    const response = await this.fetch(`${CALENDAR_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new GoogleApiError(response.status, await response.text(), operation);
    if (response.status === 204) return null;
    return (await response.json()) as T;
  }

  async busy(tokens: CalendarTokens, calendarId: string, range: TimeRange): Promise<TimeRange[]> {
    const result = await this.api<{
      calendars: Record<string, { busy?: { start: string; end: string }[] }>;
    }>(tokens, 'POST', '/freeBusy', 'free/busy', {
      timeMin: range.start.toISOString(),
      timeMax: range.end.toISOString(),
      items: [{ id: calendarId }],
    });
    const busy = result?.calendars[calendarId]?.busy ?? [];
    return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  }

  async createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<CreatedCalendarEvent> {
    const created = await this.api<{ id: string }>(
      tokens,
      'POST',
      `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      'event insert',
      eventBody(event),
    );
    if (!created?.id) throw new Error('Google returned no event id');
    return { eventId: created.id, inviteSent: true };
  }

  async updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<void> {
    await this.api(
      tokens,
      'PATCH',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      'event update',
      eventBody(event),
    );
  }

  async deleteEvent(tokens: CalendarTokens, calendarId: string, eventId: string): Promise<void> {
    try {
      await this.api(
        tokens,
        'DELETE',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        'event delete',
      );
    } catch (error) {
      // Already deleted in Google: nothing left to do.
      if (error instanceof GoogleApiError && (error.status === 404 || error.status === 410)) return;
      throw error;
    }
  }

  async revoke(tokens: CalendarTokens): Promise<void> {
    const token = tokens.refreshToken ?? tokens.accessToken;
    await this.fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' });
  }
}
