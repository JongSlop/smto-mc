import { z } from 'zod';

/**
 * How many players a board shows.
 *
 * Ten is the length people expect from a top list, and it is short enough that
 * nine boards fit on one page without it turning into a directory of everybody
 * who has ever joined.
 */
export const LEADERBOARD_SIZE = 10;

export const leaderboardEntrySchema = z.object({
  /** 1 based, and dense in the sense that ties are broken rather than shared. */
  rank: z.number().int().positive(),
  mcUuid: z.string(),
  /** The cached display name, which is why only linked profiles appear. */
  mcUsername: z.string(),
  /** Summed across every server, so these are counters only. */
  value: z.number(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardSchema = z.object({
  metric: z.string(),
  entries: z.array(leaderboardEntrySchema),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;

/**
 * One board per featured metric, in the order the metrics are featured.
 *
 * Boards nobody is on yet are left out rather than returned empty, so a fresh
 * network shows one honest message instead of nine empty tables.
 */
export const leaderboardsSchema = z.object({
  boards: z.array(leaderboardSchema),
});
export type Leaderboards = z.infer<typeof leaderboardsSchema>;
