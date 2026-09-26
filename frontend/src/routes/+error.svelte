<script lang="ts">
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { errorMessage, translate } from '$lib/i18n';

  const t = $derived(translate(page.data.lang ?? 'en'));

  // 404 gets its own copy because it is the one people reach by accident.
  // Everything else shows the message for whatever code the backend threw.
  const heading = $derived(page.status === 404 ? t.notFound_heading() : t.error_generic());
  const body = $derived(
    page.status === 404 ? t.notFound_body() : errorMessage(t, page.error?.message ?? 'generic'),
  );
</script>

<svelte:head>
  <title>{heading}</title>
</svelte:head>

<div class="wrap">
  <p class="status">{page.status}</p>
  <h1>{heading}</h1>
  <p>{body}</p>
  <a href={resolve('/')}>{t.notFound_home()}</a>
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    max-width: 68rem;
    margin: 0 auto;
    padding: var(--space-7) var(--space-4);
  }

  .status {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    color: var(--fg-muted);
  }

  h1 {
    font-size: var(--text-xl);
  }
</style>
