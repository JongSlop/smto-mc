import { dev } from '$app/environment';
import { base } from '$app/paths';
import type { Cookies } from '@sveltejs/kit';

/**
 * The session token lives in an HttpOnly cookie and is only ever read on the
 * server. The browser never sees it, so an XSS bug in a page cannot walk off
 * with a session, and no page needs to hold a token in memory.
 */
export const SESSION_COOKIE = 'smto_mc_session';

/**
 * Scoped to this app's subpath.
 *
 * This is not a detail. The account system scopes its own cookies to /account
 * for exactly this reason: several services share smto.dev, and a cookie at /
 * would be sent to all of them. Ours stops at /mc/link.
 */
const COOKIE_PATH = base === '' ? '/' : base;

export function readSession(cookies: Cookies): string | null {
  return cookies.get(SESSION_COOKIE) ?? null;
}

export function writeSession(cookies: Cookies, token: string, expiresAt: string): void {
  cookies.set(SESSION_COOKIE, token, {
    path: COOKIE_PATH,
    httpOnly: true,
    // Lax rather than Strict: somebody following a link here from the account
    // system or from a mail should arrive signed in. Strict would drop the
    // cookie on that first navigation and show them a login they do not need.
    // Every mutation is a form post checked against the origin, so Lax is not
    // the thing holding CSRF back.
    sameSite: 'lax',
    secure: !dev,
    expires: new Date(expiresAt),
  });
}

export function clearSession(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE, { path: COOKIE_PATH });
}
