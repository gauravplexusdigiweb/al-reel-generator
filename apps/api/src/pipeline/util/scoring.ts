import type { FaceSample, ReelScoreDto, SceneDto, TranscriptSegment } from '@arg/shared';
import { speechDensity, windowEnergy, windowMotion } from './highlights';

export const SCORE_WEIGHTS = {
  hook: 0.22,
  emotion: 0.15,
  speech: 0.15,
  motion: 0.1,
  faceVisibility: 0.15,
  sceneQuality: 0.1,
  replayPrediction: 0.13,
} as const;

const c01 = (n: number): number => Math.max(0, Math.min(1, n));

export interface ScoreInputs {
  startSec: number;
  endSec: number;
  segments: TranscriptSegment[]; // full video transcript
  faces: FaceSample[]; // full video faces
  scenes: SceneDto[];
  energy: number[]; // 0..1 per-second envelope
  sampleFps: number;
  faceConfidence: number; // threshold for "visible"
  hookLlm: number; // 0..1
  emotionLlm: number; // 0..1
}

/** Compute the 8 PRD scores for a reel window. LLM values are supplied by the caller. */
export function computeScores(input: ScoreInputs): ReelScoreDto {
  const { startSec, endSec, segments, faces, scenes, energy, sampleFps, faceConfidence } = input;
  const dur = Math.max(0.1, endSec - startSec);

  // speech: coverage + words-per-second closeness to ~2.3 wps
  const density = speechDensity(segments, startSec, endSec);
  const text = segments
    .filter((s) => s.end > startSec && s.start < endSec)
    .map((s) => s.text)
    .join(' ');
  const wps = (text.match(/\S+/g)?.length ?? 0) / dur;
  const wpsScore = 1 - Math.min(1, Math.abs(wps - 2.3) / 2.3);
  const speech = c01(0.5 * density + 0.5 * wpsScore);

  // motion from scene metrics
  const motion = c01(windowMotion(scenes, startSec, endSec));

  // face visibility: detected-face samples / expected samples in window
  const inWindow = faces.filter((f) => f.t >= startSec && f.t < endSec);
  const withFace = inWindow.filter((f) => f.boxes.some((b) => b.score >= faceConfidence)).length;
  const expected = Math.max(1, Math.round(dur * sampleFps));
  const faceVisibility = c01(withFace / expected);

  const energyNorm = c01(windowEnergy(energy, startSec, endSec));

  // scene quality: fewer choppy cuts + decent energy + faces present
  const churn = c01(scenes.filter((s) => s.endSec > startSec && s.startSec < endSec).length / (dur / 5));
  const sceneQuality = c01(0.5 + 0.3 * faceVisibility + 0.2 * energyNorm - 0.25 * churn);

  const hook = c01(input.hookLlm);
  const emotion = c01(0.6 * input.emotionLlm + 0.4 * energyNorm);

  // replay prediction: model estimate (no engagement data yet in Phase 1)
  const replayPrediction = c01(0.35 * hook + 0.25 * emotion + 0.2 * speech + 0.2 * faceVisibility);

  const parts = { hook, emotion, speech, motion, faceVisibility, sceneQuality, replayPrediction };
  const overall = c01(
    (Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>).reduce(
      (sum, k) => sum + SCORE_WEIGHTS[k] * parts[k],
      0,
    ),
  );

  return {
    ...parts,
    overall,
    rationale: { wps: Number(wps.toFixed(2)), density: Number(density.toFixed(2)), energyNorm: Number(energyNorm.toFixed(2)), churn: Number(churn.toFixed(2)) },
  };
}
