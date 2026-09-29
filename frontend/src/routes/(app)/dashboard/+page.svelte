<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import SkinViewer from '$lib/components/SkinViewer.svelte';
  import StatsPanel from '$lib/components/StatsPanel.svelte';
  // `base` alongside `resolve` on purpose: resolve() only knows this app's
  // routes, and the skin proxy is an API path behind the same prefix rather
  // than a page.
  import { base, resolve } from '$app/paths';
  import { formatDateShort } from '$lib/format';
  import { translate } from '$lib/i18n';
  import type { MetricValue } from '$lib/metrics';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));
  const link = $derived(data.me.link);
  const stats = $derived(data.me.stats);

  // Served from our own origin so the 3D renderer can read the pixels off it.
  const skinUrl = $derived(link ? `${base}/api/v1/public/skins/${link.mcUuid}.png` : null);
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
        The way to your own public page, and so to the box for the speech
        bubble. Without it that page is reachable only if you happen to be in a
        top ten, which is no way to find a thing you are meant to edit.
      -->
      <p class="public">
        <a href={resolve('/(app)/players/[uuid]', { uuid: link.mcUuid })}>
          {t.dashboard_publicPage()}
        </a>
      </p>

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
        The headline numbers, summed across every server. `totals` carries
        counters only, so these are all safely additive; a gauge stays visible
        in its own server's list rather than being added to a number that would
        mean nothing.
      -->
      <StatsPanel metrics={stats.totals as Record<string, MetricValue>} />
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

  .public {
    margin: 0;
    font-size: var(--text-sm);
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

  @media (max-width: 48rem) {
    .profile {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
