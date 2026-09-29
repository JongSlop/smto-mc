import { Module } from '@nestjs/common';

import { StatsModule } from '../../../stats/stats.module';
import { PlayersController } from './players.controller';

@Module({
  imports: [StatsModule],
  controllers: [PlayersController],
})
export class PlayersApiModule {}
