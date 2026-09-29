<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import ServerFilter, { type FilterServer } from '$lib/components/ServerFilter.svelte';
  import SkinViewer from '$lib/components/SkinViewer.svelte';
  import StatsPanel from '$lib/components/StatsPanel.svelte';
  // `base` alongside `resolve` on purpose: resolve() only knows this app's
  // routes, and the skin proxy is an API path behind the same prefix.
  import { base, resolve } from '$app/paths';
  import { formatDateShort, formatDateTime } from '$lib/format';
  import { translate } from '$lib/i18n';
  import { hasRecordedValue, type MetricValue } from '$lib/metrics';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));
  const profile = $derived(data.profile);
  const servers = $derived(profile.stats.servers);

  const page = $derived(resolve('/(app)/players/[uuid]', { uuid: profile.mcUuid }));
  const skinUrl = $derived(`${base}/api/v1/public/skins/${profile.mcUuid}.png`);

  /** Every server here has data by construction, which is what the chips need. */
  const filterServers = $derived<FilterServer[]>(
    servers.map((entry) => ({
      id: entry.serverId,
      name: entry.serverName,
      iconUrl: entry.serverIconUrl,
      state: entry.serverState,
    })),
  );

  /** The one server the numbers are narrowed to, or null for the whole network. */
  const scoped = $derived(servers.find((entry) => entry.serverId === data.server) ?? null);

  /**
   * What the panel lays out.
   *
   * Across every server that is the summed counters the API already provides.
   * Narrowed to one, it is everything that server recorded, gauges included:
   * the reason gauges are left out of the sums is that adding them up across
   * servers means nothing, and that reason does not apply to a single one.
   */
  const metrics = $derived(
    (scoped ? scoped.metrics : profile.stats.totals) as Record<string, MetricValue>,
  );

  const hasNumbers = $derived(Object.values(metrics).some(hasRecordedValue));

  /** Newest of the servers in scope. ISO strings, so they sort as text. */
  const lastSeen = $derived(
    (scoped ? [scoped] : servers).reduce<string | null>(
      (latest, entry) =>
        entry.lastSeenAt !== null && (latest === null || entry.lastSeenAt > latest)
          ? entry.lastSeenAt
          : latest,
      null,
    ),
  );
</script>

<svelte:head>
  <title>{profile.mcUsername} · {t.app_name()}</title>
</svelte:head>

<p class="back">
  <a href={resolve('/(app)/leaderboards')}>← {t.profile_back()}</a>
</p>

<h1>{profile.mcUsername}</h1>

<div class="profile">
  <Card>
    <SkinViewer {skinUrl} username={profile.mcUsername} />

    <dl class="facts">
      <div>
        <dt>{t.dashboard_serversPlayed()}</dt>
        <dd>{servers.length}</dd>
      </div>
      <div>
        <dt>{t.dashboard_linkedSince()}</dt>
        <dd>{formatDateShort(profile.linkedSince, data.lang)}</dd>
      </div>
      {#if lastSeen}
        <div>
          <dt>{t.profile_lastSeenLabel()}</dt>
          <dd>{formatDateTime(lastSeen, data.lang)}</dd>
        </div>
      {/if}
    </dl>
  </Card>

  <div class="right">
    <ServerFilter
      servers={filterServers}
      selected={scoped?.serverId ?? null}
      hrefFor={(id) => (id === null ? page : `${page}?server=${encodeURIComponent(id)}`)}
    />

    {#if hasNumbers}
      <StatsPanel {metrics} />
    {:else if scoped}
      <Card
        title={t.profile_noStatsHeading()}
        description={t.profile_noStatsOnServer({
          name: profile.mcUsername,
          server: scoped.serverName,
        })}
      >
        <span></span>
      </Card>
    {:else}
      <Card
        title={t.profile_noStatsHeading()}
        description={t.profile_noStatsBody({ name: profile.mcUsername })}
      >
        <span></span>
      </Card>
    {/if}
  </div>
</div>

<style>
  h1 {
    font-size: var(--text-xl);
  }

  .back {
    margin: 0;
    font-size: var(--text-sm);
  }

  .profile {
    display: grid;
    grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
    gap: var(--space-5);
    align-items: start;
  }

  .right {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .facts {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding-top: var(--space-4);
    border-top: 2px solid var(--border);
  }

  .facts > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
  }

  .facts dt {
    color: var(--fg-muted);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .facts dd {
    margin: 0;
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  @media (max-width: 48rem) {
    .profile {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
