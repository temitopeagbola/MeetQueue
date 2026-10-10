import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';
import { BookingFlow } from './booking-flow';

type Params = Promise<{ username: string; slug: string }>;

export const metadata: Metadata = { title: 'Book a time' };

export default async function BookingPage({ params }: { params: Params }) {
  const { username, slug } = await params;
  return (
    <PublicShell>
      <BookingFlow username={decodeURIComponent(username)} slug={decodeURIComponent(slug)} />
    </PublicShell>
  );
}
