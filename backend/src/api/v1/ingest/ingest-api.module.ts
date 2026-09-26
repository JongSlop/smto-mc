import { Module } from '@nestjs/common';

import { LinkingModule } from '../../../linking/linking.module';
import { StatsModule } from '../../../stats/stats.module';
import { IngestController } from './ingest.controller';

@Module({
  imports: [LinkingModule, StatsModule],
  controllers: [IngestController],
})
export class IngestApiModule {}
