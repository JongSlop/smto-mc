<script lang="ts">
  // Inlined at build time rather than fetched as an <img>: the mark is 700
  // bytes, it renders before first paint with no second request, and inlining
  // is what lets the lamp light up on hover below.
  //
  // static/favicon.svg and static/favicon.png are the same drawing. Regenerate
  // them from this one file after any change to it:
  //
  //   cp src/lib/assets/observer.svg static/favicon.svg
  //   rsvg-convert -w 64 -h 64 src/lib/assets/observer.svg -o static/favicon.png
  import observer from '$lib/assets/observer.svg?raw';

  interface Props {
    size?: number;
    /**
     * Decorative by default: in the header the word Observer sits right next to
     * it, and a screen reader that read both would say the name twice. Pass a
     * label where the mark stands on its own.
     */
    label?: string;
  }

  let { size = 24, label }: Props = $props();
</script>

<span
  class="logo"
  style="--logo-size: {size}px"
  role={label ? 'img' : 'presentation'}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html observer}
</span>

<style>
  .logo {
    display: block;
    flex: none;
    width: var(--logo-size);
    height: var(--logo-size);
  }

  .logo :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  /*
   * An observer fires when it sees something change, so the lamp lights when
   * you reach for it. Colour only, no movement, and nothing that matters
   * depends on noticing it.
   */
  :global(a:hover) .logo :global(.lamp),
  :global(a:focus-visible) .logo :global(.lamp) {
    fill: #ff6b5a;
  }
</style>
