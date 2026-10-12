import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

const origin = 'https://meetqueue.example.com';

describe('safeNext', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeNext('/dashboard/availability?x=1#top', origin)).toBe(
      '/dashboard/availability?x=1#top',
    );
  });

  it('rejects anything that would leave the site', () => {
    for (const value of [
      '//evil.com',
      '/\\evil.com',
      '/\\/evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '',
    ]) {
      expect(safeNext(value, origin), value).toBe('/dashboard');
    }
    expect(safeNext(null, origin)).toBe('/dashboard');
  });
});
