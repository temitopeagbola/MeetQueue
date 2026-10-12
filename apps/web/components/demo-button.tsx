'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { toApiError } from '@/lib/use-api';
import { Button, type ButtonProps } from './ui';

/** One click: sign into the shared, seeded demo host and open the dashboard. */
export function DemoButton({ children = 'Try the demo', ...props }: ButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      await api('/api/auth/demo', { method: 'POST' });
      router.push('/dashboard');
    } catch (err) {
      setError(toApiError(err).message);
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button onClick={start} loading={loading} {...props}>
        {children}
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
