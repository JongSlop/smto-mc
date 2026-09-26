import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.config';
import { jose, type JWTVerifyGetKey } from './jose';

/**
 * The subset of the account system's discovery document this service uses. It
 * publishes more than this; anything not listed here is deliberately not
 * depended on.
 */
export interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
}

/** Re-read after this long, so a key rotation is picked up without a restart. */
const METADATA_TTL_MS = 60 * 60 * 1000;

/**
 * Reads the account system's endpoints from its own discovery document rather
 * than hardcoding them.
 *
 * That matters more here than it usually does. The provider builds the URLs it
 * advertises from the incoming request path, and it is mounted under a subpath
 * (`/account/oauth`). Copying those URLs into our configuration would mean a
 * change on their side silently breaking logins on ours, at a moment nobody
 * would connect to the deploy that caused it.
 */
@Injectable()
export class OidcDiscoveryService {
  private readonly logger = new Logger(OidcDiscoveryService.name);
  private readonly issuer: string;

  private cached: { metadata: OidcMetadata; fetchedAt: number } | null = null;
  private inFlight: Promise<OidcMetadata> | null = null;
  private jwks: JWTVerifyGetKey | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.issuer = this.config.get('OIDC_ISSUER', { infer: true }).replace(/\/$/, '');
  }

  get issuerUrl(): string {
    return this.issuer;
  }

  async metadata(): Promise<OidcMetadata> {
    const fresh = this.cached && Date.now() - this.cached.fetchedAt < METADATA_TTL_MS;
    if (fresh) {
      return this.cached!.metadata;
    }

    // One fetch even if a burst of requests arrives with a cold cache.
    this.inFlight ??= this.fetchMetadata().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  /**
   * The key set for verifying ID tokens. jose caches the keys itself and
   * refetches when it sees a `kid` it does not know, which is exactly the
   * behaviour a rotating provider needs.
   */
  async keys(): Promise<JWTVerifyGetKey> {
    if (!this.jwks) {
      const { jwks_uri } = await this.metadata();
      const { createRemoteJWKSet } = await jose();
      this.jwks = createRemoteJWKSet(new URL(jwks_uri));
    }

    return this.jwks;
  }

  private async fetchMetadata(): Promise<OidcMetadata> {
    const url = `${this.issuer}/.well-known/openid-configuration`;

    let response: Response;
    try {
      response = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (error) {
      // A stale document beats no login at all. The endpoints in it change
      // approximately never, so serving one that is an hour old while the
      // account system is briefly unreachable is the better failure.
      if (this.cached) {
        this.logger.warn(`Discovery unreachable, serving cached metadata: ${String(error)}`);
        return this.cached.metadata;
      }
      throw new ServiceUnavailableException('account_system_unreachable');
    }

    if (!response.ok) {
      if (this.cached) {
        this.logger.warn(`Discovery returned ${response.status}, serving cached metadata`);
        return this.cached.metadata;
      }
      throw new ServiceUnavailableException('account_system_unreachable');
    }

    const metadata = (await response.json()) as OidcMetadata;

    if (metadata.issuer !== this.issuer) {
      // The document names the issuer it belongs to. If that disagrees with
      // what we asked for, we are talking to the wrong provider and no token it
      // hands out should be trusted.
      throw new ServiceUnavailableException('issuer_mismatch');
    }

    this.cached = { metadata, fetchedAt: Date.now() };
    this.logger.log(`Discovery loaded from ${url}`);
    return metadata;
  }
}
