import { Global, Module, Provider, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlowProducer, Queue, ConnectionOptions } from 'bullmq';
import type { AppConfig } from '../config/configuration';
import {
  FLOW_PRODUCER_TOKEN,
  PIPELINE_QUEUE,
  PIPELINE_QUEUE_TOKEN,
  PUBLISHING_QUEUE,
  PUBLISHING_QUEUE_TOKEN,
  REDIS_CONNECTION,
} from './queue.constants';
import { PipelineDispatcher } from './pipeline-dispatcher.service';
import { PublishingDispatcher } from './publishing-dispatcher.service';

const connectionProvider: Provider = {
  provide: REDIS_CONNECTION,
  useFactory: (config: ConfigService<AppConfig, true>): ConnectionOptions => {
    const { host, port } = config.get('redis', { infer: true });
    return { host, port, maxRetriesPerRequest: null };
  },
  inject: [ConfigService],
};

const queueProvider: Provider = {
  provide: PIPELINE_QUEUE_TOKEN,
  useFactory: (connection: ConnectionOptions) => new Queue(PIPELINE_QUEUE, { connection }),
  inject: [REDIS_CONNECTION],
};

const flowProvider: Provider = {
  provide: FLOW_PRODUCER_TOKEN,
  useFactory: (connection: ConnectionOptions) => new FlowProducer({ connection }),
  inject: [REDIS_CONNECTION],
};

const publishingQueueProvider: Provider = {
  provide: PUBLISHING_QUEUE_TOKEN,
  useFactory: (connection: ConnectionOptions) => new Queue(PUBLISHING_QUEUE, { connection }),
  inject: [REDIS_CONNECTION],
};

@Global()
@Module({
  providers: [
    connectionProvider,
    queueProvider,
    flowProvider,
    publishingQueueProvider,
    PipelineDispatcher,
    PublishingDispatcher,
  ],
  exports: [
    REDIS_CONNECTION,
    PIPELINE_QUEUE_TOKEN,
    FLOW_PRODUCER_TOKEN,
    PUBLISHING_QUEUE_TOKEN,
    PipelineDispatcher,
    PublishingDispatcher,
  ],
})
export class QueueModule implements OnModuleDestroy {
  constructor(
    @Inject(PIPELINE_QUEUE_TOKEN) private readonly queue: Queue,
    @Inject(FLOW_PRODUCER_TOKEN) private readonly flow: FlowProducer,
    @Inject(PUBLISHING_QUEUE_TOKEN) private readonly publishing: Queue,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.flow.close();
    await this.publishing.close();
  }
}
