import { describe, it, expect } from 'vitest';
import {
  parseLanguageTags,
  splitByLanguage,
  stripLanguageTags,
} from './voiceLang';

// A tag token: [EN] [/EN] [ES] [/ES] [PT] [/PT]. The voice must NEVER speak one
// and the chat must NEVER show one.
const TAG_TOKEN = /\[\/?(?:EN|ES|PT)\]/;

const hasNoTagToken = (s: string) => expect(s).not.toMatch(TAG_TOKEN);

describe('parseLanguageTags', () => {
  it('assigns the tagged language to mixed text with all three tags', () => {
    const input = 'Hola, esto es una prueba. [EN]Hello there[/EN] [PT]Olá, tudo bem[/PT] fin.';
    const segs = parseLanguageTags(input);

    expect(segs.some((s) => s.lang === 'en-US' && s.text.includes('Hello there'))).toBe(true);
    expect(segs.some((s) => s.lang === 'pt-PT' && s.text.includes('Olá'))).toBe(true);
    // The untagged Spanish is still there, resolved by the fallback.
    expect(segs.some((s) => s.text.includes('Hola'))).toBe(true);
    // No segment ever contains a raw tag token.
    for (const s of segs) hasNoTagToken(s.text);
  });

  it('tolerates an unclosed tag without leaking it or throwing', () => {
    const input = 'Empezamos y ahora [EN]this never closes and runs to the very end';
    let segs!: ReturnType<typeof parseLanguageTags>;
    expect(() => { segs = parseLanguageTags(input); }).not.toThrow();

    expect(segs.some((s) => s.lang === 'en-US' && s.text.includes('this never closes'))).toBe(true);
    for (const s of segs) hasNoTagToken(s.text);
  });

  it('tolerates nested tags, switching language per depth', () => {
    const input = '[EN]outer part [ES]inner part[/ES] more outer[/EN]';
    const segs = parseLanguageTags(input);

    expect(segs.map((s) => s.lang)).toEqual(['en-US', 'es-ES', 'en-US']);
    expect(segs[0].text).toContain('outer part');
    expect(segs[1].text).toContain('inner part');
    expect(segs[2].text).toContain('more outer');
    for (const s of segs) hasNoTagToken(s.text);
  });

  it('falls back to splitByLanguage when there are no tags', () => {
    const input = 'Hola, ¿cómo estás? Muy bien, gracias.';
    // With no tags, parseLanguageTags must be exactly the heuristic fallback.
    expect(parseLanguageTags(input)).toEqual(splitByLanguage(input));
    // And it's detected as Spanish (¿, cómo, muy, gracias).
    expect(parseLanguageTags(input)[0].lang).toBe('es-ES');
  });

  it('merges consecutive same-language segments into one', () => {
    const input = '[EN]First part.[/EN] [EN]Second part.[/EN]';
    const segs = parseLanguageTags(input);

    expect(segs).toHaveLength(1);
    expect(segs[0].lang).toBe('en-US');
    expect(segs[0].text).toContain('First part.');
    expect(segs[0].text).toContain('Second part.');
  });
});

describe('stripLanguageTags', () => {
  it('removes every tag but keeps the inner text', () => {
    expect(stripLanguageTags('a [EN]b[/EN] c [ES]d[/ES]')).toBe('a b c d');
  });

  it('tolerates unclosed and nested tags', () => {
    expect(stripLanguageTags('[EN]x [ES]y')).toBe('x y');
    hasNoTagToken(stripLanguageTags('[EN]outer [ES]inner[/ES] more[/EN]'));
  });
});

describe('display vs spoken invariant', () => {
  // This is the guard that stops anyone re-introducing the strip mid-pipeline:
  // the object that reaches speakText KEEPS the tags; the one shown in the chat has NONE.
  it('keeps tags for speech and strips them for display', () => {
    const tagged = 'Usa el término [EN]Delivered Duty Paid[/EN] cuando toque. ¿Vale?';

    // What App stores on the message:
    const display = stripLanguageTags(tagged); // -> message.text (chat)
    const spoken = tagged;                     // -> message.spokenText (voice)

    // Chat shows no tags.
    hasNoTagToken(display);
    // Voice input still carries the tags...
    expect(spoken).toMatch(/\[EN\]/);
    // ...and what the voice actually pronounces never contains a tag token,
    // while the English snippet is correctly a separate en-US segment.
    const segs = parseLanguageTags(spoken);
    const spokenJoined = segs.map((s) => s.text).join(' ');
    hasNoTagToken(spokenJoined);
    expect(segs.some((s) => s.lang === 'en-US' && s.text.includes('Delivered Duty Paid'))).toBe(true);
  });
});
