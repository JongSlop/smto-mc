<script lang="ts">
  import { SERVER_STATES } from '@smto/mc-contracts';

  import Alert from '$lib/components/Alert.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Field from '$lib/components/Field.svelte';
  import Form from '$lib/components/Form.svelte';
  import Select from '$lib/components/Select.svelte';
  import ServerIcon from '$lib/components/ServerIcon.svelte';
  import { resolve } from '$app/paths';
  import { errorMessage, translate } from '$lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const t = $derived(translate(data.lang));
  const error = $derived(form && 'error' in form ? form.error : null);
  const created = $derived(form && 'created' in form ? form.created : false);

  function stateLabel(state: string): string {
    if (state === 'ONGOING') return t.servers_state_ONGOING();
    if (state === 'ARCHIVED') return t.servers_state_ARCHIVED();
    return t.servers_state_UPCOMING();
  }

  const stateOptions = $derived(
    SERVER_STATES.map((state) => ({ value: state, label: stateLabel(state) })),
  );
</script>

<svelte:head>
  <title>{t.admin_serversHeading()} · {t.app_name()}</title>
</svelte:head>

<h1>{t.admin_serversHeading()}</h1>
<p class="intro">{t.admin_serversIntro()}</p>

{#if error}
  <Alert variant="error">{errorMessage(t, error)}</Alert>
{/if}

{#if created}
  <Alert variant="success">{t.admin_serverCreated()}</Alert>
{/if}

<Card>
  <ul class="list">
    {#each data.servers as server (server.id)}
      <li>
        <ServerIcon iconUrl={server.iconUrl} name={server.name} size={40} />
        <div class="body">
          <!--
            The route id, group and all, rather than the pathname the other
            links use. resolve() only takes params on the route-id form, and a
            parameterised path cannot be written out statically.
          -->
          <a href={resolve('/(app)/admin/servers/[id]', { id: server.id })}>
            <strong>{server.name}</strong>
          </a>
          <p class="meta">
            <span class="mono">{server.id}</span>
            <span>{stateLabel(server.state)}</span>
            <span>#{server.sortOrder}</span>
          </p>
        </div>
      </li>
    {/each}
  </ul>
</Card>

<Card title={t.admin_serverCreate()} description={t.admin_assetsAfterCreate()}>
  <Form action="?/create">
    {#snippet children(submitting: boolean)}
      <div class="grid">
        <Field name="id" label={t.admin_serverId()} hint={t.admin_serverIdHint()} maxlength={32} />
        <Field name="name" label={t.admin_serverName()} maxlength={120} />
        <Select
          name="state"
          label={t.admin_serverState()}
          options={stateOptions}
          value="UPCOMING"
        />
        <Field
          name="sortOrder"
          label={t.admin_serverSortOrder()}
          type="number"
          value="0"
          required={false}
        />
        <Field name="launchDate" label={t.admin_serverLaunchDate()} type="date" required={false} />
        <Field
          name="currentVersion"
          label={t.admin_serverVersion()}
          required={false}
          maxlength={64}
        />
        <Field name="iconUrl" label={t.admin_serverIcon()} type="url" required={false} />
        <Field
          name="description"
          label={t.admin_serverDescription()}
          required={false}
          maxlength={2000}
        />
      </div>

      <label class="check">
        <input type="checkbox" name="isPublic" checked />
        {t.admin_serverPublic()}
      </label>

      <div>
        <Button busy={submitting}>{t.admin_serverCreate()}</Button>
      </div>
    {/snippet}
  </Form>
</Card>

<style>
  h1 {
    font-size: var(--text-xl);
  }

  .intro {
    color: var(--fg-muted);
    max-width: 60ch;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    gap: var(--space-4);
    align-items: center;
  }

  .body {
    min-width: 0;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }

  .mono {
    font-family: var(--font-mono);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--space-4);
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }
</style>
