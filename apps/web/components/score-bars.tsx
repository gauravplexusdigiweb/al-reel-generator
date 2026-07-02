'use client';

import type { ReelScoreDto } from '@arg/shared';
import { scorePct, scoreTone } from '@/lib/format';
import { cn } from '@/lib/utils';

const LABELS: Array<{ key: keyof ReelScoreDto; label: string }> = [
  { key: 'hook', label: 'Hook' },
  { key: 'emotion', label: 'Emotion' },
  { key: 'speech', label: 'Speech' },
  { key: 'motion', label: 'Motion' },
  { key: 'faceVisibility', label: 'Face' },
  { key: 'sceneQuality', label: 'Scene' },
  { key: 'replayPrediction', label: 'Replay' },
];

const TONE_BG = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-red-500',
} as const;

export function ScoreBars({ score }: { score: ReelScoreDto }) {
  return (
    <div className="space-y-2">
      {LABELS.map(({ key, label }) => {
        const v = score[key] as number;
        return (
          <div key={key} className="flex items-center gap-3 text-xs">
            <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className={cn('h-full rounded-full', TONE_BG[scoreTone(v)])} style={{ width: `${scorePct(v)}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right tabular-nums">{scorePct(v)}</span>
          </div>
        );
      })}
    </div>
  );
}
