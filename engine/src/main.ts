import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Runs the HTTP API and the background scanner in one process. The scanner
 * self-starts on bootstrap (OnApplicationBootstrap) and the API serves the
 * latest snapshot plus bet logging. CORS is open in dev so the Next.js
 * dashboard (default :5000) can call the API (default :5001).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? true });

  const port = parseInt(process.env.PORT ?? '5001', 10);
  await app.listen(port);
  new Logger('Bootstrap').log(`Arb engine API listening on http://localhost:${port}`);
}

void bootstrap();
