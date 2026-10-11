'use client';

import type { SlotsResponseDTO } from '@meetqueue/core';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  monthBounds,
  monthGrid,
  monthLabel,
  monthOf,
  todayIn,
} from '@/lib/calendar';
import { formatLocalDate, formatTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api';
import { TimezoneSelect } from './timezone-select';
import { Button, cx, ErrorState, Spinner } from './ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Month calendar + time list. Slots come from the API as UTC instants already grouped by date
 * in the viewer's timezone, so switching timezone just refetches.
 */
export function SlotPicker({
  slotsUrl,
  timezone,
  onTimezoneChange,
  maxDaysAhead,
  selected,
  onSelect,
}: {
  /** Endpoint returning SlotsResponseDTO; start/end/timezone are appended. */
  slotsUrl: string;
  timezone: string;
  onTimezoneChange(timezone: string): void;
  maxDaysAhead: number;
  selected: string | null;
  onSelect(slot: string): void;
}) {
  const today = todayIn(timezone);
  const firstMonth = monthOf(today);
  const lastMonth = monthOf(addDays(today, maxDaysAhead));
  const [monthChoice, setMonthChoice] = useState<string | null>(null);
  const [dateChoice, setDateChoice] = useState<string | null>(null);
  const month =
    monthChoice && monthChoice >= firstMonth && monthChoice <= lastMonth ? monthChoice : firstMonth;

  const { start, end } = monthBounds(month);
  const query = new URLSearchParams({ start: start < today ? today : start, end, timezone });
  const { data, error, loading, reload } = useApiQuery<SlotsResponseDTO>(`${slotsUrl}?${query}`);

  const slotsByDate = useMemo(
    () => new Map((data?.days ?? []).map((day) => [day.date, day.slots])),
    [data],
  );
  const firstAvailable = data?.days[0]?.date ?? null;
  const activeDate = dateChoice && slotsByDate.has(dateChoice) ? dateChoice : firstAvailable;
  const activeSlots = activeDate ? (slotsByDate.get(activeDate) ?? []) : [];

  const changeMonth = (delta: number) => {
    setMonthChoice(addMonths(month, delta));
    setDateChoice(null);
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900" aria-live="polite">
            {monthLabel(month)}
          </h3>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Previous month"
              disabled={month <= firstMonth}
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Next month"
              disabled={month >= lastMonth}
              onClick={() => changeMonth(1)}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="relative">
          <table className="w-full table-fixed border-separate border-spacing-1 text-center">
            <thead>
              <tr>
                {WEEKDAYS.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    className="pb-1 text-xs font-medium uppercase text-slate-500"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthGrid(month).map((week, i) => (
                <tr key={i}>
                  {week.map((date, j) => {
                    if (!date) return <td key={j} />;
                    const count = slotsByDate.get(date)?.length ?? 0;
                    const isActive = date === activeDate;
                    return (
                      <td key={date}>
                        <button
                          type="button"
                          disabled={!count}
                          aria-pressed={isActive}
                          aria-label={`${formatLocalDate(date)}: ${count ? `${count} times available` : 'no times available'}`}
                          onClick={() => setDateChoice(date)}
                          className={cx(
                            'mx-auto grid aspect-square w-full max-w-11 place-items-center rounded-full text-sm transition-colors',
                            isActive
                              ? 'bg-brand-600 font-semibold text-white'
                              : count
                                ? 'bg-brand-50 font-semibold text-brand-700 hover:bg-brand-100'
                                : 'cursor-default text-slate-300',
                            date === today && !isActive && 'ring-1 ring-brand-300',
                          )}
                        >
                          {Number(date.slice(8))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="absolute inset-0 grid place-items-center rounded-lg bg-white/70">
              <Spinner label="Loading times" />
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label
            htmlFor="slot-timezone"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600"
          >
            <Globe className="size-3.5" aria-hidden /> Times shown in
          </label>
          <TimezoneSelect id="slot-timezone" value={timezone} onChange={onTimezoneChange} />
        </div>
      </div>

      <div className="min-w-0">
        {error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : loading && !data ? null : !firstAvailable ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">No times left in {monthLabel(month)}.</p>
            {month < lastMonth ? (
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => changeMonth(1)}>
                Check {monthLabel(addMonths(month, 1))}
              </Button>
            ) : (
              <p className="mt-1">Bookings open up to {maxDaysAhead} days ahead.</p>
            )}
          </div>
        ) : (
          activeDate && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                {formatLocalDate(activeDate)}
              </h3>
              <ul
                className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-1"
                aria-label="Available times"
              >
                {activeSlots.map((slot) => (
                  <li key={slot}>
                    <button
                      type="button"
                      onClick={() => onSelect(slot)}
                      aria-pressed={selected === slot}
                      className={cx(
                        'h-11 w-full rounded-lg border text-sm font-semibold transition-colors',
                        selected === slot
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-brand-200 text-brand-700 hover:border-brand-500 hover:bg-brand-50',
                      )}
                    >
                      {formatTime(slot, timezone)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
      </div>
    </div>
  );
}
