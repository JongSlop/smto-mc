import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Account as AccountRow, Session as SessionRow } from '@prisma/client';

import { randomToken, sha256Hex } from '../common/crypto/pkce';
import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import type { Env } from '../config/env.config';
import { PrismaService } from '../database/prisma.service';
import { OidcClientService, type ResolvedIdentity } from './oidc-client.service';

/** What the frontend gets to put in its cookie. */
export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface ResolvedSession {
  sessionId: string;
  account: AccountRow;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly ttlMs: number;
  private readonly roleRefreshMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: SecretCipherService,
    private readonly oidc: OidcClientService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('SESSION_TTL_DAYS', { infer: true }) * 24 * 60 * 60 * 1000;
    this.roleRefreshMs = config.get('ROLE_REFRESH_MINUTES', { infer: true }) * 60 * 1000;
  }

  /**
   * Upserts the account and opens a session for it.
   *
   * The account row is a cache of what the ID token just said, so every login
   * refreshes the username, avatar and roles. The id is the account system's
   * `sub` and is the only part that is authoritative.
   */
  async start(
    identity: ResolvedIdentity,
    context: { ipAddress?: string; userAgent?: string },
  ): Promise<{ session: IssuedSession; account: AccountRow }> {
    if (!identity.tokens.refreshToken) {
      // offline_access is requested on every authorization, so this means the
      // client registration is missing the refresh_token grant. Failing here is
      // clearer than issuing a session that dies in an hour for no visible
      // reason.
      throw new UnauthorizedException('no_refresh_token');
    }

    const account = await this.prisma.account.upsert({
      where: { id: identity.accountId },
      create: {
        id: identity.accountId,
        username: identity.username,
        avatarUrl: identity.avatarUrl,
        roles: identity.roles,
        lastLoginAt: new Date(),
      },
      update: {
        username: identity.username,
        avatarUrl: identity.avatarUrl,
        roles: identity.roles,
        lastLoginAt: new Date(),
      },
    });

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await this.prisma.session.create({
      data: {
        tokenHash: sha256Hex(token),
        accountId: account.id,
        refreshTokenEnc: this.cipher.encrypt(identity.tokens.refreshToken),
        oidcSid: identity.sid,
        expiresAt,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent?.slice(0, 500) ?? null,
      },
    });

    return { session: { token, expiresAt }, account };
  }

  /**
   * Resolves the token in the cookie to an account, refreshing against the
   * account system when what we hold has gone stale.
   *
   * The reason for the refresh is the same one that makes the account system
   * re-read roles from its database on every request: an account disabled a
   * minute ago, or an admin who was just demoted, must stop being an admin
   * here too. We cannot read their database, so the refresh grant stands in for
   * it. Their provider refuses to issue anything for a disabled or
   * email-unverified account, which turns that into a clean 401.
   *
   * It runs at most once every ROLE_REFRESH_MINUTES, so an ordinary page view
   * costs one indexed lookup and nothing else.
   */
  async resolve(token: string): Promise<ResolvedSession> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { account: true },
    });

    if (!session) {
      throw new UnauthorizedException('invalid_session');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.destroyById(session.id);
      throw new UnauthorizedException('session_expired');
    }

    const account =
      Date.now() - session.refreshedAt.getTime() > this.roleRefreshMs
        ? await this.refreshAgainstAccountSystem(session)
        : session.account;

    void this.touch(session);

    return { sessionId: session.id, account };
  }

  /** Ends a session here and, best effort, over at the account system. */
  async destroy(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });

    if (!session) {
      return;
    }

    await this.destroyById(sessionId);

    try {
      await this.oidc.revokeRefreshToken(this.cipher.decrypt(session.refreshTokenEnc));
    } catch (error) {
      // The row is already gone, so the session is over either way. A refresh
      // token we could not revoke expires on its own.
      this.logger.warn(`Could not revoke refresh token on logout: ${String(error)}`);
    }
  }

  /**
   * Removes sessions whose refresh token has expired. Called from the same
   * place the link codes are swept, so there is one scheduled job rather than
   * one per table.
   */
  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.session.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  }

  private async destroyById(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  private async refreshAgainstAccountSystem(
    session: SessionRow & { account: AccountRow },
  ): Promise<AccountRow> {
    let identity: ResolvedIdentity;

    try {
      identity = await this.oidc.refresh(this.cipher.decrypt(session.refreshTokenEnc));
    } catch (error) {
      // Either the token expired, or it was already rotated and the account
      // system treated the replay as a compromise and killed the family, or the
      // account is no longer allowed to sign in. All three mean this session is
      // over.
      this.logger.log(`Session ${session.id} ended on refresh: ${String(error)}`);
      await this.destroyById(session.id);
      throw new UnauthorizedException('session_expired');
    }

    const rotated = identity.tokens.refreshToken;

    const [account] = await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: session.accountId },
        data: {
          username: identity.username,
          avatarUrl: identity.avatarUrl,
          roles: identity.roles,
        },
      }),
      this.prisma.session.update({
        where: { id: session.id },
        data: {
          // Written in the same transaction as the account update, so a crash
          // between the two cannot leave a session holding a token the account
          // system has already retired.
          ...(rotated ? { refreshTokenEnc: this.cipher.encrypt(rotated) } : {}),
          // A session that predates the sid being sent picks one up here,
          // rather than staying anonymous until the person signs in again.
          ...(identity.sid ? { oidcSid: identity.sid } : {}),
          refreshedAt: new Date(),
          expiresAt: new Date(Date.now() + this.ttlMs),
        },
      }),
    ]);

    return account;
  }

  /**
   * Records that the session is alive, coarsely. A busy tab would otherwise
   * write to the same row on every request for a timestamp nobody reads to the
   * second.
   */
  private async touch(session: SessionRow): Promise<void> {
    if (Date.now() - session.lastSeenAt.getTime() < 60_000) {
      return;
    }

    try {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      // Racing with a logout that just deleted the row. Nothing depends on it.
    }
  }
}
