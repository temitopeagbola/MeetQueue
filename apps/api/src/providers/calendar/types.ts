import type { TimeRange } from '@meetqueue/core';

export type CalendarProviderName = 'google' | 'mock';

export interface CalendarTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

export interface CalendarAccount extends CalendarTokens {
  accountEmail: string;
}

export interface CalendarEventInput {
  bookingId: string;
  summary: string;
  description: string;
  location?: string | null;
  start: Date;
  end: Date;
  /** Host timezone, so the event renders sensibly in their calendar. */
  timezone: string;
  attendee: { name: string; email: string };
}

export interface CreatedCalendarEvent {
  eventId: string;
  /** True when the provider itself emailed the attendee an invitation. */
  inviteSent: boolean;
}

/**
 * A calendar backend. Implementations are stateless HTTP clients; token storage, refresh
 * persistence and error policy live in CalendarService.
 */
export interface CalendarProvider {
  readonly name: CalendarProviderName;
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<CalendarAccount>;
  refresh(tokens: CalendarTokens): Promise<CalendarTokens>;
  busy(tokens: CalendarTokens, calendarId: string, range: TimeRange): Promise<TimeRange[]>;
  createEvent(
    tokens: CalendarTokens,
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<CreatedCalendarEvent>;
  updateEvent(
    tokens: CalendarTokens,
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<void>;
  deleteEvent(tokens: CalendarTokens, calendarId: string, eventId: string): Promise<void>;
  revoke(tokens: CalendarTokens): Promise<void>;
}
