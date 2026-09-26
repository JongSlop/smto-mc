<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    description?: string;
    children: Snippet;
    footer?: Snippet;
  }

  let { title, description, children, footer }: Props = $props();
</script>

<section class="card">
  {#if title}
    <header>
      <h2>{title}</h2>
      {#if description}
        <p>{description}</p>
      {/if}
    </header>
  {/if}

  {@render children()}

  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-6);
    background: var(--bg-elevated);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
  }

  header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  h2 {
    font-size: var(--text-xl);
  }

  header p {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  footer {
    padding-top: var(--space-4);
    border-top: 2px solid var(--border);
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  @media (max-width: 30rem) {
    .card {
      padding: var(--space-5) var(--space-4);
    }
  }
</style>
