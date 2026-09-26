import { createHash, randomBytes } from 'node:crypto';

/**
 * RFC 7636 PKCE, S256 only.
 *
 * Both authorization flows this service runs need it. The account system
 * requires PKCE from every client, public or confidential, and Microsoft's
 * `consumers` endpoint expects it too. Plain is not offered: it proves nothing
 * an attacker who already has the redirect cannot also produce.
 */
export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  // 32 bytes base64url is 43 characters, inside the 43 to 128 the RFC allows.
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: challengeFor(verifier) };
}

export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** A random, URL-safe value for `state` and `nonce`. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
