<script lang="ts">
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';

  // Nothing renders here in practice: the load function and the form action
  // both end in a redirect. This exists so the route is a page route, and as
  // the one frame a very slow browser might paint on the way through.
  const t = $derived(translate(page.data.lang ?? 'en'));
</script>

<p>{t.common_loading()}</p>
