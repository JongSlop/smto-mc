import { BadRequestException, Injectable } from '@nestjs/common';

import { AuthTransactionService } from '../../auth/auth-transaction.service';
import type { VerificationResult } from '../linking.service';
import { MinecraftService } from './minecraft.service';
import { MsOauthService } from './ms-oauth.service';
import { XboxService } from './xbox.service';

/**
 * The Microsoft linking path, end to end.
 *
 * This is the launcher's chain (`src-tauri/src/auth/`) with the loopback
 * listener replaced by a normal web redirect, and with the token storage
 * removed. The launcher keeps a refresh token in the OS keychain because it has
 * to launch the game later. This service reads the profile once and is done,
 * so every Microsoft, Xbox and Minecraft token exists only inside `complete()`
 * and is gone when it returns. Nothing from Microsoft is written to the
 * database.
 */
@Injectable()
export class MsaLinkService {
  constructor(
    private readonly transactions: AuthTransactionService,
    private readonly msOauth: MsOauthService,
    private readonly xbox: XboxService,
    private readonly minecraft: MinecraftService,
  ) {}

  get enabled(): boolean {
    return this.msOauth.enabled;
  }

  /** Begins a link. Returns where to send the browser. */
  async start(accountId: string): Promise<{ authorizeUrl: string }> {
    if (!this.enabled) {
      throw new BadRequestException('msa_linking_disabled');
    }

    const transaction = await this.transactions.start('msa', { accountId });

    return {
      authorizeUrl: this.msOauth.authorizeUrl({
        state: transaction.state,
        codeChallenge: transaction.codeChallenge,
      }),
    };
  }

  /**
   * Finishes a link.
   *
   * The account is taken from the transaction row, not from whoever is holding
   * the session when the callback arrives. Otherwise a callback replayed into a
   * second browser would attach the profile to the wrong account.
   */
  async complete(
    state: string,
    code: string,
  ): Promise<{ accountId: string; verification: VerificationResult }> {
    if (!this.enabled) {
      throw new BadRequestException('msa_linking_disabled');
    }

    const transaction = await this.transactions.consume('msa', state);

    if (!transaction.accountId) {
      throw new BadRequestException('unknown_state');
    }

    const microsoftToken = await this.msOauth.exchangeCode(code, transaction.codeVerifier);
    const xbl = await this.xbox.authenticate(microsoftToken);
    const xsts = await this.xbox.authorize(xbl.token);
    const minecraftToken = await this.minecraft.loginWithXbox(xsts);

    await this.minecraft.assertOwnsGame(minecraftToken);
    const profile = await this.minecraft.profile(minecraftToken);

    return {
      accountId: transaction.accountId,
      verification: {
        mcUuid: profile.uuid,
        mcUsername: profile.username,
        via: 'MSA',
        // The Xbox user hash is an identifier, not a credential, and it is the
        // one thing worth keeping: it is what lets somebody tell later whether
        // two links came from the same Microsoft account.
        meta: { xuid: xsts.userHash },
      },
    };
  }
}
