import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { ReelDto } from '@arg/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PipelineDispatcher } from '../queue/pipeline-dispatcher.service';
import { MapperService } from '../common/mapper.service';
import { RegenerateReelDto, SelectThumbnailDto, TrimReelDto, UpdateReelDto } from './dto';

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

  /** Re-render the reel (optionally at a different duration bucket / aspect ratio). */
  async regenerate(id: string, dto: RegenerateReelDto): Promise<ReelDto> {
    const reel = await this.load(id);
    const data: {
      status: 'candidate';
      filePath: null;
      endSec?: number;
      durationBucket?: number;
      aspectRatio?: string;
    } = { status: 'candidate', filePath: null };
    if (dto.durationBucket) {
      data.durationBucket = dto.durationBucket;
      data.endSec = reel.startSec + dto.durationBucket;
    }
    if (dto.aspectRatio) data.aspectRatio = dto.aspectRatio;
    await this.prisma.reel.update({ where: { id }, data });
    await this.recordReview(id, 'regenerate');
    await this.dispatcher.enqueueSingleRender(reel.videoId, id);
    return this.get(id);
  }

  /** Edit AI-generated title / tags / caption text. Editing captions flags a re-render. */
  async updateMeta(id: string, dto: UpdateReelDto): Promise<ReelDto> {
    await this.mustExist(id);
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    const reelData: { suggestedTitle?: string; needsRerender?: boolean } = {};
    if (dto.suggestedTitle !== undefined) reelData.suggestedTitle = dto.suggestedTitle.trim();
    if (dto.transcript) reelData.needsRerender = true;
    if (Object.keys(reelData).length) {
      ops.push(this.prisma.reel.update({ where: { id }, data: reelData }));
    }

    if (dto.tags) {
      const tags = [...new Set(dto.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
      ops.push(this.prisma.reelTag.deleteMany({ where: { reelId: id } }));
      if (tags.length) {
        ops.push(
          this.prisma.reelTag.createMany({
            data: tags.map((tag) => ({ reelId: id, tag })),
            skipDuplicates: true,
          }),
        );
      }
    }

    if (dto.transcript) {
      const segments = dto.transcript as unknown as Prisma.InputJsonValue;
      ops.push(
        this.prisma.reelTranscript.upsert({
          where: { reelId: id },
          create: { reelId: id, segments },
          update: { segments },
        }),
      );
    }

    if (ops.length) await this.prisma.$transaction(ops);
    return this.get(id);
  }

  /** Delete a reel and its files (mp4, captions, thumbnails, published copy). */
  async remove(id: string): Promise<void> {
    const reel = await this.prisma.reel.findUnique({ where: { id } });
    if (!reel) throw new NotFoundException('Reel not found');
    await this.prisma.reel.delete({ where: { id } }); // cascades score/tags/thumbs/transcript/reviews
    if (reel.filePath) await this.storage.remove(this.storage.abs(reel.filePath));
    await this.storage.remove(path.join(this.storage.reelsDir(reel.videoId), `${id}.ass`));
    for (let i = 1; i <= 3; i++) {
      await this.storage.remove(path.join(this.storage.thumbnailsDir(reel.videoId), `${id}-${i}.jpg`));
    }
    await this.storage.remove(this.storage.abs(path.join('published', `${id}.mp4`)));
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
