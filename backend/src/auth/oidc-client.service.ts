import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.config';
import { jose } from './jose';
import { OidcDiscoveryService } from './oidc-discovery.service';

/** The scopes this service asks for, and why each one is on the list. */
const SCOPES = [
  // The identity itself.
  'openid',
  // preferred_username and picture, for the header and the dashboard.
  'profile',
  // roles, which is what gates the admin area.
  'roles',
  // A refresh token, so a session survives longer than one hour without
  // bouncing the user through a login screen they already passed.
  'offline_access',
].join(' ');

/** Claims we read out of the ID token. The provider inlines granted claims. */
export interface IdTokenClaims {
  sub: string;
  preferred_username?: string;
  picture?: string;
  roles?: string[];
  nonce?: string;
  /**
   * Which of the provider's own sessions this login belongs to. Sent only when
   * the client is registered with a back-channel logout URI and
   * `backchannel_logout_session_required`, so it is optional here: a
   * deployment whose client predates that registration still works, it just
   * logs out per account rather than per session.
   */
  sid?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  idToken: string;
  expiresIn: number;
}

export interface ResolvedIdentity {
  accountId: string;
  username: string;
  avatarUrl: string | null;
  roles: string[];
  /** The provider's session id, when it sends one. See IdTokenClaims.sid. */
  sid: string | null;
  tokens: TokenSet;
}

/**
 * This service as an OAuth client of the smto.dev account system.
 *
 * Confidential client, authorization code with PKCE. The account system
 * requires PKCE from every client including confidential ones, so both halves
 * are always sent.
 */
@Injectable()
export class OidcClientService {
  private readonly logger = new Logger(OidcClientService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly postLogoutRedirectUri: string | null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly discovery: OidcDiscoveryService,
  ) {
    this.clientId = config.get('OIDC_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('OIDC_CLIENT_SECRET', { infer: true });

    const publicOrigin = config.get('PUBLIC_ORIGIN', { infer: true }).replace(/\/$/, '');
    // Registered with the account system as an exact match. It allows no
    // wildcards, so this string and the one in their admin UI have to agree
    // character for character.
    this.redirectUri = `${publicOrigin}/auth/callback`;
    // Empty until it is registered with the account system, which is a
    // supported way to run rather than a misconfiguration. See the env schema.
    this.postLogoutRedirectUri =
      config.get('OIDC_POST_LOGOUT_REDIRECT_URI', { infer: true }) || null;
  }

  get callbackUrl(): string {
    return this.redirectUri;
  }

  /** The issuer we expect, for checking the `iss` a redirect comes back with. */
  get issuer(): string {
    return this.discovery.issuerUrl;
  }

  async authorizeUrl(params: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): Promise<string> {
    const { authorization_endpoint } = await this.discovery.metadata();
    const url = new URL(authorization_endpoint);

    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    // Required to get a refresh token at all, and its absence fails silently.
    //
    // OIDC Core section 11 says the provider must ignore `offline_access`
    // unless the request also carries `prompt=consent`, and node-oidc-provider
    // enforces it literally: `check_scope.js` deletes `offline_access` from the
    // scope before anything else sees it, then `issueRefreshToken` declines
    // because the scope it wanted is gone. Nothing errors. The authorization
    // succeeds, the ID token verifies, and the token response simply has no
    // refresh_token in it, which surfaces here as `no_refresh_token` and looks
    // for all the world like a misconfigured client registration.
    //
    // The cost is that the consent screen appears on every sign in rather than
    // only the first. That is the price of a refresh token, and skipConsent on
    // the client does not buy it back: the scope is already stripped by the
    // time consent is considered.
    url.searchParams.set('prompt', 'consent');

    return url.toString();
  }

  /** Exchanges an authorization code, then verifies what came back. */
  async exchangeCode(code: string, codeVerifier: string, nonce: string): Promise<ResolvedIdentity> {
    const tokens = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      code_verifier: codeVerifier,
    });

    const claims = await this.verifyIdToken(tokens.idToken, nonce);
    return this.toIdentity(claims, tokens);
  }

  /**
   * Trades a refresh token for a fresh set.
   *
   * The account system rotates refresh tokens on every use and kills the whole
   * family when it sees a replay, so the caller has to store what comes back
   * before anything else can go wrong. It also refuses to issue anything at all
   * for an account that has been disabled or has lost its verified email, which
   * is what makes this the right place to notice that.
   */
  async refresh(refreshToken: string): Promise<ResolvedIdentity> {
    const tokens = await this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    // A refresh carries no nonce: there was no fresh authorization request to
    // bind it to. Everything else about the token is still checked.
    const claims = await this.verifyIdToken(tokens.idToken, null);

    return this.toIdentity(claims, {
      ...tokens,
      // A provider is allowed to leave the refresh token out of a refresh
      // response, meaning "keep the one you have". This one rotates, but not
      // relying on that costs nothing.
      refreshToken: tokens.refreshToken ?? refreshToken,
    });
  }

  /**
   * Best effort revocation on the way out. A session is over on our side
   * whatever this does, so a failure is logged and swallowed rather than
   * turning a logout into an error page.
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const metadata = await this.discovery.metadata();

    if (!metadata.revocation_endpoint) {
      return;
    }

    try {
      await fetch(metadata.revocation_endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: this.basicAuth(),
        },
        body: new URLSearchParams({
          token: refreshToken,
          token_type_hint: 'refresh_token',
        }),
      });
    } catch (error) {
      this.logger.warn(`Token revocation failed: ${String(error)}`);
    }
  }

  /**
   * Where to send the browser so the account system ends its session too, or
   * null if we should not send it anywhere.
   *
   * The redirect target comes from configuration rather than from the caller:
   * an attacker-supplied one would be an open redirect wearing our domain, and
   * the account system has to have it registered anyway.
   *
   * Null covers two cases that both mean "end the session here and stop
   * there": a provider with no end session endpoint, and no configured target.
   * Sending the browser to the end session endpoint without one strands it on
   * the provider's own confirmation page, and sending a URI the client has not
   * registered is a hard error, so neither is worth doing on a logout.
   */
  async endSessionUrl(): Promise<string | null> {
    if (!this.postLogoutRedirectUri) {
      return null;
    }

    const metadata = await this.discovery.metadata();

    if (!metadata.end_session_endpoint) {
      return null;
    }

    const url = new URL(metadata.end_session_endpoint);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('post_logout_redirect_uri', this.postLogoutRedirectUri);
    return url.toString();
  }

  private basicAuth(): string {
    const encoded = Buffer.from(
      `${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.clientSecret)}`,
    ).toString('base64');
    return `Basic ${encoded}`;
  }

  private async tokenRequest(body: Record<string, string>): Promise<TokenSet> {
    const { token_endpoint } = await this.discovery.metadata();

    const response = await fetch(token_endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        authorization: this.basicAuth(),
      },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(`Token endpoint returned ${response.status}: ${detail.slice(0, 200)}`);
      throw new UnauthorizedException('token_exchange_failed');
    }

    const payload = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token || !payload.id_token) {
      throw new UnauthorizedException('token_exchange_failed');
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      idToken: payload.id_token,
      expiresIn: payload.expires_in ?? 3600,
    };
  }

  private async verifyIdToken(idToken: string, nonce: string | null): Promise<IdTokenClaims> {
    const keys = await this.discovery.keys();
    const { jwtVerify } = await jose();

    let payload: IdTokenClaims & { nonce?: string };
    try {
      ({ payload } = await jwtVerify<IdTokenClaims>(idToken, keys, {
        issuer: this.discovery.issuerUrl,
        audience: this.clientId,
      }));
    } catch (error) {
      this.logger.warn(`ID token rejected: ${String(error)}`);
      throw new UnauthorizedException('invalid_id_token');
    }

    // Binds this token to the authorization request that started it, so a token
    // captured from somebody else's login cannot be replayed into ours.
    if (nonce !== null && payload.nonce !== nonce) {
      throw new UnauthorizedException('nonce_mismatch');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('invalid_id_token');
    }

    return payload;
  }

  private toIdentity(claims: IdTokenClaims, tokens: TokenSet): ResolvedIdentity {
    return {
      accountId: claims.sub,
      // The provider always sends preferred_username with the profile scope,
      // but the account id is the only thing we insist on: a display name we
      // cannot read is worth showing as the id rather than failing a login.
      username: claims.preferred_username ?? claims.sub,
      avatarUrl: claims.picture ?? null,
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      sid: claims.sid ?? null,
      tokens,
    };
  }
}
