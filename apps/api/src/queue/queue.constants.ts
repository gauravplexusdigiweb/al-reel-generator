export const PIPELINE_QUEUE = 'reel-pipeline';

// DI tokens
export const REDIS_CONNECTION = 'REDIS_CONNECTION';
export const PIPELINE_QUEUE_TOKEN = 'PIPELINE_QUEUE_TOKEN';
export const FLOW_PRODUCER_TOKEN = 'FLOW_PRODUCER_TOKEN';

// Job names (one per pipeline step). Must match processor registrations.
export const JOB = {
  validate: 'validate',
  transcode: 'transcode',
  transcribe: 'transcribe',
  scenes: 'scenes',
  faces: 'faces',
  highlights: 'highlights',
  render: 'render', // fan-out: one render job per candidate reel
  finalize: 'finalize',
} as const;

export type JobName = (typeof JOB)[keyof typeof JOB];

export interface PipelineJobData {
  videoId: string;
  // render jobs carry the specific candidate to render
  reelId?: string;
}
