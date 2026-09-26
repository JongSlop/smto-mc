import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'smto:roles';

/**
 * Requires the caller to hold at least one of the listed roles. Roles come from
 * the account system, so they are strings rather than an enum: an admin over
 * there can define new ones without this service knowing about them.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
