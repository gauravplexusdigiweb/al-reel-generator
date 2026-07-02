import type { SceneDto, TranscriptSegment } from '@arg/shared';

export interface CandidateWindow {
  startSec: number;
  endSec: number;
  durationBucket: number;
}

export function segmentsInWindow(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): TranscriptSegment[] {
  return segments.filter((s) => s.end > start && s.start < end);
}

export function windowText(segments: TranscriptSegment[], start: number, end: number): string {
  return segmentsInWindow(segments, start, end)
    .map((s) => s.text.trim())
    .join(' ')
    .trim();
}

/** Fraction of the window covered by speech (0..1). */
export function speechDensity(
  segments: TranscriptSegment[],
  start: number,
  end: number,
): number {
  const dur = Math.max(0.1, end - start);
  const covered = segmentsInWindow(segments, start, end).reduce(
    (acc, s) => acc + (Math.min(end, s.end) - Math.max(start, s.start)),
    0,
  );
  return Math.max(0, Math.min(1, covered / dur));
}

/** Mean audio energy over a window given a per-second energy envelope. */
export function windowEnergy(energy: number[], start: number, end: number): number {
  if (!energy.length) return 0;
  const a = Math.floor(start);
  const b = Math.min(energy.length - 1, Math.ceil(end));
  let sum = 0;
  let n = 0;
  for (let i = a; i <= b; i++) {
    if (energy[i] !== undefined) {
      sum += energy[i];
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Mean scene motion overlapping a window (0..1). */
export function windowMotion(scenes: SceneDto[], start: number, end: number): number {
  const hits = scenes.filter((s) => s.endSec > start && s.startSec < end);
  if (!hits.length) return 0;
  return hits.reduce((a, s) => a + s.motion, 0) / hits.length;
}

/**
 * Generate a pool of candidate windows anchored to speech starts, scene cuts, and
 * a fixed grid, across all duration buckets. Deduped and capped to `poolSize`.
 */
export function generateCandidateWindows(params: {
  durationSec: number;
  segments: TranscriptSegment[];
  scenes: SceneDto[];
  buckets: number[];
  poolSize: number;
}): CandidateWindow[] {
  const { durationSec, segments, scenes, buckets, poolSize } = params;
  const anchors = new Set<number>();
  const add = (t: number): void => {
    if (t >= 0 && t < durationSec) anchors.add(Math.round(t));
  };
  segments.forEach((s) => add(s.start));
  scenes.forEach((s) => add(s.startSec));
  for (let t = 0; t < durationSec; t += 5) add(t);

  // Sentence boundaries (segment start/end) used to avoid cutting mid-sentence.
  const boundaries = [
    ...new Set(segments.flatMap((s) => [s.start, s.end]).map((x) => Math.round(x * 10) / 10)),
  ].sort((x, y) => x - y);
  const TOL = 2;
  const snap = (t: number): number => {
    let best = t;
    let bestD = TOL;
    for (const b of boundaries) {
      const d = Math.abs(b - t);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  };

  const sorted = [...anchors].sort((a, b) => a - b);
  const windows: CandidateWindow[] = [];
  for (const a of sorted) {
    for (const b of buckets) {
      const start = Math.max(0, snap(a));
      let end = snap(a + b);
      if (end - start < Math.min(3, b)) end = a + b; // keep a sensible length
      if (end <= durationSec + 0.25) {
        windows.push({ startSec: start, endSec: Math.min(end, durationSec), durationBucket: b });
      }
    }
  }
  // Spread-sample down to the pool size to bound LLM ranking cost.
  if (windows.length <= poolSize) return windows;
  const step = windows.length / poolSize;
  return Array.from({ length: poolSize }, (_, i) => windows[Math.floor(i * step)]);
}

export function overlapRatio(a: CandidateWindow, b: CandidateWindow): number {
  const inter = Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec));
  const shorter = Math.min(a.endSec - a.startSec, b.endSec - b.startSec);
  return shorter > 0 ? inter / shorter : 0;
}

/**
 * Greedy selection of the highest-scoring windows while suppressing near-duplicates
 * (>60% overlap). Aims for `max`, will relax overlap to reach `min` if needed.
 */
export function selectCandidates(
  scored: Array<{ window: CandidateWindow; score: number }>,
  min: number,
  max: number,
): CandidateWindow[] {
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const chosen: CandidateWindow[] = [];
  for (const { window } of ranked) {
    if (chosen.length >= max) break;
    if (chosen.some((c) => overlapRatio(c, window) > 0.6)) continue;
    chosen.push(window);
  }
  // Relax overlap suppression to reach the minimum count.
  if (chosen.length < min) {
    for (const { window } of ranked) {
      if (chosen.length >= min) break;
      if (!chosen.includes(window)) chosen.push(window);
    }
  }
  return chosen;
}
