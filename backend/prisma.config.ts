import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// The stack keeps one .env at the repo root so docker compose and the apps read
// the same file. Prisma 7 no longer loads it on its own, so point at it here.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '..', '.env'), quiet: true });

/**
 * Migration settings live here in Prisma 7 rather than in schema.prisma. The
 * runtime client connects through the pg adapter in PrismaService, so this URL is
 * only used by the CLI (migrate, studio, seed).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
