import { planChunks, mergeTranscriptSegments } from './chunk';
import type { TranscriptSegment } from '@arg/shared';

describe('planChunks', () => {
  it('returns single chunk for short audio', () => {
    const chunks = planChunks(300, 600, 30);
    expect(chunks).toEqual([{ startSec: 0, endSec: 300 }]);
  });

  it('returns single chunk when duration equals threshold', () => {
    const chunks = planChunks(600, 600, 30);
    expect(chunks.length).toBe(1);
  });

  it('splits long audio into overlapping chunks', () => {
    const chunks = planChunks(1800, 600, 30);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be at most 600s
    for (const c of chunks) {
      expect(c.endSec - c.startSec).toBeLessThanOrEqual(600);
    }
    // Consecutive chunks should overlap by 30s
    for (let i = 1; i < chunks.length; i++) {
      const overlap = chunks[i - 1].endSec - chunks[i].startSec;
      expect(overlap).toBe(30);
    }
    // First chunk starts at 0, last chunk ends at duration
    expect(chunks[0].startSec).toBe(0);
    expect(chunks[chunks.length - 1].endSec).toBe(1800);
  });

  it('covers the full duration without gaps', () => {
    const dur = 3600; // 1 hour
    const chunks = planChunks(dur, 600, 30);
    expect(chunks[0].startSec).toBe(0);
    expect(chunks[chunks.length - 1].endSec).toBe(dur);
    // No gaps between consecutive chunks (overlap or contiguous)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startSec).toBeLessThanOrEqual(chunks[i - 1].endSec);
    }
  });
});

describe('mergeTranscriptSegments', () => {
  const seg = (start: number, end: number, text: string): TranscriptSegment => ({ start, end, text });

  it('offsets segments by chunk start time', () => {
    const result = mergeTranscriptSegments(
      [
        { chunkStart: 0, segments: [seg(0, 5, 'hello world')] },
        { chunkStart: 570, segments: [seg(0, 10, 'second chunk')] },
      ],
      30,
    );
    expect(result).toEqual([
      { start: 0, end: 5, text: 'hello world', words: undefined },
      { start: 570, end: 580, text: 'second chunk', words: undefined },
    ]);
  });

  it('deduplicates segments in the overlap region', () => {
    // Chunk 0 covers 0-600. Chunk 1 covers 570-1200 (30s overlap: 570-600).
    // A segment at absolute 575-580 appears in both chunks:
    //   chunk 0: raw (575, 580)
    //   chunk 1: raw (5, 10) -> offset by 570 -> absolute (575, 580)
    const result = mergeTranscriptSegments(
      [
        {
          chunkStart: 0,
          segments: [
            seg(0, 5, 'hello world'),
            seg(575, 580, 'overlapping text'),
          ],
        },
        {
          chunkStart: 570,
          segments: [
            seg(5, 10, 'overlapping text'),  // becomes 575-580 — duplicate
            seg(10, 15, 'unique to chunk 1'), // becomes 580-585
          ],
        },
      ],
      30,
    );

    // The duplicate should be removed
    const overlapSegs = result.filter((s) => s.text === 'overlapping text');
    expect(overlapSegs.length).toBe(1);
  });

  it('handles empty chunk results', () => {
    const result = mergeTranscriptSegments([], 30);
    expect(result).toEqual([]);
  });

  it('preserves word-level timings', () => {
    const result = mergeTranscriptSegments(
      [
        {
          chunkStart: 100,
          segments: [
            {
              start: 0,
              end: 5,
              text: 'hello',
              words: [
                { start: 0, end: 2, text: 'hel' },
                { start: 2, end: 5, text: 'lo' },
              ],
            },
          ],
        },
      ],
      30,
    );
    expect(result[0].words).toEqual([
      { start: 100, end: 102, text: 'hel' },
      { start: 102, end: 105, text: 'lo' },
    ]);
  });
});