<script lang="ts">
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';

  interface Props {
    /** Key to value, exactly as stored. */
    settings: Record<string, string>;
  }

  let { settings }: Props = $props();

  const t = $derived(translate(page.data.lang ?? 'en'));

  // The backend already sorts by key, but a record does not promise an order to
  // whoever receives it, and a list that reshuffles between visits is worse than
  // one extra sort.
  const entries = $derived(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b)));
</script>

<!--
  Everything stored for this player, whoever wrote it: the website, or a mod on
  one of the servers. Collapsed, because it is for the curious and the people
  debugging a mod, not something the page is about.

  A <details> for the reason the stats expander is one: it works with
  JavaScript off and reads correctly to a screen reader with no aria of our own.

  Values are text a player or a mod chose, so they only ever go in as text
  nodes. Never as markup.
-->
<details class="expander">
  <summary>{t.settings_storedHeading({ count: entries.length })}</summary>

  <div class="body">
    <p class="muted">{t.settings_storedBody()}</p>

    {#if entries.length === 0}
      <p class="muted">{t.settings_storedEmpty()}</p>
    {:else}
      <dl>
        {#each entries as [key, value] (key)}
          <dt>{key}</dt>
          <dd>
            {#if value === ''}
              <span class="muted">{t.settings_storedEmptyValue()}</span>
            {:else}
              <span class="value">{value}</span>
            {/if}
          </dd>
        {/each}
      </dl>
    {/if}
  </div>
</details>

<style>
  summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    cursor: pointer;
    list-style: none;
    font-size: var(--text-sm);
    font-weight: 600;
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

  summary::after {
    content: '';
    width: 0;
    height: 0;
    margin-left: auto;
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

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: 0 var(--space-4) var(--space-4);
  }

  p {
    margin: 0;
  }

  dl {
    display: grid;
    grid-template-columns: minmax(8rem, auto) minmax(0, 1fr);
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }

  dt {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--fg-muted);
    overflow-wrap: anywhere;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  /* Values can be a kilobyte of anything, so they wrap wherever they have to,
     and keep the spacing they were stored with. On the span rather than the dd,
     so the template's own indentation is not part of what is preserved. */
  .value {
    white-space: pre-wrap;
  }

  .muted {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }
</style>
