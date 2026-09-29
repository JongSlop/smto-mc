import { redirect } from '@sveltejs/kit';
import type { Leaderboard, Leaderboards, MinecraftLink } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { ApiError, apiAuthed } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  /**
   * Which server the boards are counted on, from the query string.
   *
   * Asked of the backend rather than filtered here, because a board is a top ten
   * and the ten on one server are not the ten of the whole network with the
   * rest thrown away. A server the backend does not know, or that is not public,
   * is ignored rather than refused: a stale link should still show the boards,
   * just not narrowed.
   */
  const requestedServer = url.searchParams.get('server');

  async function fetchBoards(): Promise<Leaderboards> {
    if (requestedServer) {
      try {
        return await apiAuthed<Leaderboards>(
          cookies,
          `/api/v1/leaderboards?server=${encodeURIComponent(requestedServer)}`,
        );
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 404)) {
          throw cause;
        }
      }
    }

    return apiAuthed<Leaderboards>(cookies, '/api/v1/leaderboards');
  }

  // The link, so the reader's own row can be marked. One indexed lookup rather
  // than the whole of /me, which would join every metric they have.
  const [leaderboards, link] = await Promise.all([
    fetchBoards(),
    apiAuthed<MinecraftLink | null>(cookies, '/api/v1/me/link'),
  ]);

  /**
   * Which board is open, from the query string.
   *
   * A parameter rather than client side state, so a tab is a real address:
   * it survives a reload, it can be linked to somebody, and the page works
   * with JavaScript switched off. An unknown or missing metric falls back to
   * the first board rather than erroring, since the set of boards changes with
   * what the network has recorded.
   */
  const requested = url.searchParams.get('metric');
  const selected: Leaderboard | null =
    leaderboards.boards.find((board) => board.metric === requested) ??
    leaderboards.boards[0] ??
    null;

  return {
    server: leaderboards.server,
    // Not `servers`: the layout above already returns every public server under
    // that name, and this list is the narrower one of servers with a ranking.
    boardServers: leaderboards.servers,
    metrics: leaderboards.boards.map((board) => board.metric),
    board: selected,
    mcUuid: link?.mcUuid ?? null,
  };
};
