import { fail } from '@sveltejs/kit';
import { createServerSchema, type ServerMeta } from '@smto/mc-contracts';

import { ApiError, apiAuthed } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => ({
  servers: await apiAuthed<ServerMeta[]>(cookies, '/api/v1/admin/servers'),
});

export const actions: Actions = {
  create: async ({ request, cookies }) => {
    const form = await request.formData();

    // The same schema the backend validates against, so the form rejects what
    // the API would reject rather than making somebody find out on submit.
    const parsed = createServerSchema.safeParse({
      id: form.get('id'),
      name: form.get('name'),
      state: form.get('state'),
      description: form.get('description') || undefined,
      launchDate: form.get('launchDate') || undefined,
      currentVersion: form.get('currentVersion') || undefined,
      iconUrl: form.get('iconUrl') || undefined,
      sortOrder: Number(form.get('sortOrder') ?? 0),
      isPublic: form.get('isPublic') === 'on',
      extra: {},
    });

    if (!parsed.success) {
      return fail(400, {
        error: 'validation_failed',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    try {
      await apiAuthed<ServerMeta>(cookies, '/api/v1/admin/servers', {
        method: 'POST',
        body: parsed.data,
      });
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }

    return { created: true };
  },
};
