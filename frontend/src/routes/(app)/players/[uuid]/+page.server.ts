import { error, fail, redirect } from '@sveltejs/kit';
import { ADMIN_ROLE, type MinecraftLink, type PlayerProfile } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { ApiError, apiAuthed } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

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
  let own: MinecraftLink | null;

  try {
    // The reader's own link alongside, to know whether this page is theirs.
    // One indexed lookup rather than the whole of /me.
    [profile, own] = await Promise.all([
      apiAuthed<PlayerProfile>(cookies, `/api/v1/players/${params.uuid}`),
      apiAuthed<MinecraftLink | null>(cookies, '/api/v1/me/link'),
    ]);
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

  return {
    profile,
    server,
    // Decides which form to draw, and nothing else. Neither is trusted for
    // anything: the backend checks who is asking on every write.
    isOwn: own?.mcUuid === profile.mcUuid,
    canModerate: locals.account.roles.includes(ADMIN_ROLE),
  };
};

/**
 * What a failed call says, in a code the page has copy for.
 *
 * A message over the limit comes back from the backend as a generic validation
 * failure, which would read as "check the form" on a form with one field. Naming
 * it says what to do about it.
 */
function reason(cause: unknown): string {
  if (cause instanceof ApiError) {
    return cause.code === 'validation_failed' ? 'profile_message_invalid' : cause.code;
  }

  return 'request_failed';
}

export const actions: Actions = {
  /** The owner's speech bubble. An empty field removes it. */
  save: async ({ request, cookies }) => {
    const message = (await request.formData()).get('message');

    try {
      await apiAuthed<{ message: string | null }>(cookies, '/api/v1/me/message', {
        method: 'PUT',
        body: { message: typeof message === 'string' ? message : '' },
      });
      return { saved: true };
    } catch (cause) {
      return fail(400, { error: reason(cause) });
    }
  },

  remove: async ({ cookies }) => {
    try {
      await apiAuthed<{ message: string | null }>(cookies, '/api/v1/me/message', {
        method: 'PUT',
        body: { message: null },
      });
      return { removed: true };
    } catch (cause) {
      return fail(400, { error: reason(cause) });
    }
  },

  /** An admin taking somebody else's message down. */
  moderate: async ({ params, cookies }) => {
    try {
      await apiAuthed<void>(cookies, `/api/v1/admin/players/${params.uuid}/message`, {
        method: 'DELETE',
      });
      return { moderated: true };
    } catch (cause) {
      return fail(400, { error: reason(cause) });
    }
  },
};
