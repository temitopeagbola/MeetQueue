import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 doesn't read .env on its own. Migrations prefer a direct (non-pooled) connection,
// e.g. Neon's direct host, and fall back to DATABASE_URL.
// Same files and precedence as src/env.ts: .env.local (secrets) before .env, app before root.
config({ path: ['.env.local', '.env', '../../.env.local', '../../.env'], quiet: true });

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
