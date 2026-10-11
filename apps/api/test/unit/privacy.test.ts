import { describe, expect, it } from 'vitest';
import { maskEmail, maskEmailsIn } from '../../src/lib/privacy';

describe('demo privacy masking', () => {
  it('masks real addresses but keeps sample example.com invitees', () => {
    expect(maskEmail('grace.hopper@gmail.com')).toBe('gr***@gmail.com');
    expect(maskEmail('a@b.io')).toBe('a***@b.io');
    expect(maskEmail('jordan.lee@example.com')).toBe('jordan.lee@example.com');
    expect(maskEmail('broken')).toBe('***');
  });

  it('masks addresses inside email bodies', () => {
    expect(maskEmailsIn('Grace (grace@gmail.com) booked. Reply to ops@corp.co.uk.')).toBe(
      'Grace (gr***@gmail.com) booked. Reply to op***@corp.co.uk.',
    );
  });
});
