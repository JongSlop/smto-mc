<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import ServerIcon from '$lib/components/ServerIcon.svelte';
  import { resolve } from '$app/paths';
  import { formatDate } from '$lib/format';
  import { translate } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));
  const servers = $derived(data.servers);
</script>

<svelte:head>
  <title>{t.servers_archivedHeading()} · {t.app_name()}</title>
</svelte:head>

<header>
  <h1>{t.servers_archivedHeading()}</h1>
  <p class="lede">{t.servers_archivedBody()}</p>
</header>

{#if servers.length === 0}
  <Card>
    <p class="muted">{t.servers_archivedEmpty()}</p>
  </Card>
{:else}
  <ul>
    {#each servers as server (server.id)}
      <li>
        <a href={resolve('/(app)/servers/[id]', { id: server.id })}>
          <ServerIcon iconUrl={server.iconUrl} name={server.name} size={48} />
          <span class="body">
            <span class="name">{server.name}</span>
            <!--
              Dates only, no description: this is a way back to a page that has
              the description on it, and a wall of paragraphs would bury the
              nine names somebody came here to scan.
            -->
            <span class="meta">
              {#if server.launchDate}
                <span>{t.servers_launched({ date: formatDate(server.launchDate, data.lang) })}</span
                >
              {/if}
              {#if server.currentVersion}
                <span>{t.servers_version({ version: server.currentVersion })}</span>
              {/if}
            </span>
          </span>
        </a>
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
  }

  ul {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The whole row is the target, so it works on a phone as well as a pointer. */
  a {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 100%;
    padding: var(--space-4);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: var(--fg);
    text-decoration: none;
  }

  a:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .name {
    font-family: var(--font-display);
    font-size: var(--text-sm);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }

  .muted {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }
</style>
