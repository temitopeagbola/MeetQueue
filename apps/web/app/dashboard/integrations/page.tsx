'use client';

import type { IntegrationsDTO } from '@meetqueue/core';
import { CalendarSync, Mail } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  buttonClasses,
  ButtonLink,
  Card,
  ErrorState,
  LoadingBlock,
  PageHeader,
} from '@/components/ui';
import { api } from '@/lib/api';
import { toApiError, useApiQuery } from '@/lib/use-api';

const CALLBACK_MESSAGES: Record<string, { tone: 'success' | 'error'; text: string }> = {
  connected: { tone: 'success', text: 'Calendar connected. New bookings will be added to it.' },
  denied: { tone: 'error', text: 'Google access was not granted, so nothing was connected.' },
  'state-mismatch': {
    tone: 'error',
    text: 'That sign-in link expired or was tampered with. Please try again.',
  },
  error: { tone: 'error', text: 'Connecting the calendar failed. Please try again.' },
};

function CallbackNotice() {
  const status = useSearchParams().get('calendar');
  const message = status ? CALLBACK_MESSAGES[status] : undefined;
  return message ? (
    <Alert tone={message.tone} className="mb-4">
      {message.text}
    </Alert>
  ) : null;
}

export default function IntegrationsPage() {
  const { data, error, reload, mutate } = useApiQuery<IntegrationsDTO>('/api/integrations');
  const [disconnecting, setDisconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function disconnect() {
    setDisconnecting(true);
    setActionError(null);
    try {
      await api('/api/integrations/calendar', { method: 'DELETE' });
      mutate(
        (current) =>
          current && {
            ...current,
            calendar: { ...current.calendar, connected: false, provider: null, accountEmail: null },
          },
      );
    } catch (err) {
      setActionError(toApiError(err).message);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      <PageHeader title="Integrations" description="Where bookings go once they're made." />
      <Suspense>
        <CallbackNotice />
      </Suspense>
      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock label="Loading integrations" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <CalendarSync className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold">Google Calendar</h2>
                <p className="text-sm text-slate-500">
                  Checks your free/busy time and creates an event (with an invite) for every
                  booking.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {data.calendar.connected ? (
                <Badge tone="green">Connected</Badge>
              ) : (
                <Badge>Not connected</Badge>
              )}
              <Badge tone={data.calendar.mode === 'google' ? 'brand' : 'amber'}>
                {data.calendar.mode === 'google' ? 'Google OAuth' : 'Mock provider'}
              </Badge>
              {data.calendar.accountEmail && (
                <span className="truncate text-slate-600">{data.calendar.accountEmail}</span>
              )}
            </div>
            {data.calendar.restriction && <Alert tone="info">{data.calendar.restriction}</Alert>}
            {data.calendar.mode === 'google' && !data.calendar.restriction && (
              <p className="text-xs text-slate-500">
                This Google OAuth app is in testing mode: only Google accounts added as test users
                can connect.
              </p>
            )}
            {actionError && (
              <p role="alert" className="text-sm font-medium text-red-600">
                {actionError}
              </p>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              {/* Must be a full page navigation, not <Link>: this API route redirects to Google's
                  consent screen (or straight back, for the mock provider). */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/integrations/google/connect" className={buttonClasses()}>
                {data.calendar.connected ? 'Reconnect' : 'Connect calendar'}
              </a>
              {data.calendar.connected && (
                <Button variant="secondary" onClick={disconnect} loading={disconnecting}>
                  Disconnect
                </Button>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <Mail className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">Email &amp; .ics invitations</h2>
                <p className="text-sm text-slate-500">
                  Confirmation, reschedule and cancellation emails. When Google hasn’t already sent
                  an invite, an .ics calendar file is attached.
                </p>
              </div>
            </div>
            <div>
              <Badge tone={data.email.mode === 'smtp' ? 'green' : 'amber'}>
                {data.email.mode === 'smtp' ? 'SMTP delivery' : 'Console provider (not delivered)'}
              </Badge>
            </div>
            <p className="text-sm text-slate-600">
              {data.email.mode === 'smtp'
                ? 'Emails are delivered through the configured SMTP server.'
                : 'No SMTP server is configured, so emails are logged instead of sent. You can still read every message in the email log.'}
            </p>
            <div className="mt-auto">
              <ButtonLink href="/dashboard/emails" variant="secondary">
                Open email log
              </ButtonLink>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
