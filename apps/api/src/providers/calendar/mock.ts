import { randomUUID } from 'node:crypto';
import type { TimeRange } from '@meetqueue/core';
import type {
  CalendarAccount,
  CalendarEventInput,
  CalendarProvider,
  CalendarTokens,
  CreatedCalendarEvent,
} from './types';

export interface MockCalendarEvent extends CalendarEventInput {
  eventId: string;
  deleted: boolean;
}

/**
 * Stand-in for Google Calendar when no OAuth credentials are configured (and always for the
 * shared demo account). It walks the same connect → callback → create/update/delete path, so
 * the app behaves identically; events are kept in memory for inspection in tests.
 */
export class MockCalendarProvider implements CalendarProvider {
  readonly name = 'mock' as const;
  readonly events = new Map<string, MockCalendarEvent>();
  /** Extra busy blocks to return from free/busy (tests use this). */
  busyBlocks: TimeRange[] = [];

  constructor(private readonly callbackUrl: string) {}

  authorizationUrl(state: string): string {
    // Skip the consent screen: bounce straight back to our own OAuth callback.
    const params = new URLSearchParams({ code: 'mock-authorization-code', state });
    return `${this.callbackUrl}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<CalendarAccount> {
    if (!code) throw new Error('Missing authorization code');
    return {
      accessToken: `mock-access-${randomUUID()}`,
      refreshToken: `mock-refresh-${randomUUID()}`,
      expiresAt: null,
      accountEmail: 'mock-calendar@meetqueue.local',
    };
  }

  async refresh(tokens: CalendarTokens): Promise<CalendarTokens> {
    return tokens;
  }

  async busy(_tokens: CalendarTokens, _calendarId: string, range: TimeRange): Promise<TimeRange[]> {
    return this.busyBlocks.filter((b) => b.start < range.end && b.end > range.start);
  }

  async createEvent(
    _tokens: CalendarTokens,
    _calendarId: string,
    event: CalendarEventInput,
  ): Promise<CreatedCalendarEvent> {
    const eventId = `mock_evt_${randomUUID().slice(0, 8)}`;
    this.events.set(eventId, { ...event, eventId, deleted: false });
    // A mock can't email anyone, so MeetQueue falls back to its own ICS invitation.
    return { eventId, inviteSent: false };
  }

  async updateEvent(
    _tokens: CalendarTokens,
    _calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<void> {
    this.events.set(eventId, { ...event, eventId, deleted: false });
  }

  async deleteEvent(_tokens: CalendarTokens, _calendarId: string, eventId: string): Promise<void> {
    const existing = this.events.get(eventId);
    if (existing) existing.deleted = true;
  }

  async revoke(): Promise<void> {}
}
