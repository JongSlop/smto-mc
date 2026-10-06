import { Module } from '@nestjs/common';

import { LinkingModule } from '../../../linking/linking.module';
import { ServicesModule } from '../../../services/services.module';
import { ProfilesModule } from '../../../profiles/profiles.module';
import { SettingsModule } from '../../../settings/settings.module';
import { StatsModule } from '../../../stats/stats.module';
import { MeController } from './me.controller';
import { MeServicesController } from './services.controller';
import { MeSettingsController } from './settings.controller';

@Module({
  imports: [LinkingModule, ProfilesModule, ServicesModule, SettingsModule, StatsModule],
  controllers: [MeController, MeServicesController, MeSettingsController],
})
export class MeApiModule {}
