import { cancelSchema, rescheduleSchema, slotsQuerySchema } from '@meetqueue/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../lib/errors';

const tokenParams = z.object({ token: z.string().min(20).max(100) });
const writeLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

/**
 * Invitee self-service, authorised by the unguessable token in their manage link. The token
 * is hashed before lookup and redacted from request logs.
 */
export async function manageRoutes(app: FastifyInstance) {
  const { bookings } = app.deps;

  app.get('/:token', async (request) => {
    const { token } = parseInput(tokenParams, request.params);
    return { booking: await bookings.getByToken(token) };
  });

  app.get('/:token/slots', async (request) => {
    const { token } = parseInput(tokenParams, request.params);
    const query = parseInput(slotsQuerySchema, request.query);
    return bookings.slotsForReschedule(token, query);
  });

  app.post('/:token/reschedule', { config: writeLimit }, async (request) => {
    const { token } = parseInput(tokenParams, request.params);
    const { start } = parseInput(rescheduleSchema, request.body);
    return { booking: await bookings.reschedule(token, start) };
  });

  app.post('/:token/cancel', { config: writeLimit }, async (request) => {
    const { token } = parseInput(tokenParams, request.params);
    const { reason } = parseInput(cancelSchema, request.body);
    return { booking: await bookings.cancelByInvitee(token, reason) };
  });

  app.get('/:token/ics', async (request, reply) => {
    const { token } = parseInput(tokenParams, request.params);
    const ics = await bookings.icsByToken(token);
    return reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('content-disposition', 'attachment; filename="meetqueue-booking.ics"')
      .header('cache-control', 'no-store')
      .send(ics);
  });
}
