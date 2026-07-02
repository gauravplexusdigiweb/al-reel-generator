import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StepTracker } from '../step-tracker.service';

@Injectable()
export class FinalizeStep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tracker: StepTracker,
  ) {}

  async run(videoId: string): Promise<void> {
    await this.tracker.complete(videoId, 'render');
    // Don't override a failed video.
    await this.prisma.video.updateMany({
      where: { id: videoId, status: { not: 'failed' } },
      data: { status: 'ready' },
    });
  }
}
