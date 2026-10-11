import {
  bookingCreateSchema,
  slotsQuerySchema,
  type PublicMeetingTypePageDTO,
  type PublicProfileDTO,
} from '@meetqueue/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toPublicHostDTO, toPublicMeetingTypeDTO } from '../dto';
import { notFound, parseInput } from '../lib/errors';

const userParams = z.object({ username: z.string().min(1).max(64) });
const pageParams = userParams.extend({ slug: z.string().min(1).max(64) });

/** Unauthenticated endpoints behind the public booking page. */
export async function publicRoutes(app: FastifyInstance) {
  const { db, bookings } = app.deps;

  app.get('/users/:username', async (request): Promise<PublicProfileDTO> => {
    const { username } = parseInput(userParams, request.params);
    const host = await db.user.findUnique({
      where: { username: username.toLowerCase() },
      include: {
        meetingTypes: {
          where: { isActive: true },
          orderBy: [{ durationMinutes: 'asc' }, { title: 'asc' }],
        },
      },
    });
    if (!host) throw notFound('No one with that booking link was found.');
    return {
      host: toPublicHostDTO(host),
      meetingTypes: host.meetingTypes.map(toPublicMeetingTypeDTO),
    };
  });

  app.get(
    '/users/:username/meeting-types/:slug',
    async (request): Promise<PublicMeetingTypePageDTO> => {
      const { username, slug } = parseInput(pageParams, request.params);
      const { host, meetingType } = await bookings.findBookingPage(username, slug);
      return { host: toPublicHostDTO(host), meetingType: toPublicMeetingTypeDTO(meetingType) };
    },
  );

  app.get('/users/:username/meeting-types/:slug/slots', async (request) => {
    const { username, slug } = parseInput(pageParams, request.params);
    const query = parseInput(slotsQuerySchema, request.query);
    return bookings.slots(username, slug, query);
  });

  app.post(
    '/users/:username/meeting-types/:slug/bookings',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { username, slug } = parseInput(pageParams, request.params);
      const input = parseInput(bookingCreateSchema, request.body);
      const confirmation = await bookings.create(username, slug, input);
      return reply.status(201).send(confirmation);
    },
  );
}
