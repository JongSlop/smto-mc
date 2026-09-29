import { env } from '$env/dynamic/private';
import type { Cookies } from '@sveltejs/kit';

import { clearSession, readSession } from './session';

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

/**
 * A failed backend call. `code` is the machine-readable string the backend
 * throws, such as `profile_already_linked`, not prose. Pages turn it into text
 * through lib/i18n.ts so the wording lives in the message files.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  sessionToken?: string;
}

/**
 * The backend as reached from inside the network, not the public URL. nginx
 * strips the /mc/link/api prefix for API traffic, so the internal paths are
 * clean: /auth/start, /api/v1/me, /api/v1/public/servers.
 */
export function backendUrl(path: string): string {
  const origin = (env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:3011').replace(/\/$/, '');
  return `${origin}${path}`;
}

async function send(path: string, options: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, sessionToken } = options;

  return fetch(backendUrl(path), {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function toApiError(response: Response): Promise<ApiError> {
  let code = 'request_failed';
  let issues: ValidationIssue[] = [];

  try {
    const body: unknown = await response.json();

    if (body && typeof body === 'object') {
      const shape = body as { message?: unknown; error?: unknown; issues?: unknown };

      if (typeof shape.message === 'string') {
        code = shape.message;
      } else if (Array.isArray(shape.message) && typeof shape.message[0] === 'string') {
        code = shape.message[0];
      } else if (typeof shape.error === 'string') {
        code = shape.error;
      }

      if (Array.isArray(shape.issues)) {
        issues = shape.issues as ValidationIssue[];
      }
    }
  } catch {
    // A non-JSON error body, for instance an nginx page. The status carries
    // enough for the caller and the generic code stands.
  }

  return new ApiError(response.status, code, issues);
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** For endpoints that take no session: starting and finishing a login. */
export async function apiPublic<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return parse<T>(await send(path, options));
}

/**
 * Calls the backend as the signed-in person.
 *
 * There is no refresh dance here, unlike the account system's own frontend.
 * Our session token does not expire on its own: the backend holds the account
 * system's refresh token and renews it behind this call. A 401 therefore means
 * the session is genuinely over, so the cookie is cleared rather than retried.
 */
export async function apiAuthed<T>(
  cookies: Cookies,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = readSession(cookies);

  if (!token) {
    throw new ApiError(401, 'not_authenticated');
  }

  const response = await send(path, { ...options, sessionToken: token });

  if (response.status === 401) {
    clearSession(cookies);
    throw new ApiError(401, 'not_authenticated');
  }

  return parse<T>(response);
}

/**
 * Sends a file to the backend as the signed-in person.
 *
 * Raw bytes with an image content type rather than multipart, matching what
 * the admin upload endpoint takes: the browser's own multipart envelope is
 * unwrapped in the form action, which has to look at the file anyway to check
 * its size and type before spending a round trip on it.
 */
export async function apiUpload<T>(
  cookies: Cookies,
  path: string,
  file: { data: ArrayBuffer; contentType: string },
): Promise<T> {
  const token = readSession(cookies);

  if (!token) {
    throw new ApiError(401, 'not_authenticated');
  }

  const response = await fetch(backendUrl(path), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': file.contentType,
      authorization: `Bearer ${token}`,
    },
    body: file.data,
  });

  if (response.status === 401) {
    clearSession(cookies);
    throw new ApiError(401, 'not_authenticated');
  }

  return parse<T>(response);
}

/**
 * Ends the session on both sides and reports where to send the browser so the
 * account system ends its own. The cookie is cleared whatever happens, so the
 * browser is signed out even if the backend call fails.
 */
export async function endSession(cookies: Cookies): Promise<string | null> {
  const token = readSession(cookies);
  clearSession(cookies);

  if (!token) {
    return null;
  }

  try {
    const result = await parse<{ endSessionUrl: string | null }>(
      await send('/auth/logout', { method: 'POST', sessionToken: token }),
    );
    return result.endSessionUrl;
  } catch {
    // The cookie is already gone. A session we could not close on their side
    // expires on its own.
    return null;
  }
}
