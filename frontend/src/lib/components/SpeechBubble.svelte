<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<!--
  A bubble whose tail points down, at the head of whatever is drawn under it.
-->
<div class="bubble">
  <div class="text">{@render children()}</div>
</div>

<style>
  .bubble {
    position: relative;
    z-index: 1;
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--fg);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-sm);
    font-size: var(--text-sm);
    line-height: 1.4;
    text-align: center;
  }

  /* A square turned on its corner, straddling the bottom edge. Its fill covers
     the box's border where the two meet, and only its lower two sides are
     drawn, so the outline runs into the tail without a seam. */
  .bubble::after {
    content: '';
    position: absolute;
    bottom: -9px;
    left: 50%;
    width: 14px;
    height: 14px;
    border-right: 2px solid var(--fg);
    border-bottom: 2px solid var(--fg);
    background: var(--bg-elevated);
    transform: translateX(-50%) rotate(45deg);
  }

  /* Hidden overflow lives on the text, not the bubble, or it would clip the
     tail. Stacked combining marks can otherwise grow a line taller than the box. */
  .text {
    overflow: hidden;
    overflow-wrap: anywhere;
  }
</style>
