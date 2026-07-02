import { Injectable, Logger } from '@nestjs/common';
import { OllamaProvider, LlmProvider } from './ollama.provider';

const STOPWORDS = new Set(
  ('a an the and or but if then this that these those i you he she it we they me my your our of to in on ' +
    'for with at by from as is are was were be been being do does did have has had will would can could should ' +
    'so just like yeah okay ok um uh so').split(/\s+/),
);

/** clamp a number to [0,1]. */
const c01 = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * High-level LLM tasks used by the pipeline. Every call degrades to a deterministic
 * heuristic if the provider is unavailable or returns garbage (fault tolerance / NFR).
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  constructor(private readonly provider: OllamaProvider) {}

  get raw(): LlmProvider {
    return this.provider;
  }

  async generateTitleAndTags(text: string): Promise<{ title: string; tags: string[] }> {
    const prompt =
      `You are a social media editor. From the transcript below, produce a punchy vertical-video ` +
      `reel title (max 8 words) and 3-6 lowercase topic tags. Respond ONLY as JSON: ` +
      `{"title": string, "tags": string[]}.\n\nTranscript:\n"""${text.slice(0, 2000)}"""`;
    try {
      const out = await this.provider.complete(prompt, { json: true });
      const parsed = safeJson<{ title?: string; tags?: string[] }>(out);
      const title = (parsed?.title || '').trim();
      const tags = (parsed?.tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
      if (title) return { title, tags: tags.length ? tags : heuristicTags(text) };
    } catch (e) {
      this.logger.warn(`generateTitleAndTags fell back to heuristic: ${e}`);
    }
    return { title: heuristicTitle(text), tags: heuristicTags(text) };
  }

  /** Score the strength of a reel's opening hook, 0..1. */
  async scoreHook(openingText: string): Promise<number> {
    const prompt =
      `Rate how strong this video opening HOOK is for retaining a scroller, from 0 to 100. ` +
      `Consider curiosity, tension, and clarity. Respond ONLY as JSON {"score": number}.\n\n"""${openingText.slice(0, 500)}"""`;
    try {
      const parsed = safeJson<{ score?: number }>(await this.provider.complete(prompt, { json: true }));
      if (parsed && typeof parsed.score === 'number') return c01(parsed.score / 100);
    } catch (e) {
      this.logger.warn(`scoreHook fell back to heuristic: ${e}`);
    }
    return heuristicHook(openingText);
  }

  /** Emotional intensity of a passage, 0..1. */
  async scoreEmotion(text: string): Promise<number> {
    const prompt =
      `Rate the emotional intensity of this transcript from 0 to 100 ` +
      `(0 = flat/monotone, 100 = highly emotional). Respond ONLY as JSON {"score": number}.\n\n"""${text.slice(0, 800)}"""`;
    try {
      const parsed = safeJson<{ score?: number }>(await this.provider.complete(prompt, { json: true }));
      if (parsed && typeof parsed.score === 'number') return c01(parsed.score / 100);
    } catch (e) {
      this.logger.warn(`scoreEmotion fell back to heuristic: ${e}`);
    }
    return heuristicEmotion(text);
  }

  /**
   * Rank passages by "reel-worthiness" (hook + interest). Returns a 0..1 score per
   * passage, index-aligned with the input.
   */
  async rankPassages(passages: string[]): Promise<number[]> {
    if (passages.length === 0) return [];
    const numbered = passages.map((p, i) => `${i}: ${p.slice(0, 240)}`).join('\n');
    const prompt =
      `You rank transcript passages by how well they would work as a standalone short vertical reel ` +
      `(strong hook, emotion, self-contained insight). For EACH index below, give a score 0-100. ` +
      `Respond ONLY as JSON {"scores": {"<index>": number, ...}}.\n\n${numbered}`;
    try {
      const parsed = safeJson<{ scores?: Record<string, number> }>(
        await this.provider.complete(prompt, { json: true, timeoutMs: 90_000 }),
      );
      if (parsed?.scores) {
        return passages.map((p, i) => {
          const v = parsed.scores?.[String(i)];
          return typeof v === 'number' ? c01(v / 100) : heuristicInterest(p);
        });
      }
    } catch (e) {
      this.logger.warn(`rankPassages fell back to heuristic: ${e}`);
    }
    return passages.map(heuristicInterest);
  }
}

// ---------- JSON parsing ----------
function safeJson<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------- Heuristic fallbacks ----------
function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function heuristicTitle(text: string): string {
  const firstSentence = text.split(/[.!?\n]/).map((s) => s.trim()).find((s) => s.length > 8) ?? text.trim();
  const w = firstSentence.split(/\s+/).slice(0, 8).join(' ');
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : 'Untitled reel';
}

function heuristicTags(text: string): string[] {
  const freq = new Map<string, number>();
  for (const w of words(text)) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
}

function heuristicHook(text: string): number {
  const t = text.toLowerCase();
  let s = 0.3;
  if (/\?/.test(text)) s += 0.2;
  if (/\d/.test(text)) s += 0.15;
  if (/\b(you|your|how|why|secret|never|stop|nobody|everyone|mistake)\b/.test(t)) s += 0.25;
  if (text.trim().length < 10) s -= 0.2;
  return c01(s);
}

function heuristicEmotion(text: string): number {
  const exclam = (text.match(/!/g) ?? []).length;
  const caps = (text.match(/\b[A-Z]{3,}\b/g) ?? []).length;
  const emo = (text.toLowerCase().match(
    /\b(love|hate|amazing|incredible|shocking|crazy|insane|beautiful|terrible|wow|unbelievable|scared|excited|angry|happy|sad)\b/g,
  ) ?? []).length;
  return c01(0.25 + exclam * 0.08 + caps * 0.05 + emo * 0.12);
}

function heuristicInterest(text: string): number {
  const w = words(text);
  const contentWords = w.filter((x) => x.length >= 4 && !STOPWORDS.has(x));
  const density = w.length ? contentWords.length / w.length : 0;
  return c01(0.2 + density * 0.6 + heuristicHook(text) * 0.2);
}
