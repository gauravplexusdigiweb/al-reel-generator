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

  // ────────────────────────────────────────────────────────────────────
  // Title + Tags
  // ────────────────────────────────────────────────────────────────────

  async generateTitleAndTags(text: string): Promise<{ title: string; tags: string[] }> {
    const prompt =
      `You are a social media content strategist specializing in vertical short-form video (Reels, TikTok, Shorts).\n\n` +
      `From the transcript below, create:\n` +
      `1. A click-worthy reel title (max 8 words) that:\n` +
      `   - Sparks curiosity without being clickbait\n` +
      `   - Uses action verbs and power words\n` +
      `   - Includes a number or specific claim when possible\n` +
      `   - Is optimized for the explore/discovery page\n\n` +
      `2. 3-8 lowercase topic tags (single words or short phrases) that:\n` +
      `   - Mix broad (#marketing) and specific (#b2bsaas) terms\n` +
      `   - Are commonly searched on social platforms\n` +
      `   - Reflect the actual content\n\n` +
      `Respond ONLY as JSON: {"title": string, "tags": string[]}.\n\n` +
      `Transcript:\n"""${text.slice(0, 2000)}"""`;
    try {
      const out = await this.provider.complete(prompt, { json: true, temperature: 0.5 });
      const parsed = safeJson<{ title?: string; tags?: string[] }>(out);
      const title = (parsed?.title || '').trim();
      const tags = (parsed?.tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
      if (title) return { title, tags: tags.length ? tags : heuristicTags(text) };
    } catch (e) {
      this.logger.warn(`generateTitleAndTags fell back to heuristic: ${e}`);
    }
    return { title: heuristicTitle(text), tags: heuristicTags(text) };
  }

  // ────────────────────────────────────────────────────────────────────
  // Hook scoring
  // ────────────────────────────────────────────────────────────────────

  /** Score the strength of a reel's opening hook, 0..1. */
  async scoreHook(openingText: string): Promise<number> {
    const prompt =
      `You are an expert in short-form video content. Rate the HOOK POWER of this opening text for a vertical reel.\n\n` +
      `A strong hook (70-100):\n` +
      `  - Grabs attention within the first 2 seconds\n` +
      `  - Creates curiosity, tension, or promises value\n` +
      `  - Uses direct address ("you", "your"), questions, numbers, or bold claims\n` +
      `  - Makes the viewer want to keep watching\n\n` +
      `A moderate hook (40-69):\n` +
      `  - Interesting but takes a few seconds to engage\n` +
      `  - Sets up context before the payoff\n\n` +
      `A weak hook (0-39):\n` +
      `  - Starts mid-thought or with filler ("so", "basically", "anyway")\n` +
      `  - Is vague or generic\n` +
      `  - Does not create urgency or curiosity\n\n` +
      `Respond ONLY as JSON: {"score": number, "reason": "one phrase"}.\n\n` +
      `Opening text:\n"""${openingText.slice(0, 500)}"""`;
    try {
      const parsed = safeJson<{ score?: number }>(
        await this.provider.complete(prompt, { json: true, temperature: 0.2 }),
      );
      if (parsed && typeof parsed.score === 'number') return c01(parsed.score / 100);
    } catch (e) {
      this.logger.warn(`scoreHook fell back to heuristic: ${e}`);
    }
    return heuristicHook(openingText);
  }

  // ────────────────────────────────────────────────────────────────────
  // Emotion scoring
  // ────────────────────────────────────────────────────────────────────

  /** Emotional intensity of a passage, 0..1. */
  async scoreEmotion(text: string): Promise<number> {
    const prompt =
      `You are analyzing the emotional intensity of a video transcript segment.\n\n` +
      `Score from 0 to 100 where:\n` +
      `  0-30  : Flat, informational, neutral tone (lecture, documentation)\n` +
      `  31-50 : Mild engagement, conversational (casual discussion)\n` +
      `  51-70 : Clear emotional content (passion, excitement, frustration)\n` +
      `  71-85 : Highly emotional (anger, joy, vulnerability, inspiration)\n` +
      `  86-100: Extremely intense (peak excitement, deep emotion, revelation)\n\n` +
      `Respond ONLY as JSON: {"score": number, "primary_emotion": "one word"}.\n\n` +
      `Transcript:\n"""${text.slice(0, 800)}"""`;
    try {
      const parsed = safeJson<{ score?: number }>(
        await this.provider.complete(prompt, { json: true, temperature: 0.2 }),
      );
      if (parsed && typeof parsed.score === 'number') return c01(parsed.score / 100);
    } catch (e) {
      this.logger.warn(`scoreEmotion fell back to heuristic: ${e}`);
    }
    return heuristicEmotion(text);
  }

  // ────────────────────────────────────────────────────────────────────
  // Passage ranking
  // ────────────────────────────────────────────────────────────────────

  /**
   * Rank passages by "reel-worthiness" (hook + interest + self-containment).
   * Returns a 0..1 score per passage, index-aligned with the input.
   */
  async rankPassages(passages: string[]): Promise<number[]> {
    if (passages.length === 0) return [];

    // Batch in groups of 20 to keep the prompt manageable for smaller models.
    const BATCH_SIZE = 20;
    const results: number[] = new Array(passages.length).fill(0);

    for (let batchStart = 0; batchStart < passages.length; batchStart += BATCH_SIZE) {
      const batch = passages.slice(batchStart, batchStart + BATCH_SIZE);
      const numbered = batch.map((p, i) => `${batchStart + i}: ${p.slice(0, 280)}`).join('\n');

      const prompt =
        `You are an expert social media editor for short-form vertical video (Reels, TikTok, Shorts).\n\n` +
        `Evaluate each transcript passage as a potential standalone reel clip. Score 0-100 based on:\n\n` +
        `  1. HOOK POWER (30%): Does the opening grab attention? (questions, bold claims, "you", numbers)\n` +
        `  2. SELF-CONTAINMENT (25%): Would this make sense without prior context?\n` +
        `  3. EMOTIONAL IMPACT (20%): Does it evoke surprise, excitement, tension, or inspiration?\n` +
        `  4. PACING (15%): Is the information density appropriate for 15-60 seconds?\n` +
        `  5. ACTIONABILITY (10%): Does it inspire the viewer to share, save, or act?\n\n` +
        `Respond ONLY as JSON: {"scores": {"0": 85, "1": 42, ...}}.\n\n` +
        `Transcript passages:\n${numbered}`;

      try {
        const parsed = safeJson<{ scores?: Record<string, number> }>(
          await this.provider.complete(prompt, { json: true, temperature: 0.3, timeoutMs: 90_000 }),
        );
        if (parsed?.scores) {
          for (let i = 0; i < batch.length; i++) {
            const idx = batchStart + i;
            const v = parsed.scores?.[String(idx)] ?? parsed.scores?.[String(i)];
            results[idx] = typeof v === 'number' ? c01(v / 100) : heuristicInterest(batch[i]);
          }
          continue;
        }
      } catch (e) {
        this.logger.warn(`rankPassages batch ${batchStart} fell back to heuristic: ${e}`);
      }
      // Fallback for this batch.
      for (let i = 0; i < batch.length; i++) {
        results[batchStart + i] = heuristicInterest(batch[i]);
      }
    }
    return results;
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