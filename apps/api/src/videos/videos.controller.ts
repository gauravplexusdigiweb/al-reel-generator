import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import archiver from 'archiver';
import { VideosService } from './videos.service';
import { CreateReelDto, MoveVideoDto, UploadOptions } from './dto';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a video (+ optional custom music) and start generation' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'file', maxCount: 1 },
      { name: 'music', maxCount: 1 },
    ]),
  )
  async upload(
    @UploadedFiles() files: { file?: Express.Multer.File[]; music?: Express.Multer.File[] },
    @Body() body: UploadOptions,
  ) {
    return this.videos.createFromUpload(files.file?.[0], files.music?.[0], body);
  }

  @Get()
  @ApiOperation({ summary: 'List uploaded videos (optionally filtered by category)' })
  list(@Query('categoryId') categoryId?: string) {
    return this.videos.list(categoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a video' })
  get(@Param('id') id: string) {
    return this.videos.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Move a video to a different category' })
  move(@Param('id') id: string, @Body() dto: MoveVideoDto) {
    return this.videos.moveCategory(id, dto.categoryId ?? null);
  }

  @Get(':id/status')
  @ApiOperation({ summary: 'Get pipeline processing status for a video' })
  status(@Param('id') id: string) {
    return this.videos.status(id);
  }

  @Get(':id/reels')
  @ApiOperation({ summary: 'Get candidate reels for a video (ordered by score)' })
  reels(@Param('id') id: string) {
    return this.videos.reels(id);
  }

  @Post(':id/reels')
  @ApiOperation({ summary: 'Create a manual reel from a custom time window' })
  createReel(@Param('id') id: string, @Body() body: CreateReelDto) {
    return this.videos.createReel(id, body);
  }

  @Get(':id/reels/export.zip')
  @ApiOperation({ summary: 'Download a zip of rendered reels (default: approved + published)' })
  async exportZip(@Param('id') id: string, @Query('status') status: string, @Res() res: Response) {
    const files = await this.videos.reelFilesForExport(id, status);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="reels-${id}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => res.destroy(err));
    archive.pipe(res);
    for (const f of files) archive.file(f.absPath, { name: f.name });
    await archive.finalize();
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed video from its earliest incomplete step' })
  retry(@Param('id') id: string) {
    return this.videos.retry(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a video, its reels, and all its files' })
  remove(@Param('id') id: string) {
    return this.videos.remove(id);
  }
}
