import { Injectable, Logger } from '@nestjs/common';
import * as path from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { FfmpegService } from '../../media/ffmpeg.service';
import { SettingsService } from '../../settings/settings.service';
import { computeEnergyEnvelope } from '../util/audio-energy';

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

@Injectable()
export class TranscodeStep {
  private readonly logger = new Logger(TranscodeStep.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ffmpeg: FfmpegService,
    private readonly settings: SettingsService,
  ) {}

  async run(videoId: string, onProgress?: (pct: number) => void): Promise<void> {
    const { sampleFps } = await this.settings.effective();
    const video = await this.prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    const src = this.storage.abs(video.storedPath);
    const srcH = video.height ?? 1080;
    const srcW = video.width ?? Math.round((srcH * 16) / 9);

    const targets = [1080, 720, 480].filter((h) => h <= srcH + 10);
    if (targets.length === 0) targets.push(srcH);

    let done = 0;
    const totalUnits = targets.length + 2; // renditions + audio + frames
    for (const h of targets) {
      const label = `${h}p`;
      const out = path.join(this.storage.renditionsDir(videoId), `${label}.mp4`);
      await this.ffmpeg.transcodeRendition(src, out, h);
      const w = even((srcW * h) / srcH);
      await this.prisma.videoRendition.upsert({
        where: { videoId_label: { videoId, label } },
        create: { videoId, label, path: this.storage.rel(out), width: w, height: h },
        update: { path: this.storage.rel(out), width: w, height: h },
      });
      onProgress?.(Math.round((++done / totalUnits) * 100));
    }

    // audio (best-effort — source may have no audio track)
    const audioAbs = this.storage.audioPath(videoId);
    let sampleRate = 16000;
    let energy: number[] = [];
    try {
      await this.ffmpeg.extractAudioWav(src, audioAbs);
      const env = await computeEnergyEnvelope(audioAbs);
      sampleRate = env.sampleRate;
      energy = env.energy;
    } catch (e) {
      this.logger.warn(`No audio extracted for ${videoId}: ${e}`);
    }
    await this.prisma.videoAudio.upsert({
      where: { videoId },
      create: { videoId, path: this.storage.rel(audioAbs), sampleRate, energy },
      update: { path: this.storage.rel(audioAbs), sampleRate, energy },
    });
    onProgress?.(Math.round((++done / totalUnits) * 100));

    // sampled frames for face/scene/thumbnail analysis
    const framesDir = this.storage.framesDir(videoId);
    await this.storage.remove(framesDir);
    await this.ffmpeg.extractFrames(src, framesDir, sampleFps);
    onProgress?.(100);
  }
}
