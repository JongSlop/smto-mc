<script lang="ts">
  interface Props {
    name: string;
    label: string;
    value?: string;
    options: { value: string; label: string }[];
    hint?: string;
  }

  let { name, label, value = '', options, hint }: Props = $props();

  let current = $derived(value);
</script>

<div class="field">
  <label for={name}>{label}</label>

  <select
    id={name}
    {name}
    bind:value={current}
    aria-describedby={hint ? `${name}-hint` : undefined}
  >
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>

  {#if hint}
    <p class="hint" id="{name}-hint">{hint}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  label {
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

  select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: var(--focus-ring);
  }

  .hint {
    color: var(--fg-muted);
    font-size: var(--text-xs);
  }
</style>
