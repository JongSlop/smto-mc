import { redirect } from '@sveltejs/kit';
import type { Me } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { apiAuthed } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  // One call for the whole page: account, link and every recorded statistic.
  return { me: await apiAuthed<Me>(cookies, '/api/v1/me') };
};
