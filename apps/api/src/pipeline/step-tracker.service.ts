import { Injectable } from '@nestjs/common';
import type { PipelineStep } from '@arg/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Writes per-step state/progress to video_processing_jobs for the status UI. */
@Injectable()
export class StepTracker {
  constructor(private readonly prisma: PrismaService) {}

  async start(videoId: string, step: PipelineStep): Promise<void> {
    await this.prisma.videoProcessingJob.upsert({
      where: { videoId_step: { videoId, step } },
      create: { videoId, step, state: 'active', progress: 0, startedAt: new Date() },
      update: { state: 'active', progress: 0, error: null, startedAt: new Date(), finishedAt: null },
    });
  }

  async progress(videoId: string, step: PipelineStep, pct: number): Promise<void> {
    await this.prisma.videoProcessingJob.updateMany({
      where: { videoId, step },
      data: { progress: Math.max(0, Math.min(100, Math.round(pct))) },
    });
  }

  async complete(videoId: string, step: PipelineStep): Promise<void> {
    await this.prisma.videoProcessingJob.updateMany({
      where: { videoId, step },
      data: { state: 'completed', progress: 100, finishedAt: new Date() },
    });
  }

  async fail(videoId: string, step: PipelineStep, error: string): Promise<void> {
    await this.prisma.videoProcessingJob.updateMany({
      where: { videoId, step },
      data: { state: 'failed', error: error.slice(0, 1000), finishedAt: new Date() },
    });
    // updateMany (not update) so a video deleted mid-processing doesn't throw.
    await this.prisma.video.updateMany({
      where: { id: videoId },
      data: { status: 'failed', error: error.slice(0, 1000) },
    });
  }
}
