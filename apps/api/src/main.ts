import 'reflect-metadata';
import { bootstrapEnv, loadEnv } from '@wayrune/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import { createRootLogger } from '@wayrune/observability';
import { AppModule } from './app.module';
import { isAllowedCorsOrigin } from './common/cors-origin';

async function bootstrap() {
  const appEnv = bootstrapEnv();
  const env = loadEnv(true);

  createRootLogger({
    service: env.logServiceName || 'api',
    appEnv: env.appEnv,
    level: env.logLevel,
    pretty: env.logPretty,
  });

  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.use(cookieParser());
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isAllowedCorsOrigin(origin, env));
    },
    credentials: true,
  });
  // ZodExceptionFilter registered via APP_FILTER in AppModule (needs DI)

  await app.listen(env.apiPort);
  const logger = app.get(Logger);
  logger.log(`API listening on ${env.apiPort} (appEnv=${appEnv})`);
}

bootstrap();
