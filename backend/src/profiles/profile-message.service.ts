import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

/**
 * The speech bubble on somebody's page.
 *
 * Lives on the account, not on the Minecraft link: it is something the person
 * wrote, and it should still be there if they unlink and link a different
 * profile. Whether anybody can *see* it is decided elsewhere, by whether the
 * account has a live link, which is what makes a page exist at all.
 */
@Injectable()
export class ProfileMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sets or removes the caller's own message. `message` is already normalised
   * by the request schema, so this stores exactly what will be shown.
   *
   * Refused without a live link. Nothing would break, but a message for a page
   * that does not exist is one nobody can see and the writer cannot check, and
   * the form that sends it is on the page they do not have.
   */
  async set(accountId: string, message: string | null): Promise<string | null> {
    const link = await this.prisma.minecraftLink.findFirst({
      where: { accountId, unlinkedAt: null },
      select: { id: true },
    });

    if (!link) {
      throw new BadRequestException('account_not_linked');
    }

    await this.prisma.account.update({
      where: { id: accountId },
      data: { profileMessage: message },
    });

    return message;
  }

  /**
   * Takes a message down on somebody else's behalf.
   *
   * Idempotent, since an admin who clicks twice, or two admins who click at
   * the same time, want the same end state and neither has done anything
   * wrong. Only an actual removal is written to the audit log, and it keeps the
   * text that was removed: once it is gone, the log is the only record of what
   * was said, which is exactly what somebody reviewing the decision needs.
   */
  async clearForProfile(
    mcUuid: string,
    actor: { accountId: string; ipAddress?: string },
  ): Promise<void> {
    const link = await this.prisma.minecraftLink.findFirst({
      where: { mcUuid, unlinkedAt: null },
      select: { accountId: true, account: { select: { profileMessage: true } } },
    });

    // Same answer as the page itself gives for an unlinked profile.
    if (!link) {
      throw new NotFoundException('profile_not_found');
    }

    const previous = link.account.profileMessage;

    if (previous === null) {
      return;
    }

    // Conditional on the text still being what was read, so a player who
    // rewrote it in between is not silently wiped, and the audit entry can
    // never describe text that was not the text removed.
    const { count } = await this.prisma.account.updateMany({
      where: { id: link.accountId, profileMessage: previous },
      data: { profileMessage: null },
    });

    if (count === 0) {
      return;
    }

    await this.audit.record('profile_message_cleared', {
      actorAccountId: actor.accountId,
      targetType: 'minecraft_profile',
      targetId: mcUuid,
      metadata: { accountId: link.accountId, previous },
      ipAddress: actor.ipAddress,
    });
  }
}
