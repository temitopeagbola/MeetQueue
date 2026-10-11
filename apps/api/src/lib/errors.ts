import type { z } from 'zod';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, fields?: Record<string, string[]>) =>
  new AppError(400, 'BAD_REQUEST', message, fields);
export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code: string, message: string, fields?: Record<string, string[]>) =>
  new AppError(409, code, message, fields);

/** Parses untrusted input, turning zod issues into a 400 with per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input ?? {});
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (fields[key] ??= []).push(issue.message);
  }
  const first = result.error.issues[0];
  throw badRequest(first ? first.message : 'Invalid request', fields);
}

/** Walks a Prisma / driver-adapter error looking for a Postgres SQLSTATE. */
function postgresCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  const stack: unknown[] = [error];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    const record = current as Record<string, unknown>;
    for (const key of ['originalCode', 'code']) {
      const value = record[key];
      // SQLSTATEs are 5 chars; skip Prisma's own P1xxx–P6xxx codes.
      if (
        typeof value === 'string' &&
        /^[0-9A-Z]{5}$/.test(value) &&
        !/^P[1-6]\d{3}$/.test(value)
      ) {
        return value;
      }
    }
    for (const key of ['meta', 'driverAdapterError', 'cause']) stack.push(record[key]);
  }
  return undefined;
}

/** True when Postgres rejected a write because of the bookings exclusion constraint. */
export function isExclusionViolation(error: unknown): boolean {
  return postgresCode(error) === '23P01';
}

/**
 * True when a booking write lost a race for its time range: the exclusion constraint fired
 * (23P01), or Postgres broke a deadlock between two conflicting inserts (40P01). Either way
 * someone else is taking that slot.
 */
export function isSlotContention(error: unknown): boolean {
  const code = postgresCode(error);
  return code === '23P01' || code === '40P01';
}

export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2002' || postgresCode(error) === '23505';
}
