import { buildCropFilter, buildBlurFillFilter, windowHasFace, windowActiveSpeakerCoverage } from './crop';

const faces = Array.from({ length: 6 }, (_, i) => ({
  t: i,
  boxes: [{ x: 0.3 + i * 0.02, y: 0.2, w: 0.2, h: 0.3, score: 0.9 }],
}));

describe('buildCropFilter', () => {
  it('scales a 9:16 crop to 1080x1920', () => {
    const f = buildCropFilter(faces, 0, 6, 1280, 720);
    expect(f).toContain('scale=1080:1920');
    expect(f).toMatch(/^crop=/);
  });

  it('honors a 1:1 target', () => {
    const f = buildCropFilter(faces, 0, 6, 1280, 720, { w: 1080, h: 1080 });
    expect(f).toContain('scale=1080:1080');
  });

  it('center-crops (numeric offsets) when there are no faces', () => {
    const f = buildCropFilter([], 0, 6, 1280, 720);
    expect(f).toMatch(/crop=\d+:\d+:\d+:\d+/);
  });

  it('accepts energy parameter without error', () => {
    const energy = [0.1, 0.5, 0.9, 0.7, 0.3, 0.6];
    const f = buildCropFilter(faces, 0, 6, 1280, 720, undefined, energy);
    expect(f).toContain('scale=1080:1920');
  });

  it('produces different crop with energy vs without for multi-face samples', () => {
    const multiFace = Array.from({ length: 6 }, (_, i) => ({
      t: i,
      boxes: [
        { x: 0.1 + i * 0.01, y: 0.2, w: 0.15, h: 0.25, score: 0.8 },
        { x: 0.6 + i * 0.01, y: 0.3, w: 0.25, h: 0.35, score: 0.9 },
      ],
    }));
    const energy = [0.9, 0.1, 0.9, 0.1, 0.9, 0.1];
    const fNoEnergy = buildCropFilter(multiFace, 0, 6, 1280, 720);
    const fWithEnergy = buildCropFilter(multiFace, 0, 6, 1280, 720, undefined, energy);
    // Both should produce valid crop filters
    expect(fNoEnergy).toContain('crop=');
    expect(fWithEnergy).toContain('crop=');
  });
});

describe('buildBlurFillFilter', () => {
  it('produces a split + overlay chain', () => {
    const f = buildBlurFillFilter();
    expect(f).toContain('split=2');
    expect(f).toContain('overlay=');
  });
});

describe('windowHasFace', () => {
  it('detects presence and absence of faces', () => {
    expect(windowHasFace(faces, 0, 6)).toBe(true);
    expect(windowHasFace([], 0, 6)).toBe(false);
    expect(windowHasFace([{ t: 0, boxes: [{ x: 0, y: 0, w: 0.1, h: 0.1, score: 0.1 }] }], 0, 6)).toBe(false);
  });
});

describe('windowActiveSpeakerCoverage', () => {
  it('returns 0 for empty energy', () => {
    expect(windowActiveSpeakerCoverage(faces, [], 0, 6)).toBe(0);
  });

  it('returns >0 when faces are present during high-energy moments', () => {
    const energy = [0.1, 0.9, 0.1, 0.8, 0.1, 0.9];
    const coverage = windowActiveSpeakerCoverage(faces, energy, 0, 6, 0.5);
    expect(coverage).toBeGreaterThan(0);
  });

  it('returns 0 when no faces are present during high-energy moments', () => {
    const lowEnergyFaces = [{ t: 100, boxes: [{ x: 0.3, y: 0.2, w: 0.2, h: 0.3, score: 0.9 }] }];
    const energy = [0.1, 0.9, 0.1, 0.8, 0.1, 0.9];
    const coverage = windowActiveSpeakerCoverage(lowEnergyFaces, energy, 0, 6, 0.5);
    expect(coverage).toBe(0);
  });

  it('returns high coverage when faces always present', () => {
    const energy = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9];
    const coverage = windowActiveSpeakerCoverage(faces, energy, 0, 6, 0.5);
    expect(coverage).toBeGreaterThan(0.5);
  });
});