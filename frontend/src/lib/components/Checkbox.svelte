<script lang="ts">
  interface Props {
    label: string;
    hint?: string;
    checked?: boolean;
    onchange?: () => void;
  }

  let { label, hint, checked = $bindable(false), onchange }: Props = $props();
</script>

<!--
  A native checkbox inside its label, so the whole row is the hit target, the
  keyboard and screen readers get the real control, and there is nothing of ours
  to keep in step with it. The box is drawn over the native one rather than
  replacing it.
-->
<label class="checkbox">
  <input type="checkbox" bind:checked {onchange} />
  <span class="text">
    <span class="label">{label}</span>
    {#if hint}
      <span class="hint">{hint}</span>
    {/if}
  </span>
</label>

<style>
  .checkbox {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .checkbox:hover {
    background: var(--bg-sunken);
  }

  /* The square is a block like everything else here: two pixel border, hard
     corners, and a filled green when it is on. */
  input {
    appearance: none;
    flex: none;
    width: 1.35rem;
    height: 1.35rem;
    margin: 0.1rem 0 0;
    border: 2px solid var(--fg);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    cursor: pointer;
    display: grid;
    place-content: center;
  }

  input::after {
    content: '';
    width: 0.7rem;
    height: 0.4rem;
    border-left: 3px solid var(--accent-contrast);
    border-bottom: 3px solid var(--accent-contrast);
    transform: translateY(-1px) rotate(-45deg) scale(0);
  }

  input:checked {
    background: var(--accent);
  }

  input:checked::after {
    transform: translateY(-1px) rotate(-45deg) scale(1);
  }

  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .hint {
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }
</style>
