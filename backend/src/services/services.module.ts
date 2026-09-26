import { Module } from '@nestjs/common';

import { UploaderService } from './uploader.service';

/** The other smto.dev services this one can hand a player off to. */
@Module({
  providers: [UploaderService],
  exports: [UploaderService],
})
export class ServicesModule {}
