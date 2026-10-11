import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  COOKIE_SECURE: bool.optional(),
  TRUST_PROXY: bool.default(true),
  TOKEN_ENCRYPTION_KEY: z.string().min(16).optional(),
  CALENDAR_PROVIDER: z.enum(['google', 'mock']).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z.url().optional(),
  EMAIL_PROVIDER: z.enum(['smtp', 'console']).optional(),
  SMTP_URL: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default('MeetQueue <no-reply@meetqueue.local>'),
  DEMO_ENABLED: bool.default(true),
  RATE_LIMIT_ENABLED: bool.default(true),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  logLevel: string;
  databaseUrl: string;
  /** Public URL of the web app (no trailing slash); used for CORS, links and OAuth. */
  webOrigin: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  encryptionKey: string;
  calendar:
    | { mode: 'mock' }
    | { mode: 'google'; clientId: string; clientSecret: string; redirectUri: string };
  email: { mode: 'smtp'; smtpUrl: string; from: string } | { mode: 'console'; from: string };
  demoEnabled: boolean;
  rateLimitEnabled: boolean;
}

const DEV_ENCRYPTION_KEY = 'dev-only-insecure-key-change-me';

/** Empty strings in .env files mean "unset". */
function stripEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => !!entry[1]),
  );
}

export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(stripEmpty(rawEnv));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }
  const env = parsed.data;
  const webOrigin = env.WEB_ORIGIN.replace(/\/+$/, '');
  const isProd = env.NODE_ENV === 'production';

  const hasGoogle = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const calendarMode = env.CALENDAR_PROVIDER ?? (hasGoogle ? 'google' : 'mock');
  if (calendarMode === 'google' && !hasGoogle) {
    throw new Error('CALENDAR_PROVIDER=google requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  }
  if (calendarMode === 'google' && isProd && !env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required in production to store OAuth tokens');
  }

  const emailMode = env.EMAIL_PROVIDER ?? (env.SMTP_URL ? 'smtp' : 'console');
  if (emailMode === 'smtp' && !env.SMTP_URL) {
    throw new Error('EMAIL_PROVIDER=smtp requires SMTP_URL');
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    webOrigin,
    cookieSecure: env.COOKIE_SECURE ?? isProd,
    trustProxy: env.TRUST_PROXY,
    encryptionKey: env.TOKEN_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
    calendar:
      calendarMode === 'google'
        ? {
            mode: 'google',
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
            redirectUri: env.GOOGLE_REDIRECT_URI ?? `${webOrigin}/api/integrations/google/callback`,
          }
        : { mode: 'mock' },
    email:
      emailMode === 'smtp'
        ? { mode: 'smtp', smtpUrl: env.SMTP_URL!, from: env.EMAIL_FROM }
        : { mode: 'console', from: env.EMAIL_FROM },
    demoEnabled: env.DEMO_ENABLED,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED,
  };
}

/** Loads apps/api/.env and the repo-root .env (local development only). */
export function loadDotenvFiles() {
  loadDotenv({ path: ['.env', '../../.env'], quiet: true });
}
