import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AiClientService } from '../../ai/ai-client.service';
import { pickRendition } from '../util/inputs';

@Injectable()
export class ScenesStep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiClientService,
  ) {}

  async run(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    const input = await pickRendition(this.prisma, this.storage, videoId, video.storedPath, ['720p', '480p', '1080p']);
    const scenes = await this.ai.detectScenes(input);

    await this.prisma.$transaction([
      this.prisma.videoScene.deleteMany({ where: { videoId } }),
      this.prisma.videoScene.createMany({
        data: scenes.map((s) => ({
          videoId,
          startSec: s.startSec,
          endSec: s.endSec,
          motion: s.motion ?? 0,
        })),
      }),
    ]);
  }
}
