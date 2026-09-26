import { Injectable } from '@nestjs/common';
import {
  FEATURED_METRICS,
  LEADERBOARD_SIZE,
  PLAYTIME_METRIC,
  metricKind,
  type IngestMetricsInput,
  type IngestResult,
  type Leaderboards,
  type PlayerStats,
  type ServerStats,
} from '@smto/mc-contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';

type Rejection = IngestResult['rejected'][number];

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
  async forProfile(mcUuid: string | null): Promise<PlayerStats> {
    if (!mcUuid) {
      return { totalPlaytimeSeconds: 0, totals: {}, servers: [] };
    }

    const rows = await this.prisma.playerMetric.findMany({
      where: { mcUuid },
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
   * The top players for each featured metric, summed across every server.
   *
   * Linked profiles only, and that is a data limit rather than a policy: the
   * metric rows carry a UUID, and the display name for one exists only where
   * somebody has linked their account here. A board of raw UUIDs would be
   * useless to read.
   *
   * One query for every board. Ranking nine metrics with nine round trips
   * would be nine sequential scans of the same table, so the window function
   * partitions by metric and the whole thing comes back at once.
   */
  async leaderboards(limit: number = LEADERBOARD_SIZE): Promise<Leaderboards> {
    if (FEATURED_METRICS.length === 0) {
      return { boards: [] };
    }

    const rows = await this.prisma.$queryRaw<
      { metric: string; mcUuid: string; mcUsername: string; total: bigint; rank: bigint }[]
    >`
      SELECT metric, mc_uuid AS "mcUuid", mc_username_cache AS "mcUsername", total, rank
      FROM (
        SELECT
          pm.metric,
          pm.mc_uuid,
          l.mc_username_cache,
          SUM(pm.value_num)::bigint AS total,
          ROW_NUMBER() OVER (
            PARTITION BY pm.metric
            ORDER BY SUM(pm.value_num) DESC, l.mc_username_cache ASC
          ) AS rank
        FROM player_metrics pm
        JOIN minecraft_links l
          ON l.mc_uuid = pm.mc_uuid
          AND l.unlinked_at IS NULL
        WHERE pm.metric IN (${Prisma.join([...FEATURED_METRICS])})
          AND pm.value_num IS NOT NULL
          -- Nobody is on a board for never having done the thing, the same
          -- rule the lists on the dashboard follow.
          AND pm.value_num > 0
        GROUP BY pm.metric, pm.mc_uuid, l.mc_username_cache
      ) ranked
      WHERE rank <= ${limit}
      ORDER BY metric, rank
    `;

    const byMetric = new Map<string, Leaderboards['boards'][number]['entries']>();

    for (const row of rows) {
      const entries = byMetric.get(row.metric) ?? [];
      entries.push({
        rank: Number(row.rank),
        mcUuid: row.mcUuid,
        mcUsername: row.mcUsername,
        value: Number(row.total),
      });
      byMetric.set(row.metric, entries);
    }

    // Featured order rather than whatever the database returned, so the page
    // reads the same way as the dashboard above it. A metric nobody has moved
    // yet is left out rather than shown as an empty table.
    return {
      boards: FEATURED_METRICS.filter((metric) => byMetric.has(metric)).map((metric) => ({
        metric,
        entries: byMetric.get(metric) ?? [],
      })),
    };
  }
}
