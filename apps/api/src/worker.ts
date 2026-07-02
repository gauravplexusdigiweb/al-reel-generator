import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });
  app.enableShutdownHooks();
  new Logger('Worker').log('Reel pipeline worker started');
}

void bootstrap();
