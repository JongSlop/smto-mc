import { Injectable } from '@nestjs/common';
import {
  FEATURED_METRICS,
  LEADERBOARD_SIZE,
  PLAYTIME_METRIC,
  metricKind,
  type IngestMetricsInput,
  type IngestResult,
  type Leaderboards,
  type PlayerProfile,
  type PlayerStats,
  type ServerTotals,
  type ServerStats,
} from '@smto/mc-contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { PlayerNamesService } from '../names/player-names.service';

type Rejection = IngestResult['rejected'][number];

/** What stands in for a name nobody could look up: enough to tell players apart. */
function shortId(mcUuid: string): string {
  return mcUuid.slice(0, 8);
}

/** Whether anything has actually been recorded, as opposed to a row of zeros. */
function hasActivity(stats: PlayerStats): boolean {
  return stats.servers.some((server) =>
    Object.values(server.metrics).some((value) =>
      typeof value === 'number' ? value > 0 : Object.keys(value).length > 0,
    ),
  );
}

/**
 * The statistics store.
 *
 * One row per player, server and metric name, and no schema knowledge of what
 * any particular metric means. A plugin that starts recording something new
 * posts it and it appears; nothing here has to be redeployed. Playtime is
 * simply the metric `playtime_seconds` and gets no special storage.
 */
@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly names: PlayerNamesService,
  ) {}

  /**
   * Writes a batch.
   *
   * Partial success is the contract, not a compromise. A flush covering three
   * hundred players where two look wrong should write the other 298 and hand
   * the two back, because the alternative is a plugin retrying the same failing
   * batch forever and losing everybody's playtime with it.
   */
  async ingest(input: IngestMetricsInput, callerServerId: string | null): Promise<IngestResult> {
    const serverId = input.serverId;

    // A token pinned to one server may only write that server's data. This is
    // the reason to hand out one token per server rather than one for the
    // network: a leaked config file then cannot rewrite anybody else's numbers.
    if (callerServerId !== null && callerServerId !== serverId) {
      return {
        accepted: 0,
        rejected: input.entries.map((entry) => ({
          uuid: entry.uuid,
          metric: entry.metric,
          reason: 'unknown_server' as const,
        })),
      };
    }

    const server = await this.prisma.server.findUnique({ where: { id: serverId } });

    if (!server) {
      return {
        accepted: 0,
        rejected: input.entries.map((entry) => ({
          uuid: entry.uuid,
          metric: entry.metric,
          reason: 'unknown_server' as const,
        })),
      };
    }

    // What is already stored for every (uuid, metric) in this batch, in one
    // query rather than one per entry. A flush for a full server is a few
    // hundred entries, and a round trip each would dominate the request.
    const existing = await this.prisma.playerMetric.findMany({
      where: {
        serverId,
        OR: input.entries.map((entry) => ({ mcUuid: entry.uuid, metric: entry.metric })),
      },
      select: { mcUuid: true, metric: true, valueNum: true },
    });

    const stored = new Map(
      existing.map((row) => [`${row.mcUuid}:${row.metric}`, row.valueNum] as const),
    );

    const rejected: Rejection[] = [];
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    const now = new Date();

    for (const entry of input.entries) {
      if (entry.value !== undefined && metricKind(entry.metric) === 'counter') {
        const previous = stored.get(`${entry.uuid}:${entry.metric}`);

        // A counter that went backwards means the server lost its local state,
        // usually a wiped world or a restored backup. Accepting it would erase
        // real playtime, and there is no way to tell from here whether the new
        // number is the truth. Refusing and logging leaves a human to decide.
        if (previous !== null && previous !== undefined && BigInt(entry.value) < previous) {
          rejected.push({
            uuid: entry.uuid,
            metric: entry.metric,
            reason: 'counter_went_backwards',
          });
          continue;
        }
      }

      const value = entry.value === undefined ? null : BigInt(entry.value);
      const data = entry.data === undefined ? null : (entry.data as Prisma.InputJsonValue);

      writes.push(
        this.prisma.playerMetric.upsert({
          where: {
            mcUuid_serverId_metric: { mcUuid: entry.uuid, serverId, metric: entry.metric },
          },
          create: {
            mcUuid: entry.uuid,
            serverId,
            metric: entry.metric,
            valueNum: value,
            ...(data !== null ? { valueJson: data } : {}),
            recordedAt: now,
          },
          update: {
            valueNum: value,
            ...(data !== null ? { valueJson: data } : {}),
            recordedAt: now,
          },
        }),
      );
    }

    // One transaction for the batch, so a plugin that flushes and crashes does
    // not leave half a server's statistics written.
    if (writes.length > 0) {
      await this.prisma.$transaction(writes);
    }

    for (const rejection of rejected) {
      await this.audit.record('metric_rejected', {
        targetType: 'player_metric',
        targetId: `${rejection.uuid}:${serverId}:${rejection.metric}`,
        metadata: {
          serverId,
          reason: rejection.reason,
          stored: stored.get(`${rejection.uuid}:${rejection.metric}`)?.toString() ?? null,
        },
      });
    }

    return { accepted: writes.length, rejected };
  }

  /**
   * Everything recorded for one profile, grouped by server.
   *
   * Servers with no rows for this player are left out rather than shown as
   * zero: never having played somewhere is not the same as having played there
   * for no time.
   */
  async forProfile(
    mcUuid: string | null,
    options: { publicOnly?: boolean } = {},
  ): Promise<PlayerStats> {
    if (!mcUuid) {
      return { totalPlaytimeSeconds: 0, totals: {}, servers: [] };
    }

    const rows = await this.prisma.playerMetric.findMany({
      where: { mcUuid, ...(options.publicOnly ? { server: { isPublic: true } } : {}) },
      include: {
        server: { select: { id: true, name: true, iconUrl: true, state: true, sortOrder: true } },
      },
    });

    const byServer = new Map<string, ServerStats & { sortOrder: number }>();

    for (const row of rows) {
      const entry = byServer.get(row.serverId) ?? {
        serverId: row.server.id,
        serverName: row.server.name,
        serverIconUrl: row.server.iconUrl,
        serverState: row.server.state,
        playtimeSeconds: 0,
        metrics: {},
        lastSeenAt: null,
        sortOrder: row.server.sortOrder,
      };

      if (row.valueNum !== null) {
        // Playtime is pulled out as its own field because every page shows it,
        // and it stays in `metrics` too so a caller iterating the map does not
        // have to special-case it.
        const numeric = Number(row.valueNum);
        entry.metrics[row.metric] = numeric;

        if (row.metric === PLAYTIME_METRIC) {
          entry.playtimeSeconds = numeric;
        }
      } else if (row.valueJson !== null) {
        entry.metrics[row.metric] = row.valueJson as Record<string, unknown>;
      }

      const recorded = row.recordedAt.toISOString();
      if (entry.lastSeenAt === null || recorded > entry.lastSeenAt) {
        entry.lastSeenAt = recorded;
      }

      byServer.set(row.serverId, entry);
    }

    const servers = [...byServer.values()]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.serverId.localeCompare(right.serverId),
      )
      .map(({ sortOrder: _sortOrder, ...server }) => server);

    // Counters only, for the reason given on the schema: summing a gauge across
    // servers produces a number that describes nothing.
    const totals: Record<string, number> = {};
    for (const server of servers) {
      for (const [metric, value] of Object.entries(server.metrics)) {
        if (typeof value === 'number' && metricKind(metric) === 'counter') {
          totals[metric] = (totals[metric] ?? 0) + value;
        }
      }
    }

    return {
      totalPlaytimeSeconds: servers.reduce((sum, server) => sum + server.playtimeSeconds, 0),
      totals,
      servers,
    };
  }

  /**
   * One server's numbers, added up across everybody who has played on it.
   *
   * Every player counts, linked or not. A total describes the server and names
   * nobody, so there is no reason to leave out somebody who never linked, and
   * leaving them out would make the server look emptier than it is.
   *
   * Counters only, and zeros are not counted as players, both for the reasons on
   * the contract. The caller is expected to have checked the server is public.
   */
  async forServer(serverId: string): Promise<ServerTotals> {
    const [sums, players] = await Promise.all([
      this.prisma.$queryRaw<{ metric: string; total: bigint }[]>`
        SELECT metric, SUM(value_num)::bigint AS total
        FROM player_metrics
        WHERE server_id = ${serverId}
          AND value_num IS NOT NULL
          AND value_num > 0
        GROUP BY metric
      `,
      this.prisma.$queryRaw<{ players: bigint }[]>`
        SELECT COUNT(DISTINCT mc_uuid)::bigint AS players
        FROM player_metrics
        WHERE server_id = ${serverId}
          AND value_num IS NOT NULL
          AND value_num > 0
      `,
    ]);

    const totals: Record<string, number> = {};
    for (const row of sums) {
      // Filtered here rather than in SQL: which metrics are gauges is decided
      // by the contracts package, and one list is better than two.
      if (metricKind(row.metric) === 'counter') {
        totals[row.metric] = Number(row.total);
      }
    }

    return { serverId, players: Number(players[0]?.players ?? 0), totals };
  }

  /**
   * A profile as somebody else sees it, or null where there is nothing to see.
   *
   * Two kinds of page. A player with a live link gets the full one, with the
   * name they linked under and their message. Everybody else gets a plain one,
   * with a name from Mojang and a flag saying so, as long as something has been
   * recorded for them: a leaderboard row has to open, and it does not matter
   * whether the player never linked or linked once and unlinked since. Unlinking
   * detaches a profile from an account, it does not take anybody's statistics
   * off the network, so it changes which kind of page this is and nothing else.
   *
   * Public servers only, the same rule the leaderboard follows, so the totals
   * on a page and the reading on the board beside it are the same number.
   */
  async profile(mcUuid: string): Promise<PlayerProfile | null> {
    const link = await this.prisma.minecraftLink.findFirst({
      where: { mcUuid, unlinkedAt: null },
      select: {
        mcUuid: true,
        mcUsername: true,
        verifiedAt: true,
        account: { select: { profileMessage: true } },
      },
    });

    if (link) {
      return {
        mcUuid: link.mcUuid,
        mcUsername: link.mcUsername,
        linked: true,
        linkedSince: link.verifiedAt.toISOString(),
        message: link.account.profileMessage,
        stats: await this.forProfile(link.mcUuid, { publicOnly: true }),
      };
    }

    const stats = await this.forProfile(mcUuid, { publicOnly: true });

    if (!hasActivity(stats)) {
      return null;
    }

    const names = await this.names.resolve([mcUuid]);

    return {
      mcUuid,
      mcUsername: names.get(mcUuid) ?? shortId(mcUuid),
      linked: false,
      linkedSince: null,
      message: null,
      stats,
    };
  }

  /**
   * The top players for each featured metric, summed across every server, or
   * counted on one when `serverId` is given.
   *
   * Players who linked, and everybody else. The metric rows carry only a UUID,
   * so the name of somebody without a live link, whether they never linked or
   * unlinked since, is looked up from Mojang and cached.
   *
   * One query for every board. Ranking nine metrics with nine round trips
   * would be nine sequential scans of the same table, so the window function
   * partitions by metric and the whole thing comes back at once.
   *
   * Narrowing to one server changes what is summed and nothing else, so the
   * ranking rules are the same and a player's row reads the same number as the
   * per-server figure on their profile. A server that is unknown or not public
   * is the caller's to refuse before getting here: asking for it would
   * otherwise return empty boards, which says the server exists.
   */
  async leaderboards(
    options: { limit?: number; serverId?: string | null } = {},
  ): Promise<Leaderboards> {
    const limit = options.limit ?? LEADERBOARD_SIZE;
    const serverId = options.serverId ?? null;

    if (FEATURED_METRICS.length === 0) {
      return { server: serverId, servers: [], boards: [] };
    }

    const onServer = serverId === null ? Prisma.empty : Prisma.sql`AND pm.server_id = ${serverId}`;

    const rows = await this.prisma.$queryRaw<
      {
        metric: string;
        mcUuid: string;
        linkedName: string | null;
        linked: boolean;
        total: bigint;
        rank: bigint;
      }[]
    >`
      SELECT metric, mc_uuid AS "mcUuid", linked_name AS "linkedName", linked, total, rank
      FROM (
        SELECT
          pm.metric,
          pm.mc_uuid,
          l.mc_username_cache AS linked_name,
          (l.id IS NOT NULL) AS linked,
          SUM(pm.value_num)::bigint AS total,
          ROW_NUMBER() OVER (
            PARTITION BY pm.metric
            -- Ties by name where there is one, then by UUID, which is the only
            -- thing every player has and so the only stable last word.
            ORDER BY SUM(pm.value_num) DESC, l.mc_username_cache ASC NULLS LAST, pm.mc_uuid ASC
          ) AS rank
        FROM player_metrics pm
        LEFT JOIN minecraft_links l
          ON l.mc_uuid = pm.mc_uuid
          AND l.unlinked_at IS NULL
        JOIN servers s
          ON s.id = pm.server_id
          -- A hidden server is one nobody was meant to see, and its numbers
          -- stay out of the sums for the same reason a profile leaves it out.
          AND s.is_public
        WHERE pm.metric IN (${Prisma.join([...FEATURED_METRICS])})
          AND pm.value_num IS NOT NULL
          -- Nobody is on a board for never having done the thing, the same
          -- rule the lists on the dashboard follow.
          AND pm.value_num > 0
          ${onServer}
        GROUP BY pm.metric, pm.mc_uuid, l.mc_username_cache, (l.id IS NOT NULL)
      ) ranked
      WHERE rank <= ${limit}
      ORDER BY metric, rank
    `;

    // Names for the players who have none of their own, looked up once for the
    // whole page rather than per row.
    const names = await this.names.resolve(
      rows.filter((row) => !row.linked).map((row) => row.mcUuid),
    );

    const byMetric = new Map<string, Leaderboards['boards'][number]['entries']>();

    for (const row of rows) {
      const entries = byMetric.get(row.metric) ?? [];
      entries.push({
        rank: Number(row.rank),
        mcUuid: row.mcUuid,
        mcUsername: row.linked
          ? (row.linkedName ?? shortId(row.mcUuid))
          : (names.get(row.mcUuid) ?? shortId(row.mcUuid)),
        linked: row.linked,
        value: Number(row.total),
      });
      byMetric.set(row.metric, entries);
    }

    // Featured order rather than whatever the database returned, so the page
    // reads the same way as the dashboard above it. A metric nobody has moved
    // yet is left out rather than shown as an empty table.
    return {
      server: serverId,
      servers: await this.serversOnBoards(),
      boards: FEATURED_METRICS.filter((metric) => byMetric.has(metric)).map((metric) => ({
        metric,
        entries: byMetric.get(metric) ?? [],
      })),
    };
  }

  /** Whether a server can be asked about: it exists and is meant to be seen. */
  async isPublicServer(serverId: string): Promise<boolean> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, isPublic: true },
      select: { id: true },
    });

    return server !== null;
  }

  /**
   * The public servers that have somebody on a board.
   *
   * Independent of which server is being looked at, so the choices do not
   * change under the person choosing, and limited to servers that would show
   * something, so nobody is offered a filter that leads to an empty page. The
   * same eligibility rules as the boards: a player who may be shown, a featured
   * metric, and a value above zero.
   */
  private async serversOnBoards(): Promise<Leaderboards['servers']> {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; iconUrl: string | null; state: string }[]
    >`
      SELECT s.id, s.name, s.icon_url AS "iconUrl", s.state::text AS state
      FROM servers s
      WHERE s.is_public
        AND EXISTS (
          SELECT 1
          FROM player_metrics pm
          WHERE pm.server_id = s.id
            AND pm.metric IN (${Prisma.join([...FEATURED_METRICS])})
            AND pm.value_num > 0
        )
      ORDER BY s.sort_order, s.id
    `;

    return rows;
  }
}
