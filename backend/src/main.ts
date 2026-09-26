import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import type { Env } from './config/env.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // nginx terminates TLS and sits in front of this process. Without trusting
  // it, request.ip is the proxy for every caller, which would make the rate
  // limiting and the audit log useless.
  app.set('trust proxy', 1);

  const publicOrigin = config.get('PUBLIC_ORIGIN', { infer: true });

  // Unlike the account system, this backend has no reason to know its public
  // subpath at the routing level: it emits no absolute URLs of its own and
  // nginx strips /mc/link/api before proxying, so the internal paths stay
  // clean. PUBLIC_ORIGIN is only used to build the redirect URIs the two
  // identity providers redirect back to.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Observer')
    .setDescription(
      'Minecraft profile linking and cross-server statistics for the smto.dev network. ' +
        'The ingest endpoints are what the server plugins call; see docs/api.md.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-Api-Key', in: 'header' }, 'api-key')
    .addServer(publicOrigin)
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  new Logger('Bootstrap').log(`Listening on port ${port}, public origin ${publicOrigin}`);
}

void bootstrap();
