<script lang="ts">
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Card from '$lib/components/Card.svelte';
  import ServerIcon from '$lib/components/ServerIcon.svelte';
  import { translate } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));
</script>

<svelte:head>
  <title>{t.webmap_heading()} · {t.app_name()}</title>
</svelte:head>

<header>
  <h1>{t.webmap_heading()}</h1>
  <p class="lede">{t.webmap_body()}</p>
</header>

{#if data.maps.length === 0}
  <Card>
    <p class="muted">{t.webmap_empty()}</p>
  </Card>
{:else}
  <ul>
    {#each data.maps as { server, url } (server.id)}
      <li>
        <Card>
          <div class="server">
            <ServerIcon iconUrl={server.iconUrl} name={server.name} size={56} />
            <h2>{server.name}</h2>
          </div>

          <!--
            Another site entirely, so a new tab, and without the opener: the map
            is not ours and should not be able to reach back into this page.
            An absolute address from the server's own data, so there is no
            route of ours for resolve() to resolve.
          -->
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a class="open" href={url} target="_blank" rel="noopener noreferrer">
            {t.webmap_open()}
            <ExternalLink size={16} aria-hidden="true" />
            <span class="visually-hidden">{t.webmap_opensNew()}</span>
          </a>
        </Card>
      </li>
    {/each}
  </ul>
{/if}

<style>
  h1 {
    font-size: var(--text-xl);
  }

  .lede {
    max-width: 70ch;
    margin-top: var(--space-2);
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  .muted {
    margin: 0;
    color: var(--fg-muted);
  }

  /* A grid that makes as many columns as fit, so two servers sit side by side
     on a laptop and stack on a phone with no breakpoint to maintain. */
  ul {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    gap: var(--space-4);
    margin: var(--space-5) 0 0;
    padding: 0;
    list-style: none;
  }

  /* Each card is the same height whatever the name does, and the button sits on
     the floor of it, so a row of them reads as one row. */
  li {
    display: flex;
  }

  li > :global(.card) {
    flex: 1;
    justify-content: space-between;
  }

  .server {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  h2 {
    font-size: var(--text-base);
    overflow-wrap: anywhere;
  }

  /* The same block as Button, for a link. A button inside an anchor is invalid
     markup, and a link that is styled as a button is what this is. */
  .open {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border: 2px solid var(--fg);
    border-radius: var(--radius-md);
    background: var(--accent);
    box-shadow: var(--shadow-sm);
    color: var(--accent-contrast);
    font-weight: 700;
    line-height: 1.2;
    text-decoration: none;
    transition:
      background 100ms ease,
      transform 60ms ease,
      box-shadow 60ms ease;
  }

  .open:hover {
    background: var(--accent-strong);
  }

  .open:active {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  .open:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }
</style>
