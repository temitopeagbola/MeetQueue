import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 doesn't read .env on its own. Migrations prefer a direct (non-pooled) connection,
// e.g. Neon's direct host, and fall back to DATABASE_URL.
// Load apps/api/.env first, then the repo-root .env (shared with docker-compose).
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '',
  },
});
