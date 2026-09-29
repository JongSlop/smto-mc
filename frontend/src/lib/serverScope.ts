import type { PlayerStats, ServerStats } from '@smto/mc-contracts';

import type { FilterServer } from '$lib/components/ServerFilter.svelte';
import type { MetricValue } from '$lib/metrics';

/**
 * The chips for a player's servers.
 *
 * Every server in `PlayerStats` has a row for this player by construction, so
 * each one is a choice that leads to something. Shared by the two pages that
 * offer the filter, so they cannot drift apart in what a chip is.
 */
export function filterOptions(servers: ServerStats[]): FilterServer[] {
  return servers.map((entry) => ({
    id: entry.serverId,
    name: entry.serverName,
    iconUrl: entry.serverIconUrl,
    state: entry.serverState,
  }));
}

/**
 * Which server the numbers are narrowed to, and the numbers to lay out.
 *
 * Across every server that is the summed counters the API already provides.
 * Narrowed to one, it is everything that server recorded, gauges included: the
 * reason gauges are left out of the sums is that adding them up across servers
 * means nothing, and that reason does not apply to a single one.
 *
 * An id that matches none of the player's servers is treated as no filter
 * rather than an error, so a stale link still shows the page.
 */
export function scopeStats(
  stats: PlayerStats,
  serverId: string | null,
): { scoped: ServerStats | null; metrics: Record<string, MetricValue> } {
  const scoped = stats.servers.find((entry) => entry.serverId === serverId) ?? null;

  return {
    scoped,
    metrics: (scoped ? scoped.metrics : stats.totals) as Record<string, MetricValue>,
  };
}
