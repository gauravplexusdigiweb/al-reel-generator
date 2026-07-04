import { Module } from '@nestjs/common';
import { WebhookPublisher } from './webhook.publisher';
import { InstagramPublisher } from './instagram.publisher';
import { YoutubePublisher } from './youtube.publisher';
import { TiktokPublisher } from './tiktok.publisher';
import { PublisherRegistry } from './publisher.registry';

/** Publisher providers + registry, shared by the publish processor and analytics. */
@Module({
  providers: [WebhookPublisher, InstagramPublisher, YoutubePublisher, TiktokPublisher, PublisherRegistry],
  exports: [PublisherRegistry],
})
export class ProvidersModule {}
