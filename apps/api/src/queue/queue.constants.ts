export const PIPELINE_QUEUE = 'reel-pipeline';
export const PUBLISHING_QUEUE = 'reel-publishing';

// DI tokens
export const REDIS_CONNECTION = 'REDIS_CONNECTION';
export const PIPELINE_QUEUE_TOKEN = 'PIPELINE_QUEUE_TOKEN';
export const FLOW_PRODUCER_TOKEN = 'FLOW_PRODUCER_TOKEN';
export const PUBLISHING_QUEUE_TOKEN = 'PUBLISHING_QUEUE_TOKEN';

// Publishing job names
export const PUBLISH_JOB = {
  publish: 'publish-post',
  refreshAnalytics: 'refresh-analytics',
} as const;

// Job names (one per pipeline step). Must match processor registrations.
export const JOB = {
  validate: 'validate',
  transcode: 'transcode',
  transcribe: 'transcribe',
  scenes: 'scenes',
  faces: 'faces',
  nsfw: 'nsfw',
  identities: 'identities',
  highlights: 'highlights',
  render: 'render', // fan-out: one render job per candidate reel / teaser variant
  finalize: 'finalize',
} as const;

export type JobName = (typeof JOB)[keyof typeof JOB];

export interface PipelineJobData {
  videoId: string;
  // render jobs carry the specific candidate to render
  reelId?: string;
}
