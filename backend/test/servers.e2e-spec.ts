import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import { createServer, createTestApp, resetDatabase } from './helpers';

describe('GET /api/v1/public/servers', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it('is readable with no credentials at all', async () => {
    await createServer(prisma, 'i5');

    const response = await request(app.getHttpServer()).get('/api/v1/public/servers').expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ id: 'i5', state: 'ONGOING', isPublic: true });
  });

  it('leaves hidden servers out of the list', async () => {
    await createServer(prisma, 'i5');
    await createServer(prisma, 'g6', { isPublic: false });

    const response = await request(app.getHttpServer()).get('/api/v1/public/servers').expect(200);

    expect(response.body.map((server: { id: string }) => server.id)).toEqual(['i5']);
  });

  it('answers 404 for a hidden server, the same as for one that does not exist', async () => {
    await createServer(prisma, 'g6', { isPublic: false });

    // Telling the two apart would confirm that an unannounced server exists,
    // which is the one thing hiding it is meant to prevent.
    const hidden = await request(app.getHttpServer()).get('/api/v1/public/servers/g6').expect(404);
    const missing = await request(app.getHttpServer()).get('/api/v1/public/servers/x9').expect(404);

    expect(hidden.body.message).toBe(missing.body.message);
  });

  it('orders by sortOrder and then by id, so the order is total', async () => {
    await prisma.server.createMany({
      data: [
        { id: 'b', name: 'B', state: 'ONGOING', sortOrder: 10 },
        { id: 'a', name: 'A', state: 'ONGOING', sortOrder: 10 },
        { id: 'c', name: 'C', state: 'ARCHIVED', sortOrder: 5 },
      ],
    });

    const response = await request(app.getHttpServer()).get('/api/v1/public/servers').expect(200);

    expect(response.body.map((server: { id: string }) => server.id)).toEqual(['c', 'a', 'b']);
  });

  it('hands back the extra object untouched', async () => {
    await prisma.server.create({
      data: {
        id: 'i5',
        name: 'Laced Pack',
        state: 'ONGOING',
        extra: { ip: 'i5.smto.dev', game: { loader: 'FABRIC' } },
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/public/servers/i5')
      .expect(200);

    expect(response.body.extra).toEqual({ ip: 'i5.smto.dev', game: { loader: 'FABRIC' } });
  });

  it('keeps the admin routes closed to anonymous callers', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/servers').expect(401);
  });
});
