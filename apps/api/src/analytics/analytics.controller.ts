import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ManualAnalyticsRequest } from '@arg/shared';
import { AnalyticsService } from './analytics.service';
import { PublishingDispatcher } from '../queue/publishing-dispatcher.service';
import { ManualAnalyticsDto } from '../publishing/dto';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly dispatcher: PublishingDispatcher,
  ) {}

  @Get('insights')
  @ApiOperation({ summary: 'Aggregate performance insights (founder dashboard)' })
  insights() {
    return this.analytics.getInsights();
  }

  @Post('refresh')
  @HttpCode(202)
  @ApiOperation({ summary: 'Queue an analytics refresh across all published posts' })
  async refresh() {
    await this.dispatcher.triggerAnalyticsRefresh();
    return { queued: true };
  }
}

@ApiTags('reels')
@Controller('reels')
export class ReelAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get stored analytics for a reel' })
  get(@Param('id') id: string) {
    return this.analytics.getReelAnalytics(id);
  }

  @Post(':id/analytics')
  @ApiOperation({ summary: 'Manually record metrics for a reel/platform' })
  record(@Param('id') id: string, @Body() body: ManualAnalyticsDto) {
    return this.analytics.recordManual(id, body as unknown as ManualAnalyticsRequest);
  }
}
