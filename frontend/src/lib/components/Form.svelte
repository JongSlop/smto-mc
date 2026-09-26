<script lang="ts">
  import { enhance } from '$app/forms';
  import type { Snippet } from 'svelte';

  interface Props {
    action?: string;
    /** Only needed by forms carrying a file, which the default cannot send. */
    enctype?: 'multipart/form-data';
    /** Rendered with the current submitting state, so buttons can show it. */
    children: Snippet<[boolean]>;
  }

  let { action, enctype, children }: Props = $props();

  let submitting = $state(false);
</script>

<!--
  Plain form posts, upgraded with enhance rather than replaced by it, so every
  page still works with JavaScript switched off. The only thing that genuinely
  needs it is the 3D skin, and that has a flat fallback.
-->
<form
  method="POST"
  {action}
  {enctype}
  use:enhance={() => {
    submitting = true;

    return async ({ update }) => {
      // reset: false keeps what the user typed when the server rejects it.
      await update({ reset: false });
      submitting = false;
    };
  }}
>
  {@render children(submitting)}
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
</style>
