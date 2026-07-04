import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController, ReelAnalyticsController } from './analytics.controller';
import { ProvidersModule } from '../publishing/providers/providers.module';

@Module({
  imports: [ProvidersModule],
  controllers: [AnalyticsController, ReelAnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
