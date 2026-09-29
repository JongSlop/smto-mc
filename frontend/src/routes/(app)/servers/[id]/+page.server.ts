import { error } from '@sveltejs/kit';
import type { ServerMeta, ServerTotals } from '@smto/mc-contracts';

import { ApiError, apiPublic } from '$lib/server/api';
import type { PageServerLoad } from './$types';

/**
 * One server, and what everybody who has played on it has done.
 *
 * Both halves are public and the same for every visitor, so the page needs no
 * session and the same address shows the same thing to everybody, which is what
 * makes it worth linking to. The numbers are the server's own, added up across
 * players: a person's numbers on a server are on their dashboard, narrowed
 * there with the server filter.
 */
export const load: PageServerLoad = async ({ params }) => {
  try {
    const [server, totals] = await Promise.all([
      apiPublic<ServerMeta>(`/api/v1/public/servers/${params.id}`),
      apiPublic<ServerTotals>(`/api/v1/public/servers/${params.id}/stats`),
    ]);

    return { server, totals };
  } catch (cause) {
    // A hidden or unknown id is the same thing from out here, and the backend
    // deliberately does not distinguish them either.
    if (cause instanceof ApiError && cause.status === 404) {
      error(404, 'server_not_found');
    }

    throw cause;
  }
};
