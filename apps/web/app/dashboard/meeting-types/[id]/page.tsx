'use client';

import type { MeetingTypeDTO } from '@meetqueue/core';
import { useParams } from 'next/navigation';
import { MeetingTypeForm, valuesFrom } from '@/components/meeting-type-form';
import { ErrorState, LoadingBlock, PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApiQuery } from '@/lib/use-api';

export default function EditMeetingTypePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, error, reload } = useApiQuery<{ meetingType: MeetingTypeDTO }>(
    `/api/meeting-types/${id}`,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit meeting type" description={data?.meetingType.title} />
      {error ? (
        <ErrorState message={error.message} onRetry={error.status === 404 ? undefined : reload} />
      ) : !data ? (
        <LoadingBlock label="Loading meeting type" />
      ) : (
        <MeetingTypeForm
          key={data.meetingType.id}
          initial={valuesFrom(data.meetingType)}
          meetingTypeId={data.meetingType.id}
          username={user.username}
        />
      )}
    </div>
  );
}
