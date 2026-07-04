import { Injectable, NotImplementedException } from '@nestjs/common';
import type { SocialPlatform } from '@arg/shared';
import type { PublisherProvider } from './publisher.interface';
import { WebhookPublisher } from './webhook.publisher';
import { InstagramPublisher } from './instagram.publisher';
import { YoutubePublisher } from './youtube.publisher';
import { TiktokPublisher } from './tiktok.publisher';

@Injectable()
export class PublisherRegistry {
  private readonly map: Map<SocialPlatform, PublisherProvider>;

  constructor(
    webhook: WebhookPublisher,
    instagram: InstagramPublisher,
    youtube: YoutubePublisher,
    tiktok: TiktokPublisher,
  ) {
    this.map = new Map(
      [webhook, instagram, youtube, tiktok].map((p) => [p.platform, p] as const),
    );
  }

  get(platform: SocialPlatform): PublisherProvider {
    const p = this.map.get(platform);
    if (!p) throw new NotImplementedException(`No publisher for platform "${platform}"`);
    return p;
  }
}
