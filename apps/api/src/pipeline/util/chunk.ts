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
 * whose timestamps are relative to that chunk's start. After offsetting, segments
 * in the overlap region are deduplicated by fuzzy-matching start/end/text.
 */
export function mergeTranscriptSegments(
  chunkResults: Array<{ chunkStart: number; segments: TranscriptSegment[] }>,
  overlapSec: number,
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

  // Sort by start time.
  all.sort((a, b) => a.start - b.start);

  // Deduplicate segments in overlap regions: if two segments have nearly
  // identical start/end/text, keep only the first (it has more context).
  const deduped: TranscriptSegment[] = [];
  for (const seg of all) {
    const isDup = deduped.some(
      (d) =>
        Math.abs(d.start - seg.start) < 1.5 &&
        Math.abs(d.end - seg.end) < 1.5 &&
        d.text.replace(/\s+/g, ' ').trim() === seg.text.replace(/\s+/g, ' ').trim(),
    );
    if (!isDup) deduped.push(seg);
  }

  return deduped;
}