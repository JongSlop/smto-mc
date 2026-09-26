import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  uploaderSessionRequestSchema,
  type ServiceSession,
  type ServiceStatus,
  type UploaderSessionRequest,
} from '@smto/mc-contracts';

import { AuditService } from '../../../audit/audit.service';
import { ClientIp } from '../../../common/decorators/client-ip.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodBody } from '../../../common/pipes/zod.decorators';
import type { RequestUser } from '../../../common/types/request-user';
import type { Env } from '../../../config/env.config';
import { LinkingService } from '../../../linking/linking.service';
import { UploaderService } from '../../../services/uploader.service';

/**
 * Handing the signed-in player over to another smto.dev service.
 *
 * Every route here needs a browser session and a linked Minecraft profile,
 * because the profile is the proof: the other services key their accounts on
 * the Minecraft UUID, and this service is the thing that knows a person owns
 * one. A plugin token cannot call any of it.
 */
@ApiTags('me')
@Controller('api/v1/me/services')
export class MeServicesController {
  /**
   * Where the account system's own pages live.
   *
   * Derived from the issuer rather than configured again: the discovery
   * document sits at `${OIDC_ISSUER}/.well-known/...` and the issuer is that
   * deployment's OAuth path, so dropping the last segment lands on its front
   * door. One variable to get wrong instead of two, and a dev deployment
   * pointed at a different account system links to that one rather than to
   * production.
   */
  private readonly accountUrl: string | null;
  private readonly launcherUrl: string;

  constructor(
    private readonly uploader: UploaderService,
    private readonly linking: LinkingService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    const issuer = new URL(config.get('OIDC_ISSUER', { infer: true }));
    const segments = issuer.pathname.split('/').filter(Boolean);

    // `https://smto.dev/account/oauth` -> `https://smto.dev/account/`. An
    // issuer at the root of a host has nothing above it to link to.
    this.accountUrl =
      segments.length > 1 ? `${issuer.origin}/${segments.slice(0, -1).join('/')}/` : null;

    this.launcherUrl = config.get('LAUNCHER_URL', { infer: true });
  }

  /** Which services are configured, so the menu only offers what works. */
  @Get()
  @ApiOperation({ summary: 'Which other services are available' })
  list(@CurrentUser() user: RequestUser): ServiceStatus {
    this.assertPerson(user);

    return {
      launcher: this.launcherUrl ? { url: this.launcherUrl } : null,
      uploader: { enabled: this.uploader.enabled },
      account: this.accountUrl ? { url: this.accountUrl } : null,
    };
  }

  /**
   * Mints a sign in link for the uploader and hands it back once.
   *
   * A POST because it is a mutation in the plainest sense: every call burns a
   * credential over there. The frontend reaches it from a form rather than a
   * link for the same reason, so a hovered menu entry cannot mint sessions.
   *
   * Throttled well below what a person can click.
   */
  @Post('uploader/session')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'A one time sign in link for the uploader' })
  async uploaderSession(
    @CurrentUser() user: RequestUser,
    @ZodBody(uploaderSessionRequestSchema) body: UploaderSessionRequest,
    @ClientIp() ipAddress?: string,
  ): Promise<ServiceSession> {
    this.assertPerson(user);

    const link = await this.linking.find(user.id!);

    if (!link) {
      throw new BadRequestException('not_linked');
    }

    const session = await this.uploader.createSession(link, body.intent);

    // The profile, the tab and the moment, never the link itself: it is a
    // credential for as long as it lives, and an audit log is the wrong place
    // for one.
    await this.audit.record('uploader_session_issued', {
      actorAccountId: user.id!,
      targetType: 'minecraft_profile',
      targetId: link.mcUuid,
      metadata: { intent: body.intent ?? null },
      ipAddress,
    });

    return session;
  }

  /**
   * Same rule as the rest of /me: these are things a person does, and an API
   * token has no person behind it to hand over.
   */
  private assertPerson(user: RequestUser): void {
    if (user.kind !== 'user' || !user.id) {
      throw new ForbiddenException('session_required');
    }
  }
}
