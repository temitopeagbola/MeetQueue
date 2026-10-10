'use client';

import { Loader2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { wakeStore } from '@/lib/wake';

/** Shown while an API request is slow, i.e. the sleeping free-tier backend is booting. */
export function WakingBanner() {
  const waking = useSyncExternalStore(wakeStore.subscribe, wakeStore.getSnapshot, wakeStore.getServerSnapshot);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {waking && (
        <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
          <div>
            <p className="font-medium">Waking up the server…</p>
            <p className="text-slate-300">
              The free-tier backend sleeps when idle. The first request can take up to a minute.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
