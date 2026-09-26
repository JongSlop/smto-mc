<script lang="ts">
  import { ASSET_CONTENT_TYPES, ASSET_MAX_BYTES, SERVER_STATES } from '@smto/mc-contracts';

  import Alert from '$lib/components/Alert.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Field from '$lib/components/Field.svelte';
  import Form from '$lib/components/Form.svelte';
  import Select from '$lib/components/Select.svelte';
  import { resolve } from '$app/paths';
  import { errorMessage, translate } from '$lib/i18n';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const t = $derived(translate(data.lang));
  const server = $derived(data.server);
  const assets = $derived(data.assets);
  const error = $derived(form && 'error' in form ? form.error : null);
  const saved = $derived(form && 'saved' in form ? form.saved : false);
  const uploaded = $derived(form && 'uploaded' in form ? form.uploaded : null);
  const assetDeleted = $derived(form && 'assetDeleted' in form ? form.assetDeleted : false);

  /** Whole numbers of kB or MB. Nobody needs three decimals of an icon. */
  function formatSize(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} kB`;
  }

  const maxSize = formatSize(ASSET_MAX_BYTES);

  /**
   * Which URL was just copied, so the button can say so.
   *
   * The clipboard needs script, so the address also sits in a readonly input
   * that selects itself on focus: with JavaScript off the button is gone and
   * the text is still there to copy by hand.
   */
  let copied = $state<string | null>(null);
  const urlInputs: Record<string, HTMLInputElement> = {};

  async function copy(asset: { id: string; url: string }): Promise<void> {
    try {
      await navigator.clipboard.writeText(asset.url);
      copied = asset.id;
    } catch {
      // No clipboard at all on an insecure origin, and a refusal is possible
      // even on a secure one. Selecting the address leaves one keystroke to go
      // rather than a button that did nothing.
      copied = null;
      urlInputs[asset.id]?.select();
    }
  }

  function stateLabel(state: string): string {
    if (state === 'ONGOING') return t.servers_state_ONGOING();
    if (state === 'ARCHIVED') return t.servers_state_ARCHIVED();
    return t.servers_state_UPCOMING();
  }

  const stateOptions = $derived(
    SERVER_STATES.map((state) => ({ value: state, label: stateLabel(state) })),
  );

  // Pretty printed, because this is edited by hand and a single line of JSON is
  // not something anybody can work with.
  const extraJson = $derived(JSON.stringify(server.extra ?? {}, null, 2));
</script>

<svelte:head>
  <title>{server.name} · {t.admin_serversHeading()}</title>
</svelte:head>

<p><a href={resolve('/admin/servers')}>{t.common_back()}</a></p>

<h1>{server.name}</h1>

{#if error}
  <Alert variant="error">{errorMessage(t, error)}</Alert>
{/if}

{#if saved}
  <Alert variant="success">{t.admin_serverSaved()}</Alert>
{/if}

{#if uploaded}
  <Alert variant="success">{t.admin_assetUploaded({ name: uploaded })}</Alert>
{/if}

{#if assetDeleted}
  <Alert variant="success">{t.admin_assetDeleted()}</Alert>
{/if}

<Card>
  <Form action="?/save">
    {#snippet children(submitting: boolean)}
      <div class="grid">
        <Field
          name="id"
          label={t.admin_serverId()}
          value={server.id}
          hint={t.admin_serverIdHint()}
          readonly
          required={false}
        />
        <Field name="name" label={t.admin_serverName()} value={server.name} maxlength={120} />
        <Select
          name="state"
          label={t.admin_serverState()}
          options={stateOptions}
          value={server.state}
        />
        <Field
          name="sortOrder"
          label={t.admin_serverSortOrder()}
          type="number"
          value={String(server.sortOrder)}
          required={false}
        />
        <Field
          name="launchDate"
          label={t.admin_serverLaunchDate()}
          type="date"
          value={server.launchDate ?? ''}
          required={false}
        />
        <Field
          name="currentVersion"
          label={t.admin_serverVersion()}
          value={server.currentVersion ?? ''}
          required={false}
          maxlength={64}
        />
        <Field
          name="iconUrl"
          label={t.admin_serverIcon()}
          type="url"
          value={server.iconUrl ?? ''}
          required={false}
        />
        <Field
          name="description"
          label={t.admin_serverDescription()}
          value={server.description ?? ''}
          required={false}
          maxlength={2000}
        />
      </div>

      <label class="check">
        <input type="checkbox" name="isPublic" checked={server.isPublic} />
        {t.admin_serverPublic()}
      </label>

      <div class="field">
        <label for="extra">{t.admin_serverExtra()}</label>
        <textarea id="extra" name="extra" rows="12" spellcheck="false">{extraJson}</textarea>
        <p class="hint">{t.admin_serverExtraHint()}</p>
      </div>

      <div>
        <Button busy={submitting}>{t.admin_serverSave()}</Button>
      </div>
    {/snippet}
  </Form>
</Card>

<!--
  Images for this server, and the addresses they are served at.

  The addresses are the product here. Pack JSON, the launcher and this site all
  point at images by absolute URL, and up to now those URLs came from files
  copied onto the web server by hand. Uploading here produces one from the same
  deployment that serves the metadata, with a record of who put it there.
-->
<Card title={t.admin_assets()} description={t.admin_assetsHint({ size: maxSize })}>
  <Form action="?/uploadAsset" enctype="multipart/form-data">
    {#snippet children(submitting: boolean)}
      <div class="grid">
        <div class="field">
          <label for="file">{t.admin_assetFile()}</label>
          <input
            id="file"
            name="file"
            type="file"
            accept={ASSET_CONTENT_TYPES.join(',')}
            required
          />
        </div>
        <Field
          name="filename"
          label={t.admin_assetName()}
          hint={t.admin_assetNameHint()}
          required={false}
          maxlength={100}
        />
      </div>

      <div>
        <Button busy={submitting}>{t.admin_assetUpload()}</Button>
      </div>
    {/snippet}
  </Form>

  {#if assets.length === 0}
    <p class="hint">{t.admin_assetsEmpty()}</p>
  {:else}
    <ul class="assets">
      {#each assets as asset (asset.id)}
        <li>
          <img class="thumb pixelated" src={asset.url} alt="" width="48" height="48" />

          <div class="info">
            <span class="name">{asset.filename}</span>
            <span class="hint">{formatSize(asset.byteSize)} · {asset.contentType}</span>

            <div class="url">
              <input
                bind:this={urlInputs[asset.id]}
                readonly
                value={asset.url}
                aria-label={t.admin_assetUrl()}
                onfocus={(event) => event.currentTarget.select()}
              />
              <button type="button" onclick={() => copy(asset)}>
                {copied === asset.id ? t.admin_assetCopied() : t.admin_assetCopy()}
              </button>
            </div>
          </div>

          <Form action="?/deleteAsset">
            {#snippet children(submitting: boolean)}
              <input type="hidden" name="assetId" value={asset.id} />
              <Button variant="danger" busy={submitting}>{t.admin_assetDelete()}</Button>
            {/snippet}
          </Form>
        </li>
      {/each}
    </ul>
  {/if}
</Card>

<Card title={t.admin_serverDelete()} description={t.admin_serverDeleteWarning()}>
  <Form action="?/delete">
    {#snippet children(submitting: boolean)}
      <div>
        <Button variant="danger" busy={submitting}>{t.admin_serverDelete()}</Button>
      </div>
    {/snippet}
  </Form>
</Card>

<style>
  h1 {
    font-size: var(--text-xl);
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

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .field label {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  textarea {
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: inherit;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    resize: vertical;
  }

  textarea:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: var(--focus-ring);
  }

  .hint {
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }

  input[type='file'] {
    padding: var(--space-2);
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: inherit;
    font: inherit;
    font-size: var(--text-sm);
  }

  .assets {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .assets li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3);
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
  }

  /* A checkerboard behind the thumbnail, so a transparent icon is visible as
     one rather than as whatever the card is painted. */
  .thumb {
    flex: none;
    border-radius: var(--radius-sm);
    background-color: var(--bg-sunken);
    background-image:
      linear-gradient(45deg, var(--border) 25%, transparent 25%),
      linear-gradient(-45deg, var(--border) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--border) 75%),
      linear-gradient(-45deg, transparent 75%, var(--border) 75%);
    background-size: 12px 12px;
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0;
    object-fit: contain;
  }

  .info {
    display: flex;
    flex: 1 1 18rem;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .name {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .url {
    display: flex;
    gap: var(--space-2);
  }

  /* The address itself, always fully selectable: this is the thing that gets
     pasted into a pack JSON. */
  .url input {
    flex: 1;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    color: var(--fg-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .url button {
    flex: none;
    padding: var(--space-1) var(--space-3);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--fg);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .url button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
