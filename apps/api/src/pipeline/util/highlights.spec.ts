import {
  generateCandidateWindows,
  selectCandidates,
  overlapRatio,
  speechDensity,
} from './highlights';

const segments = Array.from({ length: 10 }, (_, i) => ({
  start: i * 6,
  end: i * 6 + 5,
  text: `sentence number ${i} with some words`,
}));

describe('generateCandidateWindows', () => {
  it('produces windows inside the video, end > start', () => {
    const w = generateCandidateWindows({ durationSec: 60, segments, scenes: [], buckets: [15, 30], poolSize: 50 });
    expect(w.length).toBeGreaterThan(0);
    for (const x of w) {
      expect(x.startSec).toBeGreaterThanOrEqual(0);
      expect(x.endSec).toBeLessThanOrEqual(60.5);
      expect(x.endSec).toBeGreaterThan(x.startSec);
    }
  });

  it('caps the pool size', () => {
    const w = generateCandidateWindows({ durationSec: 600, segments, scenes: [], buckets: [15, 30, 45, 60], poolSize: 20 });
    expect(w.length).toBeLessThanOrEqual(20);
  });
});

describe('selectCandidates', () => {
  it('respects min/max and suppresses heavy overlap', () => {
    const w = generateCandidateWindows({ durationSec: 60, segments, scenes: [], buckets: [15], poolSize: 50 });
    const scored = w.map((window, i) => ({ window, score: (w.length - i) / w.length }));
    const chosen = selectCandidates(scored, 3, 6);
    expect(chosen.length).toBeGreaterThanOrEqual(3);
    expect(chosen.length).toBeLessThanOrEqual(6);
  });
});

describe('helpers', () => {
  it('speechDensity is within [0,1]', () => {
    const d = speechDensity(segments, 0, 15);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('overlapRatio computes fractional overlap', () => {
    expect(
      overlapRatio(
        { startSec: 0, endSec: 10, durationBucket: 10 },
        { startSec: 5, endSec: 15, durationBucket: 10 },
      ),
    ).toBeCloseTo(0.5, 5);
  });
});
