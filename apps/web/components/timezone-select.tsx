'use client';

import { useMemo } from 'react';
import { timeZoneLabel } from '@/lib/format';
import { listTimeZones } from '@/lib/timezones';
import { useHydrated } from '@/lib/use-hydrated';
import { Select } from './ui';

export function TimezoneSelect({
  value,
  onChange,
  id,
  className,
  ...aria
}: {
  value: string;
  onChange(value: string): void;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  // The zone list and offset labels come from the runtime's ICU data, which can differ between
  // Node and the browser, so render just the current value until hydrated. Building ~400
  // labels is not free; do it once per mount.
  const hydrated = useHydrated();
  const all = useMemo(
    () => (hydrated ? listTimeZones().map((zone) => [zone, timeZoneLabel(zone)] as const) : []),
    [hydrated],
  );
  const zones = all.some(([zone]) => zone === value)
    ? all
    : [[value, hydrated ? timeZoneLabel(value) : value] as const, ...all];
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className} {...aria}>
      {zones.map(([zone, label]) => (
        <option key={zone} value={zone}>
          {label}
        </option>
      ))}
    </Select>
  );
}
