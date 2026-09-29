import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

const SESSION_SERVER = 'https://sessionserver.mojang.com/session/minecraft/profile';

/** A name that was found is trusted for a day. Renames are rare and not urgent. */
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
/** One Mojang has no profile for is asked about again sooner, in case that changes. */
const MISS_TTL_MS = 6 * 60 * 60 * 1000;
/** How long a single lookup may take before it is written off. */
const LOOKUP_TIMEOUT_MS = 3_000;
/**
 * How long a page waits for names it does not have yet.
 *
 * A leaderboard can want dozens of names on its first view, and a page that
 * takes a minute to load because Mojang is slow is worse than one that shows
 * eight hex characters for a few players. What is not back in time keeps
 * loading in the background, so the next view has it.
 */
const BUDGET_MS = 1_500;
/** Kind to Mojang: a handful at once, not the whole page in one burst. */
const CONCURRENCY = 6;
/** After being told to slow down, leave Mojang alone for this long. */
const COOLDOWN_MS = 60_000;

/**
 * Names for UUIDs that nobody linked here.
 *
 * A linked profile carries its own name, cached when it was linked. A player
 * who never linked has nothing in this database but a UUID, and a UUID is not
 * something to put on a page. Mojang will say what it is called, so this asks
 * once and remembers.
 *
 * Nothing here ever throws to its caller. Mojang being down or unhappy means a
 * page shows a shortened UUID for a while, not that a leaderboard fails.
 */
@Injectable()
export class PlayerNamesService {
  private readonly logger = new Logger(PlayerNamesService.name);
  /** Lookups already under way, so two requests do not ask about the same UUID. */
  private readonly inFlight = new Map<string, Promise<string | null | undefined>>();
  private blockedUntil = 0;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The name for each UUID, or null where Mojang has none, or where it has not
   * been possible to find out yet. The two are not told apart because nobody
   * downstream does anything different for them.
   *
   * What is cached is answered from the cache, even if it is due a refresh, and
   * refreshed alongside. Only a UUID that has never been looked up is waited
   * for, and only for a short while.
   */
  async resolve(mcUuids: string[]): Promise<Map<string, string | null>> {
    const wanted = [...new Set(mcUuids)];
    const names = new Map<string, string | null>();

    if (wanted.length === 0) {
      return names;
    }

    const rows = await this.prisma.playerName.findMany({ where: { mcUuid: { in: wanted } } });
    const now = Date.now();
    const toFetch: string[] = [];
    const cached = new Set<string>();

    for (const row of rows) {
      names.set(row.mcUuid, row.username);
      cached.add(row.mcUuid);

      const ttl = row.username === null ? MISS_TTL_MS : HIT_TTL_MS;
      if (now - row.fetchedAt.getTime() > ttl) {
        toFetch.push(row.mcUuid);
      }
    }

    // Never seen ones first: they are the ones a reader is waiting to see.
    toFetch.unshift(...wanted.filter((uuid) => !cached.has(uuid)));

    if (toFetch.length === 0 || Date.now() < this.blockedUntil) {
      return names;
    }

    const fetched = new Map<string, string | null>();
    const work = this.fetchAll(toFetch, fetched);

    // Whichever finishes first. When the budget wins the lookups carry on, and
    // whatever has landed by then is still used.
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, BUDGET_MS);
      }),
    ]);
    clearTimeout(timer);

    for (const [uuid, name] of fetched) {
      names.set(uuid, name);
    }

    return names;
  }

  /** Runs the lookups a few at a time, writing each answer as it arrives. */
  private async fetchAll(uuids: string[], into: Map<string, string | null>): Promise<void> {
    const queue = [...uuids];

    const worker = async (): Promise<void> => {
      for (let uuid = queue.shift(); uuid !== undefined; uuid = queue.shift()) {
        if (Date.now() < this.blockedUntil) {
          return;
        }

        const name = await this.lookup(uuid);

        // undefined is "could not find out", which is not an answer and is not
        // remembered, so the next request tries again.
        if (name !== undefined) {
          into.set(uuid, name);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, uuids.length) }, worker));
  }

  private lookup(mcUuid: string): Promise<string | null | undefined> {
    const running = this.inFlight.get(mcUuid);
    if (running) {
      return running;
    }

    const started = this.ask(mcUuid).finally(() => this.inFlight.delete(mcUuid));
    this.inFlight.set(mcUuid, started);

    return started;
  }

  private async ask(mcUuid: string): Promise<string | null | undefined> {
    try {
      const response = await fetch(`${SESSION_SERVER}/${mcUuid.replace(/-/g, '')}?unsigned=true`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });

      if (response.status === 429) {
        this.blockedUntil = Date.now() + COOLDOWN_MS;
        this.logger.warn('Mojang asked us to slow down, pausing name lookups');
        return undefined;
      }

      let username: string | null;

      if (response.status === 204 || response.status === 404) {
        // Not a profile Mojang issued, which is what an offline-mode UUID is.
        username = null;
      } else if (response.ok) {
        const body = (await response.json()) as { name?: unknown };
        username = typeof body.name === 'string' && body.name.length > 0 ? body.name : null;
      } else {
        this.logger.warn(`Name lookup for ${mcUuid} returned ${response.status}`);
        return undefined;
      }

      await this.prisma.playerName.upsert({
        where: { mcUuid },
        create: { mcUuid, username },
        update: { username, fetchedAt: new Date() },
      });

      return username;
    } catch (error) {
      this.logger.warn(`Name lookup for ${mcUuid} failed: ${String(error)}`);
      return undefined;
    }
  }
}
