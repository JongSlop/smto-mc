import { Module } from '@nestjs/common';

import { LinkingModule } from '../../../linking/linking.module';
import { ServicesModule } from '../../../services/services.module';
import { ProfilesModule } from '../../../profiles/profiles.module';
import { StatsModule } from '../../../stats/stats.module';
import { MeController } from './me.controller';
import { MeServicesController } from './services.controller';

@Module({
  imports: [LinkingModule, ProfilesModule, ServicesModule, StatsModule],
  controllers: [MeController, MeServicesController],
})
export class MeApiModule {}
