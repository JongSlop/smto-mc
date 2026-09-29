import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ServerMeta, ServerTotals } from '@smto/mc-contracts';

import { Public } from '../../../common/decorators/public.decorator';
import { ServersService } from '../../../servers/servers.service';
import { StatsService } from '../../../stats/stats.service';

/**
 * Server metadata, readable by anyone.
 *
 * No token on purpose: the launcher reads this, the website reads this, and
 * anybody who wants to build something against the network can read it too.
 * None of it is private, and requiring a credential would only mean handing one
 * out to every client that displays a server list.
 */
@ApiTags('public')
@Public()
@Throttle({ default: { ttl: 60_000, limit: 60 } })
@Controller('api/v1/public/servers')
export class PublicServersController {
  constructor(
    private readonly servers: ServersService,
    private readonly stats: StatsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every public server, ordered for display' })
  list(): Promise<ServerMeta[]> {
    return this.servers.list({ includeHidden: false });
  }

  @Get(':id')
  @ApiOperation({ summary: 'One server by its internal id, e.g. i5' })
  get(@Param('id') id: string): Promise<ServerMeta> {
    return this.servers.get(id, { includeHidden: false });
  }

  /**
   * What everybody who has played here has done, added up.
   *
   * Open like the rest of this controller, and for the same reason: it names
   * nobody. A number for the whole server is the kind of thing worth putting on
   * a public page, and the leaderboards stay behind a credential because they
   * pair a name with a number, which this does not.
   */
  @Get(':id/stats')
  // A grouped read of one server's rows: cheap, but the same answer for a
  // minute at a time, so it is cached rather than recomputed per visitor.
  @Header('cache-control', 'public, max-age=60')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: "A server's statistics, added up across all players" })
  async totals(@Param('id') id: string): Promise<ServerTotals> {
    // Also what refuses a hidden or unknown server, with the same 404 the
    // metadata route gives, so the two cannot disagree about what exists.
    const server = await this.servers.get(id, { includeHidden: false });

    return this.stats.forServer(server.id);
  }
}
