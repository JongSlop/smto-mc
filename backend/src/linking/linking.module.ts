import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LinkCodeService } from './code/link-code.service';
import { LinkingService } from './linking.service';
import { MinecraftService } from './msa/minecraft.service';
import { MsOauthService } from './msa/ms-oauth.service';
import { MsaLinkService } from './msa/msa-link.service';
import { XboxService } from './msa/xbox.service';

@Module({
  imports: [AuthModule],
  providers: [
    LinkingService,
    LinkCodeService,
    MsOauthService,
    XboxService,
    MinecraftService,
    MsaLinkService,
  ],
  exports: [LinkingService, LinkCodeService, MsaLinkService],
})
export class LinkingModule {}
