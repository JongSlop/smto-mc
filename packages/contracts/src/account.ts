import { z } from 'zod';

import { minecraftLinkSchema } from './minecraft.js';
import { playerStatsSchema } from './stats.js';

/**
 * Roles come from the account system's `roles` claim. It lets an admin define
 * new ones, so this is not an enum: only `admin` means anything here, and every
 * other name is carried through untouched.
 */
export const roleNameSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/);
export type RoleName = z.infer<typeof roleNameSchema>;

export const ADMIN_ROLE = 'admin';

/**
 * The signed-in person, as this service knows them.
 *
 * `id` is the account system's `sub`, and it is the identity. The username is a
 * cache refreshed at every login, because the account system parks released
 * usernames for thirty days and hands them on afterwards. Storing one as a key
 * would eventually attribute somebody's playtime to a stranger.
 */
export const accountSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
  roles: z.array(roleNameSchema),
});
export type Account = z.infer<typeof accountSchema>;

/** Everything the dashboard needs, in one response. */
export const meSchema = z.object({
  account: accountSchema,
  link: minecraftLinkSchema.nullable(),
  stats: playerStatsSchema,
});
export type Me = z.infer<typeof meSchema>;

export const AUDIT_ACTIONS = [
  'account_login',
  'link_created',
  'link_removed',
  'link_code_issued',
  'link_code_redeemed',
  'api_token_created',
  'api_token_revoked',
  'server_created',
  'server_updated',
  'server_deleted',
  'server_asset_uploaded',
  'server_asset_deleted',
  'session_ended_by_provider',
  'metric_rejected',
  'uploader_session_issued',
  'profile_message_cleared',
] as const;
export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEntrySchema = z.object({
  id: z.uuid(),
  action: auditActionSchema,
  actorAccountId: z.string().nullable(),
  actorUsername: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditQuerySchema = z.object({
  action: auditActionSchema.optional(),
  /** Cursor paging rather than offset: rows arrive constantly. */
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.string().nullable(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;
