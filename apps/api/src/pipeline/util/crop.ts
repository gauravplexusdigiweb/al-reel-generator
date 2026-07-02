import type { FaceSample } from '@arg/shared';

const TARGET_W = 1080;
const TARGET_H = 1920; // 9:16
const MAX_KEYFRAMES = 12;
const EMA_ALPHA = 0.35;

const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Largest-area face box in a sample = the dominant speaker heuristic. */
function dominantCenter(sample: FaceSample): { cx: number; cy: number } | null {
  if (!sample.boxes.length) return null;
  const b = sample.boxes.reduce((a, c) => (c.w * c.h > a.w * a.h ? c : a));
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; // normalized 0..1
}

/**
 * Build an FFmpeg -vf chain that crops a 9:16 window tracking the dominant face
 * (smoothed for "smart camera movement") and scales to 1080x1920. Falls back to a
 * centered crop when no faces are available.
 */
export function buildCropFilter(
  faces: FaceSample[],
  startSec: number,
  endSec: number,
  srcW: number,
  srcH: number,
): string {
  const dur = Math.max(0.1, endSec - startSec);

  // 9:16 crop region within the source.
  let cropW = even(srcH * (9 / 16));
  let cropH = srcH;
  if (cropW > srcW) {
    cropW = srcW;
    cropH = even(srcW * (16 / 9));
  }
  const maxX = Math.max(0, srcW - cropW);
  const maxY = Math.max(0, srcH - cropH);

  const scaleTail = `scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=increase,crop=${TARGET_W}:${TARGET_H},setsar=1`;

  // Collect in-window samples with a detected face.
  const pts = faces
    .filter((s) => s.t >= startSec - 0.5 && s.t <= endSec + 0.5)
    .map((s) => ({ t: s.t - startSec, c: dominantCenter(s) }))
    .filter((p): p is { t: number; c: { cx: number; cy: number } } => p.c !== null)
    .sort((a, b) => a.t - b.t);

  if (pts.length === 0) {
    const x = Math.round(maxX / 2);
    const y = Math.round(maxY / 2);
    return `crop=${cropW}:${cropH}:${x}:${y},${scaleTail}`;
  }

  // Convert to top-left crop coords, EMA-smooth, then downsample to keyframes.
  let emaX: number | null = null;
  let emaY: number | null = null;
  const smoothed = pts.map((p) => {
    const tx = clamp(p.c.cx * srcW - cropW / 2, 0, maxX);
    const ty = clamp(p.c.cy * srcH - cropH / 2, 0, maxY);
    emaX = emaX === null ? tx : EMA_ALPHA * tx + (1 - EMA_ALPHA) * emaX;
    emaY = emaY === null ? ty : EMA_ALPHA * ty + (1 - EMA_ALPHA) * emaY;
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
