import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { SocialPlatform } from '@arg/shared';
import type { MetricsResult, PublishInput, PublishResult, PublisherProvider } from './publisher.interface';

const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * Instagram Reels via the Graph API (2-step: create media container → publish).
 * Requires `accessToken` (with instagram_content_publish) and `platformMeta.igUserId`.
 * Note: `video_url` must be publicly reachable, so a plain localhost URL won't work —
 * expose the API (e.g. a tunnel) or host the file publicly.
 */
@Injectable()
export class InstagramPublisher implements PublisherProvider {
  readonly platform: SocialPlatform = 'instagram';

  async upload(account: SocialAccount, input: PublishInput): Promise<PublishResult> {
    const igUserId = (account.platformMeta as { igUserId?: string })?.igUserId;
    if (!igUserId) throw new Error('Instagram account needs platformMeta.igUserId');
    const caption = [input.caption, input.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n');

    const container = await axios.post(`${GRAPH}/${igUserId}/media`, null, {
      params: { media_type: 'REELS', video_url: input.fileUrl, caption, access_token: account.accessToken },
    });
    const creationId = container.data.id as string;

    const published = await axios.post(`${GRAPH}/${igUserId}/media_publish`, null, {
      params: { creation_id: creationId, access_token: account.accessToken },
    });
    const mediaId = published.data.id as string;

    let permalink: string | null = null;
    try {
      const info = await axios.get(`${GRAPH}/${mediaId}`, {
        params: { fields: 'permalink', access_token: account.accessToken },
      });
      permalink = info.data.permalink ?? null;
    } catch {
      /* permalink is best-effort */
    }
    return { platformPostId: mediaId, permalink };
  }

  async fetchMetrics(account: SocialAccount, post: SocialPost): Promise<MetricsResult> {
    if (!post.platformPostId) throw new Error('No platformPostId');
    const { data } = await axios.get(`${GRAPH}/${post.platformPostId}`, {
      params: { fields: 'like_count,comments_count', access_token: account.accessToken },
    });
    let views = 0;
    let shares = 0;
    try {
      const insights = await axios.get(`${GRAPH}/${post.platformPostId}/insights`, {
        params: { metric: 'plays,shares', access_token: account.accessToken },
      });
      for (const m of insights.data.data ?? []) {
        if (m.name === 'plays') views = m.values?.[0]?.value ?? 0;
        if (m.name === 'shares') shares = m.values?.[0]?.value ?? 0;
      }
    } catch {
      /* insights require a business account */
    }
    return { views, likes: data.like_count ?? 0, comments: data.comments_count ?? 0, shares };
  }
}
