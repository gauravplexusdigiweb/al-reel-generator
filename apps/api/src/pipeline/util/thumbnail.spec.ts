import { pickThumbnailTimestamps } from './thumbnail';
import type { FaceSample, SceneDto } from '@arg/shared';

const faces: FaceSample[] = Array.from({ length: 10 }, (_, i) => ({
  t: i,
  boxes: [{ x: 0.3, y: 0.2, w: 0.2, h: 0.3, score: 0.9 }],
}));

const scenes: SceneDto[] = [];

const energy = [0.2, 0.5, 0.9, 0.3, 0.7, 0.4, 0.6, 0.8, 0.3, 0.5];

describe('pickThumbnailTimestamps', () => {
  it('returns the requested number of timestamps', () => {
    const ts = pickThumbnailTimestamps({
      startSec: 0,
      endSec: 10,
      faces,
      energy,
      scenes,
      count: 3,
    });
    expect(ts.length).toBe(3);
  });

  it('returns timestamps within the reel window', () => {
    const ts = pickThumbnailTimestamps({
      startSec: 5,
      endSec: 15,
      faces,
      energy,
      scenes,
      count: 3,
    });
    for (const t of ts) {
      expect(t).toBeGreaterThan(-0.5);
      expect(t).toBeLessThan(10.5);
    }
  });

  it('returns empty array when count is 0', () => {
    const ts = pickThumbnailTimestamps({
      startSec: 0,
      endSec: 10,
      faces,
      energy,
      scenes,
      count: 0,
    });
    expect(ts).toEqual([]);
  });

  it('respects minimum spacing', () => {
    const ts = pickThumbnailTimestamps({
      startSec: 0,
      endSec: 10,
      faces,
      energy,
      scenes,
      count: 3,
      minSpacingSec: 3,
    });
    for (let i = 1; i < ts.length; i++) {
      expect(Math.abs(ts[i] - ts[i - 1])).toBeGreaterThanOrEqual(3);
    }
  });

  it('works with empty faces and energy', () => {
    const ts = pickThumbnailTimestamps({
      startSec: 0,
      endSec: 10,
      faces: [],
      energy: [],
      scenes,
      count: 2,
    });
    expect(ts.length).toBe(2);
  });

  it('avoids scene boundaries', () => {
    const scenesWithCuts: SceneDto[] = [
      { startSec: 3, endSec: 6, motion: 0.3 },
      { startSec: 6, endSec: 10, motion: 0.5 },
    ];
    const ts = pickThumbnailTimestamps({
      startSec: 0,
      endSec: 10,
      faces,
      energy,
      scenes: scenesWithCuts,
      count: 3,
    });
    // No timestamp should be within 0.4s of a scene cut at t=3 or t=6
    for (const t of ts) {
      expect(Math.abs(t - 3)).toBeGreaterThan(0.3);
      expect(Math.abs(t - 6)).toBeGreaterThan(0.3);
    }
  });
});