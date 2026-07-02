import { buildCropFilter, buildBlurFillFilter, windowHasFace } from './crop';

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
