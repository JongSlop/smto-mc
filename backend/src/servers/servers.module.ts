import { Module } from '@nestjs/common';

import { ServersService } from './servers.service';

@Module({
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
