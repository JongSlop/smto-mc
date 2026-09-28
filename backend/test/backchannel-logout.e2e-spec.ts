import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import { createAccount, createSession, createTestApp, resetDatabase } from './helpers';

const ISSUER = 'https://smto.dev/account/oauth';
const JWKS_URI = `${ISSUER}/jwks`;
const CLIENT_ID = 'smto-mc-link-test';
const EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/**
 * The account system telling us a person signed out.
 *
 * Everything here turns on the token, so the suite signs real ones with a key
 * pair of its own and serves them through a stubbed discovery document. That
 * is the whole provider as far as this endpoint is concerned: a set of keys
 * and an issuer.
 */
describe('POST /api/v1/auth/backchannel-logout', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let signingKey: CryptoKey;
  let otherKey: CryptoKey;
  let sign: typeof import('jose').SignJWT;

  let account: string;

  beforeAll(async () => {
    const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
    sign = SignJWT;

    const pair = await generateKeyPair('RS256', { extractable: true });
    const impostor = await generateKeyPair('RS256', { extractable: true });
    signingKey = pair.privateKey;
    otherKey = impostor.privateKey;

    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };

    // The provider, reduced to what this endpoint reads from it. jose fetches
    // the key set through the same global, so one stub serves both.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);

      if (url.includes('/.well-known/openid-configuration')) {
        return Response.json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/auth`,
          token_endpoint: `${ISSUER}/token`,
          userinfo_endpoint: `${ISSUER}/me`,
          jwks_uri: JWKS_URI,
        });
      }

      if (url === JWKS_URI) {
        return Response.json({ keys: [jwk] });
      }

      throw new Error(`unexpected fetch to ${url}`);
    });

    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    account = await createAccount(prisma, 'signed-in');
  });

  interface TokenOptions {
    sub?: string | null;
    sid?: string;
    jti?: string;
    nonce?: string;
    events?: Record<string, unknown> | null;
    audience?: string;
    typ?: string;
    key?: CryptoKey;
  }

  async function logoutToken(options: TokenOptions = {}): Promise<string> {
    const claims: Record<string, unknown> = {
      events: options.events === null ? undefined : (options.events ?? { [EVENT]: {} }),
      jti: options.jti ?? Math.random().toString(36).slice(2),
    };

    if (options.sid) claims.sid = options.sid;
    if (options.nonce) claims.nonce = options.nonce;

    const token = new sign(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: options.typ ?? 'logout+jwt' })
      .setIssuer(ISSUER)
      .setAudience(options.audience ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('2m');

    if (options.sub !== null) {
      token.setSubject(options.sub ?? account);
    }

    return token.sign(options.key ?? signingKey);
  }

  function post(token: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/backchannel-logout')
      .type('form')
      .send({ logout_token: token });
  }

  it('ends the one session the provider named', async () => {
    await createSession(app, prisma, account, 'sid-phone');
    await createSession(app, prisma, account, 'sid-desktop');

    const response = await post(await logoutToken({ sid: 'sid-phone' })).expect(200);

    expect(response.headers['cache-control']).toBe('no-store');

    // One person, two browsers, two provider sessions. Signing out of one is
    // not signing out of the other.
    const left = await prisma.session.findMany({ select: { oidcSid: true } });
    expect(left.map((row) => row.oidcSid)).toEqual(['sid-desktop']);
  });

  it('ends every session of an account when no sid is sent', async () => {
    await createSession(app, prisma, account, 'sid-phone');
    await createSession(app, prisma, account);

    const other = await createAccount(prisma, 'somebody-else');
    await createSession(app, prisma, other, 'sid-theirs');

    await post(await logoutToken()).expect(200);

    const left = await prisma.session.findMany({ select: { accountId: true } });
    expect(left.map((row) => row.accountId)).toEqual([other]);
  });

  it('will not let one account be signed out by another account’s session id', async () => {
    const other = await createAccount(prisma, 'somebody-else');
    await createSession(app, prisma, other, 'sid-theirs');

    // A token naming our account but their session id matches nothing, rather
    // than falling back to either half of it.
    await post(await logoutToken({ sid: 'sid-theirs' })).expect(200);

    expect(await prisma.session.count()).toBe(1);
  });

  it('acts once on a token, however many times it arrives', async () => {
    await createSession(app, prisma, account, 'sid-phone');
    const token = await logoutToken({ sid: 'sid-phone', jti: 'repeated' });

    await post(token).expect(200);
    await post(token).expect(200);

    const audit = await prisma.auditLog.findMany({
      where: { action: 'session_ended_by_provider' },
    });
    expect(audit).toHaveLength(1);
  });

  it('records what it did', async () => {
    await createSession(app, prisma, account, 'sid-phone');

    await post(await logoutToken({ sid: 'sid-phone' })).expect(200);

    const [entry] = await prisma.auditLog.findMany({
      where: { action: 'session_ended_by_provider' },
    });
    expect(entry).toMatchObject({
      actorAccountId: account,
      targetId: account,
      metadata: { sessions: 1, scope: 'session' },
    });
  });

  /**
   * The refusals. Each one leaves the session alone, which is the property
   * that matters: a rejected token must not half-apply.
   */
  it.each([
    [
      'an ID token replayed as a logout token',
      (): Promise<string> => logoutToken({ nonce: 'from-a-login', events: null }),
    ],
    ['a token with no logout event', (): Promise<string> => logoutToken({ events: {} })],
    ['a token carrying a nonce', (): Promise<string> => logoutToken({ nonce: 'anything' })],
    ['a token for another client', (): Promise<string> => logoutToken({ audience: 'roundcube' })],
    ['a token signed by somebody else', (): Promise<string> => logoutToken({ key: otherKey })],
    ['a plain JWT rather than a logout token', (): Promise<string> => logoutToken({ typ: 'JWT' })],
    [
      'a token naming neither a session nor a subject',
      (): Promise<string> => logoutToken({ sub: null }),
    ],
  ])('refuses %s', async (_case, make) => {
    await createSession(app, prisma, account, 'sid-phone');

    const response = await post(await make()).expect(400);

    expect(response.body.message).toBe('invalid_logout_token');
    expect(await prisma.session.count()).toBe(1);
  });

  it('needs a token at all', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/backchannel-logout')
      .type('form')
      .send({})
      .expect(400);
  });
});
