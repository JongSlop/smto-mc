import { randomBytes } from 'node:crypto';

import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  API_TOKEN_PREFIX,
  type ApiToken,
  type ApiTokenScope,
  type ApiTokenWithSecret,
  type CreateApiTokenInput,
} from '@smto/mc-contracts';
import type { ApiToken as ApiTokenRow } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { sha256Hex } from '../common/crypto/pkce';
import { PrismaService } from '../database/prisma.service';

/** How stale lastUsedAt may get before a request pays for a write to refresh it. */
const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Credentials for the Minecraft plugins. No user behind them, no refresh, no
 * consent screen: 256 bits of randomness stored as a SHA-256 hash.
 *
 * Hashed rather than encrypted, unlike the account system's OAuth client
 * secrets. Those have to be compared against a value the protocol sends back,
 * so the plaintext is needed; here nothing ever needs it again, and the hash
 * sits on the hot path of every request a plugin makes.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toApiToken(row: ApiTokenRow): ApiToken {
    return {
      id: row.id,
      name: row.name,
      scopes: row.scopes as ApiTokenScope[],
      serverId: row.serverId,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }

  async list(): Promise<ApiToken[]> {
    const rows = await this.prisma.apiToken.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.toApiToken(row));
  }

  async create(
    input: CreateApiTokenInput,
    actor: { accountId: string | null; ipAddress?: string },
  ): Promise<ApiTokenWithSecret> {
    if (input.serverId) {
      // Pinning a token to a server that does not exist would silently produce
      // a token that can never write anything, which is a confusing thing to
      // hand somebody.
      const server = await this.prisma.server.findUnique({ where: { id: input.serverId } });
      if (!server) {
        throw new NotFoundException('server_not_found');
      }
    }

    const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;

    const row = await this.prisma.apiToken.create({
      data: {
        name: input.name,
        tokenHash: sha256Hex(token),
        scopes: input.scopes,
        serverId: input.serverId ?? null,
        createdBy: actor.accountId,
      },
    });

    await this.audit.record('api_token_created', {
      actorAccountId: actor.accountId,
      targetType: 'api_token',
      targetId: row.id,
      metadata: { name: row.name, scopes: row.scopes, serverId: row.serverId },
      ipAddress: actor.ipAddress,
    });

    return { ...this.toApiToken(row), token };
  }

  /**
   * Revoked rather than deleted, so the audit trail still has a row to point at
   * when somebody asks what that token was doing last month.
   */
  async revoke(
    id: string,
    actor: { accountId: string | null; ipAddress?: string },
  ): Promise<ApiToken> {
    const existing = await this.prisma.apiToken.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('api_token_not_found');
    }

    if (existing.revokedAt !== null) {
      return this.toApiToken(existing);
    }

    const row = await this.prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    await this.audit.record('api_token_revoked', {
      actorAccountId: actor.accountId,
      targetType: 'api_token',
      targetId: id,
      metadata: { name: existing.name },
      ipAddress: actor.ipAddress,
    });

    return this.toApiToken(row);
  }

  /**
   * Resolves a presented token. Throws rather than returning null, because the
   * only caller is a guard and the failure is nearly always the same.
   *
   * The one distinction it does make is between a token that is not ours and a
   * string that was never a token at all, because the two send somebody looking
   * in completely different places. A header sent twice arrives here as
   * `smtomc_a, smtomc_a`, since Node joins repeated headers, and a plugin
   * reading its key out of a config file can easily pick up a line break or a
   * quote with it. Answering `invalid_api_token` to those costs an afternoon of
   * minting fresh tokens that fail exactly the same way.
   *
   * Nothing is given away by saying so: the shape is documented, and the reply
   * is the same for a well-formed token that does not exist and one that was
   * revoked.
   */
  async authenticate(
    presented: string,
  ): Promise<{ scopes: ApiTokenScope[]; serverId: string | null }> {
    if (!isWellFormedToken(presented)) {
      throw new UnauthorizedException('malformed_api_key');
    }

    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash: sha256Hex(presented) },
    });

    if (!row || row.revokedAt !== null) {
      throw new UnauthorizedException('invalid_api_token');
    }

    await this.touch(row);
    return { scopes: row.scopes as ApiTokenScope[], serverId: row.serverId };
  }

  private async touch(row: ApiTokenRow): Promise<void> {
    const stale =
      row.lastUsedAt === null || Date.now() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS;

    if (stale) {
      await this.prisma.apiToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      });
    }
  }
}

/**
 * Whether this could be one of our tokens at all.
 *
 * Deliberately shape only, never a guess at validity: the prefix and the
 * base64url alphabet are both public, and the length is what `create` issues.
 * Anything else is a transport or configuration mistake rather than a wrong
 * credential.
 */
function isWellFormedToken(presented: string): boolean {
  if (!presented.startsWith(API_TOKEN_PREFIX)) {
    return false;
  }

  const secret = presented.slice(API_TOKEN_PREFIX.length);

  // 32 random bytes, base64url: always 43 characters, and nothing outside that
  // alphabet. A repeated header (", ") and a stray quote or newline both fail
  // here rather than being hashed into a lookup that cannot match.
  return /^[A-Za-z0-9_-]{43}$/.test(secret);
}
