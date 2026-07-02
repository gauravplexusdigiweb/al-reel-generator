import { Module } from '@nestjs/common';
import { ReelsController } from './reels.controller';
import { ReelsService } from './reels.service';

@Module({
  controllers: [ReelsController],
  providers: [ReelsService],
})
export class ReelsModule {}
