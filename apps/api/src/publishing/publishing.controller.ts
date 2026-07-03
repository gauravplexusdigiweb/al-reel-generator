import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublishingService } from './publishing.service';
import { ConnectAccountDto, PublishReelDto } from './dto';

@ApiTags('publishing')
@Controller('publishing')
export class PublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'List connected social accounts' })
  accounts() {
    return this.publishing.listAccounts();
  }

  @Post('connect/:platform')
  @ApiOperation({ summary: 'Connect a social account via OAuth' })
  connect(@Param('platform') platform: string, @Body() dto: ConnectAccountDto) {
    return this.publishing.connectAccount(platform as never, dto.authCode, dto.displayName);
  }

  @Delete('accounts/:id')
  @ApiOperation({ summary: 'Disconnect a social account' })
  disconnect(@Param('id') id: string) {
    return this.publishing.disconnectAccount(id);
  }
}

@ApiTags('reels')
@Controller('reels')
export class ReelPublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a reel to one or more social platforms' })
  publish(@Param('id') id: string, @Body() dto: PublishReelDto) {
    return this.publishing.publish(id, dto);
  }

  @Get(':id/posts')
  @ApiOperation({ summary: 'List social posts for a reel' })
  posts(@Param('id') id: string) {
    return this.publishing.listReelPosts(id);
  }
}

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly publishing: PublishingService) {}

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed social post' })
  retry(@Param('id') id: string) {
    return this.publishing.retryPost(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a social post' })
  remove(@Param('id') id: string) {
    return this.publishing.removePost(id);
  }
}
