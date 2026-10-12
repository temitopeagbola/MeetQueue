import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Db } from './db';
import type { AppConfig } from './env';
import type { User } from './generated/prisma/client';
import { createCipher, type Cipher } from './lib/crypto';
import { AppError } from './lib/errors';
import { GoogleCalendarProvider } from './providers/calendar/google';
import { MockCalendarProvider } from './providers/calendar/mock';
import type { CalendarProvider } from './providers/calendar/types';
import { ConsoleEmailProvider } from './providers/email/console';
import { SmtpEmailProvider } from './providers/email/smtp';
import type { EmailProvider } from './providers/email/types';
import { authRoutes } from './routes/auth';
import { availabilityRoutes } from './routes/availability';
import { bookingRoutes } from './routes/bookings';
import { emailRoutes } from './routes/emails';
import { integrationRoutes } from './routes/integrations';
import { manageRoutes } from './routes/manage';
import { meetingTypeRoutes } from './routes/meeting-types';
import { publicRoutes } from './routes/public';
import { BookingService } from './services/bookings';
import { CalendarService } from './services/calendar';
import { Notifier } from './services/notifications';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
  interface FastifyInstance {
    deps: AppDeps;
  }
}

export interface AppDeps {
  config: AppConfig;
  db: Db;
  cipher: Cipher;
  calendar: CalendarService;
  bookings: BookingService;
  notifier: Notifier;
  emailProvider: EmailProvider;
  now: () => Date;
}

export interface BuildAppOptions {
  config: AppConfig;
  db: Db;
  /** Override providers (tests inject mocks with inspectable state). */
  calendarProviders?: { google?: CalendarProvider; mock: CalendarProvider };
  emailProvider?: EmailProvider;
  now?: () => Date;
  logger?: boolean;
}

/** Strips manage-link tokens from logged URLs. */
const redactUrl = (url: string) => url.replace(/\/manage\/[^/?#]+/, '/manage/[redacted]');

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            serializers: {
              req: (req: FastifyRequest) => ({
                method: req.method,
                url: redactUrl(req.url),
                ip: req.ip,
              }),
            },
          },
  });

  const now = options.now ?? (() => new Date());
  const cipher = createCipher(config.encryptionKey);
  const callbackUrl = `${config.webOrigin}/api/integrations/google/callback`;
  const calendarProviders = options.calendarProviders ?? {
    mock: new MockCalendarProvider(callbackUrl),
    ...(config.calendar.mode === 'google'
      ? {
          google: new GoogleCalendarProvider({
            clientId: config.calendar.clientId,
            clientSecret: config.calendar.clientSecret,
            redirectUri: config.calendar.redirectUri,
          }),
        }
      : {}),
  };
  const consoleEmail = new ConsoleEmailProvider((obj, msg) => app.log.info(obj, msg));
  const emailProvider =
    options.emailProvider ??
    (config.email.mode === 'smtp'
      ? new SmtpEmailProvider(config.email.smtpUrl, config.email.from)
      : consoleEmail);

  const calendar = new CalendarService(db, calendarProviders, cipher, app.log);
  const notifier = new Notifier(db, emailProvider, consoleEmail, config.webOrigin, app.log);
  const bookings = new BookingService({ db, calendar, notifier, now, log: app.log });
  app.decorate('deps', { config, db, cipher, calendar, bookings, notifier, emailProvider, now });
  // Let queued notification emails finish before the process exits.
  app.addHook('onClose', async () => bookings.drain());
  app.decorateRequest('user', null);

  // Only JSON bodies: blocks "simple" cross-site form posts as a CSRF backstop.
  app.removeContentTypeParser('text/plain');

  await app.register(cookie);
  await app.register(cors, { origin: config.webOrigin, credentials: true });
  // In-memory limiter: fine for a single Render instance (see README tech-debt notes).
  // When disabled the plugin isn't registered, so per-route `config.rateLimit` is inert.
  if (config.rateLimitEnabled) {
    await app.register(rateLimit, {
      max: 300,
      timeWindow: '1 minute',
      // Behind Netlify every request comes from Netlify's proxy; Netlify passes the visitor's
      // address in this header (see README for the residual risk of direct calls).
      keyGenerator: (req) => {
        const forwarded = req.headers['x-nf-client-connection-ip'];
        return (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.ip;
      },
      errorResponseBuilder: (_req, context) =>
        new AppError(
          429,
          'RATE_LIMITED',
          `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
        ),
    });
  }

  // Defence in depth on top of SameSite=Lax cookies: reject cross-origin writes outright.
  app.addHook('onRequest', async (request) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== config.webOrigin) {
      throw new AppError(403, 'BAD_ORIGIN', 'Cross-origin request blocked.');
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, fields: error.fields },
      });
    }
    const fastifyError = error as { statusCode?: number; code?: string; message?: string };
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).send({
        error: { code: fastifyError.code ?? 'BAD_REQUEST', message: fastifyError.message },
      });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }),
  );

  app.get('/', async () => ({ name: 'MeetQueue API', health: '/api/health' }));

  await app.register(
    async (api) => {
      // Cheap liveness probe (Render health checks hit this; it doesn't wake the database).
      api.get('/health', { config: { rateLimit: false } }, async (request) => {
        const deep = (request.query as { deep?: string }).deep === '1';
        if (deep) await db.$queryRaw`SELECT 1`;
        return { ok: true, time: now().toISOString(), db: deep ? 'ok' : 'skipped' };
      });
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(availabilityRoutes, { prefix: '/availability' });
      await api.register(meetingTypeRoutes, { prefix: '/meeting-types' });
      await api.register(bookingRoutes, { prefix: '/bookings' });
      await api.register(integrationRoutes, { prefix: '/integrations' });
      await api.register(emailRoutes, { prefix: '/emails' });
      await api.register(publicRoutes, { prefix: '/public' });
      await api.register(manageRoutes, { prefix: '/manage' });
    },
    { prefix: '/api' },
  );

  return app;
}
