import { Module } from '@nestjs/common';

import { SecretCipherService } from '../common/crypto/secret-cipher.service';
import { AuthController } from './auth.controller';
import { BackchannelLogoutService } from './backchannel-logout.service';
import { AuthTransactionService } from './auth-transaction.service';
import { OidcClientService } from './oidc-client.service';
import { OidcDiscoveryService } from './oidc-discovery.service';
import { SessionService } from './session.service';

/**
 * Exported rather than kept private, because the guard registered globally in
 * AppModule resolves sessions, and the linking module reuses the same
 * transaction store for the Microsoft flow.
 */
@Module({
  controllers: [AuthController],
  providers: [
    OidcDiscoveryService,
    OidcClientService,
    SecretCipherService,
    SessionService,
    AuthTransactionService,
    BackchannelLogoutService,
  ],
  exports: [SessionService, AuthTransactionService, SecretCipherService, BackchannelLogoutService],
})
export class AuthModule {}
