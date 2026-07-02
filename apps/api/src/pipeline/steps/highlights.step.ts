import { Injectable } from '@nestjs/common';
import type { SceneDto, TranscriptSegment } from '@arg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/llm.service';
import { PipelineDispatcher } from '../../queue/pipeline-dispatcher.service';
import { SettingsService } from '../../settings/settings.service';
import {
  generateCandidateWindows,
  selectCandidates,
  speechDensity,
  windowEnergy,
  windowText,
} from '../util/highlights';

@Injectable()
export class HighlightsStep {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly dispatcher: PipelineDispatcher,
    private readonly settings: SettingsService,
  ) {}

  async run(videoId: string): Promise<void> {
    const { durationBuckets, candidateMin, candidateMax } = await this.settings.effective();
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
      buckets: durationBuckets,
      poolSize: Math.max(20, candidateMax * 4),
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

    const chosen = selectCandidates(scored, candidateMin, candidateMax);
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
