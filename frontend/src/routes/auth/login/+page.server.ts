import { redirect } from '@sveltejs/kit';

import { base } from '$app/paths';
import { apiPublic } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

/**
 * Starting a login is a POST, not a link.
 *
 * A GET that redirects somebody to an identity provider is something any page
 * on the internet can trigger by embedding an image, which is how login CSRF
 * works. Coming through a form post means SvelteKit's origin check has already
 * run before we send anyone anywhere.
 */
export const load: PageServerLoad = () => {
  redirect(303, `${base}/`);
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (locals.account) {
      redirect(303, `${base}/dashboard`);
    }

    const form = await request.formData();
    const requested = form.get('returnTo');

    const { authorizeUrl } = await apiPublic<{ authorizeUrl: string }>('/auth/start', {
      method: 'POST',
      body: {
        // Only a path inside this app is passed on. The backend refuses
        // anything else too, but rejecting it here keeps an obviously wrong
        // value from travelling any further.
        ...(typeof requested === 'string' && /^\/[^/\\]/.test(requested)
          ? { returnTo: requested }
          : {}),
      },
    });

    redirect(303, authorizeUrl);
  },
};
