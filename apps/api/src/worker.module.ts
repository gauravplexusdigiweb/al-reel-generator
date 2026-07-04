import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { PublishingProcessorModule } from './publishing/publishing-processor.module';

/** Root module for the worker process (no HTTP server). */
@Module({
  imports: [CoreModule, PipelineModule, PublishingProcessorModule],
})
export class WorkerModule {}
