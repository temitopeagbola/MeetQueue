'use client';

import { meetingTypeSchema, type MeetingTypeDTO } from '@meetqueue/core';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { fieldErrorsFrom, validate, type FieldErrors } from '@/lib/forms';
import { toApiError } from '@/lib/use-api';
import { Alert, Button, ButtonLink, Card, Field, Input, Select, Textarea } from './ui';

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];
const INTERVALS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

export interface MeetingTypeFormValues {
  title: string;
  slug: string;
  description: string;
  location: string;
  durationMinutes: string;
  bufferBeforeMinutes: string;
  bufferAfterMinutes: string;
  slotIntervalMinutes: string;
  minNoticeHours: string;
  maxDaysAhead: string;
  color: string;
  isActive: boolean;
}

export const emptyMeetingType: MeetingTypeFormValues = {
  title: '',
  slug: '',
  description: '',
  location: '',
  durationMinutes: '30',
  bufferBeforeMinutes: '0',
  bufferAfterMinutes: '10',
  slotIntervalMinutes: '30',
  minNoticeHours: '4',
  maxDaysAhead: '60',
  color: COLORS[0]!,
  isActive: true,
};

export function valuesFrom(type: MeetingTypeDTO): MeetingTypeFormValues {
  return {
    title: type.title,
    slug: type.slug,
    description: type.description ?? '',
    location: type.location ?? '',
    durationMinutes: String(type.durationMinutes),
    bufferBeforeMinutes: String(type.bufferBeforeMinutes),
    bufferAfterMinutes: String(type.bufferAfterMinutes),
    slotIntervalMinutes: String(type.slotIntervalMinutes),
    minNoticeHours: String(Math.round((type.minNoticeMinutes / 60) * 100) / 100),
    maxDaysAhead: String(type.maxDaysAhead),
    color: type.color,
    isActive: type.isActive,
  };
}

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const num = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));

export function MeetingTypeForm({
  initial,
  meetingTypeId,
  username,
}: {
  initial: MeetingTypeFormValues;
  meetingTypeId?: string;
  username: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!!meetingTypeId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof MeetingTypeFormValues>(key: K, value: MeetingTypeFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      title: values.title,
      slug: values.slug,
      description: values.description || null,
      location: values.location || null,
      durationMinutes: num(values.durationMinutes),
      bufferBeforeMinutes: num(values.bufferBeforeMinutes),
      bufferAfterMinutes: num(values.bufferAfterMinutes),
      slotIntervalMinutes: num(values.slotIntervalMinutes),
      minNoticeMinutes: Math.round(num(values.minNoticeHours) * 60),
      maxDaysAhead: num(values.maxDaysAhead),
      color: values.color,
      isActive: values.isActive,
    };
    const result = validate(meetingTypeSchema, payload);
    const fieldErrors = result.errors ?? {};
    if (fieldErrors.minNoticeMinutes) fieldErrors.minNoticeHours = fieldErrors.minNoticeMinutes;
    setErrors(fieldErrors);
    setFormError(null);
    if (!result.data) return;
    setSaving(true);
    try {
      await api(meetingTypeId ? `/api/meeting-types/${meetingTypeId}` : '/api/meeting-types', {
        method: meetingTypeId ? 'PATCH' : 'POST',
        body: result.data,
      });
      router.push('/dashboard/meeting-types');
    } catch (error) {
      const fields = fieldErrorsFrom(error);
      setErrors(fields);
      setFormError(toApiError(error).message);
      setSaving(false);
    }
  }

  const numberField = (
    key: 'durationMinutes' | 'bufferBeforeMinutes' | 'bufferAfterMinutes' | 'maxDaysAhead' | 'minNoticeHours',
    label: string,
    hint: string,
    attrs: { min: number; max: number; step?: number },
  ) => (
    <Field label={label} hint={hint} error={errors[key]}>
      {(props) => (
        <Input
          {...props}
          type="number"
          inputMode="decimal"
          {...attrs}
          value={values[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError && <Alert>{formError}</Alert>}
      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="font-semibold">Details</h2>
        <Field label="Title" error={errors.title}>
          {(props) => (
            <Input
              {...props}
              value={values.title}
              placeholder="Project consultation"
              onChange={(e) => {
                const title = e.target.value;
                setValues((v) => ({ ...v, title, slug: slugTouched ? v.slug : slugify(title) }));
              }}
            />
          )}
        </Field>
        <Field label="URL" hint={`/${username}/${values.slug || 'your-meeting'}`} error={errors.slug}>
          {(props) => (
            <Input
              {...props}
              value={values.slug}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', e.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Description" hint="Shown on the booking page." error={errors.description}>
          {(props) => (
            <Textarea {...props} maxLength={500} value={values.description} onChange={(e) => set('description', e.target.value)} />
          )}
        </Field>
        <Field label="Location" hint="e.g. Zoom, Google Meet, a phone number or an address." error={errors.location}>
          {(props) => <Input {...props} maxLength={200} value={values.location} onChange={(e) => set('location', e.target.value)} />}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <label key={color} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={color}
                  checked={values.color === color}
                  onChange={() => set('color', color)}
                  className="peer sr-only"
                />
                <span
                  className="block size-8 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-slate-900 peer-focus-visible:outline-2 peer-focus-visible:outline-brand-600"
                  style={{ backgroundColor: color }}
                />
                <span className="sr-only">{color}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="font-semibold">Scheduling rules</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {numberField('durationMinutes', 'Duration (minutes)', 'Between 5 and 480.', { min: 5, max: 480, step: 5 })}
          <Field label="Start times every" hint="Spacing between offered start times." error={errors.slotIntervalMinutes}>
            {(props) => (
              <Select {...props} value={values.slotIntervalMinutes} onChange={(e) => set('slotIntervalMinutes', e.target.value)}>
                {INTERVALS.map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {numberField('bufferBeforeMinutes', 'Buffer before (minutes)', 'Kept free before each meeting.', { min: 0, max: 240, step: 5 })}
          {numberField('bufferAfterMinutes', 'Buffer after (minutes)', 'Kept free after each meeting.', { min: 0, max: 240, step: 5 })}
          {numberField('minNoticeHours', 'Minimum notice (hours)', 'No bookings sooner than this.', { min: 0, max: 720, step: 0.5 })}
          {numberField('maxDaysAhead', 'Book up to (days ahead)', 'How far into the future.', { min: 1, max: 365 })}
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-brand-600"
            checked={values.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          Accepting bookings
        </label>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ButtonLink href="/dashboard/meeting-types" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" loading={saving}>
          {meetingTypeId ? 'Save changes' : 'Create meeting type'}
        </Button>
      </div>
    </form>
  );
}
