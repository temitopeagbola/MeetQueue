import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  isExclusionViolation,
  isUniqueViolation,
  parseInput,
} from '../../src/lib/errors';

describe('isExclusionViolation', () => {
  it('recognises the error shape Prisma + driver adapters produce for SQLSTATE 23P01', () => {
    const error = Object.assign(new Error('Invalid prisma.booking.create() invocation'), {
      code: 'P2039',
      meta: {
        modelName: 'Booking',
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: { originalCode: '23P01', kind: 'postgres', code: '23P01' },
        },
      },
    });
    expect(isExclusionViolation(error)).toBe(true);
    expect(isUniqueViolation(error)).toBe(false);
  });

  it('ignores unrelated errors', () => {
    expect(isExclusionViolation(new Error('boom'))).toBe(false);
    expect(isExclusionViolation({ code: 'P2039' })).toBe(false);
    expect(isExclusionViolation(null)).toBe(false);
  });

  it('recognises unique violations', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(
      isUniqueViolation({ meta: { driverAdapterError: { cause: { originalCode: '23505' } } } }),
    ).toBe(true);
  });
});

describe('parseInput', () => {
  const schema = z.object({ name: z.string().min(1, 'Name is required'), age: z.number() });

  it('returns parsed data', () => {
    expect(parseInput(schema, { name: 'Ada', age: 36 })).toEqual({ name: 'Ada', age: 36 });
  });

  it('throws a 400 AppError with per-field messages', () => {
    try {
      parseInput(schema, { name: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(400);
      expect((error as AppError).fields).toMatchObject({
        name: ['Name is required'],
        age: expect.any(Array),
      });
    }
  });
});
