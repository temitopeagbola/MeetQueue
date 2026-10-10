'use client';

import type { PublicProfileDTO } from '@meetqueue/core';
import { ChevronRight, Clock3, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Initials } from '@/components/public-shell';
import { Card, EmptyState, ErrorState, LoadingBlock } from '@/components/ui';
import { formatDuration } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';

export function HostProfile({ username }: { username: string }) {
  const { data, error, reload } = useApiQuery<PublicProfileDTO>(
    `/api/public/users/${encodeURIComponent(username)}`,
  );

  if (error?.status === 404) {
    return (
      <EmptyState
        title="Booking page not found"
        description={`There’s no MeetQueue page at /${username}. Check the link you were sent.`}
      />
    );
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data) return <LoadingBlock label="Loading booking page" />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex items-center gap-4">
        <Initials name={data.host.name} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.host.name}</h1>
          <p className="text-sm text-slate-500">Pick a meeting type to see available times.</p>
        </div>
      </div>
      {data.meetingTypes.length === 0 ? (
        <EmptyState title="No meeting types available" description="This host isn’t taking bookings right now." />
      ) : (
        <ul className="space-y-3">
          {data.meetingTypes.map((type) => (
            <li key={type.slug}>
              <Link href={`/${data.host.username}/${type.slug}`} className="group block rounded-xl">
                <Card className="flex items-center gap-4 overflow-hidden p-0 transition-shadow group-hover:shadow-md">
                  <span className="w-1.5 self-stretch" style={{ backgroundColor: type.color }} aria-hidden />
                  <div className="min-w-0 flex-1 py-4">
                    <h2 className="font-semibold text-slate-900">{type.title}</h2>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="size-3.5" aria-hidden /> {formatDuration(type.durationMinutes)}
                      </span>
                      {type.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {type.location}
                        </span>
                      )}
                    </p>
                    {type.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{type.description}</p>}
                  </div>
                  <ChevronRight className="mr-4 size-5 text-slate-400 group-hover:text-brand-600" aria-hidden />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
