import { createDb } from './db';
import { loadConfig, loadDotenvFiles } from './env';
import { DEMO_USERNAME, ensureDemoAccount } from './services/demo';

// Seeds (or resets) the shared demo host: availability, meeting types and sample bookings.
loadDotenvFiles();
const config = loadConfig();
const db = createDb(config.databaseUrl);

try {
  const host = await ensureDemoAccount(db, { encryptionKey: config.encryptionKey, reset: true });
  const bookings = await db.booking.count({ where: { hostId: host.id } });
  console.info(`Seeded demo host "${DEMO_USERNAME}" (${host.timezone}) with ${bookings} bookings.`);
} finally {
  await db.$disconnect();
}
