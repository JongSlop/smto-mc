import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, ServerState } from '@prisma/client';

/**
 * Seeds the server list from what the network already runs.
 *
 * Safe to repeat, because the entrypoint runs it on every container start.
 * Existing rows are left alone entirely: this fills an empty table, it does not
 * push the launcher's JSON back over an admin's edits.
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
  {
    id: 'i4',
    name: 'Schacramento 2022 (I4)',
    state: ServerState.ONGOING,
    description: 'The longest-running building server in smto.dev history!',
    launchDate: '2022-08-26',
    currentVersion: '1.21.11',
    sortOrder: 20,
    extra: {
      ip: 'mc.smto.dev',
      game: { loader: 'FABRIC', type: 'AUTOMODPACK' },
    },
  },
  {
    id: 'g3',
    name: 'Schacramento 2025 (G3)',
    state: ServerState.ARCHIVED,
    description: 'Island-City with server-side mods!',
    launchDate: '2024-11-01',
    currentVersion: '1.21.3',
    sortOrder: 30,
    extra: {
      ip: 'g3.smto.dev',
      game: { version: '1.21.3', java: 21, loader: 'FABRIC', type: 'ARCHIVE' },
    },
  },
  {
    id: 'g1',
    name: 'Kingdoms',
    state: ServerState.ARCHIVED,
    description: 'A fully custom fabric modpack!',
    launchDate: '2024-05-01',
    currentVersion: '1.20.1',
    sortOrder: 40,
    extra: {
      ip: 'g1.smto.dev',
      game: { version: '1.20.1', java: 17, loader: 'FABRIC', type: 'ARCHIVE' },
    },
  },
  {
    id: 'i3',
    name: 'Schacramento 2020 (I3)',
    state: ServerState.ARCHIVED,
    description: 'The first cohesive city!',
    launchDate: '2020-01-01',
    currentVersion: '1.20.1',
    sortOrder: 50,
    extra: {
      ip: 'i3.smto.dev',
      game: { version: '1.20.1', java: 17, loader: 'FABRIC', type: 'ARCHIVE' },
    },
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    let created = 0;

    for (const server of SERVERS) {
      // createMany with skipDuplicates would do this in one statement, but one
      // at a time makes the "how many were new" count honest, and this runs
      // five times at startup.
      const existing = await prisma.server.findUnique({ where: { id: server.id } });

      if (existing) {
        continue;
      }

      await prisma.server.create({
        data: {
          id: server.id,
          name: server.name,
          state: server.state,
          description: server.description,
          launchDate: new Date(server.launchDate),
          currentVersion: server.currentVersion,
          sortOrder: server.sortOrder,
          extra: server.extra,
        },
      });

      created += 1;
    }

    console.log(
      created === 0
        ? 'Seed: server list already populated, nothing to do'
        : `Seed: created ${created} server${created === 1 ? '' : 's'}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('Seed failed', error);
  process.exit(1);
});
