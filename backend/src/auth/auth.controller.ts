import { BadRequestException, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ClientIp } from '../common/decorators/client-ip.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodBody } from '../common/pipes/zod.decorators';
import type { AuthenticatedRequest, RequestUser } from '../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { AuthTransactionService } from './auth-transaction.service';
import { OidcClientService } from './oidc-client.service';
import { SessionService } from './session.service';

const startSchema = z.object({
  /**
   * Where to land afterwards. A path inside this app, never an absolute URL:
   * accepting one would turn the login into an open redirect that borrows our
   * domain's credibility to send people somewhere else.
   */
  returnTo: z
    .string()
    .max(512)
    .regex(/^\/[^/\\]/, 'returnTo must be a path inside this app')
    .optional(),
});

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  /**
   * The account system sets authorization_response_iss_parameter_supported, so
   * it names itself in the redirect. Checking it costs nothing and catches a
   * mix-up between providers.
   */
  iss: z.string().optional(),
});

/**
 * The server half of signing in with a smto.dev account.
 *
 * The browser never talks to this directly. The SvelteKit server calls it,
 * holds the resulting session token in an HttpOnly cookie scoped to this app's
 * subpath, and sends it back as a bearer token on every later request. That
 * keeps the token out of any page's JavaScript, and keeps the cookie from being
 * sent to the other smto.dev services sharing the domain.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly transactions: AuthTransactionService,
    private readonly oidc: OidcClientService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /** Begins a login. Returns where to send the browser. */
  @Public()
  @Post('start')
  async start(
    @ZodBody(startSchema) body: z.infer<typeof startSchema>,
  ): Promise<{ authorizeUrl: string; state: string }> {
    const transaction = await this.transactions.start('oidc', { returnTo: body.returnTo ?? null });

    return {
      authorizeUrl: await this.oidc.authorizeUrl({
        state: transaction.state,
        nonce: transaction.nonce,
        codeChallenge: transaction.codeChallenge,
      }),
      state: transaction.state,
    };
  }

  /**
   * Finishes a login. The `state` is what ties this back to a request we
   * started; there is nothing in the browser to compare against, because the
   * pending authorization lives in our database rather than in a cookie.
   */
  @Public()
  @Post('callback')
  async callback(
    @ZodBody(callbackSchema) body: z.infer<typeof callbackSchema>,
    @Req() request: AuthenticatedRequest,
    @ClientIp() ipAddress?: string,
  ): Promise<{
    token: string;
    expiresAt: string;
    returnTo: string | null;
    account: { id: string; username: string; avatarUrl: string | null; roles: string[] };
  }> {
    const transaction = await this.transactions.consume('oidc', body.state);

    if (body.iss && body.iss.replace(/\/$/, '') !== this.oidc.issuer) {
      throw new BadRequestException('issuer_mismatch');
    }

    const identity = await this.oidc.exchangeCode(
      body.code,
      transaction.codeVerifier,
      transaction.nonce ?? '',
    );

    const { session, account } = await this.sessions.start(identity, {
      ipAddress,
      userAgent: request.get('user-agent') ?? undefined,
    });

    await this.audit.record('account_login', {
      actorAccountId: account.id,
      targetType: 'account',
      targetId: account.id,
      ipAddress,
    });

    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      returnTo: transaction.returnTo,
      account: {
        id: account.id,
        username: account.username,
        avatarUrl: account.avatarUrl,
        roles: account.roles,
      },
    };
  }

  /**
   * Ends the session here, and reports where to send the browser if the account
   * system can end its own too.
   *
   * Null when no post logout redirect URI is configured, since there is then
   * nowhere to come back from. The session row and its refresh token are gone
   * either way, which is the part this service owns.
   */
  @Post('logout')
  async logout(@CurrentUser() user: RequestUser): Promise<{ endSessionUrl: string | null }> {
    if (user.sessionId) {
      await this.sessions.destroy(user.sessionId);
    }

    // Never taken from the request. A caller-supplied target would be an open
    // redirect wearing our domain, and the account system has no way to tell
    // the difference.
    return { endSessionUrl: await this.oidc.endSessionUrl() };
  }
}
