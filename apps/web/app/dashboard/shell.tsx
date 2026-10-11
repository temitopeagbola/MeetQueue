'use client';

import {
  CalendarDays,
  Clock3,
  ExternalLink,
  LayoutList,
  LogOut,
  Mail,
  Plug,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Logo } from '@/components/logo';
import { Button, cx, ErrorState, LoadingBlock } from '@/components/ui';
import { api } from '@/lib/api';
import { RequireAuth, useAuth } from '@/lib/auth';
import { toApiError } from '@/lib/use-api';

const nav = [
  { href: '/dashboard', label: 'Bookings', icon: CalendarDays },
  { href: '/dashboard/availability', label: 'Availability', icon: Clock3 },
  { href: '/dashboard/meeting-types', label: 'Meeting types', icon: LayoutList },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
  { href: '/dashboard/emails', label: 'Emails', icon: Mail },
];

function DemoBanner() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/demo/reset', { method: 'POST' });
      // Hard reload so every view refetches the restored data.
      window.location.reload();
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>Demo account.</strong> Everything works for real, but other visitors share this
          host. Its calendar is always the mock provider.
        </p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <RotateCcw className="size-3.5" aria-hidden /> Reset demo data
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title="Reset the demo account?"
        description="This restores the sample meeting types, availability and bookings for everyone using the demo."
        confirmLabel="Reset demo"
        cancelLabel="Cancel"
        tone="primary"
        loading={loading}
        error={error}
        onConfirm={reset}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/dashboard'
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo href="/dashboard" />
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href={`/${user.username}`}
              target="_blank"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex"
            >
              View booking page <ExternalLink className="size-3.5" aria-hidden />
            </Link>
            <span className="hidden text-sm text-slate-500 md:inline">{user.name}</span>
            <Button variant="ghost" size="sm" onClick={logout} aria-label="Sign out">
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        <nav aria-label="Dashboard" className="mx-auto max-w-6xl overflow-x-auto px-2 sm:px-4">
          <ul className="flex gap-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? 'page' : undefined}
                  className={cx(
                    'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium',
                    isActive(href)
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {user.isDemo && <DemoBanner />}
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth
      fallback={
        <div className="min-h-dvh">
          <LoadingBlock label="Loading your dashboard" />
        </div>
      }
      renderError={(message, retry) => (
        <div className="mx-auto max-w-md px-4 py-16">
          <ErrorState message={message} onRetry={retry} />
        </div>
      )}
    >
      <Shell>{children}</Shell>
    </RequireAuth>
  );
}
