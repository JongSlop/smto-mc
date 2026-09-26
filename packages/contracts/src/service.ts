import { z } from 'zod';

/**
 * Other smto.dev services this one can hand a player off to.
 *
 * The pattern is always the same: this service holds a shared credential for
 * the other one, proves who the player is with their verified Minecraft
 * profile, and gets back a single use link that signs them in over there. The
 * credential never reaches the browser, and neither does anything that could
 * be replayed: the link dies on first use and within a few minutes anyway.
 *
 * Listed here rather than hardcoded in the frontend so a second service is a
 * field on this object and an entry in the menu, not a new shape.
 */
export const serviceStatusSchema = z.object({
  /**
   * The launcher's download page. A plain link to a public page, listed here
   * with the rest so the menu has one source rather than one hardcoded entry.
   */
  launcher: z.object({ url: z.url() }).nullable(),
  /** The media uploader, which players reach from the header or in game. */
  uploader: z.object({ enabled: z.boolean() }),
  /**
   * The account system, where the person's smto.dev account itself lives.
   *
   * A plain link rather than a hand-off: they are already signed in over
   * there, since that is where the session here came from. Null only when this
   * service could not work out the address, which means the menu leaves the
   * entry out rather than guessing.
   */
  account: z.object({ url: z.url() }).nullable(),
});
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

/**
 * Which half of the uploader a player asked for.
 *
 * The uploader opens on the matching library tab, exactly as the in-game
 * command does. A link without it lands on videos, so this is a preference
 * rather than a requirement.
 */
export const UPLOADER_INTENTS = ['audio', 'video'] as const;
export const uploaderIntentSchema = z.enum(UPLOADER_INTENTS);
export type UploaderIntent = z.infer<typeof uploaderIntentSchema>;

export const uploaderSessionRequestSchema = z.object({
  intent: uploaderIntentSchema.optional(),
});
export type UploaderSessionRequest = z.infer<typeof uploaderSessionRequestSchema>;

/** A one time sign in link for another service, and how long it lives. */
export const serviceSessionSchema = z.object({
  url: z.url(),
  /** Seconds, as the other service reported them. */
  expiresIn: z.number().int().nonnegative(),
});
export type ServiceSession = z.infer<typeof serviceSessionSchema>;
