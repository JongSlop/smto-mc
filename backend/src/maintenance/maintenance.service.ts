import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { AuthTransactionService } from '../auth/auth-transaction.service';
import { SessionService } from '../auth/session.service';
import { LinkCodeService } from '../linking/code/link-code.service';

/** Often enough that nothing piles up, rarely enough to be invisible. */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * One timer for the three tables that accumulate rows nobody will ever read
 * again: expired sessions, spent link codes and abandoned authorizations.
 *
 * None of them are a correctness problem. Every one of those rows is already
 * refused on its own expiry, so this is housekeeping rather than security. It
 * lives in one place so there is one job to reason about rather than three
 * services each with their own timer.
 */
@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly sessions: SessionService,
    private readonly linkCodes: LinkCodeService,
    private readonly transactions: AuthTransactionService,
  ) {}

  onModuleInit(): void {
    // unref so a pending sweep never holds the process open during a shutdown.
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
    void this.sweep();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sweep(): Promise<void> {
    try {
      const [sessions, codes, transactions] = await Promise.all([
        this.sessions.pruneExpired(),
        this.linkCodes.pruneExpired(),
        this.transactions.pruneExpired(),
      ]);

      if (sessions + codes + transactions > 0) {
        this.logger.log(
          `Swept ${sessions} sessions, ${codes} link codes, ${transactions} authorizations`,
        );
      }
    } catch (error) {
      // Housekeeping failing is not worth an unhandled rejection. The next tick
      // tries again, and the rows are inert in the meantime.
      this.logger.warn(`Sweep failed: ${String(error)}`);
    }
  }
}
