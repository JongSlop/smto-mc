<script lang="ts">
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';

  const t = $derived(translate(page.data.lang ?? 'en'));
</script>

<p>{t.common_loading()}</p>
