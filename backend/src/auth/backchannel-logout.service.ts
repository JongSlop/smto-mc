import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env.config';
import { PrismaService } from '../database/prisma.service';
import { jose } from './jose';
import { OidcDiscoveryService } from './oidc-discovery.service';

/** The event a logout token has to carry to be one. */
const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/**
 * How long a token's id is remembered, to refuse a replay.
 *
 * The provider gives logout tokens two minutes to live, so anything older is
 * refused by the signature check anyway. This only has to cover that window.
 */
const JTI_TTL_MS = 5 * 60 * 1000;

interface LogoutTokenClaims {
  sub?: string;
  sid?: string;
  jti?: string;
  nonce?: string;
  events?: Record<string, unknown>;
}

/**
 * Ends our sessions when the account system says the person signed out.
 *
 * Without this a logout over there is invisible here: our session holds an
 * `offline_access` refresh token, which by definition keeps working while the
 * person is away, so nothing about the next refresh would tell us their
 * browser session is over. The provider has to push the news, and this is the
 * endpoint it pushes it to.
 *
 * The token is the authentication. It is signed by the same keys as an ID
 * token, names us in `aud`, and is worthless to anybody who cannot sign with
 * the provider's key, which is why this route needs no credential of its own.
 */
@Injectable()
export class BackchannelLogoutService {
  private readonly logger = new Logger(BackchannelLogoutService.name);
  private readonly clientId: string;

  /**
   * Ids of logout tokens already acted on.
   *
   * In memory on purpose: it guards a two minute window against a token being
   * replayed, and one process serves this deployment. The failure mode if it
   * were ever lost is that a replayed token deletes sessions that are already
   * deleted, which is not a failure mode.
   */
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: OidcDiscoveryService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.clientId = config.get('OIDC_CLIENT_ID', { infer: true });
  }

  async handle(logoutToken: string, ipAddress?: string): Promise<{ ended: number }> {
    const claims = await this.verify(logoutToken);

    if (claims.jti && this.replayed(claims.jti)) {
      // Answered as a success. The sessions this token named are already gone,
      // and a retry after a timeout on their side looks exactly like this.
      this.logger.debug('Ignoring a logout token we have already acted on');
      return { ended: 0 };
    }

    // Both when we have both: the sid says which of the provider's sessions
    // ended, and the sub keeps one client's session id from ever reaching
    // another account's rows.
    //
    // The null case is the awkward one and is deliberate. A session opened
    // before the provider was asked to send a sid has none stored, so a logout
    // token naming a session would never match it and the person would stay
    // signed in here with no way to notice. Those rows cannot be told apart
    // from each other, so any logout for that account takes them: a logout
    // that misses is worse than one that reaches a second tab.
    const where =
      claims.sid && claims.sub
        ? {
            accountId: claims.sub,
            OR: [{ oidcSid: claims.sid }, { oidcSid: null }],
          }
        : claims.sid
          ? { oidcSid: claims.sid }
          : { accountId: claims.sub! };

    const { count } = await this.prisma.session.deleteMany({ where });

    await this.audit.record('session_ended_by_provider', {
      actorAccountId: claims.sub ?? null,
      targetType: 'account',
      targetId: claims.sub,
      metadata: { sessions: count, scope: claims.sid ? 'session' : 'account' },
      ipAddress,
    });

    return { ended: count };
  }

  /**
   * Everything OpenID Connect Back-Channel Logout 1.0 asks a relying party to
   * check, in the order it asks for it.
   *
   * The `nonce` rule is the one that looks odd and matters most: a logout token
   * must not carry one, because that is what stops an ID token being posted
   * here as though it were a logout instruction. An ID token for one of our own
   * users would otherwise pass every other check on this list.
   */
  private async verify(token: string): Promise<LogoutTokenClaims> {
    const keys = await this.discovery.keys();
    const { jwtVerify } = await jose();

    let claims: LogoutTokenClaims;

    try {
      ({ payload: claims } = await jwtVerify<LogoutTokenClaims>(token, keys, {
        issuer: this.discovery.issuerUrl,
        audience: this.clientId,
        // The provider stamps logout tokens with this and nothing else does.
        typ: 'logout+jwt',
        // Belt and braces next to the two minute expiry the provider sets:
        // a token minted long ago cannot be used even if it never expired.
        maxTokenAge: '5 minutes',
      }));
    } catch (error) {
      this.logger.warn(`Logout token rejected: ${String(error)}`);
      throw new BadRequestException('invalid_logout_token');
    }

    if (claims.nonce !== undefined) {
      throw new BadRequestException('invalid_logout_token');
    }

    const events = claims.events;
    if (!events || typeof events !== 'object' || !(BACKCHANNEL_EVENT in events)) {
      throw new BadRequestException('invalid_logout_token');
    }

    if (!claims.sub && !claims.sid) {
      throw new BadRequestException('invalid_logout_token');
    }

    return claims;
  }

  private replayed(jti: string): boolean {
    const now = Date.now();

    for (const [id, seenAt] of this.seen) {
      if (now - seenAt > JTI_TTL_MS) {
        this.seen.delete(id);
      }
    }

    if (this.seen.has(jti)) {
      return true;
    }

    this.seen.set(jti, now);
    return false;
  }
}
