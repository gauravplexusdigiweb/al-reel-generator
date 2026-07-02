import { Module } from '@nestjs/common';
import { CoreModule } from './core.module';
import { PipelineModule } from './pipeline/pipeline.module';

/** Root module for the worker process (no HTTP server). */
@Module({
  imports: [CoreModule, PipelineModule],
})
export class WorkerModule {}
