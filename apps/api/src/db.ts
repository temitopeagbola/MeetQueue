import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export type Db = PrismaClient;

export function createDb(connectionString: string): Db {
  // Neon's pooled endpoint works fine with node-postgres; keep the pool small for free tiers.
  const adapter = new PrismaPg({ connectionString, max: 5 });
  return new PrismaClient({ adapter });
}
