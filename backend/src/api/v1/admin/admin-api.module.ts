import { Module } from '@nestjs/common';

import { AssetsModule } from '../../../assets/assets.module';
import { ServersModule } from '../../../servers/servers.module';
import { TokensModule } from '../../../tokens/tokens.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [AssetsModule, ServersModule, TokensModule],
  controllers: [AdminController],
})
export class AdminApiModule {}
