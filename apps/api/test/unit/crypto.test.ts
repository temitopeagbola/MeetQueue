import { describe, expect, it } from 'vitest';
import {
  createCipher,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from '../../src/lib/crypto';

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong horse', a)).toBe(false);
  });

  it('never matches the dummy hash or malformed input', async () => {
    expect(await verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('tokens', () => {
  it('creates URL-safe random tokens and stable hashes', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('cipher (AES-256-GCM)', () => {
  const cipher = createCipher('unit-test-secret');

  it('round-trips and uses a fresh IV each time', () => {
    const a = cipher.encrypt('ya29.secret-token');
    const b = cipher.encrypt('ya29.secret-token');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('ya29.secret-token');
  });

  it('detects tampering and wrong keys', () => {
    const payload = cipher.encrypt('secret');
    const [v, iv, tag, data] = payload.split('.');
    const flipped = `${v}.${iv}.${tag}.${data!.slice(0, -2)}AA`;
    expect(() => cipher.decrypt(flipped)).toThrow();
    expect(() => createCipher('other-secret').decrypt(payload)).toThrow();
    expect(() => cipher.decrypt('not-a-payload')).toThrow('Unrecognised');
  });
});
