import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AiClientService } from '../../ai/ai-client.service';
import { SettingsService } from '../../settings/settings.service';

/** Scores sampled frames for adult/NSFW content (only when the video has a filter set). */
@Injectable()
export class NsfwStep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiClientService,
    private readonly settings: SettingsService,
  ) {}

  async run(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    if (video.adultThreshold <= 0) return; // filter off → skip the model entirely

    const { sampleFps } = await this.settings.effective();
    const samples = await this.ai.detectNsfw(this.storage.framesDir(videoId), sampleFps);
    await this.prisma.videoNsfw.upsert({
      where: { videoId },
      create: { videoId, samples: samples as unknown as Prisma.InputJsonValue },
      update: { samples: samples as unknown as Prisma.InputJsonValue },
    });
  }
}
