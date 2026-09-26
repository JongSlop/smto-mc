<script lang="ts">
  import type { Snippet } from 'svelte';

  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';

  let { children }: { children: Snippet } = $props();

  const t = $derived(translate(page.data.lang ?? 'en'));

  const tabs = $derived([
    { href: resolve('/admin/servers'), label: t.admin_serversHeading() },
    { href: resolve('/admin/tokens'), label: t.admin_tokensHeading() },
    { href: resolve('/admin/audit'), label: t.admin_auditHeading() },
  ]);
</script>

<nav class="tabs" aria-label={t.admin_heading()}>
  {#each tabs as tab (tab.href)}
    <!-- Already resolved, in the array above; the rule cannot see through it. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href={tab.href} aria-current={page.url.pathname.startsWith(tab.href) ? 'page' : undefined}>
      {tab.label}
    </a>
  {/each}
</nav>

{@render children()}

<style>
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .tabs a {
    padding: var(--space-2) var(--space-4);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--fg-muted);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
  }

  .tabs a[aria-current='page'] {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--accent);
  }
</style>
