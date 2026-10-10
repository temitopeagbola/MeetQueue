import { meetingTypeSchema, meetingTypeUpdateSchema } from '@meetqueue/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toMeetingTypeDTO } from '../dto';
import { conflict, isUniqueViolation, notFound, parseInput } from '../lib/errors';
import { currentUser, requireUser } from '../lib/session';

const idParams = z.object({ id: z.uuid({ error: 'Invalid id' }) });
const slugTaken = () =>
  conflict('SLUG_TAKEN', 'You already have a meeting type with that URL.', {
    slug: ['Already in use'],
  });

export async function meetingTypeRoutes(app: FastifyInstance) {
  const { db } = app.deps;
  app.addHook('preHandler', requireUser(app));

  const findOwned = async (userId: string, id: string) => {
    const meetingType = await db.meetingType.findFirst({ where: { id, userId } });
    if (!meetingType) throw notFound('Meeting type not found.');
    return meetingType;
  };

  app.get('/', async (request) => {
    const user = currentUser(request);
    const types = await db.meetingType.findMany({
      where: { userId: user.id },
      orderBy: [{ isActive: 'desc' }, { durationMinutes: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } } },
    });
    return { meetingTypes: types.map((t) => toMeetingTypeDTO(t, t._count.bookings)) };
  });

  app.get('/:id', async (request) => {
    const user = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    return { meetingType: toMeetingTypeDTO(await findOwned(user.id, id)) };
  });

  app.post('/', async (request, reply) => {
    const user = currentUser(request);
    const input = parseInput(meetingTypeSchema, request.body);
    try {
      const created = await db.meetingType.create({ data: { ...input, userId: user.id } });
      return reply.status(201).send({ meetingType: toMeetingTypeDTO(created) });
    } catch (error) {
      if (isUniqueViolation(error)) throw slugTaken();
      throw error;
    }
  });

  app.patch('/:id', async (request) => {
    const user = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    const input = parseInput(meetingTypeUpdateSchema, request.body);
    await findOwned(user.id, id);
    try {
      const updated = await db.meetingType.update({ where: { id }, data: input });
      return { meetingType: toMeetingTypeDTO(updated) };
    } catch (error) {
      if (isUniqueViolation(error)) throw slugTaken();
      throw error;
    }
  });

  /** Hard-deletes unused types; types with booking history must be deactivated instead. */
  app.delete('/:id', async (request, reply) => {
    const user = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    await findOwned(user.id, id);
    const bookings = await db.booking.count({ where: { meetingTypeId: id } });
    if (bookings > 0) {
      throw conflict(
        'HAS_BOOKINGS',
        'This meeting type has bookings. Turn it off instead so the history is kept.',
      );
    }
    await db.meetingType.delete({ where: { id } });
    return reply.status(204).send();
  });
}
