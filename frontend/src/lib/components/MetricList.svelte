<script lang="ts">
  import MetricIcon from './MetricIcon.svelte';
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';
  import { formatMetric, metricLabel, type MetricValue } from '$lib/metrics';

  interface Props {
    /** Metric keyed, in the order it should render. */
    entries: [string, MetricValue][];
  }

  let { entries }: Props = $props();

  const lang = $derived(page.data.lang ?? 'en');
  const t = $derived(translate(lang));
</script>

{#if entries.length === 0}
  <p class="empty">{t.stats_nothingElse()}</p>
{:else}
  <dl>
    {#each entries as [key, value] (key)}
      <div class="row">
        <dt>
          <span class="icon"><MetricIcon metric={key} size={16} /></span>
          {metricLabel(t, key)}
        </dt>
        <dd>{formatMetric(value, key, lang)}</dd>
      </div>
    {/each}
  </dl>
{/if}

<style>
  dl {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
  }

  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--border);
  }

  .row:last-child {
    border-bottom: 0;
  }

  dt {
    display: flex;
    align-items: center;
    /* The icon is a marker for the row, not a second label, so it sits close. */
    gap: var(--space-2);
    min-width: 0;
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  /* Keeps the icon at its own size when a long label fills the row. */
  .icon {
    display: flex;
    flex: none;
  }

  dd {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    /* Values line up down the right edge even as digits change. */
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .empty {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }
</style>
