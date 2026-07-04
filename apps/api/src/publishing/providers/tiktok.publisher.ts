import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { promises as fs } from 'node:fs';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { SocialPlatform } from '@arg/shared';
import type { MetricsResult, PublishInput, PublishResult, PublisherProvider } from './publisher.interface';

const API = 'https://open.tiktokapis.com/v2';

/**
 * TikTok via the Content Posting API (direct post: init → upload bytes). Requires an
 * `accessToken` with `video.publish`. Uploads the local file in a single part.
 */
@Injectable()
export class TiktokPublisher implements PublisherProvider {
  readonly platform: SocialPlatform = 'tiktok';

  async upload(account: SocialAccount, input: PublishInput): Promise<PublishResult> {
    const bytes = await fs.readFile(input.absPath);
    const title = [input.caption, input.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join(' ').slice(0, 150);

    const init = await axios.post(
      `${API}/post/publish/video/init/`,
      {
        post_info: { title, privacy_level: 'PUBLIC_TO_EVERYONE' },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: bytes.length,
          chunk_size: bytes.length,
          total_chunk_count: 1,
        },
      },
      { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } },
    );
    const publishId = init.data?.data?.publish_id as string;
    const uploadUrl = init.data?.data?.upload_url as string;
    if (!uploadUrl) throw new Error(`TikTok init failed: ${JSON.stringify(init.data?.error ?? init.data)}`);

    await axios.put(uploadUrl, bytes, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(bytes.length),
        'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return { platformPostId: publishId, permalink: null };
  }

  async fetchMetrics(account: SocialAccount, post: SocialPost): Promise<MetricsResult> {
    if (!post.platformPostId) throw new Error('No platformPostId');
    const { data } = await axios.post(
      `${API}/video/query/?fields=like_count,comment_count,share_count,view_count`,
      { filters: { video_ids: [post.platformPostId] } },
      { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } },
    );
    const v = data?.data?.videos?.[0] ?? {};
    return {
      views: v.view_count ?? 0,
      likes: v.like_count ?? 0,
      comments: v.comment_count ?? 0,
      shares: v.share_count ?? 0,
    };
  }
}
