// Shared domain types & DTOs used by both the NestJS API and the Next.js web app.

export type VideoStatus =
  | 'uploaded'
  | 'validating'
  | 'processing'
  | 'ready'
  | 'failed';

export type PipelineStep =
  | 'validate'
  | 'transcode'
  | 'transcribe'
  | 'scenes'
  | 'faces'
  | 'highlights'
  | 'render';

export const PIPELINE_STEPS: PipelineStep[] = [
  'validate',
  'transcode',
  'transcribe',
  'scenes',
  'faces',
  'highlights',
  'render',
];

export type JobState = 'pending' | 'active' | 'completed' | 'failed';

export type ReelStatus = 'candidate' | 'approved' | 'rejected' | 'published';

// ---- Consolidated constants (single source of truth) ----

export const ASPECT_RATIOS = ['9:16', '1:1', '4:5'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const DURATION_BUCKETS = [15, 30, 45, 60] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export type ReviewAction =
  | 'approve'
  | 'reject'
  | 'trim'
  | 'regenerate'
  | 'publish';

export interface TranscriptWord {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface TranscriptSegment {
  start: number; // seconds
  end: number; // seconds
  text: string;
  words?: TranscriptWord[]; // present when word-level timestamps are available
}

export interface SceneDto {
  startSec: number;
  endSec: number;
  motion: number; // 0..1 relative motion metric
}

/** Per-time face detection sample: box normalized to [0,1] of frame dims. */
export interface FaceSample {
  t: number; // seconds
  boxes: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    score: number;
  }>;
}

export interface ReelScoreDto {
  hook: number;
  emotion: number;
  speech: number;
  motion: number;
  faceVisibility: number;
  sceneQuality: number;
  replayPrediction: number;
  overall: number;
  rationale?: Record<string, unknown>;
}

export interface ThumbnailDto {
  id: string;
  url: string;
  selected: boolean;
}

export interface ReelDto {
  id: string;
  videoId: string;
  startSec: number;
  endSec: number;
  durationBucket: DurationBucket;
  status: ReelStatus;
  suggestedTitle: string | null;
  tags: string[];
  fileUrl: string | null;
  previewUrl: string | null;
  needsRerender: boolean;
  aspectRatio: string;
  categoryId: string | null;
  score: ReelScoreDto | null;
  thumbnails: ThumbnailDto[];
  transcript: TranscriptSegment[];
  posts: SocialPostDto[];
  createdAt: string;
}

export interface VideoDto {
  id: string;
  originalFilename: string;
  status: VideoStatus;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  sizeBytes: number | null;
  language: string | null;
  categoryId: string | null;
  createdAt: string;
}

export interface StepStatusDto {
  step: PipelineStep;
  state: JobState;
  progress: number; // 0..100
  error: string | null;
}

export interface VideoStatusDto {
  video: VideoDto;
  steps: StepStatusDto[];
  overallProgress: number; // 0..100
}

// ---- Request payloads ----

export interface TrimReelRequest {
  startSec: number;
  endSec: number;
}

export interface RegenerateReelRequest {
  durationBucket?: DurationBucket;
  aspectRatio?: string;
}

export interface SelectThumbnailRequest {
  thumbnailId: string;
}

// ---- Category / Directory types ----

export interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  videoCount: number;
  reelCount: number;
  children: CategoryDto[];
  createdAt: string;
}

export interface CreateCategoryRequest {
  name: string;
  parentId?: string | null;
}

export interface UpdateCategoryRequest {
  name?: string;
  sortOrder?: number;
  parentId?: string | null;
}

// ---- Social publishing types ----

export type SocialPlatform = 'instagram' | 'youtube' | 'tiktok' | 'webhook';

export const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'youtube', 'tiktok', 'webhook'];

export type SocialPostStatus = 'pending' | 'uploading' | 'published' | 'failed';

export interface SocialAccountDto {
  id: string;
  platform: SocialPlatform;
  displayName: string;
  connectedAt: string;
  tokenExpiresAt: string | null;
  platformMeta: Record<string, unknown> | null;
}

export interface SocialPostDto {
  id: string;
  reelId: string;
  accountId: string;
  platform: SocialPlatform;
  status: SocialPostStatus;
  platformPostId: string | null;
  permalink: string | null;
  caption: string | null;
  hashtags: string[];
  error: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface PublishReelRequest {
  accountIds: string[];
  caption?: string;
  hashtags?: string[];
  scheduledAt?: string;
  thumbnailId?: string;
  platformOptions?: Record<string, Record<string, unknown>>;
}

// ---- Analytics types (Phase F) ----

export interface ReelAnalyticsDto {
  id: string;
  reelId: string;
  platform: SocialPlatform;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watchTime: number | null;
  completionRate: number | null;
  fetchedAt: string;
}

/**
 * Connect a social account. Full browser OAuth needs a registered app + public
 * redirect URL, so for local/personal use we accept a token you generate yourself
 * (for the `webhook` platform, put the destination URL in `accessToken`).
 */
export interface ConnectAccountRequest {
  accessToken: string;
  refreshToken?: string;
  displayName?: string;
  platformMeta?: Record<string, unknown>;
}

export interface ManualAnalyticsRequest {
  platform: SocialPlatform;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  watchTime?: number;
  completionRate?: number;
}

/** Aggregate performance insights ("founder dashboard"), computed from analytics. */
export interface InsightsDto {
  totalReels: number;
  publishedReels: number;
  totals: { views: number; likes: number; comments: number; shares: number };
  avgCompletionRate: number | null;
  bestCategories: Array<{ categoryId: string | null; name: string; views: number; reels: number }>;
  bestDurationBuckets: Array<{ durationBucket: number; avgViews: number; reels: number }>;
  bestHooks: Array<{ tag: string; avgViews: number; reels: number }>;
  bestUploadHours: Array<{ hour: number; avgViews: number; reels: number }>;
  topReels: Array<{
    reelId: string;
    title: string | null;
    views: number;
    likes: number;
    engagementRate: number;
  }>;
  recommendations: string[];
}
