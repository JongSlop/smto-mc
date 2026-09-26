import { z } from 'zod';

/**
 * What a plugin token may do. Kept small and split by verb, so the token in a
 * server's config file can post statistics without also being able to read who
 * every UUID belongs to.
 */
export const API_TOKEN_SCOPES = ['stats:write', 'link:redeem', 'link:read'] as const;
export const apiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);
export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;

/**
 * Prefixed so a token that leaks into a log, a paste or a repository is
 * recognisable for what it is, both to a person and to secret scanners. Not the
 * account system's `smto_`, because these are a different credential against a
 * different service and confusing the two helps nobody.
 */
export const API_TOKEN_PREFIX = 'smtomc_';

export const createApiTokenSchema = z.object({
  /** Who holds this token, in plain words. Shown in the admin list, nowhere else. */
  name: z.string().trim().min(1).max(120),
  scopes: z.array(apiTokenScopeSchema).min(1),
  /**
   * Restricts the token to one server's data. A per-server token that leaks
   * cannot rewrite another server's statistics, which is the reason to prefer
   * one token per server over one shared token for the network.
   */
  serverId: z.string().trim().min(1).max(32).nullish(),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

export const apiTokenSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  scopes: z.array(apiTokenScopeSchema),
  serverId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

/**
 * Returned once, at creation. Only the hash is stored, so there is no way to
 * show the token again later and no point building a screen that pretends
 * otherwise. Deliberately unlike the account system's OAuth client secrets,
 * which are encrypted rather than hashed because the protocol needs the
 * plaintext back. Nothing here ever does.
 */
export const apiTokenWithSecretSchema = apiTokenSchema.extend({ token: z.string() });
export type ApiTokenWithSecret = z.infer<typeof apiTokenWithSecretSchema>;
