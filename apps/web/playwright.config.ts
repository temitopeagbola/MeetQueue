import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const repoRoot = new URL('../..', import.meta.url).pathname;

/**
 * Smoke test of the main flow against the real stack (Next.js → Fastify → Postgres).
 * Expects a migrated database (DATABASE_URL) and built apps: `pnpm build && pnpm test:e2e`.
 * Locally, already-running dev servers on :3000/:4000 are reused.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @meetqueue/api start',
      cwd: repoRoot,
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: !CI,
      timeout: 60_000,
      env: {
        PORT: '4000',
        WEB_ORIGIN: 'http://localhost:3000',
        CALENDAR_PROVIDER: 'mock',
        EMAIL_PROVIDER: 'console',
        RATE_LIMIT_ENABLED: 'false',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: 'pnpm --filter @meetqueue/web start',
      cwd: repoRoot,
      url: 'http://localhost:3000',
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});
