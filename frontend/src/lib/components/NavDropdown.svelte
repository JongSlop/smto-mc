<script lang="ts">
  import type { Snippet } from 'svelte';

  import { page } from '$app/state';

  interface Props {
    label: string;
    /** Marks the menu as the current section, the way a nav link does. */
    current?: boolean;
    children: Snippet;
  }

  let { label, current = false, children }: Props = $props();

  /**
   * A <details>, so the menu opens and closes with no JavaScript and announces
   * itself correctly without any aria of our own. Script only adds the two
   * things a disclosure in a header needs and the element does not do by
   * itself: closing when you navigate, and closing when you click away.
   */
  let dropdown = $state<HTMLDetailsElement | null>(null);

  $effect(() => {
    // Read so this reruns on navigation. A client side nav leaves the element
    // mounted, so an open menu would otherwise stay open over the new page.
    void page.url.pathname;

    if (dropdown) {
      dropdown.open = false;
    }
  });

  function closeOnOutside(event: PointerEvent): void {
    if (dropdown?.open && event.target instanceof Node && !dropdown.contains(event.target)) {
      dropdown.open = false;
    }
  }

  function closeOnEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape' && dropdown?.open) {
      dropdown.open = false;
      // Focus goes back to the thing that opened it, not nowhere.
      dropdown.querySelector('summary')?.focus();
    }
  }
</script>

<svelte:window onpointerdown={closeOnOutside} onkeydown={closeOnEscape} />

<details class="dropdown" bind:this={dropdown}>
  <summary aria-current={current ? 'page' : undefined}>{label}</summary>

  <div class="panel">
    {@render children()}
  </div>
</details>

<style>
  /* The menu hangs off the header rather than pushing the nav around, which is
     what the positioning context here is for. */
  .dropdown {
    position: relative;
  }

  summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--fg-muted);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover,
  summary[aria-current='page'] {
    color: var(--accent);
  }

  summary[aria-current='page'] {
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
  }

  /* A marker of our own, since the native one is hidden. Points up when the
     menu is open, and holds still for anybody who asked for less motion. */
  summary::after {
    content: '';
    width: 0;
    height: 0;
    border-top: 5px solid currentColor;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    transition: transform 120ms ease;
  }

  .dropdown[open] summary::after {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    summary::after {
      transition: none;
    }
  }

  .panel {
    position: absolute;
    z-index: 10;
    top: calc(100% + var(--space-3));
    left: 0;
    display: flex;
    flex-direction: column;
    min-width: 14rem;
    padding: var(--space-2);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-sm);
  }

  /*
   * Entries are links in one menu and form buttons in the next, because one of
   * them mints a credential and must not be a GET. They are the same thing to
   * the person using the menu, so they are the same thing to look at.
   */
  .panel :global(a),
  .panel :global(button) {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .panel :global(a:hover),
  .panel :global(button:hover) {
    background: var(--bg-sunken);
    color: var(--accent);
  }

  /* Splits a menu that holds two kinds of entry, e.g. the servers themselves
     and the way to the archive of the ones that have closed. */
  .panel :global(hr) {
    height: 0;
    margin: var(--space-2) var(--space-2);
    border: 0;
    border-top: 2px solid var(--border);
  }

  @media (max-width: 40rem) {
    /* No room to hang a panel off the side at this width, so the menu opens
       inline and pushes the rest of the header down instead. */
    .panel {
      position: static;
      min-width: 0;
      margin-top: var(--space-2);
    }
  }
</style>
