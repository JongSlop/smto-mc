import { z } from 'zod';

import { playerStatsSchema } from './stats.js';

/**
 * Somebody else's page, as another signed-in player sees it.
 *
 * Deliberately narrower than what the owner gets from `/me`: no account id, no
 * smto.dev username and no word on how the profile was verified. Everything
 * here is either on the leaderboard already or is a number about the game.
 * The statistics carry public servers only, so a test server nobody was meant
 * to see does not show up on somebody's profile.
 */
export const playerProfileSchema = z.object({
  mcUuid: z.string(),
  /** The cached display name. The UUID is the identity, the name only a label. */
  mcUsername: z.string(),
  /** When this profile was linked, which is when the page starts to exist. */
  linkedSince: z.iso.datetime(),
  stats: playerStatsSchema,
});
export type PlayerProfile = z.infer<typeof playerProfileSchema>;
