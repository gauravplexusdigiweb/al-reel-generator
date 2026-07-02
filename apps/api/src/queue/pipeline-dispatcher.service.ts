import { Inject, Injectable, Logger } from '@nestjs/common';
import { FlowProducer, JobsOptions, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import type { PipelineStep } from '@arg/shared';
import { PIPELINE_STEPS } from '@arg/shared';
import { FLOW_PRODUCER_TOKEN, JOB, PIPELINE_QUEUE, PIPELINE_QUEUE_TOKEN } from './queue.constants';

const STEP_OPTS: JobsOptions = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 3000 },
  removeOnComplete: 200,
  removeOnFail: 500,
};

/**
 * Single source of truth for enqueuing pipeline work. Used by the API (upload,
 * regenerate) and by the worker (each step enqueues the next). The main chain is
 * linear; the render stage fans out (one job per candidate) with a `finalize`
 * flow-parent that runs only after every render child completes (race-free fan-in).
 */
@Injectable()
export class PipelineDispatcher {
  private readonly logger = new Logger(PipelineDispatcher.name);

  constructor(
    @Inject(PIPELINE_QUEUE_TOKEN) private readonly queue: Queue,
    @Inject(FLOW_PRODUCER_TOKEN) private readonly flow: FlowProducer,
    private readonly prisma: PrismaService,
  ) {}

  /** Seed step rows, mark the video processing, and kick off the first step. */
  async startPipeline(videoId: string): Promise<void> {
    await this.prisma.$transaction(
      PIPELINE_STEPS.map((step) =>
        this.prisma.videoProcessingJob.upsert({
          where: { videoId_step: { videoId, step } },
          create: { videoId, step, state: 'pending', progress: 0 },
          update: { state: 'pending', progress: 0, error: null, startedAt: null, finishedAt: null },
        }),
      ),
    );
    await this.prisma.video.update({
      where: { id: videoId },
      data: { status: 'processing', error: null },
    });
    await this.enqueueStep(videoId, 'validate');
  }

  async enqueueStep(videoId: string, step: PipelineStep): Promise<void> {
    await this.queue.add(step, { videoId }, STEP_OPTS);
  }

  /** Fan-out render jobs with a finalize parent that waits for all of them. */
  async enqueueRenderFlow(videoId: string, reelIds: string[]): Promise<void> {
    if (reelIds.length === 0) {
      // Nothing to render — go straight to finalize.
      await this.queue.add(JOB.finalize, { videoId }, STEP_OPTS);
      return;
    }
    await this.flow.add({
      name: JOB.finalize,
      queueName: PIPELINE_QUEUE,
      data: { videoId },
      opts: { ...STEP_OPTS, attempts: 1 },
      children: reelIds.map((reelId) => ({
        name: JOB.render,
        queueName: PIPELINE_QUEUE,
        data: { videoId, reelId },
        opts: STEP_OPTS,
      })),
    });
  }

  /** Re-render a single existing reel (used by trim / regenerate). */
  async enqueueSingleRender(videoId: string, reelId: string): Promise<void> {
    await this.queue.add(JOB.render, { videoId, reelId }, STEP_OPTS);
  }

  /** Retry a failed video from its earliest non-completed step. */
  async retry(videoId: string): Promise<void> {
    const jobs = await this.prisma.videoProcessingJob.findMany({ where: { videoId } });
    const stateByStep = new Map(jobs.map((j) => [j.step, j.state]));
    const target: PipelineStep =
      PIPELINE_STEPS.find((s) => stateByStep.get(s) !== 'completed') ?? 'render';

    // Reset the target step and everything after it.
    const toReset = PIPELINE_STEPS.slice(PIPELINE_STEPS.indexOf(target));
    await this.prisma.$transaction([
      ...toReset.map((step) =>
        this.prisma.videoProcessingJob.upsert({
          where: { videoId_step: { videoId, step } },
          create: { videoId, step, state: 'pending', progress: 0 },
          update: { state: 'pending', progress: 0, error: null, startedAt: null, finishedAt: null },
        }),
      ),
      this.prisma.video.update({
        where: { id: videoId },
        data: { status: 'processing', error: null },
      }),
    ]);

    // Re-running render alone can't rebuild the fan-out, so restart from highlights.
    await this.enqueueStep(videoId, target === 'render' ? 'highlights' : target);
  }
}
