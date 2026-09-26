<script lang="ts">
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Music from '@lucide/svelte/icons/music';
  import Upload from '@lucide/svelte/icons/upload';
  import Video from '@lucide/svelte/icons/video';
  import Alert from '$lib/components/Alert.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Form from '$lib/components/Form.svelte';
  import { resolve } from '$app/paths';
  import { errorMessage, translate } from '$lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const t = $derived(translate(data.lang));
</script>

<svelte:head>
  <title>{t.services_uploader()} · {t.app_name()}</title>
</svelte:head>

<h1><Upload size={28} aria-hidden="true" /> {t.services_uploader()}</h1>

{#if form?.error}
  <Alert variant="error">{errorMessage(t, form.error)}</Alert>
{/if}

<!--
  The same two entries as the header menu, for anybody who landed here directly
  or came back after a link expired. Nothing happens until one is pressed: the
  page itself mints nothing.
-->
{#if data.link}
  <Card title={t.services_uploaderHeading()} description={t.services_uploaderBody()}>
    <!--
      One form, two submit buttons. The button that was pressed is the one
      whose name and value are sent, which is how the intent reaches the
      action without a hidden field per option.
    -->
    <Form>
      {#snippet children(submitting: boolean)}
        <div class="choices">
          <!-- The arrow out of a box, same as in the header menu: pressing
               either of these leaves for the uploader. -->
          <Button busy={submitting} name="intent" value="audio">
            <Music size={18} aria-hidden="true" />
            {t.services_uploaderAudio()}
            <ExternalLink size={14} aria-hidden="true" />
            <span class="visually-hidden">{t.services_external()}</span>
          </Button>
          <Button busy={submitting} name="intent" value="video">
            <Video size={18} aria-hidden="true" />
            {t.services_uploaderVideo()}
            <ExternalLink size={14} aria-hidden="true" />
            <span class="visually-hidden">{t.services_external()}</span>
          </Button>
        </div>
      {/snippet}
    </Form>

    <p class="muted">{t.services_uploaderAs({ username: data.link.mcUsername })}</p>
  </Card>
{:else}
  <Card title={t.dashboard_notLinkedHeading()} description={t.services_uploaderNeedsLink()}>
    <div>
      <a href={resolve('/settings')}><Button>{t.dashboard_linkNow()}</Button></a>
    </div>
  </Card>
{/if}

<style>
  h1 {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-xl);
  }

  /* Side by side where there is room, stacked on a phone. */
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .muted {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }
</style>
