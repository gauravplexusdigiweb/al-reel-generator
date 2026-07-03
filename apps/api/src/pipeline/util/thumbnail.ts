import type { FaceSample, SceneDto } from '@arg/shared';

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export interface ThumbnailScoreParams {
  startSec: number;
  endSec: number;
  faces: FaceSample[];
  energy: number[];
  scenes: SceneDto[];
  count: number;
  minSpacingSec?: number;
  sampleIntervalSec?: number;
  faceConfidence?: number;
}

/**
 * Pick the best `count` thumbnail timestamps from a reel window.
 *
 * Each candidate frame is scored on:
 *  - Face visibility: a confident, well-centered face makes an eye-catching thumbnail
 *  - Audio energy: peak moments are more dynamic and interesting
 *  - Scene-boundary avoidance: never grab a frame right at a cut (blur / transition)
 *  - Position: prefer the first 60% of the reel (the decisive scroll-stopping frame)
 *
 * Returns `count` timestamps (seconds from reel start) spaced at least `minSpacingSec`
 * apart, sorted by score descending so the caller can index [0] as the "best".
 */
export function pickThumbnailTimestamps(params: ThumbnailScoreParams): number[] {
  const {
    startSec,
    endSec,
    faces,
    energy,
    scenes,
    count,
    minSpacingSec = 0.5,
    sampleIntervalSec = 0.5,
    faceConfidence = 0.5,
  } = params;

  const dur = Math.max(0.5, endSec - startSec);

  // Pre-compute scene-boundary set (within 0.3 s tolerance).
  const sceneCuts = new Set(
    scenes
      .filter((s) => s.startSec >= startSec - 0.3 && s.startSec < endSec + 0.3)
      .map((s) => Math.round(s.startSec * 10) / 10),
  );

  // Normalize energy for this window.
  const lo = Math.floor(startSec);
  const hi = Math.min(energy.length, Math.ceil(endSec));
  const windowEnergy = energy.slice(lo, hi);
  const maxEnergy = Math.max(1e-6, ...windowEnergy);

  const candidates: Array<{ t: number; score: number }> = [];
  for (let t = 0.3; t < dur - 0.1; t += sampleIntervalSec) {
    const absT = startSec + t;

    // --- face score: nearest face sample ---
    let faceScore = 0;
    const idx = Math.round(absT * 2); // faces are at sampleFps resolution
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi];
      if (Math.abs(f.t - absT) < 0.6) {
        for (const b of f.boxes) {
          if (b.score < faceConfidence) continue;
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          const centrality = 1 - Math.min(1, Math.hypot(cx - 0.5, cy - 0.4) / 0.7);
          const size = clamp01(b.w * b.h * 4);
          faceScore = Math.max(faceScore, 0.5 * centrality + 0.5 * size);
        }
        break;
      }
    }

    // --- energy score ---
    const eIdx = Math.floor(absT);
    const e = energy[eIdx] ?? 0;
    const energyScore = clamp01(e / maxEnergy);

    // --- scene-boundary penalty ---
    const nearCut = [...sceneCuts].some((c) => Math.abs(c - absT) < 0.4);
    const sceneScore = nearCut ? 0.1 : 0.8;

    // --- position score: bell peaking at ~30% of the reel ---
    const pos = t / dur;
    const positionScore = clamp01(1 - Math.abs(pos - 0.3) * 1.8);

    const score =
      0.35 * faceScore +
      0.25 * energyScore +
      0.2 * sceneScore +
      0.2 * positionScore;

    candidates.push({ t, score });
  }

  // Greedy selection: highest score first, enforce min spacing.
  const ranked = candidates.sort((a, b) => b.score - a.score);
  const chosen: number[] = [];
  for (const c of ranked) {
    if (chosen.length >= count) break;
    if (chosen.some((t) => Math.abs(t - c.t) < minSpacingSec)) continue;
    chosen.push(c.t);
  }
  while (chosen.length < count && ranked.length > chosen.length) {
    const next = ranked[chosen.length];
    if (next) chosen.push(next.t);
    else break;
  }
  return chosen;
}