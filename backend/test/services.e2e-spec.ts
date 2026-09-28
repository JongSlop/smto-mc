import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConfigService } from '@nestjs/config';

import type { Env } from '../src/config/env.config';
import { PrismaService } from '../src/database/prisma.service';
import { UploaderService } from '../src/services/uploader.service';
import {
  createAccount,
  createApiToken,
  createSession,
  createTestApp,
  resetDatabase,
} from './helpers';

const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

/** A profile on the account, which every hand-off needs as proof of identity. */
async function linkNotch(prisma: PrismaService, accountId: string): Promise<void> {
  await prisma.minecraftLink.create({
    data: {
      accountId,
      mcUuid: NOTCH,
      mcUsername: 'Notch',
      verifiedVia: 'INGAME_CODE',
      verifiedAt: new Date(),
    },
  });
}

/**
 * Handing a player over to the uploader.
 *
 * The uploader itself is stubbed at the fetch boundary. Calling a real one
 * would create accounts and burn one time credentials over there, which is not
 * something a test run gets to do: setup-e2e.ts switches it off outright and
 * these specs switch it back on against an address that does not exist.
 */
/** Read rather than assumed: CI configures its own PUBLIC_ORIGIN. */
const ORIGIN = (process.env.PUBLIC_ORIGIN ?? '').replace(/\/$/, '');

describe('other services, uploader configured', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const BASE = 'https://uploader.invalid';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Answers the one call this service makes, and records what it was sent. */
  function stubUploader(body: unknown, status = 200): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('offers the uploader once it is configured', async () => {
    const session = await createSession(app, prisma, await createAccount(prisma));

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/services')
      .set('authorization', `Bearer ${session}`)
      .expect(200);

    expect(response.body).toEqual({
      launcher: { url: 'https://smto.dev/launcher/' },
      uploader: { enabled: true },
      // Worked out from OIDC_ISSUER rather than configured again, and the test
      // setup points that at the real account system's OAuth path.
      account: { url: 'https://smto.dev/account/' },
    });
  });

  it('sends the UUID and the current username, and hands back the link', async () => {
    const accountId = await createAccount(prisma);
    const session = await createSession(app, prisma, accountId);
    await linkNotch(prisma, accountId);

    const fetchMock = stubUploader({ url: `${BASE}/link/abc123`, expiresIn: 300 });

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/services/uploader/session')
      .set('authorization', `Bearer ${session}`)
      .send({})
      .expect(200);

    // The way back, so signing out of the uploader does not strand anybody on
    // a service they reached from here.
    expect(response.body.expiresIn).toBe(300);
    const minted = new URL(response.body.url as string);
    expect(minted.origin + minted.pathname).toBe(`${BASE}/link/abc123`);
    expect(minted.searchParams.get('logoutUrl')).toBe(`${ORIGIN}/`);
    expect(minted.searchParams.get('intent')).toBeNull();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/session`);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    // The UUID is the account key over there and the username is a label, so
    // both go on every call and the name is refreshed as a side effect.
    expect(JSON.parse(init.body as string)).toEqual({ uuid: NOTCH, username: 'Notch' });

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'uploader_session_issued' },
    });
    expect(entry.targetId).toBe(NOTCH);
    // The link is a credential while it lives, so it is not in the log.
    expect(JSON.stringify(entry.metadata)).not.toContain('abc123');
  });

  it.each(['audio', 'video'])(
    'opens the %s tab when that is what was asked for',
    async (intent) => {
      const accountId = await createAccount(prisma);
      const session = await createSession(app, prisma, accountId);
      await linkNotch(prisma, accountId);

      stubUploader({ url: `${BASE}/link/abc123`, expiresIn: 300 });

      const response = await request(app.getHttpServer())
        .post('/api/v1/me/services/uploader/session')
        .set('authorization', `Bearer ${session}`)
        .send({ intent })
        .expect(200);

      const minted = new URL(response.body.url as string);
      expect(minted.origin + minted.pathname).toBe(`${BASE}/link/abc123`);
      expect(minted.searchParams.get('intent')).toBe(intent);
      expect(minted.searchParams.get('logoutUrl')).toBe(`${ORIGIN}/`);

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'uploader_session_issued' },
      });
      expect(entry.metadata).toEqual({ intent });
    },
  );

  it('rejects an intent that is not one of the two tabs', async () => {
    const accountId = await createAccount(prisma);
    const session = await createSession(app, prisma, accountId);
    await linkNotch(prisma, accountId);

    const fetchMock = stubUploader({ url: `${BASE}/link/abc123`, expiresIn: 300 });

    await request(app.getHttpServer())
      .post('/api/v1/me/services/uploader/session')
      .set('authorization', `Bearer ${session}`)
      .send({ intent: 'everything' })
      .expect(400);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to follow a link that points away from the uploader', async () => {
    const accountId = await createAccount(prisma);
    const session = await createSession(app, prisma, accountId);
    await linkNotch(prisma, accountId);

    // A compromised or misconfigured uploader must not be able to aim a
    // signed-in player anywhere it likes.
    stubUploader({ url: 'https://attacker.example.com/link/abc123', expiresIn: 300 });

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/services/uploader/session')
      .set('authorization', `Bearer ${session}`)
      .send({})
      .expect(503);

    expect(response.body.message).toBe('uploader_unavailable');
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('reports the uploader as unavailable when it answers with an error', async () => {
    const accountId = await createAccount(prisma);
    const session = await createSession(app, prisma, accountId);
    await linkNotch(prisma, accountId);

    stubUploader({ error: 'nope' }, 401);

    await request(app.getHttpServer())
      .post('/api/v1/me/services/uploader/session')
      .set('authorization', `Bearer ${session}`)
      .send({})
      .expect(503);
  });

  it('refuses to mint anything for an account with no profile', async () => {
    const session = await createSession(app, prisma, await createAccount(prisma));
    const fetchMock = stubUploader({ url: `${BASE}/link/abc123`, expiresIn: 300 });

    const response = await request(app.getHttpServer())
      .post('/api/v1/me/services/uploader/session')
      .set('authorization', `Bearer ${session}`)
      .send({})
      .expect(400);

    expect(response.body.message).toBe('not_linked');
    // The proof of identity is the profile, so nothing was asked of them.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('needs a session, not a plugin token', async () => {
    const token = await createApiToken(prisma, { scopes: ['stats:write'] });

    await request(app.getHttpServer()).get('/api/v1/me/services').expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/me/services')
      .set('x-api-key', token)
      .expect(403);
  });
});

/**
 * Nothing configured, which is a supported way to run this service.
 *
 * Constructed directly rather than driven over HTTP: ConfigModule reads the
 * environment when the app module is imported, so a second app in this process
 * would see the same variables as the first one.
 */
describe('the uploader switched off', () => {
  const off = new UploaderService({ get: () => '' } as unknown as ConfigService<Env, true>);

  it('is not offered', () => {
    expect(off.enabled).toBe(false);
  });

  it('mints nothing', async () => {
    await expect(off.createSession({ mcUuid: NOTCH, mcUsername: 'Notch' })).rejects.toThrow(
      'uploader_disabled',
    );
  });
});
