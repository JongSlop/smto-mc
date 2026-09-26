import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.config';

/**
 * The `consumers` tenant is mandatory and not a preference.
 *
 * `XboxLive.signin` is not granted on `common` or on a tenant GUID; the
 * authorize request simply fails there. The launcher learned this the hard way
 * and says so at `src-tauri/src/auth/ms_oauth.rs:6`.
 */
const AUTHORIZE_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';

/**
 * Only what is needed to read the profile once.
 *
 * The launcher also asks for `offline_access`, because it has to come back
 * later without the user present. This service reads the profile and is done,
 * so it asks for no refresh token: there is then nothing long-lived to store,
 * and nothing to leak.
 */
const SCOPE = 'XboxLive.signin';

/**
 * The Microsoft half of the linking flow: authorization code with PKCE against
 * a confidential web client.
 */
@Injectable()
export class MsOauthService {
  private readonly logger = new Logger(MsOauthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get('MSA_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('MSA_CLIENT_SECRET', { infer: true });

    const publicOrigin = config.get('PUBLIC_ORIGIN', { infer: true }).replace(/\/$/, '');
    this.redirectUri = `${publicOrigin}/link/msa/callback`;
  }

  /**
   * Whether this path is offered at all. Without a secret the web platform on
   * the Azure app registration has not been set up, and the website shows only
   * the in-game code, which is a supported way to run this service.
   */
  get enabled(): boolean {
    return this.clientSecret.length > 0;
  }

  get callbackUrl(): string {
    return this.redirectUri;
  }

  authorizeUrl(params: { state: string; codeChallenge: string }): string {
    const url = new URL(AUTHORIZE_ENDPOINT);

    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // Always show the picker. Somebody linking a second account on a shared
    // machine would otherwise be signed straight back in as the first one and
    // get a confusing "already linked" error.
    url.searchParams.set('prompt', 'select_account');

    return url.toString();
  }

  /**
   * Exchanges the code for a Microsoft access token.
   *
   * The token is handed straight to the Xbox Live step and never stored. By the
   * time this request returns to the browser there is nothing left of it.
   */
  async exchangeCode(code: string, codeVerifier: string): Promise<string> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
        scope: SCOPE,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      // Logged without the body's token fields, which a failure response does
      // not carry anyway, and truncated so a verbose error page cannot fill the
      // log.
      this.logger.warn(
        `Microsoft token endpoint returned ${response.status}: ${detail.slice(0, 200)}`,
      );
      throw new UnauthorizedException('msa_token_exchange_failed');
    }

    const payload = (await response.json()) as { access_token?: string };

    if (!payload.access_token) {
      throw new UnauthorizedException('msa_token_exchange_failed');
    }

    return payload.access_token;
  }
}
