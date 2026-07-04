import type { SocialAccount, SocialPost } from '@prisma/client';
import type { SocialPlatform } from '@arg/shared';

export interface PublishInput {
  absPath: string; // absolute path to the rendered reel mp4
  fileUrl: string; // public URL the API serves it at (needs to be reachable by the platform)
  title: string | null;
  caption: string;
  hashtags: string[];
}

export interface PublishResult {
  platformPostId: string;
  permalink: string | null;
}

export interface MetricsResult {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTime?: number | null;
  completionRate?: number | null;
}

/**
 * A social platform integration. `upload` publishes a reel; `fetchMetrics` (optional)
 * pulls engagement for analytics. Providers read credentials from the account
 * (`accessToken`, `platformMeta`), so no OAuth redirect flow is required locally.
 */
export interface PublisherProvider {
  readonly platform: SocialPlatform;
  upload(account: SocialAccount, input: PublishInput): Promise<PublishResult>;
  fetchMetrics?(account: SocialAccount, post: SocialPost): Promise<MetricsResult>;
}
