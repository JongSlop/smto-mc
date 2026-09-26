import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import { LinkCodeService } from '../src/linking/code/link-code.service';
import {
  createAccount,
  createApiToken,
  createServer,
  createTestApp,
  resetDatabase,
} from './helpers';

/**
 * Path B end to end, with `curl` standing in for the plugin.
 *
 * The website mints a code and the redeem endpoint consumes it. The Minecraft
 * side of that, the `/link` command, is a separate plugin and not part of this
 * repository, so these tests cover exactly the half that is: the rules around
 * the code, and the uniqueness rules around the link.
 */
describe('in-game linking', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let codes: LinkCodeService;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    codes = app.get(LinkCodeService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await createServer(prisma);
  });

  it('links a profile when a valid code is redeemed', async () => {
    const accountId = await createAccount(prisma);
    const issued = await codes.issue(accountId);
    const token = await createApiToken(prisma, { scopes: ['link:redeem'] });

    const response = await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({ code: issued.code, uuid: NOTCH, username: 'Notch', serverId: 'i5' })
      .expect(200);

    expect(response.body).toMatchObject({
      mcUuid: NOTCH,
      mcUsername: 'Notch',
      verifiedVia: 'INGAME_CODE',
    });

    const link = await prisma.minecraftLink.findFirst({ where: { accountId } });
    expect(link?.unlinkedAt).toBeNull();
  });

  it('accepts the code without its dash and in lower case', async () => {
    const accountId = await createAccount(prisma);
    const issued = await codes.issue(accountId);
    const token = await createApiToken(prisma, { scopes: ['link:redeem'] });

    await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({
        code: issued.code.replace('-', '').toLowerCase(),
        uuid: NOTCH,
        username: 'Notch',
        serverId: 'i5',
      })
      .expect(200);
  });

  it('refuses a code that has already been used', async () => {
    const accountId = await createAccount(prisma);
    const issued = await codes.issue(accountId);
    const token = await createApiToken(prisma, { scopes: ['link:redeem'] });
    const body = { code: issued.code, uuid: NOTCH, username: 'Notch', serverId: 'i5' };

    await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send(body)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send(body)
      .expect(400);

    expect(second.body.message).toBe('invalid_code');
  });

  it('refuses an expired code', async () => {
    const accountId = await createAccount(prisma);
    const issued = await codes.issue(accountId);
    const token = await createApiToken(prisma, { scopes: ['link:redeem'] });

    await prisma.linkCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({ code: issued.code, uuid: NOTCH, username: 'Notch', serverId: 'i5' })
      .expect(400);

    expect(response.body.message).toBe('invalid_code');
  });

  it('refuses a malformed code before it reaches the database', async () => {
    const token = await createApiToken(prisma, { scopes: ['link:redeem'] });

    // I, L, O and U are not in the alphabet, precisely so they cannot be
    // confused with 1, 0 and each other when read off a screen.
    await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({ code: 'IIII-LLLL', uuid: NOTCH, username: 'Notch', serverId: 'i5' })
      .expect(400);
  });

  it('refuses a profile already linked to another account', async () => {
    const first = await createAccount(prisma, 'first');
    const second = await createAccount(prisma, 'second');
    const token = await createApiToken(prisma, { scopes: ['link:redeem'] });

    const firstCode = await codes.issue(first);
    await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({ code: firstCode.code, uuid: NOTCH, username: 'Notch', serverId: 'i5' })
      .expect(200);

    const secondCode = await codes.issue(second);
    const response = await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({ code: secondCode.code, uuid: NOTCH, username: 'Notch', serverId: 'i5' })
      .expect(409);

    expect(response.body.message).toBe('profile_already_linked');
  });

  it('refuses a second profile for an account that already has one', async () => {
    const accountId = await createAccount(prisma);
    const token = await createApiToken(prisma, { scopes: ['link:redeem'] });

    const first = await codes.issue(accountId);
    await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({ code: first.code, uuid: NOTCH, username: 'Notch', serverId: 'i5' })
      .expect(200);

    const second = await codes.issue(accountId);
    const response = await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({
        code: second.code,
        uuid: '853c80ef-3c37-49fd-aa49-938b674adae6',
        username: 'Other',
        serverId: 'i5',
      })
      .expect(409);

    expect(response.body.message).toBe('account_already_linked');
  });

  it('keeps one live code per account, so an older one stops working', async () => {
    const accountId = await createAccount(prisma);
    const stale = await codes.issue(accountId);
    await codes.issue(accountId);
    const token = await createApiToken(prisma, { scopes: ['link:redeem'] });

    await request(app.getHttpServer())
      .post('/api/v1/ingest/link/redeem')
      .set('X-Api-Key', token)
      .send({ code: stale.code, uuid: NOTCH, username: 'Notch', serverId: 'i5' })
      .expect(400);
  });

  describe('lookup', () => {
    it('reports who a UUID belongs to', async () => {
      const accountId = await createAccount(prisma, 'jong');
      const issued = await codes.issue(accountId);
      const redeem = await createApiToken(prisma, { scopes: ['link:redeem'] });

      await request(app.getHttpServer())
        .post('/api/v1/ingest/link/redeem')
        .set('X-Api-Key', redeem)
        .send({ code: issued.code, uuid: NOTCH, username: 'Notch', serverId: 'i5' })
        .expect(200);

      const read = await createApiToken(prisma, { scopes: ['link:read'] });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/ingest/link/${NOTCH}`)
        .set('X-Api-Key', read)
        .expect(200);

      expect(response.body).toEqual({ linked: true, accountId, username: 'jong' });
    });

    it('answers unlinked rather than erroring for a malformed UUID', async () => {
      const read = await createApiToken(prisma, { scopes: ['link:read'] });

      const response = await request(app.getHttpServer())
        .get('/api/v1/ingest/link/not-a-uuid')
        .set('X-Api-Key', read)
        .expect(200);

      expect(response.body.linked).toBe(false);
    });
  });
});
