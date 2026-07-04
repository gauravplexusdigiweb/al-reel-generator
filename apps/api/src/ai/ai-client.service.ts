import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import type { AppConfig } from '../config/configuration';
import type { FaceSample, NsfwSample, PersonIdentity, SceneDto, TranscriptSegment } from '@arg/shared';

export interface TranscribeResult {
  language: string | null;
  segments: TranscriptSegment[];
}

/**
 * HTTP client for the Python ai-service (Whisper / PySceneDetect / MediaPipe).
 * Both processes run on the same host and share DATA_DIR, so we pass absolute
 * file paths rather than uploading media. Each method degrades to an empty
 * result when the service is unreachable so the pipeline never hard-fails.
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly http: AxiosInstance;
  private readonly whisperModel: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const ai = config.get('ai', { infer: true });
    this.whisperModel = ai.whisperModel;
    this.http = axios.create({ baseURL: ai.serviceUrl, timeout: 30 * 60_000 });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.http.get('/health', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async transcribe(audioPath: string): Promise<TranscribeResult> {
    try {
      const { data } = await this.http.post('/transcribe', {
        path: audioPath,
        model: this.whisperModel,
      });
      return {
        language: data.language ?? null,
        segments: (data.segments ?? []) as TranscriptSegment[],
      };
    } catch (e) {
      this.logger.warn(`transcribe unavailable, returning empty transcript: ${e}`);
      return { language: null, segments: [] };
    }
  }

  async detectScenes(videoPath: string): Promise<SceneDto[]> {
    try {
      const { data } = await this.http.post('/scenes', { path: videoPath });
      return (data.scenes ?? []) as SceneDto[];
    } catch (e) {
      this.logger.warn(`scenes unavailable, returning none: ${e}`);
      return [];
    }
  }

  async detectFaces(framesDir: string, fps: number): Promise<FaceSample[]> {
    try {
      const { data } = await this.http.post('/faces', { frames_dir: framesDir, fps });
      return (data.samples ?? []) as FaceSample[];
    } catch (e) {
      this.logger.warn(`faces unavailable, returning none (center-crop fallback): ${e}`);
      return [];
    }
  }

  async detectNsfw(framesDir: string, fps: number): Promise<NsfwSample[]> {
    try {
      const { data } = await this.http.post('/nsfw', { frames_dir: framesDir, fps });
      return (data.samples ?? []) as NsfwSample[];
    } catch (e) {
      this.logger.warn(`nsfw unavailable, returning none (no adult filtering): ${e}`);
      return [];
    }
  }

  async detectIdentities(framesDir: string, fps: number): Promise<PersonIdentity[]> {
    try {
      const { data } = await this.http.post('/identities', { frames_dir: framesDir, fps });
      return (data.people ?? []) as PersonIdentity[];
    } catch (e) {
      this.logger.warn(`identities unavailable, returning none: ${e}`);
      return [];
    }
  }
}
