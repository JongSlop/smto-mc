import { fail } from '@sveltejs/kit';
import {
  createApiTokenSchema,
  type ApiToken,
  type ApiTokenWithSecret,
  type ServerMeta,
} from '@smto/mc-contracts';

import { ApiError, apiAuthed } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
  const [tokens, servers] = await Promise.all([
    apiAuthed<ApiToken[]>(cookies, '/api/v1/admin/tokens'),
    // For the "restrict to server" picker. Loaded here rather than in the
    // component so the page renders complete on the first response.
    apiAuthed<ServerMeta[]>(cookies, '/api/v1/admin/servers'),
  ]);

  return { tokens, servers };
};

export const actions: Actions = {
  create: async ({ request, cookies }) => {
    const form = await request.formData();

    const parsed = createApiTokenSchema.safeParse({
      name: form.get('name'),
      scopes: form.getAll('scopes'),
      serverId: form.get('serverId') || undefined,
    });

    if (!parsed.success) {
      return fail(400, { error: 'validation_failed' });
    }

    try {
      // The only response that ever carries the token itself. It is handed
      // straight to the page and never stored anywhere else.
      const created = await apiAuthed<ApiTokenWithSecret>(cookies, '/api/v1/admin/tokens', {
        method: 'POST',
        body: parsed.data,
      });

      return { created };
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }
  },

  revoke: async ({ request, cookies }) => {
    const form = await request.formData();
    const id = String(form.get('id') ?? '');

    try {
      await apiAuthed<ApiToken>(cookies, `/api/v1/admin/tokens/${id}`, { method: 'DELETE' });
      return { revoked: true };
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }
  },
};
