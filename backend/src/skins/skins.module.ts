import { Module } from '@nestjs/common';

import { SkinsService } from './skins.service';

@Module({
  providers: [SkinsService],
  exports: [SkinsService],
})
export class SkinsModule {}
