<script lang="ts">
  import type { Snippet } from 'svelte';

  import { base, resolve } from '$app/paths';
  import { page } from '$app/state';
  import { ADMIN_ROLE } from '@smto/mc-contracts';
  import Archive from '@lucide/svelte/icons/archive';
  import Blocks from '@lucide/svelte/icons/blocks';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import MapIcon from '@lucide/svelte/icons/map';
  import Music from '@lucide/svelte/icons/music';
  import UserCog from '@lucide/svelte/icons/user-cog';
  import Video from '@lucide/svelte/icons/video';
  import Logo from '$lib/components/Logo.svelte';
  import NavDropdown from '$lib/components/NavDropdown.svelte';
  import ServerIcon from '$lib/components/ServerIcon.svelte';
  import { translate } from '$lib/i18n';
  import { LANGUAGE_NAMES, LANGUAGES } from '$lib/language';
  import { webmapEntries } from '$lib/webmap';
  import type { LayoutData } from './$types';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  /**
   * Read at render rather than baked in at build time, so a deploy does not
   * have to be rebuilt every January for the footer to stay current.
   */
  const year = new Date().getFullYear();

  const t = $derived(translate(page.data.lang ?? 'en'));
  const account = $derived(page.data.account);
  const isAdmin = $derived(account?.roles.includes(ADMIN_ROLE) ?? false);

  /**
   * The nav, split either side of the servers dropdown that sits between them.
   *
   * Signed out there is nothing here at all: every one of these pages needs a
   * session, and the landing page carries its own sign in button.
   */
  const leadingLinks = $derived(
    account
      ? [
          { href: resolve('/dashboard'), label: t.nav_dashboard() },
          { href: resolve('/leaderboards'), label: t.nav_leaderboards() },
        ]
      : [],
  );

  const trailingLinks = $derived(
    account
      ? [
          { href: resolve('/settings'), label: t.nav_settings() },
          ...(isAdmin ? [{ href: resolve('/admin/servers'), label: t.nav_admin() }] : []),
        ]
      : [],
  );

  /**
   * The menu lists the servers somebody can actually play on right now, and
   * nothing else. A network keeps every season it has ever run, so left whole
   * the list grows forever and the two servers that matter today sit at the
   * bottom of it. The closed ones are still worth reaching, because the stats
   * on them are still there, so they get a page of their own behind one entry.
   */
  const servers = $derived(data.servers);
  const webmaps = $derived(webmapEntries(servers));
  const liveServers = $derived(servers.filter((server) => server.state !== 'ARCHIVED'));
  const hasArchived = $derived(servers.some((server) => server.state === 'ARCHIVED'));
  const archiveHref = $derived(resolve('/(app)/servers/archived'));
  /** Any server page, so the menu reads as current while you are on one. */
  const onServerPage = $derived(page.url.pathname.startsWith(`${base}/servers/`));

  /**
   * Services are other smto.dev sites this one can sign you into, and each is
   * configured independently, so the menu is hidden outright when none of them
   * is switched on rather than opening onto nothing.
   */
  const services = $derived(data.services);
  /**
   * The Web Map entry is one of these too, though it is a page of our own rather
   * than a hand-off: it exists only while at least one server has a map, so the
   * menu never offers a page that would open onto an empty list.
   */
  const hasWebmap = $derived(webmaps.length > 0);
  /**
   * Never empty any more, because the schematic converter needs nothing from
   * anywhere else: it is a page of ours that runs in the browser. The menu is
   * therefore always there for somebody signed in, and it is the other entries
   * that come and go.
   */
  const onServicePage = $derived(page.url.pathname.startsWith(`${base}/services/`));
  const uploaderHref = $derived(resolve('/(app)/services/uploader'));
  const webmapHref = $derived(resolve('/(app)/services/webmap'));
  const schematicsHref = $derived(resolve('/(app)/services/schematics'));

  /**
   * The switcher is a plain link carrying ?lang=, handled in hooks.server.ts,
   * so it works with JavaScript off and on every page including the ones a
   * redirect lands on.
   */
  const otherLanguages = $derived(LANGUAGES.filter((code) => code !== page.data.lang));
</script>

<a class="skip visually-hidden" href="#main">{t.nav_skipToContent()}</a>

<div class="shell">
  <header>
    <a class="brand" href={resolve('/')}>
      <Logo />
      <span>{t.app_name()}</span>
    </a>

    {#if leadingLinks.length > 0 || trailingLinks.length > 0}
      <nav aria-label={t.app_name()}>
        {#each leadingLinks as link (link.href)}
          <!--
            Already resolved, in the array above. The rule cannot see through the
            indirection, and building the nav in the markup instead would mean
            repeating the admin condition for every entry.
          -->
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>
            {link.label}
          </a>
        {/each}

        <!--
          The only way to a server page, now that there is no index listing them.
          Hidden rather than empty when the list could not be loaded: a menu that
          opens onto nothing is worse than no menu.
        -->
        {#if liveServers.length > 0 || hasArchived}
          <NavDropdown label={t.nav_servers()} current={onServerPage}>
            {#each liveServers as server (server.id)}
              <a href={resolve('/(app)/servers/[id]', { id: server.id })}>
                <ServerIcon iconUrl={server.iconUrl} name={server.name} size={24} />
                <span>{server.name}</span>
              </a>
            {/each}

            <!--
              Only offered when there is something in it, and separated from the
              live servers because it is a different kind of entry: the ones
              above are places, this one is a list.
            -->
            {#if hasArchived}
              {#if liveServers.length > 0}
                <hr />
              {/if}
              <a
                href={resolve('/(app)/servers/archived')}
                aria-current={page.url.pathname === archiveHref ? 'page' : undefined}
              >
                <Archive size={20} aria-hidden="true" />
                <span>{t.servers_archivedLink()}</span>
              </a>
            {/if}
          </NavDropdown>
        {/if}

        <NavDropdown label={t.nav_services()} current={onServicePage}>
          <!--
              The way onto the network in the first place, so it goes first.
              A plain link: it is a public download page with nothing behind it.
            -->
          {#if services.launcher}
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={services.launcher.url}>
              <Gamepad2 size={20} aria-hidden="true" />
              <span>{t.services_launcher()}</span>
              <span class="external"><ExternalLink size={14} aria-hidden="true" /></span>
              <span class="visually-hidden">{t.services_external()}</span>
            </a>
          {/if}

          <!--
              A page of ours, not a hand-off, so a plain internal link with no
              external marker. The page itself lists the maps and links out.
            -->
          {#if hasWebmap}
            <a
              href={resolve('/(app)/services/webmap')}
              aria-current={page.url.pathname === webmapHref ? 'page' : undefined}
            >
              <MapIcon size={20} aria-hidden="true" />
              <span>{t.services_webmap()}</span>
            </a>
          {/if}

          <!--
              Always here: it runs entirely in the browser and needs nothing from
              the backend or from any other service to be switched on.
            -->
          <a
            href={resolve('/(app)/services/schematics')}
            aria-current={page.url.pathname === schematicsHref ? 'page' : undefined}
          >
            <Blocks size={20} aria-hidden="true" />
            <span>{t.services_schematics()}</span>
          </a>

          <!--
              Forms rather than links, and not a style choice: opening the
              uploader mints a one time credential over there, and this app
              preloads links on hover. A link here would spend a session every
              time the pointer crossed the menu.

              Two entries for the two halves of the uploader, which is what
              the `intent` parameter picks, and one form: the button that was
              pressed is the one whose name and value are sent. Without the
              parameter the uploader opens on videos.
            -->
          {#if services.uploader.enabled}
            <form method="POST" action={uploaderHref}>
              <button type="submit" name="intent" value="audio">
                <Music size={20} aria-hidden="true" />
                <span>{t.services_audio()}</span>
                <span class="external"><ExternalLink size={14} aria-hidden="true" /></span>
                <span class="visually-hidden">{t.services_external()}</span>
              </button>

              <button type="submit" name="intent" value="video">
                <Video size={20} aria-hidden="true" />
                <span>{t.services_video()}</span>
                <span class="external"><ExternalLink size={14} aria-hidden="true" /></span>
                <span class="visually-hidden">{t.services_external()}</span>
              </button>
            </form>
          {/if}

          <!--
              A plain link, unlike the two above: the account system is where
              this session came from, so the person is already signed in over
              there and there is nothing to mint.
            -->
          {#if services.account}
            <!--
                An absolute URL to another service, so there is no route of
                ours for resolve() to resolve. The rule cannot see that through
                the variable.
              -->
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a href={services.account.url}>
              <UserCog size={20} aria-hidden="true" />
              <span>{t.services_account()}</span>
              <span class="external"><ExternalLink size={14} aria-hidden="true" /></span>
              <span class="visually-hidden">{t.services_external()}</span>
            </a>
          {/if}
        </NavDropdown>

        {#each trailingLinks as link (link.href)}
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a href={link.href} aria-current={page.url.pathname === link.href ? 'page' : undefined}>
            {link.label}
          </a>
        {/each}
      </nav>
    {/if}

    <div class="meta">
      {#each otherLanguages as code (code)}
        <!--
          Deliberately a bare query string rather than a resolved route. The
          switcher has to keep whatever page it is rendered on, including
          parameterised ones, and hooks.server.ts strips the parameter and
          redirects back to the same path. resolve() would need the route and its
          params here for no gain.

          data-sveltekit-reload forces a full page load instead of a client side
          navigation, and it is not optional. Two things have to change and only
          a document render does both: the copy, which comes from the root
          layout's load (that load reads `locals`, which SvelteKit cannot track,
          so the client happily reuses the cached language), and the `lang`
          attribute on <html>, which hooks.server.ts injects through
          transformPageChunk and which a client side navigation never touches.
          Invalidating the data would fix the first and leave the second wrong.

          The cost is one round trip on an action somebody takes approximately
          once, in exchange for the page and the document agreeing about what
          language they are in.
        -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a class="lang" href="?lang={code}" hreflang={code} data-sveltekit-reload>
          {LANGUAGE_NAMES[code]}
        </a>
      {/each}

      {#if account}
        <form method="POST" action={resolve('/auth/logout')}>
          <button type="submit">{t.nav_signOut()}</button>
        </form>
      {:else}
        <form method="POST" action={resolve('/auth/login')}>
          <button type="submit">{t.nav_signIn()}</button>
        </form>
      {/if}
    </div>
  </header>

  <main id="main">
    {@render children()}
  </main>

  <footer>
    © {year} <a href="https://smto.dev/account/">smto.dev</a>
  </footer>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    max-width: 68rem;
    margin: 0 auto;
    padding: var(--space-5) var(--space-4);
    gap: var(--space-6);
  }

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: 2px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    color: var(--fg);
    text-decoration: none;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-right: auto;
  }

  /*
   * The arrow out of a box, the usual sign that a link leaves for somewhere
   * else. These entries hand the player to a different smto.dev service, and
   * pressed by accident that is a surprise rather than a page they can go back
   * from, so it is worth saying before the press. Pushed to the right edge, and
   * repeated in words for anybody who is not looking at it.
   */
  .external {
    display: flex;
    margin-left: auto;
    padding-left: var(--space-3);
    color: var(--fg-muted);
  }

  nav a {
    color: var(--fg-muted);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
  }

  nav a:hover,
  nav a[aria-current='page'] {
    color: var(--accent);
  }

  nav a[aria-current='page'] {
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .lang {
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  .meta button {
    padding: var(--space-2) var(--space-4);
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .meta button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    flex: 1;
  }

  footer {
    padding-top: var(--space-4);
    border-top: 2px solid var(--border);
    color: var(--fg-muted);
    font-size: var(--text-sm);
  }

  .skip:focus {
    position: static;
    display: inline-block;
    width: auto;
    height: auto;
    padding: var(--space-2) var(--space-4);
    clip-path: none;
  }

  @media (max-width: 40rem) {
    header {
      flex-direction: column;
      align-items: flex-start;
    }

    nav {
      margin-right: 0;
    }
  }
</style>
