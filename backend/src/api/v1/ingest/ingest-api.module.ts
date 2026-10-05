import { Module } from '@nestjs/common';

import { LinkingModule } from '../../../linking/linking.module';
import { SettingsModule } from '../../../settings/settings.module';
import { StatsModule } from '../../../stats/stats.module';
import { IngestController } from './ingest.controller';
import { SettingsController } from './settings.controller';

@Module({
  imports: [LinkingModule, SettingsModule, StatsModule],
  controllers: [IngestController, SettingsController],
})
export class IngestApiModule {}
