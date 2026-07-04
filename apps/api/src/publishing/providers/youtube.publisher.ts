import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { promises as fs } from 'node:fs';
import type { SocialAccount, SocialPost } from '@prisma/client';
import type { SocialPlatform } from '@arg/shared';
import type { MetricsResult, PublishInput, PublishResult, PublisherProvider } from './publisher.interface';

/**
 * YouTube Shorts via the Data API v3 resumable upload. Requires an `accessToken`
 * with the `youtube.upload` scope. Uploads the local file bytes directly (no public
 * URL needed).
 */
@Injectable()
export class YoutubePublisher implements PublisherProvider {
  readonly platform: SocialPlatform = 'youtube';

  async upload(account: SocialAccount, input: PublishInput): Promise<PublishResult> {
    const title = (input.title || input.caption || 'Reel').slice(0, 100);
    const description = [input.caption, input.hashtags.map((h) => `#${h}`).join(' '), '#Shorts']
      .filter(Boolean)
      .join('\n\n');

    // 1. Start a resumable session.
    const init = await axios.post(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      { snippet: { title, description }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } },
      { headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' } },
    );
    const uploadUrl = init.headers['location'] as string;
    if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL');

    // 2. Upload the bytes.
    const bytes = await fs.readFile(input.absPath);
    const { data } = await axios.put(uploadUrl, bytes, {
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const id = data.id as string;
    return { platformPostId: id, permalink: `https://youtu.be/${id}` };
  }

  async fetchMetrics(account: SocialAccount, post: SocialPost): Promise<MetricsResult> {
    if (!post.platformPostId) throw new Error('No platformPostId');
    const { data } = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: { part: 'statistics', id: post.platformPostId },
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    const s = data.items?.[0]?.statistics ?? {};
    return {
      views: Number(s.viewCount ?? 0),
      likes: Number(s.likeCount ?? 0),
      comments: Number(s.commentCount ?? 0),
      shares: 0,
    };
  }
}
