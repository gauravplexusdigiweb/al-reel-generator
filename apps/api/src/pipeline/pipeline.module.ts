import { Module } from '@nestjs/common';
import { StepTracker } from './step-tracker.service';
import { PipelineWorker } from './pipeline.worker';
import { ValidateStep } from './steps/validate.step';
import { TranscodeStep } from './steps/transcode.step';
import { TranscribeStep } from './steps/transcribe.step';
import { ScenesStep } from './steps/scenes.step';
import { FacesStep } from './steps/faces.step';
import { NsfwStep } from './steps/nsfw.step';
import { IdentitiesStep } from './steps/identities.step';
import { HighlightsStep } from './steps/highlights.step';
import { RenderStep } from './steps/render.step';
import { TeaserRenderStep } from './steps/teaser-render.step';
import { FinalizeStep } from './steps/finalize.step';

@Module({
  providers: [
    StepTracker,
    ValidateStep,
    TranscodeStep,
    TranscribeStep,
    ScenesStep,
    FacesStep,
    NsfwStep,
    IdentitiesStep,
    HighlightsStep,
    RenderStep,
    TeaserRenderStep,
    FinalizeStep,
    PipelineWorker,
  ],
})
export class PipelineModule {}
