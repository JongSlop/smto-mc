import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * The mount point is a build-time value, taken from BASE_PATH.
 *
 * It is empty in production: the app is served from the root of its own
 * subdomain, https://mc.smto.dev/. Setting BASE_PATH=/mc/link builds the old
 * path-mounted variant instead, which is what a preview that still lives under
 * https://smto.dev/mc/link/ would need. `paths.base` is what makes generated
 * links and asset URLs carry the prefix, so everything downstream (cookies,
 * redirects, the API client) follows from this one value. The backend is the
 * opposite case: it is mounted at clean internal paths with the proxy stripping
 * any prefix, because it produces no absolute URLs of its own.
 *
 * `relative: false` matters as much as the base does. Left at its default,
 * SvelteKit emits relative redirect locations, and on a client side navigation
 * those resolve against the page being left rather than the one asked for,
 * which walks links outside the base and produces 404s that only happen when
 * following a link and never when opening it in a new tab. Absolute paths cost
 * nothing here, so they are always on.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const base = process.env.BASE_PATH ?? '';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    paths: { base, relative: false },
    // Every mutation goes through a form action, so rejecting cross-origin form
    // posts is the CSRF defence. The session cookie is SameSite=Lax on top.
    csrf: { trustedOrigins: [] },
  },
};
