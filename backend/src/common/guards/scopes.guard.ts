import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiTokenScope } from '@smto/mc-contracts';

import { SCOPES_KEY } from '../decorators/scopes.decorator';
import type { AuthenticatedRequest } from '../types/request-user';

/**
 * Enforces @Scopes(), and does so more strictly than the account system's
 * equivalent does.
 *
 * There, an admin may call a scoped route in place of an API key. Here they may
 * not. These routes write other players' statistics and resolve UUIDs to
 * people, and there is no reason for a browser to ever do either: the admin
 * pages read through /api/v1/admin, and a person's own data is at /api/v1/me.
 * Keeping the machine surface machine-only means a stolen admin session cannot
 * quietly rewrite the network's playtime.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ApiTokenScope[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const caller = context.switchToHttp().getRequest<AuthenticatedRequest>().user;

    if (caller?.kind !== 'api-token') {
      throw new ForbiddenException('api_token_required');
    }

    if (!required.some((scope) => caller.scopes.includes(scope))) {
      throw new ForbiddenException('insufficient_scope');
    }

    return true;
  }
}
