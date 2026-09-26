import { error } from '@sveltejs/kit';
import type { Me, ServerMeta, ServerStats } from '@smto/mc-contracts';

import { ApiError, apiAuthed, apiPublic } from '$lib/server/api';
import type { PageServerLoad } from './$types';

/**
 * One server, and what the signed-in person did on it.
 *
 * Two calls rather than one, because they answer different questions and have
 * different audiences: the metadata is public and the same for everybody, and
 * the statistics are personal. A visitor who is not signed in gets the first
 * half of the page, which is the half worth linking to.
 */
export const load: PageServerLoad = async ({ params, locals, cookies }) => {
  let server: ServerMeta;

  try {
    server = await apiPublic<ServerMeta>(`/api/v1/public/servers/${params.id}`);
  } catch (cause) {
    // A hidden or unknown id is the same thing from out here, and the backend
    // deliberately does not distinguish them either.
    if (cause instanceof ApiError && cause.status === 404) {
      error(404, 'server_not_found');
    }

    throw cause;
  }

  if (!locals.account) {
    return { server, linked: false, stats: null };
  }

  const me = await apiAuthed<Me>(cookies, '/api/v1/me');
  const stats: ServerStats | null =
    me.stats.servers.find((entry) => entry.serverId === server.id) ?? null;

  return { server, linked: me.link !== null, stats };
};
