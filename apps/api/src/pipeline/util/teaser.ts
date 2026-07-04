import type {
  FaceSample,
  NsfwSample,
  PersonIdentity,
  SceneDto,
  TeaserBeat,
  TranscriptSegment,
} from '@arg/shared';
import { windowEnergy, windowMotion } from './highlights';

export interface TeaserParams {
  durationSec: number;
  segments: TranscriptSegment[];
  scenes: SceneDto[];
  faces: FaceSample[];
  energy: number[];
  nsfw: NsfwSample[];
  people: PersonIdentity[];
  hookScores: number[]; // per-segment interest 0..1 (LLM-provided)
  adultCutoff: number; // 0..1; beats with NSFW peak >= cutoff are dropped (0 = off)
  seed: number; // variant selector
  targetSec?: number; // desired total length (clamped 20..45)
}

interface Candidate extends TeaserBeat {
  score: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Peak NSFW score within a window (0 when no data). */
export function nsfwPeak(samples: NsfwSample[], start: number, end: number): number {
  let peak = 0;
  for (const s of samples) if (s.t >= start && s.t <= end) peak = Math.max(peak, s.score);
  return peak;
}

function faceProminence(faces: FaceSample[], start: number, end: number): number {
  const inWin = faces.filter((f) => f.t >= start && f.t < end);
  if (!inWin.length) return 0;
  let best = 0;
  for (const s of inWin) for (const b of s.boxes) best = Math.max(best, b.w * b.h * 4);
  return clamp(best, 0, 1);
}

/**
 * Build a trailer-style beat list: intro (main-actor entry) + hook lines + energy peaks
 * + "money shots", spread across the video, NSFW-filtered, and ordered for pacing.
 * Times are absolute in the source video; total lands in 20–45s.
 */
export function buildTeaserBeats(p: TeaserParams): TeaserBeat[] {
  const { durationSec, segments, scenes, faces, energy, nsfw, people, hookScores, adultCutoff, seed } = p;
  const target = clamp(p.targetSec ?? 30, 20, 45);
  const dur = Math.max(1, durationSec);
  const clean = (s: number, e: number) => adultCutoff <= 0 || nsfwPeak(nsfw, s, e) < adultCutoff;

  const cands: Candidate[] = [];
  const add = (c: Candidate) => {
    if (c.startSec >= 0 && c.endSec <= dur && c.endSec > c.startSec && clean(c.startSec, c.endSec)) cands.push(c);
  };

  // Intro beats — first appearance of the top main people.
  people
    .slice()
    .sort((a, b) => b.appearances * b.avgSize - a.appearances * a.avgSize)
    .slice(0, 3)
    .forEach((person, i) => {
      const len = 2.2;
      const start = clamp(person.firstSeenSec - 0.3, 0, dur - len);
      add({
        startSec: start,
        endSec: start + len,
        role: 'intro',
        effect: 'zoom-in',
        transition: 'fade',
        score: 0.85 - i * 0.05 + person.avgSize * 0.2,
      });
    });

  // Hook beats — highest-interest dialog lines.
  segments.forEach((s, i) => {
    const hook = hookScores[i] ?? 0;
    if (hook < 0.45) return;
    const len = clamp(s.end - s.start, 1.4, 3.2);
    add({
      startSec: s.start,
      endSec: s.start + len,
      role: 'hook',
      effect: 'none',
      transition: 'cut',
      text: s.text.trim().slice(0, 90),
      textSize: 'small',
      score: 0.5 + hook * 0.5,
    });
  });

  // Peak beats — loudest/high-motion moments on a grid.
  for (let t = 0; t < dur - 1.6; t += 4) {
    const e = windowEnergy(energy, t, t + 1.6);
    const m = windowMotion(scenes, t, t + 1.6);
    const score = 0.35 + e * 0.4 + m * 0.25;
    if (e > 0.55 || m > 0.5) {
      add({ startSec: t, endSec: t + 1.6, role: 'peak', effect: 'flash', transition: 'cut', score });
    }
  }

  // Money shots — prominent faces / high scene quality.
  scenes.forEach((sc) => {
    const mid = (sc.startSec + sc.endSec) / 2;
    const len = 2.0;
    const start = clamp(mid - len / 2, 0, dur - len);
    const prom = faceProminence(faces, start, start + len);
    if (prom > 0.25) {
      add({ startSec: start, endSec: start + len, role: 'moneyshot', effect: 'zoom-in', transition: 'slideleft', score: 0.4 + prom * 0.5 });
    }
  });

  if (cands.length === 0) {
    // Fallback: evenly spaced 2s beats.
    for (let t = 2; t < dur - 2 && cands.length < 8; t += Math.max(3, dur / 8)) {
      add({ startSec: t, endSec: t + 2, role: 'peak', effect: 'none', transition: 'fade', score: 0.5 });
    }
  }

  // Rank, then greedily select with temporal spread + de-dup (>50% overlap).
  const rng = mulberry32(seed || 1);
  const ranked = cands
    .map((c) => ({ ...c, score: c.score + rng() * 0.08 }))
    .sort((a, b) => b.score - a.score);

  const chosen: Candidate[] = [];
  let total = 0;
  for (const c of ranked) {
    if (total >= target || chosen.length >= 12) break;
    const overlaps = chosen.some(
      (x) => Math.min(x.endSec, c.endSec) - Math.max(x.startSec, c.startSec) > 0.5 * Math.min(x.endSec - x.startSec, c.endSec - c.startSec),
    );
    if (overlaps) continue;
    chosen.push(c);
    total += c.endSec - c.startSec;
  }
  // Ensure a minimum feel of a teaser.
  while (total < 20 && ranked.length > chosen.length) {
    const next = ranked.find((c) => !chosen.includes(c));
    if (!next) break;
    chosen.push(next);
    total += next.endSec - next.startSec;
  }

  // Pacing: open on the strongest hook, then intros, then the rest by time, strongest peak last.
  const intros = chosen.filter((c) => c.role === 'intro').sort((a, b) => a.startSec - b.startSec);
  const rest = chosen.filter((c) => c.role !== 'intro');
  const opener = rest.filter((c) => c.role === 'hook').sort((a, b) => b.score - a.score)[0];
  const finale = rest
    .filter((c) => c !== opener)
    .sort((a, b) => b.score - a.score)[0];
  const middle = rest
    .filter((c) => c !== opener && c !== finale)
    .sort((a, b) => a.startSec - b.startSec);

  const ordered = [opener, ...intros, ...middle, finale].filter(Boolean) as Candidate[];

  // Give the opener a big title if it has text.
  if (ordered[0]?.text) ordered[0].textSize = 'big';

  // Strip internal score field.
  return ordered.map(({ score: _score, ...beat }) => beat);
}

/** Start second of the highest-energy continuous `lengthSec` window — the music bed. */
export function pickMusicWindow(energy: number[], lengthSec: number): number {
  const L = Math.max(1, Math.floor(lengthSec));
  if (energy.length <= L) return 0;
  let sum = 0;
  for (let i = 0; i < L; i++) sum += energy[i] ?? 0;
  let best = 0;
  let bestSum = sum;
  for (let i = L; i < energy.length; i++) {
    sum += (energy[i] ?? 0) - (energy[i - L] ?? 0);
    if (sum > bestSum) {
      bestSum = sum;
      best = i - L + 1;
    }
  }
  return best;
}

// Small deterministic PRNG for reproducible variants.
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
