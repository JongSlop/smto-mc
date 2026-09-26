import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env.config';

/**
 * Prisma 7 connects through a driver adapter rather than its own engine, so the
 * connection string is handed over here instead of living in schema.prisma.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
      }),
    });
  }

  /**
   * Proves the connection works rather than assuming it.
   *
   * `$connect()` alone is not proof. The pg pool opens lazily, so a wrong
   * password or an unreachable host sails through it and the process announces
   * itself as ready; the truth only arrives at the first real query, as a 500
   * for whoever happened to make it. A round trip here turns that into a boot
   * failure, which is loud, immediate, and points at the configuration that
   * caused it.
   *
   * Throwing stops the process, and that is the intended behaviour: compose
   * restarts it, the healthcheck never passes, and a bad deploy stays out of
   * rotation instead of serving errors.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();

    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(
        'Database is unreachable, or DATABASE_URL is wrong. A SASL password error here ' +
          'usually means the password is empty in the connection string.',
      );
      throw error;
    }

    // Reachable is not the same as ready. Pointing DATABASE_URL at a database
    // that exists but was never migrated gets past the query above and then
    // fails on every request, which reads as the app being broken rather than
    // the configuration. One touch of a real table separates the two.
    try {
      await this.server.findFirst({ select: { id: true } });
    } catch (error) {
      this.logger.error(
        'Connected, but the schema is missing. Either DATABASE_URL names the wrong database, ' +
          'or migrations have not been applied: run `prisma migrate deploy`.',
      );
      throw error;
    }

    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
