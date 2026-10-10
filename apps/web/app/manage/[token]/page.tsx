import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';
import { ManageBooking } from './manage-booking';

export const metadata: Metadata = { title: 'Manage your booking', robots: { index: false } };

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <PublicShell>
      <ManageBooking token={token} />
    </PublicShell>
  );
}
