import { loginSchema, signupSchema } from '@meetqueue/core';
import type { FastifyInstance } from 'fastify';
import { toUserDTO } from '../dto';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from '../lib/crypto';
import { AppError, conflict, isUniqueViolation, notFound, parseInput } from '../lib/errors';
import { currentUser, endSession, requireUser, startSession } from '../lib/session';
import { ensureDemoAccount } from '../services/demo';

const authLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

/** New hosts start with Mon–Fri 09:00–17:00 and one meeting type, so their page works at once. */
const DEFAULT_RULES = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

export async function authRoutes(app: FastifyInstance) {
  const { db, config } = app.deps;

  app.post('/signup', { config: authLimit }, async (request, reply) => {
    const input = parseInput(signupSchema, request.body);
    const existing = await db.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      const fields: Record<string, string[]> = {};
      if (existing.email === input.email) fields.email = ['An account with this email already exists'];
      if (existing.username === input.username) fields.username = ['That username is taken'];
      throw conflict('ACCOUNT_EXISTS', Object.values(fields)[0]![0]!, fields);
    }
    try {
      const user = await db.user.create({
        data: {
          email: input.email,
          name: input.name,
          username: input.username,
          timezone: input.timezone,
          passwordHash: await hashPassword(input.password),
          availability: { create: DEFAULT_RULES },
          meetingTypes: {
            create: {
              slug: '30min',
              title: '30 minute meeting',
              description: 'A quick call to talk things through.',
              durationMinutes: 30,
              slotIntervalMinutes: 30,
              bufferAfterMinutes: 10,
              minNoticeMinutes: 240,
              maxDaysAhead: 60,
            },
          },
        },
      });
      await startSession(app, reply, user.id);
      return reply.status(201).send({ user: toUserDTO(user) });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('ACCOUNT_EXISTS', 'That email or username is taken.');
      throw error;
    }
  });

  app.post('/login', { config: authLimit }, async (request, reply) => {
    const input = parseInput(loginSchema, request.body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    // Always run scrypt so response time doesn't reveal which emails exist.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid || user.isDemo) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    await startSession(app, reply, user.id);
    return { user: toUserDTO(user) };
  });

  app.post('/demo', { config: authLimit }, async (_request, reply) => {
    if (!config.demoEnabled) throw notFound('The demo is disabled on this server.');
    const user = await ensureDemoAccount(db, { encryptionKey: config.encryptionKey, now: app.deps.now() });
    await startSession(app, reply, user.id);
    return { user: toUserDTO(user) };
  });

  app.post('/demo/reset', { preHandler: requireUser(app), config: authLimit }, async (request) => {
    const user = currentUser(request);
    if (!user.isDemo) throw new AppError(403, 'FORBIDDEN', 'Only the demo account can be reset.');
    await ensureDemoAccount(db, { encryptionKey: config.encryptionKey, now: app.deps.now(), reset: true });
    return { ok: true };
  });

  app.post('/logout', async (request, reply) => {
    await endSession(app, request, reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: requireUser(app) }, async (request) => ({
    user: toUserDTO(currentUser(request)),
  }));
}
