import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app';
import { createDb, type Db } from '../../src/db';
import { loadConfig, loadDotenvFiles } from '../../src/env';
import { MockCalendarProvider } from '../../src/providers/calendar/mock';
import type { CalendarProvider } from '../../src/providers/calendar/types';
import { ConsoleEmailProvider } from '../../src/providers/email/console';
import type { EmailProvider } from '../../src/providers/email/types';

loadDotenvFiles();

/** Defaults to the docker-compose Postgres (`docker compose up -d db`). */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://meetqueue:meetqueue@localhost:5432/meetqueue_test';

/** Sunday 11 Oct 2026, 12:00 UTC. Every test runs against this fixed clock. */
export const NOW = new Date('2026-10-11T12:00:00Z');

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  calendar: MockCalendarProvider;
  email: ConsoleEmailProvider;
  clock: { now: Date };
  /** Waits for background notification emails to finish. */
  settle(): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(
  options: {
    google?: CalendarProvider;
    env?: Record<string, string>;
    emailProvider?: EmailProvider;
  } = {},
): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    WEB_ORIGIN: 'http://localhost:3000',
    RATE_LIMIT_ENABLED: 'false',
    LOG_LEVEL: 'silent',
    TOKEN_ENCRYPTION_KEY: 'test-encryption-key-123456',
    ...options.env,
  });
  const db = createDb(TEST_DATABASE_URL);
  const calendar = new MockCalendarProvider(
    'http://localhost:3000/api/integrations/google/callback',
  );
  const email = new ConsoleEmailProvider();
  const clock = { now: NOW };
  const app = await buildApp({
    config,
    db,
    calendarProviders: { mock: calendar, ...(options.google ? { google: options.google } : {}) },
    emailProvider: options.emailProvider ?? email,
    now: () => clock.now,
    logger: false,
  });
  await app.ready();
  return {
    app,
    db,
    calendar,
    email,
    clock,
    settle: () => app.deps.bookings.drain(),
    async close() {
      await app.close();
      await db.$disconnect();
    },
  };
}

export async function resetDatabase(db: Db) {
  await db.$executeRawUnsafe(
    'TRUNCATE email_logs, bookings, calendar_connections, meeting_types, availability_rules, sessions, users CASCADE',
  );
}

export function sessionCookie(response: LightMyRequestResponse): string {
  const cookie = response.cookies.find((c) => c.name === 'mq_session');
  if (!cookie) throw new Error(`No session cookie (status ${response.statusCode})`);
  return `mq_session=${cookie.value}`;
}

export async function signup(
  app: FastifyInstance,
  overrides: Partial<{ email: string; username: string; timezone: string; name: string }> = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: {
      name: 'Ada Host',
      email: 'ada@example.com',
      username: 'ada',
      password: 'correct horse battery',
      timezone: 'Europe/London',
      ...overrides,
    },
  });
  if (response.statusCode !== 201) throw new Error(`signup failed: ${response.body}`);
  return {
    cookie: sessionCookie(response),
    user: response.json().user as { id: string; username: string },
  };
}

/** A predictable host: UTC, Mon–Fri 09:00–17:00, one 30-minute type with 10/10 buffers. */
export async function setupHost(app: FastifyInstance, username = 'ada') {
  const { cookie, user } = await signup(app, { username, email: `${username}@example.com` });
  await app.inject({
    method: 'PUT',
    url: '/api/availability',
    headers: { cookie },
    payload: {
      timezone: 'UTC',
      rules: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1020 })),
    },
  });
  const created = await app.inject({
    method: 'POST',
    url: '/api/meeting-types',
    headers: { cookie },
    payload: {
      title: 'Consultation',
      slug: 'consult',
      durationMinutes: 30,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
      slotIntervalMinutes: 30,
      minNoticeMinutes: 60,
      maxDaysAhead: 30,
    },
  });
  if (created.statusCode !== 201) throw new Error(`meeting type failed: ${created.body}`);
  return { cookie, user, meetingType: created.json().meetingType as { id: string; slug: string } };
}

export function bookingPayload(start: string, overrides: Record<string, unknown> = {}) {
  return {
    start,
    name: 'Grace Invitee',
    email: 'grace@example.com',
    timezone: 'America/New_York',
    notes: 'Looking forward to it',
    ...overrides,
  };
}

export const bookUrl = (username = 'ada', slug = 'consult') =>
  `/api/public/users/${username}/meeting-types/${slug}/bookings`;
export const slotsUrl = (
  username = 'ada',
  slug = 'consult',
  start = '2026-10-12',
  end = '2026-10-12',
  timezone = 'UTC',
) =>
  `/api/public/users/${username}/meeting-types/${slug}/slots?start=${start}&end=${end}&timezone=${encodeURIComponent(timezone)}`;
