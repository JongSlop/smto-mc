import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.config';
import { PrismaService } from '../database/prisma.service';

const SESSION_SERVER = 'https://sessionserver.mojang.com/session/minecraft/profile';

/** Mojang's default skins, used when a profile has never set one. */
const DEFAULT_SKINS = {
  steve:
    'https://textures.minecraft.net/texture/1a4af718455d4aab528e7a61f86fa25e6a369d1768dcb13f7df319a713eb810b',
  alex: 'https://textures.minecraft.net/texture/83cee5ca6afcdb171285aa00e8049c297b2dbeba0efb8ff970a5677a1b644032',
} as const;

interface TexturesPayload {
  textures?: {
    SKIN?: { url?: string; metadata?: { model?: string } };
    CAPE?: { url?: string };
  };
}

/**
 * Serves player skins from our own origin.
 *
 * The page renders a skin in 3D, which means reading the PNG's pixels on a
 * canvas, which means the image has to be same-origin or CORS-enabled.
 * `textures.minecraft.net` is neither reliably, and pointing the browser at a
 * third-party CDN would also put it in the page's request path for every
 * visitor. Proxying solves both and keeps the session server's rate limit
 * (roughly one request per profile per minute) away from a page that could be
 * refreshed far faster than that.
 *
 * The cache is a cache. Dropping the table costs one fetch per player.
 */
@Injectable()
export class SkinsService {
  private readonly logger = new Logger(SkinsService.name);
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('SKIN_CACHE_TTL_HOURS', { infer: true }) * 60 * 60 * 1000;
  }

  async skin(mcUuid: string): Promise<{ png: Buffer; slim: boolean }> {
    const cached = await this.prisma.skinCache.findUnique({ where: { mcUuid } });

    if (cached && Date.now() - cached.fetchedAt.getTime() < this.ttlMs) {
      return { png: Buffer.from(cached.skin), slim: cached.slim };
    }

    try {
      const fetched = await this.fetchFromMojang(mcUuid);

      await this.prisma.skinCache.upsert({
        where: { mcUuid },
        create: { mcUuid, ...fetched },
        update: { ...fetched, fetchedAt: new Date() },
      });

      return { png: Buffer.from(fetched.skin), slim: fetched.slim };
    } catch (error) {
      // A stale skin beats a broken page. Mojang rate limits per profile and
      // has outages like anything else, and a skin that is six hours out of
      // date is not a problem worth showing somebody an error for.
      if (cached) {
        this.logger.warn(`Serving stale skin for ${mcUuid}: ${String(error)}`);
        return { png: Buffer.from(cached.skin), slim: cached.slim };
      }

      throw error;
    }
  }

  async cape(mcUuid: string): Promise<Buffer | null> {
    // Populated by the same fetch as the skin, so asking for the skin first is
    // what fills this in. The dashboard always renders the skin, so by the time
    // anything asks for a cape the row exists.
    const cached = await this.prisma.skinCache.findUnique({ where: { mcUuid } });
    return cached?.cape ? Buffer.from(cached.cape) : null;
  }

  private async fetchFromMojang(mcUuid: string): Promise<{
    // Uint8Array<ArrayBuffer> rather than Buffer: Prisma's Bytes column is typed
    // that exactly, and both Buffer and a bare Uint8Array are backed by
    // ArrayBufferLike, which is not assignable to it.
    skin: Uint8Array<ArrayBuffer>;
    slim: boolean;
    cape: Uint8Array<ArrayBuffer> | null;
    textureUrl: string | null;
  }> {
    const response = await fetch(`${SESSION_SERVER}/${mcUuid.replace(/-/g, '')}`, {
      headers: { accept: 'application/json' },
    });

    if (response.status === 204 || response.status === 404) {
      // Mojang has never heard of this profile. That is the normal case for an
      // offline-mode UUID, which is version 3 and derived from the name rather
      // than issued by Mojang, and it is what a development server produces for
      // every player on it.
      //
      // A 404 here left the dashboard with an empty panel where the character
      // should be. Serving the default skin instead is both nicer and more
      // honest: it is exactly what the game itself shows for a profile with no
      // texture. The cost is that a completely bogus UUID renders as Steve
      // rather than erroring, which is a trade worth making for a picture.
      return { ...(await this.defaultSkin(mcUuid)), cape: null, textureUrl: null };
    }

    if (!response.ok) {
      throw new Error(`session server returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      properties?: { name: string; value: string }[];
    };

    const encoded = payload.properties?.find((property) => property.name === 'textures')?.value;

    if (!encoded) {
      return { ...(await this.defaultSkin(mcUuid)), cape: null, textureUrl: null };
    }

    const textures = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as TexturesPayload;
    const skinUrl = textures.textures?.SKIN?.url;
    const capeUrl = textures.textures?.CAPE?.url;

    if (!skinUrl) {
      return { ...(await this.defaultSkin(mcUuid)), cape: null, textureUrl: null };
    }

    const [skin, cape] = await Promise.all([
      this.download(skinUrl),
      capeUrl ? this.download(capeUrl).catch(() => null) : Promise.resolve(null),
    ]);

    return {
      skin,
      // The metadata only ever says "slim" or is absent, so anything else is
      // the classic model.
      slim: textures.textures?.SKIN?.metadata?.model === 'slim',
      cape,
      textureUrl: skinUrl,
    };
  }

  /**
   * Which default a profile gets is decided by Mojang from the UUID itself, so
   * it can be worked out here rather than fetched: the parity of a handful of
   * XORed bytes picks Alex over Steve.
   */
  private async defaultSkin(
    mcUuid: string,
  ): Promise<{ skin: Uint8Array<ArrayBuffer>; slim: boolean }> {
    const bare = mcUuid.replace(/-/g, '');
    const hash =
      Number.parseInt(bare.slice(7, 8), 16) ^
      Number.parseInt(bare.slice(15, 16), 16) ^
      Number.parseInt(bare.slice(23, 24), 16) ^
      Number.parseInt(bare.slice(31, 32), 16);

    const slim = hash % 2 === 1;
    return { skin: await this.download(slim ? DEFAULT_SKINS.alex : DEFAULT_SKINS.steve), slim };
  }

  private async download(url: string): Promise<Uint8Array<ArrayBuffer>> {
    // Only Mojang's own texture host is ever fetched. The URL comes out of a
    // signed property, but pinning the host anyway means a change on their side
    // cannot turn this into a request to somewhere else.
    const parsed = new URL(url);
    if (parsed.hostname !== 'textures.minecraft.net') {
      throw new Error(`unexpected texture host ${parsed.hostname}`);
    }

    const response = await fetch(parsed, { headers: { accept: 'image/png' } });

    if (!response.ok) {
      throw new Error(`texture download returned ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}
