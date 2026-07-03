import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as path from 'node:path';
import type { TranscriptSegment } from '@arg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AiClientService } from '../../ai/ai-client.service';
import { SettingsService } from '../../settings/settings.service';
import { FfmpegService } from '../../media/ffmpeg.service';
import { planChunks, mergeTranscriptSegments } from '../util/chunk';

const CHUNK_THRESHOLD_SEC = 600; // 10 min — below this, transcribe in one shot
const CHUNK_SIZE_SEC = 600;
const CHUNK_OVERLAP_SEC = 30;

@Injectable()
export class TranscribeStep {
  private readonly logger = new Logger(TranscribeStep.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: AiClientService,
    private readonly settings: SettingsService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async run(videoId: string): Promise<void> {
    const { retainIntermediates } = await this.settings.effective();
    const audio = await this.prisma.videoAudio.findUnique({ where: { videoId } });

    let result = { language: null as string | null, segments: [] as TranscriptSegment[] };

    if (audio) {
      const audioAbs = this.storage.abs(audio.path);
      const energyArr = (audio.energy as unknown as number[]) ?? [];
      const durationSec = energyArr.length;

      if (durationSec > CHUNK_THRESHOLD_SEC) {
        result = await this.transcribeChunked(audioAbs, durationSec);
      } else {
        result = await this.ai.transcribe(audioAbs);
      }
    }

    await this.prisma.videoTranscript.upsert({
      where: { videoId },
      create: {
        videoId,
        language: result.language,
        segments: result.segments as unknown as Prisma.InputJsonValue,
      },
      update: {
        language: result.language,
        segments: result.segments as unknown as Prisma.InputJsonValue,
      },
    });

    if (result.language) {
      await this.prisma.video.update({ where: { id: videoId }, data: { language: result.language } });
    }

    // Audio WAV is only needed for transcription (energy is already persisted) — purge it.
    if (audio && !retainIntermediates) {
      await this.storage.remove(this.storage.abs(audio.path));
    }
  }

  private async transcribeChunked(
    audioAbs: string,
    durationSec: number,
  ): Promise<{ language: string | null; segments: TranscriptSegment[] }> {
    const chunks = planChunks(durationSec, CHUNK_SIZE_SEC, CHUNK_OVERLAP_SEC);
    this.logger.log(`Chunked transcription: ${chunks.length} chunks for ${durationSec.toFixed(0)}s audio`);

    const chunkResults: Array<{ chunkStart: number; segments: TranscriptSegment[] }> = [];
    let language: string | null = null;

    for (const chunk of chunks) {
      const chunkDur = chunk.endSec - chunk.startSec;
      const chunkPath = path.join(
        path.dirname(audioAbs),
        `chunk-${chunk.startSec.toFixed(0)}-${chunk.endSec.toFixed(0)}.wav`,
      );

      try {
        await this.ffmpeg.extractAudioChunk(audioAbs, chunkPath, chunk.startSec, chunkDur);
        const result = await this.ai.transcribe(chunkPath);
        if (result.language && !language) language = result.language;
        chunkResults.push({ chunkStart: chunk.startSec, segments: result.segments });
      } catch (e) {
        this.logger.warn(`Chunk ${chunk.startSec}-${chunk.endSec} transcription failed: ${e}`);
      } finally {
        await this.storage.remove(chunkPath);
      }
    }

    const merged = mergeTranscriptSegments(chunkResults, CHUNK_OVERLAP_SEC);
    this.logger.log(`Merged ${merged.length} segments from ${chunks.length} chunks`);
    return { language, segments: merged };
  }
}