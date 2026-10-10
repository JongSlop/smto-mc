import { z } from 'zod';

/**
 * How many players a board shows.
 *
 * Fifty rather than ten: a top list long enough to be worth scrolling at the
 * sizes these servers run at, while still short of a directory of everybody who
 * has ever joined.
 */
export const LEADERBOARD_SIZE = 50;

export const leaderboardEntrySchema = z.object({
  /** 1 based, and dense in the sense that ties are broken rather than shared. */
  rank: z.number().int().positive(),
  mcUuid: z.string(),
  /**
   * Who this is. For a linked profile the name it was linked under. For anybody
   * without a live link, the name Mojang has for the UUID, or if Mojang could
   * not be asked and nothing is cached, the first eight characters of the UUID.
   */
  mcUsername: z.string(),
  /**
   * Whether this player has a live link here. The only difference between
   * the two kinds of row, and what the badge next to a name says.
   */
  linked: z.boolean(),
  /** Summed across every server unless the boards are narrowed to one. */
  value: z.number(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardSchema = z.object({
  metric: z.string(),
  entries: z.array(leaderboardEntrySchema),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;

/** A server that has something on the boards, enough to draw a filter chip. */
export const leaderboardServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconUrl: z.string().nullable(),
  state: z.string(),
});
export type LeaderboardServer = z.infer<typeof leaderboardServerSchema>;

/**
 * One board per featured metric, in the order the metrics are featured.
 *
 * Boards nobody is on yet are left out rather than returned empty, so a fresh
 * network shows one honest message instead of nine empty tables.
 *
 * `server` echoes which server the boards are narrowed to, or null for the
 * whole network. `servers` is every public server that has a ranking on it,
 * whichever one is asked for, so a page can offer the choices without a second
 * call and without offering a server whose boards would be empty.
 */
export const leaderboardsSchema = z.object({
  server: z.string().nullable(),
  servers: z.array(leaderboardServerSchema),
  boards: z.array(leaderboardSchema),
});
export type Leaderboards = z.infer<typeof leaderboardsSchema>;
