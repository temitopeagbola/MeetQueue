'use client';

/** Absolute URL for a path on this site (client-side only). */
export function siteUrl(path: string) {
  return typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
}
