'use client';

import type { ManageBookingDTO } from '@meetqueue/core';
import { ArrowLeft, CalendarClock, Download, Globe2, MapPin, MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SlotPicker } from '@/components/slot-picker';
import {
  Alert,
  Badge,
  Button,
  buttonClasses,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDayLong, formatTime } from '@/lib/format';
import { toApiError, useApiQuery } from '@/lib/use-api';

export function ManageBooking({ token }: { token: string }) {
  const base = `/api/manage/${encodeURIComponent(token)}`;
  const { data, error, reload, mutate } = useApiQuery<{ booking: ManageBookingDTO }>(base);
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  const [timezone, setTimezone] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pickerVersion, setPickerVersion] = useState(0);

  if (error?.status === 404) {
    return (
      <EmptyState
        title="Booking link not recognised"
        description="This manage link is invalid. Use the link from your confirmation email."
      />
    );
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <LoadingBlock label="Loading your booking" />;

  const { booking } = data;
  const tz = timezone ?? booking.inviteeTimezone;
  const canChange = booking.status === 'CONFIRMED' && !booking.isPast;
  const setBooking = (next: ManageBookingDTO) => mutate(() => ({ booking: next }));

  async function reschedule() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await api<{ booking: ManageBookingDTO }>(`${base}/reschedule`, {
        method: 'POST',
        body: { start: pending },
      });
      setBooking(result.booking);
      setPending(null);
      setMode('view');
      setNotice('Your booking has been moved. An updated invitation is on its way.');
    } catch (err) {
      const apiError = toApiError(err);
      setActionError(apiError.message);
      if (apiError.status === 409) {
        setPending(null);
        setPickerVersion((v) => v + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setActionError(null);
    try {
      const result = await api<{ booking: ManageBookingDTO }>(`${base}/cancel`, {
        method: 'POST',
        body: { reason: reason || undefined },
      });
      setBooking(result.booking);
      setCancelOpen(false);
      setNotice('Your booking has been cancelled. We’ve let the host know.');
    } catch (err) {
      setActionError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  const statusBadge =
    booking.status === 'CANCELLED' ? (
      <Badge tone="red">Cancelled</Badge>
    ) : booking.isPast ? (
      <Badge>Past</Badge>
    ) : (
      <Badge tone="green">Confirmed</Badge>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {notice && <Alert tone="success">{notice}</Alert>}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge}
          {booking.rescheduleCount > 0 && <Badge tone="amber">Rescheduled</Badge>}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {booking.meetingType.title} with {booking.host.name}
        </h1>
        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <p className={`flex items-start gap-2 font-medium ${booking.status === 'CANCELLED' ? 'line-through' : ''}`}>
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            {formatTime(booking.startsAt, tz)} – {formatTime(booking.endsAt, tz)}, {formatDayLong(booking.startsAt, tz)}
          </p>
          <p className="flex items-center gap-2 text-slate-600">
            <Globe2 className="size-4 text-slate-400" aria-hidden /> {tz.replace(/_/g, ' ')}
          </p>
          {booking.meetingType.location && (
            <p className="flex items-center gap-2 text-slate-600">
              <MapPin className="size-4 text-slate-400" aria-hidden /> {booking.meetingType.location}
            </p>
          )}
          {booking.notes && (
            <p className="flex items-start gap-2 text-slate-600">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden /> {booking.notes}
            </p>
          )}
          <p className="text-slate-500">Booked by {booking.inviteeName} ({booking.inviteeEmail})</p>
          {booking.cancelReason && <p className="text-slate-500">Cancellation reason: {booking.cancelReason}</p>}
        </div>

        {booking.status === 'CANCELLED' && (
          <div className="mt-6">
            <ButtonLink href={`/${booking.host.username}/${booking.meetingType.slug}`}>Book a new time</ButtonLink>
          </div>
        )}
        {booking.isPast && booking.status === 'CONFIRMED' && (
          <p className="mt-6 text-sm text-slate-500">This meeting has already started or finished, so it can’t be changed.</p>
        )}
        {canChange && mode === 'view' && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => { setMode('reschedule'); setActionError(null); setNotice(null); }}>
              Reschedule
            </Button>
            <Button variant="secondary" onClick={() => { setCancelOpen(true); setActionError(null); setNotice(null); }}>
              Cancel booking
            </Button>
            <a href={`${base}/ics`} className={buttonClasses('ghost')} download>
              <Download className="size-4" aria-hidden /> Download .ics
            </a>
          </div>
        )}
      </Card>

      {canChange && mode === 'reschedule' && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Pick a new time</h2>
            <Button variant="ghost" size="sm" onClick={() => { setMode('view'); setPending(null); }}>
              <ArrowLeft className="size-4" aria-hidden /> Back
            </Button>
          </div>
          {actionError && <Alert className="mb-4">{actionError}</Alert>}
          <SlotPicker
            key={pickerVersion}
            slotsUrl={`${base}/slots`}
            timezone={tz}
            onTimezoneChange={(next) => { setTimezone(next); setPending(null); }}
            maxDaysAhead={booking.meetingType.maxDaysAhead}
            selected={pending}
            onSelect={setPending}
          />
          {pending && (
            <div className="mt-6 flex flex-col gap-3 rounded-lg bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-900">
                Move to {formatTime(pending, tz)}, {formatDayLong(pending, tz)}?
              </p>
              <Button onClick={reschedule} loading={busy}>
                Confirm new time
              </Button>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel this booking?"
        description={`${booking.host.name} will be notified and the time will be released.`}
        confirmLabel="Cancel booking"
        loading={busy}
        error={actionError}
        onConfirm={cancel}
        onClose={() => setCancelOpen(false)}
      >
        <Field label="Reason (optional)">
          {(props) => <Textarea {...props} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </ConfirmDialog>
    </div>
  );
}
