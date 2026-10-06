<script lang="ts">
  import { NICKNAME_MAX } from '@smto/mc-contracts';

  import Alert from '$lib/components/Alert.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Field from '$lib/components/Field.svelte';
  import Form from '$lib/components/Form.svelte';
  import LinkCode from '$lib/components/LinkCode.svelte';
  import StoredSettings from '$lib/components/StoredSettings.svelte';
  import { invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import { formatDate, minutesUntil } from '$lib/format';
  import { errorMessage, translate } from '$lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const t = $derived(translate(data.lang));
  const error = $derived((form && 'error' in form ? form.error : null) ?? data.error);
  const unlinked = $derived(form && 'unlinked' in form ? form.unlinked : false);
  const nicknameSaved = $derived(form && 'nicknameSaved' in form ? form.nicknameSaved : false);
  const nicknameRemoved = $derived(
    form && 'nicknameRemoved' in form ? form.nicknameRemoved : false,
  );

  // After a rejected save the box gets back what was typed; otherwise it shows
  // what is stored, which is also what a successful save reloads into it.
  const nicknameValue = $derived(
    (form && 'typedNickname' in form ? form.typedNickname : null) ?? data.nickname,
  );

  // A code minted by this page's action wins over anything else, because it is
  // what the person just asked for.
  const code = $derived(form && 'code' in form ? form.code : null);

  /** Slow enough to be cheap, fast enough to feel immediate after /link. */
  const POLL_MS = 2500;

  let redeemed = $state<string | null>(null);

  /**
   * Watches for the code being redeemed in game.
   *
   * The player types the command in another window entirely, so nothing in the
   * browser knows it happened. The plugin already tells them in chat; this is
   * so the page they left open agrees with it instead of sitting on a code that
   * has already been spent.
   *
   * Polling rather than a socket: one small request every few seconds for at
   * most the ten minutes a code lives, against a stack where the alternative
   * means keeping a connection open through nginx for every idle visitor. The
   * effect reruns whenever `code` changes and Svelte tears down the previous
   * interval, so a second code never leaves a second timer behind.
   */
  $effect(() => {
    if (!code || data.link) {
      return;
    }

    let stopped = false;

    const timer = setInterval(() => {
      // Nothing is going to happen while the tab is in the background, and a
      // laptop that was asleep for an hour should not wake up and fire a burst
      // of catch-up requests.
      if (document.hidden) {
        return;
      }

      void (async () => {
        try {
          const response = await fetch(`${base}/link/status`, {
            headers: { accept: 'application/json' },
          });

          if (!response.ok || stopped) {
            return;
          }

          const status = (await response.json()) as { linked: boolean; username: string | null };

          if (status.linked && !stopped) {
            redeemed = status.username;
            // Pulls the page's own load function again, so the linked state
            // renders from the server rather than being faked here.
            await invalidateAll();
          }
        } catch {
          // Offline, or the server restarted under a dev run. The next tick
          // tries again; a failed poll is not worth showing anybody.
        }
      })();
    }, POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  });
</script>

<svelte:head>
  <title>{t.settings_heading()} · {t.app_name()}</title>
</svelte:head>

<h1>{t.settings_heading()}</h1>

{#if error}
  <Alert variant="error">{errorMessage(t, error)}</Alert>
{/if}

{#if unlinked}
  <Alert variant="success">{t.settings_unlinked()}</Alert>
{/if}

<!--
  Two ways to arrive here having just linked: the Microsoft callback redirects
  back with ?linked=<name>, and the in-game poll above sets `redeemed` without
  any navigation at all. Both deserve the same confirmation.
-->
{#if data.linked || redeemed}
  <Alert variant="success">
    {t.link_success({ username: data.linked ?? redeemed ?? '' })}
  </Alert>
{/if}

{#if data.link}
  <Card title={t.settings_linkedProfile()}>
    <dl>
      <dt>{t.nav_link()}</dt>
      <dd>{data.link.mcUsername}</dd>
      <dt>UUID</dt>
      <dd class="mono">{data.link.mcUuid}</dd>
      <dt>{t.dashboard_linkedSince()}</dt>
      <dd>
        {formatDate(data.link.verifiedAt, data.lang)}
        <span class="muted">
          {data.link.verifiedVia === 'MSA'
            ? t.settings_linkedVia_MSA()
            : t.settings_linkedVia_INGAME_CODE()}
        </span>
      </dd>
    </dl>

    <Alert variant="info">{t.settings_unlinkWarning()}</Alert>

    <Form action="?/unlink">
      {#snippet children(submitting: boolean)}
        <div>
          <Button variant="danger" busy={submitting}>{t.settings_unlink()}</Button>
        </div>
      {/snippet}
    </Form>
  </Card>

  <Card title={t.settings_nicknameHeading()} description={t.settings_nicknameBody()}>
    {#if nicknameSaved}
      <Alert variant="success">{t.settings_nicknameSaved()}</Alert>
    {:else if nicknameRemoved}
      <Alert variant="success">{t.settings_nicknameRemoved()}</Alert>
    {/if}

    <Form action="?/nickname">
      {#snippet children(submitting: boolean)}
        <Field
          name="nickname"
          label={t.settings_nicknameLabel()}
          value={nicknameValue}
          hint={t.settings_nicknameHint({ max: NICKNAME_MAX })}
          maxlength={NICKNAME_MAX}
          required={false}
        />
        <div>
          <Button busy={submitting}>{t.settings_nicknameSave()}</Button>
        </div>
      {/snippet}
    </Form>
  </Card>

  <!-- Last on the page, and closed: it is for the curious, not what the page is for. -->
  {#if data.settings}
    <StoredSettings settings={data.settings} />
  {/if}
{:else}
  <p class="intro">{t.link_intro()}</p>

  <div class="paths">
    <Card title={t.link_msaHeading()} description={t.link_msaBody()}>
      {#if data.msaEnabled}
        <Form action="?/msa">
          {#snippet children(submitting: boolean)}
            <Button busy={submitting}>{t.link_msaButton()}</Button>
          {/snippet}
        </Form>
      {:else}
        <Alert variant="warning">{t.link_msaDisabled()}</Alert>
      {/if}
    </Card>

    <Card title={t.link_codeHeading()} description={t.link_codeBody()}>
      {#if code}
        <p>{t.link_codeInstructions()}</p>
        <LinkCode
          code={code.code}
          copyLabel={t.link_codeCopy()}
          copiedLabel={t.link_codeCopied()}
        />
        <p class="muted">{t.link_codeExpires({ minutes: minutesUntil(code.expiresAt) })}</p>
      {:else}
        <Form action="?/code">
          {#snippet children(submitting: boolean)}
            <Button busy={submitting}>{t.link_codeButton()}</Button>
          {/snippet}
        </Form>
      {/if}
    </Card>
  </div>
{/if}

<style>
  h1 {
    font-size: var(--text-xl);
  }

  dl {
    display: grid;
    grid-template-columns: minmax(8rem, auto) minmax(0, 1fr);
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }

  dt {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  dd {
    margin: 0;
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    /* Breaks between characters only when it has to, so the dashes stay put
       and the thing is still selectable as one string. */
    overflow-wrap: anywhere;
  }

  .muted {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  .intro {
    max-width: 60ch;
    color: var(--fg-muted);
  }

  .paths {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: var(--space-5);
    align-items: start;
  }
</style>
