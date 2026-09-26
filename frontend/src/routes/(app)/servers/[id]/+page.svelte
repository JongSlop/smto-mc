<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import MetricList from '$lib/components/MetricList.svelte';
  import ServerIcon from '$lib/components/ServerIcon.svelte';
  import { resolve } from '$app/paths';
  import { formatDate, formatDateTime } from '$lib/format';
  import { translate } from '$lib/i18n';
  import { metricEntries, type MetricValue } from '$lib/metrics';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));
  const server = $derived(data.server);

  /**
   * The server address, if the metadata carries one.
   *
   * `extra` is free-form by design, so this reads defensively rather than
   * trusting a shape: the launcher's pack JSON keeps the address under `ip`,
   * and anything else in there is none of this page's business.
   */
  const address = $derived(typeof server.extra.ip === 'string' ? server.extra.ip : null);

  const stateLabel = $derived(
    server.state === 'ONGOING'
      ? t.servers_state_ONGOING()
      : server.state === 'ARCHIVED'
        ? t.servers_state_ARCHIVED()
        : t.servers_state_UPCOMING(),
  );

  /**
   * Everything recorded here, as one list.
   *
   * No tiles, unlike the dashboard. The headline row is for the numbers across
   * the whole network, and repeating it per server turned one page into nine
   * copies of the dashboard. Zeros stay hidden, as they do in every list.
   */
  const entries = $derived(
    data.stats ? metricEntries(data.stats.metrics as Record<string, MetricValue>) : [],
  );
</script>

<svelte:head>
  <title>{server.name} · {t.app_name()}</title>
  {#if server.description}
    <meta name="description" content={server.description} />
  {/if}
</svelte:head>

<header class="head">
  <ServerIcon iconUrl={server.iconUrl} name={server.name} size={64} />
  <div>
    <h1>{server.name}</h1>
    <p class="meta">
      <span class="state state-{server.state}">{stateLabel}</span>
      <!--
        The address sits in the meta row rather than in a panel of its own. It
        is one short string, and a card with a heading around it took more of
        the page than the server's own name. Spelled out for a screen reader,
        which would otherwise hear a hostname with no idea what it is for.
      -->
      {#if address}
        <span class="address">
          <span class="visually-hidden">{t.server_address()}: </span>{address}
        </span>
      {/if}
      {#if server.launchDate}
        <span>{t.servers_launched({ date: formatDate(server.launchDate, data.lang) })}</span>
      {/if}
      {#if server.currentVersion}
        <span>{t.servers_version({ version: server.currentVersion })}</span>
      {/if}
    </p>
  </div>
</header>

{#if server.description}
  <p class="description">{server.description}</p>
{/if}

<section class="stats">
  <h2>{t.server_stats()}</h2>

  {#if !data.linked}
    <Card title={t.dashboard_notLinkedHeading()} description={t.dashboard_notLinkedBody()}>
      <div>
        <a href={resolve('/settings')}><Button>{t.dashboard_linkNow()}</Button></a>
      </div>
    </Card>
  {:else if entries.length === 0}
    <Card title={t.dashboard_noStatsHeading()} description={t.server_noStatsBody()}>
      <span></span>
    </Card>
  {:else}
    {#if data.stats?.lastSeenAt}
      <p class="muted">
        {t.dashboard_lastSeen({ when: formatDateTime(data.stats.lastSeenAt, data.lang) })}
      </p>
    {/if}

    <Card>
      <MetricList {entries} />
    </Card>
  {/if}
</section>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  h1 {
    font-size: var(--text-xl);
  }

  h2 {
    font-size: var(--text-lg);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }

  .state {
    padding: 0 var(--space-2);
    border: 2px solid currentColor;
    border-radius: var(--radius-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .state-ONGOING {
    color: var(--success);
  }

  .state-UPCOMING {
    color: var(--warning);
  }

  .description {
    max-width: 70ch;
  }

  /*
   * Selectable as one string rather than offered behind a copy button: it has
   * to survive being read off a phone and typed into a game.
   */
  .address {
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
    user-select: all;
  }

  .stats {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .muted {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }
</style>
