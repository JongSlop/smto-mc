import { INestApplication } from '@nestjs/common';
import { METRIC_KINDS_BY_KEY } from '@smto/mc-contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import { createServer, createTestApp, resetDatabase } from './helpers';

/**
 * A server's numbers, added up across everybody who has played on it.
 *
 * Public, so the checks that matter are the ones about what goes into the sum:
 * every player, counters only, no zeros, and nothing from another server.
 */
describe('GET /api/v1/public/servers/:id/stats', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
  const JEB = '853c80ef-3c37-49fd-aa49-938b674adae6';
  const DINNERBONE = '61699b2e-d327-4a01-9f1e-0ea8c3f06bc6';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await createServer(prisma, 'i5');
    await createServer(prisma, 'i4');
  });

  async function record(uuid: string, serverId: string, metric: string, value: bigint) {
    await prisma.playerMetric.create({
      data: { mcUuid: uuid, serverId, metric, valueNum: value, recordedAt: new Date() },
    });
  }

  function stats(id = 'i5') {
    return request(app.getHttpServer()).get(`/api/v1/public/servers/${id}/stats`);
  }

  it('adds up every player, and says how many there are', async () => {
    await record(NOTCH, 'i5', 'playtime_seconds', 3000n);
    await record(JEB, 'i5', 'playtime_seconds', 5000n);
    await record(NOTCH, 'i5', 'deaths', 4n);
    await record(JEB, 'i5', 'deaths', 1n);

    const response = await stats().expect(200);

    expect(response.body).toEqual({
      serverId: 'i5',
      players: 2,
      totals: { playtime_seconds: 8000, deaths: 5 },
    });
  });

  it('needs no credential at all', async () => {
    await record(NOTCH, 'i5', 'playtime_seconds', 3000n);

    // No session and no token: the numbers name nobody.
    await stats().expect(200);
  });

  it('counts players who never linked, since a total names nobody', async () => {
    // No link row exists for either of these UUIDs.
    await record(NOTCH, 'i5', 'playtime_seconds', 100n);
    await record(DINNERBONE, 'i5', 'playtime_seconds', 200n);

    const response = await stats().expect(200);

    expect(response.body.players).toBe(2);
    expect(response.body.totals.playtime_seconds).toBe(300);
  });

  it('counts only this server', async () => {
    await record(NOTCH, 'i5', 'playtime_seconds', 3000n);
    await record(NOTCH, 'i4', 'playtime_seconds', 9000n);
    await record(JEB, 'i4', 'playtime_seconds', 1000n);

    const response = await stats('i5').expect(200);

    expect(response.body).toEqual({
      serverId: 'i5',
      players: 1,
      totals: { playtime_seconds: 3000 },
    });
  });

  it('does not count a player who has only zeros, and leaves zero metrics out', async () => {
    await record(NOTCH, 'i5', 'playtime_seconds', 3000n);
    await record(NOTCH, 'i5', 'deaths', 0n);
    await record(JEB, 'i5', 'playtime_seconds', 0n);

    const response = await stats().expect(200);

    expect(response.body).toEqual({
      serverId: 'i5',
      players: 1,
      totals: { playtime_seconds: 3000 },
    });
  });

  it('leaves gauges out, because adding up snapshots describes nothing', async () => {
    // No gauge is registered yet, so make one for the length of this test.
    const kinds = METRIC_KINDS_BY_KEY as Record<string, string>;
    kinds.xp_level = 'gauge';

    try {
      await record(NOTCH, 'i5', 'playtime_seconds', 100n);
      await record(NOTCH, 'i5', 'xp_level', 30n);
      await record(JEB, 'i5', 'xp_level', 12n);

      const response = await stats().expect(200);

      expect(response.body.totals).toEqual({ playtime_seconds: 100 });
    } finally {
      delete kinds.xp_level;
    }
  });

  it('sums past what a 32 bit integer holds', async () => {
    await record(NOTCH, 'i5', 'blocks_mined', 2_000_000_000n);
    await record(JEB, 'i5', 'blocks_mined', 2_000_000_000n);

    const response = await stats().expect(200);

    expect(response.body.totals.blocks_mined).toBe(4_000_000_000);
  });

  it('is an honest zero for a server nobody has played', async () => {
    const response = await stats().expect(200);

    expect(response.body).toEqual({ serverId: 'i5', players: 0, totals: {} });
  });

  it('may be cached for a minute', async () => {
    const response = await stats().expect(200);

    expect(response.headers['cache-control']).toBe('public, max-age=60');
  });

  it('answers a hidden server and an unknown one the same way', async () => {
    await createServer(prisma, 'secret', { isPublic: false });
    await record(NOTCH, 'secret', 'playtime_seconds', 9000n);

    for (const id of ['secret', 'nope']) {
      const response = await stats(id).expect(404);

      expect(response.body.message).toBe('server_not_found');
    }
  });
});
