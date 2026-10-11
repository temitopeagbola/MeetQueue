import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockCalendarProvider } from '../../src/providers/calendar/mock';
import {
  bookUrl,
  bookingPayload,
  createTestApp,
  resetDatabase,
  sessionCookie,
  setupHost,
  signup,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.db);
});

describe('auth', () => {
  it('signs up with a ready-to-use schedule and meeting type', async () => {
    const { cookie } = await signup(ctx.app);
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user).toMatchObject({
      username: 'ada',
      timezone: 'Europe/London',
      isDemo: false,
    });

    const availability = await ctx.app.inject({
      method: 'GET',
      url: '/api/availability',
      headers: { cookie },
    });
    expect(availability.json().rules).toHaveLength(5);
    const types = await ctx.app.inject({
      method: 'GET',
      url: '/api/meeting-types',
      headers: { cookie },
    });
    expect(types.json().meetingTypes[0]).toMatchObject({ slug: '30min', durationMinutes: 30 });
  });

  it('reports duplicate email/username per field', async () => {
    await signup(ctx.app);
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        name: 'X',
        email: 'ADA@example.com',
        username: 'ada',
        password: 'longenough',
        timezone: 'UTC',
      },
    });
    expect(response.statusCode).toBe(409);
    expect(Object.keys(response.json().error.fields).sort()).toEqual(['email', 'username']);
  });

  it('logs in, rejects bad passwords and logs out', async () => {
    await signup(ctx.app);
    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ada@example.com', password: 'wrong password' },
    });
    expect(bad.statusCode).toBe(401);

    const good = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'Ada@Example.com', password: 'correct horse battery' },
    });
    expect(good.statusCode).toBe(200);
    const cookie = sessionCookie(good);

    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
      payload: {},
    });
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('protects host routes', async () => {
    for (const url of [
      '/api/availability',
      '/api/meeting-types',
      '/api/bookings',
      '/api/integrations',
      '/api/emails',
    ]) {
      expect((await ctx.app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
    }
  });

  it('blocks cross-origin writes', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'ada@example.com', password: 'x' },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('availability and meeting types', () => {
  it('rejects overlapping availability windows', async () => {
    const { cookie } = await signup(ctx.app);
    const response = await ctx.app.inject({
      method: 'PUT',
      url: '/api/availability',
      headers: { cookie },
      payload: {
        timezone: 'UTC',
        rules: [
          { weekday: 1, startMinute: 540, endMinute: 720 },
          { weekday: 1, startMinute: 700, endMinute: 900 },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields.rules[0]).toContain('overlap');
  });

  it('enforces unique slugs and keeps types with bookings', async () => {
    const { cookie, meetingType } = await setupHost(ctx.app);
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/meeting-types',
      headers: { cookie },
    });
    const starter = (list.json().meetingTypes as { id: string; slug: string }[]).find(
      (t) => t.slug === '30min',
    )!;
    const duplicate = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/meeting-types/${starter.id}`,
      headers: { cookie },
      payload: { slug: 'consult' },
    });
    expect(duplicate.statusCode).toBe(409);

    await ctx.app.inject({
      method: 'POST',
      url: bookUrl(),
      payload: bookingPayload('2026-10-12T10:00:00.000Z'),
    });
    const remove = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/meeting-types/${meetingType.id}`,
      headers: { cookie },
    });
    expect(remove.statusCode).toBe(409);
    expect(remove.json().error.code).toBe('HAS_BOOKINGS');
  });
});

describe('calendar integration (mock provider)', () => {
  async function connect(cookie: string) {
    const start = await ctx.app.inject({
      method: 'GET',
      url: '/api/integrations/google/connect',
      headers: { cookie },
    });
    expect(start.statusCode).toBe(302);
    const state = start.cookies.find((c) => c.name === 'mq_oauth_state')!.value;
    const location = new URL(start.headers.location as string);
    expect(location.searchParams.get('state')).toBe(state);
    return { state, location };
  }

  it('connects through the OAuth callback and syncs bookings to the calendar', async () => {
    const { cookie } = await setupHost(ctx.app);
    const { state, location } = await connect(cookie);
    const callback = await ctx.app.inject({
      method: 'GET',
      url: `${location.pathname}${location.search}`,
      headers: { cookie: `${cookie}; mq_oauth_state=${state}` },
    });
    expect(callback.headers.location).toBe(
      'http://localhost:3000/dashboard/integrations?calendar=connected',
    );

    const integrations = await ctx.app.inject({
      method: 'GET',
      url: '/api/integrations',
      headers: { cookie },
    });
    expect(integrations.json().calendar).toMatchObject({
      mode: 'mock',
      connected: true,
      provider: 'mock',
    });

    // Tokens are encrypted at rest.
    const stored = await ctx.db.calendarConnection.findFirstOrThrow();
    expect(stored.accessTokenEnc).toMatch(/^v1\./);
    expect(stored.accessTokenEnc).not.toContain('mock-access');

    const booked = await ctx.app.inject({
      method: 'POST',
      url: bookUrl(),
      payload: bookingPayload('2026-10-12T10:00:00.000Z'),
    });
    expect(booked.json().calendar).toEqual({ provider: 'mock', inviteSent: false });
    const [event] = [...ctx.calendar.events.values()];
    expect(event).toMatchObject({
      summary: 'Consultation with Grace Invitee',
      attendee: { email: 'grace@example.com' },
    });

    await ctx.app.inject({
      method: 'POST',
      url: `/api/manage/${booked.json().manageToken}/cancel`,
      payload: {},
    });
    expect(event!.deleted).toBe(true);

    await ctx.app.inject({
      method: 'DELETE',
      url: '/api/integrations/calendar',
      headers: { cookie },
    });
    expect(await ctx.db.calendarConnection.count()).toBe(0);
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const { cookie } = await setupHost(ctx.app);
    const { location } = await connect(cookie);
    const callback = await ctx.app.inject({
      method: 'GET',
      url: `${location.pathname}${location.search}`,
      headers: { cookie: `${cookie}; mq_oauth_state=forged` },
    });
    expect(callback.headers.location).toContain('calendar=state-mismatch');
    expect(await ctx.db.calendarConnection.count()).toBe(0);
  });
});

describe('demo account', () => {
  it('signs in to a seeded demo host with upcoming bookings', async () => {
    const response = await ctx.app.inject({ method: 'POST', url: '/api/auth/demo', payload: {} });
    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({ username: 'demo', isDemo: true });
    const cookie = sessionCookie(response);

    const list = await ctx.app.inject({ method: 'GET', url: '/api/bookings', headers: { cookie } });
    expect(list.json().counts.upcoming).toBeGreaterThanOrEqual(4);
    expect(list.json().counts.past).toBeGreaterThanOrEqual(1);

    const profile = await ctx.app.inject({ method: 'GET', url: '/api/public/users/demo' });
    expect(profile.json().meetingTypes.map((t: { slug: string }) => t.slug)).toEqual([
      'intro-call',
      'consultation',
      'deep-dive',
    ]);
  });

  it('heals visitor changes on the next demo login and can be fully reset', async () => {
    const first = sessionCookie(
      await ctx.app.inject({ method: 'POST', url: '/api/auth/demo', payload: {} }),
    );
    const types = (
      await ctx.app.inject({ method: 'GET', url: '/api/meeting-types', headers: { cookie: first } })
    ).json().meetingTypes as { id: string }[];
    for (const t of types) {
      await ctx.app.inject({
        method: 'PATCH',
        url: `/api/meeting-types/${t.id}`,
        headers: { cookie: first },
        payload: { isActive: false },
      });
    }
    await ctx.app.inject({ method: 'POST', url: '/api/auth/demo', payload: {} });
    const profile = await ctx.app.inject({ method: 'GET', url: '/api/public/users/demo' });
    expect(profile.json().meetingTypes).toHaveLength(3);

    const reset = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/demo/reset',
      headers: { cookie: first },
      payload: {},
    });
    expect(reset.statusCode).toBe(200);
  });

  it('masks visitors’ real email addresses on the shared demo dashboard', async () => {
    const cookie = sessionCookie(
      await ctx.app.inject({ method: 'POST', url: '/api/auth/demo', payload: {} }),
    );
    const slots = await ctx.app.inject({
      method: 'GET',
      url: '/api/public/users/demo/meeting-types/consultation/slots?start=2026-10-12&end=2026-10-16&timezone=UTC',
    });
    const start = (slots.json().days as { slots: string[] }[])[0]!.slots[0]!;
    const booked = await ctx.app.inject({
      method: 'POST',
      url: '/api/public/users/demo/meeting-types/consultation/bookings',
      payload: { start, name: 'Visitor', email: 'visitor.real@gmail.com', timezone: 'UTC' },
    });
    expect(booked.statusCode).toBe(201);

    const list = await ctx.app.inject({ method: 'GET', url: '/api/bookings', headers: { cookie } });
    const emails = (list.json().bookings as { inviteeEmail: string }[]).map((b) => b.inviteeEmail);
    expect(emails).toContain('vi***@gmail.com');
    expect(emails).not.toContain('visitor.real@gmail.com');
    expect(emails).toContain('jordan.lee@example.com');

    const log = await ctx.app.inject({ method: 'GET', url: '/api/emails', headers: { cookie } });
    expect(log.body).not.toContain('visitor.real@gmail.com');
  });

  it('cannot be used with a password, and never connects a real Google account', async () => {
    await ctx.app.inject({ method: 'POST', url: '/api/auth/demo', payload: {} });
    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'demo@example.com', password: 'anything' },
    });
    expect(login.statusCode).toBe(401);

    const fakeGoogle = new MockCalendarProvider('https://accounts.google.com/');
    const withGoogle = await createTestApp({
      google: Object.assign(fakeGoogle, { name: 'google' as const }),
    });
    try {
      const demoCookie = sessionCookie(
        await withGoogle.app.inject({ method: 'POST', url: '/api/auth/demo', payload: {} }),
      );
      const connect = await withGoogle.app.inject({
        method: 'GET',
        url: '/api/integrations/google/connect',
        headers: { cookie: demoCookie },
      });
      expect(connect.headers.location).toMatch(
        /^http:\/\/localhost:3000\/api\/integrations\/google\/callback/,
      );
      const integrations = await withGoogle.app.inject({
        method: 'GET',
        url: '/api/integrations',
        headers: { cookie: demoCookie },
      });
      expect(integrations.json().calendar.restriction).toContain('demo');

      const { cookie: realCookie } = await signup(withGoogle.app, {
        username: 'real',
        email: 'real@example.com',
      });
      const realConnect = await withGoogle.app.inject({
        method: 'GET',
        url: '/api/integrations/google/connect',
        headers: { cookie: realCookie },
      });
      expect(realConnect.headers.location).toMatch(/^https:\/\/accounts\.google\.com\//);
    } finally {
      await withGoogle.close();
    }
  });
});
