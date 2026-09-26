import { INestApplication } from '@nestjs/common';
import { ADMIN_ROLE, ASSET_MAX_BYTES } from '@smto/mc-contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import {
  createAccount,
  createApiToken,
  createServer,
  createSession,
  createTestApp,
  resetDatabase,
} from './helpers';

/** A real 1x1 PNG, so the signature check sees what it expects. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A JPEG's first bytes, which is all the sniffer looks at. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

describe('server assets', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let player: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await createServer(prisma, 'i5');

    admin = await createSession(
      app,
      prisma,
      await createAccount(prisma, 'admin', ['user', ADMIN_ROLE]),
    );
    player = await createSession(app, prisma, await createAccount(prisma, 'player'));
  });

  function upload(token: string, filename: string, body: Buffer, type = 'image/png') {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/servers/i5/assets?filename=${encodeURIComponent(filename)}`)
      .set('authorization', `Bearer ${token}`)
      .set('content-type', type)
      .send(body);
  }

  it('hands back an absolute URL that serves the image', async () => {
    const created = await upload(admin, 'icon.png', PNG).expect(201);

    expect(created.body).toMatchObject({
      serverId: 'i5',
      filename: 'icon.png',
      contentType: 'image/png',
      byteSize: PNG.byteLength,
    });
    // Built from PUBLIC_ORIGIN, because that is the address a pack JSON has to
    // carry: the internal path is not the public one.
    expect(created.body.url).toBe(
      `http://localhost:3010/mc/link/api/v1/public/assets/${created.body.id}/icon.png`,
    );

    const served = await request(app.getHttpServer())
      .get(`/api/v1/public/assets/${created.body.id}/icon.png`)
      .expect(200);

    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(served.body)).toEqual(PNG);
  });

  it('serves a 304 to anybody who already has the file', async () => {
    const created = await upload(admin, 'icon.png', PNG).expect(201);
    const first = await request(app.getHttpServer())
      .get(`/api/v1/public/assets/${created.body.id}/icon.png`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/public/assets/${created.body.id}/icon.png`)
      .set('if-none-match', first.headers.etag)
      .expect(304);
  });

  it('keeps the address when the same name is uploaded again', async () => {
    const first = await upload(admin, 'icon.png', PNG).expect(201);
    const second = await upload(admin, 'icon.png', PNG).expect(201);

    // The whole point of replacing rather than adding: a pack JSON already
    // pointing here keeps working and starts serving the new image.
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.url).toBe(first.body.url);

    const assets = await request(app.getHttpServer())
      .get('/api/v1/admin/servers/i5/assets')
      .set('authorization', `Bearer ${admin}`)
      .expect(200);

    expect(assets.body).toHaveLength(1);
    // Metadata only. The bytes are fetched from the public route.
    expect(assets.body[0]).not.toHaveProperty('data');
  });

  it('names the file after what it actually is', async () => {
    const created = await upload(admin, 'background.png', JPEG, 'image/jpeg').expect(201);

    expect(created.body.filename).toBe('background.jpg');
  });

  it('refuses bytes that are not what the request claims', async () => {
    const response = await upload(admin, 'icon.png', JPEG, 'image/png').expect(415);

    expect(response.body.message).toBe('asset_type_mismatch');
    expect(await prisma.serverAsset.count()).toBe(0);
  });

  it('refuses a type it will not serve', async () => {
    // SVG is a document that can carry script, and this is our own origin.
    const response = await upload(admin, 'icon.svg', PNG, 'image/svg+xml').expect(415);

    expect(response.body.message).toBe('unsupported_asset_type');
  });

  it('refuses a file name that is a path', async () => {
    const response = await upload(admin, '../../etc/passwd', PNG).expect(400);

    expect(response.body.message).toBe('invalid_asset_filename');
  });

  it('refuses an upload over the size limit', async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(ASSET_MAX_BYTES, 0)]);

    await upload(admin, 'huge.png', huge).expect(413);
    expect(await prisma.serverAsset.count()).toBe(0);
  });

  it('is closed to anybody who is not an admin', async () => {
    await upload(player, 'icon.png', PNG).expect(403);

    const token = await createApiToken(prisma, { scopes: ['stats:write'] });

    await request(app.getHttpServer())
      .post('/api/v1/admin/servers/i5/assets?filename=icon.png')
      .set('x-api-key', token)
      .set('content-type', 'image/png')
      .send(PNG)
      .expect(403);
  });

  it('deletes only from the server it was asked about', async () => {
    await createServer(prisma, 'i4');
    const created = await upload(admin, 'icon.png', PNG).expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/servers/i4/assets/${created.body.id}`)
      .set('authorization', `Bearer ${admin}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/servers/i5/assets/${created.body.id}`)
      .set('authorization', `Bearer ${admin}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/public/assets/${created.body.id}/icon.png`)
      .expect(404);
  });

  it('goes with the server it belongs to', async () => {
    await upload(admin, 'icon.png', PNG).expect(201);

    await request(app.getHttpServer())
      .delete('/api/v1/admin/servers/i5')
      .set('authorization', `Bearer ${admin}`)
      .expect(204);

    expect(await prisma.serverAsset.count()).toBe(0);
  });

  it('records who uploaded and who deleted', async () => {
    const created = await upload(admin, 'icon.png', PNG).expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/servers/i5/assets/${created.body.id}`)
      .set('authorization', `Bearer ${admin}`)
      .expect(204);

    const actions = await prisma.auditLog.findMany({ select: { action: true } });

    expect(actions.map((row) => row.action)).toEqual(
      expect.arrayContaining(['server_asset_uploaded', 'server_asset_deleted']),
    );
  });
});
