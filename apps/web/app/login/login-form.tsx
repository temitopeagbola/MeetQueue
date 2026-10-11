'use client';

import { loginSchema } from '@meetqueue/core';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthLayout } from '@/components/auth-layout';
import { DemoButton } from '@/components/demo-button';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { validate, type FieldErrors } from '@/lib/forms';
import { safeNext } from '@/lib/safe-next';
import { toApiError } from '@/lib/use-api';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(loginSchema, form);
    setErrors(result.errors ?? {});
    setFormError(null);
    if (!result.data) return;
    setSubmitting(true);
    try {
      await api('/api/auth/login', { method: 'POST', body: result.data });
      router.push(safeNext(params.get('next'), window.location.origin));
    } catch (error) {
      setFormError(toApiError(error).message);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New here?{' '}
          <Link href="/signup" className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <Field label="Email" error={errors.email}>
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
        <Field label="Password" error={errors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          )}
        </Field>
        <Button type="submit" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>
      <div className="mt-6 border-t border-slate-100 pt-6 text-center">
        <p className="mb-3 text-sm text-slate-500">Just looking around?</p>
        <DemoButton variant="secondary" className="w-full">
          Try the demo account
        </DemoButton>
      </div>
    </AuthLayout>
  );
}
