<script lang="ts">
  import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import Trophy from '@lucide/svelte/icons/trophy';
  import Alert from '$lib/components/Alert.svelte';
  import Button from '$lib/components/Button.svelte';
  import Logo from '$lib/components/Logo.svelte';
  import { resolve } from '$app/paths';
  import { errorMessage, translate } from '$lib/i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const t = $derived(translate(data.lang));

  /**
   * What somebody gets for signing in, which is the only question this page
   * has to answer. Three, because that is what there is: the numbers, the
   * boards made from them, and the way through to everything else.
   */
  const features = $derived([
    { icon: ChartNoAxesColumn, heading: t.landing_statsHeading(), body: t.landing_statsBody() },
    { icon: Trophy, heading: t.landing_boardsHeading(), body: t.landing_boardsBody() },
    { icon: LayoutGrid, heading: t.landing_servicesHeading(), body: t.landing_servicesBody() },
  ]);
</script>

<svelte:head>
  <title>{t.app_name()}</title>
  <meta name="description" content={t.app_tagline()} />
</svelte:head>

{#if data.error}
  <Alert variant="error">{errorMessage(t, data.error)}</Alert>
{/if}

<section class="hero">
  <Logo size={72} label={t.app_name()} />
  <h1>{t.landing_heading()}</h1>
  <p>{t.landing_body()}</p>

  <form method="POST" action={resolve('/auth/login')}>
    <input type="hidden" name="returnTo" value="/dashboard" />
    <Button>{t.landing_signIn()}</Button>
  </form>

  <p class="muted">{t.landing_noAccount()}</p>
</section>

<section class="features">
  {#each features as feature (feature.heading)}
    <article>
      <span class="icon" aria-hidden="true">
        <feature.icon size={22} />
      </span>
      <h2>{feature.heading}</h2>
      <p>{feature.body}</p>
    </article>
  {/each}
</section>

<style>
  .hero {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-7) 0 var(--space-6);
  }

  h1 {
    font-size: var(--text-2xl);
    max-width: 18ch;
  }

  .hero p {
    max-width: 60ch;
  }

  .muted {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  /*
   * Equal columns, and equal heights: the default stretch is left alone on
   * purpose here, so the three boxes match whatever the copy does. One card
   * standing a line taller than its neighbours reads as a mistake rather than
   * as more to say.
   */
  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: var(--space-5);
  }

  article {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-sm);
  }

  .icon {
    display: grid;
    place-items: center;
    width: max-content;
    padding: var(--space-2);
    border: 2px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--accent-subtle);
    color: var(--accent);
  }

  h2 {
    font-size: var(--text-base);
  }

  article p {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }
</style>
