'use client';

import type { UserDTO } from '@meetqueue/core';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { api } from './api';
import { useApiQuery } from './use-api';

interface AuthContextValue {
  user: UserDTO;
  logout(): Promise<void>;
  /** Re-reads the session user (e.g. after the host changes their timezone). */
  refresh(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <RequireAuth>');
  return value;
}

/** Loads the session; redirects to /login when signed out. */
export function RequireAuth({
  children,
  fallback,
  renderError,
}: {
  children: ReactNode;
  fallback: ReactNode;
  renderError: (message: string, retry: () => void) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, error, reload } = useApiQuery<{ user: UserDTO }>('/api/auth/me');
  const unauthenticated = error?.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthenticated, router, pathname]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/');
  }, [router]);

  if (error && !unauthenticated) return renderError(error.message, reload);
  if (!data) return fallback;
  return (
    <AuthContext.Provider value={{ user: data.user, logout, refresh: reload }}>
      {children}
    </AuthContext.Provider>
  );
}
