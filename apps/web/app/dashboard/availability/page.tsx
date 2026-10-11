'use client';

import { availabilityUpdateSchema, minutesToTime, type AvailabilityDTO } from '@meetqueue/core';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TimezoneSelect } from '@/components/timezone-select';
import {
  Alert,
  Button,
  Card,
  cx,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  endToInput,
  endToMinutes,
  intervalProblem,
  nextInterval,
  startToMinutes,
  type Interval,
} from '@/lib/availability-draft';
import { validate } from '@/lib/forms';
import { toApiError, useApiQuery } from '@/lib/use-api';

const DAYS = [
  { weekday: 1, name: 'Monday' },
  { weekday: 2, name: 'Tuesday' },
  { weekday: 3, name: 'Wednesday' },
  { weekday: 4, name: 'Thursday' },
  { weekday: 5, name: 'Friday' },
  { weekday: 6, name: 'Saturday' },
  { weekday: 0, name: 'Sunday' },
];

interface Draft {
  timezone: string;
  days: Record<number, Interval[]>;
}

function toDraft(dto: AvailabilityDTO): Draft {
  const days: Record<number, Interval[]> = {};
  for (const { weekday } of DAYS) days[weekday] = [];
  for (const rule of dto.rules) {
    days[rule.weekday]!.push({
      start: minutesToTime(rule.startMinute),
      end: endToInput(rule.endMinute),
    });
  }
  return { timezone: dto.timezone, days };
}

function toPayload(draft: Draft) {
  return {
    timezone: draft.timezone,
    rules: DAYS.flatMap(({ weekday }) =>
      // Only called once every interval passed intervalProblem().
      (draft.days[weekday] ?? []).map((i) => ({
        weekday,
        startMinute: startToMinutes(i.start)!,
        endMinute: endToMinutes(i.end)!,
      })),
    ),
  };
}

export default function AvailabilityPage() {
  const { refresh: refreshUser } = useAuth();
  const { data, error, reload, mutate } = useApiQuery<AvailabilityDTO>('/api/availability');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <LoadingBlock label="Loading availability" />;

  const current = draft ?? toDraft(data);
  const dirty = draft !== null;
  const update = (next: Draft) => {
    setDraft(next);
    setStatus(null);
  };
  const setDay = (weekday: number, intervals: Interval[]) =>
    update({ ...current, days: { ...current.days, [weekday]: intervals } });

  async function save() {
    const invalid = DAYS.some(({ weekday }) =>
      (current.days[weekday] ?? []).some((i) => intervalProblem(i) !== null),
    );
    if (invalid) {
      setStatus({
        tone: 'error',
        message: 'Fix the highlighted hours: each window needs a start and an end, in order.',
      });
      return;
    }
    const result = validate(availabilityUpdateSchema, toPayload(current));
    if (!result.data) {
      setStatus({
        tone: 'error',
        message: Object.values(result.errors ?? {})[0] ?? 'Please fix the highlighted hours.',
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await api<AvailabilityDTO>('/api/availability', {
        method: 'PUT',
        body: result.data,
      });
      mutate(() => saved);
      setDraft(null);
      // The dashboard renders times in the host's timezone, which may just have changed.
      refreshUser();
      setStatus({
        tone: 'success',
        message: 'Availability saved. Your booking page is up to date.',
      });
    } catch (err) {
      setStatus({ tone: 'error', message: toApiError(err).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Availability"
        description="When people can book you each week. Buffers and notice are set per meeting type."
        actions={
          <>
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setStatus(null);
                }}
              >
                Discard
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty}>
              Save changes
            </Button>
          </>
        }
      />

      {status && (
        <Alert tone={status.tone} className="mb-4">
          {status.message}
        </Alert>
      )}

      <Card className="mb-6 p-4 sm:p-6">
        <Field
          label="Timezone"
          hint="Your weekly hours are interpreted in this timezone, including daylight saving changes."
        >
          {(props) => (
            <TimezoneSelect
              {...props}
              className="sm:max-w-sm"
              value={current.timezone}
              onChange={(timezone) => update({ ...current, timezone })}
            />
          )}
        </Field>
      </Card>

      <Card className="divide-y divide-slate-100">
        {DAYS.map(({ weekday, name }) => {
          const intervals = current.days[weekday] ?? [];
          const enabled = intervals.length > 0;
          return (
            <div
              key={weekday}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5"
            >
              <label className="flex w-36 shrink-0 items-center gap-3 pt-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 rounded border-slate-300 accent-brand-600"
                  checked={enabled}
                  onChange={(e) =>
                    setDay(weekday, e.target.checked ? [{ start: '09:00', end: '17:00' }] : [])
                  }
                />
                {name}
              </label>
              <div className="flex-1 space-y-2">
                {!enabled && <p className="pt-2 text-sm text-slate-400">Unavailable</p>}
                {intervals.map((interval, index) => {
                  const problem = intervalProblem(interval);
                  const bad = problem !== null;
                  const change = (patch: Partial<Interval>) =>
                    setDay(
                      weekday,
                      intervals.map((i, j) => (j === index ? { ...i, ...patch } : i)),
                    );
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        step={900}
                        aria-label={`${name} window ${index + 1} start`}
                        aria-invalid={bad || undefined}
                        className="w-32"
                        value={interval.start}
                        onChange={(e) => change({ start: e.target.value })}
                      />
                      <span className="text-slate-400" aria-hidden>
                        –
                      </span>
                      <Input
                        type="time"
                        step={900}
                        aria-label={`${name} window ${index + 1} end`}
                        aria-invalid={bad || undefined}
                        className="w-32"
                        value={interval.end}
                        onChange={(e) => change({ end: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${name} window ${index + 1}`}
                        onClick={() =>
                          setDay(
                            weekday,
                            intervals.filter((_, j) => j !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                      {problem && (
                        <span className="text-xs font-medium text-red-600">{problem}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className={cx('flex gap-1', !enabled && 'sm:invisible')}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Add hours on ${name}`}
                  disabled={!nextInterval(intervals.at(-1))}
                  onClick={() => {
                    const next = nextInterval(intervals.at(-1));
                    if (next) setDay(weekday, [...intervals, next]);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Copy ${name}'s hours to all weekdays`}
                  title="Copy to Monday–Friday"
                  onClick={() => {
                    const days = { ...current.days };
                    for (const d of [1, 2, 3, 4, 5]) days[d] = intervals.map((i) => ({ ...i }));
                    update({ ...current, days });
                  }}
                >
                  <Copy className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}
