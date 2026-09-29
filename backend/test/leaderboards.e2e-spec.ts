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
 * The boards on the leaderboard page.
 *
 * What is worth pinning here is the shape of the ranking rather than the SQL:
 * summed across servers, linked profiles only, zeros left off, and one board
 * per featured metric in the order they are featured.
 */
describe('GET /api/v1/leaderboards', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  /** A linked player with metrics, which is the only kind a board can show. */
  async function player(
    username: string,
    uuid: string,
    metrics: [string, string, bigint][],
  ): Promise<void> {
    const accountId = await createAccount(prisma, username);

    await prisma.minecraftLink.create({
      data: {
        accountId,
        mcUuid: uuid,
        mcUsername: username,
        verifiedVia: 'INGAME_CODE',
        verifiedAt: new Date(),
      },
    });

    for (const [serverId, metric, valueNum] of metrics) {
      await prisma.playerMetric.create({
        data: { mcUuid: uuid, serverId, metric, valueNum, recordedAt: new Date() },
      });
    }
  }

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
  const JEB = '853c80ef-3c37-49fd-aa49-938b674adae6';
  const DINNERBONE = '61699b2e-d327-4a01-9f1e-0ea8c3f06bc6';

  it('ranks by the total across every server', async () => {
    // Second on either server alone, first once both are counted.
    await player('notch', NOTCH, [
      ['i5', 'playtime_seconds', 3000n],
      ['i4', 'playtime_seconds', 3000n],
    ]);
    await player('jeb', JEB, [['i5', 'playtime_seconds', 5000n]]);

    const session = await createSession(app, prisma, await createAccount(prisma, 'viewer'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/leaderboards')
      .set('authorization', `Bearer ${session}`)
      .expect(200);

    const playtime = response.body.boards.find(
      (board: { metric: string }) => board.metric === 'playtime_seconds',
    );

    expect(playtime.entries).toEqual([
      { rank: 1, mcUuid: NOTCH, mcUsername: 'notch', linked: true, value: 6000 },
      { rank: 2, mcUuid: JEB, mcUsername: 'jeb', linked: true, value: 5000 },
    ]);
  });

  it('leaves off zeros, and metrics nobody has moved', async () => {
    await player('notch', NOTCH, [
      ['i5', 'playtime_seconds', 900n],
      // Recorded, never moved. Nobody is on a board for that.
      ['i5', 'deaths', 0n],
    ]);

    const session = await createSession(app, prisma, await createAccount(prisma, 'viewer'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/leaderboards')
      .set('authorization', `Bearer ${session}`)
      .expect(200);

    expect(response.body.boards).toEqual([
      {
        metric: 'playtime_seconds',
        entries: [{ rank: 1, mcUuid: NOTCH, mcUsername: 'notch', linked: true, value: 900 }],
      },
    ]);
  });

  describe('players who never linked', () => {
    async function board() {
      const session = await createSession(app, prisma, await createAccount(prisma, 'viewer'));

      const response = await request(app.getHttpServer())
        .get('/api/v1/leaderboards')
        .set('authorization', `Bearer ${session}`)
        .expect(200);

      return response.body.boards[0].entries as {
        rank: number;
        mcUuid: string;
        mcUsername: string;
        linked: boolean;
        value: number;
      }[];
    }

    async function record(uuid: string, value: bigint) {
      await prisma.playerMetric.create({
        data: {
          mcUuid: uuid,
          serverId: 'i5',
          metric: 'playtime_seconds',
          valueNum: value,
          recordedAt: new Date(),
        },
      });
    }

    it('are ranked with everybody else, under the name Mojang has, and marked as not linked', async () => {
      await player('notch', NOTCH, [['i5', 'playtime_seconds', 900n]]);
      await record(DINNERBONE, 999_999n);

      expect(await board()).toEqual([
        { rank: 1, mcUuid: DINNERBONE, mcUsername: 'Dinnerbone', linked: false, value: 999_999 },
        { rank: 2, mcUuid: NOTCH, mcUsername: 'notch', linked: true, value: 900 },
      ]);
    });

    it('show a linked name as it was linked, whatever Mojang says', async () => {
      // The fake knows NOTCH as something else. The name they linked under wins.
      await player('notch', NOTCH, [['i5', 'playtime_seconds', 900n]]);

      const [entry] = await board();

      expect(entry.mcUsername).toBe('notch');
    });

    it('fall back to the start of the UUID when no name can be found', async () => {
      // The fake, like Mojang for an offline-mode UUID, has nothing for this one.
      await record(JEB, 500n);

      const [entry] = await board();

      expect(entry).toMatchObject({ mcUsername: '853c80ef', linked: false });
    });

    it('still show after unlinking, as not linked, under the name Mojang has', async () => {
      await player('notch', NOTCH, [['i5', 'playtime_seconds', 900n]]);
      await record(DINNERBONE, 999_999n);

      // Linked once, unlinked since. Unlinking detaches the profile from the
      // account and takes nobody's statistics off the network.
      await prisma.minecraftLink.create({
        data: {
          accountId: await createAccount(prisma, 'dinner'),
          mcUuid: DINNERBONE,
          mcUsername: 'OldLinkedName',
          verifiedVia: 'MSA',
          verifiedAt: new Date(),
          unlinkedAt: new Date(),
        },
      });

      expect(await board()).toEqual([
        { rank: 1, mcUuid: DINNERBONE, mcUsername: 'Dinnerbone', linked: false, value: 999_999 },
        { rank: 2, mcUuid: NOTCH, mcUsername: 'notch', linked: true, value: 900 },
      ]);
    });

    it('break ties by name for linked players and by UUID after that', async () => {
      await record(DINNERBONE, 100n);
      await record(JEB, 100n);
      await player('notch', NOTCH, [['i5', 'playtime_seconds', 100n]]);

      // Named ones first, the rest in a fixed order that does not depend on the
      // name a lookup happened to return.
      expect((await board()).map((entry) => entry.mcUuid)).toEqual([NOTCH, DINNERBONE, JEB]);
    });
  });

  it('does not count a hidden server, so a board agrees with the profile beside it', async () => {
    await createServer(prisma, 'secret', { isPublic: false });
    await player('notch', NOTCH, [
      ['i5', 'playtime_seconds', 1000n],
      ['secret', 'playtime_seconds', 9000n],
    ]);
    // Only ever on the hidden server, so there is nothing of theirs to rank.
    await player('jeb', JEB, [['secret', 'playtime_seconds', 5000n]]);

    const session = await createSession(app, prisma, await createAccount(prisma, 'viewer'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/leaderboards')
      .set('authorization', `Bearer ${session}`)
      .expect(200);

    expect(response.body.boards[0].entries).toEqual([
      { rank: 1, mcUuid: NOTCH, mcUsername: 'notch', linked: true, value: 1000 },
    ]);
  });

  describe('narrowed to one server', () => {
    async function ask(query: string, status = 200) {
      const session = await createSession(app, prisma, await createAccount(prisma, 'viewer'));

      return request(app.getHttpServer())
        .get(`/api/v1/leaderboards${query}`)
        .set('authorization', `Bearer ${session}`)
        .expect(status);
    }

    it('ranks by what was recorded there and nowhere else', async () => {
      // First on the network, second on i5 alone.
      await player('notch', NOTCH, [
        ['i5', 'playtime_seconds', 3000n],
        ['i4', 'playtime_seconds', 3000n],
      ]);
      await player('jeb', JEB, [['i5', 'playtime_seconds', 5000n]]);

      const onI5 = await ask('?server=i5');
      const onI4 = await ask('?server=i4');

      expect(onI5.body.server).toBe('i5');
      expect(onI5.body.boards[0].entries).toEqual([
        { rank: 1, mcUuid: JEB, mcUsername: 'jeb', linked: true, value: 5000 },
        { rank: 2, mcUuid: NOTCH, mcUsername: 'notch', linked: true, value: 3000 },
      ]);
      expect(onI4.body.boards[0].entries).toEqual([
        { rank: 1, mcUuid: NOTCH, mcUsername: 'notch', linked: true, value: 3000 },
      ]);
    });

    it('reports no server for the whole network', async () => {
      const response = await ask('');

      expect(response.body.server).toBeNull();
    });

    it('offers the servers that have somebody on a board, whichever one is open', async () => {
      await createServer(prisma, 'empty');
      await createServer(prisma, 'secret', { isPublic: false });
      await createServer(prisma, 'ghosts');
      await player('notch', NOTCH, [
        ['i5', 'playtime_seconds', 3000n],
        ['i4', 'deaths', 2n],
        ['secret', 'playtime_seconds', 9000n],
        // Recorded and never moved, so it would not put anybody on a board.
        ['empty', 'playtime_seconds', 0n],
      ]);
      // A player nobody has linked is on a board now, so their server counts.
      await prisma.playerMetric.create({
        data: {
          mcUuid: DINNERBONE,
          serverId: 'ghosts',
          metric: 'playtime_seconds',
          valueNum: 500n,
          recordedAt: new Date(),
        },
      });

      // Only somebody who linked and unlinked has played here. They are on the
      // boards, so the server is offered.
      await createServer(prisma, 'gone');
      await prisma.minecraftLink.create({
        data: {
          accountId: await createAccount(prisma, 'former'),
          mcUuid: JEB,
          mcUsername: 'former',
          verifiedVia: 'MSA',
          verifiedAt: new Date(),
          unlinkedAt: new Date(),
        },
      });
      await prisma.playerMetric.create({
        data: {
          mcUuid: JEB,
          serverId: 'gone',
          metric: 'playtime_seconds',
          valueNum: 700n,
          recordedAt: new Date(),
        },
      });

      const everywhere = await ask('');
      const narrowed = await ask('?server=i4');

      const ids = (body: { servers: { id: string }[] }) => body.servers.map((s) => s.id);

      expect(ids(everywhere.body)).toEqual(['ghosts', 'gone', 'i4', 'i5']);
      expect(ids(narrowed.body)).toEqual(['ghosts', 'gone', 'i4', 'i5']);
      expect(everywhere.body.servers[2]).toEqual({
        id: 'i4',
        name: 'Test i4',
        iconUrl: null,
        state: 'ONGOING',
      });
    });

    it('answers a hidden, unknown or malformed server the same way', async () => {
      await createServer(prisma, 'secret', { isPublic: false });
      await player('notch', NOTCH, [['secret', 'playtime_seconds', 9000n]]);

      for (const query of ['?server=secret', '?server=nope', '?server=NOT%20AN%20ID']) {
        const response = await ask(query, 404);

        expect(response.body.message).toBe('server_not_found');
      }
    });

    it('returns no boards for a public server nobody has played, rather than failing', async () => {
      await createServer(prisma, 'fresh');

      const response = await ask('?server=fresh');

      expect(response.body).toEqual({ server: 'fresh', servers: [], boards: [] });
    });
  });

  it('keeps the boards in the order the metrics are featured', async () => {
    await player('notch', NOTCH, [
      ['i5', 'items_crafted', 40n],
      ['i5', 'deaths', 3n],
      ['i5', 'playtime_seconds', 900n],
    ]);

    const session = await createSession(app, prisma, await createAccount(prisma, 'viewer'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/leaderboards')
      .set('authorization', `Bearer ${session}`)
      .expect(200);

    expect(response.body.boards.map((board: { metric: string }) => board.metric)).toEqual([
      'playtime_seconds',
      'deaths',
      'items_crafted',
    ]);
  });

  it('answers a plugin token too, so a server can run its own /top', async () => {
    await player('notch', NOTCH, [['i5', 'playtime_seconds', 900n]]);
    const token = await createApiToken(prisma, { scopes: ['stats:write'] });

    await request(app.getHttpServer())
      .get('/api/v1/leaderboards')
      .set('x-api-key', token)
      .expect(200);
  });

  it('is closed to anybody with no credential at all', async () => {
    await request(app.getHttpServer()).get('/api/v1/leaderboards').expect(401);
  });
});
