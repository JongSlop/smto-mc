<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    type?: 'submit' | 'button';
    variant?: 'primary' | 'secondary' | 'danger';
    /** Disables the button and shows it is working, to stop a double submit. */
    busy?: boolean;
    wide?: boolean;
    value?: string;
    name?: string;
    formaction?: string;
    onclick?: () => void;
    children: Snippet;
  }

  let {
    type = 'submit',
    variant = 'primary',
    busy = false,
    wide = false,
    value,
    name,
    formaction,
    onclick,
    children,
  }: Props = $props();
</script>

<button
  {type}
  {name}
  {value}
  {formaction}
  {onclick}
  class="{variant} {wide ? 'wide' : ''}"
  disabled={busy}
>
  {#if busy}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  {@render children()}
</button>

<style>
  /*
   * The press is the whole idea: the button sits on a hard offset shadow and
   * moves into it when pushed, the way a block does. Transform rather than
   * margin so nothing around it reflows.
   */
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border: 2px solid var(--fg);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    font: inherit;
    font-weight: 700;
    line-height: 1.2;
    cursor: pointer;
    transition:
      background 100ms ease,
      transform 60ms ease,
      box-shadow 60ms ease;
  }

  button:active:not(:disabled) {
    transform: translate(2px, 2px);
    box-shadow: none;
  }

  button:disabled {
    opacity: 0.6;
    cursor: progress;
    box-shadow: none;
    transform: translate(2px, 2px);
  }

  .wide {
    width: 100%;
  }

  .primary {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .primary:hover:not(:disabled) {
    background: var(--accent-strong);
  }

  .secondary {
    background: var(--bg-elevated);
    color: var(--fg);
  }

  .secondary:hover:not(:disabled) {
    background: var(--bg-sunken);
  }

  .danger {
    background: var(--bg-elevated);
    border-color: var(--danger);
    color: var(--danger);
  }

  .danger:hover:not(:disabled) {
    background: var(--danger-subtle);
  }

  .spinner {
    width: 0.9em;
    height: 0.9em;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: var(--radius-full);
    animation: spin 700ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
