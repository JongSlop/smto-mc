import { Module } from '@nestjs/common';

import { NamesModule } from '../names/names.module';
import { StatsService } from './stats.service';

@Module({
  imports: [NamesModule],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
