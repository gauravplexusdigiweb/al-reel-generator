import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { SocialAccount } from '@prisma/client';
import type { SocialPlatform } from '@arg/shared';
import type { PublishInput, PublishResult, PublisherProvider } from './publisher.interface';

/**
 * Fully-working, locally-testable publisher: POSTs the reel (metadata + file URL)
 * to a webhook URL stored in the account's `accessToken`. Point it at your own
 * endpoint, a Zapier/Make hook, or https://webhook.site to see it end-to-end.
 */
@Injectable()
export class WebhookPublisher implements PublisherProvider {
  readonly platform: SocialPlatform = 'webhook';
  private readonly logger = new Logger(WebhookPublisher.name);

  async upload(account: SocialAccount, input: PublishInput): Promise<PublishResult> {
    const url = account.accessToken;
    if (!url || !/^https?:\/\//.test(url)) {
      throw new Error('Webhook account has no valid URL (store it in accessToken)');
    }
    const { data, status } = await axios.post(
      url,
      {
        title: input.title,
        caption: input.caption,
        hashtags: input.hashtags,
        fileUrl: input.fileUrl,
      },
      { timeout: 30_000, validateStatus: () => true },
    );
    if (status >= 400) throw new Error(`Webhook responded ${status}`);
    const id = (data && (data.id || data.postId)) || `webhook-${Date.now()}`;
    const permalink = (data && (data.permalink || data.url)) || url;
    this.logger.log(`Delivered reel to webhook ${url} (id ${id})`);
    return { platformPostId: String(id), permalink };
  }
}
