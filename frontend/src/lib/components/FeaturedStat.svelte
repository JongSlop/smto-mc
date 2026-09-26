<script lang="ts">
  import MetricIcon from './MetricIcon.svelte';

  interface Props {
    /** A metric key, such as `blocks_mined`. */
    metric: string;
    label: string;
    value: string;
    hint?: string;
  }

  let { metric, label, value, hint }: Props = $props();
</script>

<div class="stat">
  <span class="icon" aria-hidden="true"><MetricIcon {metric} size={22} /></span>

  <span class="body">
    <span class="label">{label}</span>
    <span class="value">{value}</span>
    {#if hint}
      <span class="hint">{hint}</span>
    {/if}
  </span>
</div>

<style>
  /*
   * Deliberately loud: this is the handful of numbers somebody actually came to
   * see, and the icon is what makes them findable at a glance once there are
   * several. Everything else lives in the expandable lists, where a plain row
   * is the right weight.
   */
  .stat {
    display: flex;
    /* Stretch, so the body can fill the tile and drop the number to the floor
       of it. Tiles in a row are already the same height, being grid items. */
    align-items: stretch;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--bg-elevated);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
  }

  .icon {
    display: grid;
    place-items: center;
    /* Sits with the label at the top rather than growing with the tile. */
    align-self: flex-start;
    padding: var(--space-2);
    border: 2px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .label {
    color: var(--fg-muted);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /*
   * Pushed to the bottom of the tile rather than sitting under its label.
   * Labels are one or two lines depending on the metric, and letting the
   * numbers follow them meant a row of tiles had its numbers at three
   * different heights. On the floor they line up across the row whatever the
   * labels do.
   */
  .value {
    margin-top: auto;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    line-height: 1.2;
    /* Numbers that change between renders should not shift the layout. */
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }

  .hint {
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }
</style>
