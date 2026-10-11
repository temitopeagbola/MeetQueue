import { minutesToTime, timeToMinutes } from '@meetqueue/core';

/** One availability window as edited in <input type="time"> fields ("HH:MM"). */
export interface Interval {
  start: string;
  end: string;
}

/** Minutes from an <input type="time"> value; null while the field is empty or partial. */
export function startToMinutes(value: string): number | null {
  if (!value) return null;
  try {
    return timeToMinutes(value);
  } catch {
    return null;
  }
}
/** <input type="time"> can't say 24:00, so an end of 00:00 means midnight. */
export const endToMinutes = (value: string) => (value === '00:00' ? 1440 : startToMinutes(value));
export const endToInput = (minutes: number) =>
  minutes === 1440 ? '00:00' : minutesToTime(minutes);

export function intervalProblem(interval: Interval): string | null {
  const start = startToMinutes(interval.start);
  const end = endToMinutes(interval.end);
  if (start === null || end === null) return 'Enter a start and an end time';
  if (end <= start) return 'Ends before it starts';
  return null;
}

/** A new window right after the last one (two hours, capped at midnight). */
export function nextInterval(last?: Interval): Interval | null {
  if (!last) return { start: '09:00', end: '17:00' };
  const start = endToMinutes(last.end);
  if (start === null || start > 1440 - 15) return null;
  return { start: minutesToTime(start), end: endToInput(Math.min(start + 120, 1440)) };
}
