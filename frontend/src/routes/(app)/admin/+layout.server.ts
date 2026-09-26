import { error, redirect } from '@sveltejs/kit';
import { ADMIN_ROLE } from '@smto/mc-contracts';

import { base } from '$app/paths';
import type { LayoutServerLoad } from './$types';

/**
 * Gate for every admin page underneath, so no individual page has to remember.
 *
 * The role comes from the account system and is re-read on a schedule by the
 * backend, so a demotion takes effect here without anybody logging out. This
 * check is a courtesy that keeps the pages from rendering; the backend refuses
 * the calls regardless.
 */
export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  if (!locals.account.roles.includes(ADMIN_ROLE)) {
    error(403, 'insufficient_role');
  }

  return {};
};
