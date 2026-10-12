import { describe, expect, it } from 'vitest';
import {
  endToMinutes,
  intervalProblem,
  nextInterval,
  startToMinutes,
} from '@/lib/availability-draft';

describe('availability draft helpers', () => {
  it('treats cleared or partial time inputs as missing instead of throwing', () => {
    expect(startToMinutes('')).toBeNull();
    expect(startToMinutes('9:')).toBeNull();
    expect(endToMinutes('')).toBeNull();
    expect(intervalProblem({ start: '', end: '17:00' })).toBe('Enter a start and an end time');
    expect(nextInterval({ start: '09:00', end: '' })).toBeNull();
  });

  it('reads 00:00 as an end of midnight and flags inverted windows', () => {
    expect(endToMinutes('00:00')).toBe(1440);
    expect(intervalProblem({ start: '22:00', end: '00:00' })).toBeNull();
    expect(intervalProblem({ start: '17:00', end: '09:00' })).toBe('Ends before it starts');
  });

  it('suggests the next window after the last one, capped at midnight', () => {
    expect(nextInterval()).toEqual({ start: '09:00', end: '17:00' });
    expect(nextInterval({ start: '09:00', end: '12:00' })).toEqual({
      start: '12:00',
      end: '14:00',
    });
    expect(nextInterval({ start: '20:00', end: '23:00' })).toEqual({
      start: '23:00',
      end: '00:00',
    });
    expect(nextInterval({ start: '20:00', end: '00:00' })).toBeNull();
  });
});
