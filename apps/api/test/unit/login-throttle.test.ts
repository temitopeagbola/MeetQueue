import { describe, expect, it } from 'vitest';
import { LoginThrottle } from '../../src/lib/login-throttle';

describe('LoginThrottle', () => {
  it('locks an account after too many failures until the window ends', () => {
    let now = 0;
    const throttle = new LoginThrottle(3, 60_000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(throttle.retryAfterSeconds('ada@example.com')).toBe(0);
      throttle.recordFailure('ada@example.com');
    }
    expect(throttle.retryAfterSeconds('ada@example.com')).toBe(60);
    expect(throttle.retryAfterSeconds('bob@example.com')).toBe(0);
    now = 30_000;
    expect(throttle.retryAfterSeconds('ada@example.com')).toBe(30);
    now = 60_000;
    expect(throttle.retryAfterSeconds('ada@example.com')).toBe(0);
  });

  it('clears the count on a successful sign-in', () => {
    const throttle = new LoginThrottle(2, 60_000, () => 0);
    throttle.recordFailure('ada@example.com');
    throttle.recordSuccess('ada@example.com');
    throttle.recordFailure('ada@example.com');
    expect(throttle.retryAfterSeconds('ada@example.com')).toBe(0);
  });
});
