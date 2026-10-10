import type { EmailLogDTO } from '@meetqueue/core';
import type { FastifyInstance } from 'fastify';
import { currentUser, requireUser } from '../lib/session';

/** The host's outbox: every notification MeetQueue sent (or logged) for their bookings. */
export async function emailRoutes(app: FastifyInstance) {
  const { db } = app.deps;
  app.addHook('preHandler', requireUser(app));

  app.get('/', async (request): Promise<{ emails: EmailLogDTO[] }> => {
    const user = currentUser(request);
    const rows = await db.emailLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      emails: rows.map((e) => ({
        id: e.id,
        to: e.to,
        subject: e.subject,
        kind: e.kind,
        provider: e.provider,
        status: e.status,
        hasIcs: e.hasIcs,
        bodyText: e.bodyText,
        error: e.error,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  });
}
