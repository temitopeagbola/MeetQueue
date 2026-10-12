import type { IntegrationsDTO } from '@meetqueue/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomToken } from '../lib/crypto';
import { currentUser, requireUser } from '../lib/session';

const STATE_COOKIE = 'mq_oauth_state';
const callbackQuery = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().max(200).optional(),
  error: z.string().max(200).optional(),
});

export async function integrationRoutes(app: FastifyInstance) {
  const { db, calendar, config, emailProvider } = app.deps;
  app.addHook('preHandler', requireUser(app));

  const settingsUrl = (status: string) =>
    `${config.webOrigin}/dashboard/integrations?calendar=${encodeURIComponent(status)}`;
  const stateCookie = {
    path: '/api/integrations',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    maxAge: 10 * 60,
  };

  app.get('/', async (request): Promise<IntegrationsDTO> => {
    const user = currentUser(request);
    const connection = await db.calendarConnection.findUnique({ where: { userId: user.id } });
    return {
      calendar: {
        mode: calendar.mode,
        connected: !!connection,
        provider: connection ? (connection.provider as 'google' | 'mock') : null,
        accountEmail: connection?.accountEmail ?? null,
        error: connection?.lastError ?? null,
        restriction: user.isDemo
          ? 'The shared demo account always uses the mock calendar so visitors never connect a real Google account to it.'
          : calendar.mode === 'mock'
            ? 'Google OAuth credentials are not configured on this server, so the mock calendar provider is used.'
            : null,
      },
      email: { mode: emailProvider.name },
    };
  });

  /** Step 1: browser navigates here; we bind a random state to a cookie and go to consent. */
  app.get('/google/connect', async (request, reply) => {
    const user = currentUser(request);
    const state = randomToken(24);
    reply.setCookie(STATE_COOKIE, state, stateCookie);
    return reply.redirect(calendar.providerFor(user).authorizationUrl(state));
  });

  /** Step 2: Google (or the mock) redirects back with ?code&state. */
  app.get('/google/callback', async (request, reply) => {
    const user = currentUser(request);
    const query = callbackQuery.safeParse(request.query);
    const expected = request.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: stateCookie.path });
    if (!query.success || query.data.error || !query.data.code) {
      return reply.redirect(
        settingsUrl(query.success && query.data.error === 'access_denied' ? 'denied' : 'error'),
      );
    }
    if (!expected || query.data.state !== expected)
      return reply.redirect(settingsUrl('state-mismatch'));
    try {
      await calendar.connect(user, query.data.code);
      return reply.redirect(settingsUrl('connected'));
    } catch (error) {
      request.log.error({ err: error }, 'calendar connect failed');
      return reply.redirect(settingsUrl('error'));
    }
  });

  app.delete('/calendar', async (request) => {
    const user = currentUser(request);
    await calendar.disconnect(user.id);
    return { ok: true };
  });
}
