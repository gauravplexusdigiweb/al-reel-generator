import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { FfmpegService } from '../../media/ffmpeg.service';

@Injectable()
export class ValidateStep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async run(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    await this.prisma.video.update({ where: { id: videoId }, data: { status: 'validating' } });

    const info = await this.ffmpeg.probe(this.storage.abs(video.storedPath));
    if (!info.durationSec || info.durationSec < 1) {
      throw new Error('Video is too short or has no readable duration');
    }

    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        durationSec: info.durationSec,
        width: info.width,
        height: info.height,
        codec: info.codec,
        sizeBytes: BigInt(info.sizeBytes || video.sizeBytes || 0),
        status: 'processing',
      },
    });
  }
}
