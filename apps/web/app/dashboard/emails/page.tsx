'use client';

import type { EmailLogDTO } from '@meetqueue/core';
import { Inbox, Paperclip, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApiQuery } from '@/lib/use-api';

const STATUS: Record<EmailLogDTO['status'], { tone: 'green' | 'amber' | 'red'; label: string }> = {
  SENT: { tone: 'green', label: 'Sent' },
  LOGGED: { tone: 'amber', label: 'Logged only' },
  FAILED: { tone: 'red', label: 'Failed' },
};

export default function EmailsPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApiQuery<{ emails: EmailLogDTO[] }>('/api/emails');

  return (
    <>
      <PageHeader
        title="Email log"
        description="Every notification MeetQueue sent for your bookings. Manage-link tokens are redacted."
        actions={
          <Button variant="secondary" size="sm" onClick={reload} loading={loading && !!data}>
            <RefreshCw className="size-3.5" aria-hidden /> Refresh
          </Button>
        }
      />
      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock label="Loading emails" />
      ) : data.emails.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-8" aria-hidden />}
          title="No emails yet"
          description="Book a meeting on your public page and the confirmation emails will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {data.emails.map((email) => (
            <li key={email.id}>
              <Card>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{email.subject}</p>
                      <p className="truncate text-sm text-slate-500">
                        To {email.to} ·{' '}
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: user.timezone,
                        }).format(new Date(email.createdAt))}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {email.hasIcs && (
                        <Badge tone="brand">
                          <Paperclip className="size-3" aria-hidden /> .ics
                        </Badge>
                      )}
                      <Badge tone={STATUS[email.status].tone}>{STATUS[email.status].label}</Badge>
                      <Badge>{email.provider}</Badge>
                    </div>
                  </summary>
                  <div className="border-t border-slate-100 p-4">
                    {email.error && <p className="mb-2 text-sm text-red-600">Error: {email.error}</p>}
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-700">{email.bodyText}</pre>
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
