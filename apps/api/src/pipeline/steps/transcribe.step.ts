import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AiClientService } from '../../ai/ai-client.service';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class TranscribeStep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiClientService,
    private readonly settings: SettingsService,
  ) {}

  async run(videoId: string): Promise<void> {
    const { retainIntermediates } = await this.settings.effective();
    const audio = await this.prisma.videoAudio.findUnique({ where: { videoId } });
    const result = audio
      ? await this.ai.transcribe(this.storage.abs(audio.path))
      : { language: null, segments: [] };

    await this.prisma.videoTranscript.upsert({
      where: { videoId },
      create: {
        videoId,
        language: result.language,
        segments: result.segments as unknown as Prisma.InputJsonValue,
      },
      update: {
        language: result.language,
        segments: result.segments as unknown as Prisma.InputJsonValue,
      },
    });

    if (result.language) {
      await this.prisma.video.update({ where: { id: videoId }, data: { language: result.language } });
    }

    // Audio WAV is only needed for transcription (energy is already persisted) — purge it.
    if (audio && !retainIntermediates) {
      await this.storage.remove(this.storage.abs(audio.path));
    }
  }
}
