'use client';

import type { HostBookingDTO } from '@meetqueue/core';
import { CalendarX2, Globe2, MessageSquareText, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  cx,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  PageHeader,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDayLong, formatTime } from '@/lib/format';
import { siteUrl } from '@/lib/site';
import { toApiError, useApiQuery } from '@/lib/use-api';

type Scope = 'upcoming' | 'past' | 'cancelled';
interface BookingList {
  bookings: HostBookingDTO[];
  counts: Record<Scope, number>;
}

const tabs: { scope: Scope; label: string }[] = [
  { scope: 'upcoming', label: 'Upcoming' },
  { scope: 'past', label: 'Past' },
  { scope: 'cancelled', label: 'Cancelled' },
];

function CalendarBadge({ booking }: { booking: HostBookingDTO }) {
  if (booking.calendar === 'google') return <Badge tone="green">Google Calendar</Badge>;
  if (booking.calendar === 'mock') return <Badge tone="brand">Mock calendar</Badge>;
  return <Badge>ICS only</Badge>;
}

function groupByDay(bookings: HostBookingDTO[], timezone: string) {
  const groups = new Map<string, HostBookingDTO[]>();
  for (const booking of bookings) {
    const day = formatDayLong(booking.startsAt, timezone);
    groups.set(day, [...(groups.get(day) ?? []), booking]);
  }
  return [...groups.entries()];
}

export default function BookingsPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>('upcoming');
  const { data, error, loading, reload } = useApiQuery<BookingList>(`/api/bookings?scope=${scope}`);
  const [cancelling, setCancelling] = useState<HostBookingDTO | null>(null);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const publicPath = `/${user.username}`;

  async function confirmCancel() {
    if (!cancelling) return;
    setSubmitting(true);
    setCancelError(null);
    try {
      await api(`/api/bookings/${cancelling.id}/cancel`, {
        method: 'POST',
        body: { reason: reason || undefined },
      });
      setCancelling(null);
      setReason('');
      reload();
    } catch (err) {
      setCancelError(toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        description={`Times shown in your timezone, ${user.timezone.replace(/_/g, ' ')}.`}
        actions={
          <Button variant="secondary" size="sm" onClick={reload} loading={loading && !!data}>
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </Button>
        }
      />

      <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">Your booking page</p>
          <p className="truncate text-sm text-slate-500">{siteUrl(publicPath)}</p>
        </div>
        <div className="flex gap-2">
          <CopyButton value={siteUrl(publicPath)} />
          <ButtonLink href={publicPath} target="_blank" variant="secondary" size="sm">
            Open
          </ButtonLink>
        </div>
      </Card>

      <div
        role="group"
        aria-label="Filter bookings"
        className="mb-4 flex gap-1 rounded-lg bg-slate-200/60 p-1 sm:w-fit"
      >
        {tabs.map((tab) => (
          <button
            key={tab.scope}
            type="button"
            aria-pressed={scope === tab.scope}
            onClick={() => setScope(tab.scope)}
            className={cx(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none',
              scope === tab.scope
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {tab.label}
            {data && (
              <span className="ml-1.5 text-xs text-slate-500">{data.counts[tab.scope]}</span>
            )}
          </button>
        ))}
      </div>

      <div>
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : !data ? (
          <LoadingBlock label="Loading bookings" />
        ) : data.bookings.length === 0 ? (
          <EmptyState
            icon={<CalendarX2 className="size-8" aria-hidden />}
            title={scope === 'upcoming' ? 'No upcoming bookings' : `No ${scope} bookings`}
            description={
              scope === 'upcoming'
                ? 'Share your booking page and new meetings will show up here.'
                : 'Nothing to show yet.'
            }
            action={
              scope === 'upcoming' && (
                <ButtonLink href={publicPath} target="_blank" size="sm">
                  Open your booking page
                </ButtonLink>
              )
            }
          />
        ) : (
          <div className="space-y-6">
            {groupByDay(data.bookings, user.timezone).map(([day, bookings]) => (
              <section key={day} aria-label={day}>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">{day}</h2>
                <ul className="space-y-3">
                  {bookings.map((booking) => (
                    <li key={booking.id}>
                      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                        <div className="flex shrink-0 items-center gap-3 sm:w-40">
                          <span
                            className="h-10 w-1 rounded-full"
                            style={{ backgroundColor: booking.meetingType.color }}
                            aria-hidden
                          />
                          <p
                            className={cx(
                              'text-sm font-semibold',
                              booking.status === 'CANCELLED' && 'text-slate-400 line-through',
                            )}
                          >
                            {formatTime(booking.startsAt, user.timezone)} –{' '}
                            {formatTime(booking.endsAt, user.timezone)}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="font-medium text-slate-900">
                            {booking.inviteeName}{' '}
                            <span className="font-normal text-slate-500">
                              · {booking.meetingType.title}
                            </span>
                          </p>
                          <p className="truncate text-sm text-slate-500">{booking.inviteeEmail}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <CalendarBadge booking={booking} />
                            {booking.rescheduleCount > 0 && <Badge tone="amber">Rescheduled</Badge>}
                            {booking.status === 'CANCELLED' && (
                              <Badge tone="red">
                                Cancelled by {booking.cancelledBy === 'HOST' ? 'you' : 'invitee'}
                              </Badge>
                            )}
                            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                              <Globe2 className="size-3" aria-hidden />
                              {booking.inviteeTimezone.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {booking.notes && (
                            <p className="flex gap-1.5 text-sm text-slate-600">
                              <MessageSquareText
                                className="mt-0.5 size-3.5 shrink-0 text-slate-400"
                                aria-hidden
                              />
                              {booking.notes}
                            </p>
                          )}
                          {booking.cancelReason && (
                            <p className="text-sm text-slate-500">Reason: {booking.cancelReason}</p>
                          )}
                        </div>
                        {scope === 'upcoming' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setCancelling(booking);
                              setCancelError(null);
                            }}
                            aria-label={`Cancel booking with ${booking.inviteeName}`}
                          >
                            Cancel
                          </Button>
                        )}
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!cancelling}
        title="Cancel this booking?"
        description={
          cancelling && (
            <>
              {cancelling.inviteeName} will get a cancellation email
              {cancelling.calendar !== 'none' ? ' and the calendar event will be removed' : ''}.
            </>
          )
        }
        confirmLabel="Cancel booking"
        loading={submitting}
        error={cancelError}
        onConfirm={confirmCancel}
        onClose={() => setCancelling(null)}
      >
        <Field label="Reason (optional)">
          {(props) => (
            <Textarea
              {...props}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </Field>
      </ConfirmDialog>
    </>
  );
}
