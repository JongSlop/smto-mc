import { BadRequestException, Injectable, Logger } from '@nestjs/common';

const USER_AUTHENTICATE = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTHORIZE = 'https://xsts.auth.xboxlive.com/xsts/authorize';

export interface XstsToken {
  token: string;
  /** The Xbox user hash. Every later call needs it alongside the token. */
  userHash: string;
}

/**
 * Why an XSTS authorization was refused.
 *
 * These are the cases that push somebody to the in-game code instead, so they
 * are decoded rather than collapsed into "login failed". The codes and their
 * meanings are the same set the launcher decodes at
 * `src-tauri/src/auth/xbox.rs:112-120`.
 */
const XERR_REASONS: Record<string, string> = {
  '2148916233': 'msa_no_xbox_account',
  '2148916235': 'msa_region_unavailable',
  '2148916236': 'msa_adult_verification_required',
  '2148916237': 'msa_adult_verification_required',
  '2148916238': 'msa_child_account',
};

/**
 * The two Xbox Live hops between a Microsoft token and something
 * api.minecraftservices.com will accept.
 */
@Injectable()
export class XboxService {
  private readonly logger = new Logger(XboxService.name);

  /** Trades the Microsoft access token for an Xbox Live user token. */
  async authenticate(microsoftAccessToken: string): Promise<XstsToken> {
    const response = await fetch(USER_AUTHENTICATE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        Properties: {
          AuthMethod: 'RPS',
          SiteName: 'user.auth.xboxlive.com',
          // The `d=` prefix is required and is not documented anywhere
          // official. Without it the endpoint answers 400 with no explanation.
          RpsTicket: `d=${microsoftAccessToken}`,
        },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      }),
    });

    if (!response.ok) {
      this.logger.warn(`Xbox user authenticate returned ${response.status}`);
      throw new BadRequestException('msa_xbox_authentication_failed');
    }

    const payload = (await response.json()) as {
      Token?: string;
      DisplayClaims?: { xui?: { uhs?: string }[] };
    };

    const token = payload.Token;
    const userHash = payload.DisplayClaims?.xui?.[0]?.uhs;

    if (!token || !userHash) {
      throw new BadRequestException('msa_xbox_authentication_failed');
    }

    return { token, userHash };
  }

  /**
   * Exchanges the Xbox Live token for one scoped to the Minecraft services API.
   *
   * A 401 here is the interesting case: it is not a broken login, it is a
   * Microsoft account that cannot be used with Minecraft at all, for a reason
   * worth telling the user about.
   */
  async authorize(xblToken: string): Promise<XstsToken> {
    const response = await fetch(XSTS_AUTHORIZE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xblToken],
        },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      }),
    });

    if (response.status === 401) {
      const payload = (await response.json().catch(() => ({}))) as { XErr?: number | string };
      const reason = XERR_REASONS[String(payload.XErr ?? '')];

      throw new BadRequestException(reason ?? 'msa_xbox_authorization_denied');
    }

    if (!response.ok) {
      this.logger.warn(`XSTS authorize returned ${response.status}`);
      throw new BadRequestException('msa_xbox_authentication_failed');
    }

    const payload = (await response.json()) as {
      Token?: string;
      DisplayClaims?: { xui?: { uhs?: string }[] };
    };

    const token = payload.Token;
    const userHash = payload.DisplayClaims?.xui?.[0]?.uhs;

    if (!token || !userHash) {
      throw new BadRequestException('msa_xbox_authentication_failed');
    }

    return { token, userHash };
  }
}
