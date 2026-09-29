import { Module } from '@nestjs/common';

import { PlayerNamesService } from './player-names.service';

@Module({
  providers: [PlayerNamesService],
  exports: [PlayerNamesService],
})
export class NamesModule {}
