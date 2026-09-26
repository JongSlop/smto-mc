import { fail, redirect } from '@sveltejs/kit';
import type { LinkCodeIssued, Me } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { ApiError, apiAuthed } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  const me = await apiAuthed<Me>(cookies, '/api/v1/me');
  const msa = await apiAuthed<{ enabled: boolean }>(cookies, '/api/v1/me/link/msa');

  return {
    link: me.link,
    msaEnabled: msa.enabled,
    // Set by the Microsoft callback when it comes back with something to say.
    error: url.searchParams.get('error'),
    linked: url.searchParams.get('linked'),
  };
};

export const actions: Actions = {
  unlink: async ({ cookies }) => {
    try {
      await apiAuthed<void>(cookies, '/api/v1/me/link', { method: 'DELETE' });
      return { unlinked: true };
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }
  },

  /** Mints a code, or shows the one already outstanding. */
  code: async ({ cookies }) => {
    try {
      return {
        code: await apiAuthed<LinkCodeIssued>(cookies, '/api/v1/me/link/code', { method: 'POST' }),
      };
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }
  },

  /**
   * Hands the browser to Microsoft. A POST for the same reason the account
   * login is one: a GET that redirects to an identity provider can be triggered
   * by any page that can load an image.
   */
  msa: async ({ cookies }) => {
    let authorizeUrl: string;

    try {
      ({ authorizeUrl } = await apiAuthed<{ authorizeUrl: string }>(
        cookies,
        '/api/v1/me/link/msa/start',
        { method: 'POST' },
      ));
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }

    redirect(303, authorizeUrl);
  },
};
