import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FaceSample, NsfwSample, PersonIdentity, SceneDto, TeaserBeat, TranscriptSegment } from '@arg/shared';
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
import { buildTeaserBeats, nsfwPeak } from '../util/teaser';

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

    const [transcript, sceneRows, audio, facesRow, nsfwRow, identityRow] = await Promise.all([
      this.prisma.videoTranscript.findUnique({ where: { videoId } }),
      this.prisma.videoScene.findMany({ where: { videoId } }),
      this.prisma.videoAudio.findUnique({ where: { videoId } }),
      this.prisma.videoFace.findUnique({ where: { videoId } }),
      this.prisma.videoNsfw.findUnique({ where: { videoId } }),
      this.prisma.videoIdentity.findUnique({ where: { videoId } }),
    ]);
    const segments = (transcript?.segments as unknown as TranscriptSegment[]) ?? [];
    const scenes: SceneDto[] = sceneRows.map((s) => ({ startSec: s.startSec, endSec: s.endSec, motion: s.motion }));
    const energy = (audio?.energy as unknown as number[]) ?? [];
    const faces = (facesRow?.samples as unknown as FaceSample[]) ?? [];
    const nsfw = (nsfwRow?.samples as unknown as NsfwSample[]) ?? [];
    const people = (identityRow?.people as unknown as PersonIdentity[]) ?? [];
    // adultThreshold 0=off; higher = stricter → lower NSFW cutoff.
    const adultCutoff = video.adultThreshold > 0 ? Math.max(0.01, 1 - video.adultThreshold / 100) : 0;

    // Fresh run.
    await this.prisma.reel.deleteMany({ where: { videoId } });

    if (video.outputType === 'teaser') {
      await this.runTeaser(videoId, video, { durationSec, segments, scenes, faces, energy, nsfw, people, adultCutoff });
      return;
    }

    // ---- Reel mode (default) ----
    const pool = generateCandidateWindows({
      durationSec,
      segments,
      scenes,
      buckets: durationBuckets,
      poolSize: Math.max(20, candidateMax * 4),
    }).filter((w) => adultCutoff <= 0 || nsfwPeak(nsfw, w.startSec, w.endSec) < adultCutoff);

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
        data: { videoId, startSec: w.startSec, endSec: w.endSec, durationBucket: w.durationBucket, kind: 'reel', status: 'candidate' },
      });
      reelIds.push(reel.id);
    }
    await this.dispatcher.enqueueRenderFlow(videoId, reelIds);
  }

  private async runTeaser(
    videoId: string,
    video: { teaserCount: number; durationSec: number | null },
    ctx: {
      durationSec: number;
      segments: TranscriptSegment[];
      scenes: SceneDto[];
      faces: FaceSample[];
      energy: number[];
      nsfw: NsfwSample[];
      people: PersonIdentity[];
      adultCutoff: number;
    },
  ): Promise<void> {
    // LLM interest per transcript line (for hook beats).
    const lineTexts = ctx.segments.map((s) => s.text);
    const hookScores = lineTexts.length ? await this.llm.rankPassages(lineTexts) : [];

    const count = Math.max(1, Math.min(5, video.teaserCount || 3));
    const reelIds: string[] = [];
    for (let v = 0; v < count; v++) {
      const beats: TeaserBeat[] = buildTeaserBeats({ ...ctx, hookScores, seed: v + 1 });
      if (beats.length === 0) continue;
      const startSec = Math.min(...beats.map((b) => b.startSec));
      const endSec = Math.max(...beats.map((b) => b.endSec));
      const totalLen = Math.round(beats.reduce((s, b) => s + (b.endSec - b.startSec), 0));
      const reel = await this.prisma.reel.create({
        data: {
          videoId,
          startSec,
          endSec,
          durationBucket: totalLen,
          kind: 'teaser',
          segments: beats as unknown as Prisma.InputJsonValue,
          status: 'candidate',
        },
      });
      reelIds.push(reel.id);
    }
    await this.dispatcher.enqueueRenderFlow(videoId, reelIds);
  }
}
