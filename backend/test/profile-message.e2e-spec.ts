import { INestApplication } from '@nestjs/common';
import { ADMIN_ROLE, PROFILE_MESSAGE_MAX } from '@smto/mc-contracts';
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
 * The speech bubble on a player's page.
 *
 * What is worth pinning: only the owner can write it, what is stored is what is
 * shown, it disappears with the page, and an admin can take it down and leaves
 * a record of what it said.
 */
describe('profile message', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

  let ownerId: string;
  let owner: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await createServer(prisma, 'i5');

    ownerId = await createAccount(prisma, 'notch');
    owner = await createSession(app, prisma, ownerId);

    await prisma.minecraftLink.create({
      data: {
        accountId: ownerId,
        mcUuid: NOTCH,
        mcUsername: 'Notch',
        verifiedVia: 'MSA',
        verifiedAt: new Date(),
      },
    });
  });

  function put(body: unknown, session = owner) {
    return request(app.getHttpServer())
      .put('/api/v1/me/message')
      .set('authorization', `Bearer ${session}`)
      .send(body as object);
  }

  async function seenBy(session: string) {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/players/${NOTCH}`)
      .set('authorization', `Bearer ${session}`)
      .expect(200);

    return response.body.message as string | null;
  }

  async function viewer(): Promise<string> {
    return createSession(app, prisma, await createAccount(prisma, 'viewer'));
  }

  it('shows nothing until somebody has said something', async () => {
    expect(await seenBy(await viewer())).toBeNull();
  });

  it('stores what the owner writes and shows it to other players', async () => {
    const response = await put({ message: 'Come and see my farm' }).expect(200);

    expect(response.body).toEqual({ message: 'Come and see my farm' });
    expect(await seenBy(await viewer())).toBe('Come and see my farm');
  });

  it('replaces the previous message rather than adding to it', async () => {
    await put({ message: 'first' }).expect(200);
    await put({ message: 'second' }).expect(200);

    expect(await seenBy(await viewer())).toBe('second');
  });

  it('removes the bubble for an empty message, whitespace, or null', async () => {
    for (const cleared of ['', '   \n\t ', null]) {
      await put({ message: 'hello' }).expect(200);
      const response = await put({ message: cleared }).expect(200);

      expect(response.body).toEqual({ message: null });
      expect(await seenBy(await viewer())).toBeNull();
    }
  });

  it('stores it as one clean line', async () => {
    // Newlines and tabs become spaces, runs collapse, and the invisible
    // characters that can reverse a line or pad a message with nothing go.
    const response = await put({
      message: '  hello\n\n\tthere\u202E   \u200Bfriend  ',
    }).expect(200);

    expect(response.body.message).toBe('hello there friend');
  });

  it('keeps an emoji sequence that is held together by a joiner', async () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';

    const response = await put({ message: `hi ${family}` }).expect(200);

    expect(response.body.message).toBe(`hi ${family}`);
  });

  it('counts characters a person would count, not UTF-16 units', async () => {
    const exactly = '\u{1F600}'.repeat(PROFILE_MESSAGE_MAX);

    await put({ message: exactly }).expect(200);
    await put({ message: `${exactly}!` }).expect(400);
  });

  it('refuses a message that is too long', async () => {
    await put({ message: 'x'.repeat(PROFILE_MESSAGE_MAX + 1) }).expect(400);
    await put({ message: 'x'.repeat(5000) }).expect(400);
  });

  it('refuses a body that is not a message', async () => {
    await put({}).expect(400);
    await put({ message: 42 }).expect(400);
  });

  it('is not stored as HTML, and is left as the text it was written as', async () => {
    // Escaping is the page's job and Svelte does it. What matters here is that
    // nothing on the way in rewrites or rejects angle brackets, so the text
    // people wrote is the text people read.
    const response = await put({ message: '<b>bold</b> & "quoted"' }).expect(200);

    expect(response.body.message).toBe('<b>bold</b> & "quoted"');
  });

  it('needs a linked profile to have a page to put it on', async () => {
    await prisma.minecraftLink.updateMany({ data: { unlinkedAt: new Date() } });

    const response = await put({ message: 'hello' }).expect(400);

    expect(response.body.message).toBe('account_not_linked');
  });

  it('is not open to a plugin token, which has no account of its own', async () => {
    const token = await createApiToken(prisma, { scopes: ['stats:write'] });

    await request(app.getHttpServer())
      .put('/api/v1/me/message')
      .set('x-api-key', token)
      .send({ message: 'hello' })
      .expect(403);
  });

  it('is closed to anybody with no credential at all', async () => {
    await request(app.getHttpServer()).put('/api/v1/me/message').send({ message: 'x' }).expect(401);
  });

  it('goes with the page when the profile is unlinked, and comes back on relinking', async () => {
    await put({ message: 'still here' }).expect(200);
    const session = await viewer();

    await prisma.minecraftLink.updateMany({ data: { unlinkedAt: new Date() } });
    await request(app.getHttpServer())
      .get(`/api/v1/players/${NOTCH}`)
      .set('authorization', `Bearer ${session}`)
      .expect(404);

    // Kept on the account, so linking a profile again does not start over.
    await prisma.minecraftLink.create({
      data: {
        accountId: ownerId,
        mcUuid: NOTCH,
        mcUsername: 'Notch',
        verifiedVia: 'MSA',
        verifiedAt: new Date(),
      },
    });

    expect(await seenBy(session)).toBe('still here');
  });

  describe('taken down by an admin', () => {
    let admin: string;
    let adminId: string;

    beforeEach(async () => {
      adminId = await createAccount(prisma, 'mod', ['user', ADMIN_ROLE]);
      admin = await createSession(app, prisma, adminId);
    });

    function clear(session = admin, uuid = NOTCH) {
      return request(app.getHttpServer())
        .delete(`/api/v1/admin/players/${uuid}/message`)
        .set('authorization', `Bearer ${session}`);
    }

    it('removes the message and records what it said', async () => {
      await put({ message: 'something unwelcome' }).expect(200);

      await clear().expect(204);

      expect(await seenBy(await viewer())).toBeNull();

      const entries = await prisma.auditLog.findMany({
        where: { action: 'profile_message_cleared' },
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorAccountId: adminId,
        targetType: 'minecraft_profile',
        targetId: NOTCH,
        metadata: { accountId: ownerId, previous: 'something unwelcome' },
      });
    });

    it('does nothing, and logs nothing, when there is nothing to remove', async () => {
      await clear().expect(204);
      await clear().expect(204);

      expect(await prisma.auditLog.count({ where: { action: 'profile_message_cleared' } })).toBe(0);
    });

    it('leaves the owner free to write another one', async () => {
      await put({ message: 'first' }).expect(200);
      await clear().expect(204);

      await put({ message: 'second' }).expect(200);

      expect(await seenBy(await viewer())).toBe('second');
    });

    it('has no profile to act on for an unlinked or unknown UUID, or something else', async () => {
      await clear(admin, '853c80ef-3c37-49fd-aa49-938b674adae6').expect(404);
      await clear(admin, 'notch').expect(404);
    });

    it('is for admins only', async () => {
      await put({ message: 'mine' }).expect(200);

      // The owner cannot use it on themselves either: it is a moderation tool,
      // and the ordinary way to remove your own message is to write nothing.
      await clear(owner).expect(403);
      await clear(await viewer()).expect(403);

      const token = await createApiToken(prisma, { scopes: ['stats:write'] });
      await request(app.getHttpServer())
        .delete(`/api/v1/admin/players/${NOTCH}/message`)
        .set('x-api-key', token)
        .expect(403);

      expect(await seenBy(await viewer())).toBe('mine');
    });
  });
});
