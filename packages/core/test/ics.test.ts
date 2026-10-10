import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcsText, foldLine, formatIcsDate } from '../src/ics';

const base = {
  uid: 'booking-123@meetqueue',
  sequence: 0,
  method: 'REQUEST' as const,
  start: new Date('2026-10-12T09:00:00Z'),
  end: new Date('2026-10-12T09:30:00Z'),
  stamp: new Date('2026-10-10T08:00:00Z'),
  summary: 'Intro call: Ada Lovelace & Demo Host',
  organizer: { name: 'Demo Host', email: 'host@example.com' },
  attendee: { name: 'Lovelace, Ada', email: 'ada@example.com' },
};

describe('ics', () => {
  it('formats UTC timestamps', () => {
    expect(formatIcsDate(new Date('2026-10-12T09:05:07.123Z'))).toBe('20261012T090507Z');
  });

  it('escapes special characters in text values', () => {
    expect(escapeIcsText('a,b;c\\d\nnext')).toBe('a\\,b\\;c\\\\d\\nnext');
  });

  it('folds long lines at 75 octets without splitting multibyte characters', () => {
    const folded = foldLine(`DESCRIPTION:${'é'.repeat(60)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(lines.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(
      `DESCRIPTION:${'é'.repeat(60)}`,
    );
  });

  it('builds a valid REQUEST invitation', () => {
    const ics = buildIcs({ ...base, description: 'Notes: bring, questions', location: 'Zoom' });
    expect(ics.endsWith('\r\n')).toBe(true);
    const lines = ics.trimEnd().split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    expect(lines).toContain('METHOD:REQUEST');
    expect(lines).toContain('UID:booking-123@meetqueue');
    expect(lines).toContain('DTSTART:20261012T090000Z');
    expect(lines).toContain('DTEND:20261012T093000Z');
    expect(lines).toContain('DTSTAMP:20261010T080000Z');
    expect(lines).toContain('STATUS:CONFIRMED');
    expect(lines).toContain('DESCRIPTION:Notes: bring\\, questions');
    expect(lines).toContain('BEGIN:VALARM');
    // CN containing a comma must be quoted.
    expect(ics).toContain('ATTENDEE;CN="Lovelace, Ada";');
    expect(ics).toContain('ORGANIZER;CN=Demo Host:mailto:host@example.com');
  });

  it('builds a CANCEL with a bumped sequence and no alarm', () => {
    const ics = buildIcs({ ...base, method: 'CANCEL', sequence: 2 });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('SEQUENCE:2');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).not.toContain('VALARM');
  });
});
