import { Module } from '@nestjs/common';

import { ProfileMessageService } from './profile-message.service';

@Module({
  providers: [ProfileMessageService],
  exports: [ProfileMessageService],
})
export class ProfilesModule {}
