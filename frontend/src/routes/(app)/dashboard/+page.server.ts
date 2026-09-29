import { redirect } from '@sveltejs/kit';
import type { Me } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { apiAuthed } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  // One call for the whole page: account, link and every recorded statistic.
  const me = await apiAuthed<Me>(cookies, '/api/v1/me');

  /**
   * Which server the numbers are narrowed to, from the query string.
   *
   * A parameter rather than client state, so a narrowed view is a real address
   * that survives a reload and works with JavaScript off. A server with no row
   * for this player is ignored rather than refused, since a stale link should
   * still show the page.
   */
  const requested = url.searchParams.get('server');
  const server = me.stats.servers.some((entry) => entry.serverId === requested) ? requested : null;

  return { me, server };
};
