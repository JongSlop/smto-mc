<script lang="ts">
  import { API_TOKEN_SCOPES, type ApiTokenScope } from '@smto/mc-contracts';

  import Alert from '$lib/components/Alert.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Field from '$lib/components/Field.svelte';
  import Form from '$lib/components/Form.svelte';
  import { formatDateTime } from '$lib/format';
  import { errorMessage, translate } from '$lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const t = $derived(translate(data.lang));
  const error = $derived(form && 'error' in form ? form.error : null);
  const created = $derived(form && 'created' in form ? form.created : null);
  const revoked = $derived(form && 'revoked' in form ? form.revoked : false);

  function scopeLabel(scope: ApiTokenScope): string {
    if (scope === 'stats:write') return t.admin_scope_statsWrite();
    if (scope === 'link:redeem') return t.admin_scope_linkRedeem();
    return t.admin_scope_linkRead();
  }
</script>

<svelte:head>
  <title>{t.admin_tokensHeading()} · {t.app_name()}</title>
</svelte:head>

<h1>{t.admin_tokensHeading()}</h1>
<p class="intro">{t.admin_tokensIntro()}</p>

{#if error}
  <Alert variant="error">{errorMessage(t, error)}</Alert>
{/if}

{#if revoked}
  <Alert variant="success">{t.admin_tokenRevokedNotice()}</Alert>
{/if}

{#if created}
  <Card title={t.admin_tokenSecretHeading()} description={t.admin_tokenSecretBody()}>
    <code class="secret">{created.token}</code>
  </Card>
{/if}

<Card>
  {#if data.tokens.length === 0}
    <p class="muted">{t.common_none()}</p>
  {:else}
    <ul class="list">
      {#each data.tokens as token (token.id)}
        <li class:revoked={token.revokedAt !== null}>
          <div class="body">
            <strong>{token.name}</strong>
            <p class="meta">
              <span>{token.revokedAt ? t.admin_tokenRevoked() : t.admin_tokenActive()}</span>
              <span>{token.serverId ?? t.admin_tokenServerAny()}</span>
              <span>
                {token.lastUsedAt
                  ? t.admin_tokenLastUsed({ when: formatDateTime(token.lastUsedAt, data.lang) })
                  : t.admin_tokenNeverUsed()}
              </span>
            </p>
            <p class="scopes">
              {#each token.scopes as scope (scope)}
                <span class="scope">{scopeLabel(scope)}</span>
              {/each}
            </p>
          </div>

          {#if !token.revokedAt}
            <Form action="?/revoke">
              {#snippet children(submitting: boolean)}
                <input type="hidden" name="id" value={token.id} />
                <Button variant="danger" busy={submitting}>{t.admin_tokenRevoke()}</Button>
              {/snippet}
            </Form>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Card>

<Card title={t.admin_tokenCreate()}>
  <Form action="?/create">
    {#snippet children(submitting: boolean)}
      <Field
        name="name"
        label={t.admin_tokenName()}
        hint={t.admin_tokenNameHint()}
        maxlength={120}
      />

      <fieldset>
        <legend>{t.admin_tokenScopes()}</legend>
        {#each API_TOKEN_SCOPES as scope (scope)}
          <label>
            <input type="checkbox" name="scopes" value={scope} />
            {scopeLabel(scope)}
            <code>{scope}</code>
          </label>
        {/each}
      </fieldset>

      <div class="field">
        <label for="serverId">{t.admin_tokenServer()}</label>
        <select id="serverId" name="serverId">
          <option value="">{t.admin_tokenServerAny()}</option>
          {#each data.servers as server (server.id)}
            <option value={server.id}>{server.name} ({server.id})</option>
          {/each}
        </select>
        <p class="hint">{t.admin_tokenServerHint()}</p>
      </div>

      <div>
        <Button busy={submitting}>{t.admin_tokenCreate()}</Button>
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

  .secret {
    display: block;
    padding: var(--space-4);
    border: 2px dashed var(--accent);
    border-radius: var(--radius-md);
    background: var(--bg-sunken);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    word-break: break-all;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
  }

  .list li.revoked {
    opacity: 0.55;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }

  .scopes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .scope {
    padding: 0 var(--space-2);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-4);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
  }

  legend {
    padding: 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  fieldset label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
  }

  fieldset code {
    color: var(--fg-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .field label {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  select {
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: inherit;
    font: inherit;
  }

  .hint,
  .muted {
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }
</style>
