import { randomInt } from 'node:crypto';

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LINK_CODE_ALPHABET,
  LINK_CODE_LENGTH,
  type LinkCodeIssued,
  type RedeemLinkCodeInput,
} from '@smto/mc-contracts';

import { AuditService } from '../../audit/audit.service';
import type { Env } from '../../config/env.config';
import { PrismaService } from '../../database/prisma.service';
import type { VerificationResult } from '../linking.service';

/**
 * The in-game verification path.
 *
 * It rests on one fact: every smto.dev server runs in online mode, so by the
 * time a player can type in chat, Mojang's session server has already proved
 * the UUID the plugin is holding. This service never has to verify anything
 * itself. It only has to make sure the code that arrives came from the account
 * that asked for it, recently, once.
 *
 * The Minecraft side of this, the `/link` command and the call to
 * `/api/v1/ingest/link/redeem`, is a separate plugin and not part of this
 * repository. The contract it codes against is `docs/api.md`.
 */
@Injectable()
export class LinkCodeService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('LINK_CODE_TTL_MINUTES', { infer: true }) * 60 * 1000;
  }

  /**
   * Mints a code for an account, replacing whatever it had outstanding.
   *
   * One live code per account rather than a pile of them: a person clicking the
   * button twice should see one code that works, not wonder which of two is
   * current. It also keeps a bored user from filling the table.
   */
  async issue(accountId: string, context: { ipAddress?: string } = {}): Promise<LinkCodeIssued> {
    await this.prisma.linkCode.deleteMany({ where: { accountId, consumedAt: null } });

    const expiresAt = new Date(Date.now() + this.ttlMs);
    const code = await this.mintUniqueCode();

    await this.prisma.linkCode.create({ data: { code, accountId, expiresAt } });

    await this.audit.record('link_code_issued', {
      actorAccountId: accountId,
      targetType: 'link_code',
      ipAddress: context.ipAddress,
    });

    return { code: formatCode(code), expiresAt: expiresAt.toISOString() };
  }

  /**
   * Redeems a code on behalf of a plugin.
   *
   * The code is marked consumed in the same statement that reads it, restricted
   * to rows that are still unconsumed and unexpired. Two servers racing on the
   * same code therefore produce one winner and one `invalid_code`, without a
   * transaction or a lock.
   */
  async redeem(input: RedeemLinkCodeInput): Promise<{
    accountId: string;
    verification: VerificationResult;
  }> {
    const now = new Date();

    const { count } = await this.prisma.linkCode.updateMany({
      where: { code: input.code, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now, consumedServerId: input.serverId },
    });

    if (count === 0) {
      // Unknown, already used and expired are one error on purpose. Telling
      // them apart would let somebody probe which codes exist.
      throw new BadRequestException('invalid_code');
    }

    const row = await this.prisma.linkCode.findUnique({ where: { code: input.code } });

    if (!row) {
      // Deleted between the update and the read, which only a concurrent
      // issue() can do. Treated as a miss rather than a 500.
      throw new BadRequestException('invalid_code');
    }

    await this.audit.record('link_code_redeemed', {
      actorAccountId: row.accountId,
      targetType: 'link_code',
      targetId: row.id,
      metadata: { serverId: input.serverId, mcUuid: input.uuid, mcUsername: input.username },
    });

    return {
      accountId: row.accountId,
      verification: {
        mcUuid: input.uuid,
        mcUsername: input.username,
        via: 'INGAME_CODE',
        // Worth keeping: which server saw the player type it. Nothing secret,
        // and it is the first thing anyone asks when a link looks wrong.
        meta: { serverId: input.serverId, redeemedAt: now.toISOString() },
      },
    };
  }

  /** The code an account currently has outstanding, if it still has one. */
  async current(accountId: string): Promise<LinkCodeIssued | null> {
    const row = await this.prisma.linkCode.findFirst({
      where: { accountId, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    return row ? { code: formatCode(row.code), expiresAt: row.expiresAt.toISOString() } : null;
  }

  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.linkCode.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  }

  /**
   * Retries on a collision rather than trusting 32^8 to never repeat. The
   * unique index is what actually guarantees it; this just avoids handing the
   * user an error for something we can fix by trying again.
   */
  private async mintUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomCode();
      const taken = await this.prisma.linkCode.findUnique({ where: { code } });

      if (!taken) {
        return code;
      }
    }

    throw new ConflictException('could_not_mint_code');
  }
}

/**
 * `randomInt` rather than `Math.random`: this is a credential, however short
 * lived, and it should not be predictable from another one.
 */
function randomCode(): string {
  let code = '';
  for (let index = 0; index < LINK_CODE_LENGTH; index += 1) {
    code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }
  return code;
}

/** Grouped in fours for reading off a screen. Either spelling redeems. */
function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
