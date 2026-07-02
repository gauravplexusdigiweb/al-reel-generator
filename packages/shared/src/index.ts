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

export type DurationBucket = 15 | 30 | 45 | 60;

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
  needsRerender: boolean;
  score: ReelScoreDto | null;
  thumbnails: ThumbnailDto[];
  transcript: TranscriptSegment[];
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
  category: string | null;
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
}

export interface SelectThumbnailRequest {
  thumbnailId: string;
}
