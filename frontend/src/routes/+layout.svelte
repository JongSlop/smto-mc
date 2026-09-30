<script lang="ts">
  import type { Snippet } from 'svelte';

  // Served from this origin by the bundler, weight 400 only: it is all the
  // headings use. Not from Google Fonts, which a blocker, a firewall or a
  // privacy setting can stop, and which sends every visitor's address to a third
  // party for the sake of a typeface.
  import '@fontsource/silkscreen/400.css';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
