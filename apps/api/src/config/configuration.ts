export interface AppConfig {
  api: { port: number; baseUrl: string };
  redis: { host: string; port: number };
  storage: { dataDir: string };
  upload: {
    maxUploadBytes: number;
    allowedFormats: string[];
  };
  pipeline: {
    candidateMin: number;
    candidateMax: number;
    durationBuckets: number[];
    sampleFps: number;
  };
  ai: {
    serviceUrl: string;
    whisperModel: string;
  };
  llm: {
    provider: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
  };
  ffmpeg: { ffmpegPath?: string; ffprobePath?: string };
}

const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : fallback;
};

const list = (v: string | undefined, fallback: string[]): string[] =>
  v && v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback;

export default (): AppConfig => ({
  api: {
    port: num(process.env.API_PORT, 4000),
    baseUrl: process.env.API_BASE_URL || 'http://localhost:4000',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: num(process.env.REDIS_PORT, 6379),
  },
  storage: {
    dataDir: process.env.DATA_DIR || './data',
  },
  upload: {
    maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 2048) * 1024 * 1024,
    allowedFormats: list(process.env.ALLOWED_FORMATS, ['mp4', 'mov', 'mkv', 'avi']),
  },
  pipeline: {
    candidateMin: num(process.env.CANDIDATE_MIN, 10),
    candidateMax: num(process.env.CANDIDATE_MAX, 20),
    durationBuckets: list(process.env.DURATION_BUCKETS, ['15', '30', '45', '60']).map(Number),
    sampleFps: num(process.env.SAMPLE_FPS, 2),
  },
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    whisperModel: process.env.WHISPER_MODEL || 'base',
  },
  llm: {
    provider: process.env.LLM_PROVIDER || 'ollama',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
  },
  ffmpeg: {
    ffmpegPath: process.env.FFMPEG_PATH || undefined,
    ffprobePath: process.env.FFPROBE_PATH || undefined,
  },
});
