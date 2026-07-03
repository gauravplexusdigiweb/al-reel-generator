import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from '../config/configuration';

// Static binaries (no system ffmpeg install needed). Overridable via env.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegStatic: string | null = require('ffmpeg-static');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobeStatic: { path: string } = require('ffprobe-static');

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  codec: string;
  formatName: string;
  sizeBytes: number;
  hasAudio: boolean;
}

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);
  private readonly ffmpegBin: string;
  private readonly ffprobeBin: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const cfg = config.get('ffmpeg', { infer: true });
    this.ffmpegBin = cfg.ffmpegPath || ffmpegStatic || 'ffmpeg';
    this.ffprobeBin = cfg.ffprobePath || ffprobeStatic?.path || 'ffprobe';
  }

  /** Run ffmpeg with args. onProgress receives 0..100 based on `-progress` output. */
  run(args: string[], totalDurationSec?: number, onProgress?: (pct: number) => void): Promise<void> {
    return this.exec(this.ffmpegBin, ['-y', '-hide_banner', '-loglevel', 'error', ...args], totalDurationSec, onProgress);
  }

  async probe(input: string): Promise<ProbeResult> {
    const out = await this.execCapture(this.ffprobeBin, [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      input,
    ]);
    const json = JSON.parse(out) as {
      format?: { duration?: string; size?: string; format_name?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        height?: number;
      }>;
    };
    const video = json.streams?.find((s) => s.codec_type === 'video');
    const hasAudio = !!json.streams?.some((s) => s.codec_type === 'audio');
    if (!video) throw new Error('No video stream found in file');
    return {
      durationSec: Number(json.format?.duration ?? 0),
      width: video.width ?? 0,
      height: video.height ?? 0,
      codec: video.codec_name ?? 'unknown',
      formatName: json.format?.format_name ?? 'unknown',
      sizeBytes: Number(json.format?.size ?? 0),
      hasAudio,
    };
  }

  /** Downscale to a target height (keeping aspect, even width), H.264 + AAC. */
  async transcodeRendition(input: string, output: string, targetHeight: number): Promise<void> {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await this.run([
      '-i', input,
      '-vf', `scale=-2:${targetHeight}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      output,
    ]);
  }

  /** Extract mono 16k WAV for speech recognition. */
  async extractAudioWav(input: string, output: string): Promise<void> {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await this.run(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', output]);
  }

  /** Sample frames at `fps` to outDir/frame-000001.jpg ... */
  async extractFrames(input: string, outDir: string, fps: number): Promise<void> {
    await fs.mkdir(outDir, { recursive: true });
    await this.run([
      '-i', input,
      '-vf', `fps=${fps}`,
      '-q:v', '3',
      path.join(outDir, 'frame-%06d.jpg'),
    ]);
  }

  /** Extract a single JPEG frame at a timestamp. */
  async extractFrameAt(input: string, timeSec: number, output: string): Promise<void> {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await this.run(['-ss', timeSec.toFixed(3), '-i', input, '-frames:v', '1', '-q:v', '2', output]);
  }

  /**
   * Render a 9:16 reel from [start,end] applying a video filter chain (crop + subtitles),
   * re-encoding to 1080x1920.
   */
  async renderReel(opts: {
    input: string;
    output: string;
    startSec: number;
    endSec: number;
    filter: string; // full -vf chain producing 1080x1920
    onProgress?: (pct: number) => void;
  }): Promise<void> {
    const { input, output, startSec, endSec, filter, onProgress } = opts;
    await fs.mkdir(path.dirname(output), { recursive: true });
    const dur = Math.max(0.1, endSec - startSec);
    await this.run(
      [
        '-ss', startSec.toFixed(3),
        '-i', input,
        '-t', dur.toFixed(3),
        '-vf', filter,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        output,
      ],
      dur,
      onProgress,
    );
  }

  /** Extract a segment of an audio file (no re-encode for WAV). */
  async extractAudioChunk(input: string, output: string, startSec: number, durationSec: number): Promise<void> {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await this.run([
      '-ss', startSec.toFixed(3),
      '-t', durationSec.toFixed(3),
      '-i', input,
      '-c', 'copy',
      output,
    ]);
  }

  /** Generate a low-res preview from a rendered reel (270x480 for 9:16). */
  async generatePreview(input: string, output: string): Promise<void> {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await this.run([
      '-i', input,
      '-vf', 'scale=270:480',
      '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-movflags', '+faststart',
      output,
    ]);
  }

  get ffmpegPath(): string {
    return this.ffmpegBin;
  }

  private exec(
    bin: string,
    args: string[],
    totalDurationSec?: number,
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const finalArgs = onProgress && totalDurationSec ? [...args, '-progress', 'pipe:1', '-nostats'] : args;
      const child = spawn(bin, finalArgs);
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString()));
      if (onProgress && totalDurationSec) {
        child.stdout.on('data', (d: Buffer) => {
          const m = /out_time_ms=(\d+)/.exec(d.toString());
          if (m) {
            const pct = Math.min(99, Math.round((Number(m[1]) / 1e6 / totalDurationSec) * 100));
            onProgress(pct);
          }
        });
      }
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`));
      });
    });
  }

  private execCapture(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`ffprobe exited ${code}: ${stderr.slice(-800)}`));
      });
    });
  }
}
