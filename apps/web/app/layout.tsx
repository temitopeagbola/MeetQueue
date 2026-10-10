import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { WakingBanner } from '@/components/waking-banner';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'MeetQueue · Scheduling without the back-and-forth', template: '%s · MeetQueue' },
  description:
    'Share a booking page, let people pick a time in their own timezone, and never get double-booked.',
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-white px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        {children}
        <WakingBanner />
      </body>
    </html>
  );
}
