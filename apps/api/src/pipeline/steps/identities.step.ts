import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AiClientService } from '../../ai/ai-client.service';
import { SettingsService } from '../../settings/settings.service';

/**
 * Clusters faces into people (main-actor detection) for teaser mode, then — as the
 * last step that reads sampled frames — purges the frames directory.
 */
@Injectable()
export class IdentitiesStep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiClientService,
    private readonly settings: SettingsService,
  ) {}

  async run(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    const { sampleFps, retainIntermediates } = await this.settings.effective();
    const framesDir = this.storage.framesDir(videoId);

    // Identity clustering is only needed to build teaser "main-actor entry" beats.
    if (video.outputType === 'teaser') {
      const people = await this.ai.detectIdentities(framesDir, sampleFps);
      await this.prisma.videoIdentity.upsert({
        where: { videoId },
        create: { videoId, people: people as unknown as Prisma.InputJsonValue },
        update: { people: people as unknown as Prisma.InputJsonValue },
      });
    }

    // Frames are no longer needed after this step — purge them.
    if (!retainIntermediates) await this.storage.remove(framesDir);
  }
}
