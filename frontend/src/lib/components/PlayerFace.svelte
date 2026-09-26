<script lang="ts">
  import { base } from '$app/paths';

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
   * A Minecraft skin is a 64x64 sheet: the face is the 8x8 square at (8,8) and
   * the hat layer is the one at (40,8), drawn over it. Two background layers of
   * the same image, scaled up eightfold and offset, produce the head everybody
   * recognises without a second endpoint, an image library or a second request:
   * the browser already has this file cached from the skin proxy.
   */
  const scale = $derived(size / 8);
  const url = $derived(`${base}/api/v1/public/skins/${mcUuid}.png`);
</script>

<span
  class="face"
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
    /* Hat layer first, so it sits over the face underneath it. */
    background-image: var(--url), var(--url);
    background-position:
      calc(var(--one) * -40) calc(var(--one) * -8),
      calc(var(--one) * -8) calc(var(--one) * -8);
    background-size: var(--sheet) var(--sheet);
    background-repeat: no-repeat;
    /* Shows through until the skin loads, and stands in for one that will not. */
    background-color: var(--bg-sunken);
    /* Eight pixels blown up to thirty-two stay pixels, the way they do in game. */
    image-rendering: pixelated;
  }
</style>
