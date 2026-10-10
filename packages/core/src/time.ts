import { DateTime, IANAZone } from 'luxon';

export const MINUTE_MS = 60_000;
export const MINUTES_PER_DAY = 24 * 60;

/** 0 = Sunday … 6 = Saturday (matches `Date#getDay`). */
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function isValidTimeZone(zone: string): boolean {
  return typeof zone === 'string' && zone.length > 0 && IANAZone.isValidZone(zone);
}

/** "09:30" → 570. Accepts "24:00" as end-of-day (1440). */
export function timeToMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid time "${value}"`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && minutes === 0) return MINUTES_PER_DAY;
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time "${value}"`);
  return hours * 60 + minutes;
}

/** 570 → "09:30", 1440 → "24:00". */
export function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/** Calendar date (YYYY-MM-DD) of an instant as seen in `zone`. */
export function toLocalDate(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toISODate() ?? '';
}

/**
 * Converts an inclusive local date range into the half-open UTC instant range that covers it,
 * e.g. ("2026-10-01", "2026-10-31", "Asia/Tokyo") → [Oct 1 00:00 JST, Nov 1 00:00 JST).
 */
export function localDateRangeToInstants(
  startDate: string,
  endDate: string,
  zone: string,
): { rangeStart: Date; rangeEnd: Date } {
  const start = DateTime.fromISO(startDate, { zone }).startOf('day');
  const end = DateTime.fromISO(endDate, { zone }).plus({ days: 1 }).startOf('day');
  if (!start.isValid || !end.isValid) throw new Error('Invalid date range');
  return { rangeStart: start.toJSDate(), rangeEnd: end.toJSDate() };
}

/** Human-friendly "Mon 12 Oct 2026, 09:00 – 09:30 (Europe/London)" used in emails. */
export function formatRangeInZone(start: Date, end: Date, zone: string, locale = 'en-GB'): string {
  const s = DateTime.fromJSDate(start, { zone }).setLocale(locale);
  const e = DateTime.fromJSDate(end, { zone }).setLocale(locale);
  const day = s.toFormat('cccc d LLLL yyyy');
  return `${day}, ${s.toFormat('HH:mm')} – ${e.toFormat('HH:mm')} (${zone})`;
}
