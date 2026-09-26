import { error, fail, redirect } from '@sveltejs/kit';
import { uploaderIntentSchema, type Me, type ServiceSession } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { ApiError, apiAuthed } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, parent }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  const { services } = await parent();

  if (!services.uploader.enabled) {
    // Not configured on this deployment, so the page has nothing to offer and
    // the menu entry that leads here is not rendered either.
    error(404, 'uploader_disabled');
  }

  const me = await apiAuthed<Me>(cookies, '/api/v1/me');

  return { link: me.link };
};

export const actions: Actions = {
  /**
   * Mints a sign in link at the uploader and sends the browser straight to it.
   *
   * A POST, and the header entry posts rather than links for the same reason:
   * every call spends a one time credential over there, and links in this app
   * are preloaded on hover.
   *
   * The link is never rendered, only followed. It signs in whoever opens it
   * first, so the shorter its life outside this redirect the better.
   */
  default: async ({ cookies, request }) => {
    // Which half of the library to land on. Anything else is dropped rather
    // than passed along, and the uploader then opens on videos as it does for
    // any link without the parameter.
    const form = await request.formData();
    const intent = uploaderIntentSchema.safeParse(form.get('intent'));

    let session: ServiceSession;

    try {
      session = await apiAuthed<ServiceSession>(cookies, '/api/v1/me/services/uploader/session', {
        method: 'POST',
        body: intent.success ? { intent: intent.data } : {},
      });
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }

    redirect(303, session.url);
  },
};
