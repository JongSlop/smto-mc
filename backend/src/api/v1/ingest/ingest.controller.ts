import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  ingestMetricsSchema,
  mcUuidSchema,
  redeemLinkCodeSchema,
  type IngestMetricsInput,
  type IngestResult,
  type LinkLookup,
  type MinecraftLink,
  type RedeemLinkCodeInput,
} from '@smto/mc-contracts';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Scopes } from '../../../common/decorators/scopes.decorator';
import { ZodBody } from '../../../common/pipes/zod.decorators';
import type { RequestUser } from '../../../common/types/request-user';
import { LinkCodeService } from '../../../linking/code/link-code.service';
import { LinkingService } from '../../../linking/linking.service';
import { StatsService } from '../../../stats/stats.service';

/**
 * The machine surface: everything a Minecraft server plugin calls.
 *
 * Authenticated with `X-Api-Key`, closed to browser sessions entirely (see
 * ScopesGuard). The Minecraft side of this, the plugin itself, lives outside
 * this repository; `docs/api.md` is the contract it is written against and
 * these routes are not changed without changing that document first.
 */
@ApiTags('ingest')
@ApiSecurity('api-key')
@Controller('api/v1/ingest')
export class IngestController {
  constructor(
    private readonly stats: StatsService,
    private readonly linkCodes: LinkCodeService,
    private readonly linking: LinkingService,
  ) {}

  /**
   * The one way statistics arrive. Playtime is the metric `playtime_seconds`
   * and gets no route of its own: there used to be a `/playtime` shortcut, and
   * a second spelling of the same write was more to keep in step than it ever
   * saved a plugin author.
   */
  @Post('metrics')
  @HttpCode(200)
  @Scopes('stats:write')
  @ApiOperation({ summary: 'Post a batch of statistics for one server' })
  metrics(
    @ZodBody(ingestMetricsSchema) body: IngestMetricsInput,
    @CurrentUser() caller: RequestUser,
  ): Promise<IngestResult> {
    return this.stats.ingest(body, caller.serverId);
  }

  /**
   * Redeems a code a player typed in chat.
   *
   * The UUID in the body is trusted because the server is online mode: Mojang's
   * session server verified it before the player could type anything. That is
   * the entire security argument for this path, and it is why the token
   * carrying `link:redeem` belongs only to servers we run.
   */
  @Post('link/redeem')
  @HttpCode(200)
  @Scopes('link:redeem')
  @ApiOperation({ summary: 'Redeem an in-game link code on behalf of a player' })
  async redeem(@ZodBody(redeemLinkCodeSchema) body: RedeemLinkCodeInput): Promise<MinecraftLink> {
    const { accountId, verification } = await this.linkCodes.redeem(body);
    return this.linking.link(accountId, verification);
  }

  /**
   * Whether a profile is linked, and to whom.
   *
   * Deliberately thin. A plugin gets an account id and a display name so it can
   * greet somebody or gate a feature, and nothing else about the person.
   */
  @Get('link/:uuid')
  @Scopes('link:read')
  @ApiOperation({ summary: 'Look up who a Minecraft UUID belongs to' })
  async lookup(@Param('uuid') uuid: string): Promise<LinkLookup> {
    const parsed = mcUuidSchema.safeParse(uuid);

    if (!parsed.success) {
      return { linked: false, accountId: null, username: null };
    }

    const found = await this.linking.findByUuid(parsed.data);

    return found
      ? { linked: true, accountId: found.accountId, username: found.username }
      : { linked: false, accountId: null, username: null };
  }
}
