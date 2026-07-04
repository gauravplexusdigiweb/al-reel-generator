import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionOptions, Job, Worker } from 'bullmq';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PublisherRegistry } from './providers/publisher.registry';
import { AnalyticsService } from '../analytics/analytics.service';
import { PublishingDispatcher } from '../queue/publishing-dispatcher.service';
import { PUBLISH_JOB, PUBLISHING_QUEUE, REDIS_CONNECTION } from '../queue/queue.constants';

/** Worker: uploads queued social posts and runs the periodic analytics refresh. */
@Injectable()
export class PublishingProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishingProcessor.name);
  private worker?: Worker;
  private readonly apiBaseUrl: string;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: ConnectionOptions,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly registry: PublisherRegistry,
    private readonly analytics: AnalyticsService,
    private readonly dispatcher: PublishingDispatcher,
    config: ConfigService<AppConfig, true>,
  ) {
    this.apiBaseUrl = config.get('api', { infer: true }).baseUrl;
  }

  async onModuleInit(): Promise<void> {
    await this.dispatcher.ensureAnalyticsSchedule().catch((e) => this.logger.warn(`schedule: ${e}`));
    this.worker = new Worker(PUBLISHING_QUEUE, (job) => this.process(job), {
      connection: this.connection,
      concurrency: 2,
    });
    this.worker.on('failed', (job, err) =>
      this.logger.error(`Publish job ${job?.id} failed: ${err?.message}`),
    );
    this.logger.log('Publishing worker listening on queue "reel-publishing"');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job): Promise<void> {
    if (job.name === PUBLISH_JOB.refreshAnalytics) {
      await this.analytics.refreshAll();
      return;
    }
    if (job.name === PUBLISH_JOB.publish) {
      await this.publishPost(job.data.postId as string);
    }
  }

  private async publishPost(postId: string): Promise<void> {
    const post = await this.prisma.socialPost.findUnique({
      where: { id: postId },
      include: { account: true, reel: true },
    });
    if (!post || post.status === 'published') return;

    await this.prisma.socialPost.update({ where: { id: postId }, data: { status: 'uploading', error: null } });
    try {
      if (!post.reel.filePath) throw new Error('Reel has no rendered file');
      const provider = this.registry.get(post.platform);
      const result = await provider.upload(post.account, {
        absPath: this.storage.abs(post.reel.filePath),
        fileUrl: `${this.apiBaseUrl}${this.storage.publicUrl(post.reel.filePath)}`,
        title: post.reel.suggestedTitle,
        caption: post.caption ?? post.reel.suggestedTitle ?? '',
        hashtags: post.hashtags,
      });
      await this.prisma.socialPost.update({
        where: { id: postId },
        data: {
          status: 'published',
          platformPostId: result.platformPostId,
          permalink: result.permalink,
          publishedAt: new Date(),
          error: null,
        },
      });
      this.logger.log(`Published post ${postId} to ${post.platform} (${result.platformPostId})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.prisma.socialPost.updateMany({
        where: { id: postId },
        data: { status: 'failed', error: msg.slice(0, 1000) },
      });
      throw e; // let BullMQ retry per the job's attempts
    }
  }
}
