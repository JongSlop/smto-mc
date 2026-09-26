import { redirect } from '@sveltejs/kit';

import { base } from '$app/paths';
import type { PageServerLoad } from './$types';

// The admin area has no landing page of its own worth writing. Servers are what
// somebody comes here for most often.
export const load: PageServerLoad = () => {
  redirect(303, `${base}/admin/servers`);
};
