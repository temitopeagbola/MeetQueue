// Pure helpers for the month view. Calendar dates are "YYYY-MM-DD" strings; month keys
// are "YYYY-MM". UTC arithmetic is used only as a timezone-free date calculator.

export type MonthKey = string;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Today's calendar date as seen in `timeZone`. */
export function todayIn(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function monthOf(date: string): MonthKey {
  return date.slice(0, 7);
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthBounds(month: MonthKey): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${pad(last)}` };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthLabel(month: MonthKey, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-15T00:00:00Z`));
}

/** Weeks (Monday first) covering the month; days outside the month are null. */
export function monthGrid(month: MonthKey): (string | null)[][] {
  const { start, end } = monthBounds(month);
  const firstWeekday = (new Date(`${start}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const days = Number(end.slice(8));
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= days; day++) cells.push(`${month}-${pad(day)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
