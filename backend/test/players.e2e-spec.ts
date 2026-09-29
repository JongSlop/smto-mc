import { INestApplication } from '@nestjs/common';
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

/**
 * The page behind a leaderboard row.
 *
 * What matters here is who can see a page and what is on it: linked profiles
 * only, public servers only, and a session or plugin token to ask.
 */
describe('GET /api/v1/players/:uuid', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let session: string;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
  const JEB = '853c80ef-3c37-49fd-aa49-938b674adae6';

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
    session = await createSession(app, prisma, await createAccount(prisma, 'viewer'));
  });

  async function link(username: string, uuid: string, unlinked = false): Promise<void> {
    await prisma.minecraftLink.create({
      data: {
        accountId: await createAccount(prisma, username),
        mcUuid: uuid,
        mcUsername: username,
        verifiedVia: 'MSA',
        verifiedAt: new Date('2026-01-02T03:04:05.000Z'),
        unlinkedAt: unlinked ? new Date() : null,
      },
    });
  }

  async function record(uuid: string, serverId: string, metric: string, value: bigint) {
    await prisma.playerMetric.create({
      data: { mcUuid: uuid, serverId, metric, valueNum: value, recordedAt: new Date() },
    });
  }

  function get(path: string) {
    return request(app.getHttpServer()).get(path).set('authorization', `Bearer ${session}`);
  }

  it('returns one entry per server and the counters summed across them', async () => {
    await link('notch', NOTCH);
    await record(NOTCH, 'i5', 'playtime_seconds', 3000n);
    await record(NOTCH, 'i5', 'deaths', 4n);
    await record(NOTCH, 'i4', 'playtime_seconds', 600n);

    const response = await get(`/api/v1/players/${NOTCH}`).expect(200);

    expect(response.body).toMatchObject({
      mcUuid: NOTCH,
      mcUsername: 'notch',
      linkedSince: '2026-01-02T03:04:05.000Z',
      stats: {
        totalPlaytimeSeconds: 3600,
        totals: { playtime_seconds: 3600, deaths: 4 },
      },
    });
    expect(response.body.stats.servers.map((s: { serverId: string }) => s.serverId)).toEqual([
      'i4',
      'i5',
    ]);
  });

  it('says nothing about the account behind the profile', async () => {
    await link('notch', NOTCH);

    const response = await get(`/api/v1/players/${NOTCH}`).expect(200);

    expect(Object.keys(response.body).sort()).toEqual([
      'linkedSince',
      'mcUsername',
      'mcUuid',
      'message',
      'stats',
    ]);
  });

  it('accepts the undashed spelling of a UUID', async () => {
    await link('notch', NOTCH);

    await get(`/api/v1/players/${NOTCH.replaceAll('-', '')}`).expect(200);
  });

  it('leaves a hidden server off the page and out of the totals', async () => {
    await createServer(prisma, 'secret', { isPublic: false });
    await link('notch', NOTCH);
    await record(NOTCH, 'i5', 'playtime_seconds', 1000n);
    await record(NOTCH, 'secret', 'playtime_seconds', 9000n);

    const response = await get(`/api/v1/players/${NOTCH}`).expect(200);

    expect(response.body.stats.totalPlaytimeSeconds).toBe(1000);
    expect(response.body.stats.totals.playtime_seconds).toBe(1000);
    expect(response.body.stats.servers).toHaveLength(1);
  });

  it('has no page for a profile that was never linked, or has been unlinked', async () => {
    await link('jeb', JEB, true);
    await record(JEB, 'i5', 'playtime_seconds', 1000n);
    await record(NOTCH, 'i5', 'playtime_seconds', 1000n);

    // Both get the same answer, so the difference is not something to probe for.
    const unlinked = await get(`/api/v1/players/${JEB}`).expect(404);
    const unknown = await get(`/api/v1/players/${NOTCH}`).expect(404);

    expect(unlinked.body.message).toBe('profile_not_found');
    expect(unknown.body.message).toBe('profile_not_found');
  });

  it('treats something that is not a UUID as not found', async () => {
    await get('/api/v1/players/notch').expect(404);
  });

  it('shows a linked player with nothing recorded yet as an empty page', async () => {
    await link('notch', NOTCH);

    const response = await get(`/api/v1/players/${NOTCH}`).expect(200);

    expect(response.body.stats).toEqual({ totalPlaytimeSeconds: 0, totals: {}, servers: [] });
  });

  it('answers a plugin token', async () => {
    await link('notch', NOTCH);
    const token = await createApiToken(prisma, { scopes: ['stats:write'] });

    await request(app.getHttpServer())
      .get(`/api/v1/players/${NOTCH}`)
      .set('x-api-key', token)
      .expect(200);
  });

  it('is closed to anybody with no credential at all', async () => {
    await link('notch', NOTCH);

    await request(app.getHttpServer()).get(`/api/v1/players/${NOTCH}`).expect(401);
  });
});
