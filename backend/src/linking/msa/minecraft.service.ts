import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { normaliseMcUuid } from '@smto/mc-contracts';

import type { XstsToken } from './xbox.service';

const LOGIN_WITH_XBOX = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const ENTITLEMENTS = 'https://api.minecraftservices.com/entitlements/mcstore';
const PROFILE = 'https://api.minecraftservices.com/minecraft/profile';

export interface MinecraftProfile {
  /** Dashed, normalised. The API returns it undashed. */
  uuid: string;
  username: string;
}

/**
 * The Minecraft services side of the chain: prove ownership, then read the
 * profile.
 *
 * Both steps matter. A Microsoft account can pass Xbox Live cleanly and still
 * not own the game, or own it and never have created a profile, and those are
 * different messages to show somebody.
 */
@Injectable()
export class MinecraftService {
  private readonly logger = new Logger(MinecraftService.name);

  /** Trades the XSTS token for a Minecraft access token. */
  async loginWithXbox(xsts: XstsToken): Promise<string> {
    const response = await fetch(LOGIN_WITH_XBOX, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ identityToken: `XBL3.0 x=${xsts.userHash};${xsts.token}` }),
    });

    if (!response.ok) {
      this.logger.warn(`login_with_xbox returned ${response.status}`);
      throw new BadRequestException('msa_minecraft_login_failed');
    }

    const payload = (await response.json()) as { access_token?: string };

    if (!payload.access_token) {
      throw new BadRequestException('msa_minecraft_login_failed');
    }

    return payload.access_token;
  }

  /**
   * Checks the account owns Java Edition.
   *
   * An empty `items` array is the answer for Game Pass accounts that have not
   * launched the game, and for accounts that only own Bedrock. Both have no Java
   * profile to link.
   */
  async assertOwnsGame(minecraftAccessToken: string): Promise<void> {
    const response = await fetch(ENTITLEMENTS, {
      headers: { authorization: `Bearer ${minecraftAccessToken}`, accept: 'application/json' },
    });

    if (!response.ok) {
      this.logger.warn(`entitlements returned ${response.status}`);
      throw new BadRequestException('msa_minecraft_login_failed');
    }

    const payload = (await response.json()) as { items?: unknown[] };

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new BadRequestException('msa_does_not_own_game');
    }
  }

  /**
   * Reads the profile. A 404 means the account owns the game but has never
   * picked a name, which is a thing the user can fix and should be told about
   * rather than shown a generic failure.
   */
  async profile(minecraftAccessToken: string): Promise<MinecraftProfile> {
    const response = await fetch(PROFILE, {
      headers: { authorization: `Bearer ${minecraftAccessToken}`, accept: 'application/json' },
    });

    if (response.status === 404) {
      throw new BadRequestException('msa_no_minecraft_profile');
    }

    if (!response.ok) {
      this.logger.warn(`minecraft profile returned ${response.status}`);
      throw new BadRequestException('msa_minecraft_login_failed');
    }

    const payload = (await response.json()) as { id?: string; name?: string };

    if (!payload.id || !payload.name) {
      throw new BadRequestException('msa_minecraft_login_failed');
    }

    return { uuid: normaliseMcUuid(payload.id), username: payload.name };
  }
}
