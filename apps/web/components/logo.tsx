import Link from 'next/link';
import { CalendarClock } from 'lucide-react';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 rounded-md font-semibold text-slate-900">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">
        <CalendarClock className="size-4.5" aria-hidden />
      </span>
      <span className="text-lg tracking-tight">MeetQueue</span>
    </Link>
  );
}
