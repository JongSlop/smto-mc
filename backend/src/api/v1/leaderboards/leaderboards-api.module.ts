import { Module } from '@nestjs/common';

import { StatsModule } from '../../../stats/stats.module';
import { LeaderboardsController } from './leaderboards.controller';

@Module({
  imports: [StatsModule],
  controllers: [LeaderboardsController],
})
export class LeaderboardsApiModule {}
