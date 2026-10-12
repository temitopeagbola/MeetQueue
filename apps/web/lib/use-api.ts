'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, 'UNKNOWN', error instanceof Error ? error.message : 'Unexpected error');
}

interface Result<T> {
  path: string | null;
  nonce: number;
  data?: T;
  error?: ApiError;
}

/**
 * Loads a GET endpoint. `loading` is derived (no synchronous setState in effects); data is kept
 * while reloading the same path, and cleared when the path changes.
 */
export function useApiQuery<T>(path: string | null) {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T>>({ path: null, nonce: -1 });

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => setResult({ path, nonce, data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult((prev) => ({
          path,
          nonce,
          data: prev.path === path ? prev.data : undefined,
          error: toApiError(error),
        }));
      });
    return () => controller.abort();
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const mutate = useCallback(
    (update: (current: T | undefined) => T | undefined) =>
      setResult((prev) => ({ ...prev, data: update(prev.data) })),
    [],
  );

  const samePath = result.path === path;
  return {
    data: samePath ? result.data : undefined,
    error: samePath && result.nonce === nonce ? result.error : undefined,
    loading: !!path && (!samePath || result.nonce !== nonce),
    reload,
    mutate,
  };
}
