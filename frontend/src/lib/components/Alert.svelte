<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'error' | 'success' | 'info' | 'warning';
    children: Snippet;
  }

  let { variant = 'info', children }: Props = $props();
</script>

<!--
  Errors are announced assertively because they follow a submission the user is
  waiting on. Everything else is polite, so it does not cut into whatever a
  screen reader is already saying.
-->
<div class="alert {variant}" role={variant === 'error' ? 'alert' : 'status'}>
  {@render children()}
</div>

<style>
  .alert {
    padding: var(--space-3) var(--space-4);
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  .error {
    background: var(--danger-subtle);
    border-color: var(--danger);
    color: var(--danger);
  }

  .success {
    background: var(--success-subtle);
    border-color: var(--success);
    color: var(--success);
  }

  .warning {
    background: var(--warning-subtle);
    border-color: var(--warning);
    color: var(--warning);
  }

  .info {
    background: var(--bg-sunken);
    border-color: var(--border);
    color: var(--fg-muted);
  }
</style>
