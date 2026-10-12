'use client';

import type { MeetingTypeDTO } from '@meetqueue/core';
import { ExternalLink, LayoutList, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CopyButton } from '@/components/copy-button';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDuration, formatNotice } from '@/lib/format';
import { siteUrl } from '@/lib/site';
import { toApiError, useApiQuery } from '@/lib/use-api';

export default function MeetingTypesPage() {
  const { user } = useAuth();
  const { data, error, reload, mutate } = useApiQuery<{ meetingTypes: MeetingTypeDTO[] }>(
    '/api/meeting-types',
  );
  const [deleting, setDeleting] = useState<MeetingTypeDTO | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function toggle(type: MeetingTypeDTO) {
    setBusy(type.id);
    setToggleError(null);
    try {
      const { meetingType } = await api<{ meetingType: MeetingTypeDTO }>(
        `/api/meeting-types/${type.id}`,
        {
          method: 'PATCH',
          body: { isActive: !type.isActive },
        },
      );
      mutate(
        (current) =>
          current && {
            meetingTypes: current.meetingTypes.map((t) =>
              t.id === type.id ? { ...t, ...meetingType } : t,
            ),
          },
      );
    } catch (err) {
      setToggleError(toApiError(err).message);
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(deleting.id);
    setDeleteError(null);
    try {
      await api(`/api/meeting-types/${deleting.id}`, { method: 'DELETE' });
      mutate(
        (current) =>
          current && { meetingTypes: current.meetingTypes.filter((t) => t.id !== deleting.id) },
      );
      setDeleting(null);
    } catch (err) {
      setDeleteError(toApiError(err).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Meeting types"
        description="Each type gets its own booking link with its own length, buffers and notice."
        actions={
          <ButtonLink href="/dashboard/meeting-types/new">
            <Plus className="size-4" aria-hidden /> New meeting type
          </ButtonLink>
        }
      />
      {toggleError && (
        <p role="alert" className="mb-4 text-sm font-medium text-red-600">
          {toggleError}
        </p>
      )}
      {error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock label="Loading meeting types" />
      ) : data.meetingTypes.length === 0 ? (
        <EmptyState
          icon={<LayoutList className="size-8" aria-hidden />}
          title="No meeting types yet"
          description="Create one to start taking bookings."
          action={
            <ButtonLink href="/dashboard/meeting-types/new">Create a meeting type</ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.meetingTypes.map((type) => {
            const path = `/${user.username}/${type.slug}`;
            return (
              <li key={type.id}>
                <Card className="flex h-full flex-col overflow-hidden">
                  <div className="h-1.5" style={{ backgroundColor: type.color }} aria-hidden />
                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-slate-900">{type.title}</h2>
                        <p className="truncate text-sm text-slate-500">{path}</p>
                      </div>
                      <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          role="switch"
                          className="size-4 accent-brand-600"
                          checked={type.isActive}
                          disabled={busy === type.id}
                          onChange={() => toggle(type)}
                          aria-label={`${type.title} accepts bookings`}
                        />
                        {type.isActive ? 'On' : 'Off'}
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="brand">{formatDuration(type.durationMinutes)}</Badge>
                      {(type.bufferBeforeMinutes > 0 || type.bufferAfterMinutes > 0) && (
                        <Badge>
                          Buffers {type.bufferBeforeMinutes}/{type.bufferAfterMinutes} min
                        </Badge>
                      )}
                      <Badge>{formatNotice(type.minNoticeMinutes)}</Badge>
                      <Badge>Up to {type.maxDaysAhead} days ahead</Badge>
                      {type.bookingCount ? (
                        <Badge tone="green">{type.bookingCount} booked</Badge>
                      ) : null}
                    </div>
                    {type.description && (
                      <p className="line-clamp-2 text-sm text-slate-600">{type.description}</p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-2">
                      <CopyButton value={siteUrl(path)} />
                      <ButtonLink href={path} target="_blank" variant="secondary" size="sm">
                        <ExternalLink className="size-3.5" aria-hidden /> Open
                      </ButtonLink>
                      <ButtonLink
                        href={`/dashboard/meeting-types/${type.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        <Pencil className="size-3.5" aria-hidden /> Edit
                      </ButtonLink>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${type.title}`}
                        onClick={() => {
                          setDeleting(type);
                          setDeleteError(null);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete “${deleting?.title ?? ''}”?`}
        description="Its booking link will stop working. Types with booking history can’t be deleted; switch them off instead."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        loading={busy === deleting?.id}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
