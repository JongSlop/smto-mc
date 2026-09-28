import { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { API_TOKEN_PREFIX, type ApiTokenScope } from '@smto/mc-contracts';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { SecretCipherService } from '../src/common/crypto/secret-cipher.service';
import { PrismaService } from '../src/database/prisma.service';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots the real application against the real database.
 *
 * `configure` is for the rare provider that cannot be exercised as itself,
 * such as the one that fetches the account system's signing keys over the
 * network. Everything else runs as it does in production on purpose.
 */
export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestContext> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (configure ? configure(builder) : builder).compile();

  const app = moduleRef.createNestApplication();
  app.set('trust proxy', 1);
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/**
 * Empties everything the tests write, in dependency order.
 *
 * Truncate rather than delete so the suite does not slow down over a long run,
 * and CASCADE so the order only has to be roughly right.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_log",
      "player_metrics",
      "api_tokens",
      "link_codes",
      "minecraft_links",
      "auth_transactions",
      "sessions",
      "accounts",
      "server_assets",
      "servers",
      "skin_cache"
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Issues a plugin token straight into the database.
 *
 * Deliberately not through the admin API: that would need an admin session,
 * which would need a real login against the account system. These tests are
 * about the plugin contract, and a plugin only ever sees the token string.
 */
export async function createApiToken(
  prisma: PrismaService,
  options: { scopes: ApiTokenScope[]; serverId?: string | null } = { scopes: ['stats:write'] },
): Promise<string> {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;

  await prisma.apiToken.create({
    data: {
      name: 'test',
      tokenHash: createHash('sha256').update(token).digest('hex'),
      scopes: options.scopes,
      serverId: options.serverId ?? null,
    },
  });

  return token;
}

export async function createServer(
  prisma: PrismaService,
  id = 'i5',
  overrides: { isPublic?: boolean } = {},
): Promise<string> {
  await prisma.server.create({
    data: {
      id,
      name: `Test ${id}`,
      state: 'ONGOING',
      isPublic: overrides.isPublic ?? true,
    },
  });

  return id;
}

/** An account row, as a real login would leave behind. */
export async function createAccount(
  prisma: PrismaService,
  username = 'tester',
  roles: string[] = ['user'],
): Promise<string> {
  const id = randomUUID();

  await prisma.account.create({
    data: { id, username, roles },
  });

  return id;
}

/**
 * Opens a browser session straight in the database.
 *
 * A real one is the end of an OAuth round trip against the live account
 * system, which a test run cannot do. Everything after that round trip is
 * identical: the guard hashes the bearer token and looks the row up. The
 * refresh token is a placeholder, encrypted the way the real one is, and
 * `refreshedAt` defaults to now so nothing here reaches out to refresh it.
 */
export async function createSession(
  app: INestApplication,
  prisma: PrismaService,
  accountId: string,
  oidcSid?: string,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');

  await prisma.session.create({
    data: {
      tokenHash: createHash('sha256').update(token).digest('hex'),
      accountId,
      refreshTokenEnc: app.get(SecretCipherService).encrypt('test-refresh-token'),
      // Which of the provider's sessions this one came from, for the
      // back-channel logout tests. A real login reads it off the ID token.
      oidcSid: oidcSid ?? null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return token;
}
