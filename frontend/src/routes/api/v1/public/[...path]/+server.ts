import { error } from '@sveltejs/kit';

import { backendUrl } from '$lib/server/api';
import type { RequestHandler } from './$types';

/**
 * A passthrough to the backend's public endpoints, for the browser.
 *
 * The dashboard loads a skin from `${base}/api/v1/public/skins/<uuid>.png` and
 * reads its pixels off a canvas, which only works same-origin. In production
 * nginx routes `/mc/link/api/` to the backend and this route is never reached;
 * under `vite dev` the dev proxy does the same. But a plain `docker compose up`
 * has neither, and that is what the README tells people to run, so without this
 * the local stack renders every skin as a broken image.
 *
 * Deliberately narrow, because a general proxy in front of an authenticated API
 * is a way to get past its guards:
 *
 * - only `/api/v1/public/...`, which needs no credentials by definition;
 * - GET only;
 * - nothing from the incoming request is forwarded, so the session cookie and
 *   any `X-Api-Key` a caller invents stay on this side. The backend sees an
 *   anonymous request, which is all these endpoints ever want.
 */
export const GET: RequestHandler = async ({ params, url, fetch }) => {
  const path = params.path;

  // Defence in depth. SvelteKit already decoded the segment, and `[...path]`
  // cannot match a leading slash, but a traversal attempt should stop here
  // rather than be handed to the backend as a resolved URL.
  if (!path || path.includes('..')) {
    error(404, 'not_found');
  }

  const target = `/api/v1/public/${path}${url.search}`;
  const response = await fetch(backendUrl(target), { headers: { accept: '*/*' } });

  // Only the headers a browser needs for these responses. Copying everything
  // would carry the backend's own caching and cookie headers through unread.
  const headers = new Headers();
  for (const name of ['content-type', 'cache-control', 'x-skin-model', 'x-content-type-options']) {
    const value = response.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  return new Response(response.body, { status: response.status, headers });
};
