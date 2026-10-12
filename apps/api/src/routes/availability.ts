import { availabilityUpdateSchema, type AvailabilityDTO } from '@meetqueue/core';
import type { FastifyInstance } from 'fastify';
import { parseInput } from '../lib/errors';
import { currentUser, requireUser } from '../lib/session';

export async function availabilityRoutes(app: FastifyInstance) {
  const { db } = app.deps;
  app.addHook('preHandler', requireUser(app));

  const load = async (userId: string, timezone: string): Promise<AvailabilityDTO> => {
    const rules = await db.availabilityRule.findMany({
      where: { userId },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      select: { weekday: true, startMinute: true, endMinute: true },
    });
    return { timezone, rules };
  };

  app.get('/', async (request) => {
    const user = currentUser(request);
    return load(user.id, user.timezone);
  });

  /** Replaces the whole weekly schedule atomically. */
  app.put('/', async (request) => {
    const user = currentUser(request);
    const input = parseInput(availabilityUpdateSchema, request.body);
    await db.$transaction([
      db.availabilityRule.deleteMany({ where: { userId: user.id } }),
      db.availabilityRule.createMany({
        data: input.rules.map((rule) => ({ ...rule, userId: user.id })),
      }),
      db.user.update({ where: { id: user.id }, data: { timezone: input.timezone } }),
    ]);
    return load(user.id, input.timezone);
  });
}
