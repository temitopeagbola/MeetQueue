'use client';

import {
  bookingCreateSchema,
  type BookingConfirmationDTO,
  type PublicMeetingTypePageDTO,
} from '@meetqueue/core';
import { ArrowLeft, CalendarCheck2, Clock3, Download, Globe2, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Initials } from '@/components/public-shell';
import { SlotPicker } from '@/components/slot-picker';
import {
  Alert,
  Button,
  buttonClasses,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  Textarea,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDayLong, formatDuration, formatTime } from '@/lib/format';
import { fieldErrorsFrom, validate, type FieldErrors } from '@/lib/forms';
import { guessTimeZone } from '@/lib/timezones';
import { toApiError, useApiQuery } from '@/lib/use-api';

function SlotSummary({
  start,
  durationMinutes,
  timezone,
}: {
  start: string;
  durationMinutes: number;
  timezone: string;
}) {
  const end = new Date(new Date(start).getTime() + durationMinutes * 60_000).toISOString();
  return (
    <p className="flex items-start gap-2 text-sm font-medium text-slate-900">
      <CalendarCheck2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
      <span>
        {formatTime(start, timezone)} – {formatTime(end, timezone)},{' '}
        {formatDayLong(start, timezone)}
      </span>
    </p>
  );
}

export function BookingFlow({ username, slug }: { username: string; slug: string }) {
  const base = `/api/public/users/${encodeURIComponent(username)}/meeting-types/${encodeURIComponent(slug)}`;
  const page = useApiQuery<PublicMeetingTypePageDTO>(base);
  const [timezone, setTimezone] = useState(guessTimeZone);
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<'pick' | 'details'>('pick');
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [form, setForm] = useState({ name: '', email: '', notes: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmationDTO | null>(null);

  if (page.error?.status === 404) {
    return (
      <EmptyState
        title="This booking page isn’t available"
        description="The link may be wrong, or the host has stopped taking bookings for this meeting."
        action={
          <ButtonLink href={`/${username}`} variant="secondary">
            See other meeting types
          </ButtonLink>
        }
      />
    );
  }
  if (page.error) return <ErrorState message={page.error.message} onRetry={page.reload} />;
  if (!page.data) return <LoadingBlock label="Loading booking page" />;

  const { host, meetingType } = page.data;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const result = validate(bookingCreateSchema, {
      start: selected,
      timezone,
      name: form.name,
      email: form.email,
      notes: form.notes || undefined,
    });
    setErrors(result.errors ?? {});
    setFormError(null);
    if (!result.data) return;
    setSubmitting(true);
    try {
      setConfirmation(
        await api<BookingConfirmationDTO>(`${base}/bookings`, {
          method: 'POST',
          body: result.data,
        }),
      );
    } catch (err) {
      const error = toApiError(err);
      if (error.status === 409) {
        // Lost a race (or the slot expired): send them back to pick another time.
        setSelected(null);
        setStep('pick');
        setSlotsVersion((v) => v + 1);
      }
      setErrors(fieldErrorsFrom(error));
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    const { booking, manageToken, calendar } = confirmation;
    return (
      <Card className="mx-auto max-w-lg p-6 text-center sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <CalendarCheck2 className="size-6" aria-hidden />
        </span>
        <h1
          className="mt-4 text-2xl font-semibold tracking-tight"
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          You’re booked!
        </h1>
        <p className="mt-2 text-slate-600">
          {meetingType.title} with {host.name}
        </p>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-left">
          <SlotSummary
            start={booking.startsAt}
            durationMinutes={meetingType.durationMinutes}
            timezone={booking.inviteeTimezone}
          />
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <Globe2 className="size-4 text-slate-400" aria-hidden />{' '}
            {booking.inviteeTimezone.replace(/_/g, ' ')}
          </p>
          {meetingType.location && (
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="size-4 text-slate-400" aria-hidden /> {meetingType.location}
            </p>
          )}
        </div>
        <p className="mt-4 text-sm text-slate-600">
          {calendar.inviteSent
            ? `A Google Calendar invitation is on its way to ${booking.inviteeEmail}.`
            : `A confirmation with a calendar invite (.ics) was sent to ${booking.inviteeEmail}.`}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <a
            href={`/api/manage/${manageToken}/ics`}
            className={buttonClasses('secondary')}
            download
          >
            <Download className="size-4" aria-hidden /> Add to calendar
          </a>
          <Link href={`/manage/${manageToken}`} className={buttonClasses('primary')}>
            Reschedule or cancel
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Keep the manage link private: anyone with it can change this booking.
        </p>
      </Card>
    );
  }

  return (
    <Card className="grid overflow-hidden md:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="border-b border-slate-200 p-6 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3">
          <Initials name={host.name} color={meetingType.color} />
          <div className="min-w-0">
            <Link href={`/${host.username}`} className="text-sm text-slate-500 hover:underline">
              {host.name}
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              {meetingType.title}
            </h1>
          </div>
        </div>
        <ul className="mt-5 space-y-2 text-sm text-slate-600">
          <li className="flex items-center gap-2">
            <Clock3 className="size-4 text-slate-400" aria-hidden />{' '}
            {formatDuration(meetingType.durationMinutes)}
          </li>
          {meetingType.location && (
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-slate-400" aria-hidden /> {meetingType.location}
            </li>
          )}
        </ul>
        {meetingType.description && (
          <p className="mt-4 text-sm text-slate-600">{meetingType.description}</p>
        )}
        {step === 'details' && selected && (
          <div className="mt-6 rounded-lg bg-brand-50 p-3">
            <SlotSummary
              start={selected}
              durationMinutes={meetingType.durationMinutes}
              timezone={timezone}
            />
          </div>
        )}
      </aside>

      <section className="p-6" aria-label={step === 'pick' ? 'Choose a time' : 'Your details'}>
        {formError && (
          <Alert
            className="mb-4"
            title={step === 'pick' ? 'Please choose another time' : undefined}
          >
            {formError}
          </Alert>
        )}
        {step === 'pick' ? (
          <>
            <h2 className="mb-4 text-lg font-semibold">Select a date &amp; time</h2>
            <SlotPicker
              key={slotsVersion}
              slotsUrl={`${base}/slots`}
              timezone={timezone}
              onTimezoneChange={(tz) => {
                setTimezone(tz);
                setSelected(null);
              }}
              maxDaysAhead={meetingType.maxDaysAhead}
              selected={selected}
              onSelect={(slot) => {
                setSelected(slot);
                setFormError(null);
                setStep('details');
              }}
            />
          </>
        ) : (
          <form onSubmit={submit} noValidate className="max-w-md space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('pick')} className="-ml-2">
              <ArrowLeft className="size-4" aria-hidden /> Change time
            </Button>
            <h2 className="text-lg font-semibold">Enter your details</h2>
            <Field label="Name" error={errors.name}>
              {(props) => (
                <Input
                  {...props}
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              )}
            </Field>
            <Field
              label="Email"
              error={errors.email}
              hint="We’ll send the confirmation and calendar invite here."
            >
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              )}
            </Field>
            <Field label="Anything to share before the meeting? (optional)" error={errors.notes}>
              {(props) => (
                <Textarea
                  {...props}
                  maxLength={1000}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              )}
            </Field>
            <Button type="submit" size="lg" className="w-full sm:w-auto" loading={submitting}>
              Confirm booking
            </Button>
          </form>
        )}
      </section>
    </Card>
  );
}
