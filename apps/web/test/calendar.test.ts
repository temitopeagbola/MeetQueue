import { describe, expect, it } from 'vitest';
import { addDays, addMonths, monthBounds, monthGrid, monthLabel, todayIn } from '@/lib/calendar';

describe('calendar helpers', () => {
  it('computes today in a given timezone', () => {
    const instant = new Date('2026-10-12T23:30:00Z');
    expect(todayIn('UTC', instant)).toBe('2026-10-12');
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-10-13');
    expect(todayIn('America/Los_Angeles', instant)).toBe('2026-10-12');
  });

  it('moves between months across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
  });

  it('knows month lengths including leap years', () => {
    expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthBounds('2026-02').end).toBe('2026-02-28');
  });

  it('lays out a Monday-first grid', () => {
    const weeks = monthGrid('2026-10'); // 1 Oct 2026 is a Thursday
    expect(weeks[0]).toEqual([
      null,
      null,
      null,
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });

  it('labels months', () => {
    expect(monthLabel('2026-10', 'en-GB')).toBe('October 2026');
  });
});
