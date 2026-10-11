import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { TEST_DATABASE_URL } from './helpers';

/** Creates the test database if needed, then applies migrations (incl. the exclusion constraint). */
export default async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const database = decodeURIComponent(url.pathname.slice(1));
  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (!exists.rowCount) await admin.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
  } finally {
    await admin.end();
  }

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
