import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SceneDto, TranscriptSegment } from '@arg/shared';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { PipelineDispatcher } from '../../queue/pipeline-dispatcher.service';
import {
  generateCandidateWindows,
  selectCandidates,
  speechDensity,
  windowEnergy,
  windowText,
} from '../util/highlights';

@Injectable()
export class HighlightsStep {
  private readonly buckets: number[];
  private readonly min: number;
  private readonly max: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly dispatcher: PipelineDispatcher,
    config: ConfigService<AppConfig, true>,
  ) {
    const p = config.get('pipeline', { infer: true });
    this.buckets = p.durationBuckets;
    this.min = p.candidateMin;
    this.max = p.candidateMax;
  }

  async run(videoId: string): Promise<void> {
    const video = await this.prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    const durationSec = video.durationSec ?? 0;

    const [transcript, sceneRows, audio] = await Promise.all([
      this.prisma.videoTranscript.findUnique({ where: { videoId } }),
      this.prisma.videoScene.findMany({ where: { videoId } }),
      this.prisma.videoAudio.findUnique({ where: { videoId } }),
    ]);
    const segments = (transcript?.segments as unknown as TranscriptSegment[]) ?? [];
    const scenes: SceneDto[] = sceneRows.map((s) => ({
      startSec: s.startSec,
      endSec: s.endSec,
      motion: s.motion,
    }));
    const energy = (audio?.energy as unknown as number[]) ?? [];

    const pool = generateCandidateWindows({
      durationSec,
      segments,
      scenes,
      buckets: this.buckets,
      poolSize: Math.max(20, this.max * 4),
    });

    // Always start fresh for a full pipeline run.
    await this.prisma.reel.deleteMany({ where: { videoId } });

    if (pool.length === 0) {
      await this.dispatcher.enqueueRenderFlow(videoId, []);
      return;
    }

    const texts = pool.map((w) => windowText(segments, w.startSec, w.endSec));
    const interest = await this.llm.rankPassages(texts);

    const scored = pool.map((window, i) => {
      const sd = speechDensity(segments, window.startSec, window.endSec);
      const en = windowEnergy(energy, window.startSec, window.endSec);
      return { window, score: 0.6 * interest[i] + 0.25 * sd + 0.15 * en };
    });

    const chosen = selectCandidates(scored, this.min, this.max);
    const reelIds: string[] = [];
    for (const w of chosen) {
      const reel = await this.prisma.reel.create({
        data: {
          videoId,
          startSec: w.startSec,
          endSec: w.endSec,
          durationBucket: w.durationBucket,
          status: 'candidate',
        },
      });
      reelIds.push(reel.id);
    }

    await this.dispatcher.enqueueRenderFlow(videoId, reelIds);
  }
}
