import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthTransaction } from '@prisma/client';

import { createPkcePair, randomToken } from '../common/crypto/pkce';
import { PrismaService } from '../database/prisma.service';

/** Long enough for a slow login, short enough that a stolen row is useless. */
const TRANSACTION_TTL_MS = 10 * 60 * 1000;

export type TransactionKind = 'oidc' | 'msa';

export interface StartedTransaction {
  state: string;
  nonce: string;
  codeChallenge: string;
}

/**
 * The server side of an in-flight authorization.
 *
 * Both flows this service runs, the account system login and the Microsoft
 * link, redirect the browser away and expect it back with a code. Something has
 * to remember the PKCE verifier and the expected `state` across that gap. Doing
 * it here rather than in a cookie means the browser is never handed anything
 * worth stealing, and a state parameter replayed from someone else's login
 * finds no row to match.
 *
 * Rows are single use: `consume` deletes as it reads, so a code cannot be
 * exchanged twice even if the callback is opened twice.
 */
@Injectable()
export class AuthTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async start(
    kind: TransactionKind,
    options: { returnTo?: string | null; accountId?: string | null } = {},
  ): Promise<StartedTransaction> {
    const state = randomToken(24);
    const nonce = randomToken(24);
    const pkce = createPkcePair();

    await this.prisma.authTransaction.create({
      data: {
        kind,
        state,
        nonce,
        codeVerifier: pkce.verifier,
        returnTo: options.returnTo ?? null,
        accountId: options.accountId ?? null,
        expiresAt: new Date(Date.now() + TRANSACTION_TTL_MS),
      },
    });

    return { state, nonce, codeChallenge: pkce.challenge };
  }

  /**
   * Reads a transaction back and deletes it in the same step. Throws for an
   * unknown, expired or wrong-kind state, all of which are the same thing from
   * the caller's point of view: this callback does not belong to a login we
   * started.
   */
  async consume(kind: TransactionKind, state: string): Promise<AuthTransaction> {
    const rows = await this.prisma.authTransaction.findMany({ where: { state }, take: 1 });
    const transaction = rows[0];

    if (!transaction) {
      throw new BadRequestException('unknown_state');
    }

    // Delete before validating the rest, so even a rejected callback burns the
    // row rather than leaving it for a second attempt.
    await this.prisma.authTransaction.deleteMany({ where: { id: transaction.id } });

    if (transaction.kind !== kind || transaction.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('unknown_state');
    }

    return transaction;
  }

  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.authTransaction.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return count;
  }
}
