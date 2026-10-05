import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PLAYER_SETTINGS_LIMIT, type PlayerSetting, type PlayerSettings } from '@smto/mc-contracts';

import { PrismaService } from '../database/prisma.service';

/**
 * Per-player settings: strings a plugin keeps here so another server can read
 * them back.
 *
 * Nothing in this class knows what a key means. The nickname that started this
 * is one use of it; the next one needs no change here.
 *
 * Inputs are expected to be validated already (see the schemas in
 * `@smto/mc-contracts`), so keys arrive lower case and UUIDs arrive dashed.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything a player has. A player with nothing is an empty map, not an error. */
  async list(mcUuid: string): Promise<PlayerSettings> {
    const rows = await this.prisma.playerSetting.findMany({
      where: { mcUuid },
      orderBy: { key: 'asc' },
      select: { key: true, value: true },
    });

    return { uuid: mcUuid, settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) };
  }

  async get(mcUuid: string, key: string): Promise<PlayerSetting> {
    const row = await this.prisma.playerSetting.findUnique({
      where: { mcUuid_key: { mcUuid, key } },
    });

    if (!row) {
      throw new NotFoundException('setting_not_found');
    }

    return toSetting(row);
  }

  /**
   * Creates or replaces. Last write wins, which is the right rule for something
   * a person sets by hand on one server at a time.
   *
   * The ceiling on how many a player may hold is checked only when a write
   * would add a new key, so a player at the limit can still change what they
   * have. It is read then written, not locked: two racing first writes can land
   * one over, and a guard against a buggy loop does not need to be exact.
   */
  async set(mcUuid: string, key: string, value: string): Promise<PlayerSetting> {
    const existing = await this.prisma.playerSetting.findUnique({
      where: { mcUuid_key: { mcUuid, key } },
      select: { id: true },
    });

    if (!existing) {
      const held = await this.prisma.playerSetting.count({ where: { mcUuid } });

      if (held >= PLAYER_SETTINGS_LIMIT) {
        throw new UnprocessableEntityException('settings_limit_reached');
      }
    }

    const row = await this.prisma.playerSetting.upsert({
      where: { mcUuid_key: { mcUuid, key } },
      create: { mcUuid, key, value },
      update: { value },
    });

    return toSetting(row);
  }

  /** Idempotent: removing what is not there is the same outcome as removing it. */
  async remove(mcUuid: string, key: string): Promise<void> {
    await this.prisma.playerSetting.deleteMany({ where: { mcUuid, key } });
  }
}

function toSetting(row: { key: string; value: string; updatedAt: Date }): PlayerSetting {
  return { key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() };
}
