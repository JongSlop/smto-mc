import { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../src/database/prisma.service';
import { PlayerNamesService } from '../src/names/player-names.service';
import { createTestApp, resetDatabase } from './helpers';

/**
 * Names for players who never linked, from Mojang, cached.
 *
 * `fetch` is stubbed throughout: what is under test is what this does with an
 * answer, or with none, not whether Mojang is up. Each test builds its own
 * service so the rate limit cooldown, which is state on the instance, cannot
 * leak from one to the next.
 */
describe('PlayerNamesService', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: PlayerNamesService;

  const NOTCH = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
  const JEB = '853c80ef-3c37-49fd-aa49-938b674adae6';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    service = new PlayerNamesService(prisma);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, body?: unknown): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  }

  function stubFetch(handler: (url: string) => Response | Promise<Response>) {
    const stub = vi.fn(async (input: string | URL | Request) => handler(String(input)));
    vi.stubGlobal('fetch', stub);
    return stub;
  }

  it('asks Mojang for the name, by the undashed UUID, and returns it', async () => {
    const fetch = stubFetch(() => respond(200, { id: 'x', name: 'Notch' }));

    const names = await service.resolve([NOTCH]);

    expect(names.get(NOTCH)).toBe('Notch');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://sessionserver.mojang.com/session/minecraft/profile/069a79f444e94726a5befca90e38aaf5?unsigned=true',
    );
  });

  it('remembers a name, and does not ask again', async () => {
    const fetch = stubFetch(() => respond(200, { name: 'Notch' }));

    await service.resolve([NOTCH]);
    const again = await service.resolve([NOTCH]);

    expect(again.get(NOTCH)).toBe('Notch');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks once for a UUID that appears twice in the same request', async () => {
    const fetch = stubFetch(() => respond(200, { name: 'Notch' }));

    await service.resolve([NOTCH, NOTCH, NOTCH]);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks once when two requests want the same UUID at the same time', async () => {
    const fetch = stubFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return respond(200, { name: 'Notch' });
    });

    const [first, second] = await Promise.all([service.resolve([NOTCH]), service.resolve([NOTCH])]);

    expect(first.get(NOTCH)).toBe('Notch');
    expect(second.get(NOTCH)).toBe('Notch');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('remembers that Mojang has no such profile, which is what an offline UUID is', async () => {
    const fetch = stubFetch(() => respond(204));

    const first = await service.resolve([NOTCH]);
    const second = await service.resolve([NOTCH]);

    expect(first.get(NOTCH)).toBeNull();
    expect(second.get(NOTCH)).toBeNull();
    // An answer, even an empty one, is not asked for again on every page view.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats a 404 the same as a 204', async () => {
    stubFetch(() => respond(404));

    expect((await service.resolve([NOTCH])).get(NOTCH)).toBeNull();
  });

  it('gives no name, and remembers nothing, when Mojang cannot be reached', async () => {
    const fetch = stubFetch(() => {
      throw new Error('network down');
    });

    const names = await service.resolve([NOTCH]);

    expect(names.has(NOTCH)).toBe(false);
    expect(await prisma.playerName.count()).toBe(0);

    // Not remembered, so the next request tries again and finds out.
    fetch.mockImplementation(async () => respond(200, { name: 'Notch' }));
    expect((await service.resolve([NOTCH])).get(NOTCH)).toBe('Notch');
  });

  it('does not treat a server error as an answer either', async () => {
    stubFetch(() => respond(500));

    const names = await service.resolve([NOTCH]);

    expect(names.has(NOTCH)).toBe(false);
    expect(await prisma.playerName.count()).toBe(0);
  });

  it('leaves Mojang alone for a while after being told to slow down', async () => {
    const fetch = stubFetch(() => respond(429));

    await service.resolve([NOTCH]);
    await service.resolve([JEB]);

    // The second request never went out.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('serves a name that is due a refresh, and picks up a rename', async () => {
    await prisma.playerName.create({
      data: { mcUuid: NOTCH, username: 'OldName', fetchedAt: new Date(Date.now() - 48 * 3600_000) },
    });
    stubFetch(() => respond(200, { name: 'NewName' }));

    const names = await service.resolve([NOTCH]);

    expect(names.get(NOTCH)).toBe('NewName');
    expect((await prisma.playerName.findUniqueOrThrow({ where: { mcUuid: NOTCH } })).username).toBe(
      'NewName',
    );
  });

  it('keeps the old name when a refresh fails', async () => {
    await prisma.playerName.create({
      data: { mcUuid: NOTCH, username: 'OldName', fetchedAt: new Date(Date.now() - 48 * 3600_000) },
    });
    stubFetch(() => respond(503));

    expect((await service.resolve([NOTCH])).get(NOTCH)).toBe('OldName');
  });

  it('does not ask about a name that is still fresh', async () => {
    await prisma.playerName.create({ data: { mcUuid: NOTCH, username: 'Fresh' } });
    const fetch = stubFetch(() => respond(200, { name: 'Other' }));

    expect((await service.resolve([NOTCH])).get(NOTCH)).toBe('Fresh');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is not held up by a slow Mojang, and keeps the answer for next time', async () => {
    stubFetch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2300));
      return respond(200, { name: 'Slow' });
    });

    const started = Date.now();
    const names = await service.resolve([NOTCH]);

    // Gave up waiting at the budget, well before the lookup finished.
    expect(Date.now() - started).toBeLessThan(2000);
    expect(names.has(NOTCH)).toBe(false);

    // The lookup carried on, so the next view has it.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await service.resolve([NOTCH])).get(NOTCH)).toBe('Slow');
  });

  it('asks Mojang for a few names at a time rather than all at once', async () => {
    let running = 0;
    let peak = 0;

    stubFetch(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
      return respond(200, { name: 'Somebody' });
    });

    const uuids = Array.from(
      { length: 24 },
      (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
    );
    const names = await service.resolve(uuids);

    expect(names.size).toBe(24);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it('does nothing at all for no UUIDs', async () => {
    const fetch = stubFetch(() => respond(200, { name: 'x' }));

    expect((await service.resolve([])).size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
