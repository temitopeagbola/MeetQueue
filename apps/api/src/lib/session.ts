import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '../generated/prisma/client';
import { randomToken, sha256 } from './crypto';
import { unauthorized } from './errors';

export const SESSION_COOKIE = 'mq_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions(app: FastifyInstance) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: app.deps.config.cookieSecure,
  };
}

export async function startSession(app: FastifyInstance, reply: FastifyReply, userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await app.deps.db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  // Opportunistic cleanup of this user's expired sessions.
  await app.deps.db.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions(app), expires: expiresAt });
}

export async function endSession(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await app.deps.db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  reply.clearCookie(SESSION_COOKIE, cookieOptions(app));
}

async function loadUser(app: FastifyInstance, request: FastifyRequest): Promise<User | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token || token.length > 100) return null;
  const session = await app.deps.db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/** Route-level preHandler: populates request.user or responds 401. */
export function requireUser(app: FastifyInstance) {
  return async (request: FastifyRequest) => {
    request.user = await loadUser(app, request);
    if (!request.user) throw unauthorized();
  };
}

/** For handlers behind requireUser. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw unauthorized();
  return request.user;
}
