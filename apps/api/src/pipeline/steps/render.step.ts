import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { FaceSample, SceneDto, TranscriptSegment } from '@arg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { FfmpegService } from '../../media/ffmpeg.service';
import { LlmService } from '../../llm/llm.service';
import { SettingsService } from '../../settings/settings.service';
import { StepTracker } from '../step-tracker.service';
import { pickRendition } from '../util/inputs';
import { buildCropFilter, buildBlurFillFilter, windowHasFace } from '../util/crop';
import { buildCaptions } from '../util/captions';
import { aspectDims } from '../util/aspect';
import { segmentsInWindow, windowText } from '../util/highlights';
import { computeScores } from '../util/scoring';
import { pickThumbnailTimestamps } from '../util/thumbnail';

const FACE_CONFIDENCE = 0.5;

/** Escape a file path for use inside an ffmpeg filtergraph (subtitles=filename=). */
function escapeSubtitlePath(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

@Injectable()
export class RenderStep {
  private readonly logger = new Logger(RenderStep.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly llm: LlmService,
    private readonly tracker: StepTracker,
    private readonly settings: SettingsService,
  ) {}

  async run(videoId: string, reelId: string, onProgress?: (pct: number) => void): Promise<void> {
    const { sampleFps, captionPreset, karaoke } = await this.settings.effective();
    // Mark the aggregate render step active on the first child.
    await this.prisma.videoProcessingJob.updateMany({
      where: { videoId, step: 'render', state: 'pending' },
      data: { state: 'active', startedAt: new Date() },
    });

    const [reel, video, facesRow, transcript, audio, sceneRows, reelTxRow] = await Promise.all([
      this.prisma.reel.findUniqueOrThrow({ where: { id: reelId } }),
      this.prisma.video.findUniqueOrThrow({ where: { id: videoId } }),
      this.prisma.videoFace.findUnique({ where: { videoId } }),
      this.prisma.videoTranscript.findUnique({ where: { videoId } }),
      this.prisma.videoAudio.findUnique({ where: { videoId } }),
      this.prisma.videoScene.findMany({ where: { videoId } }),
      this.prisma.reelTranscript.findUnique({ where: { reelId } }),
    ]);

    const faces = (facesRow?.samples as unknown as FaceSample[]) ?? [];
    const segments = (transcript?.segments as unknown as TranscriptSegment[]) ?? [];
    const energy = (audio?.energy as unknown as number[]) ?? [];
    const scenes: SceneDto[] = sceneRows.map((s) => ({ startSec: s.startSec, endSec: s.endSec, motion: s.motion }));
    const srcW = video.width ?? 1920;
    const srcH = video.height ?? 1080;
    const reelDur = reel.endSec - reel.startSec;
    const target = aspectDims(reel.aspectRatio);
    // Captions edited by the admin are stored on the reel (0-based); prefer them.
    const useEditedTranscript = reel.needsRerender && !!reelTxRow;

    const input = await pickRendition(this.prisma, this.storage, videoId, video.storedPath, ['1080p', '720p', '480p']);

    // Target-aspect video: face-tracked crop when a speaker is present, else blurred fill.
    const hasFace = windowHasFace(faces, reel.startSec, reel.endSec, FACE_CONFIDENCE);
    let filter = hasFace
      ? buildCropFilter(faces, reel.startSec, reel.endSec, srcW, srcH, target, energy)
      : buildBlurFillFilter(target);
    // Word-level karaoke captions when word timings exist, else plain (edited captions win).
    const ass = useEditedTranscript
      ? buildCaptions(reelTxRow!.segments as unknown as TranscriptSegment[], 0, reelDur, captionPreset, karaoke, target)
      : buildCaptions(segments, reel.startSec, reel.endSec, captionPreset, karaoke, target);
    if (ass) {
      const assPath = path.join(this.storage.reelsDir(videoId), `${reelId}.ass`);
      await this.storage.ensureDir(path.dirname(assPath));
      await fs.writeFile(assPath, ass, 'utf8');
      filter += `,subtitles=filename=${escapeSubtitlePath(assPath)}`;
    }

    const out = path.join(this.storage.reelsDir(videoId), `${reelId}.mp4`);
    await this.ffmpeg.renderReel({
      input,
      output: out,
      startSec: reel.startSec,
      endSec: reel.endSec,
      filter,
      onProgress,
    });

    // Smart thumbnails: score candidate frames by face visibility, energy, position.
    const thumbTimes = pickThumbnailTimestamps({
      startSec: reel.startSec,
      endSec: reel.endSec,
      faces,
      energy,
      scenes,
      count: 3,
    });
    const thumbsDir = this.storage.thumbnailsDir(videoId);
    const thumbRelPaths: string[] = [];
    const fallbackTimes = [0.1, 0.5, 0.9].map((f) => reelDur * f);
    for (let i = 0; i < 3; i++) {
      const t = thumbTimes[i] ?? fallbackTimes[i];
      const tp = path.join(thumbsDir, `${reelId}-${i + 1}.jpg`);
      await this.ffmpeg.extractFrameAt(out, Math.min(reelDur - 0.1, t), tp);
      thumbRelPaths.push(this.storage.rel(tp));
    }
    await this.prisma.reelThumbnail.deleteMany({ where: { reelId } });
    await this.prisma.reelThumbnail.createMany({
      data: thumbRelPaths.map((p, i) => ({ reelId, path: p, selected: i === 0 })),
    });

    // Low-res 270x480 preview for quick review in the web UI.
    const previewFile = path.join(this.storage.reelsDir(videoId), `${reelId}-preview.mp4`);
    try {
      await this.ffmpeg.generatePreview(out, previewFile);
    } catch (e) {
      this.logger.warn(`Preview generation failed for ${reelId}: ${e}`);
    }

    // Scores (heuristics + LLM hook/emotion).
    const fullText = windowText(segments, reel.startSec, reel.endSec);
    const openingText = windowText(segments, reel.startSec, Math.min(reel.endSec, reel.startSec + 3));
    const [hookLlm, emotionLlm] = await Promise.all([
      this.llm.scoreHook(openingText || fullText),
      this.llm.scoreEmotion(fullText),
    ]);
    const scores = computeScores({
      startSec: reel.startSec,
      endSec: reel.endSec,
      segments,
      faces,
      scenes,
      energy,
      sampleFps,
      faceConfidence: FACE_CONFIDENCE,
      hookLlm,
      emotionLlm,
    });
    const { rationale, ...scoreFields } = scores;
    await this.prisma.reelScore.upsert({
      where: { reelId },
      create: { reelId, ...scoreFields, rationale: (rationale ?? {}) as Prisma.InputJsonValue },
      update: { ...scoreFields, rationale: (rationale ?? {}) as Prisma.InputJsonValue },
    });

    // Reel-scoped transcript — refresh from the source window unless the admin
    // edited the captions (then keep their version).
    if (!useEditedTranscript) {
      const reelSegs = segmentsInWindow(segments, reel.startSec, reel.endSec).map((s) => ({
        start: Math.max(0, s.start - reel.startSec),
        end: Math.max(0, s.end - reel.startSec),
        text: s.text,
        words: s.words?.map((w) => ({
          start: Math.max(0, w.start - reel.startSec),
          end: Math.max(0, w.end - reel.startSec),
          text: w.text,
        })),
      }));
      await this.prisma.reelTranscript.upsert({
        where: { reelId },
        create: { reelId, segments: reelSegs as unknown as Prisma.InputJsonValue },
        update: { segments: reelSegs as unknown as Prisma.InputJsonValue },
      });
    }

    // Title + tags: generate once (first render); preserve admin edits afterwards.
    const existingTags = await this.prisma.reelTag.count({ where: { reelId } });
    const previewRel = (await this.storage.exists(previewFile)) ? this.storage.rel(previewFile) : null;
    if (!reel.suggestedTitle && existingTags === 0) {
      const { title, tags } = await this.llm.generateTitleAndTags(fullText || 'reel');
      if (tags.length) {
        await this.prisma.reelTag.createMany({
          data: tags.map((t) => ({ reelId, tag: t })),
          skipDuplicates: true,
        });
      }
      await this.prisma.reel.update({
        where: { id: reelId },
        data: { filePath: this.storage.rel(out), suggestedTitle: title, needsRerender: false, previewPath: previewRel },
      });
    } else {
      await this.prisma.reel.update({
        where: { id: reelId },
        data: { filePath: this.storage.rel(out), needsRerender: false, previewPath: previewRel },
      });
    }

    // Aggregate render progress.
    const [total, done] = await Promise.all([
      this.prisma.reel.count({ where: { videoId } }),
      this.prisma.reel.count({ where: { videoId, filePath: { not: null } } }),
    ]);
    await this.tracker.progress(videoId, 'render', total ? (done / total) * 100 : 100);
  }
}
