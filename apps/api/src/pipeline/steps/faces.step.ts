import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AiClientService } from '../../ai/ai-client.service';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class FacesStep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiClientService,
    private readonly settings: SettingsService,
  ) {}

  async run(videoId: string): Promise<void> {
    const { sampleFps, retainIntermediates } = await this.settings.effective();
    const framesDir = this.storage.framesDir(videoId);
    const samples = await this.ai.detectFaces(framesDir, sampleFps);
    await this.prisma.videoFace.upsert({
      where: { videoId },
      create: { videoId, samples: samples as unknown as Prisma.InputJsonValue },
      update: { samples: samples as unknown as Prisma.InputJsonValue },
    });
    // Frames are only needed for face detection — purge them to save disk.
    if (!retainIntermediates) await this.storage.remove(framesDir);
  }
}
