import type { ApiErrorBody } from '@meetqueue/core';
import { markSlowEnd, markSlowStart } from './wake';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** After this long without a response we show the "waking server…" banner. */
export const SLOW_REQUEST_MS = 2_500;
/** Render cold starts are usually 30–60s; keep retrying idempotent requests this long. */
const MAX_WAKE_MS = 90_000;
const RETRYABLE = new Set([502, 503, 504]);
const AWAKE_TTL_MS = 5 * 60_000;

let lastHealthyAt = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // non-JSON body (e.g. an HTML error page from a proxy)
  }
  if (!response.ok) {
    const error = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Request failed (${response.status}). Please try again.`,
      error?.fields,
    );
  }
  return data as T;
}

async function withSlowIndicator<T>(task: () => Promise<T>): Promise<T> {
  let slow = false;
  const timer = setTimeout(() => {
    slow = true;
    markSlowStart();
  }, SLOW_REQUEST_MS);
  try {
    return await task();
  } finally {
    clearTimeout(timer);
    if (slow) markSlowEnd();
  }
}

/**
 * Same-origin JSON client. GETs retry through 502/503/504 and network errors while the
 * backend wakes up; writes first make sure the server is awake, then run exactly once so a
 * booking is never submitted twice.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const idempotent = method === 'GET';
  if (!idempotent && Date.now() - lastHealthyAt > AWAKE_TTL_MS) {
    await ensureAwake(options.signal);
  }
  const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH';

  return withSlowIndicator(async () => {
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      let response: Response | null = null;
      try {
        response = await fetch(path, {
          method,
          credentials: 'same-origin',
          headers: hasBody ? { 'content-type': 'application/json' } : undefined,
          body: hasBody ? JSON.stringify(options.body ?? {}) : undefined,
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (!idempotent || Date.now() - started > MAX_WAKE_MS) {
          throw new ApiError(0, 'NETWORK', 'Could not reach the server. Check your connection and try again.');
        }
      }
      const canRetry = idempotent && Date.now() - started < MAX_WAKE_MS;
      if (response && !(canRetry && RETRYABLE.has(response.status))) {
        if (response.status < 500) lastHealthyAt = Date.now();
        return parse<T>(response);
      }
      await sleep(Math.min(1_000 * 2 ** attempt, 5_000));
    }
  });
}

/** Pings the API until it responds (shows the waking banner if that takes a while). */
export async function ensureAwake(signal?: AbortSignal) {
  await api<{ ok: boolean }>('/api/health', { signal });
}

/** Fire-and-forget warm-up so a sleeping backend starts booting while the user reads. */
export function warmUp() {
  ensureAwake().catch(() => {});
}

/** Test hook. */
export function __resetApiState() {
  lastHealthyAt = 0;
}
