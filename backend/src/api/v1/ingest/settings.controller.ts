import { Controller, Delete, Get, HttpCode, Put } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  playerSettingParamsSchema,
  playerSettingsParamsSchema,
  putSettingSchema,
  type PlayerSetting,
  type PlayerSettings,
  type PutSettingInput,
} from '@smto/mc-contracts';

import { Scopes } from '../../../common/decorators/scopes.decorator';
import { ZodBody, ZodParams } from '../../../common/pipes/zod.decorators';
import { SettingsService } from '../../../settings/settings.service';

interface PlayerParams {
  uuid: string;
}

interface SettingParams extends PlayerParams {
  key: string;
}

/**
 * Per-player settings a plugin keeps here so another server can read them back.
 *
 * Same door as the rest of the machine surface: `X-Api-Key`, closed to browser
 * sessions. Reading and writing are separate scopes, so a server that only
 * applies what players set elsewhere can be given a token that cannot change it.
 *
 * **Not scoped to a server, on purpose.** A setting belongs to the player and is
 * the same wherever they join, which is the entire use. So a token pinned to
 * one server can still read and write any player's settings; the pin limits
 * statistics, and these are not statistics. `docs/api.md` says so.
 *
 * The throttle is higher than the machine surface's default because a plugin is
 * expected to read here whenever somebody joins, and a busy network behind one
 * address would otherwise meet the default at an ordinary hour.
 */
@ApiTags('ingest')
@ApiSecurity('api-key')
@Throttle({ default: { ttl: 60_000, limit: 600 } })
@Controller('api/v1/ingest/players/:uuid/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Scopes('settings:read')
  @ApiOperation({ summary: 'Every setting a player has, as a key to value map' })
  list(@ZodParams(playerSettingsParamsSchema) params: PlayerParams): Promise<PlayerSettings> {
    return this.settings.list(params.uuid);
  }

  @Get(':key')
  @Scopes('settings:read')
  @ApiOperation({ summary: 'One setting, or 404 setting_not_found' })
  get(@ZodParams(playerSettingParamsSchema) params: SettingParams): Promise<PlayerSetting> {
    return this.settings.get(params.uuid, params.key);
  }

  /** PUT because it is idempotent: sending the same value twice leaves one setting. */
  @Put(':key')
  @HttpCode(200)
  @Scopes('settings:write')
  @ApiOperation({ summary: 'Create or replace one setting' })
  put(
    @ZodParams(playerSettingParamsSchema) params: SettingParams,
    @ZodBody(putSettingSchema) body: PutSettingInput,
  ): Promise<PlayerSetting> {
    return this.settings.set(params.uuid, params.key, body.value);
  }

  /** `204` whether or not there was anything to delete, so a retry is always safe. */
  @Delete(':key')
  @HttpCode(204)
  @Scopes('settings:write')
  @ApiOperation({ summary: 'Delete one setting' })
  async remove(@ZodParams(playerSettingParamsSchema) params: SettingParams): Promise<void> {
    await this.settings.remove(params.uuid, params.key);
  }
}
