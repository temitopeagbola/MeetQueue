// JSON shapes exchanged between apps/api and apps/web. Dates are ISO-8601 strings.

import type { SlotDay } from './slots';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  username: string;
  timezone: string;
  isDemo: boolean;
}

export interface AvailabilityRuleDTO {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityDTO {
  timezone: string;
  rules: AvailabilityRuleDTO[];
}

export interface MeetingTypeDTO {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  location: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  color: string;
  isActive: boolean;
  bookingCount?: number;
}

export type PublicMeetingTypeDTO = Pick<
  MeetingTypeDTO,
  'title' | 'slug' | 'description' | 'location' | 'durationMinutes' | 'color' | 'maxDaysAhead'
>;

export interface PublicHostDTO {
  name: string;
  username: string;
  timezone: string;
}

export interface PublicProfileDTO {
  host: PublicHostDTO;
  meetingTypes: PublicMeetingTypeDTO[];
}

export interface PublicMeetingTypePageDTO {
  host: PublicHostDTO;
  meetingType: PublicMeetingTypeDTO;
}

export interface SlotsResponseDTO {
  timezone: string;
  days: SlotDay[];
}

export type BookingStatus = 'CONFIRMED' | 'CANCELLED';
export type CalendarSyncState = 'google' | 'mock' | 'none';

export interface HostBookingDTO {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  notes: string | null;
  meetingType: { id: string; title: string; color: string; durationMinutes: number };
  calendar: CalendarSyncState;
  calendarEventId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: 'HOST' | 'INVITEE' | null;
  rescheduleCount: number;
  createdAt: string;
}

export interface ManageBookingDTO {
  id: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  inviteeName: string;
  inviteeEmail: string;
  inviteeTimezone: string;
  notes: string | null;
  cancelReason: string | null;
  rescheduleCount: number;
  isPast: boolean;
  host: PublicHostDTO;
  meetingType: PublicMeetingTypeDTO;
}

export interface BookingConfirmationDTO {
  booking: ManageBookingDTO;
  /** Raw manage token. Only returned once, at creation time. */
  manageToken: string;
  calendar: { provider: CalendarSyncState; inviteSent: boolean };
}

export interface IntegrationsDTO {
  calendar: {
    mode: 'google' | 'mock';
    connected: boolean;
    provider: 'google' | 'mock' | null;
    accountEmail: string | null;
    /** Last sync failure (e.g. expired Google access), shown until the next success. */
    error: string | null;
    /** Why connecting a real calendar is unavailable, if it is. */
    restriction: string | null;
  };
  email: { mode: 'smtp' | 'console' };
}

export interface EmailLogDTO {
  id: string;
  to: string;
  subject: string;
  kind: string;
  provider: string;
  status: 'SENT' | 'LOGGED' | 'FAILED';
  hasIcs: boolean;
  bodyText: string;
  error: string | null;
  createdAt: string;
}
