import { z } from 'zod';

/**
 * Minecraft UUIDs travel in two spellings: dashed, which is what the session
 * server and this API use, and undashed, which is what
 * `api.minecraftservices.com/minecraft/profile` returns and what most plugins
 * have lying around. Accepting both and normalising on the way in stops the
 * same player from existing twice in the statistics.
 */
export const mcUuidSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/,
    'not a Minecraft UUID',
  )
  .transform(normaliseMcUuid);

export function normaliseMcUuid(value: string): string {
  const bare = value.replace(/-/g, '').toLowerCase();
  return [
    bare.slice(0, 8),
    bare.slice(8, 12),
    bare.slice(12, 16),
    bare.slice(16, 20),
    bare.slice(20, 32),
  ].join('-');
}

/**
 * Mojang's own rule, and deliberately no stricter. Names are cached for display
 * only: the UUID is the identity, because a name can be released and taken by
 * somebody else.
 */
export const mcUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Za-z0-9_]+$/, 'not a Minecraft username');

/** How a link was proven. See the linking services for what each one checks. */
export const VERIFICATION_METHODS = ['MSA', 'INGAME_CODE'] as const;
export const verificationMethodSchema = z.enum(VERIFICATION_METHODS);
export type VerificationMethod = z.infer<typeof verificationMethodSchema>;

export const minecraftLinkSchema = z.object({
  mcUuid: z.string(),
  mcUsername: z.string(),
  verifiedVia: verificationMethodSchema,
  verifiedAt: z.iso.datetime(),
});
export type MinecraftLink = z.infer<typeof minecraftLinkSchema>;

/**
 * Codes are read off a screen and typed into a chat box, so the alphabet is
 * Crockford base32 with I, L, O and U removed. That kills the 1/I/l and 0/O
 * confusions, and dropping U keeps the generator from producing words nobody
 * wants to type in public chat.
 */
export const LINK_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LINK_CODE_LENGTH = 8;

/**
 * Accepts the code however it was typed: lower case, with or without the dash
 * the website shows it with.
 */
export const linkCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/-/g, ''))
  .pipe(
    z
      .string()
      .length(LINK_CODE_LENGTH)
      .regex(new RegExp(`^[${LINK_CODE_ALPHABET}]+$`), 'not a link code'),
  );

export const linkCodeIssuedSchema = z.object({
  /** Grouped for readability, e.g. `K7X4-M2PQ`. Either spelling redeems. */
  code: z.string(),
  expiresAt: z.iso.datetime(),
});
export type LinkCodeIssued = z.infer<typeof linkCodeIssuedSchema>;

/** What a plugin sends to redeem a code a player just typed. */
export const redeemLinkCodeSchema = z.object({
  code: linkCodeSchema,
  uuid: mcUuidSchema,
  username: mcUsernameSchema,
  serverId: z.string().trim().min(1).max(32),
});
export type RedeemLinkCodeInput = z.infer<typeof redeemLinkCodeSchema>;

/**
 * The answer to "who is this player". Deliberately thin: a plugin gets the
 * account id and the display name, and nothing else about the person.
 */
export const linkLookupSchema = z.object({
  linked: z.boolean(),
  accountId: z.string().nullable(),
  username: z.string().nullable(),
});
export type LinkLookup = z.infer<typeof linkLookupSchema>;
