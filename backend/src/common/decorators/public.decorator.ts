import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'smto:isPublic';

/**
 * Marks a route as reachable without a token. The JWT guard is registered
 * globally, so access is closed by default and every exception is spelled out
 * at the route it applies to.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
