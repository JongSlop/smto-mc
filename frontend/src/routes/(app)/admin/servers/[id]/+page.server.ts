import { fail, redirect } from '@sveltejs/kit';
import {
  ASSET_CONTENT_TYPES,
  ASSET_MAX_BYTES,
  updateServerSchema,
  type AssetContentType,
  type ServerAsset,
  type ServerMeta,
} from '@smto/mc-contracts';

import { base } from '$app/paths';
import { ApiError, apiAuthed, apiUpload } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const [server, assets] = await Promise.all([
    apiAuthed<ServerMeta>(cookies, `/api/v1/admin/servers/${params.id}`),
    apiAuthed<ServerAsset[]>(cookies, `/api/v1/admin/servers/${params.id}/assets`),
  ]);

  return { server, assets };
};

/**
 * Turns whatever the file was called on somebody's desktop into something that
 * can live in a URL.
 *
 * Browsers hand over the base name already, but they do not promise much about
 * it: spaces, brackets and non-Latin characters all arrive as they were typed.
 * The backend refuses anything outside its own character set rather than
 * guessing, so the guessing happens here, once, where the person can see the
 * result before pressing the button.
 */
function safeFilename(raw: string): string {
  const name = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = name
    .normalize('NFKD')
    // Printable ASCII only, so the address is the same string everywhere it is
    // pasted rather than a percent-encoded version of itself.
    .replace(/[^\u0020-\u007e]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 100);

  return cleaned === '' ? 'image' : cleaned;
}

export const actions: Actions = {
  save: async ({ params, request, cookies }) => {
    const form = await request.formData();

    // `extra` is edited as raw JSON because this service has no opinion about
    // what goes in it. A syntax error has to be caught here: sending the string
    // on would store it as a JSON string rather than an object, and the mistake
    // would only surface much later in whatever reads it.
    let extra: Record<string, unknown>;
    try {
      const raw = String(form.get('extra') ?? '').trim();
      extra = raw === '' ? {} : (JSON.parse(raw) as Record<string, unknown>);
    } catch {
      return fail(400, { error: 'validation_failed' });
    }

    const parsed = updateServerSchema.safeParse({
      name: form.get('name'),
      state: form.get('state'),
      description: form.get('description') || null,
      launchDate: form.get('launchDate') || null,
      currentVersion: form.get('currentVersion') || null,
      iconUrl: form.get('iconUrl') || null,
      sortOrder: Number(form.get('sortOrder') ?? 0),
      isPublic: form.get('isPublic') === 'on',
      extra,
    });

    if (!parsed.success) {
      return fail(400, { error: 'validation_failed' });
    }

    try {
      await apiAuthed<ServerMeta>(cookies, `/api/v1/admin/servers/${params.id}`, {
        method: 'PATCH',
        body: parsed.data,
      });
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }

    return { saved: true };
  },

  /**
   * Uploads one image for this server.
   *
   * Checked here before it is sent on, because a 8 MiB round trip that ends in
   * a rejection is a waste of somebody's upload. The backend checks the same
   * things again, including what the bytes actually are, since this side is
   * only the first of the two that can be trusted.
   */
  uploadAsset: async ({ params, request, cookies }) => {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { error: 'empty_asset' });
    }

    if (file.size > ASSET_MAX_BYTES) {
      return fail(400, { error: 'asset_too_large' });
    }

    const contentType = file.type.split(';')[0]?.trim().toLowerCase() ?? '';

    if (!(ASSET_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      return fail(400, { error: 'unsupported_asset_type' });
    }

    // A name typed into the form wins over the one the file came with, so an
    // `IMG_2042.PNG` out of a phone can become `background.png` without a
    // detour through a file manager.
    const chosen = String(form.get('filename') ?? '').trim();
    const filename = safeFilename(chosen === '' ? file.name : chosen);

    let asset: ServerAsset;

    try {
      asset = await apiUpload<ServerAsset>(
        cookies,
        `/api/v1/admin/servers/${params.id}/assets?filename=${encodeURIComponent(filename)}`,
        { data: await file.arrayBuffer(), contentType: contentType as AssetContentType },
      );
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }

    // The name the backend settled on, not the one that was asked for: the
    // extension is rewritten to match what the bytes actually are, and the
    // message would otherwise name a file that is not there.
    return { uploaded: asset.filename };
  },

  deleteAsset: async ({ params, request, cookies }) => {
    const form = await request.formData();
    const assetId = String(form.get('assetId') ?? '');

    try {
      await apiAuthed<void>(
        cookies,
        `/api/v1/admin/servers/${params.id}/assets/${encodeURIComponent(assetId)}`,
        { method: 'DELETE' },
      );
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }

    return { assetDeleted: true };
  },

  /**
   * Deleting takes the server's statistics with it, which is why the page says
   * so plainly and offers Archived as the thing most people actually want.
   */
  delete: async ({ params, cookies }) => {
    try {
      await apiAuthed<void>(cookies, `/api/v1/admin/servers/${params.id}`, { method: 'DELETE' });
    } catch (caught) {
      return fail(400, { error: caught instanceof ApiError ? caught.code : 'request_failed' });
    }

    redirect(303, `${base}/admin/servers`);
  },
};
