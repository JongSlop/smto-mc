import { redirect } from '@sveltejs/kit';
import type { MinecraftLink } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { ApiError, apiPublic } from '$lib/server/api';
import type { PageServerLoad } from './$types';

/**
 * Where Microsoft sends the browser back to.
 *
 * The whole outcome is decided here and the person is sent back to the linking
 * page with a result, so there is never a URL carrying an authorization code
 * sitting in somebody's history as a page they can reload.
 *
 * This route does not require a session. The `state` is what authenticates the
 * call, and the backend takes the account from the transaction it stored when
 * the flow started rather than from whoever is signed in now.
 */
export const load: PageServerLoad = async ({ url }) => {
  const failure = url.searchParams.get('error');

  if (failure) {
    // The user pressed cancel, or Microsoft refused. `error_description` is
    // Microsoft's own prose and is not shown: it is untranslated, often very
    // long, and occasionally mentions internal identifiers.
    redirect(303, `${base}/settings?error=msa_token_exchange_failed`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    redirect(303, `${base}/settings?error=unknown_state`);
  }

  let link: MinecraftLink;

  try {
    link = await apiPublic<MinecraftLink>('/api/v1/me/link/msa/callback', {
      method: 'POST',
      body: { code, state },
    });
  } catch (caught) {
    const reason = caught instanceof ApiError ? caught.code : 'request_failed';
    redirect(303, `${base}/settings?error=${encodeURIComponent(reason)}`);
  }

  redirect(303, `${base}/settings?linked=${encodeURIComponent(link.mcUsername)}`);
};
