import { fail, redirect } from '@sveltejs/kit';
import {
  NICKNAME_SETTING,
  PREFERRED_LANGUAGE_SETTING,
  type LinkCodeIssued,
  type Me,
  type MySettingResult,
  type PlayerSettings,
} from '@smto/mc-contracts';

import { base } from '$app/paths';
import { ApiError, apiAuthed } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  const me = await apiAuthed<Me>(cookies, '/api/v1/me');
  const msa = await apiAuthed<{ enabled: boolean }>(cookies, '/api/v1/me/link/msa');

  // Settings hang off the linked profile's UUID, so there is nothing to read
  // without one. Null means "could not be loaded", which hides the list rather
  // than taking the linking page down with it: that page is how somebody gets
  // a link in the first place.
  let settings: Record<string, string> | null = null;

  if (me.link) {
    try {
      settings = (await apiAuthed<PlayerSettings>(cookies, '/api/v1/me/settings')).settings;

      // Nobody who has only ever read the site in its default language has used
      // the switcher, so nothing has stored their language yet. Seeded here,
      // and only when missing: a value is also written from in game, and the
      // browser's default must not overwrite what somebody chose there.
      if (settings[PREFERRED_LANGUAGE_SETTING] === undefined) {
        await apiAuthed<MySettingResult>(
          cookies,
          `/api/v1/me/settings/${PREFERRED_LANGUAGE_SETTING}`,
          { method: 'PUT', body: { value: locals.lang } },
        );
        settings = { ...settings, [PREFERRED_LANGUAGE_SETTING]: locals.lang };
      }
    } catch {
      // Keeps whatever was read before the failure, if anything.
    }
  }

  return {
    link: me.link,
    settings,
    nickname: settings?.[NICKNAME_SETTING] ?? '',
    msaEnabled: msa.enabled,
    // Set by the Microsoft callback when it comes back with something to say.
    error: url.searchParams.get('error'),
    linked: url.searchParams.get('linked'),
  };
};

export const actions: Actions = {
  /** The nickname other servers show for this player. An empty field removes it. */
  nickname: async ({ request, cookies }) => {
    const submitted = (await request.formData()).get('nickname');
    const nickname = typeof submitted === 'string' ? submitted : '';

    try {
      const saved = await apiAuthed<MySettingResult>(
        cookies,
        `/api/v1/me/settings/${NICKNAME_SETTING}`,
        { method: 'PUT', body: { value: nickname } },
      );

      return { nicknameSaved: saved.value !== null, nicknameRemoved: saved.value === null };
    } catch (caught) {
      // The backend's validation answer is a generic one, which on a form with
      // one field reads as "check the form". Naming the problem says what to do.
      const code =
        caught instanceof ApiError
          ? caught.code === 'validation_failed'
            ? 'nickname_invalid'
            : caught.code
          : 'request_failed';

      // What was typed goes back, so a too-long nickname can be shortened
      // rather than retyped.
      return fail(400, { error: code, typedNickname: nickname });
    }
  },

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
