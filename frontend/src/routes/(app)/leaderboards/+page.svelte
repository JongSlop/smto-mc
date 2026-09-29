<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import MetricIcon from '$lib/components/MetricIcon.svelte';
  import PlayerFace from '$lib/components/PlayerFace.svelte';
  import ServerFilter from '$lib/components/ServerFilter.svelte';
  import { resolve } from '$app/paths';
  import { translate } from '$lib/i18n';
  import { formatMetric, metricLabel } from '$lib/metrics';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));
  const page = $derived(resolve('/(app)/leaderboards'));

  /**
   * This page's address with a tab and a server on it.
   *
   * Both live in the query string and each control has to keep the other's
   * choice: switching tab must not drop the server, and switching server must
   * not drop the tab. Either is left off when it is the default, so the plain
   * address stays the plain address.
   */
  function address(choice: { metric?: string | null; server?: string | null }): string {
    const query: string[] = [];

    if (choice.metric) query.push(`metric=${encodeURIComponent(choice.metric)}`);
    if (choice.server) query.push(`server=${encodeURIComponent(choice.server)}`);

    return query.length > 0 ? `${page}?${query.join('&')}` : page;
  }

  /**
   * The name of the server in the scope line. From the layout's list of every
   * public server rather than from the ones with a ranking, so a server nobody
   * has played yet still reads as its name and not as its id.
   */
  const serverName = $derived(
    data.servers.find((entry) => entry.id === data.server)?.name ?? data.server,
  );
</script>

<svelte:head>
  <title>{t.leaderboards_heading()} · {t.app_name()}</title>
</svelte:head>

<h1>{t.leaderboards_heading()}</h1>
<p class="intro">{t.leaderboards_intro()}</p>

<ServerFilter
  servers={data.boardServers}
  selected={data.server}
  hrefFor={(id) => address({ metric: data.board?.metric, server: id })}
/>

{#if data.server}
  <p class="scope">{t.leaderboards_scopeServer({ server: serverName ?? '' })}</p>
{/if}

{#if !data.board}
  <Card
    title={t.leaderboards_emptyHeading()}
    description={data.server
      ? t.leaderboards_emptyOnServer({ server: serverName ?? '' })
      : t.leaderboards_emptyBody()}
  >
    {#if data.server}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href={address({})}>{t.serverFilter_all()}</a>
    {:else}
      <span></span>
    {/if}
  </Card>
{:else}
  <!--
    Links rather than buttons, and the open board lives in the query string.
    That makes a tab a real address: it survives a reload, it can be sent to
    somebody, and the page still works with JavaScript off.
  -->
  <!--
    The address is this page's own path with parameters on it, built by
    address() above from the path resolve() gave us, so there is no route here
    for the rule to check.
  -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <nav class="tabs" aria-label={t.leaderboards_heading()}>
    {#each data.metrics as metric (metric)}
      <a
        href={address({ metric, server: data.server })}
        aria-current={metric === data.board.metric ? 'page' : undefined}
      >
        <MetricIcon {metric} size={16} />
        <span>{metricLabel(t, metric)}</span>
      </a>
    {/each}
  </nav>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->

  <Card>
    <h2>
      <MetricIcon metric={data.board.metric} size={22} />
      {metricLabel(t, data.board.metric)}
    </h2>

    <ol>
      {#each data.board.entries as entry (entry.mcUuid)}
        <!-- Marked rather than moved: the reader stays where they placed. -->
        <li class:you={entry.mcUuid === data.mcUuid}>
          <!--
            The whole row is the link, so the target is as big as the row and a
            phone does not need a thumb on the name specifically.
          -->
          <a href={resolve('/(app)/players/[uuid]', { uuid: entry.mcUuid })}>
            <span class="rank">{entry.rank}</span>
            <PlayerFace mcUuid={entry.mcUuid} size={40} />
            <span class="name">{entry.mcUsername}</span>
            <span class="value">{formatMetric(entry.value, data.board.metric, data.lang)}</span>
          </a>
        </li>
      {/each}
    </ol>
  </Card>
{/if}

<style>
  h1 {
    font-size: var(--text-xl);
  }

  h2 {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-lg);
  }

  .intro {
    max-width: 70ch;
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  .scope {
    margin: 0;
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  /* Wraps onto as many rows as it needs. Nine metrics never fit one line on a
     laptop, and a scrolling strip hides the ones at the end. */
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .tabs a {
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

  .tabs a:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  /* The open tab is the one the page is about, so it reads like a pressed
     block rather than a slightly darker link. */
  .tabs a[aria-current='page'] {
    border-color: var(--fg);
    background: var(--accent-subtle);
    color: var(--accent);
    box-shadow: var(--shadow-sm);
  }

  ol {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    border-bottom: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  li a {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    color: inherit;
    text-decoration: none;
  }

  li a:hover {
    background: var(--bg-sunken);
  }

  li a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .you a:hover {
    background: var(--accent-subtle);
  }

  li:last-child {
    border-bottom: 0;
  }

  .you {
    background: var(--accent-subtle);
  }

  .rank {
    width: 2ch;
    color: var(--fg-muted);
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  /* One board at a time, so there is room for the whole name and the whole
     reading on one line at any width worth designing for. */
  .name {
    flex: 1;
    min-width: 0;
    font-size: var(--text-base);
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .value {
    flex: none;
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  @media (max-width: 34rem) {
    li a {
      gap: var(--space-3);
    }

    /* Nothing to gain from a big number on a phone, and the name needs the
       room more. */
    .value {
      font-size: var(--text-sm);
    }
  }
</style>
