import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as path from 'node:path';
import type { ReelDto, VideoDto, VideoStatusDto } from '@arg/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PipelineDispatcher } from '../queue/pipeline-dispatcher.service';
import { MapperService } from '../common/mapper.service';
import { CreateReelDto, UploadOptions } from './dto';

@Injectable()
export class VideosService {
  private readonly allowedFormats: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly dispatcher: PipelineDispatcher,
    private readonly mapper: MapperService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.allowedFormats = config.get('upload', { infer: true }).allowedFormats;
  }

  async createFromUpload(
    file: Express.Multer.File | undefined,
    music: Express.Multer.File | undefined,
    opts: UploadOptions = {},
  ): Promise<{ videoId: string }> {
    if (!file) throw new BadRequestException('No file uploaded (field "file")');
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
    if (!this.allowedFormats.includes(ext)) {
      await this.storage.remove(file.path);
      if (music) await this.storage.remove(music.path);
      throw new BadRequestException(
        `Unsupported format ".${ext}". Allowed: ${this.allowedFormats.join(', ')}`,
      );
    }

    if (opts.categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: opts.categoryId } });
      if (!cat) throw new BadRequestException('Category not found');
    }

    // Coerce multipart string fields.
    const outputType = opts.outputType === 'teaser' ? 'teaser' : 'reel';
    const adultThreshold = Math.max(0, Math.min(100, Math.round(Number(opts.adultThreshold ?? 0)) || 0));
    const teaserCount = Math.max(1, Math.min(5, Math.round(Number(opts.teaserCount ?? 3)) || 3));
    let musicSource = ['original', 'custom', 'none'].includes(opts.musicSource ?? '')
      ? (opts.musicSource as string)
      : 'original';
    const captionsEnabled = opts.captionsEnabled !== 'false';
    if (music && musicSource !== 'none') musicSource = 'custom';
    else if (musicSource === 'custom' && !music) musicSource = 'original'; // no file → fall back

    const video = await this.prisma.video.create({
      data: {
        originalFilename: file.originalname,
        storedPath: '',
        status: 'uploaded',
        sizeBytes: BigInt(file.size),
        categoryId: opts.categoryId ?? null,
        outputType,
        adultThreshold,
        teaserCount,
        musicSource,
        captionsEnabled,
      },
    });

    const dest = this.storage.originalPath(video.id, ext);
    await this.storage.moveInto(file.path, dest);
    const data: { storedPath: string; musicPath?: string } = { storedPath: this.storage.rel(dest) };

    if (music) {
      const mExt = path.extname(music.originalname) || '.mp3';
      const mDest = path.join(this.storage.videoDir(video.id), `music${mExt}`);
      await this.storage.moveInto(music.path, mDest);
      data.musicPath = this.storage.rel(mDest);
    }
    await this.prisma.video.update({ where: { id: video.id }, data });

    await this.dispatcher.startPipeline(video.id);
    return { videoId: video.id };
  }

  async list(categoryId?: string): Promise<VideoDto[]> {
    const where = categoryId ? { categoryId } : {};
    const videos = await this.prisma.video.findMany({ where, orderBy: { createdAt: 'desc' } });
    return videos.map((v) => this.mapper.toVideoDto(v));
  }

  async get(id: string): Promise<VideoDto> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');
    return this.mapper.toVideoDto(video);
  }

  async moveCategory(id: string, categoryId: string | null): Promise<VideoDto> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');
    if (categoryId) {
      const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!cat) throw new BadRequestException('Category not found');
    }
    await this.prisma.video.update({ where: { id }, data: { categoryId } });
    await this.prisma.reel.updateMany({ where: { videoId: id }, data: { categoryId } });
    return this.get(id);
  }

  async status(id: string): Promise<VideoStatusDto> {
    const video = await this.prisma.video.findUnique({ where: { id }, include: { jobs: true } });
    if (!video) throw new NotFoundException('Video not found');
    return this.mapper.toStatusDto(video);
  }

  async reels(id: string): Promise<ReelDto[]> {
    const exists = await this.prisma.video.count({ where: { id } });
    if (!exists) throw new NotFoundException('Video not found');
    const reels = await this.prisma.reel.findMany({
      where: { videoId: id },
      include: MapperService.reelInclude,
      orderBy: [{ score: { overall: 'desc' } }, { createdAt: 'asc' }],
    });
    return reels.map((r) => this.mapper.toReelDto(r));
  }

  /** Create a manual reel from an arbitrary [start,end] window and render it. */
  async createReel(videoId: string, dto: CreateReelDto): Promise<ReelDto> {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');
    if (dto.endSec <= dto.startSec) throw new BadRequestException('endSec must be > startSec');
    if (video.durationSec && dto.endSec > video.durationSec + 0.5) {
      throw new BadRequestException('endSec exceeds source video duration');
    }
    const reel = await this.prisma.reel.create({
      data: {
        videoId,
        startSec: dto.startSec,
        endSec: dto.endSec,
        durationBucket: dto.durationBucket ?? Math.round(dto.endSec - dto.startSec),
        aspectRatio: dto.aspectRatio ?? '9:16',
        status: 'candidate',
        categoryId: video.categoryId,
      },
    });
    await this.dispatcher.enqueueSingleRender(videoId, reel.id);
    const full = await this.prisma.reel.findUniqueOrThrow({
      where: { id: reel.id },
      include: MapperService.reelInclude,
    });
    return this.mapper.toReelDto(full);
  }

  /** Absolute file paths + download names for a video's rendered reels (for zip export). */
  async reelFilesForExport(
    videoId: string,
    status?: string,
  ): Promise<Array<{ absPath: string; name: string }>> {
    if (!(await this.prisma.video.count({ where: { id: videoId } }))) {
      throw new NotFoundException('Video not found');
    }
    const where: Prisma.ReelWhereInput = { videoId, filePath: { not: null } };
    where.status = status
      ? (status as Prisma.EnumReelStatusFilter)
      : { in: ['approved', 'published'] };
    const reels = await this.prisma.reel.findMany({ where, orderBy: { createdAt: 'asc' } });
    return reels
      .filter((r) => r.filePath)
      .map((r, i) => {
        const title = (r.suggestedTitle || `reel-${r.id}`).replace(/[^\w.\-]+/g, '_');
        return { absPath: this.storage.abs(r.filePath as string), name: `${i + 1}-${title}.mp4` };
      });
  }

  /** Delete a video, all its reels (cascade), and its entire on-disk working dir. */
  async remove(id: string): Promise<void> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');
    await this.prisma.video.delete({ where: { id } });
    await this.storage.remove(this.storage.videoDir(id));
  }

  /** Re-run a failed video from its earliest incomplete step. */
  async retry(id: string): Promise<VideoStatusDto> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');
    await this.dispatcher.retry(id);
    return this.status(id);
  }
}
