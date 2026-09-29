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
/**
 * How long the speech bubble can be, in characters a person would count.
 *
 * Long enough for a sentence and short enough to stay a bubble. Counted in
 * code points rather than UTF-16 units, so an emoji is one and not two.
 */
export const PROFILE_MESSAGE_MAX = 80;

/**
 * What is left of a message once it can safely be shown to strangers.
 *
 * Control characters, newlines and tabs become spaces, and runs of whitespace
 * collapse, so a bubble is one line of text however it was pasted. Invisible
 * format characters go too: the bidirectional overrides can make a line read
 * backwards and the zero width ones can pad a message with nothing. The zero
 * width joiner is the exception, because emoji sequences such as a family or a
 * flag with a skin tone are held together by it.
 */
export function normaliseProfileMessage(value: string): string {
  return value
    .replace(/[\p{Cc}]/gu, ' ')
    .replace(/(?!\u200D)[\p{Cf}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * The body of `PUT /me/message`. An empty message, or null, removes the bubble.
 *
 * Normalised on the way in, so what is stored is what is shown and nothing
 * downstream has to remember to clean it. The cap before normalising is only a
 * guard against being handed megabytes to chew on; the real limit is applied to
 * the cleaned text.
 */
export const setProfileMessageSchema = z.object({
  message: z
    .string()
    .max(1000)
    .nullable()
    .transform((value) => (value === null ? null : normaliseProfileMessage(value) || null))
    .refine((value) => value === null || [...value].length <= PROFILE_MESSAGE_MAX, {
      message: `at most ${PROFILE_MESSAGE_MAX} characters`,
    }),
});
export type SetProfileMessageInput = z.infer<typeof setProfileMessageSchema>;

export const playerProfileSchema = z.object({
  mcUuid: z.string(),
  /** The name to show. The UUID is the identity, the name only a label. */
  mcUsername: z.string(),
  /**
   * Whether the player has a live link here. A page also exists for a player
   * without one, whether they never linked or unlinked since, as long as
   * something has been recorded for them, so a leaderboard row can always be
   * opened. Those pages have no message and no link date, and say so.
   */
  linked: z.boolean(),
  /** When the profile was linked, or null for a player who never linked. */
  linkedSince: z.iso.datetime().nullable(),
  /** What the player has chosen to say, shown as a speech bubble. Null for nothing. */
  message: z.string().nullable(),
  stats: playerStatsSchema,
});
export type PlayerProfile = z.infer<typeof playerProfileSchema>;
