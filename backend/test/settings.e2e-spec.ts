import { INestApplication } from '@nestjs/common';
import { PLAYER_SETTINGS_LIMIT, SETTING_VALUE_MAX_LENGTH } from '@smto/mc-contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import {
  createApiToken,
  createAccount,
  createServer,
  createSession,
  createTestApp,
  resetDatabase,
} from './helpers';

/**
 * The cross-server use case this exists for, driven as two plugins would: server
 * A writes what a player set, server B reads it back when they join.
 */
describe('/api/v1/ingest/players/:uuid/settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
  const OTHER = '853c80ef-3c37-49fd-aa49-938b674adae6';
  const url = (uuid: string, key?: string) =>
    `/api/v1/ingest/players/${uuid}/settings${key === undefined ? '' : `/${key}`}`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  async function tokens(serverId?: string) {
    return {
      read: await createApiToken(prisma, { scopes: ['settings:read'], serverId }),
      write: await createApiToken(prisma, { scopes: ['settings:write'], serverId }),
    };
  }

  it('carries a setting from one server to another', async () => {
    await createServer(prisma, 'i5');
    await createServer(prisma, 'i4');
    // Pinned tokens on purpose: this is the normal deployment, one per server,
    // and a setting must still cross between them.
    const a = await tokens('i5');
    const b = await tokens('i4');

    await request(app.getHttpServer())
      .put(url(NOTCH, 'nickname'))
      .set('X-Api-Key', a.write)
      .send({ value: 'Sir Notch' })
      .expect(200);

    const read = await request(app.getHttpServer())
      .get(url(NOTCH))
      .set('X-Api-Key', b.read)
      .expect(200);

    expect(read.body).toEqual({ uuid: NOTCH, settings: { nickname: 'Sir Notch' } });
  });

  describe('writing', () => {
    it('creates, then replaces, leaving one row', async () => {
      const { write } = await tokens();

      const first = await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .send({ value: 'one' })
        .expect(200);
      expect(first.body).toMatchObject({ key: 'nickname', value: 'one' });

      const second = await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .send({ value: 'two' })
        .expect(200);
      expect(second.body).toMatchObject({ key: 'nickname', value: 'two' });

      const rows = await prisma.playerSetting.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.value).toBe('two');
    });

    it('stores the value exactly as sent, including empty and padded', async () => {
      const { read, write } = await tokens();

      for (const [key, value] of [
        ['empty', ''],
        ['padded', '  spaced  '],
        ['unicode', 'Grüße \u{1F9F1}'],
      ] as const) {
        await request(app.getHttpServer())
          .put(url(NOTCH, key))
          .set('X-Api-Key', write)
          .send({ value })
          .expect(200);
      }

      const response = await request(app.getHttpServer())
        .get(url(NOTCH))
        .set('X-Api-Key', read)
        .expect(200);

      expect(response.body.settings).toEqual({
        empty: '',
        padded: '  spaced  ',
        unicode: 'Grüße \u{1F9F1}',
      });
    });

    it('normalises the key to lower case and the UUID to dashed', async () => {
      const { read, write } = await tokens();

      await request(app.getHttpServer())
        .put(url(NOTCH.replace(/-/g, '').toUpperCase(), 'Chat.Color'))
        .set('X-Api-Key', write)
        .send({ value: 'red' })
        .expect(200);

      const row = await prisma.playerSetting.findFirstOrThrow();
      expect(row.mcUuid).toBe(NOTCH);
      expect(row.key).toBe('chat.color');

      await request(app.getHttpServer())
        .get(url(NOTCH, 'CHAT.COLOR'))
        .set('X-Api-Key', read)
        .expect(200);
    });

    it('keeps one player settings apart from another', async () => {
      const { read, write } = await tokens();

      await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .send({ value: 'a' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(url(OTHER))
        .set('X-Api-Key', read)
        .expect(200);

      expect(response.body.settings).toEqual({});
    });

    it.each([
      ['a non-string value', { value: 5 }],
      ['a missing value', {}],
      ['a null value', { value: null }],
      ['a value over the length limit', { value: 'x'.repeat(SETTING_VALUE_MAX_LENGTH + 1) }],
    ])('refuses %s', async (_case, body) => {
      const { write } = await tokens();

      await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .send(body)
        .expect(400);

      expect(await prisma.playerSetting.count()).toBe(0);
    });

    it('accepts a value at exactly the length limit', async () => {
      const { write } = await tokens();

      await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .send({ value: 'x'.repeat(SETTING_VALUE_MAX_LENGTH) })
        .expect(200);
    });

    it.each([
      ['a key with a space', 'two%20words'],
      ['a key starting with a dot', '.hidden'],
      ['a key with a slash', 'a%2Fb'],
      ['a key over 64 characters', 'k'.repeat(65)],
    ])('refuses %s', async (_case, key) => {
      const { write } = await tokens();

      const response = await request(app.getHttpServer())
        .put(url(NOTCH, key))
        .set('X-Api-Key', write)
        .send({ value: 'x' })
        .expect(400);

      expect(response.body.error).toBe('validation_failed');
      expect(await prisma.playerSetting.count()).toBe(0);
    });

    it('refuses a UUID that is not one, on a write as well as a read', async () => {
      const { read, write } = await tokens();

      await request(app.getHttpServer())
        .put(url('not-a-uuid', 'nickname'))
        .set('X-Api-Key', write)
        .send({ value: 'x' })
        .expect(400);

      await request(app.getHttpServer()).get(url('not-a-uuid')).set('X-Api-Key', read).expect(400);
    });

    it('stops adding keys at the limit but still lets existing ones change', async () => {
      const { write } = await tokens();

      await prisma.playerSetting.createMany({
        data: Array.from({ length: PLAYER_SETTINGS_LIMIT }, (_, index) => ({
          mcUuid: NOTCH,
          key: `key${index}`,
          value: 'v',
        })),
      });

      const response = await request(app.getHttpServer())
        .put(url(NOTCH, 'one-too-many'))
        .set('X-Api-Key', write)
        .send({ value: 'x' })
        .expect(422);
      expect(response.body.message).toBe('settings_limit_reached');

      await request(app.getHttpServer())
        .put(url(NOTCH, 'key0'))
        .set('X-Api-Key', write)
        .send({ value: 'changed' })
        .expect(200);

      // The limit is per player.
      await request(app.getHttpServer())
        .put(url(OTHER, 'one-too-many'))
        .set('X-Api-Key', write)
        .send({ value: 'x' })
        .expect(200);
    });
  });

  describe('reading', () => {
    it('answers one key with its value and when it changed', async () => {
      const { read, write } = await tokens();

      await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .send({ value: 'Sir Notch' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(url(NOTCH, 'nickname'))
        .set('X-Api-Key', read)
        .expect(200);

      expect(response.body).toMatchObject({ key: 'nickname', value: 'Sir Notch' });
      expect(new Date(response.body.updatedAt).getTime()).not.toBeNaN();
    });

    it('answers 404 setting_not_found for a key that is not set', async () => {
      const { read } = await tokens();

      const response = await request(app.getHttpServer())
        .get(url(NOTCH, 'nickname'))
        .set('X-Api-Key', read)
        .expect(404);

      expect(response.body.message).toBe('setting_not_found');
    });

    it('answers an empty map, not an error, for a player with nothing', async () => {
      const { read } = await tokens();

      const response = await request(app.getHttpServer())
        .get(url(NOTCH))
        .set('X-Api-Key', read)
        .expect(200);

      expect(response.body).toEqual({ uuid: NOTCH, settings: {} });
    });

    it('still has a player settings after they unlink', async () => {
      // Keyed by UUID rather than by account, so settings do not depend on the
      // link at all: they work before one exists and survive its removal.
      const { read, write } = await tokens();

      await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .send({ value: 'kept' })
        .expect(200);

      const accountId = await createAccount(prisma);
      await prisma.minecraftLink.create({
        data: {
          accountId,
          mcUuid: NOTCH,
          mcUsername: 'Notch',
          verifiedVia: 'INGAME_CODE',
          unlinkedAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .get(url(NOTCH))
        .set('X-Api-Key', read)
        .expect(200);

      expect(response.body.settings).toEqual({ nickname: 'kept' });
    });
  });

  describe('deleting', () => {
    it('removes the setting', async () => {
      const { read, write } = await tokens();

      await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .send({ value: 'x' })
        .expect(200);
      await request(app.getHttpServer())
        .delete(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .expect(204);

      await request(app.getHttpServer())
        .get(url(NOTCH, 'nickname'))
        .set('X-Api-Key', read)
        .expect(404);
    });

    it('is a 204 again when there is nothing to remove, so a retry is safe', async () => {
      const { write } = await tokens();

      await request(app.getHttpServer())
        .delete(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .expect(204);
    });

    it('removes only the key it names', async () => {
      const { write } = await tokens();

      for (const key of ['nickname', 'color']) {
        await request(app.getHttpServer())
          .put(url(NOTCH, key))
          .set('X-Api-Key', write)
          .send({ value: 'x' })
          .expect(200);
      }

      await request(app.getHttpServer())
        .delete(url(NOTCH, 'nickname'))
        .set('X-Api-Key', write)
        .expect(204);

      const rows = await prisma.playerSetting.findMany();
      expect(rows.map((row) => row.key)).toEqual(['color']);
    });
  });

  describe('authentication', () => {
    it('refuses every route without credentials', async () => {
      const http = app.getHttpServer();

      await request(http).get(url(NOTCH)).expect(401);
      await request(http).get(url(NOTCH, 'nickname')).expect(401);
      await request(http).put(url(NOTCH, 'nickname')).send({ value: 'x' }).expect(401);
      await request(http).delete(url(NOTCH, 'nickname')).expect(401);
    });

    it('keeps read and write apart', async () => {
      const { read, write } = await tokens();
      const http = app.getHttpServer();

      // A read-only token cannot change anything.
      await request(http)
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', read)
        .send({ value: 'x' })
        .expect(403);
      await request(http).delete(url(NOTCH, 'nickname')).set('X-Api-Key', read).expect(403);

      // And a write-only token cannot read what it wrote.
      await request(http).get(url(NOTCH)).set('X-Api-Key', write).expect(403);
      await request(http).get(url(NOTCH, 'nickname')).set('X-Api-Key', write).expect(403);

      expect(await prisma.playerSetting.count()).toBe(0);
    });

    it('is not opened by the other scopes', async () => {
      const token = await createApiToken(prisma, {
        scopes: ['stats:write', 'link:read', 'link:redeem'],
      });

      await request(app.getHttpServer()).get(url(NOTCH)).set('X-Api-Key', token).expect(403);
      await request(app.getHttpServer())
        .put(url(NOTCH, 'nickname'))
        .set('X-Api-Key', token)
        .send({ value: 'x' })
        .expect(403);
    });

    it('refuses a revoked token', async () => {
      const { read } = await tokens();
      await prisma.apiToken.updateMany({ data: { revokedAt: new Date() } });

      await request(app.getHttpServer()).get(url(NOTCH)).set('X-Api-Key', read).expect(401);
    });

    it('is closed to a browser session, even an admin one', async () => {
      const accountId = await createAccount(prisma, 'boss', ['admin']);
      const session = await createSession(app, prisma, accountId);

      await request(app.getHttpServer())
        .get(url(NOTCH))
        .set('Authorization', `Bearer ${session}`)
        .expect(403);
    });
  });
});
