<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';

  interface Props {
    mcUuid: string;
    size?: number;
    /** Decorative by default: lists put the name next to the face anyway. */
    label?: string;
  }

  let { mcUuid, size = 32, label }: Props = $props();

  /**
   * The face, cropped out of the full skin in CSS rather than rendered server
   * side.
   *
   * A skin is a sheet of pixels: the face is the 8x8 square at (8,8), and a
   * modern 64x64 skin has a second layer over it at (40,8), which is where hats
   * and hair go. Scaling the sheet up and offsetting it puts the right square in
   * the box without a second endpoint or an image library; the browser already
   * has this file cached from the 3D viewer.
   *
   * The scale is worked out from the box inside the border, not from `size`.
   * `box-sizing: border-box` is set globally, so `size` includes the two pixel
   * border on every side while the background is drawn from the padding box,
   * which is four pixels smaller. Scaling the sheet to the full `size` made the
   * face larger than the space it was drawn in and pushed it a pixel down and to
   * the right, which is exactly what "slightly off centre" was.
   */
  const border = 2;
  const scale = $derived((size - border * 2) / 8);
  const url = $derived(`${base}/api/v1/public/skins/${mcUuid}.png`);

  /**
   * Whether to draw the second layer, which only a 64x64 skin has.
   *
   * Older skins are 64x32, one layer tall. There is no hat layer in them, so
   * (40,8) is some unrelated part of the body, and for several real skins it is
   * opaque: drawing it over the face turned the whole head into a solid block.
   * That is what "some faces are just black squares" was. The second layer is
   * only used once the image itself has said it is tall enough to have one;
   * until then the bare face is shown, which is correct for a 64x32 skin and
   * merely missing a hat for a 64x64 one for a moment.
   *
   * The probe is the same URL the background already loads, so the browser
   * serves it from cache rather than fetching the skin twice.
   */
  let hats = $state(false);

  onMount(() => {
    const probe = new Image();

    probe.addEventListener('load', () => {
      hats = probe.naturalHeight >= 64;
    });

    probe.src = url;

    return () => probe.removeAttribute('src');
  });
</script>

<span
  class="face"
  class:hats
  style="--size: {size}px; --sheet: {64 * scale}px; --one: {scale}px; --url: url('{url}')"
  role={label ? 'img' : 'presentation'}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
></span>

<style>
  .face {
    display: block;
    flex: none;
    width: var(--size);
    height: var(--size);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-sm);
    /* The face, from the base layer. */
    background-image: var(--url);
    background-position: calc(var(--one) * -8) calc(var(--one) * -8);
    /* Width only, so the height follows the image's own shape. Forcing a square
       stretched a 64x32 skin to double height and threw the crop off a whole
       face; the offset below assumes a pixel is the same size both ways. */
    background-size: var(--sheet);
    background-repeat: no-repeat;
    /* Shows through until the skin loads, and stands in for one that will not. */
    background-color: var(--bg-sunken);
    /* Eight pixels blown up stay pixels, the way they do in game. */
    image-rendering: pixelated;
  }

  /* The second layer first, so it sits over the face underneath it. */
  .face.hats {
    background-image: var(--url), var(--url);
    background-position:
      calc(var(--one) * -40) calc(var(--one) * -8),
      calc(var(--one) * -8) calc(var(--one) * -8);
  }
</style>
