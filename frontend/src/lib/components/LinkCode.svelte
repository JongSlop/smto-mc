<script lang="ts">
  interface Props {
    code: string;
    copiedLabel: string;
    copyLabel: string;
  }

  let { code, copiedLabel, copyLabel }: Props = $props();

  let copied = $state(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`/link ${code}`);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Clipboard access denied, or an insecure origin. The code is on screen
      // in a large font precisely so it can be typed instead.
    }
  }
</script>

<div class="wrap">
  <code>/link {code}</code>
  <button type="button" onclick={copy}>{copied ? copiedLabel : copyLabel}</button>
</div>

<style>
  .wrap {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--bg-sunken);
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-md);
  }

  code {
    flex: 1;
    min-width: 12ch;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    /* The alphabet already excludes the ambiguous glyphs; the spacing is so it
       can be read off a screen at arm's length while typing it into chat. */
    letter-spacing: 0.08em;
    word-break: break-all;
  }

  button {
    padding: var(--space-2) var(--space-4);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
