import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LinkingModule } from '../linking/linking.module';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [AuthModule, LinkingModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
