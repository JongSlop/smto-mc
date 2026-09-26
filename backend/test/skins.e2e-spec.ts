import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import { SkinsService } from '../src/skins/skins.service';
import { createTestApp, resetDatabase } from './helpers';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * These exist because of a bug that nothing else would have caught. Returning a
 * Buffer from a Nest controller looks correct, typechecks, and sends
 * `{"type":"Buffer","data":[137,80,...]}` under an `image/png` header. The
 * status was 200 and the content type was right; only the bytes were wrong.
 * Asserting on the PNG magic number is the assertion that would have failed.
 *
 * Mojang is stubbed. The point here is the response encoding, not their uptime.
 */
describe('GET /api/v1/public/skins', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    const skins = app.get(SkinsService);
    const fake = Buffer.concat([PNG_MAGIC, Buffer.alloc(64, 1)]);

    skins.skin = async () => ({ png: fake, slim: false });
    skins.cape = async (uuid: string) => (uuid === NOTCH ? fake : null);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('returns actual PNG bytes rather than a serialised Buffer', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/skins/${NOTCH}.png`)
      .expect(200)
      .expect('content-type', 'image/png');

    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('reports the model in a header, which the image cannot carry', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/public/skins/${NOTCH}.png`)
      .expect('x-skin-model', 'classic')
      .expect('cache-control', 'public, max-age=3600');
  });

  it('accepts an undashed UUID in the path', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/public/skins/${NOTCH.replace(/-/g, '')}.png`)
      .expect(200);
  });

  it('answers 404 for something that is not a UUID', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/skins/not-a-uuid.png').expect(404);
  });

  it('serves a cape as PNG bytes, and 404s when there is none', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/public/skins/${NOTCH}/cape.png`)
      .expect(200)
      .expect('content-type', 'image/png');

    expect(response.body.subarray(0, 8)).toEqual(PNG_MAGIC);

    await request(app.getHttpServer())
      .get('/api/v1/public/skins/853c80ef-3c37-49fd-aa49-938b674adae6/cape.png')
      .expect(404);
  });

  it('needs no credentials at all', async () => {
    // The dashboard renders this in an <img> and on a canvas, so it has to work
    // without the session cookie travelling with the request.
    await request(app.getHttpServer()).get(`/api/v1/public/skins/${NOTCH}.png`).expect(200);
  });
});
