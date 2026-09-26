import type { Account } from '@smto/mc-contracts';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

import { base } from '$app/paths';
import { LANGUAGE_COOKIE, LANGUAGES, type Language } from '$lib/language';
import { apiAuthed } from '$lib/server/api';
import { readSession } from '$lib/server/session';

const COOKIE_PATH = base === '' ? '/' : base;

/** A stored choice wins, otherwise we go by what the browser asks for. */
function pickLanguage(event: RequestEvent): Language {
  const chosen = event.cookies.get(LANGUAGE_COOKIE);

  if (chosen === 'de' || chosen === 'en') {
    return chosen;
  }

  const accepted = event.request.headers.get('accept-language') ?? '';
  return /(^|,)\s*de\b/i.test(accepted) ? 'de' : 'en';
}

/**
 * `?lang=de` on any page switches the stored language and lands back on the
 * same page with the parameter gone, rather than needing a dedicated route.
 * That keeps the switcher working everywhere, including with JavaScript off.
 */
function applyLanguageSwitch(event: RequestEvent): void {
  const requested = event.url.searchParams.get('lang');

  if (!LANGUAGES.includes(requested as Language)) {
    return;
  }

  event.cookies.set(LANGUAGE_COOKIE, requested!, {
    path: COOKIE_PATH,
    maxAge: 60 * 60 * 24 * 365,
  });

  const next = new URL(event.url);
  next.searchParams.delete('lang');
  redirect(303, `${next.pathname}${next.search}`);
}

async function loadAccount(event: RequestEvent): Promise<Account | null> {
  if (!readSession(event.cookies)) {
    return null;
  }

  try {
    return await apiAuthed<Account>(event.cookies, '/api/v1/me/account');
  } catch {
    // Expired or revoked. apiAuthed has already cleared the cookie, so the
    // request continues as an anonymous one rather than erroring out.
    return null;
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  applyLanguageSwitch(event);

  event.locals.lang = pickLanguage(event);
  event.locals.account = await loadAccount(event);

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%lang%', event.locals.lang),
  });
};
