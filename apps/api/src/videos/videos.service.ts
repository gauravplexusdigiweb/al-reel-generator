import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import type { ReelDto, VideoDto, VideoStatusDto } from '@arg/shared';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PipelineDispatcher } from '../queue/pipeline-dispatcher.service';
import { MapperService } from '../common/mapper.service';

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

  async createFromUpload(file: Express.Multer.File): Promise<{ videoId: string }> {
    if (!file) throw new BadRequestException('No file uploaded (field "file")');
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
    if (!this.allowedFormats.includes(ext)) {
      await this.storage.remove(file.path);
      throw new BadRequestException(
        `Unsupported format ".${ext}". Allowed: ${this.allowedFormats.join(', ')}`,
      );
    }

    const video = await this.prisma.video.create({
      data: {
        originalFilename: file.originalname,
        storedPath: '',
        status: 'uploaded',
        sizeBytes: BigInt(file.size),
      },
    });

    const dest = this.storage.originalPath(video.id, ext);
    await this.storage.moveInto(file.path, dest);
    await this.prisma.video.update({
      where: { id: video.id },
      data: { storedPath: this.storage.rel(dest) },
    });

    await this.dispatcher.startPipeline(video.id);
    return { videoId: video.id };
  }

  async list(): Promise<VideoDto[]> {
    const videos = await this.prisma.video.findMany({ orderBy: { createdAt: 'desc' } });
    return videos.map((v) => this.mapper.toVideoDto(v));
  }

  async get(id: string): Promise<VideoDto> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) throw new NotFoundException('Video not found');
    return this.mapper.toVideoDto(video);
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
}
