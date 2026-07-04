import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { FaceSample, TeaserBeat, TranscriptSegment } from '@arg/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { FfmpegService } from '../../media/ffmpeg.service';
import { LlmService } from '../../llm/llm.service';
import { StepTracker } from '../step-tracker.service';
import { pickRendition } from '../util/inputs';
import { buildCropFilter, buildBlurFillFilter, windowHasFace } from '../util/crop';
import { buildBeatTextAss } from '../util/captions';
import { windowText } from '../util/highlights';
import { pickMusicWindow } from '../util/teaser';
import { aspectDims } from '../util/aspect';

const FACE_CONFIDENCE = 0.5;

function escSub(p: string): string {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** Renders a teaser: cuts each beat with crop + effect + animated text, concats them
 *  with transitions, and lays a music bed (source extract or custom). */
@Injectable()
export class TeaserRenderStep {
  private readonly logger = new Logger(TeaserRenderStep.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly llm: LlmService,
    private readonly tracker: StepTracker,
  ) {}

  async run(videoId: string, reelId: string): Promise<void> {
    await this.prisma.videoProcessingJob.updateMany({
      where: { videoId, step: 'render', state: 'pending' },
      data: { state: 'active', startedAt: new Date() },
    });

    const [reel, video, facesRow, transcript, audio] = await Promise.all([
      this.prisma.reel.findUniqueOrThrow({ where: { id: reelId } }),
      this.prisma.video.findUniqueOrThrow({ where: { id: videoId } }),
      this.prisma.videoFace.findUnique({ where: { videoId } }),
      this.prisma.videoTranscript.findUnique({ where: { videoId } }),
      this.prisma.videoAudio.findUnique({ where: { videoId } }),
    ]);

    const beats = (reel.segments as unknown as TeaserBeat[]) ?? [];
    if (beats.length === 0) throw new Error('Teaser has no beats');
    const faces = (facesRow?.samples as unknown as FaceSample[]) ?? [];
    const segments = (transcript?.segments as unknown as TranscriptSegment[]) ?? [];
    const energy = (audio?.energy as unknown as number[]) ?? [];
    const srcW = video.width ?? 1920;
    const srcH = video.height ?? 1080;
    const target = aspectDims(reel.aspectRatio);
    const input = await pickRendition(this.prisma, this.storage, videoId, video.storedPath, ['1080p', '720p', '480p']);
    const workDir = path.join(this.storage.reelsDir(videoId), `${reelId}-beats`);
    await this.storage.remove(workDir);
    await this.storage.ensureDir(workDir);

    // 1. Render each beat.
    const beatFiles: string[] = [];
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const len = Math.max(0.6, b.endSec - b.startSec);
      const out = path.join(workDir, `beat-${String(i).padStart(3, '0')}.mp4`);
      const base = windowHasFace(faces, b.startSec, b.endSec, FACE_CONFIDENCE)
        ? buildCropFilter(faces, b.startSec, b.endSec, srcW, srcH, target)
        : buildBlurFillFilter(target);

      const textFilter = await this.beatTextFilter(b, len, target, video.captionsEnabled, workDir, i);
      const withEffect = this.applyEffect(base, b, len, target) + textFilter;
      const safe = this.applyTransition(base, b, len) + textFilter;

      try {
        await this.ffmpeg.renderClip({ input, output: out, startSec: b.startSec, durationSec: len, vf: withEffect });
      } catch (e) {
        this.logger.warn(`beat ${i} effect render failed, retrying plain: ${e}`);
        await this.ffmpeg.renderClip({ input, output: out, startSec: b.startSec, durationSec: len, vf: safe });
      }
      beatFiles.push(out);
    }

    // 2. Concat beats.
    const listFile = path.join(workDir, 'list.txt');
    await fs.writeFile(listFile, beatFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
    const concatOut = path.join(workDir, 'concat.mp4');
    await this.ffmpeg.concatClips(listFile, concatOut);

    // 3. Music bed.
    const finalOut = path.join(this.storage.reelsDir(videoId), `${reelId}.mp4`);
    const totalLen = beats.reduce((s, b) => s + (b.endSec - b.startSec), 0);
    const musicPath = await this.resolveMusic(video, energy, totalLen, workDir, this.storage.abs(video.storedPath));
    if (musicPath) {
      await this.ffmpeg.mixMusic({ videoInput: concatOut, musicInput: musicPath, output: finalOut, musicVolume: 0.75, keepOriginal: true });
    } else {
      await fs.copyFile(concatOut, finalOut);
    }

    // 4. Preview + thumbnails.
    const previewFile = path.join(this.storage.reelsDir(videoId), `${reelId}-preview.mp4`);
    let previewRel: string | null = null;
    try {
      await this.ffmpeg.generatePreview(finalOut, previewFile);
      previewRel = this.storage.rel(previewFile);
    } catch (e) {
      this.logger.warn(`preview failed for ${reelId}: ${e}`);
    }
    const thumbsDir = this.storage.thumbnailsDir(videoId);
    const thumbRel: string[] = [];
    for (let i = 0; i < 3; i++) {
      const tp = path.join(thumbsDir, `${reelId}-${i + 1}.jpg`);
      await this.ffmpeg.extractFrameAt(finalOut, Math.min(totalLen - 0.2, totalLen * [0.15, 0.5, 0.85][i]), tp);
      thumbRel.push(this.storage.rel(tp));
    }
    await this.prisma.reelThumbnail.deleteMany({ where: { reelId } });
    await this.prisma.reelThumbnail.createMany({ data: thumbRel.map((p, i) => ({ reelId, path: p, selected: i === 0 })) });

    // 5. Title + tags (once).
    const beatText = beats.map((b) => b.text).filter(Boolean).join('. ') || windowText(segments, 0, video.durationSec ?? 1e9);
    const existingTags = await this.prisma.reelTag.count({ where: { reelId } });
    if (!reel.suggestedTitle && existingTags === 0) {
      const { title, tags } = await this.llm.generateTitleAndTags(beatText || 'teaser trailer');
      if (tags.length) {
        await this.prisma.reelTag.createMany({ data: tags.map((t) => ({ reelId, tag: t })), skipDuplicates: true });
      }
      await this.prisma.reel.update({
        where: { id: reelId },
        data: { filePath: this.storage.rel(finalOut), suggestedTitle: title, previewPath: previewRel, needsRerender: false },
      });
    } else {
      await this.prisma.reel.update({
        where: { id: reelId },
        data: { filePath: this.storage.rel(finalOut), previewPath: previewRel, needsRerender: false },
      });
    }

    await this.storage.remove(workDir);

    const [total, done] = await Promise.all([
      this.prisma.reel.count({ where: { videoId } }),
      this.prisma.reel.count({ where: { videoId, filePath: { not: null } } }),
    ]);
    await this.tracker.progress(videoId, 'render', total ? (done / total) * 100 : 100);
  }

  private applyEffect(base: string, b: TeaserBeat, len: number, target: { w: number; h: number }): string {
    let vf = base;
    if (b.effect === 'flash') vf += `,fade=t=in:st=0:d=0.12:color=white`;
    if (b.effect === 'zoom-in')
      vf += `,zoompan=z='min(1.0+0.0022*in\\,1.14)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${target.w}x${target.h}:fps=30`;
    if (b.effect === 'zoom-out')
      vf += `,zoompan=z='max(1.14-0.0022*in\\,1.0)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${target.w}x${target.h}:fps=30`;
    return this.applyTransition(vf, b, len);
  }

  private applyTransition(vf: string, b: TeaserBeat, len: number): string {
    if (b.transition && b.transition !== 'cut') {
      vf += `,fade=t=in:st=0:d=0.2,fade=t=out:st=${Math.max(0, len - 0.2).toFixed(2)}:d=0.2`;
    }
    return vf;
  }

  private async beatTextFilter(
    b: TeaserBeat,
    len: number,
    target: { w: number; h: number },
    captionsEnabled: boolean,
    workDir: string,
    i: number,
  ): Promise<string> {
    if (!captionsEnabled || !b.text) return '';
    const ass = buildBeatTextAss(b.text, len, b.textSize ?? 'small', target);
    if (!ass) return '';
    const ap = path.join(workDir, `beat-${i}.ass`);
    await fs.writeFile(ap, ass, 'utf8');
    return `,subtitles=filename=${escSub(ap)}`;
  }

  private async resolveMusic(
    video: { musicSource: string; musicPath: string | null },
    energy: number[],
    totalLen: number,
    workDir: string,
    sourceVideoAbs: string,
  ): Promise<string | null> {
    if (video.musicSource === 'none') return null;
    if (video.musicSource === 'custom' && video.musicPath) {
      const p = this.storage.abs(video.musicPath);
      return (await this.storage.exists(p)) ? p : null;
    }
    // original: extract the strongest audio window straight from the source video
    // (the extracted WAV may already be purged, but the source always has its audio).
    if (await this.storage.exists(sourceVideoAbs)) {
      try {
        const start = pickMusicWindow(energy, totalLen);
        const seg = path.join(workDir, 'music.wav');
        await this.ffmpeg.extractAudioWindow(sourceVideoAbs, seg, start, Math.max(1, totalLen));
        return seg;
      } catch (e) {
        this.logger.warn(`music extract failed: ${e}`);
      }
    }
    return null;
  }
}
