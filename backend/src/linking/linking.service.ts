import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { MinecraftLink, VerificationMethod } from '@smto/mc-contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

/**
 * What a verification path hands back once it has proved a profile belongs to
 * whoever is signed in.
 *
 * Both paths produce exactly this, which is the point: adding a third one means
 * writing something that returns this shape, not touching the schema or the
 * pages. `meta` is whatever is worth keeping about how it was proved, and never
 * a token.
 */
export interface VerificationResult {
  mcUuid: string;
  mcUsername: string;
  via: VerificationMethod;
  meta?: Prisma.InputJsonValue;
}

/**
 * The link itself, independent of how it was proved.
 *
 * One profile per account and one account per profile, enforced by partial
 * unique indexes over the rows that are still live. Unlinking is a soft delete,
 * so the history of who a UUID belonged to survives, which matters when
 * somebody's statistics need explaining.
 */
@Injectable()
export class LinkingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async find(accountId: string): Promise<MinecraftLink | null> {
    const row = await this.prisma.minecraftLink.findFirst({
      where: { accountId, unlinkedAt: null },
    });

    if (!row) {
      return null;
    }

    return {
      mcUuid: row.mcUuid,
      mcUsername: row.mcUsername,
      verifiedVia: row.verifiedVia,
      verifiedAt: row.verifiedAt.toISOString(),
    };
  }

  /** Who a Minecraft UUID belongs to, if anybody. Used by the plugin lookup. */
  async findByUuid(mcUuid: string): Promise<{ accountId: string; username: string } | null> {
    const row = await this.prisma.minecraftLink.findFirst({
      where: { mcUuid, unlinkedAt: null },
      include: { account: { select: { username: true } } },
    });

    return row ? { accountId: row.accountId, username: row.account.username } : null;
  }

  /**
   * Records a verified profile against an account.
   *
   * Two conflicts are possible and they are told apart on purpose. An account
   * that already has a profile has to unlink first, which is a thing the person
   * in front of us can do. A profile already held by somebody else is refused
   * outright and never moved: silently reassigning it would hand one player
   * another player's statistics, and there is no way for this service to know
   * which of the two is telling the truth.
   */
  async link(
    accountId: string,
    result: VerificationResult,
    context: { ipAddress?: string } = {},
  ): Promise<MinecraftLink> {
    const existingForAccount = await this.prisma.minecraftLink.findFirst({
      where: { accountId, unlinkedAt: null },
    });

    if (existingForAccount) {
      if (existingForAccount.mcUuid === result.mcUuid) {
        // Re-running the same link, most likely a double submit or a refreshed
        // callback. Nothing to change, and an error here would be a lie.
        return {
          mcUuid: existingForAccount.mcUuid,
          mcUsername: existingForAccount.mcUsername,
          verifiedVia: existingForAccount.verifiedVia,
          verifiedAt: existingForAccount.verifiedAt.toISOString(),
        };
      }

      throw new ConflictException('account_already_linked');
    }

    const existingForProfile = await this.prisma.minecraftLink.findFirst({
      where: { mcUuid: result.mcUuid, unlinkedAt: null },
    });

    if (existingForProfile) {
      throw new ConflictException('profile_already_linked');
    }

    let row;
    try {
      row = await this.prisma.minecraftLink.create({
        data: {
          accountId,
          mcUuid: result.mcUuid,
          mcUsername: result.mcUsername,
          verifiedVia: result.via,
          ...(result.meta !== undefined ? { verifiedMeta: result.meta } : {}),
        },
      });
    } catch (error) {
      // Two requests raced past the checks above. The partial unique indexes in
      // the initial migration are what actually enforce the rule; this turns
      // the loser of the race into the same clean error the checks produce
      // rather than a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        throw new ConflictException(
          target.includes('profile') ? 'profile_already_linked' : 'account_already_linked',
        );
      }
      throw error;
    }

    await this.audit.record('link_created', {
      actorAccountId: accountId,
      targetType: 'minecraft_link',
      targetId: row.id,
      metadata: { mcUuid: row.mcUuid, mcUsername: row.mcUsername, via: result.via },
      ipAddress: context.ipAddress,
    });

    return {
      mcUuid: row.mcUuid,
      mcUsername: row.mcUsername,
      verifiedVia: row.verifiedVia,
      verifiedAt: row.verifiedAt.toISOString(),
    };
  }

  /**
   * Removes the link, keeping the row.
   *
   * The statistics are keyed by Minecraft UUID rather than by account, so they
   * are untouched by this and come back if the same profile is linked again.
   * That is deliberate: unlinking detaches a profile from an account, it does
   * not delete anybody's playtime, and they carry on showing on the boards
   * without the linked badge.
   */
  async unlink(accountId: string, context: { ipAddress?: string } = {}): Promise<void> {
    const existing = await this.prisma.minecraftLink.findFirst({
      where: { accountId, unlinkedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('not_linked');
    }

    await this.prisma.minecraftLink.update({
      where: { id: existing.id },
      data: { unlinkedAt: new Date() },
    });

    await this.audit.record('link_removed', {
      actorAccountId: accountId,
      targetType: 'minecraft_link',
      targetId: existing.id,
      metadata: { mcUuid: existing.mcUuid },
      ipAddress: context.ipAddress,
    });
  }

  /**
   * Refreshes the cached display name when a plugin or a profile lookup
   * happens to see a newer one. Best effort: the UUID is the identity and a
   * stale name only ever shows the wrong text.
   */
  async refreshUsername(mcUuid: string, mcUsername: string): Promise<void> {
    await this.prisma.minecraftLink.updateMany({
      where: { mcUuid, unlinkedAt: null, mcUsername: { not: mcUsername } },
      data: { mcUsername },
    });
  }
}
