<script lang="ts">
  import { describeEntry, type ReportEntry } from '@smto/mc-schematics';
  import Download from '@lucide/svelte/icons/download';
  import Info from '@lucide/svelte/icons/info';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Upload from '@lucide/svelte/icons/upload';
  import Alert from '$lib/components/Alert.svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import { formatKiB } from '$lib/format';
  import { translate } from '$lib/i18n';
  import { Conversions, MAX_INPUT_BYTES, type Item } from '$lib/schematics/conversions.svelte';
  import { onDestroy, onMount } from 'svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));

  /**
   * Everything on this page happens in the browser. The files are read here,
   * converted by a worker in this tab, and handed back as a download; nothing
   * is sent anywhere, which is also why the page needs no account and no API.
   */
  const conversions = new Conversions();
  onDestroy(() => conversions.dispose());

  let dragging = $state(false);

  /**
   * False until this page has hydrated.
   *
   * The server renders the file input before the script that handles it has
   * loaded, and a file chosen in that gap fires a change event nobody is
   * listening for: the file is simply lost, with no sign that anything went
   * wrong. Keeping the input disabled until now closes the gap, and the same flag
   * is exposed on the drop zone so tests can wait for it rather than guess.
   */
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });

  function addFiles(list: FileList | null): void {
    if (list && list.length > 0) {
      void conversions.add(Array.from(list));
    }
  }

  function onPick(event: Event & { currentTarget: HTMLInputElement }): void {
    addFiles(event.currentTarget.files);
    // Cleared so choosing the same file again, after removing it, still fires.
    event.currentTarget.value = '';
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    dragging = false;
    addFiles(event.dataTransfer?.files ?? null);
  }

  function download(item: Item): void {
    if (!item.converted) {
      return;
    }

    const url = URL.createObjectURL(
      new Blob([item.converted.bytes], { type: 'application/octet-stream' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = item.outputName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * A report line in the reader's language. The converter hands back codes and
   * parameters, and the wording lives in the message files; a code this build
   * has no copy for falls back to the converter's own English rather than to
   * nothing.
   */
  function reportText(entry: ReportEntry): string {
    const message = t[`schematics_report_${entry.code}` as keyof typeof t];
    return typeof message === 'function'
      ? (message as (params?: Record<string, string | number>) => string)(entry.params)
      : describeEntry(entry);
  }

  /** Identifies a report line across conversions, so a re-run updates rows in place. */
  const reportKey = (entry: ReportEntry): string =>
    `${entry.code}:${JSON.stringify(entry.params ?? {})}`;

  function warningsText(count: number): string {
    return count === 0
      ? t.schematics_warningsNone()
      : count === 1
        ? t.schematics_warningsOne()
        : t.schematics_warningsMany({ count });
  }

  function failureText(item: Item): string {
    switch (item.failure?.stage) {
      case 'size':
        return t.schematics_errSize({ limit: MAX_INPUT_BYTES / (1024 * 1024) });
      case 'read':
        return t.schematics_errRead();
      default:
        return t.schematics_errConvert();
    }
  }
</script>

<svelte:head>
  <title>{t.schematics_heading()} · {t.app_name()}</title>
</svelte:head>

<header>
  <h1>{t.schematics_heading()}</h1>
  <p class="lede">{t.schematics_body()}</p>
</header>

<!--
  Nothing on this page works without a script: the files are read and converted
  in the browser. Said plainly, since a dead drop zone otherwise looks broken.
-->
<noscript>
  <Alert variant="warning">{t.schematics_needsJs()}</Alert>
</noscript>

<Alert variant="info">{t.schematics_note()}</Alert>

<!--
  The input covers the whole label and is invisible, so a click lands on the
  real control and a file dropped on the area is received by it natively. The
  drop handler takes the files itself and cancels the native handling, so there
  is one way in rather than two. Focus is drawn on the label, since the input
  has no visible edge of its own.
-->
<label
  class="drop"
  class:over={dragging}
  data-ready={ready}
  ondragenter={() => (dragging = true)}
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  <input type="file" accept=".nbt" multiple disabled={!ready} onchange={onPick} />
  <Upload size={32} aria-hidden="true" />
  <strong>{t.schematics_dropHeading()}</strong>
  <span>{t.schematics_dropOr()}</span>
</label>

<Card title={t.schematics_optionsHeading()} description={t.schematics_optionsHint()}>
  <div class="options">
    <Checkbox
      bind:checked={conversions.options.keepCreate}
      onchange={() => conversions.optionsChanged()}
      label={t.schematics_opt_keepCreate()}
    />
    <Checkbox
      bind:checked={conversions.options.keepContainers}
      onchange={() => conversions.optionsChanged()}
      label={t.schematics_opt_keepContainers()}
    />
    <Checkbox
      bind:checked={conversions.options.keepSigns}
      onchange={() => conversions.optionsChanged()}
      label={t.schematics_opt_keepSigns()}
      hint={t.schematics_opt_keepSignsHint()}
    />
    <Checkbox
      bind:checked={conversions.options.convertMods}
      onchange={() => conversions.optionsChanged()}
      label={t.schematics_opt_convertMods()}
      hint={t.schematics_opt_convertModsHint()}
    />
    <Checkbox
      bind:checked={conversions.options.keepEntities}
      onchange={() => conversions.optionsChanged()}
      label={t.schematics_opt_keepEntities()}
    />
    <Checkbox
      bind:checked={conversions.options.dropKinetic}
      onchange={() => conversions.optionsChanged()}
      label={t.schematics_opt_dropKinetic()}
      hint={t.schematics_opt_dropKineticHint()}
    />
    <Checkbox
      bind:checked={conversions.options.unknownAir}
      onchange={() => conversions.optionsChanged()}
      label={t.schematics_opt_unknownAir()}
      hint={t.schematics_opt_unknownAirHint()}
    />
  </div>
</Card>

{#if conversions.items.length > 0}
  <section class="results" aria-labelledby="results-heading">
    <div class="results-head">
      <h2 id="results-heading">{t.schematics_resultsHeading()}</h2>
      <Button type="button" variant="secondary" onclick={() => conversions.clear()}>
        {t.schematics_removeAll()}
      </Button>
    </div>

    {#each conversions.items as item (item.key)}
      <Card>
        <div class="file">
          <div class="file-name">
            <h3>{item.name}</h3>
            {#if item.status === 'working'}
              <p class="meta working" role="status">
                <LoaderCircle size={16} aria-hidden="true" />
                {t.schematics_working()}
              </p>
            {:else if item.converted}
              <p class="meta">
                {t.schematics_size({
                  from: formatKiB(item.converted.inputSize, data.lang),
                  to: formatKiB(item.converted.bytes.byteLength, data.lang),
                })}
                ·
                <span class:has-warnings={item.warnings > 0}>{warningsText(item.warnings)}</span>
              </p>
            {/if}
          </div>

          <div class="file-actions">
            <!--
              Only once there is a file to hand over, and busy while a newer
              conversion is on its way: what is on screen is then out of date,
              and a download of it would not match the options now ticked.
            -->
            {#if item.converted}
              <Button type="button" busy={item.status === 'working'} onclick={() => download(item)}>
                <Download size={18} aria-hidden="true" />
                {t.schematics_download()}
              </Button>
            {/if}
            <Button type="button" variant="secondary" onclick={() => conversions.remove(item)}>
              {t.schematics_remove()}
            </Button>
          </div>
        </div>

        {#if item.status === 'failed' && item.failure}
          <Alert variant="error">
            <p>{failureText(item)}</p>
            {#if item.failure.stage !== 'size'}
              <p class="detail"><code>{item.failure.detail}</code></p>
            {/if}
          </Alert>
        {/if}

        {#if item.converted}
          <h4>{t.schematics_reportHeading()}</h4>

          {#snippet row(entry: ReportEntry)}
            <li class={entry.level}>
              {#if entry.level === 'warn'}
                <TriangleAlert size={16} aria-hidden="true" />
                <span class="visually-hidden">{t.schematics_levelWarn()}:</span>
              {:else}
                <Info size={16} aria-hidden="true" />
                <span class="visually-hidden">{t.schematics_levelInfo()}:</span>
              {/if}
              <span class="count">{entry.count > 1 ? `${entry.count}×` : ''}</span>
              <span class="text">{reportText(entry)}</span>
            </li>
          {/snippet}

          <!--
            Warnings are the reason to read a report, so they are always on show.
            The routine notes, which on a real schematic run to dozens of lines,
            fold away behind them. With nothing to warn about there is nothing to
            hide behind, so the notes open by themselves.
          -->
          {@const warnings = item.converted.entries.filter((entry) => entry.level === 'warn')}
          {@const notes = item.converted.entries.filter((entry) => entry.level !== 'warn')}

          {#if warnings.length > 0}
            <ul class="report" class:stale={item.status === 'working'}>
              {#each warnings as entry (reportKey(entry))}
                {@render row(entry)}
              {/each}
            </ul>
          {/if}

          {#if notes.length > 0}
            <details class="notes" open={warnings.length === 0}>
              <summary>{t.schematics_notesSummary({ count: notes.length })}</summary>
              <ul class="report" class:stale={item.status === 'working'}>
                {#each notes as entry (reportKey(entry))}
                  {@render row(entry)}
                {/each}
              </ul>
            </details>
          {/if}

          <details ontoggle={(event) => event.currentTarget.open && conversions.loadPreview(item)}>
            <summary>{t.schematics_previewSummary()}</summary>
            {#if item.preview.status === 'loading'}
              <p class="meta">{t.schematics_previewLoading()}</p>
            {:else if item.preview.status === 'failed'}
              <p class="meta">{t.schematics_previewFailed()}</p>
            {:else if item.preview.status === 'ready'}
              <pre class="dump">{item.preview.text}</pre>
              {#if item.preview.truncated}
                <p class="meta">{t.schematics_previewTruncated()}</p>
              {/if}
            {/if}
          </details>
        {/if}
      </Card>
    {/each}
  </section>
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

  /* One big target. The input is stretched over all of it and made invisible,
     so there is nothing small to aim at and no second control to tab through. */
  .drop {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4);
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--bg-elevated);
    color: var(--fg-muted);
    text-align: center;
    transition:
      background 100ms ease,
      border-color 100ms ease;
  }

  .drop:hover,
  .drop.over {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .drop:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  .drop strong {
    color: var(--fg);
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: 400;
  }

  .drop input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
    gap: var(--space-1) var(--space-4);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .results-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--text-lg);
  }

  h3 {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  h4 {
    color: var(--fg-muted);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .file {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .file-name {
    min-width: 0;
  }

  .file-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .meta {
    margin: var(--space-1) 0 0;
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  .working {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .working :global(svg) {
    animation: spin 900ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .has-warnings {
    color: var(--warning);
    font-weight: 700;
  }

  .detail {
    margin: var(--space-2) 0 0;
    overflow-wrap: anywhere;
  }

  /* Warnings first, which the converter already does; the icon and a hidden
     label carry the level so it is never colour alone. */
  /* One grid for the whole list and a subgrid per row, so the count column is
     as wide as the biggest count in it and the text lines up down the page
     however many digits a count has. */
  .report {
    display: grid;
    grid-template-columns: auto auto 1fr;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The notes' own summary sits under the warnings, so it needs some air. */
  .notes {
    margin-top: var(--space-1);
  }

  .report.stale {
    opacity: 0.5;
  }

  .report li {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: baseline;
    column-gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);
  }

  .report li:last-child {
    border-bottom: 0;
  }

  .report li.warn {
    background: var(--warning-subtle);
    color: var(--warning);
  }

  .report li :global(svg) {
    align-self: center;
  }

  .count {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .text {
    overflow-wrap: anywhere;
  }

  summary {
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  summary:hover {
    background: var(--bg-sunken);
  }

  summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .dump {
    max-height: 30rem;
    margin: var(--space-2) 0 0;
    padding: var(--space-3);
    overflow: auto;
    border: 2px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-sunken);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: 1.5;
    white-space: pre;
  }
</style>
