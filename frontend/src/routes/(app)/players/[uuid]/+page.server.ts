import { error, redirect } from '@sveltejs/kit';
import type { PlayerProfile } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { ApiError, apiAuthed } from '$lib/server/api';
import type { PageServerLoad } from './$types';

/**
 * Somebody's page, reached from a leaderboard row.
 *
 * Behind a session, like the boards it is linked from: the backend closes the
 * endpoint to anonymous callers, and this redirects before asking so a signed
 * out visitor lands somewhere sensible instead of on a 401.
 */
export const load: PageServerLoad = async ({ params, locals, cookies, url }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  let profile: PlayerProfile;

  try {
    profile = await apiAuthed<PlayerProfile>(cookies, `/api/v1/players/${params.uuid}`);
  } catch (cause) {
    // Never linked, unlinked since, or not a UUID at all. The backend gives one
    // answer for all three and so does this.
    if (cause instanceof ApiError && cause.status === 404) {
      error(404, 'profile_not_found');
    }

    throw cause;
  }

  /**
   * Which server the numbers are narrowed to, from the query string.
   *
   * A parameter rather than client state, for the reason the leaderboard gives:
   * a filter is then a real address that survives a reload and can be sent to
   * somebody, and it works with JavaScript off. A server this player has no
   * row on is ignored rather than refused, since a stale link to an archived or
   * hidden server should still show the page, just not narrowed.
   */
  const requested = url.searchParams.get('server');
  const server = profile.stats.servers.some((entry) => entry.serverId === requested)
    ? requested
    : null;

  return { profile, server };
};
