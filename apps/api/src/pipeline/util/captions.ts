import type { TranscriptSegment } from '@arg/shared';
import type { Dims } from './aspect';

const DEFAULT_DIMS: Dims = { w: 1080, h: 1920 };

/** Caption look; colours are ASS `&HAABBGGRR`. */
export interface CaptionStyle {
  fontName: string;
  fontSize: number;
  text: string; // normal word colour
  highlight: string; // karaoke active-word colour
  outline: string;
  outlineWidth: number;
  shadow: number;
  marginV: number; // distance from bottom (9:16 safe area)
  bold: boolean;
}

export const CAPTION_PRESETS: Record<string, CaptionStyle> = {
  // white words, yellow active word, bottom-centered
  default: {
    fontName: 'Arial',
    fontSize: 64,
    text: '&H00FFFFFF',
    highlight: '&H0000E5FF',
    outline: '&H00000000',
    outlineWidth: 4,
    shadow: 1,
    marginV: 260,
    bold: true,
  },
  // raised higher so captions clear the TikTok/Instagram UI overlay
  raised: {
    fontName: 'Arial',
    fontSize: 64,
    text: '&H00FFFFFF',
    highlight: '&H0000E5FF',
    outline: '&H00000000',
    outlineWidth: 4,
    shadow: 1,
    marginV: 520,
    bold: true,
  },
};

export function resolveCaptionStyle(s?: CaptionStyle | string): CaptionStyle {
  if (!s) return CAPTION_PRESETS.default;
  if (typeof s === 'string') return CAPTION_PRESETS[s] ?? CAPTION_PRESETS.default;
  return s;
}

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

/** Inline colour override token (drops the alpha byte): &H00FFFFFF -> &HFFFFFF& */
function inlineColour(c: string): string {
  const hex = c.replace(/^&H/i, '').replace(/&$/, '');
  return `&H${hex.slice(-6)}&`;
}

function header(style: CaptionStyle, karaoke: boolean, dims: Dims): string {
  // For karaoke, unsung text is Secondary(text colour) and sweeps to Primary(highlight).
  // For plain captions, Primary is the visible text colour.
  const primary = karaoke ? style.highlight : style.text;
  const secondary = style.text;
  const bold = style.bold ? -1 : 0;
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${dims.w}`,
    `PlayResY: ${dims.h}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,${style.fontName},${style.fontSize},${primary},${secondary},${style.outline},&H80000000,${bold},0,0,0,100,100,0,0,1,${style.outlineWidth},${style.shadow},2,80,80,${style.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');
}

interface WindowSeg {
  start: number;
  end: number;
  text: string;
  words?: { start: number; end: number; text: string }[];
}

function segmentsInWindow(segments: TranscriptSegment[], reelStart: number, reelEnd: number): WindowSeg[] {
  const dur = reelEnd - reelStart;
  return segments
    .map((s) => ({
      start: s.start - reelStart,
      end: s.end - reelStart,
      text: escapeText(s.text),
      words: s.words?.map((w) => ({ start: w.start - reelStart, end: w.end - reelStart, text: escapeText(w.text) })),
    }))
    .filter((s) => s.text && s.end > 0 && s.start < dur)
    .map((s) => ({ ...s, start: Math.max(0, s.start), end: Math.min(dur, s.end) }));
}

/** Plain segment-level captions. */
export function buildAssSubtitle(
  segments: TranscriptSegment[],
  reelStart: number,
  reelEnd: number,
  style?: CaptionStyle | string,
  dims: Dims = DEFAULT_DIMS,
): string | null {
  const st = resolveCaptionStyle(style);
  const events = segmentsInWindow(segments, reelStart, reelEnd);
  if (events.length === 0) return null;
  const body = events
    .map((e) => `Dialogue: 0,${assTime(e.start)},${assTime(e.end)},Default,,0,0,0,,${e.text}`)
    .join('\n');
  return `${header(st, false, dims)}\n${body}\n`;
}

/** Word-level "karaoke" captions using ASS \k timing. Requires word timestamps. */
export function buildKaraokeAss(
  segments: TranscriptSegment[],
  reelStart: number,
  reelEnd: number,
  style?: CaptionStyle | string,
  dims: Dims = DEFAULT_DIMS,
): string | null {
  const st = resolveCaptionStyle(style);
  const events = segmentsInWindow(segments, reelStart, reelEnd);
  if (events.length === 0) return null;

  const lines: string[] = [];
  const textOverride = `{\\1c${inlineColour(st.text)}}`;
  for (const e of events) {
    if (e.words && e.words.length) {
      let cursor = e.start;
      let payload = '';
      for (const w of e.words) {
        const gap = Math.max(0, w.start - cursor);
        if (gap > 0.02) payload += `{\\k${Math.round(gap * 100)}}`;
        const k = Math.max(1, Math.round((w.end - w.start) * 100));
        payload += `{\\k${k}}${w.text} `;
        cursor = w.end;
      }
      lines.push(`Dialogue: 0,${assTime(e.start)},${assTime(e.end)},Default,,0,0,0,,${payload.trim()}`);
    } else {
      // no word timing → plain line forced to the normal text colour
      lines.push(`Dialogue: 0,${assTime(e.start)},${assTime(e.end)},Default,,0,0,0,,${textOverride}${e.text}`);
    }
  }
  return `${header(st, true, dims)}\n${lines.join('\n')}\n`;
}

/**
 * Choose karaoke when most in-window segments carry word timings, else plain.
 * Returns null when there are no captions.
 */
export function buildCaptions(
  segments: TranscriptSegment[],
  reelStart: number,
  reelEnd: number,
  style?: CaptionStyle | string,
  preferKaraoke = true,
  dims: Dims = DEFAULT_DIMS,
): string | null {
  const inWin = segmentsInWindow(segments, reelStart, reelEnd);
  if (inWin.length === 0) return null;
  const withWords = inWin.filter((s) => s.words && s.words.length).length;
  const karaoke = preferKaraoke && withWords / inWin.length >= 0.5;
  return karaoke
    ? buildKaraokeAss(segments, reelStart, reelEnd, style, dims)
    : buildAssSubtitle(segments, reelStart, reelEnd, style, dims);
}

/**
 * Standalone animated text overlay for one teaser beat: a **big** centered title
 * (with a subtle pop) or a **small** lower caption — both fade in/out. Null if empty.
 */
export function buildBeatTextAss(
  text: string,
  durationSec: number,
  size: 'big' | 'small',
  dims: Dims = DEFAULT_DIMS,
): string | null {
  const clean = escapeText(text || '');
  if (!clean) return null;
  const big = size === 'big';
  const fontSize = Math.round(dims.h * (big ? 0.075 : 0.04));
  const marginV = Math.round(dims.h * (big ? 0.0 : 0.12));
  const alignment = big ? 5 : 2; // 5 = middle-center, 2 = bottom-center
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${dims.w}`,
    `PlayResY: ${dims.h}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Beat,Arial,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${big ? 5 : 4},2,${alignment},80,80,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');
  const fade = big ? 350 : 200;
  const pop = big ? '{\\fscx80\\fscy80\\t(0,300,\\fscx104\\fscy104)}' : '';
  const body = `Dialogue: 0,${assTime(0)},${assTime(durationSec)},Beat,,0,0,0,,{\\fad(${fade},${fade})}${pop}${clean}`;
  return `${header}\n${body}\n`;
}
