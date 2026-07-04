import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { VideosModule } from './videos/videos.module';
import { ReelsModule } from './reels/reels.module';
import { HealthModule } from './health/health.module';
import { CategoriesModule } from './categories/categories.module';
import { PublishingModule } from './publishing/publishing.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    CoreModule,
    VideosModule,
    ReelsModule,
    HealthModule,
    CategoriesModule,
    PublishingModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
