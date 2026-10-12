import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/env';

const base = { DATABASE_URL: 'postgresql://localhost/db' };

describe('loadConfig', () => {
  it('defaults to mock calendar and console email without credentials', () => {
    const config = loadConfig(base);
    expect(config.calendar.mode).toBe('mock');
    expect(config.email.mode).toBe('console');
    expect(config.cookieSecure).toBe(false);
    expect(config.webOrigin).toBe('http://localhost:3000');
  });

  it('switches to Google and SMTP when credentials are present', () => {
    const config = loadConfig({
      ...base,
      WEB_ORIGIN: 'https://meetqueue.example.com/',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      SMTP_URL: 'smtp://user:pass@smtp.example.com:587',
    });
    expect(config.calendar).toEqual({
      mode: 'google',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://meetqueue.example.com/api/integrations/google/callback',
    });
    expect(config.email.mode).toBe('smtp');
  });

  it('lets CALENDAR_PROVIDER=mock override available credentials', () => {
    const config = loadConfig({
      ...base,
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 's',
      CALENDAR_PROVIDER: 'mock',
    });
    expect(config.calendar.mode).toBe('mock');
  });

  it('treats empty strings as unset', () => {
    expect(loadConfig({ ...base, GOOGLE_CLIENT_ID: '', SMTP_URL: '' }).calendar.mode).toBe('mock');
  });

  it('fails fast on unsafe or incomplete configuration', () => {
    expect(() => loadConfig({})).toThrow('DATABASE_URL');
    expect(() => loadConfig({ ...base, CALENDAR_PROVIDER: 'google' })).toThrow('GOOGLE_CLIENT_ID');
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        GOOGLE_CLIENT_ID: 'id',
        GOOGLE_CLIENT_SECRET: 's',
      }),
    ).toThrow('TOKEN_ENCRYPTION_KEY');
    expect(() => loadConfig({ ...base, EMAIL_PROVIDER: 'smtp' })).toThrow('SMTP_URL');
  });

  it('uses secure cookies in production', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });
});

describe('loadDotenvFiles', () => {
  it('prefers .env.local over .env, and app files over the repo root', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const root = mkdtempSync(join(tmpdir(), 'mq-env-'));
    const app = join(root, 'apps', 'api');
    mkdirSync(app, { recursive: true });
    writeFileSync(join(root, '.env'), 'MQ_T_A=root-env\nMQ_T_B=root-env\nMQ_T_C=root-env\n');
    writeFileSync(join(root, '.env.local'), 'MQ_T_A=root-local\nMQ_T_B=root-local\n');
    writeFileSync(join(app, '.env'), 'MQ_T_A=app-env\n');
    writeFileSync(join(app, '.env.local'), 'MQ_T_D=app-local\n');
    const { loadDotenvFiles } = await import('../../src/env');
    try {
      loadDotenvFiles(app);
      expect(process.env.MQ_T_A).toBe('app-env');
      expect(process.env.MQ_T_B).toBe('root-local');
      expect(process.env.MQ_T_C).toBe('root-env');
      expect(process.env.MQ_T_D).toBe('app-local');
    } finally {
      for (const key of ['MQ_T_A', 'MQ_T_B', 'MQ_T_C', 'MQ_T_D']) delete process.env[key];
    }
  });
});
