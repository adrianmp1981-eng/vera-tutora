import { describe, it, expect } from 'vitest';
import {
  parseLanguageTags,
  splitByLanguage,
  stripLanguageTags,
  getBaseLang,
  mergeShortForeignSegments,
  chunkForSpeech,
  stripEmoji,
  stripSpeechMarkers,
} from './voiceLang';

// All word/number tokens, order-preserving — used to prove no text is lost.
const tokens = (s: string): string[] => s.match(/\p{L}+|\d+/gu) || [];

// A tag token: [EN] [/EN] [ES] [/ES] [PT] [/PT]. The voice must NEVER speak one
// and the chat must NEVER show one.
const TAG_TOKEN = /\[\/?(?:EN|ES|PT)\]/;

const hasNoTagToken = (s: string) => expect(s).not.toMatch(TAG_TOKEN);

describe('stripEmoji', () => {
  // Any leftover emoji-machinery char: pictographs, ZWJ (200D), variation
  // selector (FE0F), skin-tone modifiers, combining keycap (20E3). If the
  // output still matches this, we left residue behind.
  const EMOJI_RESIDUE =
    /[\p{Extended_Pictographic}‍️⃣\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/u;

  it('quita el emoji y deja el texto intacto ("👉 lead time")', () => {
    const out = stripEmoji('Escribe esto 👉 lead time');
    expect(out).not.toMatch(EMOJI_RESIDUE);
    // El texto sobrevive palabra por palabra.
    expect(tokens(out)).toEqual(['Escribe', 'esto', 'lead', 'time']);
    // Sin dobles espacios donde estaba el emoji.
    expect(out).toBe('Escribe esto lead time');
  });

  it('elimina un emoji ZWJ y uno con tono de piel enteros, sin residuos', () => {
    const out = stripEmoji('Hola 👨‍👩‍👧 y 👍🏽 fin');
    expect(out).not.toMatch(EMOJI_RESIDUE);
    expect(tokens(out)).toEqual(['Hola', 'y', 'fin']);
  });

  it('elimina un keycap (1️⃣) entero', () => {
    const out = stripEmoji('Paso 1️⃣ listo');
    expect(out).not.toMatch(EMOJI_RESIDUE);
    expect(tokens(out)).toEqual(['Paso', 'listo']);
  });

  it('NO toca ñ, tildes, ¿ ¡ ni comillas', () => {
    const input = '¿Cómo estás, niño? ¡Añade «señal» del día!';
    expect(stripEmoji(input)).toBe(input);
  });

  it('un texto que es solo un emoji queda vacío y chunkForSpeech lo descarta', () => {
    expect(stripEmoji('👉')).toBe('');
    expect(chunkForSpeech(stripEmoji('👉'), 200)).toEqual([]);
  });
});

describe('stripSpeechMarkers', () => {
  it('quita viñetas (• ▪ ● ‣ ⁃) y deja el texto', () => {
    const out = stripSpeechMarkers('• uno\n▪ dos\n● tres\n‣ cuatro\n⁃ cinco');
    expect(out).not.toMatch(/[•▪●‣⁃]/);
    expect(tokens(out)).toEqual(['uno', 'dos', 'tres', 'cuatro', 'cinco']);
  });

  it('quita el marcador de lista (- o *) SOLO al inicio de línea', () => {
    const out = stripSpeechMarkers('- lead time\n* supply chain');
    expect(out).toBe('lead time\nsupply chain');
  });

  it('quita el > de blockquote al inicio de línea', () => {
    expect(stripSpeechMarkers('> cuidado aquí')).toBe('cuidado aquí');
  });

  it('sustituye una flecha por una pausa (coma), sin dejar el símbolo', () => {
    const out = stripSpeechMarkers('proceso → diagrama');
    expect(out).not.toMatch(/[→←↔⇒]/);
    expect(out).toBe('proceso, diagrama');
  });

  it('sustituye todas las flechas (← ↔ ⇒) por coma', () => {
    expect(stripSpeechMarkers('a ← b')).toBe('a, b');
    expect(stripSpeechMarkers('a ↔ b')).toBe('a, b');
    expect(stripSpeechMarkers('a ⇒ b')).toBe('a, b');
  });

  it('NO toca un guion a mitad de frase: compuestos y rangos intactos', () => {
    const input = 'Es cost-effective y el rango 10-20 en supply-chain, no lista.';
    expect(stripSpeechMarkers(input)).toBe(input);
  });

  it('NO toca un guion suelto usado como raya a mitad de línea', () => {
    const input = 'Vera - tu tutora - te ayuda';
    expect(stripSpeechMarkers(input)).toBe(input);
  });
});

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

describe('parseLanguageTags with an explicit base language', () => {
  // This reproduces today's bug: Spanish text with NO words from ES_WORDS and no
  // tags used to fall to detectLanguage → 'en-US' and was read with an English voice.
  it('assigns ALL untagged text to baseLang (no heuristic)', () => {
    const input = 'Soy Vera, tu tutora personal. En el mundo de la logística internacional todo fluye.';
    const segs = parseLanguageTags(input, 'es-ES');

    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) expect(s.lang).toBe('es-ES');
  });

  it('keeps a [EN] snippet in English while the base stays Spanish', () => {
    const input = 'Trabajamos la logística internacional cada día. [EN]Delivered Duty Paid[/EN]';
    const segs = parseLanguageTags(input, 'es-ES');

    expect(segs).toHaveLength(2);
    expect(segs[0].lang).toBe('es-ES');
    expect(segs[1].lang).toBe('en-US');
    expect(segs[1].text).toContain('Delivered Duty Paid');
  });
});

describe('chunkForSpeech', () => {
  it('speaks ALL of a >500-char text: chunks cover it with no lost words', () => {
    // ~1100 chars across 20 sentences (the old 500-char cap would have dropped ~half).
    const input = Array.from({ length: 20 }, (_, i) =>
      `Esta es la frase número ${i + 1} de la prueba de troceo larga.`
    ).join(' ');
    expect(input.length).toBeGreaterThan(500);

    const chunks = chunkForSpeech(input, 200);

    // Every word survives, in order.
    expect(tokens(chunks.join(' '))).toEqual(tokens(input));
    // Chunks respect the target length (sentences here are all < 200).
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('breaks an over-long sentence with no periods on commas/spaces, never mid-word', () => {
    const input = Array.from({ length: 60 }, (_, i) => `palabra${i + 1}`).join(' ');
    expect(input.length).toBeGreaterThan(200);

    const chunks = chunkForSpeech(input, 200);

    expect(tokens(chunks.join(' '))).toEqual(tokens(input));
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
  });

  it('keeps a short text as a single chunk and strips leading orphan punctuation', () => {
    expect(chunkForSpeech(':\n\n\nHola equipo, buenos días.', 200)).toEqual(['Hola equipo, buenos días.']);
  });
});

describe('mergeShortForeignSegments', () => {
  it('folds a short foreign snippet between base segments into the base voice', () => {
    const segments = [
      { text: 'Trabajamos toda la', lang: 'es-ES' },
      { text: 'supply chain', lang: 'en-US' }, // 2 words, surrounded by es-ES
      { text: 'cada día en la empresa.', lang: 'es-ES' },
    ];
    const merged = mergeShortForeignSegments(segments, 'es-ES');

    expect(merged).toHaveLength(1);
    expect(merged[0].lang).toBe('es-ES');
    expect(merged[0].text).toContain('supply chain');
  });

  it('folds a short foreign snippet at the end (only base neighbor)', () => {
    const segments = [
      { text: 'Esto lo llamamos', lang: 'es-ES' },
      { text: 'lead time', lang: 'en-US' },
    ];
    const merged = mergeShortForeignSegments(segments, 'es-ES');

    expect(merged).toHaveLength(1);
    expect(merged[0].lang).toBe('es-ES');
    expect(merged[0].text).toContain('lead time');
  });

  it('keeps a full foreign sentence in its native voice', () => {
    const segments = [
      { text: 'Dijo lo siguiente:', lang: 'es-ES' },
      { text: 'This is a full sentence spoken in English.', lang: 'en-US' }, // >3 words
      { text: 'Y luego continuó.', lang: 'es-ES' },
    ];
    const merged = mergeShortForeignSegments(segments, 'es-ES');

    expect(merged).toHaveLength(3);
    expect(merged[1].lang).toBe('en-US');
    expect(merged[1].text).toContain('full sentence');
  });

  it('leaves a lone foreign segment alone (no base neighbor to merge with)', () => {
    const segments = [{ text: 'supply chain', lang: 'en-US' }];
    const merged = mergeShortForeignSegments(segments, 'es-ES');

    expect(merged).toHaveLength(1);
    expect(merged[0].lang).toBe('en-US');
  });
});

describe('getBaseLang', () => {
  it('is deterministic per mode/teachingLang', () => {
    expect(getBaseLang('english', 'es')).toBe('en-US');
    expect(getBaseLang('english', 'en')).toBe('en-US');
    expect(getBaseLang('portuguese', 'es')).toBe('pt-PT');
    expect(getBaseLang('portuguese', 'en')).toBe('pt-PT');
    // Professional modes follow the teaching-language switch.
    expect(getBaseLang('logistics', 'es')).toBe('es-ES');
    expect(getBaseLang('logistics', 'en')).toBe('en-US');
    expect(getBaseLang('general', 'es')).toBe('es-ES');
    expect(getBaseLang('coding', 'en')).toBe('en-US');
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
