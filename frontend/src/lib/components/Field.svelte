<script lang="ts">
  interface Props {
    name: string;
    label: string;
    type?: 'text' | 'url' | 'date' | 'number';
    value?: string;
    error?: string;
    hint?: string;
    placeholder?: string;
    required?: boolean;
    readonly?: boolean;
    maxlength?: number;
  }

  let {
    name,
    label,
    type = 'text',
    value = '',
    error,
    hint,
    placeholder,
    required = true,
    readonly = false,
    maxlength,
  }: Props = $props();

  /**
   * What is in the box, as opposed to what the server last sent. Writable
   * $derived rather than $state, so typing overrides it while a new prop still
   * wins: that is what repopulates a rejected form with what was typed.
   */
  let current = $derived(value);

  const describedBy = $derived(
    [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(' ') ||
      undefined,
  );
</script>

<div class="field">
  <label for={name}>{label}</label>

  <input
    id={name}
    {name}
    {type}
    bind:value={current}
    {placeholder}
    {required}
    {readonly}
    {maxlength}
    class:invalid={Boolean(error)}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
  />

  {#if hint}
    <p class="hint" id="{name}-hint">{hint}</p>
  {/if}

  {#if error}
    <p class="error" id="{name}-error">{error}</p>
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

  input {
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: inherit;
    font: inherit;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: var(--focus-ring);
  }

  input.invalid {
    border-color: var(--danger);
  }

  input:read-only {
    color: var(--fg-muted);
  }

  .hint,
  .error {
    font-size: var(--text-xs);
  }

  .hint {
    color: var(--fg-muted);
  }

  .error {
    color: var(--danger);
  }
</style>
