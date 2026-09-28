import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ServerState } from '@prisma/client';

/**
 * Puts one server in the list so a fresh deployment is not empty.
 *
 * This runs on every container start, so what it does when the table already
 * has rows matters more than what it does when it is empty: **nothing**. It
 * bootstraps, once, and never again.
 *
 * Checking each id instead, which is what this used to do, quietly undid
 * administration: a server deleted in the admin area came back at the next
 * deploy, every deploy, with no way to make it stay gone short of editing this
 * file. One check against an empty table has no such failure mode.
 *
 * Only `i5` is here because only `i5` reports to this service. The other packs
 * are still described by the launcher's own JSON at
 * https://smto.dev/mc/launcher/v2/pack-<id>.json, which is where their
 * metadata should be copied from when they are integrated, through the admin
 * area rather than through here.
 */

interface SeedServer {
  id: string;
  name: string;
  state: ServerState;
  description: string;
  launchDate: string;
  currentVersion: string;
  sortOrder: number;
  /**
   * The launcher fields this service has no columns for, kept verbatim so the
   * eventual migration has somewhere to read them from. Copied from the live
   * pack JSON at https://smto.dev/mc/launcher/v2/pack-<id>.json.
   */
  extra: Record<string, unknown>;
}

const SERVERS: SeedServer[] = [
  {
    id: 'i5',
    name: 'Laced Pack',
    state: ServerState.ONGOING,
    description: 'A custom pack designed for longevity and fun!',
    launchDate: '2025-06-26',
    currentVersion: '1.20.1',
    sortOrder: 10,
    extra: {
      ip: 'i5.smto.dev',
      game: {
        version: '1.20.1',
        java: 26,
        javaProvider: 'adoptium',
        loader: 'FABRIC',
        type: 'AUTOMODPACK',
      },
      config: { ampPort: '27010' },
    },
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    // One question, asked of the table rather than of each id: has anybody
    // administered this list yet? If they have, in either direction, it is
    // theirs and this script has no business in it.
    const existing = await prisma.server.count();

    if (existing > 0) {
      console.log(`Seed: ${existing} server${existing === 1 ? '' : 's'} already present, skipping`);
      return;
    }

    await prisma.server.createMany({
      data: SERVERS.map((server) => ({
        id: server.id,
        name: server.name,
        state: server.state,
        description: server.description,
        launchDate: new Date(server.launchDate),
        currentVersion: server.currentVersion,
        sortOrder: server.sortOrder,
        extra: server.extra,
      })),
    });

    console.log(`Seed: created ${SERVERS.length} server${SERVERS.length === 1 ? '' : 's'}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('Seed failed', error);
  process.exit(1);
});
