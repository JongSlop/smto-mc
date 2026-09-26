import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateServerInput, ServerMeta, UpdateServerInput } from '@smto/mc-contracts';
import { Prisma, type Server as ServerRow } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

/**
 * Server metadata: the public, unauthenticated half of this API, and the thing
 * that eventually replaces the hand-edited pack JSON the launcher reads today.
 *
 * The launcher is not pointed at this yet. When it is, the fields it needs that
 * this service has no opinion about (`game`, `additions`, `config`,
 * `background`, `news`) come out of `extra` rather than out of new columns.
 */
@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toServer(row: ServerRow): ServerMeta {
    return {
      id: row.id,
      name: row.name,
      state: row.state,
      iconUrl: row.iconUrl,
      description: row.description,
      // Date only. toISOString would add a midnight time nobody meant.
      launchDate: row.launchDate ? row.launchDate.toISOString().slice(0, 10) : null,
      currentVersion: row.currentVersion,
      sortOrder: row.sortOrder,
      isPublic: row.isPublic,
      extra: (row.extra as Record<string, unknown> | null) ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Ordering is `sortOrder` then id, so it is total. Two servers sharing a sort
   * order would otherwise come back in whatever order the planner felt like,
   * and the launcher would reshuffle its list between refreshes.
   */
  async list(options: { includeHidden: boolean }): Promise<ServerMeta[]> {
    const rows = await this.prisma.server.findMany({
      where: options.includeHidden ? {} : { isPublic: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => this.toServer(row));
  }

  async get(id: string, options: { includeHidden: boolean }): Promise<ServerMeta> {
    const row = await this.prisma.server.findUnique({ where: { id } });

    if (!row || (!options.includeHidden && !row.isPublic)) {
      // A hidden server answers exactly like a missing one, so the unauthenticated
      // endpoint does not confirm that an unannounced server exists.
      throw new NotFoundException('server_not_found');
    }

    return this.toServer(row);
  }

  async create(
    input: CreateServerInput,
    actor: { accountId: string | null; ipAddress?: string },
  ): Promise<ServerMeta> {
    try {
      const row = await this.prisma.server.create({
        data: {
          id: input.id,
          name: input.name,
          state: input.state,
          iconUrl: input.iconUrl ?? null,
          description: input.description ?? null,
          launchDate: input.launchDate ? new Date(input.launchDate) : null,
          currentVersion: input.currentVersion ?? null,
          sortOrder: input.sortOrder,
          isPublic: input.isPublic,
          extra: input.extra as Prisma.InputJsonValue,
        },
      });

      await this.audit.record('server_created', {
        actorAccountId: actor.accountId,
        targetType: 'server',
        targetId: row.id,
        metadata: { name: row.name, state: row.state },
        ipAddress: actor.ipAddress,
      });

      return this.toServer(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('server_already_exists');
      }
      throw error;
    }
  }

  /**
   * The id is the primary key and is never rewritten. Plugins, tokens and every
   * recorded statistic point at it, and renaming it would orphan all of them
   * silently. Create a new server instead.
   */
  async update(
    id: string,
    input: UpdateServerInput,
    actor: { accountId: string | null; ipAddress?: string },
  ): Promise<ServerMeta> {
    const existing = await this.prisma.server.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('server_not_found');
    }

    const row = await this.prisma.server.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl ?? null } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.launchDate !== undefined
          ? { launchDate: input.launchDate ? new Date(input.launchDate) : null }
          : {}),
        ...(input.currentVersion !== undefined
          ? { currentVersion: input.currentVersion ?? null }
          : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
        ...(input.extra !== undefined ? { extra: input.extra as Prisma.InputJsonValue } : {}),
      },
    });

    await this.audit.record('server_updated', {
      actorAccountId: actor.accountId,
      targetType: 'server',
      targetId: id,
      metadata: { changed: Object.keys(input) },
      ipAddress: actor.ipAddress,
    });

    return this.toServer(row);
  }

  /**
   * Deleting a server takes its statistics with it, because the metric rows
   * cascade. That is the honest behaviour: a server that no longer exists has
   * no playtime. Archiving is the other option and is what `state: ARCHIVED` is
   * for, which is why the admin UI leads with that instead.
   */
  async remove(id: string, actor: { accountId: string | null; ipAddress?: string }): Promise<void> {
    const existing = await this.prisma.server.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('server_not_found');
    }

    await this.prisma.server.delete({ where: { id } });

    await this.audit.record('server_deleted', {
      actorAccountId: actor.accountId,
      targetType: 'server',
      targetId: id,
      metadata: { name: existing.name },
      ipAddress: actor.ipAddress,
    });
  }
}
