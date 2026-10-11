// Display helpers. All instants are ISO strings; everything renders in an explicit timezone.

export function formatTime(iso: string, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(
    new Date(iso),
  );
}

export function formatDayLong(iso: string, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso));
}

/** A calendar date ("2026-10-12") as "Monday, 12 October" without timezone drift. */
export function formatLocalDate(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatRange(startIso: string, endIso: string, timeZone: string, locale?: string) {
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(new Date(startIso));
  return `${day}, ${formatTime(startIso, timeZone, locale)} – ${formatTime(endIso, timeZone, locale)}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** "Europe/London (GMT+1)" */
export function timeZoneLabel(timeZone: string, at = new Date()): string {
  try {
    const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    return offset ? `${timeZone.replace(/_/g, ' ')} (${offset})` : timeZone;
  } catch {
    return timeZone;
  }
}

export function formatNotice(minutes: number): string {
  if (minutes === 0) return 'No minimum notice';
  if (minutes % (60 * 24) === 0)
    return `${minutes / (60 * 24)} day${minutes === 1440 ? '' : 's'} notice`;
  if (minutes % 60 === 0) return `${minutes / 60} hr notice`;
  return `${minutes} min notice`;
}
