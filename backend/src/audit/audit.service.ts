import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, AuditEntry, AuditPage, AuditQuery } from '@smto/mc-contracts';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

export interface AuditContext {
  actorAccountId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}

const withActor = {
  actor: { select: { username: true } },
} satisfies Prisma.AuditLogInclude;

type AuditRow = Prisma.AuditLogGetPayload<{ include: typeof withActor }>;

/**
 * The single way anything is written to the audit log, and the only way it is
 * read back.
 *
 * One writer on purpose. Audit rows spread across services drift: one records
 * the IP, the next forgets, a third invents a second spelling of the same
 * action, and the log stops being usable exactly when somebody needs it.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Never throws. An audit write failing must not take down the login or the
   * ingest call that produced it, since the alternative is an outage caused by
   * bookkeeping. A failure is logged loudly instead.
   */
  async record(action: AuditAction, context: AuditContext = {}): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          actorAccountId: context.actorAccountId ?? null,
          targetType: context.targetType ?? null,
          targetId: context.targetId ?? null,
          ipAddress: context.ipAddress ?? null,
          ...(context.metadata !== undefined ? { metadata: context.metadata } : {}),
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write audit row for ${action}`, error as Error);
    }
  }

  /**
   * Newest first, paged by cursor rather than offset: rows arrive constantly,
   * and an offset would skip or repeat entries between one page and the next.
   */
  async list(options: AuditQuery): Promise<AuditPage> {
    const rows = await this.prisma.auditLog.findMany({
      where: options.action ? { action: options.action } : {},
      include: withActor,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, options.limit);

    return {
      entries: page.map((row) => this.toEntry(row)),
      nextCursor: rows.length > options.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  private toEntry(row: AuditRow): AuditEntry {
    return {
      id: row.id,
      action: row.action as AuditAction,
      actorAccountId: row.actorAccountId,
      actorUsername: row.actor?.username ?? null,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
