import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReelsService } from './reels.service';
import {
  RegenerateReelDto,
  ReviewNotesDto,
  SelectThumbnailDto,
  TrimReelDto,
  UpdateReelDto,
} from './dto';

@ApiTags('reels')
@Controller('reels')
export class ReelsController {
  constructor(private readonly reels: ReelsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get a reel' })
  get(@Param('id') id: string) {
    return this.reels.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a reel title / tags / caption text' })
  update(@Param('id') id: string, @Body() body: UpdateReelDto) {
    return this.reels.updateMeta(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a reel and its files' })
  remove(@Param('id') id: string) {
    return this.reels.remove(id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a candidate reel' })
  approve(@Param('id') id: string, @Body() body: ReviewNotesDto) {
    return this.reels.approve(id, body.notes);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a candidate reel' })
  reject(@Param('id') id: string, @Body() body: ReviewNotesDto) {
    return this.reels.reject(id, body.notes);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish (finalize + export locally) a reel' })
  publish(@Param('id') id: string, @Body() body: ReviewNotesDto) {
    return this.reels.publish(id, body.notes);
  }

  @Post(':id/trim')
  @ApiOperation({ summary: 'Adjust in/out points and re-render the reel' })
  trim(@Param('id') id: string, @Body() body: TrimReelDto) {
    return this.reels.trim(id, body);
  }

  @Post(':id/regenerate')
  @ApiOperation({ summary: 'Re-render the reel (optionally at a new duration)' })
  regenerate(@Param('id') id: string, @Body() body: RegenerateReelDto) {
    return this.reels.regenerate(id, body);
  }

  @Post(':id/thumbnail')
  @ApiOperation({ summary: 'Select which thumbnail to use' })
  selectThumbnail(@Param('id') id: string, @Body() body: SelectThumbnailDto) {
    return this.reels.selectThumbnail(id, body);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the rendered reel file' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const { absPath, filename } = await this.reels.fileForDownload(id);
    res.download(absPath, filename);
  }
}
