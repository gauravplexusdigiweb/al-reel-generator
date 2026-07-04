import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConnectionOptions, Job, Worker } from 'bullmq';
import type { PipelineStep } from '@arg/shared';
import { JOB, PIPELINE_QUEUE, REDIS_CONNECTION } from '../queue/queue.constants';
import { PipelineDispatcher } from '../queue/pipeline-dispatcher.service';
import { StepTracker } from './step-tracker.service';
import { ValidateStep } from './steps/validate.step';
import { TranscodeStep } from './steps/transcode.step';
import { TranscribeStep } from './steps/transcribe.step';
import { ScenesStep } from './steps/scenes.step';
import { FacesStep } from './steps/faces.step';
import { NsfwStep } from './steps/nsfw.step';
import { IdentitiesStep } from './steps/identities.step';
import { HighlightsStep } from './steps/highlights.step';
import { RenderStep } from './steps/render.step';
import { TeaserRenderStep } from './steps/teaser-render.step';
import { FinalizeStep } from './steps/finalize.step';

const JOB_TO_STEP: Record<string, PipelineStep | undefined> = {
  [JOB.validate]: 'validate',
  [JOB.transcode]: 'transcode',
  [JOB.transcribe]: 'transcribe',
  [JOB.scenes]: 'scenes',
  [JOB.faces]: 'faces',
  [JOB.nsfw]: 'nsfw',
  [JOB.identities]: 'identities',
  [JOB.highlights]: 'highlights',
  [JOB.render]: 'render',
  [JOB.finalize]: 'render',
};

@Injectable()
export class PipelineWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PipelineWorker.name);
  private worker?: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly tracker: StepTracker,
    private readonly dispatcher: PipelineDispatcher,
    private readonly validate: ValidateStep,
    private readonly transcode: TranscodeStep,
    private readonly transcribe: TranscribeStep,
    private readonly scenes: ScenesStep,
    private readonly faces: FacesStep,
    private readonly nsfw: NsfwStep,
    private readonly identities: IdentitiesStep,
    private readonly highlights: HighlightsStep,
    private readonly render: RenderStep,
    private readonly teaserRender: TeaserRenderStep,
    private readonly finalize: FinalizeStep,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(PIPELINE_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 2,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job ${job?.name} (${job?.id}) failed: ${err?.message}`),
    );
    this.worker.on('completed', (job) => this.logger.debug(`Job ${job.name} (${job.id}) completed`));
    this.logger.log('Pipeline worker listening on queue "reel-pipeline"');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job): Promise<void> {
    const videoId: string = job.data.videoId;
    try {
      await this.dispatch(job, videoId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const step = JOB_TO_STEP[job.name];
      const isFinal = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.error(`Step "${job.name}" for video ${videoId} errored (final=${isFinal}): ${msg}`);
      if (isFinal && step) await this.tracker.fail(videoId, step, msg);
      throw err; // let BullMQ handle retry/backoff
    }
  }

  private async dispatch(job: Job, videoId: string): Promise<void> {
    switch (job.name) {
      case JOB.validate:
        await this.linear('validate', videoId, () => this.validate.run(videoId), 'transcode');
        break;
      case JOB.transcode:
        await this.tracker.start(videoId, 'transcode');
        await this.transcode.run(videoId, (p) => void this.tracker.progress(videoId, 'transcode', p));
        await this.tracker.complete(videoId, 'transcode');
        await this.dispatcher.enqueueStep(videoId, 'transcribe');
        break;
      case JOB.transcribe:
        await this.linear('transcribe', videoId, () => this.transcribe.run(videoId), 'scenes');
        break;
      case JOB.scenes:
        await this.linear('scenes', videoId, () => this.scenes.run(videoId), 'faces');
        break;
      case JOB.faces:
        await this.linear('faces', videoId, () => this.faces.run(videoId), 'nsfw');
        break;
      case JOB.nsfw:
        await this.linear('nsfw', videoId, () => this.nsfw.run(videoId), 'identities');
        break;
      case JOB.identities:
        await this.linear('identities', videoId, () => this.identities.run(videoId), 'highlights');
        break;
      case JOB.highlights:
        // "next" (render fan-out) is enqueued inside the step itself.
        await this.linear('highlights', videoId, () => this.highlights.run(videoId));
        break;
      case JOB.render: {
        // Teaser variants render as montages; reels render as single clips.
        const reel = await this.render.getReelKind(videoId, job.data.reelId);
        if (reel === 'teaser') await this.teaserRender.run(videoId, job.data.reelId);
        else await this.render.run(videoId, job.data.reelId);
        break;
      }
      case JOB.finalize:
        await this.finalize.run(videoId);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async linear(
    step: PipelineStep,
    videoId: string,
    fn: () => Promise<void>,
    next?: PipelineStep,
  ): Promise<void> {
    await this.tracker.start(videoId, step);
    await fn();
    await this.tracker.complete(videoId, step);
    if (next) await this.dispatcher.enqueueStep(videoId, next);
  }
}
