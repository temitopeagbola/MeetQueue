import type { Metadata } from 'next';
import { PublicShell } from '@/components/public-shell';
import { HostProfile } from './host-profile';

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  return { title: `Book time with ${username}` };
}

export default async function HostPage({ params }: { params: Params }) {
  const { username } = await params;
  return (
    <PublicShell>
      <HostProfile username={decodeURIComponent(username)} />
    </PublicShell>
  );
}
