import type { z } from 'zod';
import { ApiError } from './api';

export type FieldErrors = Record<string, string>;

/** Validates with a shared zod schema, returning the first message per field. */
export function validate<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { data: z.output<S>; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}

/** Field errors returned by the API (400/409 with `fields`). */
export function fieldErrorsFrom(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || !error.fields) return {};
  return Object.fromEntries(
    Object.entries(error.fields).map(([key, messages]) => [key, messages[0] ?? 'Invalid value']),
  );
}
