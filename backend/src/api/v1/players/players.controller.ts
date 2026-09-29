import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { mcUuidSchema, type PlayerProfile } from '@smto/mc-contracts';

import { StatsService } from '../../../stats/stats.service';

/**
 * Somebody's page, for the leaderboard to link to.
 *
 * The same door as the leaderboards and for the same reason: a browser session
 * or a plugin token, and nothing for an anonymous caller. A profile is the
 * pairing of a name with everything that player has done, which is more of it
 * than a leaderboard row shows, so it would be odd for the row to need a
 * credential and the page behind it not to.
 *
 * Which server to look at is not a parameter. The response carries every
 * public server the player has a row on and a caller narrows it down, which
 * keeps this one cacheable answer per player rather than one per filter.
 */
@ApiTags('stats')
@Controller('api/v1/players')
export class PlayersController {
  constructor(private readonly stats: StatsService) {}

  @Get(':uuid')
  // One indexed read of a single player's rows. Cheap, but a page is one call
  // and nothing legitimate asks for a few hundred profiles a minute.
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: "A linked player's statistics, per public server" })
  async profile(@Param('uuid') uuid: string): Promise<PlayerProfile> {
    const parsed = mcUuidSchema.safeParse(uuid);

    if (!parsed.success) {
      throw new NotFoundException('profile_not_found');
    }

    const profile = await this.stats.profile(parsed.data);

    // Nothing recorded, or not a player at all. One answer for both, so the page
    // cannot be used to ask whether a UUID has ever played here.
    if (!profile) {
      throw new NotFoundException('profile_not_found');
    }

    return profile;
  }
}
