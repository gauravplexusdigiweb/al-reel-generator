import type { TranscriptSegment } from '@arg/shared';

function assTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${ss}`;
}

function escapeText(t: string): string {
  return t.replace(/\r?\n/g, ' ').replace(/[{}]/g, '').trim();
}

/**
 * Build a styled ASS subtitle file (1080x1920) from transcript segments, offset
 * to the reel start and clipped to its duration. Returns null if no captions.
 */
export function buildAssSubtitle(
  segments: TranscriptSegment[],
  reelStart: number,
  reelEnd: number,
): string | null {
  const dur = reelEnd - reelStart;
  const events = segments
    .map((s) => ({ start: s.start - reelStart, end: s.end - reelStart, text: escapeText(s.text) }))
    .filter((s) => s.text && s.end > 0 && s.start < dur)
    .map((s) => ({ start: Math.max(0, s.start), end: Math.min(dur, s.end), text: s.text }));

  if (events.length === 0) return null;

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1080',
    'PlayResY: 1920',
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // white text, black outline, bottom-centered, generous bottom margin for 9:16
    'Style: Default,Arial,64,&H00FFFFFF,&H00000000,&H80000000,-1,0,1,4,1,2,80,80,260,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const body = events
    .map((e) => `Dialogue: 0,${assTime(e.start)},${assTime(e.end)},Default,,0,0,0,,${e.text}`)
    .join('\n');

  return `${header}\n${body}\n`;
}
