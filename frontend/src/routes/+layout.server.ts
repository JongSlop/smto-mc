import type { LayoutServerLoad } from './$types';

/**
 * Everything every page needs, resolved once per request in hooks.server.ts.
 * Pages read `account` rather than fetching it again.
 *
 * This reads only `locals`, which SvelteKit cannot see into, so it has no
 * tracked dependency and the client caches it across navigations. That is fine
 * for everything here: `account` changes only on sign in or sign out, both of
 * which are full page loads, and `lang` changes only through the switcher,
 * which forces one for the reason explained there.
 */
export const load: LayoutServerLoad = ({ locals }) => ({
  lang: locals.lang,
  account: locals.account,
});
