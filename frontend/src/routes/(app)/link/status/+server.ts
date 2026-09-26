import { json } from '@sveltejs/kit';
import type { MinecraftLink } from '@smto/mc-contracts';

import { ApiError, apiAuthed } from '$lib/server/api';
import type { RequestHandler } from './$types';

/**
 * What the link page polls while a code is on screen.
 *
 * It exists because the browser cannot call the backend directly: the session
 * lives in an HttpOnly cookie that only this server reads, and the public
 * passthrough deliberately forwards no credentials. So the poll lands here and
 * this hands it on with the session attached.
 *
 * Answers `{ linked: false }` rather than a 401 when the session has gone. The
 * poller's job is to notice a link appearing, not to police the session; the
 * next navigation will bounce them to the landing page anyway, and a 401 here
 * would only turn a quiet background request into a console error.
 */
export const GET: RequestHandler = async ({ cookies }) => {
  try {
    // A null link comes back as an empty body, which `parse` hands over as
    // undefined rather than null, so this is a truthiness test and not a
    // comparison against null. Getting that wrong reports an unlinked account
    // as linked with no username, and the page then celebrates a link that
    // never happened.
    const link = await apiAuthed<MinecraftLink | null>(cookies, '/api/v1/me/link');
    return json({ linked: Boolean(link), username: link?.mcUsername ?? null });
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ linked: false, username: null });
    }
    throw error;
  }
};
