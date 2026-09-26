import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { serviceSessionSchema, type ServiceSession, type UploaderIntent } from '@smto/mc-contracts';

import type { Env } from '../config/env.config';

/** Long enough for a slow hop across the network, short enough that a hung
 *  uploader does not hold a browser waiting on a menu click. */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Hands a player over to the uploader service, signed in as themselves.
 *
 * The uploader has no passwords: whoever holds its API key can mint a session
 * for any player by name, which is exactly how the in-game command works. That
 * makes the key a root credential, so it lives here and the browser only ever
 * sees the one time link that comes back.
 *
 * The UUID is the account key over there and the username is a display label,
 * so both are sent on every call and the name is refreshed as a side effect: a
 * player who renames keeps their library.
 */
@Injectable()
export class UploaderService {
  private readonly logger = new Logger(UploaderService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly returnUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('UPLOADER_BASE_URL', { infer: true }).replace(/\/$/, '');
    this.apiKey = config.get('UPLOADER_API_KEY', { infer: true });

    // Where the uploader sends somebody who signs out over there. Our own
    // front door rather than the dashboard: it redirects a signed-in person
    // onwards and greets everybody else, so it is right either way.
    this.returnUrl = `${config.get('PUBLIC_ORIGIN', { infer: true }).replace(/\/$/, '')}/`;
  }

  /** Both halves or nothing: an address with no key mints nothing. */
  get enabled(): boolean {
    return this.baseUrl.length > 0 && this.apiKey.length > 0;
  }

  /**
   * Mints a one time sign in link for one verified profile.
   *
   * The link is single use and expires in minutes, so it is handed straight to
   * the browser as a redirect and never stored or logged. Whoever opens it
   * first becomes that player, which is fine when the only recipient is the
   * player's own browser and is the reason the in-game command whispers it.
   *
   * `intent` picks the library tab the player arrives on, audio or video, and
   * `logoutUrl` is where the uploader sends them if they sign out over there.
   */
  async createSession(
    profile: { mcUuid: string; mcUsername: string },
    intent?: UploaderIntent,
  ): Promise<ServiceSession> {
    if (!this.enabled) {
      throw new BadRequestException('uploader_disabled');
    }

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/session`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ uuid: profile.mcUuid, username: profile.mcUsername }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`Uploader did not answer: ${String(error)}`);
      throw new ServiceUnavailableException('uploader_unavailable');
    }

    if (!response.ok) {
      // Status only. A failure body from a service we authenticate to with a
      // bearer token is not something to copy into our logs.
      this.logger.warn(`Uploader returned ${response.status} for a session request`);
      throw new ServiceUnavailableException('uploader_unavailable');
    }

    const parsed = serviceSessionSchema.safeParse(await response.json().catch(() => null));

    if (!parsed.success) {
      this.logger.warn('Uploader answered with a body this service does not understand');
      throw new ServiceUnavailableException('uploader_unavailable');
    }

    // The browser is redirected to whatever comes back, so what comes back has
    // to be the uploader. Without this check a compromised or misconfigured
    // uploader could point our signed-in players anywhere it liked.
    const url = new URL(parsed.data.url);

    if (url.origin !== new URL(this.baseUrl).origin) {
      this.logger.error('Uploader returned a link pointing somewhere else, refusing to follow it');
      throw new ServiceUnavailableException('uploader_unavailable');
    }

    // Both parameters are set after the origin check, on a URL we have already
    // decided to trust.
    //
    // `intent` is the one the in-game command appends, so the player lands on
    // the tab they asked for, and it is only ever one of two known values.
    if (intent) {
      url.searchParams.set('intent', intent);
    }

    // `logoutUrl` is the way back. Signing out of the uploader otherwise leaves
    // somebody on a signed out page of a service they arrived at from here,
    // with nothing pointing home.
    url.searchParams.set('logoutUrl', this.returnUrl);

    return { ...parsed.data, url: url.toString() };
  }
}
