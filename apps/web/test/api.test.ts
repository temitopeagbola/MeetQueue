import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetApiState, api, ApiError, SLOW_REQUEST_MS } from '@/lib/api';
import { wakeStore } from '@/lib/wake';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    __resetApiState();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await expect(api('/api/health')).resolves.toEqual({ ok: true });
  });

  it('surfaces API errors with code and field messages', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: {
          code: 'BAD_REQUEST',
          message: 'Name is required',
          fields: { name: ['Name is required'] },
        },
      }),
    );
    const error = await api('/api/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      fields: { name: ['Name is required'] },
    });
  });

  it('retries GETs through a cold start and shows the waking banner meanwhile', async () => {
    fetchMock
      .mockResolvedValueOnce(json(503, {}))
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(json(200, { days: [] }));
    const seen: boolean[] = [];
    const unsubscribe = wakeStore.subscribe(() => seen.push(wakeStore.getSnapshot()));

    const promise = api('/api/slots');
    await vi.advanceTimersByTimeAsync(SLOW_REQUEST_MS + 10_000);
    await expect(promise).resolves.toEqual({ days: [] });
    unsubscribe();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([true, false]);
  });

  it('wakes the server before a write and never retries the write itself', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true })) // health check
      .mockResolvedValueOnce(json(502, {})); // the POST
    const promise = api('/api/bookings', { method: 'POST', body: { a: 1 } }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    const error = await promise;

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['/api/health', 'GET'],
      ['/api/bookings', 'POST'],
    ]);
    expect(fetchMock.mock.calls[1]![1]!.body).toBe('{"a":1}');
    expect(error).toMatchObject({ status: 502 });
  });

  it('skips the warm-up ping when the server answered recently', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(201, { id: 1 }));
    await api('/api/anything');
    await api('/api/things', { method: 'POST' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
