import { Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ASSET_EXTENSIONS,
  ASSET_MAX_BYTES,
  assetContentTypeSchema,
  type AssetContentType,
  type ServerAsset,
} from '@smto/mc-contracts';
import { createHash } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env.config';
import { PrismaService } from '../database/prisma.service';

/** What the row looks like with the bytes left behind. */
const META_SELECT = {
  id: true,
  serverId: true,
  filename: true,
  contentType: true,
  byteSize: true,
  checksum: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface AssetRow {
  id: string;
  serverId: string;
  filename: string;
  contentType: string;
  byteSize: number;
  checksum: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Images belonging to a server: icons, backgrounds, whatever a pack JSON wants
 * to point at.
 *
 * The point of this is the URL. The launcher and the website both reference
 * images by absolute address today, and those addresses currently come from
 * files somebody copied onto the web server by hand. Uploading here produces
 * the same kind of address, from the same deployment that serves the metadata,
 * with a record of who put it there.
 */
@Injectable()
export class AssetsService {
  private readonly publicOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.publicOrigin = config.get('PUBLIC_ORIGIN', { infer: true }).replace(/\/$/, '');
  }

  /**
   * The address the file is served at.
   *
   * Built here rather than in the browser because the backend is the only side
   * that knows what this deployment is reachable as: nginx strips
   * `/mc/link/api` on the way in, so the internal path and the public one are
   * not the same string.
   */
  private urlFor(row: { id: string; filename: string }): string {
    return `${this.publicOrigin}/api/v1/public/assets/${row.id}/${encodeURIComponent(row.filename)}`;
  }

  private toAsset(row: AssetRow): ServerAsset {
    return {
      id: row.id,
      serverId: row.serverId,
      filename: row.filename,
      // Validated on the way in, so the column only ever holds one of these.
      contentType: row.contentType as AssetContentType,
      byteSize: row.byteSize,
      checksum: row.checksum,
      url: this.urlFor(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(serverId: string): Promise<ServerAsset[]> {
    await this.assertServer(serverId);

    const rows = await this.prisma.serverAsset.findMany({
      where: { serverId },
      orderBy: [{ filename: 'asc' }],
      select: META_SELECT,
    });

    return rows.map((row) => this.toAsset(row));
  }

  /**
   * Stores one image, replacing whatever was under that name before.
   *
   * Replacing rather than adding a second row is deliberate: the id is in the
   * URL, so keeping it means a pack JSON that already points here keeps
   * working and starts serving the corrected image. A new name is a new
   * address, which is the other thing somebody might want and gets by typing
   * one.
   */
  async upload(
    serverId: string,
    file: { filename: string; contentType: AssetContentType; data: Buffer },
    actor: { accountId: string | null; ipAddress?: string },
  ): Promise<ServerAsset> {
    await this.assertServer(serverId);

    if (file.data.byteLength > ASSET_MAX_BYTES) {
      throw new PayloadTooLargeException('asset_too_large');
    }

    const filename = normaliseFilename(file.filename, file.contentType);
    const checksum = createHash('sha256').update(file.data).digest('hex');
    // Prisma types a Bytes column as Uint8Array<ArrayBuffer> exactly, and a
    // Buffer is backed by ArrayBufferLike, which is not assignable to it. Same
    // conversion the skin cache makes.
    const bytes = Uint8Array.from(file.data);

    const row = await this.prisma.serverAsset.upsert({
      where: { serverId_filename: { serverId, filename } },
      create: {
        serverId,
        filename,
        contentType: file.contentType,
        byteSize: file.data.byteLength,
        checksum,
        data: bytes,
        uploadedBy: actor.accountId,
      },
      update: {
        contentType: file.contentType,
        byteSize: file.data.byteLength,
        checksum,
        data: bytes,
        uploadedBy: actor.accountId,
      },
      select: META_SELECT,
    });

    await this.audit.record('server_asset_uploaded', {
      actorAccountId: actor.accountId,
      targetType: 'server_asset',
      targetId: row.id,
      metadata: {
        serverId,
        filename: row.filename,
        contentType: row.contentType,
        byteSize: row.byteSize,
      },
      ipAddress: actor.ipAddress,
    });

    return this.toAsset(row);
  }

  async remove(
    serverId: string,
    assetId: string,
    actor: { accountId: string | null; ipAddress?: string },
  ): Promise<void> {
    const existing = await this.prisma.serverAsset.findUnique({
      where: { id: assetId },
      select: META_SELECT,
    });

    // Scoped to the server in the path as well as the id, so a mistyped URL
    // cannot delete another server's image.
    if (!existing || existing.serverId !== serverId) {
      throw new NotFoundException('asset_not_found');
    }

    await this.prisma.serverAsset.delete({ where: { id: assetId } });

    await this.audit.record('server_asset_deleted', {
      actorAccountId: actor.accountId,
      targetType: 'server_asset',
      targetId: assetId,
      metadata: { serverId, filename: existing.filename },
      ipAddress: actor.ipAddress,
    });
  }

  /** The bytes, for the public route. */
  async read(
    id: string,
  ): Promise<{ data: Buffer; contentType: string; checksum: string; filename: string }> {
    const row = await this.prisma.serverAsset.findUnique({
      where: { id },
      select: { data: true, contentType: true, checksum: true, filename: true },
    });

    if (!row) {
      throw new NotFoundException('asset_not_found');
    }

    return {
      data: Buffer.from(row.data),
      contentType: row.contentType,
      checksum: row.checksum,
      filename: row.filename,
    };
  }

  private async assertServer(serverId: string): Promise<void> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true },
    });

    if (!server) {
      throw new NotFoundException('server_not_found');
    }
  }
}

/**
 * Forces the extension to match the bytes.
 *
 * A file called `icon.png` that is actually a JPEG is the kind of thing that
 * works everywhere until it does not, and the name is the part everybody reads.
 * Whatever extension arrives is dropped and the one for the real type is put
 * on, so the address always describes what is served at it.
 */
export function normaliseFilename(filename: string, contentType: AssetContentType): string {
  const wanted = ASSET_EXTENSIONS[contentType];
  const stem = filename.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'image';

  return `${stem}.${wanted}`;
}

/**
 * What the bytes actually are, from their signature.
 *
 * The declared content type is a claim by the uploader, and this is the file
 * being asked rather than told. A mismatch is refused: these are served from
 * our own origin, so a file that is not the image it says it is has no business
 * getting an address here.
 */
export function sniffContentType(data: Buffer): AssetContentType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }

  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    data.length >= 6 &&
    data
      .subarray(0, 6)
      .toString('ascii')
      .match(/^GIF8[79]a$/)
  ) {
    return 'image/gif';
  }

  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/** The content type header without its parameters, if we accept it at all. */
export function parseContentType(header: string | undefined): AssetContentType | null {
  const parsed = assetContentTypeSchema.safeParse(
    ((header ?? '').split(';')[0] ?? '').trim().toLowerCase(),
  );
  return parsed.success ? parsed.data : null;
}
