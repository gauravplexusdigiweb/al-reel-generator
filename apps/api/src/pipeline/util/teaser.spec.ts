import type {
  FaceSample,
  NsfwSample,
  PersonIdentity,
  SceneDto,
  TranscriptSegment,
} from '@arg/shared';
import { buildTeaserBeats, nsfwPeak, pickMusicWindow, type TeaserParams } from './teaser';

const DUR = 120;

// A 120s scenario with speech hooks, motion scenes, a prominent face, and one person.
function baseParams(overrides: Partial<TeaserParams> = {}): TeaserParams {
  const segments: TranscriptSegment[] = [
    { start: 5, end: 8, text: 'You have no idea what is coming for you.' },
    { start: 30, end: 33, text: 'Everything changes tonight.' },
    { start: 62, end: 65, text: 'I never wanted any of this to happen.' },
    { start: 95, end: 98, text: 'This is the end of the line.' },
  ];
  const hookScores = [0.9, 0.8, 0.7, 0.95];

  const scenes: SceneDto[] = [];
  for (let t = 0; t < DUR; t += 10) {
    scenes.push({ startSec: t, endSec: t + 10, motion: t >= 40 && t < 80 ? 0.8 : 0.2 });
  }

  // Energy per second: a loud region 55–80s.
  const energy = Array.from({ length: DUR }, (_, s) => (s >= 55 && s < 80 ? 0.9 : 0.2));

  // A big face throughout the middle.
  const faces: FaceSample[] = [];
  for (let t = 20; t < 100; t += 2) {
    faces.push({ t, boxes: [{ x: 0.3, y: 0.2, w: 0.35, h: 0.4, score: 0.95 }] });
  }

  const people: PersonIdentity[] = [{ personId: 'p1', firstSeenSec: 20, appearances: 40, avgSize: 0.3 }];

  return {
    durationSec: DUR,
    segments,
    scenes,
    faces,
    energy,
    nsfw: [],
    people,
    hookScores,
    adultCutoff: 0,
    seed: 1,
    ...overrides,
  };
}

const totalLen = (beats: { startSec: number; endSec: number }[]) =>
  beats.reduce((s, b) => s + (b.endSec - b.startSec), 0);

describe('nsfwPeak', () => {
  it('returns 0 when there are no samples', () => {
    expect(nsfwPeak([], 0, 10)).toBe(0);
  });

  it('returns the max score within the window only', () => {
    const s: NsfwSample[] = [
      { t: 1, score: 0.2 },
      { t: 5, score: 0.9 },
      { t: 12, score: 0.99 }, // outside
    ];
    expect(nsfwPeak(s, 0, 10)).toBeCloseTo(0.9);
  });
});

describe('pickMusicWindow', () => {
  it('returns 0 when the track is shorter than the requested window', () => {
    expect(pickMusicWindow([0.1, 0.2, 0.3], 10)).toBe(0);
  });

  it('finds the start of the highest-energy continuous window', () => {
    const energy = Array.from({ length: 120 }, (_, s) => (s >= 55 && s < 80 ? 0.9 : 0.2));
    const start = pickMusicWindow(energy, 20);
    // The 20s window of max energy should sit inside/around the loud 55–80 region.
    expect(start).toBeGreaterThanOrEqual(50);
    expect(start).toBeLessThanOrEqual(60);
  });
});

describe('buildTeaserBeats', () => {
  it('produces a teaser between 20 and 45 seconds, capped at 12 beats', () => {
    const beats = buildTeaserBeats(baseParams());
    expect(beats.length).toBeGreaterThan(0);
    expect(beats.length).toBeLessThanOrEqual(12);
    expect(totalLen(beats)).toBeGreaterThanOrEqual(20);
    expect(totalLen(beats)).toBeLessThanOrEqual(45 + 3.2); // last beat may nudge over target
  });

  it('keeps every beat inside the source video bounds', () => {
    const beats = buildTeaserBeats(baseParams());
    for (const b of beats) {
      expect(b.startSec).toBeGreaterThanOrEqual(0);
      expect(b.endSec).toBeLessThanOrEqual(DUR);
      expect(b.endSec).toBeGreaterThan(b.startSec);
    }
  });

  it('de-dupes heavily overlapping beats (no >50% overlap survives)', () => {
    const beats = buildTeaserBeats(baseParams());
    for (let i = 0; i < beats.length; i++) {
      for (let j = i + 1; j < beats.length; j++) {
        const a = beats[i];
        const b = beats[j];
        const overlap = Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec);
        const minLen = Math.min(a.endSec - a.startSec, b.endSec - b.startSec);
        expect(overlap).toBeLessThanOrEqual(0.5 * minLen);
      }
    }
  });

  it('is deterministic for a given seed and varies across seeds', () => {
    const a = buildTeaserBeats(baseParams({ seed: 3 }));
    const again = buildTeaserBeats(baseParams({ seed: 3 }));
    expect(again).toEqual(a);
    const other = buildTeaserBeats(baseParams({ seed: 42 }));
    // Different seed should not be guaranteed identical ordering/selection.
    expect(JSON.stringify(other)).not.toEqual(JSON.stringify(a));
  });

  it('introduces the main person near the front and gives the opener a big title', () => {
    const beats = buildTeaserBeats(baseParams());
    const introIdx = beats.findIndex((b) => b.role === 'intro');
    expect(introIdx).toBeGreaterThanOrEqual(0);
    expect(introIdx).toBeLessThanOrEqual(2); // opener, then intros
    if (beats[0].text) expect(beats[0].textSize).toBe('big');
  });

  it('drops beats whose NSFW peak meets the cutoff', () => {
    // Spike NSFW right over the strong closing hook at 95s.
    const nsfw: NsfwSample[] = [{ t: 96, score: 0.9 }];
    const clean = buildTeaserBeats(baseParams({ nsfw, adultCutoff: 0 }));
    const filtered = buildTeaserBeats(baseParams({ nsfw, adultCutoff: 0.5 }));
    const touches96 = (bs: { startSec: number; endSec: number }[]) =>
      bs.some((b) => b.startSec <= 96 && b.endSec >= 96);
    expect(touches96(clean)).toBe(true);
    expect(touches96(filtered)).toBe(false);
  });

  it('still yields a teaser when there is no signal (fallback beats)', () => {
    const beats = buildTeaserBeats({
      durationSec: DUR,
      segments: [],
      scenes: [],
      faces: [],
      energy: [],
      nsfw: [],
      people: [],
      hookScores: [],
      adultCutoff: 0,
      seed: 1,
    });
    expect(beats.length).toBeGreaterThan(0);
    for (const b of beats) {
      expect(b.endSec).toBeLessThanOrEqual(DUR);
      expect(b.endSec).toBeGreaterThan(b.startSec);
    }
  });
});
