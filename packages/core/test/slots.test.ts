import { describe, expect, it } from 'vitest';
import {
  computeBookingTimes,
  expandAvailability,
  findRuleProblems,
  generateSlots,
  groupSlotsByDay,
  isSlotAvailable,
  mergeRanges,
  subtractRange,
  type SlotQuery,
  type WeeklyRule,
} from '../src/slots';

const MON = 1;
const TUE = 2;
const WED = 3;
const nineToFive = (weekday: number): WeeklyRule => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
});

function query(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    hostTimezone: 'UTC',
    rules: [nineToFive(MON)],
    busy: [],
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    slotIntervalMinutes: 30,
    minNoticeMinutes: 0,
    maxDaysAhead: 60,
    // Sunday 2026-10-11 12:00 UTC
    now: new Date('2026-10-11T12:00:00Z'),
    // Monday 2026-10-12, whole day
    rangeStart: new Date('2026-10-12T00:00:00Z'),
    rangeEnd: new Date('2026-10-13T00:00:00Z'),
    ...overrides,
  };
}

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());

describe('generateSlots', () => {
  it('produces every start time that fits inside the window', () => {
    const slots = generateSlots(query());
    expect(slots).toHaveLength(16);
    expect(slots[0]!.toISOString()).toBe('2026-10-12T09:00:00.000Z');
    expect(slots.at(-1)!.toISOString()).toBe('2026-10-12T16:30:00.000Z');
  });

  it('only offers days that have rules', () => {
    const slots = generateSlots(
      query({
        rangeStart: new Date('2026-10-11T00:00:00Z'),
        rangeEnd: new Date('2026-10-15T00:00:00Z'),
        rules: [nineToFive(TUE)],
      }),
    );
    expect(new Set(slots.map((s) => s.toISOString().slice(0, 10)))).toEqual(
      new Set(['2026-10-13']),
    );
  });

  it('supports intervals shorter than the meeting', () => {
    const slots = generateSlots(query({ durationMinutes: 60, slotIntervalMinutes: 15 }));
    // 09:00 … 16:00 every 15 minutes = 29 starts
    expect(slots).toHaveLength(29);
    expect(slots.at(-1)!.toISOString()).toBe('2026-10-12T16:00:00.000Z');
  });

  it('never lets a meeting run past the end of the window', () => {
    const slots = generateSlots(query({ durationMinutes: 45, slotIntervalMinutes: 30 }));
    expect(slots.at(-1)!.toISOString()).toBe('2026-10-12T16:00:00.000Z');
  });

  it('respects split days (lunch break)', () => {
    const slots = generateSlots(
      query({
        rules: [
          { weekday: MON, startMinute: 9 * 60, endMinute: 12 * 60 },
          { weekday: MON, startMinute: 13 * 60, endMinute: 14 * 60 },
        ],
        durationMinutes: 60,
        slotIntervalMinutes: 60,
      }),
    );
    expect(iso(slots)).toEqual([
      '2026-10-12T09:00:00.000Z',
      '2026-10-12T10:00:00.000Z',
      '2026-10-12T11:00:00.000Z',
      '2026-10-12T13:00:00.000Z',
    ]);
  });

  it('merges overlapping rules instead of returning duplicates', () => {
    const slots = generateSlots(
      query({
        rules: [
          { weekday: MON, startMinute: 9 * 60, endMinute: 11 * 60 },
          { weekday: MON, startMinute: 10 * 60, endMinute: 12 * 60 },
        ],
        durationMinutes: 60,
        slotIntervalMinutes: 60,
      }),
    );
    expect(iso(slots)).toEqual([
      '2026-10-12T09:00:00.000Z',
      '2026-10-12T10:00:00.000Z',
      '2026-10-12T11:00:00.000Z',
    ]);
  });

  it('removes slots that collide with busy time', () => {
    const slots = generateSlots(
      query({
        busy: [{ start: new Date('2026-10-12T10:00:00Z'), end: new Date('2026-10-12T11:00:00Z') }],
      }),
    );
    const times = iso(slots);
    expect(times).not.toContain('2026-10-12T10:00:00.000Z');
    expect(times).not.toContain('2026-10-12T10:30:00.000Z');
    expect(times).toContain('2026-10-12T09:30:00.000Z');
    expect(times).toContain('2026-10-12T11:00:00.000Z');
  });

  it('keeps the new meeting’s buffers clear of busy time', () => {
    // Existing booking 10:00–10:30 blocks [10:00, 10:30). New meeting has 15 min buffers.
    const slots = generateSlots(
      query({
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        slotIntervalMinutes: 15,
        busy: [{ start: new Date('2026-10-12T10:00:00Z'), end: new Date('2026-10-12T10:30:00Z') }],
      }),
    );
    const times = iso(slots);
    // 09:15 would end at 09:45 + 15 min after-buffer = 10:00 → just fits.
    expect(times).toContain('2026-10-12T09:15:00.000Z');
    expect(times).not.toContain('2026-10-12T09:30:00.000Z');
    // 10:45 starts with a 15 min before-buffer at 10:30 → just fits.
    expect(times).not.toContain('2026-10-12T10:30:00.000Z');
    expect(times).toContain('2026-10-12T10:45:00.000Z');
  });

  it('applies minimum notice relative to now', () => {
    const slots = generateSlots(
      query({ now: new Date('2026-10-12T10:10:00Z'), minNoticeMinutes: 120 }),
    );
    expect(slots[0]!.toISOString()).toBe('2026-10-12T12:30:00.000Z');
  });

  it('never offers slots in the past', () => {
    const slots = generateSlots(query({ now: new Date('2026-10-12T16:31:00Z') }));
    expect(slots).toHaveLength(0);
  });

  it('stops at the booking horizon (end of the last allowed day)', () => {
    const slots = generateSlots(
      query({
        rules: [nineToFive(MON), nineToFive(TUE), nineToFive(WED)],
        now: new Date('2026-10-12T08:00:00Z'),
        maxDaysAhead: 1,
        rangeStart: new Date('2026-10-12T00:00:00Z'),
        rangeEnd: new Date('2026-10-20T00:00:00Z'),
      }),
    );
    const days = new Set(slots.map((s) => s.toISOString().slice(0, 10)));
    expect(days).toEqual(new Set(['2026-10-12', '2026-10-13']));
  });

  it('interprets rules in the host timezone', () => {
    const slots = generateSlots(
      query({
        hostTimezone: 'America/New_York', // EDT, UTC−4 in October
        rangeStart: new Date('2026-10-12T00:00:00Z'),
        rangeEnd: new Date('2026-10-13T12:00:00Z'),
      }),
    );
    expect(slots[0]!.toISOString()).toBe('2026-10-12T13:00:00.000Z');
    expect(slots.at(-1)!.toISOString()).toBe('2026-10-12T20:30:00.000Z');
  });

  it('keeps local wall-clock hours across a DST change', () => {
    // US DST ends Sunday 2026-11-01. 09:00 New York is 13:00Z before and 14:00Z after.
    const slots = generateSlots(
      query({
        hostTimezone: 'America/New_York',
        rules: [nineToFive(5 /* Fri */), nineToFive(MON)],
        now: new Date('2026-10-28T00:00:00Z'),
        rangeStart: new Date('2026-10-30T00:00:00Z'),
        rangeEnd: new Date('2026-11-03T00:00:00Z'),
      }),
    );
    const firstByDay = groupSlotsByDay(slots, 'America/New_York').map((d) => d.slots[0]);
    expect(firstByDay).toEqual(['2026-10-30T13:00:00.000Z', '2026-11-02T14:00:00.000Z']);
  });

  it('handles windows that run until midnight', () => {
    const slots = generateSlots(
      query({
        rules: [{ weekday: MON, startMinute: 23 * 60, endMinute: 24 * 60 }],
        rangeEnd: new Date('2026-10-14T00:00:00Z'),
      }),
    );
    expect(iso(slots)).toEqual(['2026-10-12T23:00:00.000Z', '2026-10-12T23:30:00.000Z']);
  });

  it('only returns starts inside the requested range', () => {
    const slots = generateSlots(
      query({
        rangeStart: new Date('2026-10-12T12:00:00Z'),
        rangeEnd: new Date('2026-10-12T13:00:00Z'),
      }),
    );
    expect(iso(slots)).toEqual(['2026-10-12T12:00:00.000Z', '2026-10-12T12:30:00.000Z']);
  });

  it('rejects nonsensical settings', () => {
    expect(() => generateSlots(query({ durationMinutes: 0 }))).toThrow(RangeError);
    expect(() => generateSlots(query({ slotIntervalMinutes: -5 }))).toThrow(RangeError);
    expect(() => generateSlots(query({ bufferAfterMinutes: 1.5 }))).toThrow(RangeError);
  });
});

describe('isSlotAvailable', () => {
  const input = query();

  it('accepts a start on the slot grid', () => {
    expect(isSlotAvailable(input, new Date('2026-10-12T09:30:00Z'))).toBe(true);
  });

  it('rejects starts off the grid, outside hours or invalid', () => {
    expect(isSlotAvailable(input, new Date('2026-10-12T09:10:00Z'))).toBe(false);
    expect(isSlotAvailable(input, new Date('2026-10-12T17:00:00Z'))).toBe(false);
    expect(isSlotAvailable(input, new Date('nope'))).toBe(false);
  });

  it('rejects a start that is busy', () => {
    const busy = [{ start: new Date('2026-10-12T09:30:00Z'), end: new Date('2026-10-12T10:00:00Z') }];
    expect(isSlotAvailable({ ...input, busy }, new Date('2026-10-12T09:30:00Z'))).toBe(false);
  });
});

describe('computeBookingTimes', () => {
  it('adds buffers around the meeting', () => {
    const times = computeBookingTimes(new Date('2026-10-12T10:00:00Z'), {
      durationMinutes: 30,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 5,
    });
    expect(times.endsAt.toISOString()).toBe('2026-10-12T10:30:00.000Z');
    expect(times.blockedStart.toISOString()).toBe('2026-10-12T09:50:00.000Z');
    expect(times.blockedEnd.toISOString()).toBe('2026-10-12T10:35:00.000Z');
  });
});

describe('groupSlotsByDay', () => {
  it('groups by the viewer’s local date, not UTC', () => {
    const slots = [new Date('2026-10-12T14:30:00Z'), new Date('2026-10-12T15:30:00Z')];
    // Tokyo is UTC+9: 23:30 on the 12th and 00:30 on the 13th.
    expect(groupSlotsByDay(slots, 'Asia/Tokyo')).toEqual([
      { date: '2026-10-12', slots: ['2026-10-12T14:30:00.000Z'] },
      { date: '2026-10-13', slots: ['2026-10-12T15:30:00.000Z'] },
    ]);
  });
});

describe('mergeRanges / expandAvailability', () => {
  it('merges touching and overlapping ranges', () => {
    const r = (a: string, b: string) => ({
      start: new Date(`2026-10-12T${a}:00Z`),
      end: new Date(`2026-10-12T${b}:00Z`),
    });
    const merged = mergeRanges([r('11:00', '12:00'), r('09:00', '10:00'), r('10:00', '10:30')]);
    expect(merged.map((m) => [m.start.toISOString(), m.end.toISOString()])).toEqual([
      ['2026-10-12T09:00:00.000Z', '2026-10-12T10:30:00.000Z'],
      ['2026-10-12T11:00:00.000Z', '2026-10-12T12:00:00.000Z'],
    ]);
  });

  it('expands weekly rules into concrete windows', () => {
    const windows = expandAvailability(
      [nineToFive(MON)],
      'Europe/London',
      new Date('2026-10-12T00:00:00Z'),
      new Date('2026-10-19T23:00:00Z'),
    );
    // Two Mondays; London is BST (UTC+1) on the 12th and the 19th.
    expect(windows.map((w) => w.start.toISOString())).toEqual([
      '2026-10-12T08:00:00.000Z',
      '2026-10-19T08:00:00.000Z',
    ]);
  });
});

describe('findRuleProblems', () => {
  it('flags overlapping and inverted rules', () => {
    expect(findRuleProblems([nineToFive(MON)])).toEqual([]);
    expect(
      findRuleProblems([nineToFive(MON), { weekday: MON, startMinute: 600, endMinute: 700 }]),
    ).toEqual(['Availability windows overlap on Monday.']);
    expect(findRuleProblems([{ weekday: MON, startMinute: 600, endMinute: 600 }])).toHaveLength(1);
  });
});

describe('subtractRange', () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 12, h));
  it('cuts a hole out of overlapping ranges and keeps the rest', () => {
    const result = subtractRange(
      [
        { start: t(8), end: t(12) },
        { start: t(13), end: t(14) },
      ],
      { start: t(9), end: t(10) },
    );
    expect(result.map((r) => [r.start.getUTCHours(), r.end.getUTCHours()])).toEqual([
      [8, 9],
      [10, 12],
      [13, 14],
    ]);
  });

  it('drops ranges fully covered by the cut', () => {
    expect(subtractRange([{ start: t(9), end: t(10) }], { start: t(8), end: t(11) })).toEqual([]);
  });
});
