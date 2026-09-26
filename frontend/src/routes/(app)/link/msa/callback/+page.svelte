<script lang="ts">
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';

  // The load function always redirects. This is here so the route is a page
  // route, and as the one frame a very slow browser might paint on the way
  // through the Microsoft chain.
  const t = $derived(translate(page.data.lang ?? 'en'));
</script>

<p>{t.common_loading()}</p>
