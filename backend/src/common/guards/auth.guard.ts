import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { SessionService } from '../../auth/session.service';
import { TokensService } from '../../tokens/tokens.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/request-user';

/**
 * The one place a request gets an identity.
 *
 * Two credentials are accepted and normalised onto request.user: a person's
 * session token, sent by the SvelteKit server out of its HttpOnly cookie, and a
 * plugin's API token. Nothing downstream has to care which arrived.
 *
 * Registered globally, so routes are closed unless they carry @Public().
 * Getting that the other way around is how endpoints quietly ship unprotected.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly tokens: TokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // A session wins when both are present. It names a person, which is the
    // more specific answer to who is calling.
    const sessionToken = this.extractBearerToken(request.headers.authorization);
    if (sessionToken) {
      const { sessionId, account } = await this.sessions.resolve(sessionToken);

      request.user = {
        id: account.id,
        roles: account.roles,
        kind: 'user',
        scopes: [],
        serverId: null,
        sessionId,
      };
      return true;
    }

    const presented = request.get('x-api-key');
    if (presented) {
      const token = await this.tokens.authenticate(presented);

      request.user = {
        id: null,
        roles: [],
        kind: 'api-token',
        scopes: token.scopes,
        serverId: token.serverId,
        sessionId: null,
      };
      return true;
    }

    throw new UnauthorizedException('missing_credentials');
  }

  private extractBearerToken(header: string | undefined): string | null {
    if (!header) {
      return null;
    }

    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
