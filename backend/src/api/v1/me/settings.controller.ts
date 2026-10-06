import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  WEB_EDITABLE_SETTINGS,
  mySettingParamsSchema,
  putMySettingSchema,
  type MySettingResult,
  type PlayerSettings,
  type PutMySettingInput,
} from '@smto/mc-contracts';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodBody, ZodParams } from '../../../common/pipes/zod.decorators';
import type { RequestUser } from '../../../common/types/request-user';
import { LinkingService } from '../../../linking/linking.service';
import { SettingsService } from '../../../settings/settings.service';

/**
 * The signed-in person's own settings, as the website reads and writes them.
 *
 * The same rows the plugins use through `/ingest/players/{uuid}/settings`, found
 * by the Minecraft profile the account has linked. Which is why both routes need
 * a live link: without one there is no UUID to look anything up by, and a
 * setting written for nobody could never be read back.
 *
 * Reading shows everything. Writing is limited to the keys in
 * `WEB_EDITABLE_SETTINGS`, because a browser is not a plugin: the plugin API
 * accepts any string for any key, and a form on a web page has no business
 * being able to overwrite a key some mod keeps its own state in.
 */
@ApiTags('me')
@Controller('api/v1/me/settings')
export class MeSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly linking: LinkingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Every setting stored for your linked profile' })
  async list(@CurrentUser() user: RequestUser): Promise<PlayerSettings> {
    return this.settings.list(await this.profileOf(user));
  }

  /**
   * Sets one of the settings the website may edit. A value that cleans up to
   * nothing, such as a blank nickname, removes the setting instead of storing
   * an empty one, so "no nickname" has one representation.
   *
   * Throttled like the other things a person edits by hand: nobody types faster
   * than this, and the language switch is the only caller that repeats.
   */
  @Put(':key')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Set or remove one of the settings you may edit' })
  async put(
    @CurrentUser() user: RequestUser,
    @ZodParams(mySettingParamsSchema) params: { key: string },
    @ZodBody(putMySettingSchema) body: PutMySettingInput,
  ): Promise<MySettingResult> {
    const rule = WEB_EDITABLE_SETTINGS[params.key];

    // Checked before the link on purpose: whether a key is editable does not
    // depend on who is asking, and saying so first is the more useful error.
    if (!rule) {
      throw new ForbiddenException('setting_not_editable');
    }

    const mcUuid = await this.profileOf(user);
    const parsed = rule.safeParse(body.value);

    if (!parsed.success) {
      throw new BadRequestException({
        error: 'validation_failed',
        issues: parsed.error.issues.map((issue) => ({
          path: 'value',
          code: issue.code,
          message: issue.message,
        })),
      });
    }

    if (parsed.data === null) {
      await this.settings.remove(mcUuid, params.key);
      return { key: params.key, value: null };
    }

    const stored = await this.settings.set(mcUuid, params.key, parsed.data);
    return { key: stored.key, value: stored.value };
  }

  /** The Minecraft UUID of the caller's live link, or the same error the message uses. */
  private async profileOf(user: RequestUser): Promise<string> {
    if (user.kind !== 'user' || !user.id) {
      throw new ForbiddenException('session_required');
    }

    const link = await this.linking.find(user.id);

    if (!link) {
      throw new BadRequestException('account_not_linked');
    }

    return link.mcUuid;
  }
}
