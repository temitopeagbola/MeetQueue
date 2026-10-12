import { DateTime } from 'luxon';
import { computeBookingTimes, generateSlots, type WeeklyRule } from '@meetqueue/core';
import type { Db } from '../db';
import type { MeetingType, User } from '../generated/prisma/client';
import { createCipher, hashPassword, randomToken, sha256 } from '../lib/crypto';
import { AppError, isExclusionViolation } from '../lib/errors';

export const DEMO_USERNAME = 'demo';
export const DEMO_EMAIL = 'demo@example.com';
const DEMO_TIMEZONE = 'Europe/London';

/** Mon–Fri 09:00–12:30 and 13:30–17:30 (lunch break shows split windows). */
export const DEMO_RULES: WeeklyRule[] = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startMinute: 9 * 60, endMinute: 12 * 60 + 30 },
  { weekday, startMinute: 13 * 60 + 30, endMinute: 17 * 60 + 30 },
]);

export const DEMO_MEETING_TYPES = [
  {
    slug: 'intro-call',
    title: 'Intro call',
    description: 'A quick 15-minute hello to see if we are a good fit.',
    location: 'Google Meet (link in the invite)',
    durationMinutes: 15,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 5,
    slotIntervalMinutes: 15,
    minNoticeMinutes: 60,
    maxDaysAhead: 30,
    color: '#0ea5e9',
  },
  {
    slug: 'consultation',
    title: 'Project consultation',
    description: 'Walk through your project, goals and timeline. Bring any docs you have.',
    location: 'Zoom',
    durationMinutes: 30,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    slotIntervalMinutes: 30,
    minNoticeMinutes: 120,
    maxDaysAhead: 45,
    color: '#4f46e5',
  },
  {
    slug: 'deep-dive',
    title: 'Technical deep dive',
    description: 'An hour-long working session on architecture or code review.',
    location: 'Zoom',
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    slotIntervalMinutes: 30,
    minNoticeMinutes: 24 * 60,
    maxDaysAhead: 60,
    color: '#10b981',
  },
] as const;

const INVITEES = [
  {
    name: 'Jordan Lee',
    email: 'jordan.lee@example.com',
    timezone: 'America/New_York',
    notes: 'Keen to talk about a booking flow for our clinic.',
  },
  { name: 'Priya Shah', email: 'priya.shah@example.com', timezone: 'Asia/Kolkata', notes: null },
  {
    name: 'Marcus Chen',
    email: 'marcus.chen@example.com',
    timezone: 'America/Los_Angeles',
    notes: 'Want a second opinion on our Postgres schema.',
  },
  {
    name: 'Elena García',
    email: 'elena.garcia@example.com',
    timezone: 'Europe/Madrid',
    notes: null,
  },
  {
    name: 'Tomi Okafor',
    email: 'tomi.okafor@example.com',
    timezone: 'Africa/Lagos',
    notes: 'Intro from the meetup last week.',
  },
  {
    name: 'Hannah Becker',
    email: 'hannah.becker@example.com',
    timezone: 'Europe/Berlin',
    notes: null,
  },
];

const MIN_UPCOMING = 4;

const demoUnavailable = () =>
  new AppError(503, 'DEMO_UNAVAILABLE', 'The demo account is unavailable on this server.');

async function createSeedBooking(
  db: Db,
  host: User,
  meetingType: MeetingType,
  start: Date,
  invitee: (typeof INVITEES)[number],
  extra: { status?: 'CANCELLED'; cancelReason?: string } = {},
) {
  try {
    await db.booking.create({
      data: {
        hostId: host.id,
        meetingTypeId: meetingType.id,
        inviteeName: invitee.name,
        inviteeEmail: invitee.email,
        inviteeTimezone: invitee.timezone,
        notes: invitee.notes,
        ...computeBookingTimes(start, meetingType),
        manageTokenHash: sha256(randomToken()),
        calendarProvider: extra.status === 'CANCELLED' ? null : 'mock',
        calendarEventId: extra.status === 'CANCELLED' ? null : `mock_evt_seed${randomToken(4)}`,
        ...(extra.status === 'CANCELLED'
          ? {
              status: 'CANCELLED' as const,
              cancelledAt: new Date(),
              cancelledBy: 'INVITEE' as const,
              cancelReason: extra.cancelReason ?? null,
            }
          : {}),
      },
    });
    return true;
  } catch (error) {
    if (isExclusionViolation(error)) return false; // overlapping sample: skip it
    throw error;
  }
}

/**
 * Creates (or repairs) the shared demo host. Every demo login calls this, so the public page
 * always has meeting types and the dashboard always has upcoming bookings. `reset` wipes
 * visitor changes first (used by the seed script and the "Reset demo data" button).
 */
export async function ensureDemoAccount(
  db: Db,
  options: { encryptionKey: string; now?: Date; reset?: boolean },
): Promise<User> {
  const now = options.now ?? new Date();
  let host = await db.user.findUnique({ where: { username: DEMO_USERNAME } });
  // Never adopt a regular account as the demo host, even if it somehow holds the name/email.
  if (host && !host.isDemo) throw demoUnavailable();
  if (!host) {
    if (await db.user.findUnique({ where: { email: DEMO_EMAIL } })) throw demoUnavailable();
    host = await db.user.create({
      data: {
        username: DEMO_USERNAME,
        email: DEMO_EMAIL,
        name: 'Sam Rivera',
        timezone: DEMO_TIMEZONE,
        isDemo: true,
        // Unguessable: the demo account is only reachable through "Try the demo".
        passwordHash: await hashPassword(randomToken()),
      },
    });
  }

  const isFresh = options.reset || !(await db.meetingType.count({ where: { userId: host.id } }));
  if (options.reset) {
    await db.$transaction([
      db.emailLog.deleteMany({ where: { userId: host.id } }),
      db.booking.deleteMany({ where: { hostId: host.id } }),
      db.meetingType.deleteMany({ where: { userId: host.id } }),
      db.availabilityRule.deleteMany({ where: { userId: host.id } }),
      db.user.update({
        where: { id: host.id },
        data: { timezone: DEMO_TIMEZONE, name: 'Sam Rivera' },
      }),
    ]);
    host = { ...host, timezone: DEMO_TIMEZONE, name: 'Sam Rivera' };
  }

  if (!(await db.availabilityRule.count({ where: { userId: host.id } }))) {
    await db.availabilityRule.createMany({
      data: DEMO_RULES.map((rule) => ({ ...rule, userId: host!.id })),
    });
  }

  // Sample meeting types always exist and accept bookings.
  const meetingTypes: MeetingType[] = [];
  for (const sample of DEMO_MEETING_TYPES) {
    meetingTypes.push(
      await db.meetingType.upsert({
        where: { userId_slug: { userId: host.id, slug: sample.slug } },
        create: { ...sample, userId: host.id },
        update: { isActive: true },
      }),
    );
  }

  // The demo host's calendar is always the mock provider.
  const cipher = createCipher(options.encryptionKey);
  await db.calendarConnection.upsert({
    where: { userId: host.id },
    create: {
      userId: host.id,
      provider: 'mock',
      accountEmail: 'mock-calendar@meetqueue.local',
      accessTokenEnc: cipher.encrypt('mock-access-token'),
    },
    update: {},
  });

  // Top up upcoming bookings using real availability so they never violate the rules.
  const upcoming = await db.booking.count({
    where: { hostId: host.id, status: 'CONFIRMED', startsAt: { gt: now } },
  });
  if (upcoming < MIN_UPCOMING) {
    const busy = (
      await db.booking.findMany({
        where: { hostId: host.id, status: 'CONFIRMED', blockedEnd: { gt: now } },
        select: { blockedStart: true, blockedEnd: true },
      })
    ).map((b) => ({ start: b.blockedStart, end: b.blockedEnd }));
    const rules = await db.availabilityRule.findMany({ where: { userId: host.id } });
    let created = 0;
    for (let i = 0; created < MIN_UPCOMING - upcoming && i < 12; i++) {
      const meetingType = meetingTypes[i % meetingTypes.length]!;
      const slots = generateSlots({
        ...meetingType,
        hostTimezone: host.timezone,
        rules,
        busy,
        now,
        rangeStart: new Date(now.getTime() + (1 + i) * 86_400_000),
        rangeEnd: new Date(now.getTime() + (3 + i) * 86_400_000),
      });
      // Pick a mid-morning/afternoon slot rather than always the first one.
      const start = slots[Math.min(slots.length - 1, 2 + ((i * 5) % 7))];
      if (!start) continue;
      const invitee = INVITEES[(upcoming + created) % INVITEES.length]!;
      if (await createSeedBooking(db, host, meetingType, start, invitee)) {
        const times = computeBookingTimes(start, meetingType);
        busy.push({ start: times.blockedStart, end: times.blockedEnd });
        created++;
      }
    }
  }

  // History so the Past / Cancelled tabs aren't empty on a fresh account.
  if (isFresh) {
    const local = DateTime.fromJSDate(now, { zone: host.timezone }).startOf('day');
    const pastDays = [3, 6, 9].map((d) => local.minus({ days: d }));
    for (const [index, day] of pastDays.entries()) {
      const weekday = day.weekday > 5 ? day.minus({ days: day.weekday - 5 }) : day;
      const start = weekday.set({ hour: 10 + index * 2 }).toJSDate();
      await createSeedBooking(
        db,
        host,
        meetingTypes[index % meetingTypes.length]!,
        start,
        INVITEES[(index + 3) % INVITEES.length]!,
      );
    }
    const cancelledStart = local.plus({ days: 2 }).set({ hour: 8 }).toJSDate();
    await createSeedBooking(db, host, meetingTypes[1]!, cancelledStart, INVITEES[5]!, {
      status: 'CANCELLED',
      cancelReason: 'Something came up — will rebook next week.',
    });
  }

  return host;
}
