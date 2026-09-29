import { resolve } from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminApiModule } from './api/v1/admin/admin-api.module';
import { AuthApiModule } from './api/v1/auth/auth-api.module';
import { IngestApiModule } from './api/v1/ingest/ingest-api.module';
import { LeaderboardsApiModule } from './api/v1/leaderboards/leaderboards-api.module';
import { PlayersApiModule } from './api/v1/players/players-api.module';
import { MeApiModule } from './api/v1/me/me-api.module';
import { PublicApiModule } from './api/v1/public/public-api.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ScopesGuard } from './common/guards/scopes.guard';
import { validateEnv } from './config/env.config';
import { PrismaModule } from './database/prisma.module';
import { HealthController } from './health/health.controller';
import { LinkingModule } from './linking/linking.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ServersModule } from './servers/servers.module';
import { SkinsModule } from './skins/skins.module';
import { StatsModule } from './stats/stats.module';
import { TokensModule } from './tokens/tokens.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // One .env at the repo root, shared with docker compose.
      envFilePath: resolve(__dirname, '..', '..', '.env'),
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      // A broad ceiling. The public endpoints and the code minting tighten this
      // considerably on their own routes.
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      // Read straight from the environment rather than through ConfigService,
      // so the e2e suite can switch it off: a whole suite of requests from one
      // address would otherwise spend most of its time being throttled.
      //
      // Ignored in production whatever it says. A stray variable in a compose
      // file must not be able to disable rate limiting on a deployment nobody
      // is watching.
      skipIf: () => process.env.THROTTLE_DISABLED === '1' && process.env.NODE_ENV !== 'production',
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    TokensModule,
    ServersModule,
    StatsModule,
    SkinsModule,
    LinkingModule,
    AuthApiModule,
    PublicApiModule,
    IngestApiModule,
    LeaderboardsApiModule,
    PlayersApiModule,
    MeApiModule,
    AdminApiModule,
    MaintenanceModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate, then check what the caller is allowed to do.
    // All of it runs after the throttler, so an unauthenticated flood is cut off
    // before it does any work.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ScopesGuard },
  ],
})
export class AppModule {}
