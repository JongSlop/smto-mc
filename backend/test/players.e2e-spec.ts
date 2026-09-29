import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import { PlayerNamesService } from '../src/names/player-names.service';
import {
  createAccount,
  createApiToken,
  createServer,
  createSession,
  createTestApp,
  fakeNames,
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
  const DINNERBONE = '61699b2e-d327-4a01-9f1e-0ea8c3f06bc6';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder.overrideProvider(PlayerNamesService).useValue(fakeNames),
    ));
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
      'linked',
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

  it('marks a linked player as linked', async () => {
    await link('notch', NOTCH);

    const response = await get(`/api/v1/players/${NOTCH}`).expect(200);

    expect(response.body).toMatchObject({ linked: true, mcUsername: 'notch' });
  });

  describe('a player who never linked', () => {
    it('has a page with the name Mojang has, no link date and no message', async () => {
      await record(DINNERBONE, 'i5', 'playtime_seconds', 3600n);
      await record(DINNERBONE, 'i5', 'deaths', 2n);

      const response = await get(`/api/v1/players/${DINNERBONE}`).expect(200);

      expect(response.body).toMatchObject({
        mcUuid: DINNERBONE,
        mcUsername: 'Dinnerbone',
        linked: false,
        linkedSince: null,
        message: null,
        stats: { totalPlaytimeSeconds: 3600, totals: { playtime_seconds: 3600, deaths: 2 } },
      });
    });

    it('shows the start of the UUID when no name can be found', async () => {
      await record(JEB, 'i5', 'playtime_seconds', 60n);

      const response = await get(`/api/v1/players/${JEB}`).expect(200);

      expect(response.body.mcUsername).toBe('853c80ef');
    });

    it('has no page until something has been recorded for them', async () => {
      // Never seen, and seen with nothing but zeros. Both are a 404, so the
      // page cannot be used to ask whether a UUID has ever played here.
      await get(`/api/v1/players/${DINNERBONE}`).expect(404);

      await record(DINNERBONE, 'i5', 'playtime_seconds', 0n);
      await get(`/api/v1/players/${DINNERBONE}`).expect(404);
    });

    it('leaves a hidden server off their page as it does for everybody', async () => {
      await createServer(prisma, 'secret', { isPublic: false });
      await record(DINNERBONE, 'secret', 'playtime_seconds', 9000n);

      await get(`/api/v1/players/${DINNERBONE}`).expect(404);
    });
  });

  it('keeps a page after unlinking, shown as not linked, with the statistics still on it', async () => {
    // Unlinking detaches a profile from an account. It takes nothing off the
    // network, so the numbers stay and only the kind of page changes.
    await link('dinnerbone', DINNERBONE, true);
    await record(DINNERBONE, 'i5', 'playtime_seconds', 1000n);

    const response = await get(`/api/v1/players/${DINNERBONE}`).expect(200);

    expect(response.body).toMatchObject({
      mcUsername: 'Dinnerbone',
      linked: false,
      linkedSince: null,
      message: null,
      stats: { totalPlaytimeSeconds: 1000 },
    });
  });

  it('has no page for somebody who unlinked and has nothing recorded', async () => {
    await link('jeb', JEB, true);

    const response = await get(`/api/v1/players/${JEB}`).expect(404);

    expect(response.body.message).toBe('profile_not_found');
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
