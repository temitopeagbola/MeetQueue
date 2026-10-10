import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WakingBanner } from '@/components/waking-banner';
import { markSlowEnd, markSlowStart } from '@/lib/wake';

afterEach(cleanup);

describe('<WakingBanner>', () => {
  it('appears while a request is slow and disappears when it finishes', () => {
    render(<WakingBanner />);
    expect(screen.queryByText(/waking up the server/i)).toBeNull();

    act(() => markSlowStart());
    expect(screen.getByRole('status').textContent).toMatch(/waking up the server/i);

    act(() => markSlowEnd());
    expect(screen.queryByText(/waking up the server/i)).toBeNull();
  });
});
