import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { MediaModule } from './media/media.module';
import { LlmModule } from './llm/llm.module';
import { AiModule } from './ai/ai.module';
import { QueueModule } from './queue/queue.module';
import { CommonModule } from './common/common.module';
import { SettingsModule } from './settings/settings.module';

/** Shared infrastructure imported by both the API app and the worker app. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    StorageModule,
    MediaModule,
    LlmModule,
    AiModule,
    QueueModule,
    CommonModule,
    SettingsModule,
  ],
})
export class CoreModule {}
