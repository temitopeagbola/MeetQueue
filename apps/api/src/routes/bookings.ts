import { cancelSchema } from '@meetqueue/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toHostBookingDTO } from '../dto';
import type { Prisma } from '../generated/prisma/client';
import { parseInput } from '../lib/errors';
import { currentUser, requireUser } from '../lib/session';

const listQuery = z.object({
  scope: z.enum(['upcoming', 'past', 'cancelled']).default('upcoming'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const idParams = z.object({ id: z.uuid({ error: 'Invalid id' }) });

/** Host-side booking list and cancellation. */
export async function bookingRoutes(app: FastifyInstance) {
  const { db, bookings, now } = app.deps;
  app.addHook('preHandler', requireUser(app));

  app.get('/', async (request) => {
    const user = currentUser(request);
    const { scope, limit } = parseInput(listQuery, request.query);
    const current = now();
    const filters: Record<typeof scope, Prisma.BookingWhereInput> = {
      upcoming: { status: 'CONFIRMED', endsAt: { gte: current } },
      past: { status: 'CONFIRMED', endsAt: { lt: current } },
      cancelled: { status: 'CANCELLED' },
    };
    const [rows, upcoming, past, cancelled] = await Promise.all([
      db.booking.findMany({
        where: { hostId: user.id, ...filters[scope] },
        orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' },
        take: limit,
        include: { meetingType: true },
      }),
      db.booking.count({ where: { hostId: user.id, ...filters.upcoming } }),
      db.booking.count({ where: { hostId: user.id, ...filters.past } }),
      db.booking.count({ where: { hostId: user.id, ...filters.cancelled } }),
    ]);
    return { bookings: rows.map(toHostBookingDTO), counts: { upcoming, past, cancelled } };
  });

  app.post('/:id/cancel', async (request) => {
    const user = currentUser(request);
    const { id } = parseInput(idParams, request.params);
    const { reason } = parseInput(cancelSchema, request.body);
    const booking = await bookings.cancelByHost(user.id, id, reason);
    return { booking: toHostBookingDTO(booking) };
  });
}
