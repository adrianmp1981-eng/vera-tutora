/**
 * Pure text helpers for the voice layer. No DOM, no React — safe to unit test.
 *
 * Vera wraps foreign-language snippets in [EN]…[/EN] / [ES]…[/ES] / [PT]…[/PT]
 * (see LANGUAGE TAGGING in geminiService). These helpers let the voice USE those
 * tags (parseLanguageTags) while the chat shows the text without them
 * (stripLanguageTags). Untagged text still falls back to heuristic detection.
 */

import { Mode } from '../types';

export type LangSegment = { text: string; lang: string };

const TAG_TO_LANG: Record<string, string> = { EN: 'en-US', ES: 'es-ES', PT: 'pt-PT' };

/**
 * The deterministic base language Vera writes in, given the mode and the teaching
 * language switch. Single source of truth shared by buildLanguageDiscipline (the
 * prompt), getListeningLang (the mic) and speakText (the voice) so they can't drift.
 *   - english    → en-US
 *   - portuguese → pt-PT
 *   - everything else → immersion? en-US : es-ES
 */
export const getBaseLang = (mode: Mode | undefined, teachingLang: 'es' | 'en'): 'en-US' | 'es-ES' | 'pt-PT' => {
  if (mode === 'english') return 'en-US';
  if (mode === 'portuguese') return 'pt-PT';
  return teachingLang === 'en' ? 'en-US' : 'es-ES';
};

// Matches any opening or closing language tag: [EN] [/EN] [ES] [/ES] [PT] [/PT].
const LANG_TAG_RE = /\[(\/?)(EN|ES|PT)\]/g;

/**
 * Score a text in each language: frequent words (1 point) + exclusive characters
 * (3 points, since they are very strong signals).
 */
export const languageScores = (text: string): { 'en-US': number; 'es-ES': number; 'pt-PT': number } => {
  const lower = text.toLowerCase();

  const PT_WORDS = ['não', 'você', 'obrigado', 'muito', 'está', 'são', 'também', 'então', 'agora', 'aqui'];
  const ES_WORDS = ['hola', 'qué', 'cómo', 'para', 'pero', 'porque', 'cuando', 'muy', 'más', 'ahora', 'tienes', 'vamos', 'gracias'];
  const EN_WORDS = ['the', 'you', 'and', 'that', 'with', 'this', 'have', 'what', 'your', 'from', 'they', 'will'];

  const countWords = (words: string[]): number =>
    words.reduce((total, word) => {
      const matches = lower.match(new RegExp(`\\b${word}\\b`, 'g'));
      return total + (matches ? matches.length : 0);
    }, 0);

  const countChars = (regex: RegExp): number => {
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  };

  return {
    'pt-PT': countWords(PT_WORDS) + countChars(/[ãõç]/gi) * 3,
    'es-ES': countWords(ES_WORDS) + countChars(/[¿¡ñ]/gi) * 3,
    'en-US': countWords(EN_WORDS),
  };
};

/**
 * Detect the language of a text by heuristic. When no language strictly wins
 * (e.g. all scores are zero), return `fallback` instead of guessing. `fallback`
 * defaults to 'en-US' to preserve the previous behavior for existing callers.
 */
export const detectLanguage = (
  text: string,
  fallback: 'en-US' | 'es-ES' | 'pt-PT' = 'en-US'
): 'en-US' | 'es-ES' | 'pt-PT' => {
  const s = languageScores(text);
  if (s['pt-PT'] > s['es-ES'] && s['pt-PT'] > s['en-US']) return 'pt-PT';
  if (s['es-ES'] > s['pt-PT'] && s['es-ES'] > s['en-US']) return 'es-ES';
  if (s['en-US'] > s['es-ES'] && s['en-US'] > s['pt-PT']) return 'en-US';
  return fallback;
};

/**
 * Split mixed text into language-tagged segments by heuristic (no [EN]/[ES]/[PT]
 * tags). Used as the fallback for untagged text.
 */
export const splitByLanguage = (text: string): LangSegment[] => {
  // Boundaries: line breaks, sentence ends (. ! ? :) and opening/closing quotes
  // (quotes usually mark a language switch). Chunks with no letters are dropped.
  const rawSegments = text
    .split(/\n+|(?<=[.!?:])\s+|(?=["“”«»])|(?<=["“”«»])/g)
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s));

  const wordCount = (s: string): number => (s.match(/\p{L}+/gu) || []).length;

  const merged: LangSegment[] = [];
  for (const seg of rawSegments) {
    const scores = languageScores(seg);
    const maxScore = Math.max(scores['en-US'], scores['es-ES'], scores['pt-PT']);
    let lang: string = detectLanguage(seg);

    // Very short segment with no clear signal → inherit the previous language
    // instead of risking a bad detection.
    if (wordCount(seg) < 4 && maxScore === 0 && merged.length > 0) {
      lang = merged[merged.length - 1].lang;
    }

    // Merge consecutive same-language segments so prosody is not cut needlessly.
    const last = merged[merged.length - 1];
    if (last && last.lang === lang) {
      last.text += ' ' + seg;
    } else {
      merged.push({ text: seg, lang });
    }
  }

  return merged;
};

/**
 * Remove every [EN]/[ES]/[PT] tag (opening or closing), keeping the inner text.
 * This is what the chat shows. Tolerant of unclosed / nested / stray tags: it
 * just deletes the tag tokens wherever they appear and never throws.
 */
export const stripLanguageTags = (text: string): string =>
  text.replace(LANG_TAG_RE, '');

/**
 * Turn tagged text into language segments the voice can speak.
 * - [EN]…[/EN] → en-US, [ES]…[/ES] → es-ES, [PT]…[/PT] → pt-PT.
 * - Text OUTSIDE any tag: assigned to `baseLang` when given (deterministic, NO
 *   heuristic — this is the fix for Spanish being read as English); only when
 *   `baseLang` is absent does it fall back to splitByLanguage/detectLanguage.
 * - Consecutive same-language segments are merged.
 * - Tolerant of unclosed and nested tags: never throws, never leaks a tag token.
 */
export const parseLanguageTags = (text: string, baseLang?: string): LangSegment[] => {
  // 1) Walk the tokens, assigning each text chunk to the innermost open language
  //    (a stack), or null when no tag is open.
  const chunks: Array<{ text: string; lang: string | null }> = [];
  const stack: string[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  // Local regex instance so lastIndex state never leaks between calls.
  const re = new RegExp(LANG_TAG_RE.source, 'g');

  const pushChunk = (chunk: string) => {
    if (chunk) chunks.push({ text: chunk, lang: stack.length ? stack[stack.length - 1] : null });
  };

  while ((m = re.exec(text)) !== null) {
    pushChunk(text.slice(lastIndex, m.index));
    const isClose = m[1] === '/';
    const lang = TAG_TO_LANG[m[2]];
    if (isClose) {
      // Pop the nearest matching open tag; ignore a stray close with no opener.
      const idx = stack.lastIndexOf(lang);
      if (idx !== -1) stack.splice(idx, 1);
    } else {
      stack.push(lang);
    }
    lastIndex = re.lastIndex;
  }
  pushChunk(text.slice(lastIndex));

  // 2) Expand: tagged chunks keep their language; untagged chunks are assigned to
  //    baseLang when given, else resolved by the heuristic fallback. Drop chunks
  //    with no letters.
  const expanded: LangSegment[] = [];
  for (const chunk of chunks) {
    if (chunk.lang) {
      const t = chunk.text.trim();
      if (/\p{L}/u.test(t)) expanded.push({ text: t, lang: chunk.lang });
    } else if (baseLang) {
      const t = chunk.text.trim();
      if (/\p{L}/u.test(t)) expanded.push({ text: t, lang: baseLang });
    } else {
      for (const sub of splitByLanguage(chunk.text)) expanded.push(sub);
    }
  }

  // 3) Merge consecutive same-language segments.
  const merged: LangSegment[] = [];
  for (const seg of expanded) {
    const last = merged[merged.length - 1];
    if (last && last.lang === seg.lang) last.text += ' ' + seg.text;
    else merged.push({ ...seg });
  }

  return merged;
};

const wordCount = (s: string): number => (s.match(/\p{L}+/gu) || []).length;

/**
 * Absorb short foreign snippets into the base voice so the voice does not brake
 * for them. A tiny foreign segment (≤3 words) that is surrounded by base-language
 * segments is re-labeled to `baseLang` (the Spanish voice saying "supply chain"
 * with an accent sounds more natural than a hard voice switch). A full foreign
 * sentence keeps its native voice. Pure — same array shape in and out.
 */
export const mergeShortForeignSegments = (
  segments: LangSegment[],
  baseLang: string
): LangSegment[] => {
  // 1) Re-label short foreign segments whose existing neighbors are ALL base.
  const relabeled: LangSegment[] = segments.map((seg, i) => {
    if (seg.lang === baseLang) return seg;
    if (wordCount(seg.text) > 3) return seg;

    const prev = segments[i - 1];
    const next = segments[i + 1];
    const prevIsBase = !prev || prev.lang === baseLang;
    const nextIsBase = !next || next.lang === baseLang;
    // Needs at least one real neighbor, and every neighbor must be the base
    // language ("surrounded by base"). A lone foreign segment keeps its voice.
    if ((prev || next) && prevIsBase && nextIsBase) {
      return { text: seg.text, lang: baseLang };
    }
    return seg;
  });

  // 2) Merge consecutive same-language segments.
  const merged: LangSegment[] = [];
  for (const seg of relabeled) {
    const last = merged[merged.length - 1];
    if (last && last.lang === seg.lang) last.text += ' ' + seg.text;
    else merged.push({ ...seg });
  }
  return merged;
};
