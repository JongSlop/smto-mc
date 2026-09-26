import { Module } from '@nestjs/common';

import { LinkingModule } from '../../../linking/linking.module';
import { ServicesModule } from '../../../services/services.module';
import { StatsModule } from '../../../stats/stats.module';
import { MeController } from './me.controller';
import { MeServicesController } from './services.controller';

@Module({
  imports: [LinkingModule, ServicesModule, StatsModule],
  controllers: [MeController, MeServicesController],
})
export class MeApiModule {}
