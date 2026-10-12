import type { TimeRange } from '@meetqueue/core';
import type { Db } from '../db';
import type { Cipher } from '../lib/crypto';
import type { Logger } from '../lib/logger';
import { GoogleApiError } from '../providers/calendar/google';
import type {
  CalendarEventInput,
  CalendarProvider,
  CalendarProviderName,
  CalendarTokens,
} from '../providers/calendar/types';

interface ActiveConnection {
  id: string;
  provider: CalendarProvider;
  calendarId: string;
  tokens: CalendarTokens;
  lastError: string | null;
}

export interface CalendarSyncResult {
  provider: CalendarProviderName;
  eventId: string;
  inviteSent: boolean;
}

/** Refresh a little before expiry so requests don't race the deadline. */
const REFRESH_MARGIN_MS = 60_000;

/** A host-facing explanation of why calendar sync stopped. */
export function describeCalendarError(error: unknown): string {
  if (error instanceof GoogleApiError) {
    if (error.body.includes('invalid_grant')) {
      return 'Google access expired or was revoked. Reconnect your calendar to resume syncing.';
    }
    if (error.status === 401 || error.status === 403) {
      return `Google rejected the request (HTTP ${error.status}). Reconnect your calendar.`;
    }
    return `Google ${error.operation} failed (HTTP ${error.status}).`;
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'Google Calendar did not respond in time.';
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 200);
}

/**
 * Owns calendar connections: encrypts tokens at rest, refreshes them, and applies the error
 * policy — calendar problems are logged and never block a booking (the DB is the source of
 * truth; ICS email is the fallback).
 */
export class CalendarService {
  constructor(
    private readonly db: Db,
    private readonly providers: { google?: CalendarProvider; mock: CalendarProvider },
    private readonly cipher: Cipher,
    private readonly log: Logger,
  ) {}

  /** Which provider "Connect Google Calendar" uses for this user. */
  providerFor(user: { isDemo: boolean }): CalendarProvider {
    // The shared demo account must never hold a visitor's real Google tokens.
    if (user.isDemo || !this.providers.google) return this.providers.mock;
    return this.providers.google;
  }

  get mode(): CalendarProviderName {
    return this.providers.google ? 'google' : 'mock';
  }

  private providerByName(name: string): CalendarProvider | undefined {
    if (name === 'google') return this.providers.google;
    if (name === 'mock') return this.providers.mock;
    return undefined;
  }

  async connect(user: { id: string; isDemo: boolean }, code: string) {
    const provider = this.providerFor(user);
    const account = await provider.exchangeCode(code);
    const data = {
      provider: provider.name,
      accountEmail: account.accountEmail,
      accessTokenEnc: this.cipher.encrypt(account.accessToken),
      refreshTokenEnc: account.refreshToken ? this.cipher.encrypt(account.refreshToken) : null,
      tokenExpiresAt: account.expiresAt,
      lastError: null,
      lastErrorAt: null,
    };
    return this.db.calendarConnection.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
  }

  async disconnect(userId: string) {
    const active = await this.active(userId).catch(() => null);
    if (active) {
      await active.provider.revoke(active.tokens).catch((error: unknown) => {
        this.log.warn({ err: error }, 'calendar token revoke failed');
      });
    }
    await this.db.calendarConnection.deleteMany({ where: { userId } });
  }

  /** Loads, decrypts and (if needed) refreshes a user's connection. */
  async active(userId: string): Promise<ActiveConnection | null> {
    const connection = await this.db.calendarConnection.findUnique({ where: { userId } });
    if (!connection?.accessTokenEnc) return null;
    const provider = this.providerByName(connection.provider);
    if (!provider) return null;

    let tokens: CalendarTokens = {
      accessToken: this.cipher.decrypt(connection.accessTokenEnc),
      refreshToken: connection.refreshTokenEnc
        ? this.cipher.decrypt(connection.refreshTokenEnc)
        : null,
      expiresAt: connection.tokenExpiresAt,
    };
    if (tokens.expiresAt && tokens.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) {
      tokens = await provider.refresh(tokens);
      await this.db.calendarConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
          refreshTokenEnc: tokens.refreshToken ? this.cipher.encrypt(tokens.refreshToken) : null,
          tokenExpiresAt: tokens.expiresAt,
        },
      });
    }
    return {
      id: connection.id,
      provider,
      calendarId: connection.calendarId,
      tokens,
      lastError: connection.lastError,
    };
  }

  /** Remembers why sync failed so the host sees it on the Integrations page. */
  private async recordFailure(userId: string, error: unknown) {
    await this.db.calendarConnection
      .updateMany({
        where: { userId },
        data: { lastError: describeCalendarError(error), lastErrorAt: new Date() },
      })
      .catch(() => {});
  }

  private async recordSuccess(active: ActiveConnection) {
    if (!active.lastError) return;
    await this.db.calendarConnection
      .update({ where: { id: active.id }, data: { lastError: null, lastErrorAt: null } })
      .catch(() => {});
  }

  /** External busy blocks; returns [] (and logs) if the calendar can't be read. */
  async busy(userId: string, range: TimeRange): Promise<TimeRange[]> {
    try {
      const active = await this.active(userId);
      if (!active) return [];
      const busy = await active.provider.busy(active.tokens, active.calendarId, range);
      await this.recordSuccess(active);
      return busy;
    } catch (error) {
      this.log.warn({ err: error, userId }, 'calendar free/busy failed; continuing without it');
      await this.recordFailure(userId, error);
      return [];
    }
  }

  async createEvent(userId: string, event: CalendarEventInput): Promise<CalendarSyncResult | null> {
    try {
      const active = await this.active(userId);
      if (!active) return null;
      const created = await active.provider.createEvent(active.tokens, active.calendarId, event);
      await this.recordSuccess(active);
      return { provider: active.provider.name, ...created };
    } catch (error) {
      this.log.error({ err: error, bookingId: event.bookingId }, 'calendar event create failed');
      await this.recordFailure(userId, error);
      return null;
    }
  }

  /** Returns whether the provider notified the attendee itself. */
  async updateEvent(
    userId: string,
    providerName: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<boolean> {
    try {
      const active = await this.active(userId);
      if (!active || active.provider.name !== providerName) return false;
      await active.provider.updateEvent(active.tokens, active.calendarId, eventId, event);
      await this.recordSuccess(active);
      return active.provider.name === 'google';
    } catch (error) {
      this.log.error({ err: error, bookingId: event.bookingId }, 'calendar event update failed');
      await this.recordFailure(userId, error);
      return false;
    }
  }

  async deleteEvent(userId: string, providerName: string, eventId: string): Promise<boolean> {
    try {
      const active = await this.active(userId);
      if (!active || active.provider.name !== providerName) return false;
      await active.provider.deleteEvent(active.tokens, active.calendarId, eventId);
      await this.recordSuccess(active);
      return active.provider.name === 'google';
    } catch (error) {
      this.log.error({ err: error, eventId }, 'calendar event delete failed');
      await this.recordFailure(userId, error);
      return false;
    }
  }
}
