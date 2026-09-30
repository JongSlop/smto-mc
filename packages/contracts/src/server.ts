import { z } from 'zod';

/**
 * Server lifecycle. The names match what the launcher's Rust deserialiser
 * already accepts (`src-tauri/src/packs/types.rs`), which matters more than it
 * looks: the launcher has no `deny_unknown_fields`, so adding new *fields* is
 * safe for every installed client, but an unknown *enum value* fails the whole
 * pack and makes it vanish from the launcher without an error the user can see.
 *
 * Adding a fourth state therefore needs a launcher release first, not a row
 * update here.
 */
export const SERVER_STATES = ['ONGOING', 'ARCHIVED', 'UPCOMING'] as const;
export const serverStateSchema = z.enum(SERVER_STATES);
export type ServerState = z.infer<typeof serverStateSchema>;

/**
 * Internal server id, the same one the plugins and the launcher already use
 * (`i5`, `i4`, `g3`). It doubles as a DNS label in places, so it is kept to the
 * character set a hostname allows.
 */
export const serverIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'server id must be lowercase letters, digits and dashes');

/**
 * Everything the launcher and the website need about one server.
 *
 * `extra` is the extension point, and it is here from the start rather than
 * bolted on later. The launcher's pack JSON carries a dozen fields this service
 * has no opinion about (`game.*`, `additions[]`, `config.*`, `background[]`,
 * `news[]`). When the launcher migrates onto this API those go into `extra`
 * without a migration, which is the whole reason the column exists.
 */
export const serverSchema = z.object({
  id: z.string(),
  name: z.string(),
  state: serverStateSchema,
  /** Absolute URL. Square PNG by convention; the launcher renders it pixelated. */
  iconUrl: z.string().nullable(),
  description: z.string().nullable(),
  /** ISO date, no time. When the server opened, or is expected to. */
  launchDate: z.string().nullable(),
  /** Free text, e.g. a Minecraft version or a pack revision. */
  currentVersion: z.string().nullable(),
  sortOrder: z.number().int(),
  /** Always true on the public endpoints, which never return the others. */
  isPublic: z.boolean(),
  extra: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ServerMeta = z.infer<typeof serverSchema>;

const serverWritableSchema = z.object({
  name: z.string().trim().min(1).max(120),
  state: serverStateSchema,
  iconUrl: z.url().max(2048).nullish(),
  description: z.string().trim().max(2000).nullish(),
  launchDate: z.iso.date().nullish(),
  currentVersion: z.string().trim().max(64).nullish(),
  /** Ascending. Ties fall back to the id, so the order is always total. */
  sortOrder: z.number().int().min(-10_000).max(10_000).default(0),
  /**
   * Anything this service does not model yet. Kept opaque on purpose: the admin
   * UI edits it as JSON and the API hands it back untouched.
   */
  extra: z.record(z.string(), z.unknown()).default({}),
  /** Hidden from the unauthenticated endpoints while a server is being prepared. */
  isPublic: z.boolean().default(true),
});

/**
 * The address of a server's web map, if it has one.
 *
 * Kept in `extra.webmap` rather than in a column of its own, which is what
 * `extra` is for: a map is something only some servers have, and the launcher
 * has no use for it. Read through this rather than off `extra` directly, for
 * two reasons. `extra` is free-form, so the value can be anything an admin
 * typed. And it ends up in an `href`, where a `javascript:` address would run
 * in the visitor's browser when clicked, so only plain http and https pass.
 * Anything else, an empty string included, means no map.
 */
export function serverWebmapUrl(extra: Record<string, unknown> | null | undefined): string | null {
  const value = extra?.webmap;

  if (typeof value !== 'string') {
    return null;
  }

  const address = value.trim();

  // The literal start is the check that matters: a string that begins with
  // `http://` or `https://` cannot be a `javascript:` or `data:` address, however
  // a browser would go on to parse the rest of it. Written out rather than read
  // off a parsed URL, because this package has no URL type to parse with, and
  // zod's own http check refuses a bare IP address, which is how a map on
  // Dynmap's default port is often reached.
  return /^https?:\/\//i.test(address) && z.url().safeParse(address).success ? address : null;
}

export const createServerSchema = serverWritableSchema.extend({ id: serverIdSchema });
export type CreateServerInput = z.infer<typeof createServerSchema>;

/** The id is the primary key and is never rewritten; create a new row instead. */
export const updateServerSchema = serverWritableSchema.partial();
export type UpdateServerInput = z.infer<typeof updateServerSchema>;
