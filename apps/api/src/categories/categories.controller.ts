import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Get the full category tree' })
  tree() {
    return this.categories.getTree();
  }

  @Post()
  @ApiOperation({ summary: 'Create a category (root or nested)' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto.name, dto.parentId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename, reorder, or move a category' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a category (cascades children, nulls video/reel categoryId)' })
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }

  @Get(':id/videos')
  @ApiOperation({ summary: 'List videos in a category (optionally recursive)' })
  videos(@Param('id') id: string, @Query('recursive') recursive?: string) {
    return this.categories.getVideos(id, recursive === 'true' || recursive === '1');
  }

  @Get(':id/reels')
  @ApiOperation({ summary: 'List reels in a category (optionally recursive)' })
  reels(@Param('id') id: string, @Query('recursive') recursive?: string) {
    return this.categories.getReels(id, recursive === 'true' || recursive === '1');
  }
}
