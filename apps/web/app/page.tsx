import { CalendarCheck2, CalendarSync, Clock3, Globe2, Link2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { DemoButton } from '@/components/demo-button';
import { Logo } from '@/components/logo';
import { ButtonLink } from '@/components/ui';
import { WarmUp } from '@/components/warm-up';

const features = [
  {
    icon: Clock3,
    title: 'Weekly availability & buffers',
    body: 'Split days, per-meeting buffers, minimum notice and a booking horizon. Slots respect all of it.',
  },
  {
    icon: Globe2,
    title: 'Timezone-aware booking pages',
    body: 'Invitees see times in their own timezone, computed with DST-safe wall-clock rules in yours.',
  },
  {
    icon: ShieldCheck,
    title: 'Double-booking is impossible',
    body: 'A Postgres exclusion constraint on (host, time range) rejects overlaps, even under concurrent requests.',
  },
  {
    icon: CalendarSync,
    title: 'Google Calendar sync',
    body: 'OAuth connect, free/busy checks and event creation with invites. An .ics file is the fallback.',
  },
  {
    icon: Link2,
    title: 'Reschedule & cancel links',
    body: 'Every confirmation carries a private manage link. Changes update the calendar and email everyone.',
  },
  {
    icon: CalendarCheck2,
    title: 'Works without keys',
    body: 'Mock calendar and console email providers kick in automatically when credentials are missing.',
  },
];

const steps = [
  [
    'Set your hours',
    'Pick your timezone and weekly availability, then add meeting types with buffers.',
  ],
  ['Share your link', 'Send people to your page. They choose a slot shown in their own timezone.'],
  [
    'Get booked',
    'The booking lands in your calendar with an invite. Invitees can reschedule or cancel.',
  ],
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <WarmUp />
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2">
            <ButtonLink href="/login" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup" variant="secondary" size="sm">
              Sign up
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-b from-white to-brand-50/60">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-24 lg:grid-cols-2">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
                Open-source scheduling MVP
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                Scheduling without the back-and-forth.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-600">
                MeetQueue gives you a booking page that respects your hours and buffers, shows
                invitees times in their own timezone, syncs with Google Calendar and can never be
                double-booked.
              </p>
              <div className="mt-8 flex flex-wrap items-start gap-3">
                <DemoButton size="lg" />
                <ButtonLink href="/demo" variant="secondary" size="lg">
                  See a booking page
                </ButtonLink>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                The demo signs you into a shared host account with sample bookings. No sign-up.
              </p>
            </div>

            <div aria-hidden className="relative mx-auto w-full max-w-md">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <span className="grid size-10 place-items-center rounded-full bg-brand-600 font-semibold text-white">
                    SR
                  </span>
                  <div>
                    <p className="text-sm text-slate-500">Sam Rivera</p>
                    <p className="font-semibold">Project consultation · 30 min</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                  {Array.from({ length: 21 }, (_, i) => {
                    const open = i % 7 < 5 && i > 2;
                    return (
                      <span
                        key={i}
                        className={`grid aspect-square place-items-center rounded-full text-sm ${
                          i === 9
                            ? 'bg-brand-600 font-semibold text-white'
                            : open
                              ? 'bg-brand-50 font-semibold text-brand-700'
                              : 'text-slate-300'
                        }`}
                      >
                        {i + 5}
                      </span>
                    );
                  })}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {['9:00', '9:30', '10:30', '11:00', '14:00', '15:30'].map((t, i) => (
                    <span
                      key={t}
                      className={`rounded-lg border py-2 text-center text-sm font-semibold ${
                        i === 2
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-brand-200 text-brand-700'
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="features" className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="features" className="text-2xl font-semibold tracking-tight">
            What works today
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon className="size-6 text-brand-600" aria-hidden />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-slate-600">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="how" className="text-2xl font-semibold tracking-tight">
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {steps.map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-slate-600">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between">
        <p>Next.js · Fastify · Prisma · PostgreSQL · Google Calendar API</p>
        <Link
          href="https://github.com/temitopeagbola/MeetQueue"
          className="font-medium hover:text-slate-900"
        >
          Source on GitHub
        </Link>
      </footer>
    </div>
  );
}
