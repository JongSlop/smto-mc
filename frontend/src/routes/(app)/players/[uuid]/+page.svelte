<script lang="ts">
  import { PROFILE_MESSAGE_MAX } from '@smto/mc-contracts';
  import Alert from '$lib/components/Alert.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import ServerFilter, { type FilterServer } from '$lib/components/ServerFilter.svelte';
  import SkinViewer from '$lib/components/SkinViewer.svelte';
  import SpeechBubble from '$lib/components/SpeechBubble.svelte';
  import StatsPanel from '$lib/components/StatsPanel.svelte';
  // `base` alongside `resolve` on purpose: resolve() only knows this app's
  // routes, and the skin proxy is an API path behind the same prefix.
  import { enhance } from '$app/forms';
  import { base, resolve } from '$app/paths';
  import { formatDateShort, formatDateTime } from '$lib/format';
  import { errorMessage, translate } from '$lib/i18n';
  import { hasRecordedValue, type MetricValue } from '$lib/metrics';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const t = $derived(translate(data.lang));
  const profile = $derived(data.profile);
  const servers = $derived(profile.stats.servers);

  /**
   * What is in the box while the owner types.
   *
   * Derived from the saved message so it follows the page: after a save the
   * field shows the text as it was stored, cleaned up, and not as it was typed.
   * Assignable, which is what lets the input bind to it.
   */
  let draft = $derived(profile.message ?? '');
  const draftLength = $derived([...draft].length);
  const tooLong = $derived(draftLength > PROFILE_MESSAGE_MAX);

  const page = $derived(resolve('/(app)/players/[uuid]', { uuid: profile.mcUuid }));
  const skinUrl = $derived(`${base}/api/v1/public/skins/${profile.mcUuid}.png`);

  /** Every server here has data by construction, which is what the chips need. */
  const filterServers = $derived<FilterServer[]>(
    servers.map((entry) => ({
      id: entry.serverId,
      name: entry.serverName,
      iconUrl: entry.serverIconUrl,
      state: entry.serverState,
    })),
  );

  /** The one server the numbers are narrowed to, or null for the whole network. */
  const scoped = $derived(servers.find((entry) => entry.serverId === data.server) ?? null);

  /**
   * What the panel lays out.
   *
   * Across every server that is the summed counters the API already provides.
   * Narrowed to one, it is everything that server recorded, gauges included:
   * the reason gauges are left out of the sums is that adding them up across
   * servers means nothing, and that reason does not apply to a single one.
   */
  const metrics = $derived(
    (scoped ? scoped.metrics : profile.stats.totals) as Record<string, MetricValue>,
  );

  const hasNumbers = $derived(Object.values(metrics).some(hasRecordedValue));

  /** Newest of the servers in scope. ISO strings, so they sort as text. */
  const lastSeen = $derived(
    (scoped ? [scoped] : servers).reduce<string | null>(
      (latest, entry) =>
        entry.lastSeenAt !== null && (latest === null || entry.lastSeenAt > latest)
          ? entry.lastSeenAt
          : latest,
      null,
    ),
  );
</script>

<svelte:head>
  <title>{profile.mcUsername} · {t.app_name()}</title>
</svelte:head>

<p class="back">
  <a href={resolve('/(app)/leaderboards')}>← {t.profile_back()}</a>
</p>

<h1>{profile.mcUsername}</h1>

<div class="profile">
  <Card>
    <!--
      The bubble comes out of the head of the character, so it sits directly
      above the viewer and the viewer is pulled up under its tail. Visitors see
      it only when there is something to say. The owner always sees a box to
      write in, because an empty one is the only way to find out there is one.
    -->
    {#if data.isOwn}
      <SpeechBubble>
        <form method="POST" action="?/save" use:enhance class="editor">
          <label class="visually-hidden" for="profile-message">{t.bubble_label()}</label>
          <!--
            A few lines rather than one, so an eighty character message is
            all on screen while it is being written. Enter sends it, as it
            would in a one line field; without JavaScript it adds a line
            break, which is cleaned up to a space on the way in.
          -->
          <textarea
            id="profile-message"
            name="message"
            rows="4"
            autocomplete="off"
            bind:value={draft}
            placeholder={t.bubble_placeholder()}
            aria-invalid={tooLong}
            onkeydown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}></textarea>
          <span class="count" class:over={tooLong}>{draftLength}/{PROFILE_MESSAGE_MAX}</span>
          <div class="editor-buttons">
            {#if profile.message}
              <Button variant="secondary" formaction="?/remove">{t.bubble_remove()}</Button>
            {/if}
            <Button>{t.bubble_save()}</Button>
          </div>
        </form>
      </SpeechBubble>
    {:else if profile.message}
      <SpeechBubble>{profile.message}</SpeechBubble>
    {/if}

    <div class="stage" class:under-bubble={data.isOwn || profile.message}>
      <SkinViewer {skinUrl} username={profile.mcUsername} />
    </div>

    {#if form?.error}
      <Alert variant="error">{errorMessage(t, form.error)}</Alert>
    {:else if form?.saved}
      <Alert variant="success">{t.bubble_saved()}</Alert>
    {:else if form?.removed}
      <Alert variant="success">{t.bubble_removed()}</Alert>
    {:else if form?.moderated}
      <Alert variant="success">{t.bubble_moderated()}</Alert>
    {/if}

    {#if data.isOwn}
      <p class="hint">{t.bubble_hint()}</p>
    {:else if data.canModerate && profile.message}
      <form method="POST" action="?/moderate" use:enhance>
        <Button variant="danger" wide>{t.bubble_moderate()}</Button>
      </form>
    {/if}

    <dl class="facts">
      <div>
        <dt>{t.dashboard_serversPlayed()}</dt>
        <dd>{servers.length}</dd>
      </div>
      <div>
        <dt>{t.dashboard_linkedSince()}</dt>
        <dd>{formatDateShort(profile.linkedSince, data.lang)}</dd>
      </div>
      {#if lastSeen}
        <div>
          <dt>{t.profile_lastSeenLabel()}</dt>
          <dd>{formatDateTime(lastSeen, data.lang)}</dd>
        </div>
      {/if}
    </dl>
  </Card>

  <div class="right">
    <ServerFilter
      servers={filterServers}
      selected={scoped?.serverId ?? null}
      hrefFor={(id) => (id === null ? page : `${page}?server=${encodeURIComponent(id)}`)}
    />

    {#if hasNumbers}
      <StatsPanel {metrics} />
    {:else if scoped}
      <Card
        title={t.profile_noStatsHeading()}
        description={t.profile_noStatsOnServer({
          name: profile.mcUsername,
          server: scoped.serverName,
        })}
      >
        <span></span>
      </Card>
    {:else}
      <Card
        title={t.profile_noStatsHeading()}
        description={t.profile_noStatsBody({ name: profile.mcUsername })}
      >
        <span></span>
      </Card>
    {/if}
  </div>
</div>

<style>
  h1 {
    font-size: var(--text-xl);
  }

  .back {
    margin: 0;
    font-size: var(--text-sm);
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

  /* Pulled up under the bubble's tail, into the blank space above the
     character's head, so the tail points at the head rather than at a gap. */
  .under-bubble {
    margin-top: calc(-1 * var(--space-4));
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .editor textarea {
    width: 100%;
    padding: var(--space-2);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    text-align: center;
    resize: none;
  }

  .editor textarea:focus-visible {
    border-color: var(--accent);
    outline: none;
  }

  .editor textarea[aria-invalid='true'] {
    border-color: var(--danger);
  }

  /* One or two buttons sharing the width, so a label is never squeezed onto a
     second line however narrow the card gets. */
  .editor-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: var(--space-2);
  }

  .editor-buttons :global(button) {
    width: 100%;
    padding-inline: var(--space-2);
    white-space: nowrap;
  }

  .count {
    align-self: flex-end;
    color: var(--fg-muted);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .count.over {
    color: var(--danger);
    font-weight: 700;
  }

  .hint {
    margin: 0;
    color: var(--fg-muted);
    font-size: var(--text-xs);
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

  @media (max-width: 48rem) {
    .profile {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
