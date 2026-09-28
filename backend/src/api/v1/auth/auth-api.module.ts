import { Module } from '@nestjs/common';

import { AuthModule } from '../../../auth/auth.module';
import { BackchannelLogoutController } from './backchannel-logout.controller';

@Module({
  imports: [AuthModule],
  controllers: [BackchannelLogoutController],
})
export class AuthApiModule {}
