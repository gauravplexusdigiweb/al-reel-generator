import { Module } from '@nestjs/common';
import { PublishingController, ReelPublishingController, PostsController } from './publishing.controller';
import { PublishingService } from './publishing.service';

@Module({
  controllers: [PublishingController, ReelPublishingController, PostsController],
  providers: [PublishingService],
  exports: [PublishingService],
})
export class PublishingModule {}
