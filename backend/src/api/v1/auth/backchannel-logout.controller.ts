import { Controller, Header, HttpCode, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Response } from 'express';

import { BackchannelLogoutService } from '../../../auth/backchannel-logout.service';
import { ClientIp } from '../../../common/decorators/client-ip.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodBody } from '../../../common/pipes/zod.decorators';

const bodySchema = z.object({
  logout_token: z.string().min(1).max(8192),
});

/**
 * Where the account system tells us somebody signed out.
 *
 * Under `api/v1` rather than next to the other auth routes, and that is about
 * reachability rather than taste: `/auth/*` is internal, called by our own
 * SvelteKit server, and nginx only exposes `/mc/link/api/`. The provider calls
 * this from its own process and needs a public address, so the route has to
 * live where one exists.
 *
 * Public, because the signed token is the credential. It is verified against
 * the provider's keys and has to name us in `aud`, so nothing else can produce
 * one.
 */
@ApiTags('auth')
@Public()
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@Controller('api/v1/auth')
export class BackchannelLogoutController {
  constructor(private readonly logout: BackchannelLogoutService) {}

  @Post('backchannel-logout')
  @HttpCode(200)
  // Required by the specification, and sensible on its own: this response says
  // something happened once, to one session.
  @Header('cache-control', 'no-store')
  @ApiOperation({ summary: 'The account system reporting that a session ended' })
  async backchannelLogout(
    @ZodBody(bodySchema) body: z.infer<typeof bodySchema>,
    @Res({ passthrough: true }) response: Response,
    @ClientIp() ipAddress?: string,
  ): Promise<void> {
    await this.logout.handle(body.logout_token, ipAddress);

    // 200 with no body. The provider reads the status and nothing else, and a
    // count of what we deleted is not its business.
    response.status(200);
  }
}
