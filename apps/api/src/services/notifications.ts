import { buildIcs, formatRangeInZone, type IcsMethod } from '@meetqueue/core';
import type { Db } from '../db';
import type { Logger } from '../lib/logger';
import type { EmailMessage, EmailProvider } from '../providers/email/types';

export interface BookingContext {
  booking: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    inviteeName: string;
    inviteeEmail: string;
    inviteeTimezone: string;
    notes: string | null;
    icsSequence: number;
  };
  host: { id: string; name: string; email: string; timezone: string; isDemo: boolean };
  meetingType: { title: string; location: string | null };
}

type Kind =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_RESCHEDULED'
  | 'BOOKING_CANCELLED'
  | 'HOST_BOOKING_CONFIRMED'
  | 'HOST_BOOKING_RESCHEDULED'
  | 'HOST_BOOKING_CANCELLED';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Turns plain-text paragraphs into a small, inline-styled HTML email. */
function toHtml(heading: string, paragraphs: string[], cta?: { label: string; url: string }) {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const button = cta
    ? `<p style="margin:20px 0"><a href="${escapeHtml(cta.url)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>${body}${button}<p style="color:#64748b;font-size:12px;margin-top:24px">Sent by MeetQueue</p></body></html>`;
}

export class Notifier {
  constructor(
    private readonly db: Db,
    private readonly provider: EmailProvider,
    private readonly fallbackProvider: EmailProvider,
    private readonly webOrigin: string,
    private readonly log: Logger,
  ) {}

  manageUrl(token: string) {
    return `${this.webOrigin}/manage/${token}`;
  }

  private ics(ctx: BookingContext, method: IcsMethod, manageUrl?: string) {
    const { booking, host, meetingType } = ctx;
    return buildIcs({
      uid: `${booking.id}@meetqueue`,
      sequence: booking.icsSequence,
      method,
      start: booking.startsAt,
      end: booking.endsAt,
      summary: `${meetingType.title}: ${booking.inviteeName} & ${host.name}`,
      description: [booking.notes ? `Notes: ${booking.notes}` : '', manageUrl ? `Manage: ${manageUrl}` : '']
        .filter(Boolean)
        .join('\n'),
      location: meetingType.location ?? undefined,
      organizer: { name: host.name, email: host.email },
      attendee: { name: booking.inviteeName, email: booking.inviteeEmail },
    });
  }

  /** ICS file for the "Add to calendar" download. */
  downloadIcs(ctx: BookingContext, cancelled: boolean) {
    return this.ics(ctx, cancelled ? 'CANCEL' : 'PUBLISH');
  }

  private async deliver(
    ctx: BookingContext,
    kind: Kind,
    message: EmailMessage,
    redact?: string,
  ): Promise<void> {
    // Never email the shared demo host's placeholder inbox.
    const toDemoHost = ctx.host.isDemo && message.to === ctx.host.email;
    const provider = toDemoHost ? this.fallbackProvider : this.provider;
    const bodyText = redact ? message.text.split(redact).join('[manage link token]') : message.text;
    let status: 'SENT' | 'LOGGED' | 'FAILED';
    let error: string | null = null;
    try {
      status = await provider.send(message);
    } catch (err) {
      status = 'FAILED';
      error = err instanceof Error ? err.message : String(err);
      this.log.error({ err, kind, bookingId: ctx.booking.id }, 'email delivery failed');
    }
    await this.db.emailLog.create({
      data: {
        userId: ctx.host.id,
        bookingId: ctx.booking.id,
        to: message.to,
        subject: message.subject,
        kind,
        provider: provider.name,
        status,
        hasIcs: !!message.ics,
        bodyText,
        error,
      },
    });
  }

  async bookingConfirmed(ctx: BookingContext, opts: { manageToken: string; inviteSent: boolean }) {
    const { booking, host, meetingType } = ctx;
    const manageUrl = this.manageUrl(opts.manageToken);
    const when = formatRangeInZone(booking.startsAt, booking.endsAt, booking.inviteeTimezone);
    const lines = [
      `Hi ${booking.inviteeName},`,
      `Your ${meetingType.title} with ${host.name} is confirmed.`,
      `When: ${when}${meetingType.location ? `\nWhere: ${meetingType.location}` : ''}`,
      opts.inviteSent
        ? `${host.name}'s Google Calendar has sent you an invitation.`
        : 'A calendar invitation (.ics) is attached.',
      `Need to change something? Reschedule or cancel here: ${manageUrl}`,
    ];
    await this.deliver(
      ctx,
      'BOOKING_CONFIRMED',
      {
        to: booking.inviteeEmail,
        subject: `Confirmed: ${meetingType.title} with ${host.name}`,
        text: lines.join('\n\n'),
        html: toHtml('Your booking is confirmed', lines.slice(0, -1), {
          label: 'Reschedule or cancel',
          url: manageUrl,
        }),
        ics: opts.inviteSent ? undefined : { method: 'REQUEST', content: this.ics(ctx, 'REQUEST', manageUrl) },
      },
      opts.manageToken,
    );
    await this.notifyHost(ctx, 'HOST_BOOKING_CONFIRMED', `New booking: ${meetingType.title} with ${booking.inviteeName}`, [
      `${booking.inviteeName} (${booking.inviteeEmail}) booked ${meetingType.title}.`,
      `When: ${formatRangeInZone(booking.startsAt, booking.endsAt, host.timezone)}`,
      booking.notes ? `Notes: ${booking.notes}` : '',
    ], opts.inviteSent);
  }

  async bookingRescheduled(
    ctx: BookingContext,
    opts: { manageToken: string; previousStart: Date; previousEnd: Date; inviteSent: boolean },
  ) {
    const { booking, host, meetingType } = ctx;
    const manageUrl = this.manageUrl(opts.manageToken);
    const tz = booking.inviteeTimezone;
    const lines = [
      `Hi ${booking.inviteeName},`,
      `Your ${meetingType.title} with ${host.name} has moved.`,
      `New time: ${formatRangeInZone(booking.startsAt, booking.endsAt, tz)}\nWas: ${formatRangeInZone(opts.previousStart, opts.previousEnd, tz)}`,
      opts.inviteSent
        ? 'Your Google Calendar invitation has been updated.'
        : 'An updated calendar invitation (.ics) is attached.',
      `Manage your booking: ${manageUrl}`,
    ];
    await this.deliver(
      ctx,
      'BOOKING_RESCHEDULED',
      {
        to: booking.inviteeEmail,
        subject: `Rescheduled: ${meetingType.title} with ${host.name}`,
        text: lines.join('\n\n'),
        html: toHtml('Your booking has moved', lines.slice(0, -1), {
          label: 'Manage booking',
          url: manageUrl,
        }),
        ics: opts.inviteSent ? undefined : { method: 'REQUEST', content: this.ics(ctx, 'REQUEST', manageUrl) },
      },
      opts.manageToken,
    );
    await this.notifyHost(ctx, 'HOST_BOOKING_RESCHEDULED', `Rescheduled: ${meetingType.title} with ${booking.inviteeName}`, [
      `${booking.inviteeName} moved their ${meetingType.title}.`,
      `New time: ${formatRangeInZone(booking.startsAt, booking.endsAt, host.timezone)}`,
      `Was: ${formatRangeInZone(opts.previousStart, opts.previousEnd, host.timezone)}`,
    ], opts.inviteSent);
  }

  async bookingCancelled(
    ctx: BookingContext,
    opts: { by: 'HOST' | 'INVITEE'; reason: string | null; inviteSent: boolean },
  ) {
    const { booking, host, meetingType } = ctx;
    const who = opts.by === 'HOST' ? host.name : booking.inviteeName;
    const reason = opts.reason ? `Reason: ${opts.reason}` : '';
    const lines = [
      `Hi ${booking.inviteeName},`,
      `Your ${meetingType.title} with ${host.name} on ${formatRangeInZone(booking.startsAt, booking.endsAt, booking.inviteeTimezone)} was cancelled by ${who}.`,
      reason,
      `You can book a new time at ${this.webOrigin}`,
    ].filter(Boolean);
    await this.deliver(ctx, 'BOOKING_CANCELLED', {
      to: booking.inviteeEmail,
      subject: `Cancelled: ${meetingType.title} with ${host.name}`,
      text: lines.join('\n\n'),
      html: toHtml('Booking cancelled', lines),
      ics: opts.inviteSent ? undefined : { method: 'CANCEL', content: this.ics(ctx, 'CANCEL') },
    });
    await this.notifyHost(ctx, 'HOST_BOOKING_CANCELLED', `Cancelled: ${meetingType.title} with ${booking.inviteeName}`, [
      `${meetingType.title} with ${booking.inviteeName} on ${formatRangeInZone(booking.startsAt, booking.endsAt, host.timezone)} was cancelled by ${who}.`,
      reason,
    ], opts.inviteSent, 'CANCEL');
  }

  private async notifyHost(
    ctx: BookingContext,
    kind: Kind,
    subject: string,
    paragraphs: string[],
    calendarHandled: boolean,
    method: 'REQUEST' | 'CANCEL' = 'REQUEST',
  ) {
    const lines = paragraphs.filter(Boolean);
    lines.push(`Dashboard: ${this.webOrigin}/dashboard`);
    await this.deliver(ctx, kind, {
      to: ctx.host.email,
      subject,
      text: lines.join('\n\n'),
      html: toHtml(subject, lines),
      // When Google already holds the event, the host doesn't need an ICS copy.
      ics: calendarHandled ? undefined : { method, content: this.ics(ctx, method) },
    });
  }
}
