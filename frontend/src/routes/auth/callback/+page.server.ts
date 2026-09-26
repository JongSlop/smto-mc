import { redirect } from '@sveltejs/kit';

import { base } from '$app/paths';
import { ApiError, apiPublic } from '$lib/server/api';
import { writeSession } from '$lib/server/session';
import type { PageServerLoad } from './$types';

interface CallbackResult {
  token: string;
  expiresAt: string;
  returnTo: string | null;
}

/**
 * Where the account system sends the browser back to.
 *
 * A GET, because that is what an OAuth redirect is. It is safe to be one: the
 * request carries an authorization code that is single use and bound to a PKCE
 * verifier the backend holds, so a replayed URL exchanges nothing.
 */
export const load: PageServerLoad = async ({ url, cookies }) => {
  const error = url.searchParams.get('error');

  if (error) {
    // The user pressed cancel on the consent screen, or the account system
    // refused. Neither is our error to show a stack trace for.
    redirect(303, `${base}/?error=${encodeURIComponent(error)}`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    redirect(303, `${base}/?error=invalid_callback`);
  }

  let result: CallbackResult;

  try {
    result = await apiPublic<CallbackResult>('/auth/callback', {
      method: 'POST',
      body: { code, state, iss: url.searchParams.get('iss') ?? undefined },
    });
  } catch (caught) {
    const reason = caught instanceof ApiError ? caught.code : 'request_failed';
    redirect(303, `${base}/?error=${encodeURIComponent(reason)}`);
  }

  writeSession(cookies, result.token, result.expiresAt);

  // returnTo comes back from the backend, which stored it when the login
  // started and validated it as a path inside this app. It is not read from the
  // URL here, where anyone could put anything in it.
  redirect(303, `${base}${result.returnTo ?? '/dashboard'}`);
};
