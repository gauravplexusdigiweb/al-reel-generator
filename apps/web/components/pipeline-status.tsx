'use client';

import type { StepStatusDto, VideoStatusDto } from '@arg/shared';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const STEP_LABEL: Record<StepStatusDto['step'], string> = {
  validate: 'Validate',
  transcode: 'Transcode & extract',
  transcribe: 'Speech-to-text',
  scenes: 'Scene detection',
  faces: 'Face detection',
  highlights: 'Highlight detection',
  render: 'Render reels',
};

function StepIcon({ state }: { state: StepStatusDto['state'] }) {
  if (state === 'completed') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (state === 'active') return <Loader2 className="h-4 w-4 animate-spin text-amber-500" />;
  if (state === 'failed') return <XCircle className="h-4 w-4 text-red-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

export function PipelineStatus({ status }: { status: VideoStatusDto }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium">Overall progress</span>
          <span className="tabular-nums text-muted-foreground">{status.overallProgress}%</span>
        </div>
        <Progress value={status.overallProgress} />
      </div>
      <ol className="space-y-2">
        {status.steps.map((s) => (
          <li key={s.step} className="flex items-center gap-3">
            <StepIcon state={s.state} />
            <span className={cn('w-44 shrink-0 text-sm', s.state === 'pending' && 'text-muted-foreground')}>
              {STEP_LABEL[s.step]}
            </span>
            <div className="flex-1">
              {s.state === 'active' && <Progress value={s.progress} className="h-1.5" />}
              {s.state === 'failed' && s.error && (
                <span className="text-xs text-red-500">{s.error}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
