import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { computeBookingTimes } from '@meetqueue/core';
import { isExclusionViolation } from '../../src/lib/errors';
import type { EmailProvider } from '../../src/providers/email/types';
import {
  bookUrl,
  bookingPayload,
  createTestApp,
  resetDatabase,
  setupHost,
  slotsUrl,
  type TestContext,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.settle();
  await ctx.close();
});
beforeEach(async () => {
  await ctx.settle();
  await resetDatabase(ctx.db);
  ctx.email.sent.length = 0;
  ctx.calendar.events.clear();
});

const MONDAY_10 = '2026-10-12T10:00:00.000Z';

async function slotTimes(url = slotsUrl()) {
  const response = await ctx.app.inject({ method: 'GET', url });
  expect(response.statusCode).toBe(200);
  return (response.json().days as { slots: string[] }[]).flatMap((d) => d.slots);
}

describe('public booking flow', () => {
  it('lists slots, books one, and removes it (plus buffers) from availability', async () => {
    await setupHost(ctx.app);
    const before = await slotTimes();
    // 09:00 … 16:30 every 30 minutes.
    expect(before).toHaveLength(16);
    expect(before).toContain(MONDAY_10);

    const response = await ctx.app.inject({
      method: 'POST',
      url: bookUrl(),
      payload: bookingPayload(MONDAY_10),
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.manageToken).toMatch(/^[\w-]{40,}$/);
    expect(body.booking).toMatchObject({
      status: 'CONFIRMED',
      startsAt: MONDAY_10,
      endsAt: '2026-10-12T10:30:00.000Z',
      inviteeTimezone: 'America/New_York',
      host: { username: 'ada' },
    });
    // No calendar connected → no event, ICS fallback.
    expect(body.calendar).toEqual({ provider: 'none', inviteSent: false });

    const after = await slotTimes();
    // 10:00 is taken; 09:30 and 10:30 are blocked by the 10-minute buffers on both sides.
    expect(after).not.toContain(MONDAY_10);
    expect(after).not.toContain('2026-10-12T09:30:00.000Z');
    expect(after).not.toContain('2026-10-12T10:30:00.000Z');
    expect(after).toContain('2026-10-12T09:00:00.000Z');
    expect(after).toContain('2026-10-12T11:00:00.000Z');
  });

  it('groups slots by the invitee’s timezone', async () => {
    await setupHost(ctx.app);
    const response = await ctx.app.inject({
      method: 'GET',
      url: slotsUrl('ada', 'consult', '2026-10-12', '2026-10-13', 'Asia/Tokyo'),
    });
    const days = response.json().days as { date: string; slots: string[] }[];
    // Monday 09:00–17:00 UTC is 18:00 Mon – 02:00 Tue in Tokyo.
    expect(days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13']);
    expect(days[0]!.slots[0]).toBe('2026-10-12T09:00:00.000Z');
  });

  it('sends a confirmation with an ICS attachment and redacts the manage token in the log', async () => {
    await setupHost(ctx.app);
    const response = await ctx.app.inject({
      method: 'POST',
      url: bookUrl(),
      payload: bookingPayload(MONDAY_10),
    });
    const { manageToken } = response.json();

    await ctx.settle();
    const invitee = ctx.email.sent.find((m) => m.to === 'grace@example.com')!;
    expect(invitee.subject).toBe('Confirmed: Consultation with Ada Host');
    expect(invitee.text).toContain(`/manage/${manageToken}`);
    expect(invitee.ics?.method).toBe('REQUEST');
    expect(invitee.ics?.content).toContain('DTSTART:20261012T100000Z');
    expect(ctx.email.sent.some((m) => m.to === 'ada@example.com')).toBe(true);

    const logs = await ctx.db.emailLog.findMany();
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(log.bodyText).not.toContain(manageToken);
      expect(log.status).toBe('LOGGED');
    }
  });

  it('rejects starts that are not offered slots', async () => {
    await setupHost(ctx.app);
    const cases = [
      '2026-10-12T10:10:00.000Z', // off the 30-minute grid
      '2026-10-11T10:00:00.000Z', // Sunday, no availability
      '2026-10-12T17:00:00.000Z', // after hours
      '2026-12-14T10:00:00.000Z', // beyond the 30-day horizon
    ];
    for (const start of cases) {
      const response = await ctx.app.inject({
        method: 'POST',
        url: bookUrl(),
        payload: bookingPayload(start),
      });
      expect(response.statusCode, start).toBe(409);
      expect(response.json().error.code).toBe('SLOT_UNAVAILABLE');
    }
  });

  it('validates input at the boundary', async () => {
    await setupHost(ctx.app);
    const response = await ctx.app.inject({
      method: 'POST',
      url: bookUrl(),
      payload: bookingPayload('tomorrow', { email: 'not-an-email', timezone: 'Mars/Base' }),
    });
    expect(response.statusCode).toBe(400);
    expect(Object.keys(response.json().error.fields).sort()).toEqual([
      'email',
      'start',
      'timezone',
    ]);
  });

  it('returns 404 for unknown or inactive booking pages', async () => {
    const { cookie, meetingType } = await setupHost(ctx.app);
    expect((await ctx.app.inject({ method: 'GET', url: slotsUrl('nobody') })).statusCode).toBe(404);
    await ctx.app.inject({
      method: 'PATCH',
      url: `/api/meeting-types/${meetingType.id}`,
      headers: { cookie },
      payload: { isActive: false },
    });
    expect((await ctx.app.inject({ method: 'GET', url: slotsUrl() })).statusCode).toBe(404);
  });
});

describe('notifications', () => {
  it('confirms the booking without waiting for a slow mail relay', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slowEmail: EmailProvider = {
      name: 'smtp',
      send: async () => {
        await gate;
        return 'SENT';
      },
    };
    const slow = await createTestApp({ emailProvider: slowEmail });
    try {
      await setupHost(slow.app);
      const response = await slow.app.inject({
        method: 'POST',
        url: bookUrl(),
        payload: bookingPayload(MONDAY_10),
      });
      expect(response.statusCode).toBe(201);
      expect(await slow.db.emailLog.count()).toBe(0); // still "sending"

      release();
      await slow.settle();
      const logs = await slow.db.emailLog.findMany();
      expect(logs.map((l) => l.status)).toEqual(['SENT', 'SENT']);
    } finally {
      release();
      await slow.close();
    }
  });
});

describe('double-booking protection', () => {
  it('refuses a second booking for the same slot', async () => {
    await setupHost(ctx.app);
    const first = await ctx.app.inject({
      method: 'POST',
      url: bookUrl(),
      payload: bookingPayload(MONDAY_10),
    });
    const second = await ctx.app.inject({
      method: 'POST',
      url: bookUrl(),
      payload: bookingPayload(MONDAY_10, { email: 'other@example.com' }),
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
  });

  it('lets exactly one of many concurrent requests win (exclusion constraint)', async () => {
    await setupHost(ctx.app);
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        ctx.app.inject({
          method: 'POST',
          url: bookUrl(),
          payload: bookingPayload(MONDAY_10, { email: `racer${i}@example.com` }),
        }),
      ),
    );
    const statuses = attempts.map((r) => r.statusCode).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(await ctx.db.booking.count({ where: { status: 'CONFIRMED' } })).toBe(1);
  });

  it('is enforced by Postgres itself, including buffers, for any writer', async () => {
    const { user, meetingType } = await setupHost(ctx.app);
    const insert = (start: string, status: 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED') =>
      ctx.db.booking.create({
        data: {
          hostId: user.id,
          meetingTypeId: meetingType.id,
          inviteeName: 'Direct',
          inviteeEmail: 'direct@example.com',
          inviteeTimezone: 'UTC',
          status,
          manageTokenHash: `hash-${start}-${status}-${Math.random()}`,
          ...computeBookingTimes(new Date(start), {
            durationMinutes: 30,
            bufferBeforeMinutes: 10,
            bufferAfterMinutes: 10,
          }),
        },
      });

    await insert('2026-10-12T10:00:00Z');
    // 10:35 starts inside the first booking's after-buffer (blocked until 10:40).
    const overlapping = await insert('2026-10-12T10:35:00Z').catch((e: unknown) => e);
    expect(isExclusionViolation(overlapping)).toBe(true);
    // Cancelled rows never block, and back-to-back blocked ranges ('[)') are fine.
    await expect(insert('2026-10-12T10:05:00Z', 'CANCELLED')).resolves.toBeDefined();
    await expect(insert('2026-10-12T10:50:00Z')).resolves.toBeDefined();
  });

  it('keeps different hosts independent', async () => {
    await setupHost(ctx.app, 'ada');
    await setupHost(ctx.app, 'bob');
    const a = await ctx.app.inject({
      method: 'POST',
      url: bookUrl('ada'),
      payload: bookingPayload(MONDAY_10),
    });
    const b = await ctx.app.inject({
      method: 'POST',
      url: bookUrl('bob'),
      payload: bookingPayload(MONDAY_10),
    });
    expect([a.statusCode, b.statusCode]).toEqual([201, 201]);
  });

  it('treats external calendar busy time as unavailable', async () => {
    const { cookie } = await setupHost(ctx.app);
    // Connect the (mock) calendar, then mark 13:00–14:00 busy in it.
    const connect = await ctx.app.inject({
      method: 'GET',
      url: '/api/integrations/google/connect',
      headers: { cookie },
    });
    const callback = new URL(connect.headers.location as string);
    const state = connect.cookies.find((c) => c.name === 'mq_oauth_state')!.value;
    await ctx.app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: `${cookie}; mq_oauth_state=${state}` },
    });
    ctx.calendar.busyBlocks = [
      { start: new Date('2026-10-12T13:00:00Z'), end: new Date('2026-10-12T14:00:00Z') },
    ];
    const times = await slotTimes();
    expect(times).not.toContain('2026-10-12T13:00:00.000Z');
    expect(times).not.toContain('2026-10-12T12:30:00.000Z'); // after-buffer would overlap
    expect(times).toContain('2026-10-12T12:00:00.000Z');
    ctx.calendar.busyBlocks = [];
  });
});

describe('manage links: reschedule, cancel, ICS', () => {
  async function book(start = MONDAY_10) {
    const response = await ctx.app.inject({
      method: 'POST',
      url: bookUrl(),
      payload: bookingPayload(start),
    });
    expect(response.statusCode).toBe(201);
    return response.json().manageToken as string;
  }

  it('shows the booking for a valid token and 404s otherwise', async () => {
    await setupHost(ctx.app);
    const token = await book();
    const ok = await ctx.app.inject({ method: 'GET', url: `/api/manage/${token}` });
    expect(ok.json().booking).toMatchObject({
      status: 'CONFIRMED',
      isPast: false,
      meetingType: { slug: 'consult' },
    });
    const bad = await ctx.app.inject({ method: 'GET', url: `/api/manage/${'x'.repeat(43)}` });
    expect(bad.statusCode).toBe(404);
  });

  it('reschedules to a free slot, frees the old one and bumps the ICS sequence', async () => {
    await setupHost(ctx.app);
    const token = await book();
    // Its own current slot doesn't block nearby options when rescheduling.
    const options = await ctx.app.inject({
      method: 'GET',
      url: `/api/manage/${token}/slots?start=2026-10-12&end=2026-10-12&timezone=UTC`,
    });
    expect(options.json().days[0].slots as string[]).toContain('2026-10-12T10:30:00.000Z');

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/manage/${token}/reschedule`,
      payload: { start: '2026-10-12T10:30:00.000Z' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().booking).toMatchObject({
      startsAt: '2026-10-12T10:30:00.000Z',
      rescheduleCount: 1,
    });

    const row = await ctx.db.booking.findFirstOrThrow();
    expect(row.icsSequence).toBe(1);
    await ctx.settle();
    const email = ctx.email.sent.find((m) => m.subject.startsWith('Rescheduled'))!;
    expect(email.ics?.content).toContain('SEQUENCE:1');
    expect(email.text).toContain('Was: Monday 12 October 2026, 06:00');
  });

  it('refuses to reschedule into someone else’s slot', async () => {
    await setupHost(ctx.app);
    const token = await book(MONDAY_10);
    await book('2026-10-12T14:00:00.000Z');
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/manage/${token}/reschedule`,
      payload: { start: '2026-10-12T14:00:00.000Z' },
    });
    expect(response.statusCode).toBe(409);
  });

  it('cancels, frees the slot, sends METHOD:CANCEL and blocks further changes', async () => {
    await setupHost(ctx.app);
    const token = await book();
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/api/manage/${token}/cancel`,
      payload: { reason: 'Conflict came up' },
    });
    expect(response.json().booking).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Conflict came up',
    });
    expect(await slotTimes()).toContain(MONDAY_10);

    await ctx.settle();
    const cancelEmail = ctx.email.sent.find(
      (m) => m.subject.startsWith('Cancelled') && m.to === 'grace@example.com',
    )!;
    expect(cancelEmail.ics?.method).toBe('CANCEL');

    const again = await ctx.app.inject({
      method: 'POST',
      url: `/api/manage/${token}/cancel`,
      payload: {},
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('BOOKING_CANCELLED');

    const ics = await ctx.app.inject({ method: 'GET', url: `/api/manage/${token}/ics` });
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.body).toContain('METHOD:CANCEL');
  });

  it('serves an "add to calendar" ICS download', async () => {
    await setupHost(ctx.app);
    const token = await book();
    const ics = await ctx.app.inject({ method: 'GET', url: `/api/manage/${token}/ics` });
    expect(ics.statusCode).toBe(200);
    expect(ics.headers['content-disposition']).toContain('attachment');
    expect(ics.body).toContain('METHOD:PUBLISH');
    expect(ics.body).toContain('SUMMARY:Consultation: Grace Invitee & Ada Host');
  });

  it('does not allow changes once the meeting has started', async () => {
    await setupHost(ctx.app);
    const token = await book();
    ctx.clock.now = new Date('2026-10-12T10:05:00Z');
    try {
      const response = await ctx.app.inject({
        method: 'POST',
        url: `/api/manage/${token}/cancel`,
        payload: {},
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('BOOKING_IN_PAST');
    } finally {
      ctx.clock.now = new Date('2026-10-11T12:00:00Z');
    }
  });
});

describe('host dashboard bookings', () => {
  it('lists upcoming bookings with counts and lets the host cancel', async () => {
    const { cookie } = await setupHost(ctx.app);
    await ctx.app.inject({ method: 'POST', url: bookUrl(), payload: bookingPayload(MONDAY_10) });
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/bookings?scope=upcoming',
      headers: { cookie },
    });
    const { bookings, counts } = list.json();
    expect(counts).toEqual({ upcoming: 1, past: 0, cancelled: 0 });
    expect(bookings[0]).toMatchObject({ inviteeEmail: 'grace@example.com', calendar: 'none' });

    const cancel = await ctx.app.inject({
      method: 'POST',
      url: `/api/bookings/${bookings[0].id}/cancel`,
      headers: { cookie },
      payload: { reason: 'Out sick' },
    });
    expect(cancel.json().booking).toMatchObject({ status: 'CANCELLED', cancelledBy: 'HOST' });
  });

  it('never exposes or cancels another host’s booking', async () => {
    await setupHost(ctx.app, 'ada');
    const bob = await setupHost(ctx.app, 'bob');
    await ctx.app.inject({
      method: 'POST',
      url: bookUrl('ada'),
      payload: bookingPayload(MONDAY_10),
    });
    const adaBooking = await ctx.db.booking.findFirstOrThrow();
    const list = await ctx.app.inject({
      method: 'GET',
      url: '/api/bookings',
      headers: { cookie: bob.cookie },
    });
    expect(list.json().bookings).toHaveLength(0);
    const cancel = await ctx.app.inject({
      method: 'POST',
      url: `/api/bookings/${adaBooking.id}/cancel`,
      headers: { cookie: bob.cookie },
      payload: {},
    });
    expect(cancel.statusCode).toBe(404);
  });
});
