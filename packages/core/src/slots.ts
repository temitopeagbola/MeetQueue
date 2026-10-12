import { DateTime } from 'luxon';
import { MINUTE_MS, MINUTES_PER_DAY, WEEKDAYS, toLocalDate } from './time';

/** A recurring window of availability, expressed in the host's timezone. */
export interface WeeklyRule {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** Minutes after local midnight, inclusive. */
  startMinute: number;
  /** Minutes after local midnight, exclusive. 1440 means "until midnight". */
  endMinute: number;
}

/** Half-open instant range [start, end). */
export interface TimeRange {
  start: Date;
  end: Date;
}

export interface SlotSettings {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  /** Distance between candidate start times (e.g. every 15 or 30 minutes). */
  slotIntervalMinutes: number;
  /** Bookings must start at least this far after "now". */
  minNoticeMinutes: number;
  /** Bookings may start up to the end of this many days from today (host timezone). */
  maxDaysAhead: number;
}

export interface AvailabilityInput extends SlotSettings {
  hostTimezone: string;
  rules: WeeklyRule[];
  /**
   * Time that is already taken: other bookings' *blocked* ranges (meeting + buffers) and
   * external calendar busy blocks.
   */
  busy: TimeRange[];
  now: Date;
}

export interface SlotQuery extends AvailabilityInput {
  rangeStart: Date;
  rangeEnd: Date;
}

export interface BookingTimes {
  startsAt: Date;
  endsAt: Date;
  /** startsAt − buffer before. This is what the DB exclusion constraint compares. */
  blockedStart: Date;
  /** endsAt + buffer after. */
  blockedEnd: Date;
}

export function computeBookingTimes(
  start: Date,
  settings: Pick<SlotSettings, 'durationMinutes' | 'bufferBeforeMinutes' | 'bufferAfterMinutes'>,
): BookingTimes {
  const startMs = start.getTime();
  const endMs = startMs + settings.durationMinutes * MINUTE_MS;
  return {
    startsAt: new Date(startMs),
    endsAt: new Date(endMs),
    blockedStart: new Date(startMs - settings.bufferBeforeMinutes * MINUTE_MS),
    blockedEnd: new Date(endMs + settings.bufferAfterMinutes * MINUTE_MS),
  };
}

/** Sorts and merges overlapping or touching ranges. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges
    .filter((r) => r.end.getTime() > r.start.getTime())
    .map((r) => ({ start: r.start.getTime(), end: r.end.getTime() }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged.map((r) => ({ start: new Date(r.start), end: new Date(r.end) }));
}

function atLocalMinute(day: DateTime, minute: number): DateTime {
  if (minute >= MINUTES_PER_DAY) return day.plus({ days: 1 }).startOf('day');
  return day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 });
}

/**
 * Expands weekly rules into concrete instant ranges for every host-local day touching
 * [from, to). Uses wall-clock arithmetic, so "09:00–17:00" stays 09:00–17:00 local across DST.
 *
 * Overlapping rules are merged within a day but never across midnight: each day's slot grid
 * is anchored to that day's own window start. (Merging across days would make the grid depend
 * on where a query starts, and drift by the DST hour when the clocks change.)
 */
export function expandAvailability(
  rules: WeeklyRule[],
  zone: string,
  from: Date,
  to: Date,
): TimeRange[] {
  if (rules.length === 0 || to <= from) return [];
  const windows: TimeRange[] = [];
  let day = DateTime.fromJSDate(from, { zone }).startOf('day').minus({ days: 1 });
  const lastDay = DateTime.fromJSDate(to, { zone }).startOf('day').plus({ days: 1 });
  while (day <= lastDay) {
    const weekday = day.weekday % 7; // Luxon: 1 = Monday … 7 = Sunday
    const dayWindows: TimeRange[] = [];
    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      const start = atLocalMinute(day, rule.startMinute);
      const end = atLocalMinute(day, rule.endMinute);
      if (end > start) dayWindows.push({ start: start.toJSDate(), end: end.toJSDate() });
    }
    windows.push(...mergeRanges(dayWindows));
    day = day.plus({ days: 1 }).startOf('day');
  }
  return windows.filter((w) => w.end > from && w.start < to);
}

/** Binary search over merged (sorted, disjoint) ranges for any overlap with [start, end). */
function overlapsAny(merged: { start: number; end: number }[], start: number, end: number) {
  let lo = 0;
  let hi = merged.length;
  // First range whose end is after `start`.
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (merged[mid]!.end <= start) lo = mid + 1;
    else hi = mid;
  }
  const candidate = merged[lo];
  return candidate !== undefined && candidate.start < end;
}

function assertSettings(settings: SlotSettings) {
  const positive = ['durationMinutes', 'slotIntervalMinutes'] as const;
  for (const key of positive) {
    if (!Number.isInteger(settings[key]) || settings[key] <= 0) {
      throw new RangeError(`${key} must be a positive integer`);
    }
  }
  const nonNegative = [
    'bufferBeforeMinutes',
    'bufferAfterMinutes',
    'minNoticeMinutes',
    'maxDaysAhead',
  ] as const;
  for (const key of nonNegative) {
    if (!Number.isInteger(settings[key]) || settings[key] < 0) {
      throw new RangeError(`${key} must be a non-negative integer`);
    }
  }
}

/** Last instant a booking may start, given the booking horizon. */
export function bookingHorizon(now: Date, zone: string, maxDaysAhead: number): Date {
  return DateTime.fromJSDate(now, { zone }).plus({ days: maxDaysAhead }).endOf('day').toJSDate();
}

/**
 * Returns every bookable start time in [rangeStart, rangeEnd), sorted ascending.
 *
 * A start `t` is bookable when:
 *  - the meeting [t, t + duration) fits entirely inside an availability window,
 *  - t lies on the window's slot grid (window start + k × interval),
 *  - t ≥ now + min notice and t ≤ the booking horizon,
 *  - the buffered range [t − before, t + duration + after) overlaps nothing in `busy`.
 */
export function generateSlots(query: SlotQuery): Date[] {
  assertSettings(query);
  const {
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    slotIntervalMinutes,
    minNoticeMinutes,
    maxDaysAhead,
  } = query;

  const earliest = Math.max(
    query.rangeStart.getTime(),
    query.now.getTime() + minNoticeMinutes * MINUTE_MS,
  );
  const horizon = bookingHorizon(query.now, query.hostTimezone, maxDaysAhead).getTime();
  // Exclusive upper bound for start times.
  const latest = Math.min(query.rangeEnd.getTime(), horizon + 1);
  if (earliest >= latest) return [];

  const durationMs = durationMinutes * MINUTE_MS;
  const stepMs = slotIntervalMinutes * MINUTE_MS;
  const windows = expandAvailability(
    query.rules,
    query.hostTimezone,
    new Date(earliest),
    new Date(latest + durationMs),
  );
  const busy = mergeRanges(query.busy).map((r) => ({
    start: r.start.getTime(),
    end: r.end.getTime(),
  }));

  const slots: Date[] = [];
  for (const window of windows) {
    const windowEnd = window.end.getTime();
    for (let t = window.start.getTime(); t + durationMs <= windowEnd; t += stepMs) {
      if (t < earliest) continue;
      if (t >= latest) break;
      const blockedStart = t - bufferBeforeMinutes * MINUTE_MS;
      const blockedEnd = t + durationMs + bufferAfterMinutes * MINUTE_MS;
      if (!overlapsAny(busy, blockedStart, blockedEnd)) slots.push(new Date(t));
    }
  }
  return slots;
}

/** True when `start` is exactly one of the bookable slots. Used to validate booking requests. */
export function isSlotAvailable(input: AvailabilityInput, start: Date): boolean {
  if (Number.isNaN(start.getTime())) return false;
  const slots = generateSlots({
    ...input,
    rangeStart: start,
    rangeEnd: new Date(start.getTime() + 1),
  });
  return slots.length === 1 && slots[0]!.getTime() === start.getTime();
}

export interface SlotDay {
  /** YYYY-MM-DD in the viewer's timezone. */
  date: string;
  /** ISO-8601 UTC instants. */
  slots: string[];
}

/** Groups slot instants by calendar date in the viewer's timezone. */
export function groupSlotsByDay(slots: Date[], zone: string): SlotDay[] {
  const days = new Map<string, string[]>();
  for (const slot of slots) {
    const date = toLocalDate(slot, zone);
    const list = days.get(date) ?? [];
    list.push(slot.toISOString());
    days.set(date, list);
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, list]) => ({ date, slots: list }));
}

/** Validates a set of weekly rules; returns human-readable problems (empty when valid). */
export function findRuleProblems(rules: WeeklyRule[]): string[] {
  const problems: string[] = [];
  const byDay = new Map<number, WeeklyRule[]>();
  for (const rule of rules) {
    if (rule.endMinute <= rule.startMinute) {
      problems.push('Each availability window must end after it starts.');
      continue;
    }
    byDay.set(rule.weekday, [...(byDay.get(rule.weekday) ?? []), rule]);
  }
  for (const [weekday, dayRules] of byDay) {
    const sorted = [...dayRules].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.startMinute < sorted[i - 1]!.endMinute) {
        problems.push(`Availability windows overlap on ${WEEKDAYS[weekday] ?? 'the same day'}.`);
        break;
      }
    }
  }
  return problems;
}

/** Removes `cut` from every range (used to ignore a booking's own calendar event). */
export function subtractRange(ranges: TimeRange[], cut: TimeRange): TimeRange[] {
  const out: TimeRange[] = [];
  for (const range of ranges) {
    if (range.end <= cut.start || range.start >= cut.end) {
      out.push(range);
      continue;
    }
    if (range.start < cut.start) out.push({ start: range.start, end: cut.start });
    if (range.end > cut.end) out.push({ start: cut.end, end: range.end });
  }
  return out;
}
