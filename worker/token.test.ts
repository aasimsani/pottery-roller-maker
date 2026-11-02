import { describe, expect, it } from 'vitest';
import { hashSecret, newSecret, parseToken, sameHash } from './token';

describe('session tokens', () => {
  it('parses a token into its session and secret, and refuses anything else', () => {
    expect(parseToken('abc123.s3cr3t')).toEqual({ session: 'abc123', secret: 's3cr3t' });
    expect(parseToken('no-dot')).toBeNull();
    expect(parseToken('a.b.c')).toBeNull();
  });
  it('verifies only the secret that made the hash', async () => {
    const secret = newSecret(), h = await hashSecret(secret);
    expect(await sameHash(h, await hashSecret(secret))).toBe(true);
    expect(await sameHash(h, await hashSecret(newSecret()))).toBe(false);
  });
  it('makes secrets long enough that guessing is hopeless', () => {
    expect(newSecret().length).toBeGreaterThanOrEqual(40);
  });
});
