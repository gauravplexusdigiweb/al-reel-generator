import { Inject, Injectable } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import { PUBLISH_JOB, PUBLISHING_QUEUE_TOKEN } from './queue.constants';

const OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 200,
  removeOnFail: 500,
};

/** Enqueues social-publish jobs and the periodic analytics refresh. */
@Injectable()
export class PublishingDispatcher {
  constructor(@Inject(PUBLISHING_QUEUE_TOKEN) private readonly queue: Queue) {}

  /** Publish a post now, or after a delay (for scheduled posts). */
  async enqueuePublish(postId: string, delayMs = 0): Promise<void> {
    await this.queue.add(PUBLISH_JOB.publish, { postId }, { ...OPTS, delay: Math.max(0, delayMs) });
  }

  /** One-off analytics refresh across all published posts. */
  async triggerAnalyticsRefresh(): Promise<void> {
    await this.queue.add(PUBLISH_JOB.refreshAnalytics, {}, { removeOnComplete: true, removeOnFail: true });
  }

  /** Idempotently install the repeatable analytics refresh (every 6h). */
  async ensureAnalyticsSchedule(): Promise<void> {
    await this.queue.add(
      PUBLISH_JOB.refreshAnalytics,
      {},
      { repeat: { every: 6 * 60 * 60 * 1000 }, removeOnComplete: true, removeOnFail: true },
    );
  }
}
