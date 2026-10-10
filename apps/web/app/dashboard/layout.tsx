import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DashboardShell } from './shell';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } };

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
