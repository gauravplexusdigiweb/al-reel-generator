import { buildAssSubtitle, buildKaraokeAss, buildCaptions } from './captions';

const withWords = [
  {
    start: 0,
    end: 2,
    text: 'hi there',
    words: [
      { start: 0, end: 1, text: 'hi' },
      { start: 1, end: 2, text: 'there' },
    ],
  },
];
const plain = [{ start: 0, end: 2, text: 'hi there' }];

describe('captions', () => {
  it('returns null when there are no captions in the window', () => {
    expect(buildCaptions([], 0, 10)).toBeNull();
    expect(buildAssSubtitle([], 0, 10)).toBeNull();
  });

  it('karaoke output carries \\k timing tags and a style header', () => {
    const a = buildKaraokeAss(withWords, 0, 10)!;
    expect(a).toContain('\\k');
    expect(a).toContain('[V4+ Styles]');
  });

  it('plain output has no \\k tags', () => {
    const a = buildAssSubtitle(plain, 0, 10)!;
    expect(a).not.toContain('\\k');
  });

  it('buildCaptions chooses karaoke iff words are present', () => {
    expect(buildCaptions(withWords, 0, 10, 'default', true)).toContain('\\k');
    expect(buildCaptions(plain, 0, 10, 'default', true)).not.toContain('\\k');
  });

  it('applies target dimensions to PlayRes', () => {
    const a = buildAssSubtitle(plain, 0, 10, 'default', { w: 1080, h: 1080 })!;
    expect(a).toContain('PlayResY: 1080');
  });
});
