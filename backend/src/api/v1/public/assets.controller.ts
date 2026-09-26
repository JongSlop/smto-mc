import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Request, Response } from 'express';

import { AssetsService } from '../../../assets/assets.service';
import { Public } from '../../../common/decorators/public.decorator';

const idSchema = z.uuid();

/**
 * Server images, served from our own origin.
 *
 * Public and unauthenticated like the metadata they belong to: the launcher
 * reads these without a session, and so does anybody looking at a server page.
 * The file name in the path is decoration, so a pasted URL says what it points
 * at; the id is what resolves it.
 */
@ApiTags('public')
@Public()
@Throttle({ default: { ttl: 60_000, limit: 120 } })
@Controller('api/v1/public/assets')
export class PublicAssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get(':id/:filename')
  @ApiOperation({ summary: 'An image uploaded for a server' })
  async asset(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = idSchema.safeParse(id);

    if (!parsed.success) {
      throw new NotFoundException('asset_not_found');
    }

    const asset = await this.assets.read(parsed.data);
    const etag = `"${asset.checksum}"`;

    // An hour, and an ETag. Re-uploading under the same name keeps the URL, so
    // the cache has to be short enough that a correction shows up the same
    // afternoon, and the ETag means the usual case costs a 304 rather than the
    // image. A launcher polling this pays almost nothing.
    response.setHeader('cache-control', 'public, max-age=3600');
    response.setHeader('etag', etag);
    // The bytes were checked against their signature on upload, and this says
    // not to second-guess the type anyway.
    response.setHeader('x-content-type-options', 'nosniff');

    if (request.headers['if-none-match'] === etag) {
      response.status(304).end();
      return;
    }

    response.setHeader('content-type', asset.contentType);
    response.setHeader('content-length', String(asset.data.byteLength));
    response.end(asset.data);
  }
}
