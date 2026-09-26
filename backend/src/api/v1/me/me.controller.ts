import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Account, LinkCodeIssued, Me, MinecraftLink } from '@smto/mc-contracts';

import { ClientIp } from '../../../common/decorators/client-ip.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { ZodBody } from '../../../common/pipes/zod.decorators';
import type { RequestUser } from '../../../common/types/request-user';
import { PrismaService } from '../../../database/prisma.service';
import { LinkCodeService } from '../../../linking/code/link-code.service';
import { LinkingService } from '../../../linking/linking.service';
import { MsaLinkService } from '../../../linking/msa/msa-link.service';
import { StatsService } from '../../../stats/stats.service';

const msaCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

/**
 * Everything the signed-in person can do about their own account.
 *
 * Reached with the session token the SvelteKit server holds in its cookie. A
 * plugin token cannot call any of it: there is no "on behalf of" here, and a
 * machine has no own account.
 */
@ApiTags('me')
@Controller('api/v1/me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly linking: LinkingService,
    private readonly linkCodes: LinkCodeService,
    private readonly msa: MsaLinkService,
    private readonly stats: StatsService,
  ) {}

  /** The whole dashboard in one response: who you are, your link, your stats. */
  @Get()
  @ApiOperation({ summary: 'The signed-in account, its link and its statistics' })
  async me(@CurrentUser() user: RequestUser): Promise<Me> {
    this.assertPerson(user);

    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: user.id! } });
    const link = await this.linking.find(account.id);

    return {
      account: {
        id: account.id,
        username: account.username,
        avatarUrl: account.avatarUrl,
        roles: account.roles,
      },
      link,
      stats: await this.stats.forProfile(link?.mcUuid ?? null),
    };
  }

  /**
   * Just the account, without the statistics.
   *
   * The layout resolves the signed-in person on every single request, and the
   * full /me response joins every metric row the player has. This route exists
   * so that a page view does not pay for a dashboard it is not rendering.
   */
  @Get('account')
  @ApiOperation({ summary: 'The signed-in account, without statistics' })
  async account(@CurrentUser() user: RequestUser): Promise<Account> {
    this.assertPerson(user);

    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: user.id! } });

    return {
      id: account.id,
      username: account.username,
      avatarUrl: account.avatarUrl,
      roles: account.roles,
    };
  }

  /**
   * Mints an in-game code, or hands back the one still outstanding.
   *
   * Throttled tightly. Minting is cheap but the codes are typed in public chat,
   * and somebody spamming the button would fill a screen with codes that all
   * look current.
   */
  @Post('link/code')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @ApiOperation({ summary: 'Get a code to type in game' })
  async issueCode(
    @CurrentUser() user: RequestUser,
    @ClientIp() ipAddress?: string,
  ): Promise<LinkCodeIssued> {
    this.assertPerson(user);
    await this.assertNotLinked(user.id!);

    const outstanding = await this.linkCodes.current(user.id!);
    return outstanding ?? this.linkCodes.issue(user.id!, { ipAddress });
  }

  /**
   * Just the link, for the page to poll while a code is outstanding.
   *
   * The full /me response joins every metric row the player has, which is fine
   * once per page view and wasteful every few seconds. This is one indexed
   * lookup.
   */
  @Get('link')
  @ApiOperation({ summary: 'The linked profile, or null' })
  async link(@CurrentUser() user: RequestUser): Promise<MinecraftLink | null> {
    this.assertPerson(user);
    return this.linking.find(user.id!);
  }

  /** Whether the Microsoft path is available at all, so the page can say so. */
  @Get('link/msa')
  @ApiOperation({ summary: 'Whether Microsoft linking is configured' })
  msaStatus(@CurrentUser() user: RequestUser): { enabled: boolean } {
    this.assertPerson(user);
    return { enabled: this.msa.enabled };
  }

  @Post('link/msa/start')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Begin linking through a Microsoft account' })
  async startMsa(@CurrentUser() user: RequestUser): Promise<{ authorizeUrl: string }> {
    this.assertPerson(user);
    await this.assertNotLinked(user.id!);

    return this.msa.start(user.id!);
  }

  /**
   * Finishes the Microsoft flow.
   *
   * Public, and it has to be: Microsoft redirects the browser back to a page,
   * and the session cookie may or may not survive that depending on how the
   * user got there. The `state` is what authenticates this call, and the
   * account it belongs to comes out of the transaction row rather than out of
   * whoever happens to be signed in.
   */
  @Public()
  @Post('link/msa/callback')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Complete a Microsoft link' })
  async completeMsa(
    @ZodBody(msaCallbackSchema) body: z.infer<typeof msaCallbackSchema>,
    @ClientIp() ipAddress?: string,
  ): Promise<MinecraftLink> {
    const { accountId, verification } = await this.msa.complete(body.state, body.code);
    return this.linking.link(accountId, verification, { ipAddress });
  }

  @Delete('link')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unlink the Minecraft profile' })
  async unlink(@CurrentUser() user: RequestUser, @ClientIp() ipAddress?: string): Promise<void> {
    this.assertPerson(user);
    await this.linking.unlink(user.id!, { ipAddress });
  }

  private assertPerson(user: RequestUser): void {
    if (user.kind !== 'user' || !user.id) {
      throw new ForbiddenException('session_required');
    }
  }

  /**
   * Both linking paths refuse to start when there is already a profile
   * attached. Catching it here means somebody does not get sent through a
   * Microsoft login only to be told at the end that it was never going to work.
   */
  private async assertNotLinked(accountId: string): Promise<void> {
    if (await this.linking.find(accountId)) {
      throw new BadRequestException('account_already_linked');
    }
  }
}
