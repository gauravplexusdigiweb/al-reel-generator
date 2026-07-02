import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { VideosModule } from './videos/videos.module';
import { ReelsModule } from './reels/reels.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [CoreModule, VideosModule, ReelsModule, HealthModule],
})
export class AppModule {}
