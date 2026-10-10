'use client';

import { signupSchema } from '@meetqueue/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { TimezoneSelect } from '@/components/timezone-select';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { fieldErrorsFrom, validate, type FieldErrors } from '@/lib/forms';
import { guessTimeZone } from '@/lib/timezones';
import { toApiError } from '@/lib/use-api';
import { useHydrated } from '@/lib/use-hydrated';

export function SignupForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '' });
  const [timezone, setTimezone] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const effectiveTimezone = timezone ?? (hydrated ? guessTimeZone() : 'UTC');

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(signupSchema, { ...form, timezone: effectiveTimezone });
    setErrors(result.errors ?? {});
    setFormError(null);
    if (!result.data) return;
    setSubmitting(true);
    try {
      await api('/api/auth/signup', { method: 'POST', body: result.data });
      router.push('/dashboard');
    } catch (error) {
      const apiError = toApiError(error);
      const fields = fieldErrorsFrom(apiError);
      setErrors(fields);
      if (!Object.keys(fields).length) setFormError(apiError.message);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your booking page"
      subtitle={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <Field label="Your name" error={errors.name}>
          {(props) => <Input {...props} autoComplete="name" value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(props) => (
            <Input {...props} type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          )}
        </Field>
        <Field
          label="Booking link"
          error={errors.username}
          hint={`Your page: /${form.username.trim().toLowerCase() || 'your-name'}`}
        >
          {(props) => (
            <Input
              {...props}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="your-name"
              value={form.username}
              onChange={set('username')}
            />
          )}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          {(props) => (
            <Input {...props} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          )}
        </Field>
        <Field label="Your timezone" error={errors.timezone}>
          {(props) => <TimezoneSelect {...props} value={effectiveTimezone} onChange={setTimezone} />}
        </Field>
        <Button type="submit" className="w-full" loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
