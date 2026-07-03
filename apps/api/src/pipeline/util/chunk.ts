import type { TranscriptSegment } from '@arg/shared';

export interface ChunkRange {
  startSec: number;
  endSec: number;
}

/**
 * Plan overlapping chunks for a long audio file.
 * Each chunk is at most `maxChunkSec` long, with `overlapSec` of overlap
 * between consecutive chunks to avoid cutting words mid-sentence.
 *
 * Returns `[{0, D}]` (single chunk) when the file is short enough.
 */
export function planChunks(
  durationSec: number,
  maxChunkSec = 600,
  overlapSec = 30,
): ChunkRange[] {
  if (durationSec <= maxChunkSec + overlapSec) {
    return [{ startSec: 0, endSec: durationSec }];
  }
  const chunks: ChunkRange[] = [];
  let start = 0;
  while (start < durationSec) {
    const end = Math.min(start + maxChunkSec, durationSec);
    chunks.push({ startSec: start, endSec: end });
    if (end >= durationSec) break;
    start = end - overlapSec;
  }
  return chunks;
}

/**
 * Merge transcript segments from overlapping chunks into a single timeline.
 *
 * Each chunk result carries `chunkStart` (the offset to add) and the raw segments
 * whose timestamps are relative to that chunk's start. After offsetting to absolute
 * time, segments in the overlap regions are de-duplicated by *time overlap* (not text):
 * when two consecutive segments substantially overlap — as the same speech transcribed
 * by two adjacent chunks does — the longer/more-complete one is kept. Text-based
 * de-dup would miss boundary-straddling segments (truncated in one chunk, full in the
 * next) and leave duplicate captions.
 */
export function mergeTranscriptSegments(
  chunkResults: Array<{ chunkStart: number; segments: TranscriptSegment[] }>,
  _overlapSec: number,
): TranscriptSegment[] {
  // Offset all segments to absolute timestamps.
  const all: TranscriptSegment[] = [];
  for (const { chunkStart, segments } of chunkResults) {
    for (const s of segments) {
      all.push({
        start: s.start + chunkStart,
        end: s.end + chunkStart,
        text: s.text,
        words: s.words?.map((w) => ({
          start: w.start + chunkStart,
          end: w.end + chunkStart,
          text: w.text,
        })),
      });
    }
  }

  // Sort by start time so overlapping duplicates from adjacent chunks are neighbors.
  all.sort((a, b) => a.start - b.start || a.end - b.end);

  const deduped: TranscriptSegment[] = [];
  for (const seg of all) {
    const last = deduped[deduped.length - 1];
    if (last) {
      const inter = Math.min(last.end, seg.end) - Math.max(last.start, seg.start);
      const minDur = Math.max(0.001, Math.min(last.end - last.start, seg.end - seg.start));
      if (inter > 0.5 * minDur) {
        // Same speech from two chunks — keep the longer (more complete) transcription.
        if (seg.end - seg.start > last.end - last.start) {
          deduped[deduped.length - 1] = seg;
        }
        continue;
      }
    }
    deduped.push(seg);
  }

  return deduped;
}