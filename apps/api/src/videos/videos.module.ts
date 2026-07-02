import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import { diskStorage } from 'multer';
import { promises as fs } from 'node:fs';
import type { AppConfig } from '../config/configuration';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const dataDir = path.resolve(config.get('storage', { infer: true }).dataDir);
        const tmpDir = path.join(dataDir, 'tmp', 'uploads');
        return {
          storage: diskStorage({
            destination: async (_req, _file, cb) => {
              await fs.mkdir(tmpDir, { recursive: true });
              cb(null, tmpDir);
            },
            filename: (_req, file, cb) => {
              const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
              cb(null, `${Date.now()}-${safe}`);
            },
          }),
          limits: { fileSize: config.get('upload', { infer: true }).maxUploadBytes },
        };
      },
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
