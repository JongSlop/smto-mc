<script lang="ts">
  interface Props {
    iconUrl: string | null;
    name: string;
    size?: number;
  }

  let { iconUrl, name, size = 48 }: Props = $props();

  // The first letter is a better placeholder than a generic block: a list of
  // five servers stays scannable when one of them has no icon set yet.
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '?');
</script>

{#if iconUrl}
  <img class="icon pixelated" src={iconUrl} alt="" width={size} height={size} loading="lazy" />
{:else}
  <div class="icon placeholder" style:width="{size}px" style:height="{size}px" aria-hidden="true">
    {initial}
  </div>
{/if}

<style>
  .icon {
    flex: none;
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-sunken);
    object-fit: cover;
  }

  .placeholder {
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    color: var(--fg-muted);
  }
</style>
