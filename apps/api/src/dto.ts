import type {
  HostBookingDTO,
  ManageBookingDTO,
  MeetingTypeDTO,
  PublicHostDTO,
  PublicMeetingTypeDTO,
  UserDTO,
} from '@meetqueue/core';
import type { Booking, MeetingType, User } from './generated/prisma/client';

export const toUserDTO = (u: User): UserDTO => ({
  id: u.id,
  email: u.email,
  name: u.name,
  username: u.username,
  timezone: u.timezone,
  isDemo: u.isDemo,
});

export const toMeetingTypeDTO = (m: MeetingType, bookingCount?: number): MeetingTypeDTO => ({
  id: m.id,
  title: m.title,
  slug: m.slug,
  description: m.description,
  location: m.location,
  durationMinutes: m.durationMinutes,
  bufferBeforeMinutes: m.bufferBeforeMinutes,
  bufferAfterMinutes: m.bufferAfterMinutes,
  slotIntervalMinutes: m.slotIntervalMinutes,
  minNoticeMinutes: m.minNoticeMinutes,
  maxDaysAhead: m.maxDaysAhead,
  color: m.color,
  isActive: m.isActive,
  ...(bookingCount === undefined ? {} : { bookingCount }),
});

export const toPublicHostDTO = (u: Pick<User, 'name' | 'username' | 'timezone'>): PublicHostDTO => ({
  name: u.name,
  username: u.username,
  timezone: u.timezone,
});

export const toPublicMeetingTypeDTO = (m: MeetingType): PublicMeetingTypeDTO => ({
  title: m.title,
  slug: m.slug,
  description: m.description,
  location: m.location,
  durationMinutes: m.durationMinutes,
  color: m.color,
  maxDaysAhead: m.maxDaysAhead,
});

export const toHostBookingDTO = (b: Booking & { meetingType: MeetingType }): HostBookingDTO => ({
  id: b.id,
  status: b.status,
  startsAt: b.startsAt.toISOString(),
  endsAt: b.endsAt.toISOString(),
  inviteeName: b.inviteeName,
  inviteeEmail: b.inviteeEmail,
  inviteeTimezone: b.inviteeTimezone,
  notes: b.notes,
  meetingType: {
    id: b.meetingType.id,
    title: b.meetingType.title,
    color: b.meetingType.color,
    durationMinutes: b.meetingType.durationMinutes,
  },
  calendar: b.calendarProvider === 'google' || b.calendarProvider === 'mock' ? b.calendarProvider : 'none',
  calendarEventId: b.calendarEventId,
  cancelledAt: b.cancelledAt?.toISOString() ?? null,
  cancelReason: b.cancelReason,
  cancelledBy: b.cancelledBy,
  rescheduleCount: b.rescheduleCount,
  createdAt: b.createdAt.toISOString(),
});

export const toManageBookingDTO = (
  b: Booking & { meetingType: MeetingType; host: User },
  now: Date,
): ManageBookingDTO => ({
  id: b.id,
  status: b.status,
  startsAt: b.startsAt.toISOString(),
  endsAt: b.endsAt.toISOString(),
  inviteeName: b.inviteeName,
  inviteeEmail: b.inviteeEmail,
  inviteeTimezone: b.inviteeTimezone,
  notes: b.notes,
  cancelReason: b.cancelReason,
  rescheduleCount: b.rescheduleCount,
  isPast: b.startsAt <= now,
  host: toPublicHostDTO(b.host),
  meetingType: toPublicMeetingTypeDTO(b.meetingType),
});
