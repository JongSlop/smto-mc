<script lang="ts" module>
  /** What a chip needs to know about a server, whichever page is asking. */
  export interface FilterServer {
    id: string;
    name: string;
    iconUrl: string | null;
    state: string;
  }
</script>

<script lang="ts">
  import ServerIcon from './ServerIcon.svelte';
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';

  interface Props {
    /** Only the servers worth choosing between: ones that would show something. */
    servers: FilterServer[];
    /** The server the page is narrowed to, or null for the whole network. */
    selected: string | null;
    /** The address for a choice, so each page keeps whatever else is in its own. */
    hrefFor: (serverId: string | null) => string;
  }

  let { servers, selected, hrefFor }: Props = $props();

  const t = $derived(translate(page.data.lang ?? 'en'));

  /**
   * How many servers get a chip of their own.
   *
   * Five fit one row beside "All servers" on a laptop and two on a phone, and a
   * network that has been running a while has more than that. Everything past
   * it, and every archived server, waits behind one expander instead of turning
   * the filter into a wall of chips above the numbers.
   */
  const VISIBLE_CHIPS = 5;

  const active = $derived(servers.filter((entry) => entry.state !== 'ARCHIVED'));
  const archived = $derived(servers.filter((entry) => entry.state === 'ARCHIVED'));
  const primary = $derived(active.slice(0, VISIBLE_CHIPS));
  const overflow = $derived([...active.slice(VISIBLE_CHIPS), ...archived]);

  /**
   * Named for what is in it: an expander of nothing but old servers says so,
   * which is the same word the header menu uses for them.
   */
  const overflowLabel = $derived(
    active.length <= VISIBLE_CHIPS
      ? t.serverFilter_archived({ count: overflow.length })
      : t.serverFilter_more({ count: overflow.length }),
  );
</script>

<!--
  Links rather than buttons, for the reason the leaderboard tabs are: the choice
  lives in the query string, so a narrowed view is a real address that survives a
  reload, can be sent to somebody, and works with JavaScript off. With a single
  server there is nothing to choose between, so nothing is drawn.
-->
<!--
  The addresses come from the page, which resolves its own path and adds the
  parameter, so there is no route here for resolve() to check.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#snippet chip(entry: FilterServer)}
  <a href={hrefFor(entry.id)} aria-current={selected === entry.id ? 'page' : undefined}>
    <ServerIcon iconUrl={entry.iconUrl} name={entry.name} size={20} />
    <span>{entry.name}</span>
  </a>
{/snippet}

{#if servers.length > 1}
  <nav class="filters" aria-label={t.serverFilter_label()}>
    <div class="filter">
      <a href={hrefFor(null)} aria-current={selected === null ? 'page' : undefined}>
        {t.serverFilter_all()}
      </a>
      {#each primary as entry (entry.id)}
        {@render chip(entry)}
      {/each}
    </div>

    <!--
      Open when the server being looked at is in here, so the current choice is
      never hidden behind a closed expander.
    -->
    {#if overflow.length > 0}
      <details class="more" open={overflow.some((entry) => entry.id === selected)}>
        <summary>{overflowLabel}</summary>
        <div class="filter">
          {#each overflow as entry (entry.id)}
            {@render chip(entry)}
          {/each}
        </div>
      </details>
    {/if}
  </nav>
{/if}

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* Wraps rather than scrolls, so a server at the end of a long row is never
     hidden behind a swipe nobody knows to make. */
  .filter {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .filter a,
  .more summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--fg-muted);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
  }

  .filter a:hover,
  .more summary:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* The open one reads like a pressed block, the same as a leaderboard tab. */
  .filter a[aria-current='page'] {
    border-color: var(--fg);
    background: var(--accent-subtle);
    color: var(--accent);
    box-shadow: var(--shadow-sm);
  }

  /* Dashed, so it reads as a control that opens something rather than as one
     more server. Its marker is our own, since the native one is hidden. */
  .more summary {
    width: fit-content;
    border-style: dashed;
    cursor: pointer;
    list-style: none;
  }

  .more summary::-webkit-details-marker {
    display: none;
  }

  .more summary::after {
    content: '';
    border-left: 5px solid currentColor;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    transition: transform 120ms ease;
  }

  .more[open] summary::after {
    transform: rotate(90deg);
  }

  .more summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .more .filter {
    margin-top: var(--space-3);
  }

  @media (prefers-reduced-motion: reduce) {
    .more summary::after {
      transition: none;
    }
  }
</style>
