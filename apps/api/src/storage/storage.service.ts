import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { AppConfig } from '../config/configuration';

/**
 * Local-filesystem storage. All media lives under DATA_DIR. A driver-swappable
 * surface (save/read/publicUrl) so an S3 driver can replace this later without
 * touching the pipeline. Layout:
 *   <dataDir>/videos/<videoId>/{original.ext, renditions/, audio.wav, frames/, reels/, thumbnails/}
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly dataDir: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const dir = config.get('storage', { infer: true }).dataDir;
    this.dataDir = path.resolve(dir);
  }

  /** Absolute path from a path relative to DATA_DIR. */
  abs(relative: string): string {
    return path.join(this.dataDir, relative);
  }

  /** Path relative to DATA_DIR from an absolute path (used to build public URLs). */
  rel(absolute: string): string {
    return path.relative(this.dataDir, absolute);
  }

  /** Public URL the API serves this file at (see static assets mount in main.ts). */
  publicUrl(absoluteOrRelative: string): string {
    const rel = path.isAbsolute(absoluteOrRelative)
      ? this.rel(absoluteOrRelative)
      : absoluteOrRelative;
    return `/files/${rel.split(path.sep).join('/')}`;
  }

  // ---- per-video path helpers ----
  videoDir(videoId: string): string {
    return this.abs(path.join('videos', videoId));
  }
  originalPath(videoId: string, ext: string): string {
    return path.join(this.videoDir(videoId), `original${ext.startsWith('.') ? ext : '.' + ext}`);
  }
  renditionsDir(videoId: string): string {
    return path.join(this.videoDir(videoId), 'renditions');
  }
  audioPath(videoId: string): string {
    return path.join(this.videoDir(videoId), 'audio.wav');
  }
  framesDir(videoId: string): string {
    return path.join(this.videoDir(videoId), 'frames');
  }
  reelsDir(videoId: string): string {
    return path.join(this.videoDir(videoId), 'reels');
  }
  thumbnailsDir(videoId: string): string {
    return path.join(this.videoDir(videoId), 'thumbnails');
  }

  async ensureDir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  /** Persist an already-written temp file into its final location (move, fallback to copy). */
  async moveInto(tempPath: string, destPath: string): Promise<void> {
    await this.ensureDir(path.dirname(destPath));
    try {
      await fs.rename(tempPath, destPath);
    } catch {
      await fs.copyFile(tempPath, destPath);
      await fs.unlink(tempPath).catch(() => undefined);
    }
  }

  async writeJson(destPath: string, data: unknown): Promise<void> {
    await this.ensureDir(path.dirname(destPath));
    await fs.writeFile(destPath, JSON.stringify(data, null, 2), 'utf8');
  }

  async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async remove(p: string): Promise<void> {
    await fs.rm(p, { recursive: true, force: true }).catch((e) =>
      this.logger.warn(`remove failed for ${p}: ${e}`),
    );
  }
}
