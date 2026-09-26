import { SetMetadata } from '@nestjs/common';
import type { ApiTokenScope } from '@smto/mc-contracts';

export const SCOPES_KEY = 'smto:scopes';

/**
 * Marks a route as reachable by a plugin token holding one of these scopes.
 *
 * These routes stay closed to ordinary people. They are the machine side of the
 * API: posting statistics for other players and looking up who a UUID belongs
 * to. A person's own data lives under /api/v1/me.
 */
export const Scopes = (...scopes: ApiTokenScope[]) => SetMetadata(SCOPES_KEY, scopes);
