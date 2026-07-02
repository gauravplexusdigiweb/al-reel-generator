import { computeScores, SCORE_WEIGHTS } from './scoring';

describe('computeScores', () => {
  const base = {
    startSec: 0,
    endSec: 15,
    segments: [{ start: 0, end: 15, text: 'hello world this is a test of the reel scoring engine right now' }],
    faces: [{ t: 0, boxes: [{ x: 0.4, y: 0.3, w: 0.2, h: 0.3, score: 0.9 }] }],
    scenes: [{ startSec: 0, endSec: 15, motion: 0.5 }],
    energy: [0.5, 0.6, 0.7, 0.4],
    sampleFps: 1,
    faceConfidence: 0.5,
    hookLlm: 0.8,
    emotionLlm: 0.6,
  };

  it('weights sum to 1', () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('produces all scores in [0,1] and a positive overall', () => {
    const s = computeScores(base);
    for (const k of Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>) {
      expect(s[k]).toBeGreaterThanOrEqual(0);
      expect(s[k]).toBeLessThanOrEqual(1);
    }
    expect(s.overall).toBeGreaterThan(0);
    expect(s.overall).toBeLessThanOrEqual(1);
  });

  it('passes through the LLM hook score', () => {
    expect(computeScores(base).hook).toBeCloseTo(0.8, 5);
  });

  it('handles empty transcript/faces without throwing', () => {
    const s = computeScores({ ...base, segments: [], faces: [], energy: [] });
    expect(s.speech).toBe(0);
    expect(s.faceVisibility).toBe(0);
  });
});
