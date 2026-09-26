import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { mcUuidSchema } from '@smto/mc-contracts';
import type { Response } from 'express';

import { Public } from '../../../common/decorators/public.decorator';
import { SkinsService } from '../../../skins/skins.service';

/**
 * Skin bytes from our own origin, so the 3D renderer can read them off a canvas
 * without a CORS argument and without the page depending on a third-party CDN.
 *
 * Both routes return a StreamableFile rather than the Buffer itself. Nest's
 * default interceptor serialises a returned Buffer as JSON, which produces
 * `{"type":"Buffer","data":[137,80,...]}` under an image/png header: a response
 * that looks right in curl's headers and is not an image. StreamableFile is the
 * documented way to hand back raw bytes.
 */
@ApiTags('public')
@Public()
@Throttle({ default: { ttl: 60_000, limit: 120 } })
@Controller('api/v1/public/skins')
export class PublicSkinsController {
  constructor(private readonly skins: SkinsService) {}

  @Get(':uuid.png')
  @ApiOperation({ summary: "A player's skin as a PNG" })
  async skin(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const parsed = mcUuidSchema.safeParse(uuid);

    if (!parsed.success) {
      throw new NotFoundException('profile_not_found');
    }

    const { png, slim } = await this.skins.skin(parsed.data);

    // The renderer needs to know which model the texture is drawn for, and
    // reading it off the image is not possible. A header keeps it on the same
    // request rather than costing a second one.
    response.setHeader('x-skin-model', slim ? 'slim' : 'classic');
    // An hour in the browser. Somebody who changes their skin sees it here
    // within that, and every reload of the dashboard in between costs nothing.
    response.setHeader('cache-control', 'public, max-age=3600');

    return new StreamableFile(png, { type: 'image/png' });
  }

  @Get(':uuid/cape.png')
  @ApiOperation({ summary: "A player's cape, if they have one" })
  async cape(
    @Param('uuid') uuid: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const parsed = mcUuidSchema.safeParse(uuid);

    if (!parsed.success) {
      throw new NotFoundException('profile_not_found');
    }

    const cape = await this.skins.cape(parsed.data);

    if (!cape) {
      throw new NotFoundException('no_cape');
    }

    response.setHeader('cache-control', 'public, max-age=3600');

    return new StreamableFile(cape, { type: 'image/png' });
  }
}
