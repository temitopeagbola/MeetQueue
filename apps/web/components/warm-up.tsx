'use client';

import { useEffect } from 'react';
import { warmUp } from '@/lib/api';

/** Starts waking the sleeping backend as soon as a page loads. */
export function WarmUp() {
  useEffect(() => warmUp(), []);
  return null;
}
