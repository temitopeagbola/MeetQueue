import { buildApp } from './app';
import { createDb } from './db';
import { loadConfig, loadDotenvFiles } from './env';

if (process.env.NODE_ENV !== 'production') loadDotenvFiles();

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = await buildApp({ config, db });

app.log.info(
  { calendar: config.calendar.mode, email: config.email.mode, webOrigin: config.webOrigin },
  'providers configured',
);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exit(1);
}
