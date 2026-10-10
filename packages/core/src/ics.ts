/**
 * Minimal RFC 5545 (iCalendar) writer for single-event invitations.
 *
 * - METHOD:REQUEST  → email invitation / update (same UID, higher SEQUENCE replaces it)
 * - METHOD:CANCEL   → cancellation of a previously sent invitation
 * - METHOD:PUBLISH  → plain "add to calendar" download
 */

export type IcsMethod = 'REQUEST' | 'CANCEL' | 'PUBLISH';

export interface IcsPerson {
  name: string;
  email: string;
}

export interface IcsEvent {
  uid: string;
  sequence: number;
  method: IcsMethod;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  organizer: IcsPerson;
  attendee: IcsPerson;
  /** DTSTAMP; defaults to the current time. */
  stamp?: Date;
}

const CRLF = '\r\n';

/** 2026-10-12T09:00:00.000Z → 20261012T090000Z */
export function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Escapes TEXT values (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Quotes a parameter value such as CN when it contains separators (RFC 5545 §3.2). */
function paramValue(value: string): string {
  const cleaned = value.replace(/["\r\n]/g, '');
  return /[;:,]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

/**
 * Folds a content line to at most 75 octets per physical line (RFC 5545 §3.1), never
 * splitting a multi-byte UTF-8 character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

export function buildIcs(event: IcsEvent): string {
  const status = event.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
  const partstat = event.method === 'CANCEL' ? 'DECLINED' : 'ACCEPTED';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MeetQueue//Scheduling//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${formatIcsDate(event.stamp ?? new Date())}`,
    `DTSTART:${formatIcsDate(event.start)}`,
    `DTEND:${formatIcsDate(event.end)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push(
    `ORGANIZER;CN=${paramValue(event.organizer.name)}:mailto:${event.organizer.email}`,
    `ATTENDEE;CN=${paramValue(event.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat};RSVP=FALSE:mailto:${event.attendee.email}`,
    `STATUS:${status}`,
    'TRANSP:OPAQUE',
  );
  if (event.method !== 'CANCEL') {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'TRIGGER:-PT15M',
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
