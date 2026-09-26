<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    /** Same-origin PNG from our proxy, so the renderer can read its pixels. */
    skinUrl: string;
    capeUrl?: string | null;
    username: string;
    height?: number;
  }

  let { skinUrl, capeUrl = null, username, height = 340 }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let ready = $state(false);

  /**
   * skinview3d pulls in three.js, which is most of this page's JavaScript and
   * is useless on the server. Importing it inside onMount keeps it out of the
   * server bundle and off the critical path: the flat head below renders
   * immediately and the model replaces it once it is on screen.
   */
  onMount(() => {
    let viewer: { dispose: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { SkinViewer, WalkingAnimation } = await import('skinview3d');

        if (cancelled || !canvas) {
          return;
        }

        const instance = new SkinViewer({
          canvas,
          width: canvas.clientWidth || 280,
          height,
          skin: skinUrl,
          ...(capeUrl ? { cape: capeUrl } : {}),
        });

        // Reduced motion is a real preference, not a nicety: a permanently
        // walking figure is exactly what people who get motion sick are asking
        // to be spared. The model still renders and can still be dragged.
        const stillPreferred = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!stillPreferred) {
          instance.animation = new WalkingAnimation();
          instance.animation.speed = 0.6;
        }

        instance.controls.enableZoom = false;
        // Panning a figure out of its own frame has no upside and is easy to do
        // by accident on a trackpad.
        instance.controls.enablePan = false;

        viewer = instance;
        ready = true;
      } catch {
        // WebGL unavailable, a blocked module, an unreadable texture. The flat
        // head is already on screen and simply stays there.
        ready = false;
      }
    })();

    return () => {
      cancelled = true;
      viewer?.dispose();
    };
  });
</script>

<div class="viewer" style:min-height="{height}px">
  <!--
    The whole experience with JavaScript off or WebGL unavailable, and the
    placeholder while three.js loads. A real fallback rather than a spinner.

    A skin file is a texture atlas, not a portrait, so the head is cropped out
    of it with background positioning: the face is an 8x8 tile at (8, 8), scaled
    16 times to fill this 128px box.

    The width is pinned and the height left automatic because both skin formats
    are in circulation: 64x64 for anything modern, and 64x32 for older accounts
    that never changed their skin. A fixed 1024x1024 would stretch a legacy
    sheet to twice its height and crop somebody's ear instead of their face.
  -->
  <div
    class="fallback pixelated"
    class:hidden={ready}
    style:background-image="url({skinUrl})"
    role="img"
    aria-label="{username}: Minecraft skin"
  ></div>

  <canvas bind:this={canvas} class:hidden={!ready} aria-hidden="true"></canvas>
</div>

<style>
  .viewer {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
  }

  canvas {
    width: 100%;
    max-width: 100%;
  }

  .fallback {
    width: 128px;
    height: 128px;
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-md);
    background-repeat: no-repeat;
    background-size: 1024px auto;
    background-position: -128px -128px;
  }

  .hidden {
    display: none;
  }
</style>
