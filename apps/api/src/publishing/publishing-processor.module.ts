import { Module } from '@nestjs/common';
import { ProvidersModule } from './providers/providers.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PublishingProcessor } from './publishing.processor';

/** Worker-side: runs the BullMQ publish + analytics-refresh jobs. */
@Module({
  imports: [ProvidersModule, AnalyticsModule],
  providers: [PublishingProcessor],
})
export class PublishingProcessorModule {}
