import Link from 'next/link';
import type { ReactNode } from 'react';
import { WarmUp } from './warm-up';

/** Minimal chrome for invitee-facing pages. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <WarmUp />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-12">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-slate-500">
        Scheduling by{' '}
        <Link href="/" className="font-medium text-slate-700 hover:underline">
          MeetQueue
        </Link>
      </footer>
    </div>
  );
}

export function Initials({ name, color = '#4f46e5' }: { name: string; color?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className="grid size-12 shrink-0 place-items-center rounded-full text-base font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}
