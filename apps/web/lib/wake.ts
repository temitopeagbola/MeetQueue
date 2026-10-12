// Tracks whether any API request has been pending long enough that the (free-tier, sleeping)
// backend is probably cold-starting. Read with useSyncExternalStore.

type Listener = () => void;

let slowRequests = 0;
let waking = false;
const listeners = new Set<Listener>();

function set(next: boolean) {
  if (waking === next) return;
  waking = next;
  for (const listener of listeners) listener();
}

export const wakeStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => waking,
  getServerSnapshot: () => false,
};

export function markSlowStart() {
  slowRequests += 1;
  set(true);
}

export function markSlowEnd() {
  slowRequests = Math.max(0, slowRequests - 1);
  if (slowRequests === 0) set(false);
}
