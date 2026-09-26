import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { ServerMeta } from '@smto/mc-contracts';

import { Public } from '../../../common/decorators/public.decorator';
import { ServersService } from '../../../servers/servers.service';

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
  constructor(private readonly servers: ServersService) {}

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
}
