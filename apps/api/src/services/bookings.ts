import {
  bookingHorizon,
  computeBookingTimes,
  generateSlots,
  groupSlotsByDay,
  isSlotAvailable,
  localDateRangeToInstants,
  subtractRange,
  type AvailabilityInput,
  type BookingConfirmationDTO,
  type BookingCreateInput,
  type ManageBookingDTO,
  type SlotsQuery,
  type SlotsResponseDTO,
  type TimeRange,
} from '@meetqueue/core';
import type { Db } from '../db';
import { toManageBookingDTO } from '../dto';
import type { Booking, MeetingType, User } from '../generated/prisma/client';
import { randomToken, sha256 } from '../lib/crypto';
import { badRequest, conflict, isExclusionViolation, notFound } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { CalendarEventInput } from '../providers/calendar/types';
import type { CalendarService } from './calendar';
import type { BookingContext, Notifier } from './notifications';

type FullBooking = Booking & { meetingType: MeetingType; host: User };

const DAY_MS = 86_400_000;
const include = { meetingType: true, host: true } as const;

const SLOT_TAKEN = () =>
  conflict('SLOT_TAKEN', 'Someone just booked that time. Please pick another slot.');
const SLOT_UNAVAILABLE = () =>
  conflict('SLOT_UNAVAILABLE', 'That time is no longer available. Please pick another slot.');

/** Is this Prisma's "record to update not found" (the CONFIRMED guard didn't match)? */
const isNotFoundOnUpdate = (error: unknown) => (error as { code?: string })?.code === 'P2025';

export interface BookingServiceDeps {
  db: Db;
  calendar: CalendarService;
  notifier: Notifier;
  now: () => Date;
  log: Logger;
}

/**
 * Booking lifecycle. Availability is pre-checked with the shared slot engine for a friendly
 * error, but the Postgres exclusion constraint is what actually prevents double-booking under
 * concurrency (SQLSTATE 23P01 → 409 SLOT_TAKEN).
 */
export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  private get db() {
    return this.deps.db;
  }

  async findBookingPage(username: string, slug: string) {
    const host = await this.db.user.findUnique({ where: { username: username.toLowerCase() } });
    const meetingType = host
      ? await this.db.meetingType.findUnique({
          where: { userId_slug: { userId: host.id, slug: slug.toLowerCase() } },
        })
      : null;
    if (!host || !meetingType || !meetingType.isActive) {
      throw notFound('This booking page does not exist or is no longer taking bookings.');
    }
    return { host, meetingType };
  }

  /** Everything the slot engine needs for one host + meeting type around `window`. */
  private async availabilityInput(
    host: User,
    meetingType: MeetingType,
    window: TimeRange,
    exclude?: Booking,
  ): Promise<AvailabilityInput> {
    const [rules, taken, external] = await Promise.all([
      this.db.availabilityRule.findMany({ where: { userId: host.id } }),
      this.db.booking.findMany({
        where: {
          hostId: host.id,
          status: 'CONFIRMED',
          blockedStart: { lt: window.end },
          blockedEnd: { gt: window.start },
          ...(exclude ? { id: { not: exclude.id } } : {}),
        },
        select: { blockedStart: true, blockedEnd: true },
      }),
      this.deps.calendar.busy(host.id, window),
    ]);
    // When rescheduling, the booking's own event shows up in Google free/busy; ignore it.
    const externalBusy = exclude
      ? subtractRange(external, { start: exclude.startsAt, end: exclude.endsAt })
      : external;
    return {
      hostTimezone: host.timezone,
      rules,
      busy: [...taken.map((b) => ({ start: b.blockedStart, end: b.blockedEnd })), ...externalBusy],
      durationMinutes: meetingType.durationMinutes,
      bufferBeforeMinutes: meetingType.bufferBeforeMinutes,
      bufferAfterMinutes: meetingType.bufferAfterMinutes,
      slotIntervalMinutes: meetingType.slotIntervalMinutes,
      minNoticeMinutes: meetingType.minNoticeMinutes,
      maxDaysAhead: meetingType.maxDaysAhead,
      now: this.deps.now(),
    };
  }

  private async slotsFor(
    host: User,
    meetingType: MeetingType,
    query: SlotsQuery,
    exclude?: Booking,
  ): Promise<SlotsResponseDTO> {
    const { rangeStart, rangeEnd } = localDateRangeToInstants(query.start, query.end, query.timezone);
    const now = this.deps.now();
    const horizon = bookingHorizon(now, host.timezone, meetingType.maxDaysAhead);
    const from = Math.max(rangeStart.getTime(), now.getTime());
    const to = Math.min(rangeEnd.getTime(), horizon.getTime() + 1);
    if (from >= to) return { timezone: query.timezone, days: [] };

    // Busy data only matters near the candidate slots (± a day covers any buffer).
    const window = { start: new Date(from - DAY_MS), end: new Date(to + DAY_MS) };
    const input = await this.availabilityInput(host, meetingType, window, exclude);
    const slots = generateSlots({ ...input, rangeStart, rangeEnd });
    return { timezone: query.timezone, days: groupSlotsByDay(slots, query.timezone) };
  }

  async slots(username: string, slug: string, query: SlotsQuery) {
    const { host, meetingType } = await this.findBookingPage(username, slug);
    return this.slotsFor(host, meetingType, query);
  }

  private async assertBookable(
    host: User,
    meetingType: MeetingType,
    start: Date,
    exclude?: Booking,
  ) {
    const times = computeBookingTimes(start, meetingType);
    const window = {
      start: new Date(times.blockedStart.getTime() - DAY_MS),
      end: new Date(times.blockedEnd.getTime() + DAY_MS),
    };
    const input = await this.availabilityInput(host, meetingType, window, exclude);
    if (!isSlotAvailable(input, start)) throw SLOT_UNAVAILABLE();
    return times;
  }

  private eventInput(booking: FullBooking): CalendarEventInput {
    return {
      bookingId: booking.id,
      summary: `${booking.meetingType.title} with ${booking.inviteeName}`,
      description: [
        booking.notes ? `Notes from ${booking.inviteeName}: ${booking.notes}` : '',
        `Booked via MeetQueue · ${booking.inviteeEmail}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      location: booking.meetingType.location,
      start: booking.startsAt,
      end: booking.endsAt,
      timezone: booking.host.timezone,
      attendee: { name: booking.inviteeName, email: booking.inviteeEmail },
    };
  }

  private context(booking: FullBooking): BookingContext {
    return { booking, host: booking.host, meetingType: booking.meetingType };
  }

  /** Notifications are best-effort: a mail outage must not turn a saved booking into a 500. */
  private async safely(task: () => Promise<void>, what: string) {
    try {
      await task();
    } catch (error) {
      this.deps.log.error({ err: error }, `${what} failed`);
    }
  }

  async create(
    username: string,
    slug: string,
    input: BookingCreateInput,
  ): Promise<BookingConfirmationDTO> {
    const { host, meetingType } = await this.findBookingPage(username, slug);
    const start = new Date(input.start);
    const times = await this.assertBookable(host, meetingType, start);

    const manageToken = randomToken();
    let booking: FullBooking;
    try {
      booking = await this.db.booking.create({
        data: {
          hostId: host.id,
          meetingTypeId: meetingType.id,
          inviteeName: input.name,
          inviteeEmail: input.email,
          inviteeTimezone: input.timezone,
          notes: input.notes || null,
          ...times,
          manageTokenHash: sha256(manageToken),
        },
        include,
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw SLOT_TAKEN();
      throw error;
    }

    const sync = await this.deps.calendar.createEvent(host.id, this.eventInput(booking));
    if (sync) {
      booking = await this.db.booking.update({
        where: { id: booking.id },
        data: { calendarProvider: sync.provider, calendarEventId: sync.eventId },
        include,
      });
    }
    const inviteSent = sync?.inviteSent ?? false;
    const confirmed = booking;
    await this.safely(
      () => this.deps.notifier.bookingConfirmed(this.context(confirmed), { manageToken, inviteSent }),
      'confirmation email',
    );

    return {
      booking: toManageBookingDTO(booking, this.deps.now()),
      manageToken,
      calendar: { provider: sync?.provider ?? 'none', inviteSent },
    };
  }

  private async byToken(token: string): Promise<FullBooking> {
    const booking =
      token.length >= 20 && token.length <= 100
        ? await this.db.booking.findUnique({ where: { manageTokenHash: sha256(token) }, include })
        : null;
    if (!booking) throw notFound('This booking link is invalid.');
    return booking;
  }

  private assertChangeable(booking: Booking) {
    if (booking.status === 'CANCELLED') {
      throw conflict('BOOKING_CANCELLED', 'This booking has already been cancelled.');
    }
    if (booking.startsAt <= this.deps.now()) {
      throw conflict('BOOKING_IN_PAST', 'This booking has already started or finished.');
    }
  }

  async getByToken(token: string): Promise<ManageBookingDTO> {
    return toManageBookingDTO(await this.byToken(token), this.deps.now());
  }

  async slotsForReschedule(token: string, query: SlotsQuery): Promise<SlotsResponseDTO> {
    const booking = await this.byToken(token);
    this.assertChangeable(booking);
    return this.slotsFor(booking.host, booking.meetingType, query, booking);
  }

  async reschedule(token: string, startIso: string): Promise<ManageBookingDTO> {
    const current = await this.byToken(token);
    this.assertChangeable(current);
    const start = new Date(startIso);
    if (start.getTime() === current.startsAt.getTime()) {
      throw badRequest('Pick a different time to reschedule.');
    }
    const times = await this.assertBookable(current.host, current.meetingType, start, current);

    let booking: FullBooking;
    try {
      booking = await this.db.booking.update({
        where: { id: current.id, status: 'CONFIRMED' },
        data: { ...times, icsSequence: { increment: 1 }, rescheduleCount: { increment: 1 } },
        include,
      });
    } catch (error) {
      if (isExclusionViolation(error)) throw SLOT_TAKEN();
      if (isNotFoundOnUpdate(error)) this.assertChangeable({ ...current, status: 'CANCELLED' });
      throw error;
    }

    let inviteSent = false;
    if (booking.calendarProvider && booking.calendarEventId) {
      inviteSent = await this.deps.calendar.updateEvent(
        booking.hostId,
        booking.calendarProvider,
        booking.calendarEventId,
        this.eventInput(booking),
      );
    } else {
      const sync = await this.deps.calendar.createEvent(booking.hostId, this.eventInput(booking));
      if (sync) {
        inviteSent = sync.inviteSent;
        booking = await this.db.booking.update({
          where: { id: booking.id },
          data: { calendarProvider: sync.provider, calendarEventId: sync.eventId },
          include,
        });
      }
    }

    const updated = booking;
    await this.safely(
      () =>
        this.deps.notifier.bookingRescheduled(this.context(updated), {
          manageToken: token,
          previousStart: current.startsAt,
          previousEnd: current.endsAt,
          inviteSent,
        }),
      'reschedule email',
    );
    return toManageBookingDTO(booking, this.deps.now());
  }

  private async cancel(current: FullBooking, by: 'HOST' | 'INVITEE', reason?: string) {
    this.assertChangeable(current);
    let booking: FullBooking;
    try {
      booking = await this.db.booking.update({
        where: { id: current.id, status: 'CONFIRMED' },
        data: {
          status: 'CANCELLED',
          cancelledAt: this.deps.now(),
          cancelledBy: by,
          cancelReason: reason || null,
          icsSequence: { increment: 1 },
        },
        include,
      });
    } catch (error) {
      if (isNotFoundOnUpdate(error)) this.assertChangeable({ ...current, status: 'CANCELLED' });
      throw error;
    }

    const inviteSent =
      booking.calendarProvider && booking.calendarEventId
        ? await this.deps.calendar.deleteEvent(
            booking.hostId,
            booking.calendarProvider,
            booking.calendarEventId,
          )
        : false;
    const cancelled = booking;
    await this.safely(
      () =>
        this.deps.notifier.bookingCancelled(this.context(cancelled), {
          by,
          reason: reason || null,
          inviteSent,
        }),
      'cancellation email',
    );
    return booking;
  }

  async cancelByInvitee(token: string, reason?: string): Promise<ManageBookingDTO> {
    const booking = await this.cancel(await this.byToken(token), 'INVITEE', reason);
    return toManageBookingDTO(booking, this.deps.now());
  }

  async cancelByHost(hostId: string, bookingId: string, reason?: string) {
    const current = await this.db.booking.findFirst({ where: { id: bookingId, hostId }, include });
    if (!current) throw notFound('Booking not found.');
    return this.cancel(current, 'HOST', reason);
  }

  async icsByToken(token: string): Promise<string> {
    const booking = await this.byToken(token);
    return this.deps.notifier.downloadIcs(this.context(booking), booking.status === 'CANCELLED');
  }
}
