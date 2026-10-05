import { z } from 'zod';

/**
 * Everything the backend reads from the environment, validated at boot so a
 * missing secret fails immediately and loudly rather than at the first login in
 * production.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3011),

  DATABASE_URL: z.string().min(1),

  /** Public address including the subpath, e.g. https://smto.dev/mc/link */
  PUBLIC_ORIGIN: z.url(),

  // --- smto.dev account system, which this service is an OAuth client of ---

  /**
   * The issuer exactly as the discovery document spells it. Every endpoint is
   * read from `${OIDC_ISSUER}/.well-known/openid-configuration` at boot rather
   * than hardcoded, so a change on their side does not need a change here.
   */
  OIDC_ISSUER: z.url().default('https://account.smto.dev/oauth'),
  OIDC_CLIENT_ID: z.string().min(1),
  OIDC_CLIENT_SECRET: z.string().min(1),

  /**
   * Where the account system should send the browser after it has ended its own
   * session. Usually `${PUBLIC_ORIGIN}/`.
   *
   * It has to be registered on the client over there, in its post-logout
   * redirect URIs, and matched character for character: oidc-provider refuses
   * anything else with `post_logout_redirect_uri not registered`. Empty is a
   * supported way to run, and the right one before that registration exists.
   * Logging out then ends the session here and revokes our refresh token, which
   * is the part this service owns, and leaves their single sign-on cookie alone.
   * Filled in, a logout signs the person out of both and lands them back here.
   */
  OIDC_POST_LOGOUT_REDIRECT_URI: z.union([z.literal(''), z.url()]).default(''),

  // --- Microsoft, for the MSA linking path ---

  /**
   * The launcher's Azure application. Reused rather than registered fresh,
   * because the Minecraft API permission (`XboxLive.signin`) is granted per
   * application and takes months to obtain. One registration can hold several
   * platform configurations, so the launcher keeps its loopback public client
   * and this service adds a web one alongside it.
   */
  MSA_CLIENT_ID: z.string().default('d28a75f9-769f-4bd1-aa82-9791e38c6f67'),

  /**
   * Empty switches the Microsoft linking path off, and the website then offers
   * only the in-game code. That is a supported way to run this service, not a
   * broken one: the code path needs nothing from Microsoft.
   */
  MSA_CLIENT_SECRET: z.string().default(''),

  // --- our own secrets ---

  /**
   * 32 bytes, base64. Encrypts the account system's refresh tokens at rest.
   * Generate with `openssl rand -base64 32`.
   */
  SESSION_ENC_KEY: z.string().min(1),

  /** How long a browser session survives without being used. */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),

  /**
   * How long the roles and profile cached on an account may be before the next
   * authenticated request pays for a refresh against the account system. This
   * is how quickly a demoted admin loses the admin pages here.
   */
  ROLE_REFRESH_MINUTES: z.coerce.number().int().positive().default(15),

  /** How long an in-game link code stays redeemable. */
  LINK_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),

  /** How long a cached skin is served before it is fetched again. */
  SKIN_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(6),

  // --- other smto.dev services players are handed off to ---

  /**
   * Where the launcher is downloaded. A public page and nothing more, so this
   * is a link rather than an integration. Empty takes it out of the Services
   * menu.
   */
  LAUNCHER_URL: z.union([z.literal(''), z.url()]).default('https://smto.dev/launcher/'),

  /**
   * The uploader's own origin, for example `https://smto.dev/upload`. Empty
   * takes the entry out of the Services menu, which is a supported way to run:
   * everything else here works without it.
   */
  UPLOADER_BASE_URL: z.union([z.literal(''), z.url()]).default(''),

  /**
   * The uploader's shared API key.
   *
   * A root credential over there: it mints a session for any player it is
   * asked about, so it stays on this side of the network and is never sent to
   * a browser. Rotate it there and here together if it ever leaks.
   */
  UPLOADER_API_KEY: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return result.data;
}
