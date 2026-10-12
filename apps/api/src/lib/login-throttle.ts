/**
 * Per-account brute-force guard: after `maxFailures` failed sign-ins within `windowMs`, that
 * email is locked until the window ends. Unlike IP limits it can't be dodged by rotating
 * addresses. In-memory, like the rate limiter (one Render instance).
 */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  private entry(key: string) {
    const entry = this.failures.get(key);
    if (entry && this.now() - entry.windowStart >= this.windowMs) {
      this.failures.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Seconds until this account may try again; 0 when allowed. */
  retryAfterSeconds(key: string): number {
    const entry = this.entry(key);
    if (!entry || entry.count < this.maxFailures) return 0;
    return Math.ceil((entry.windowStart + this.windowMs - this.now()) / 1000);
  }

  recordFailure(key: string) {
    const entry = this.entry(key);
    if (entry) entry.count += 1;
    else this.failures.set(key, { count: 1, windowStart: this.now() });
    if (this.failures.size > 10_000) {
      for (const k of this.failures.keys()) this.entry(k); // prune expired windows
    }
  }

  recordSuccess(key: string) {
    this.failures.delete(key);
  }
}
