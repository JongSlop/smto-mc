<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import FeaturedStat from '$lib/components/FeaturedStat.svelte';
  import MetricList from '$lib/components/MetricList.svelte';
  import SkinViewer from '$lib/components/SkinViewer.svelte';
  // `base` alongside `resolve` on purpose: resolve() only knows this app's
  // routes, and the skin proxy is an API path behind the same prefix rather
  // than a page.
  import { base, resolve } from '$app/paths';
  import { formatDateShort } from '$lib/format';
  import { translate } from '$lib/i18n';
  import { formatMetric, metricLabel, splitMetrics, type MetricValue } from '$lib/metrics';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));
  const link = $derived(data.me.link);
  const stats = $derived(data.me.stats);

  // Served from our own origin so the 3D renderer can read the pixels off it.
  const skinUrl = $derived(link ? `${base}/api/v1/public/skins/${link.mcUuid}.png` : null);

  /**
   * The headline numbers, summed across every server.
   *
   * `totals` carries counters only, so these are all safely additive; a gauge
   * stays visible in its own server's list rather than being added to a number
   * that would mean nothing.
   */
  const overall = $derived(splitMetrics(stats.totals as Record<string, MetricValue>));
</script>

<svelte:head>
  <title>{t.dashboard_heading()} · {t.app_name()}</title>
</svelte:head>

<h1>{t.dashboard_heading()}</h1>

{#if !link}
  <Card title={t.dashboard_notLinkedHeading()} description={t.dashboard_notLinkedBody()}>
    <div>
      <a href={resolve('/settings')}><Button>{t.dashboard_linkNow()}</Button></a>
    </div>
  </Card>
{:else}
  <div class="profile">
    <Card>
      {#if skinUrl}
        <SkinViewer {skinUrl} username={link.mcUsername} />
      {/if}
      <p class="username">{link.mcUsername}</p>

      <!--
        Context rather than achievement. These two say who this profile is and
        since when, which is worth having on the page but is not what somebody
        came to look at, so they sit quietly under the character instead of
        taking a tile each next to the numbers that matter.
      -->
      <dl class="facts">
        <div>
          <dt>{t.dashboard_serversPlayed()}</dt>
          <dd>{stats.servers.length}</dd>
        </div>
        <div>
          <dt>{t.dashboard_linkedSince()}</dt>
          <dd>
            {formatDateShort(link.verifiedAt, data.lang)}
            <span class="via">
              {link.verifiedVia === 'MSA'
                ? t.settings_linkedVia_MSA()
                : t.settings_linkedVia_INGAME_CODE()}
            </span>
          </dd>
        </div>
      </dl>
    </Card>

    <div class="right">
      <!--
        The same few headlines every time, zero included, so the dashboard reads
        the same way this week as last. Empty only until something has been
        recorded somewhere: a profile that has never been seen on a server has
        no numbers to be confident about.
      -->
      {#if overall.featured.length > 0}
        <div class="featured">
          {#each overall.featured as metric (metric.key)}
            <FeaturedStat
              metric={metric.key}
              label={metricLabel(t, metric.key)}
              value={formatMetric(metric.value, metric.key, data.lang)}
            />
          {/each}
        </div>
      {/if}
      <!--
        Everything recorded anywhere, summed. A <details> rather than a toggle
        in script, so it opens with JavaScript off and reads correctly to a
        screen reader without any aria of our own.
      -->
      {#if overall.rest.length > 0}
        <details class="expander">
          <summary>{t.stats_showAll()}</summary>
          <div class="expander-body">
            <MetricList entries={overall.rest} />
          </div>
        </details>
      {/if}
    </div>
  </div>

  <!--
    Per server numbers live on the server's own page, reachable from the Servers
    menu in the header. Repeating them here made the dashboard a second, worse
    copy of five pages, and a player who wants to know what they did on one
    server wants the rest of that server's page with it.
  -->
  {#if stats.servers.length === 0}
    <Card title={t.dashboard_noStatsHeading()} description={t.dashboard_noStatsBody()}>
      <span></span>
    </Card>
  {/if}
{/if}

<style>
  h1 {
    font-size: var(--text-xl);
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

  .username {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    text-align: center;
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

  .via {
    display: block;
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }

  .featured {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: var(--space-4);
  }

  /* The whole summary row is the hit target, so there is no small chevron to
     aim at on a phone. */
  summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: var(--bg-sunken);
  }

  summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  /* A marker of our own, since the native one is hidden. Rotates to point down
     when open, and holds still for anybody who asked for less motion. */
  summary::after {
    content: '';
    width: 0;
    height: 0;
    border-left: 5px solid currentColor;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    color: var(--fg-muted);
    transition: transform 120ms ease;
  }

  details[open] > summary::after {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    summary::after {
      transition: none;
    }
  }

  .expander {
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
  }

  .expander > summary {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  /* Pushes the marker to the right edge on the standalone expander, where
     there is no value column to sit beside. */
  .expander > summary::after {
    margin-left: auto;
  }

  .expander-body {
    padding: 0 var(--space-4) var(--space-3);
  }

  @media (max-width: 48rem) {
    .profile {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
