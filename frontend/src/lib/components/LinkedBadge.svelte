<script lang="ts">
  import BadgeCheck from '@lucide/svelte/icons/badge-check';
  import { page } from '$app/state';
  import { translate } from '$lib/i18n';

  interface Props {
    size?: number;
  }

  let { size = 18 }: Props = $props();

  const label = $derived(translate(page.data.lang ?? 'en').linked_badge());
</script>

<!--
  The checkmark next to a name that means the player linked their Minecraft
  profile here, and so is who they say they are. A role of its own with a label,
  because the mark carries meaning that nothing else in the row says, and a
  screen reader would otherwise read out a name with no hint of the difference.
  The title is the tooltip for everybody else.
-->
<span class="badge" role="img" aria-label={label} title={label}>
  <BadgeCheck {size} aria-hidden="true" />
</span>

<style>
  .badge {
    display: inline-flex;
    flex: none;
    vertical-align: -0.2em;
    margin-inline-start: 0.3em;
    color: var(--accent);
  }
</style>
