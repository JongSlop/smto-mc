import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { serverIdSchema, type Leaderboards } from '@smto/mc-contracts';

import { StatsService } from '../../../stats/stats.service';

/**
 * Who is ahead, per featured metric.
 *
 * Open to a browser session and to a plugin token alike: the website shows the
 * boards on a page, and a server wanting a `/top` command should not need a
 * second way in. Not public, though. The numbers are harmless, but the pairing
 * of a name with a playtime is somebody's data and stays behind a credential.
 *
 * `?server=` narrows every board to what was recorded on that one server.
 */
@ApiTags('stats')
@Controller('api/v1/leaderboards')
export class LeaderboardsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  // Each call is one grouped scan of the metric table, so this is cheaper than
  // the dashboard but not free, and there is no reason to ask for it in a loop.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'The top players for every featured metric' })
  async boards(@Query('server') server?: string): Promise<Leaderboards> {
    if (server === undefined || server === '') {
      return this.stats.leaderboards();
    }

    const parsed = serverIdSchema.safeParse(server);

    // Malformed, unknown and hidden all get one answer, the same as the public
    // server routes, so a hidden server cannot be told apart from one that was
    // never there.
    if (!parsed.success || !(await this.stats.isPublicServer(parsed.data))) {
      throw new NotFoundException('server_not_found');
    }

    return this.stats.leaderboards({ serverId: parsed.data });
  }
}
