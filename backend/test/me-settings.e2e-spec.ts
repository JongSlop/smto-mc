import { INestApplication } from '@nestjs/common';
import { NICKNAME_MAX } from '@smto/mc-contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import {
  createAccount,
  createApiToken,
  createSession,
  createTestApp,
  resetDatabase,
} from './helpers';

/**
 * What the website does with a player's settings: list all of them, and edit the
 * two it knows about. Worth pinning is that a browser cannot write anything else,
 * that it needs a link, and that it is the same data the plugins see.
 */
describe('/api/v1/me/settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

  let session: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    session = await signIn(true);
  });

  /** A signed-in player, with or without a live link to NOTCH. */
  async function signIn(linked: boolean, name = 'notch'): Promise<string> {
    const accountId = await createAccount(prisma, name);

    if (linked) {
      await prisma.minecraftLink.create({
        data: { accountId, mcUuid: NOTCH, mcUsername: 'Notch', verifiedVia: 'MSA' },
      });
    }

    return createSession(app, prisma, accountId);
  }

  const get = (token = session) =>
    request(app.getHttpServer()).get('/api/v1/me/settings').set('Authorization', `Bearer ${token}`);

  const put = (key: string, value: string, token = session) =>
    request(app.getHttpServer())
      .put(`/api/v1/me/settings/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value });

  describe('reading', () => {
    it('lists everything stored, whoever wrote it', async () => {
      await prisma.playerSetting.createMany({
        data: [
          { mcUuid: NOTCH, key: 'nickname', value: 'Sir Notch' },
          { mcUuid: NOTCH, key: 'some_mod.state', value: '{"a":1}' },
        ],
      });

      const response = await get().expect(200);

      expect(response.body).toEqual({
        uuid: NOTCH,
        settings: { nickname: 'Sir Notch', 'some_mod.state': '{"a":1}' },
      });
    });

    it('does not show another player their settings', async () => {
      await prisma.playerSetting.create({
        data: { mcUuid: '853c80ef-3c37-49fd-aa49-938b674adae6', key: 'nickname', value: 'secret' },
      });

      const response = await get().expect(200);

      expect(response.body.settings).toEqual({});
    });

    it('is an empty list, not an error, for a player with nothing stored', async () => {
      const response = await get().expect(200);

      expect(response.body.settings).toEqual({});
    });

    it('needs a linked profile, since that is what the settings are found by', async () => {
      const unlinked = await signIn(false, 'nobody');

      const response = await get(unlinked).expect(400);

      expect(response.body.message).toBe('account_not_linked');
    });

    it('needs a session', async () => {
      await request(app.getHttpServer()).get('/api/v1/me/settings').expect(401);
    });

    it('is not reachable with a plugin token, which has no account', async () => {
      const token = await createApiToken(prisma, { scopes: ['settings:read'] });

      await request(app.getHttpServer())
        .get('/api/v1/me/settings')
        .set('X-Api-Key', token)
        .expect(403);
    });
  });

  describe('nickname', () => {
    it('stores it, and a plugin reads the same one', async () => {
      const response = await put('nickname', 'Sir Notch').expect(200);
      expect(response.body).toEqual({ key: 'nickname', value: 'Sir Notch' });

      const token = await createApiToken(prisma, { scopes: ['settings:read'] });
      const read = await request(app.getHttpServer())
        .get(`/api/v1/ingest/players/${NOTCH}/settings/nickname`)
        .set('X-Api-Key', token)
        .expect(200);

      expect(read.body.value).toBe('Sir Notch');
    });

    it('replaces the one a plugin wrote', async () => {
      await prisma.playerSetting.create({
        data: { mcUuid: NOTCH, key: 'nickname', value: 'from the game' },
      });

      await put('nickname', 'from the website').expect(200);

      const rows = await prisma.playerSetting.findMany({ where: { key: 'nickname' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.value).toBe('from the website');
    });

    it('is cleaned up the way a profile message is', async () => {
      const response = await put('nickname', '  Sir \n\t Notch\u202E  ').expect(200);

      expect(response.body.value).toBe('Sir Notch');
    });

    it('drops the section sign, so a name cannot carry Minecraft colour codes', async () => {
      const response = await put('nickname', '\u00A7cRed\u00A7lBold').expect(200);

      expect(response.body.value).toBe('cRedlBold');
      expect(
        (await prisma.playerSetting.findFirstOrThrow({ where: { key: 'nickname' } })).value,
      ).not.toContain('\u00A7');
    });

    it('counts characters a person would count, so an emoji is one', async () => {
      await put('nickname', '\u{1F9F1}'.repeat(NICKNAME_MAX)).expect(200);
      await put('nickname', '\u{1F9F1}'.repeat(NICKNAME_MAX + 1)).expect(400);
    });

    it('refuses one that is too long, and keeps the old one', async () => {
      await put('nickname', 'Short').expect(200);

      const response = await put('nickname', 'x'.repeat(NICKNAME_MAX + 1)).expect(400);

      expect(response.body.error).toBe('validation_failed');
      expect((await prisma.playerSetting.findFirstOrThrow()).value).toBe('Short');
    });

    it.each([
      ['an empty one', ''],
      ['one of only whitespace', '  \n\t '],
      ['only a § sign', '\u00A7'],
    ])('removes the setting for %s, rather than storing an empty one', async (_case, value) => {
      await put('nickname', 'Sir Notch').expect(200);

      const response = await put('nickname', value).expect(200);

      expect(response.body).toEqual({ key: 'nickname', value: null });
      expect(await prisma.playerSetting.count()).toBe(0);
    });

    it('is fine to remove when there was none', async () => {
      await put('nickname', '').expect(200);
    });

    it('needs a linked profile', async () => {
      const unlinked = await signIn(false, 'nobody');

      const response = await put('nickname', 'Nobody', unlinked).expect(400);

      expect(response.body.message).toBe('account_not_linked');
      expect(await prisma.playerSetting.count()).toBe(0);
    });
  });

  describe('preferred_language', () => {
    it.each(['en', 'de'])('stores %s', async (language) => {
      const response = await put('preferred_language', language).expect(200);

      expect(response.body).toEqual({ key: 'preferred_language', value: language });
    });

    it('changes it when the language changes', async () => {
      await put('preferred_language', 'en').expect(200);
      await put('preferred_language', 'de').expect(200);

      const rows = await prisma.playerSetting.findMany({ where: { key: 'preferred_language' } });
      expect(rows.map((row) => row.value)).toEqual(['de']);
    });

    it.each(['fr', 'EN', 'en_us', '', 'de '])(
      'refuses %j, which is not a language the website has',
      async (language) => {
        await put('preferred_language', language).expect(400);

        expect(await prisma.playerSetting.count()).toBe(0);
      },
    );

    it('is not cleared by an empty value, since there is no such thing as no language', async () => {
      await put('preferred_language', 'de').expect(200);
      await put('preferred_language', '').expect(400);

      expect((await prisma.playerSetting.findFirstOrThrow()).value).toBe('de');
    });
  });

  describe('keys a browser may not write', () => {
    it.each(['some_mod.state', 'anything-else', 'preferred_languages'])(
      'refuses %s',
      async (key) => {
        const response = await put(key, 'x').expect(403);

        expect(response.body.message).toBe('setting_not_editable');
        expect(await prisma.playerSetting.count()).toBe(0);
      },
    );

    it('does not let it overwrite a value a mod wrote', async () => {
      await prisma.playerSetting.create({
        data: { mcUuid: NOTCH, key: 'some_mod.state', value: 'precious' },
      });

      await put('some_mod.state', 'clobbered').expect(403);

      expect((await prisma.playerSetting.findFirstOrThrow()).value).toBe('precious');
    });

    it('says so before it says anything about the link', async () => {
      const unlinked = await signIn(false, 'nobody');

      const response = await put('some_mod.state', 'x', unlinked).expect(403);

      expect(response.body.message).toBe('setting_not_editable');
    });

    it('cannot be used to delete one either', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/me/settings/nickname')
        .set('Authorization', `Bearer ${session}`)
        .expect(404);
    });
  });

  describe('authentication', () => {
    it('needs a session to write', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/me/settings/nickname')
        .send({ value: 'x' })
        .expect(401);
    });

    it('is not reachable with a plugin token, which has no account', async () => {
      const token = await createApiToken(prisma, { scopes: ['settings:write'] });

      await request(app.getHttpServer())
        .put('/api/v1/me/settings/nickname')
        .set('X-Api-Key', token)
        .send({ value: 'x' })
        .expect(403);
    });
  });
});
