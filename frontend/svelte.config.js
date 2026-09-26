import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Served from https://smto.dev/mc/link/, with nginx passing that prefix through
 * untouched, so SvelteKit has to know about it: `paths.base` is what makes
 * generated links and asset URLs carry it. The backend is the opposite case,
 * mounted at clean internal paths with nginx stripping the prefix, because it
 * produces no absolute URLs of its own.
 *
 * `relative: false` matters as much as the base does. Left at its default,
 * SvelteKit emits relative redirect locations, and on a client side navigation
 * those resolve against the page being left rather than the one asked for,
 * which walks links outside the base and produces 404s that only happen when
 * following a link and never when opening it in a new tab. This app is always
 * mounted at /mc/link, so absolute paths cost nothing.
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    paths: { base: '/mc/link', relative: false },
    // Every mutation goes through a form action, so rejecting cross-origin form
    // posts is the CSRF defence. The session cookie is SameSite=Lax on top.
    csrf: { trustedOrigins: [] },
  },
};
