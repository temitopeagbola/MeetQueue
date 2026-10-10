import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** False during SSR and hydration, true afterwards (for browser-only values like the timezone). */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
