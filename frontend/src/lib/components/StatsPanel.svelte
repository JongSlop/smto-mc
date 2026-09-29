<script lang="ts">
  import FeaturedStat from './FeaturedStat.svelte';
  import MetricList from './MetricList.svelte';
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';
  import { formatMetric, metricLabel, splitMetrics, type MetricValue } from '$lib/metrics';

  interface Props {
    /** Metric keyed. Already summed or already narrowed: this only lays it out. */
    metrics: Record<string, MetricValue>;
  }

  let { metrics }: Props = $props();

  const lang = $derived(page.data.lang ?? 'en');
  const t = $derived(translate(lang));

  const split = $derived(splitMetrics(metrics));
</script>

<!--
  The same few headlines every time, zero included, so a page reads the same way
  this week as last. Empty only until something has been recorded: a profile that
  has never been seen on a server has no numbers to be confident about.
-->
{#if split.featured.length > 0}
  <div class="featured">
    {#each split.featured as metric (metric.key)}
      <FeaturedStat
        metric={metric.key}
        label={metricLabel(t, metric.key)}
        value={formatMetric(metric.value, metric.key, lang)}
      />
    {/each}
  </div>
{/if}

<!--
  Everything else recorded, in one list. A <details> rather than a toggle in
  script, so it opens with JavaScript off and reads correctly to a screen reader
  without any aria of our own.
-->
{#if split.rest.length > 0}
  <details class="expander">
    <summary>{t.stats_showAll()}</summary>
    <div class="expander-body">
      <MetricList entries={split.rest} />
    </div>
  </details>
{/if}

<style>
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
</style>
