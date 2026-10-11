import { describe, expect, it, vi } from 'vitest';
import {
  GoogleApiError,
  GoogleCalendarProvider,
  GOOGLE_SCOPES,
} from '../../src/providers/calendar/google';

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? { status: 200, body: {} };
    const status = next.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(next.body ?? {}), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const options = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://meetqueue.example.com/api/integrations/google/callback',
};
const tokens = { accessToken: 'access', refreshToken: 'refresh', expiresAt: null };
const idToken = (email: string) =>
  ['x', Buffer.from(JSON.stringify({ email })).toString('base64url'), 'sig'].join('.');

const event = {
  bookingId: 'b1',
  summary: 'Intro with Grace',
  description: 'Notes',
  location: 'Zoom',
  start: new Date('2026-10-12T10:00:00Z'),
  end: new Date('2026-10-12T10:30:00Z'),
  timezone: 'Europe/London',
  attendee: { name: 'Grace', email: 'grace@example.com' },
};

describe('GoogleCalendarProvider', () => {
  it('builds an offline-access consent URL with state', () => {
    const url = new URL(new GoogleCalendarProvider(options).authorizationUrl('state-123'));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('redirect_uri')).toBe(options.redirectUri);
    expect(url.searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' '));
  });

  it('exchanges a code for tokens and reads the account email', async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: {
          access_token: 'a1',
          refresh_token: 'r1',
          expires_in: 3600,
          id_token: idToken('host@gmail.com'),
        },
      },
    ]);
    const account = await new GoogleCalendarProvider({ ...options, fetch }).exchangeCode('code-1');
    expect(account).toMatchObject({
      accessToken: 'a1',
      refreshToken: 'r1',
      accountEmail: 'host@gmail.com',
    });
    expect(account.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    const body = new URLSearchParams(calls[0]!.init.body as URLSearchParams);
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-1');
    expect(body.get('client_secret')).toBe('client-secret');
  });

  it('keeps the existing refresh token when Google omits it on refresh', async () => {
    const { fetch } = fakeFetch([{ body: { access_token: 'a2', expires_in: 3600 } }]);
    const refreshed = await new GoogleCalendarProvider({ ...options, fetch }).refresh(tokens);
    expect(refreshed).toMatchObject({ accessToken: 'a2', refreshToken: 'refresh' });
  });

  it('maps free/busy blocks', async () => {
    const { fetch, calls } = fakeFetch([
      {
        body: {
          calendars: {
            primary: { busy: [{ start: '2026-10-12T09:00:00Z', end: '2026-10-12T10:00:00Z' }] },
          },
        },
      },
    ]);
    const busy = await new GoogleCalendarProvider({ ...options, fetch }).busy(tokens, 'primary', {
      start: new Date('2026-10-12T00:00:00Z'),
      end: new Date('2026-10-13T00:00:00Z'),
    });
    expect(busy).toEqual([
      { start: new Date('2026-10-12T09:00:00Z'), end: new Date('2026-10-12T10:00:00Z') },
    ]);
    expect(calls[0]!.url).toBe('https://www.googleapis.com/calendar/v3/freeBusy');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer access');
  });

  it('creates events that invite the attendee', async () => {
    const { fetch, calls } = fakeFetch([{ body: { id: 'evt-1' } }]);
    const created = await new GoogleCalendarProvider({ ...options, fetch }).createEvent(
      tokens,
      'primary',
      event,
    );
    expect(created).toEqual({ eventId: 'evt-1', inviteSent: true });
    expect(calls[0]!.url).toContain('/calendars/primary/events?sendUpdates=all');
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toMatchObject({
      summary: 'Intro with Grace',
      start: { dateTime: '2026-10-12T10:00:00.000Z', timeZone: 'Europe/London' },
      attendees: [{ email: 'grace@example.com', displayName: 'Grace' }],
      extendedProperties: { private: { meetqueueBookingId: 'b1' } },
    });
  });

  it('treats an already-deleted event as success and surfaces other failures', async () => {
    const gone = fakeFetch([{ status: 410, body: { error: 'gone' } }]);
    await expect(
      new GoogleCalendarProvider({ ...options, fetch: gone.fetch }).deleteEvent(
        tokens,
        'primary',
        'evt-1',
      ),
    ).resolves.toBeUndefined();

    const failing = fakeFetch([{ status: 403, body: { error: 'forbidden' } }]);
    await expect(
      new GoogleCalendarProvider({ ...options, fetch: failing.fetch }).createEvent(
        tokens,
        'primary',
        event,
      ),
    ).rejects.toBeInstanceOf(GoogleApiError);
  });
});
