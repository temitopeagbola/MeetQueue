import { execFileSync } from 'node:child_process';
import { TEST_DATABASE_URL } from './helpers';

/** Applies migrations (including the exclusion constraint) to the test database. */
export default function setup() {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      DIRECT_DATABASE_URL: TEST_DATABASE_URL,
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
  });
}
