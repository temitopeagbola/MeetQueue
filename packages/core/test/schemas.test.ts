import { describe, expect, it } from 'vitest';
import {
  availabilityUpdateSchema,
  bookingCreateSchema,
  meetingTypeSchema,
  signupSchema,
  slotsQuerySchema,
} from '../src/schemas';
import { localDateRangeToInstants, minutesToTime, timeToMinutes } from '../src/time';

describe('signupSchema', () => {
  const valid = {
    name: 'Ada',
    email: '  Ada@Example.COM ',
    username: 'Ada-L',
    password: 'correct horse',
    timezone: 'Europe/London',
  };

  it('normalises email and username', () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed.email).toBe('ada@example.com');
    expect(parsed.username).toBe('ada-l');
  });

  it('rejects reserved usernames, bad timezones and short passwords', () => {
    expect(signupSchema.safeParse({ ...valid, username: 'dashboard' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, username: 'Demo' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, username: '-ada' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });
});

describe('availabilityUpdateSchema', () => {
  it('rejects overlapping windows on the same day', () => {
    const result = availabilityUpdateSchema.safeParse({
      timezone: 'UTC',
      rules: [
        { weekday: 1, startMinute: 540, endMinute: 720 },
        { weekday: 1, startMinute: 700, endMinute: 800 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts windows on different days and end-of-day 24:00', () => {
    const result = availabilityUpdateSchema.safeParse({
      timezone: 'UTC',
      rules: [
        { weekday: 1, startMinute: 540, endMinute: 1440 },
        { weekday: 2, startMinute: 540, endMinute: 720 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('meetingTypeSchema', () => {
  it('applies defaults and bounds', () => {
    const parsed = meetingTypeSchema.parse({
      title: 'Intro',
      slug: 'intro',
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 10,
      slotIntervalMinutes: 30,
      minNoticeMinutes: 60,
      maxDaysAhead: 30,
    });
    expect(parsed.isActive).toBe(true);
    expect(parsed.color).toBe('#4f46e5');
    expect(meetingTypeSchema.safeParse({ ...parsed, durationMinutes: 2 }).success).toBe(false);
  });
});

describe('slotsQuerySchema', () => {
  it('limits the range size and order', () => {
    expect(
      slotsQuerySchema.safeParse({ start: '2026-10-01', end: '2026-10-31', timezone: 'UTC' })
        .success,
    ).toBe(true);
    expect(
      slotsQuerySchema.safeParse({ start: '2026-10-31', end: '2026-10-01', timezone: 'UTC' })
        .success,
    ).toBe(false);
    expect(
      slotsQuerySchema.safeParse({ start: '2026-01-01', end: '2026-06-01', timezone: 'UTC' })
        .success,
    ).toBe(false);
  });
});

describe('bookingCreateSchema', () => {
  it('requires an ISO datetime with offset', () => {
    const base = { name: 'Ada', email: 'ada@example.com', timezone: 'UTC' };
    expect(bookingCreateSchema.safeParse({ ...base, start: '2026-10-12T09:00:00Z' }).success).toBe(
      true,
    );
    expect(bookingCreateSchema.safeParse({ ...base, start: '2026-10-12 09:00' }).success).toBe(
      false,
    );
  });
});

describe('time helpers', () => {
  it('round-trips HH:MM', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('24:00')).toBe(1440);
    expect(minutesToTime(570)).toBe('09:30');
    expect(() => timeToMinutes('25:00')).toThrow();
  });

  it('converts local date ranges to instants', () => {
    const { rangeStart, rangeEnd } = localDateRangeToInstants(
      '2026-10-01',
      '2026-10-31',
      'Asia/Tokyo',
    );
    expect(rangeStart.toISOString()).toBe('2026-09-30T15:00:00.000Z');
    expect(rangeEnd.toISOString()).toBe('2026-10-31T15:00:00.000Z');
  });
});
