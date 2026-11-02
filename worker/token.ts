// A session token is "<session id>.<secret>". The Session object keeps only the secret's SHA-256 hash,
// so a leaked copy of its storage can't be turned back into a working token.

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 32 random bytes, which is 43 characters and far beyond guessing. */
export const newSecret = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const newSessionId = () => b64url(crypto.getRandomValues(new Uint8Array(12)));

export async function hashSecret(secret: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))));
}

/** Compares two hashes in time that doesn't depend on where they differ. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseToken(token: string): { session: string; secret: string } | null {
  const parts = token.split('.');
  return parts.length === 2 && parts[0] && parts[1] ? { session: parts[0], secret: parts[1] } : null;
}
