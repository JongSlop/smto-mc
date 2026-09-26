import type { ApiTokenScope } from '@smto/mc-contracts';
import type { Request } from 'express';

/**
 * The identity attached to a request once the guard has authenticated it.
 *
 * Two credentials reach this API and they are not alike: a person with a
 * browser session, and a Minecraft server plugin with a token in its config
 * file. Both are normalised here so nothing downstream has to care which
 * arrived, but `kind` stays visible because a few places genuinely do care.
 */
export interface RequestUser {
  /** Account UUID for a person, null for a plugin acting on its own behalf. */
  id: string | null;
  /** Roles as the account system last reported them. Empty for a token. */
  roles: string[];
  kind: 'user' | 'api-token';
  /** Scopes granted to a token. Empty for a person. */
  scopes: ApiTokenScope[];
  /**
   * The server a token is pinned to, if any. Null means the whole network, and
   * it is null for every person.
   */
  serverId: string | null;
  /** The session row behind a person's request, so logout can find it. */
  sessionId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}
