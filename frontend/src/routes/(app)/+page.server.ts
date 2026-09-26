import { redirect } from '@sveltejs/kit';

import { base } from '$app/paths';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.account) {
    redirect(303, `${base}/dashboard`);
  }

  // The server list itself comes from the layout load, which the header needs
  // on every page anyway. Shown here so somebody who is not signed in still
  // sees what the network is.
  return { error: url.searchParams.get('error') };
};
