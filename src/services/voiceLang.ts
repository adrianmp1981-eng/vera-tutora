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
 * Remove emoji and pictographs from SPOKEN text so the TTS engine does not
 * verbalize them ("👉" was being read aloud as "mano"). Strips every
 * Extended_Pictographic glyph together with the machinery that composes it —
 * variation selector (FE0F), zero-width joiner (200D), skin-tone modifiers and
 * keycaps — plus regional-indicator flags. Letters (incl. ñ and accents), ¿ ¡
 * and ordinary punctuation are left untouched. Pure: used only for the voice,
 * never for the chat message that gets rendered.
 */
export const stripEmoji = (text: string): string => {
  const emoji = new RegExp(
    '(?:' +
      // Keycap: digit / # / * + optional VS16 + combining enclosing keycap.
      '[#*0-9]\\uFE0F?\\u20E3' +
      '|' +
      // Regional-indicator pair (flags).
      '[\\u{1F1E6}-\\u{1F1FF}]{2}' +
      '|' +
      // Pictograph + optional modifier/VS, then any ZWJ-joined continuation.
      '\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?' +
      '(?:\\u200D\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?)*' +
    ')',
    'gu'
  );
  // Sweep any orphaned combining chars a partial sequence could leave behind:
  // ZWJ (200D), variation selector (FE0F), keycap (20E3), skin-tone modifiers.
  const orphans = new RegExp('[\\u200D\\uFE0F\\u20E3\\u{1F3FB}-\\u{1F3FF}]', 'gu');
  return text
    .replace(emoji, '')
    .replace(orphans, '')
    // Collapse the gap the removal opened; keep single spaces.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

/**
 * Second pass of non-spoken cleanup for SPOKEN text (see stripEmoji for the
 * first). Handles symbols that are not pictographs so stripEmoji leaves them:
 *   - Bullets (• ▪ ● ‣ ⁃): removed anywhere — never spoken, never part of a word.
 *   - List markers (- or *) at the START of a line: removed with their indent
 *     and trailing space. A hyphen MID-line (compound words, ranges like 10-20,
 *     a dash between clauses) is left untouched — the anchor requires line start.
 *   - Blockquote '>' at the start of a line: removed.
 *   - Arrows (→ ← ↔ ⇒): replaced by a comma, NOT deleted nor read aloud. A comma
 *     gives the short, natural pause every TTS engine honors (semicolon support
 *     is uneven), which fits the "A → B" link between two short ideas.
 * Pure. Applied only to the voice; the chat keeps every character.
 */
export const stripSpeechMarkers = (text: string): string =>
  text
    .replace(/\s*[→←↔⇒]\s*/g, ', ')
    .replace(/[•▪●‣⁃]/g, '')
    .replace(/^[ \t]*[-*]+[ \t]+/gm, '')
    .replace(/^[ \t]*>+[ \t]?/gm, '')
    // Tidy the gaps the removals opened, per line, without touching the newlines
    // that chunkForSpeech still needs.
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+/gm, '')
    .replace(/^,[ \t]*/, '')
    .trim();

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

// Strip leading orphan punctuation and line breaks (e.g. ":\n\n\n") that appear
// at the start of a chunk; the voice should not read them.
const cleanChunkStart = (s: string): string => s.replace(/^[\s:;,.]+/, '').trim();

/**
 * Split a spoken segment into chunks of about `maxLen` chars WITHOUT dropping any
 * text. Cuts always land on a sentence boundary; when a single sentence is longer
 * than `maxLen`, on the last comma or space before the limit — never mid-word (if
 * there is no break before the limit it extends to the next space). Each chunk has
 * its leading orphan punctuation/newlines cleaned.
 */
export const chunkForSpeech = (text: string, maxLen = 200): string[] => {
  const cleaned = cleanChunkStart(text);
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  // Break an over-long unit on the last comma/space before maxLen (never a word).
  const breakLong = (input: string): string[] => {
    const pieces: string[] = [];
    let rest = input.trim();
    while (rest.length > maxLen) {
      let end: number;
      const comma = rest.lastIndexOf(',', maxLen);
      const space = rest.lastIndexOf(' ', maxLen);
      if (comma > 0) {
        end = comma + 1; // keep the comma with the piece
      } else if (space > 0) {
        end = space;
      } else {
        // No break before the limit: extend to the next space so no word is cut.
        const next = rest.indexOf(' ', maxLen);
        end = next > 0 ? next : rest.length;
      }
      pieces.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trim();
    }
    if (rest) pieces.push(rest);
    return pieces;
  };

  // Sentence units: split after . ! ? : + whitespace, and on line breaks.
  const sentences = cleaned.split(/(?<=[.!?:])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > maxLen) {
      if (current) { chunks.push(current); current = ''; }
      for (const piece of breakLong(sentence)) chunks.push(piece);
      continue;
    }
    if (current && current.length + 1 + sentence.length > maxLen) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks.map(cleanChunkStart).filter(Boolean);
};

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
