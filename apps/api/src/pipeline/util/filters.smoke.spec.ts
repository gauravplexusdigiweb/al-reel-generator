import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildBlurFillFilter, buildCropFilter } from './crop';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg: string = require('ffmpeg-static');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffprobe: string = require('ffprobe-static').path;

const dims = (f: string): string =>
  execFileSync(ffprobe, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f,
  ])
    .toString()
    .trim();

/** Smoke test: the generated ffmpeg filters actually produce 1080x1920 output. */
describe('ffmpeg filter smoke', () => {
  let dir: string;
  let clip: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'reelfx-'));
    clip = path.join(dir, 'in.mp4');
    execFileSync(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=10:duration=1',
      '-frames:v', '10', '-pix_fmt', 'yuv420p', clip,
    ]);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('blur-fill renders 1080x1920', () => {
    const out = path.join(dir, 'blur.mp4');
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', clip, '-vf', buildBlurFillFilter(), '-frames:v', '5', out]);
    expect(dims(out)).toBe('1080,1920');
  });

  it('face-tracked crop renders 1080x1920', () => {
    const faces = Array.from({ length: 6 }, (_, i) => ({ t: i, boxes: [{ x: 0.3, y: 0.2, w: 0.2, h: 0.3, score: 0.9 }] }));
    const out = path.join(dir, 'crop.mp4');
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', clip, '-vf', buildCropFilter(faces, 0, 1, 640, 360), '-frames:v', '5', out]);
    expect(dims(out)).toBe('1080,1920');
  });
});
