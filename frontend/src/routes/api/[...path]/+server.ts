import { json, type RequestHandler } from '@sveltejs/kit';

/**
 * Answers anything under `/api/` that this app does not serve itself.
 *
 * In production nginx routes the whole `/mc/link/api/` prefix to the backend
 * and nothing here is ever reached. Locally there is no nginx, and only
 * `/api/v1/public/*` is proxied (see the sibling route), so a plugin pointed at
 * the production URL lands on the SvelteKit router instead and gets the app's
 * HTML 404 page. Several hundred bytes of markup is a miserable thing to find
 * in a server log when the actual problem is a port number.
 *
 * This is not a proxy and deliberately never becomes one: forwarding
 * `/api/v1/ingest/*` from here would put an unauthenticated, browser-reachable
 * path in front of the endpoints that write other players' statistics.
 */
const BACKEND_PORT = 3011;

const explain: RequestHandler = ({ params, url, request }) => {
  const path = params.path ?? '';

  return json(
    {
      error: 'not_proxied',
      message:
        `This is the web app, which only serves /api/v1/public/* itself. ` +
        `In production nginx routes ${url.pathname} to the backend; there is no nginx here, ` +
        `so call the backend directly on port ${BACKEND_PORT}.`,
      youRequested: `${request.method} ${url.pathname}`,
      useInstead: `${request.method} http://127.0.0.1:${BACKEND_PORT}/api/${path}${url.search}`,
    },
    { status: 404 },
  );
};

export const GET = explain;
export const POST = explain;
export const PUT = explain;
export const PATCH = explain;
export const DELETE = explain;
