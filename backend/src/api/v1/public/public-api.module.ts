import { Module } from '@nestjs/common';

import { AssetsModule } from '../../../assets/assets.module';
import { ServersModule } from '../../../servers/servers.module';
import { SkinsModule } from '../../../skins/skins.module';
import { PublicAssetsController } from './assets.controller';
import { PublicServersController } from './servers.controller';
import { PublicSkinsController } from './skins.controller';

@Module({
  imports: [AssetsModule, ServersModule, SkinsModule],
  controllers: [PublicAssetsController, PublicServersController, PublicSkinsController],
})
export class PublicApiModule {}
