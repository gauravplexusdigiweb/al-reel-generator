import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { StorageService } from './storage/storage.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<AppConfig, true>);
  const storage = app.get(StorageService);

  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // Serve stored media (reels, thumbnails) at /files/*
  await storage.ensureDir(storage.dataDir);
  app.useStaticAssets(storage.dataDir, { prefix: '/files/' });

  const swagger = new DocumentBuilder()
    .setTitle('AI Reel Generator API')
    .setDescription('Upload videos and generate scored, captioned 9:16 reels.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get('api', { infer: true }).port;
  await app.listen(port);
  new Logger('Bootstrap').log(`API on http://localhost:${port}  (Swagger: /docs)`);
}

void bootstrap();
