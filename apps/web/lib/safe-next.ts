/**
 * Where to go after signing in. Only same-origin paths are allowed, resolved the way the
 * browser would (so tricks like `/\evil.com` or `//evil.com` fall back to the dashboard).
 */
export function safeNext(value: string | null, origin: string): string {
  const fallback = '/dashboard';
  if (!value || !value.startsWith('/')) return fallback;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
