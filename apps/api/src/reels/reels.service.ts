import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ReelDto } from '@arg/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PipelineDispatcher } from '../queue/pipeline-dispatcher.service';
import { MapperService } from '../common/mapper.service';
import { RegenerateReelDto, SelectThumbnailDto, TrimReelDto } from './dto';

@Injectable()
export class ReelsService {
  private readonly buckets: number[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dispatcher: PipelineDispatcher,
    private readonly mapper: MapperService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.buckets = config.get('pipeline', { infer: true }).durationBuckets;
  }

  async get(id: string): Promise<ReelDto> {
    const reel = await this.load(id);
    return this.mapper.toReelDto(reel);
  }

  async approve(id: string, notes?: string): Promise<ReelDto> {
    await this.mustExist(id);
    await this.prisma.reel.update({ where: { id }, data: { status: 'approved' } });
    await this.recordReview(id, 'approve', notes);
    return this.get(id);
  }

  async reject(id: string, notes?: string): Promise<ReelDto> {
    await this.mustExist(id);
    await this.prisma.reel.update({ where: { id }, data: { status: 'rejected' } });
    await this.recordReview(id, 'reject', notes);
    return this.get(id);
  }

  /** Phase 1 publish = finalize + export the file locally under <dataDir>/published. */
  async publish(id: string, notes?: string): Promise<ReelDto> {
    const reel = await this.load(id);
    if (!reel.filePath) throw new BadRequestException('Reel has no rendered file yet');
    const src = this.storage.abs(reel.filePath);
    const dest = this.storage.abs(path.join('published', `${reel.id}.mp4`));
    await this.storage.ensureDir(path.dirname(dest));
    await fs.copyFile(src, dest);
    await this.prisma.reel.update({ where: { id }, data: { status: 'published' } });
    await this.recordReview(id, 'publish', notes);
    return this.get(id);
  }

  /** Adjust reel in/out points and re-render just this reel. */
  async trim(id: string, dto: TrimReelDto): Promise<ReelDto> {
    const reel = await this.load(id);
    if (dto.endSec <= dto.startSec) throw new BadRequestException('endSec must be > startSec');
    const video = await this.prisma.video.findUniqueOrThrow({ where: { id: reel.videoId } });
    if (video.durationSec && dto.endSec > video.durationSec + 0.5) {
      throw new BadRequestException('endSec exceeds source video duration');
    }
    await this.prisma.reel.update({
      where: { id },
      data: {
        startSec: dto.startSec,
        endSec: dto.endSec,
        durationBucket: this.nearestBucket(dto.endSec - dto.startSec),
        status: 'candidate',
        filePath: null,
      },
    });
    await this.recordReview(id, 'trim');
    await this.dispatcher.enqueueSingleRender(reel.videoId, id);
    return this.get(id);
  }

  /** Re-render the reel (optionally at a different duration bucket). */
  async regenerate(id: string, dto: RegenerateReelDto): Promise<ReelDto> {
    const reel = await this.load(id);
    let data: { status: 'candidate'; filePath: null; endSec?: number; durationBucket?: number } = {
      status: 'candidate',
      filePath: null,
    };
    if (dto.durationBucket) {
      data = { ...data, durationBucket: dto.durationBucket, endSec: reel.startSec + dto.durationBucket };
    }
    await this.prisma.reel.update({ where: { id }, data });
    await this.recordReview(id, 'regenerate');
    await this.dispatcher.enqueueSingleRender(reel.videoId, id);
    return this.get(id);
  }

  async selectThumbnail(id: string, dto: SelectThumbnailDto): Promise<ReelDto> {
    await this.mustExist(id);
    const thumb = await this.prisma.reelThumbnail.findFirst({
      where: { id: dto.thumbnailId, reelId: id },
    });
    if (!thumb) throw new NotFoundException('Thumbnail not found for this reel');
    await this.prisma.$transaction([
      this.prisma.reelThumbnail.updateMany({ where: { reelId: id }, data: { selected: false } }),
      this.prisma.reelThumbnail.update({ where: { id: dto.thumbnailId }, data: { selected: true } }),
    ]);
    return this.get(id);
  }

  async fileForDownload(id: string): Promise<{ absPath: string; filename: string }> {
    const reel = await this.load(id);
    if (!reel.filePath) throw new NotFoundException('Reel has not been rendered yet');
    const absPath = this.storage.abs(reel.filePath);
    if (!(await this.storage.exists(absPath))) {
      throw new NotFoundException('Reel file missing on disk');
    }
    const title = (reel.suggestedTitle || `reel-${reel.id}`).replace(/[^\w.\-]+/g, '_');
    return { absPath, filename: `${title}.mp4` };
  }

  // ---- helpers ----
  private load(id: string) {
    return this.prisma.reel
      .findUniqueOrThrow({ where: { id }, include: MapperService.reelInclude })
      .catch(() => {
        throw new NotFoundException('Reel not found');
      });
  }

  private async mustExist(id: string): Promise<void> {
    if (!(await this.prisma.reel.count({ where: { id } }))) {
      throw new NotFoundException('Reel not found');
    }
  }

  private recordReview(reelId: string, action: 'approve' | 'reject' | 'trim' | 'regenerate' | 'publish', notes?: string) {
    return this.prisma.adminReview.create({ data: { reelId, action, notes } });
  }

  private nearestBucket(durationSec: number): number {
    return this.buckets.reduce((best, b) =>
      Math.abs(b - durationSec) < Math.abs(best - durationSec) ? b : best,
    );
  }
}
