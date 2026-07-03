import type { FaceSample } from '@arg/shared';
import type { Dims } from './aspect';

const DEFAULT_TARGET: Dims = { w: 1080, h: 1920 }; // 9:16
const MAX_KEYFRAMES = 12;
const EMA_ALPHA = 0.35;

const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Center {
  cx: number;
  cy: number;
}

/**
 * Pick the on-screen speaker for a frame: weighted by face size, centrality, and
 * temporal continuity with the previously tracked face (so the crop doesn't jump
 * between people). When audio energy is available, the area weight increases during
 * high-energy (speaking) moments so the dominant face is more aggressively selected —
 * approximating active-speaker tracking without lip-sync analysis.
 */
function pickSpeakerFace(sample: FaceSample, prev: Center | null, energyAtT?: number): Center | null {
  if (!sample.boxes.length) return null;
  const maxArea = Math.max(...sample.boxes.map((b) => b.w * b.h)) || 1;
  let best: Center | null = null;
  let bestScore = -Infinity;

  // During high energy (speaking), weight area more — the dominant face is likely the speaker.
  // During low energy (silence), weight continuity more — maintain the previous crop (don't jump).
  const e = energyAtT ?? 0.5;
  const areaWeight = 0.3 + 0.25 * e;        // 0.30..0.55
  const centralityWeight = 0.2;
  const continuityWeight = 1 - areaWeight - centralityWeight; // 0.50..0.25

  for (const b of sample.boxes) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const area = (b.w * b.h) / maxArea;
    const centrality = 1 - Math.min(1, Math.hypot(cx - 0.5, cy - 0.5) / 0.7);
    const continuity = prev ? 1 - Math.min(1, Math.hypot(cx - prev.cx, cy - prev.cy)) : centrality;
    const score = areaWeight * area + centralityWeight * centrality + continuityWeight * continuity;
    if (score > bestScore) {
      bestScore = score;
      best = { cx, cy };
    }
  }
  return best;
}

/** True when the window has at least one confidently-detected face. */
export function windowHasFace(
  faces: FaceSample[],
  startSec: number,
  endSec: number,
  minConfidence = 0.5,
  minFraction = 0.15,
): boolean {
  const inWin = faces.filter((s) => s.t >= startSec && s.t < endSec);
  if (!inWin.length) return false;
  const withFace = inWin.filter((s) => s.boxes.some((b) => b.score >= minConfidence)).length;
  return withFace / inWin.length >= minFraction;
}

/**
 * Fraction of high-energy moments in the window that have a confidently-detected
 * face — a proxy for "the speaker is on camera." Returns 0 when no energy data.
 */
export function windowActiveSpeakerCoverage(
  faces: FaceSample[],
  energy: number[],
  startSec: number,
  endSec: number,
  confidence = 0.5,
): number {
  if (!energy.length) return 0;
  const lo = Math.floor(startSec);
  const hi = Math.min(energy.length, Math.ceil(endSec));
  const inWin = energy.slice(lo, hi);
  if (inWin.length === 0) return 0;
  const sorted = [...inWin].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const highEnergySecs = median > 0.01
    ? inWin.map((e, i) => ({ e, t: lo + i })).filter(({ e }) => e >= median)
    : [];
  if (highEnergySecs.length === 0) return 0;
  const withFace = highEnergySecs.filter(({ t }) =>
    faces.some((f) => Math.floor(f.t) === t && f.boxes.some((b) => b.score >= confidence)),
  ).length;
  return withFace / highEnergySecs.length;
}

/**
 * 9:16 fill for face-less scenes: the whole frame fits inside a blurred, zoomed
 * copy of itself — far more polished than a hard center-crop.
 */
export function buildBlurFillFilter(target: Dims = DEFAULT_TARGET): string {
  const { w, h } = target;
  return (
    `split=2[bg][fg];` +
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,` +
    `crop=${w}:${h},gblur=sigma=24[bgb];` +
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgs];` +
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1`
  );
}

/**
 * Build an FFmpeg -vf chain that crops a 9:16 window tracking the dominant face
 * (smoothed for "smart camera movement") and scales to 1080x1920. When audio
 * energy is provided, tracking is energy-adaptive: faster during speech, smoother
 * during silence. Falls back to a centered crop when no faces are available.
 */
export function buildCropFilter(
  faces: FaceSample[],
  startSec: number,
  endSec: number,
  srcW: number,
  srcH: number,
  target: Dims = DEFAULT_TARGET,
  energy?: number[],
): string {
  const dur = Math.max(0.1, endSec - startSec);
  const aspect = target.w / target.h;

  // Target-aspect crop region within the source.
  let cropW = even(srcH * aspect);
  let cropH = srcH;
  if (cropW > srcW) {
    cropW = srcW;
    cropH = even(srcW / aspect);
  }
  const maxX = Math.max(0, srcW - cropW);
  const maxY = Math.max(0, srcH - cropH);

  const scaleTail = `scale=${target.w}:${target.h}:force_original_aspect_ratio=increase,crop=${target.w}:${target.h},setsar=1`;

  // Collect in-window samples, tracking the speaker across frames.
  const inWindow = faces
    .filter((s) => s.t >= startSec - 0.5 && s.t <= endSec + 0.5)
    .sort((a, b) => a.t - b.t);
  const pts: Array<{ t: number; c: Center }> = [];
  let prevCenter: Center | null = null;
  for (const s of inWindow) {
    const e = energy?.[Math.floor(s.t)] ?? undefined;
    const c = pickSpeakerFace(s, prevCenter, e);
    if (!c) continue;
    prevCenter = c;
    pts.push({ t: s.t - startSec, c });
  }

  if (pts.length === 0) {
    const x = Math.round(maxX / 2);
    const y = Math.round(maxY / 2);
    return `crop=${cropW}:${cropH}:${x}:${y},${scaleTail}`;
  }

  // Convert to top-left crop coords, energy-adaptive EMA-smooth, then downsample to keyframes.
  let emaX: number | null = null;
  let emaY: number | null = null;
  const smoothed = pts.map((p) => {
    const tx = clamp(p.c.cx * srcW - cropW / 2, 0, maxX);
    const ty = clamp(p.c.cy * srcH - cropH / 2, 0, maxY);
    const e = energy?.[Math.floor(p.t + startSec)] ?? 0.5;
    const alpha = Math.min(0.7, EMA_ALPHA + 0.2 * e);
    emaX = emaX === null ? tx : alpha * tx + (1 - alpha) * emaX;
    emaY = emaY === null ? ty : alpha * ty + (1 - alpha) * emaY;
    return { t: p.t, x: emaX, y: emaY };
  });

  const keyframes = downsample(smoothed, MAX_KEYFRAMES);
  const xExpr = maxX > 0 ? piecewiseLinearExpr(keyframes.map((k) => ({ t: k.t, v: k.x }))) : '0';
  const yExpr = maxY > 0 ? piecewiseLinearExpr(keyframes.map((k) => ({ t: k.t, v: k.y }))) : '0';

  return `crop=${cropW}:${cropH}:${xExpr}:${yExpr},${scaleTail}`;
}

function downsample<T extends { t: number }>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
}

/**
 * FFmpeg expression: piecewise-linear interpolation of `v` over time `t`.
 * Values are rounded to keep the expression compact; wrapped so it is a single
 * safe token for the crop filter.
 */
function piecewiseLinearExpr(kf: Array<{ t: number; v: number }>): string {
  if (kf.length === 1) return String(Math.round(kf[0].v));
  let expr = String(Math.round(kf[kf.length - 1].v)); // default = last value
  for (let i = kf.length - 2; i >= 0; i--) {
    const a = kf[i];
    const b = kf[i + 1];
    const slope = (b.v - a.v) / Math.max(0.001, b.t - a.t);
    const seg = `(${a.v.toFixed(1)}+(${slope.toFixed(3)})*(t-${a.t.toFixed(2)}))`;
    expr = `if(lt(t,${b.t.toFixed(2)}),${seg},${expr})`;
  }
  return `'${expr}'`;
}