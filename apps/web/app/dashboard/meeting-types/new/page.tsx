'use client';

import { emptyMeetingType, MeetingTypeForm } from '@/components/meeting-type-form';
import { PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function NewMeetingTypePage() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New meeting type"
        description="Set how long it is and when it can be booked."
      />
      <MeetingTypeForm initial={emptyMeetingType} username={user.username} />
    </div>
  );
}
