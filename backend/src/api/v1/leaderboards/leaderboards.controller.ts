import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Leaderboards } from '@smto/mc-contracts';

import { StatsService } from '../../../stats/stats.service';

/**
 * Who is ahead, per featured metric.
 *
 * Open to a browser session and to a plugin token alike: the website shows the
 * boards on a page, and a server wanting a `/top` command should not need a
 * second way in. Not public, though. The numbers are harmless, but the pairing
 * of a name with a playtime is somebody's data and stays behind a credential.
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
  boards(): Promise<Leaderboards> {
    return this.stats.leaderboards();
  }
}
