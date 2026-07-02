import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AiClientService } from '../../ai/ai-client.service';

@Injectable()
export class FacesStep {
  private readonly sampleFps: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiClientService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.sampleFps = config.get('pipeline', { infer: true }).sampleFps;
  }

  async run(videoId: string): Promise<void> {
    const framesDir = this.storage.framesDir(videoId);
    const samples = await this.ai.detectFaces(framesDir, this.sampleFps);
    await this.prisma.videoFace.upsert({
      where: { videoId },
      create: { videoId, samples: samples as unknown as Prisma.InputJsonValue },
      update: { samples: samples as unknown as Prisma.InputJsonValue },
    });
  }
}
