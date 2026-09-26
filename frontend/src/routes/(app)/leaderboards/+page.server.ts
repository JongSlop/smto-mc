import { redirect } from '@sveltejs/kit';
import type { Leaderboard, Leaderboards, MinecraftLink } from '@smto/mc-contracts';

import { base } from '$app/paths';
import { apiAuthed } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
  if (!locals.account) {
    redirect(303, `${base}/`);
  }

  // The link, so the reader's own row can be marked. One indexed lookup rather
  // than the whole of /me, which would join every metric they have.
  const [leaderboards, link] = await Promise.all([
    apiAuthed<Leaderboards>(cookies, '/api/v1/leaderboards'),
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
    metrics: leaderboards.boards.map((board) => board.metric),
    board: selected,
    mcUuid: link?.mcUuid ?? null,
  };
};
