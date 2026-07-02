import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import archiver from 'archiver';
import { VideosService } from './videos.service';
import { CreateReelDto } from './dto';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post()
  @ApiOperation({ summary: 'Upload a video and start the reel-generation pipeline' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    return this.videos.createFromUpload(file);
  }

  @Get()
  @ApiOperation({ summary: 'List uploaded videos' })
  list() {
    return this.videos.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a video' })
  get(@Param('id') id: string) {
    return this.videos.get(id);
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
