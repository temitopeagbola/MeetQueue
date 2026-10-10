import { describe, expect, it } from 'vitest';
import { formatDuration, formatLocalDate, formatNotice, formatRange, formatTime, timeZoneLabel } from '@/lib/format';

describe('format helpers', () => {
  it('renders the same instant in different timezones', () => {
    const iso = '2026-10-12T13:00:00.000Z';
    expect(formatTime(iso, 'America/New_York', 'en-US')).toBe('9:00 AM');
    expect(formatTime(iso, 'Europe/London', 'en-GB')).toBe('14:00');
  });

  it('formats ranges and plain dates without drift', () => {
    expect(formatRange('2026-10-12T13:00:00Z', '2026-10-12T13:30:00Z', 'UTC', 'en-US')).toBe(
      'Mon, Oct 12, 1:00 PM – 1:30 PM',
    );
    expect(formatLocalDate('2026-10-12', 'en-GB')).toBe('Monday 12 October');
  });

  it('describes durations and notice periods', () => {
    expect(formatDuration(15)).toBe('15 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(90)).toBe('1 hr 30 min');
    expect(formatNotice(0)).toBe('No minimum notice');
    expect(formatNotice(120)).toBe('2 hr notice');
    expect(formatNotice(1440)).toBe('1 day notice');
    expect(formatNotice(2880)).toBe('2 days notice');
    expect(formatNotice(45)).toBe('45 min notice');
  });

  it('labels timezones with their current offset', () => {
    expect(timeZoneLabel('America/New_York', new Date('2026-07-01T00:00:00Z'))).toBe('America/New York (GMT-4)');
    expect(timeZoneLabel('Not/AZone')).toBe('Not/AZone');
  });
});
