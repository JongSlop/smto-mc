import { z } from 'zod';

import { mcUuidSchema } from './minecraft.js';

/**
 * A metric name. Free text within a shape, not an enum, and that is the whole
 * point of this design: a plugin that starts recording something new needs an
 * API deploy for nothing. Blocks mined, deaths, distance walked and playtime
 * are all the same row shape.
 *
 * The suffix convention carries the unit, so nobody has to remember whether
 * playtime is seconds or ticks: `playtime_seconds`, `distance_cm`,
 * `blocks_mined`.
 */
export const metricKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'metric keys are lowercase snake_case');
export type MetricKey = z.infer<typeof metricKeySchema>;

/** Total seconds played. The one metric the plugins already collect today. */
export const PLAYTIME_METRIC = 'playtime_seconds';

/**
 * How a metric behaves when a new value arrives, which the ingest endpoint has
 * to know and cannot guess:
 *
 * - `counter` only ever grows. A lower value than the stored one means the
 *   server lost its local state, so it is rejected and logged rather than
 *   written, which stops a wiped world from erasing somebody's playtime.
 * - `gauge` is a snapshot and is simply overwritten.
 *
 * Unknown metrics default to `counter`, because that is what a plugin
 * reporting a running total is, and it is the safe direction to be wrong in.
 */
export const METRIC_KINDS = ['counter', 'gauge'] as const;
export const metricKindSchema = z.enum(METRIC_KINDS);
export type MetricKind = z.infer<typeof metricKindSchema>;

/** Well-known metrics and how they behave. Anything absent is a counter. */
export const METRIC_KINDS_BY_KEY: Readonly<Record<string, MetricKind>> = {
  [PLAYTIME_METRIC]: 'counter',
  deaths: 'counter',
};

/**
 * The metrics worth showing large, in the order they should appear.
 *
 * Everything recorded still reaches the dashboard; this only decides what gets
 * a tile rather than a row in an expandable list. Promoting a metric is one line
 * here, and a metric that is not listed needs no change at all to show up.
 *
 * The icon is not named here: the frontend's MetricIcon component maps a metric
 * key to a shape, so every metric has one whether it is featured or not.
 */
export const FEATURED_METRICS: readonly string[] = [
  PLAYTIME_METRIC,
  'deaths',
  'distance_traveled_cm',
  'items_crafted',
  'blocks_mined',
  'damage_dealt',
  'mob_kills',
  'things_used',
  'items_picked_up',
];

export function isFeaturedMetric(key: string): boolean {
  return FEATURED_METRICS.includes(key);
}

export function metricKind(key: string): MetricKind {
  return METRIC_KINDS_BY_KEY[key] ?? 'counter';
}

/**
 * One reading. Exactly one of `value` and `data` is set: numbers are what
 * almost everything is, and `data` is the escape hatch for a statistic that is
 * genuinely structured, like a per-biome breakdown.
 */
export const metricEntrySchema = z
  .object({
    uuid: mcUuidSchema,
    metric: metricKeySchema,
    value: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (entry) => (entry.value === undefined) !== (entry.data === undefined),
    'provide exactly one of value or data',
  );
export type MetricEntry = z.infer<typeof metricEntrySchema>;

/**
 * Batch size. A plugin flushes every few minutes for a whole server, so the
 * limit is generous, but it is a limit: one request must not be able to hold a
 * connection open writing ten thousand rows.
 */
export const METRIC_BATCH_LIMIT = 500;

export const ingestMetricsSchema = z.object({
  serverId: z.string().trim().min(1).max(32),
  entries: z.array(metricEntrySchema).min(1).max(METRIC_BATCH_LIMIT),
});
export type IngestMetricsInput = z.infer<typeof ingestMetricsSchema>;

/**
 * What the ingest endpoint answers with. `rejected` is not an error: a batch of
 * three hundred players where two reported a lower total than we hold is a
 * successful request that wrote 298 rows, and the plugin author wants to see
 * the two rather than have the whole flush fail.
 */
export const ingestResultSchema = z.object({
  accepted: z.number().int(),
  rejected: z.array(
    z.object({
      uuid: z.string(),
      metric: z.string(),
      reason: z.enum(['unknown_server', 'counter_went_backwards']),
    }),
  ),
});
export type IngestResult = z.infer<typeof ingestResultSchema>;

/** One server's worth of a player's statistics, as the dashboard reads them. */
export const serverStatsSchema = z.object({
  serverId: z.string(),
  serverName: z.string(),
  serverIconUrl: z.string().nullable(),
  serverState: z.string(),
  playtimeSeconds: z.number().int(),
  /** Everything else recorded for this player on this server, metric keyed. */
  metrics: z.record(z.string(), z.union([z.number(), z.record(z.string(), z.unknown())])),
  lastSeenAt: z.iso.datetime().nullable(),
});
export type ServerStats = z.infer<typeof serverStatsSchema>;

export const playerStatsSchema = z.object({
  totalPlaytimeSeconds: z.number().int(),
  /**
   * Every numeric metric summed across servers, metric keyed.
   *
   * Counters only. Adding up gauges would be meaningless: a snapshot from each
   * of five servers summed is not a number that describes anything, so gauges
   * stay visible per server and are left out here.
   */
  totals: z.record(z.string(), z.number()),
  servers: z.array(serverStatsSchema),
});
export type PlayerStats = z.infer<typeof playerStatsSchema>;
