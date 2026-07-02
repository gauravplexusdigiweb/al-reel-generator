import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VideosService } from './videos.service';

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
