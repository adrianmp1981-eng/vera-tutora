/**
 * Flashcard service with SM-2 spaced repetition.
 * Cards are stored in localStorage under 'vera_flashcards'.
 */

import { recordCardCreated, recordCardMastered } from './progressService';

export type FlashcardCategory =
  | 'english'
  | 'portuguese'
  | 'spanish'
  | 'logistics'
  | 'football'
  | 'business'
  | 'coding'
  | 'other';

/**
 * How a card should be learned:
 * - term:    a single word or isolated concept
 * - chunk:   a whole multi-word block used as a unit ("lodge an appeal against")
 * - pattern: a professional rule / decision pattern ("buyer pays main freight → group F Incoterm")
 * - case:    a practical scenario with its solution
 */
export type CardType = 'term' | 'chunk' | 'pattern' | 'case';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  example?: string;
  category: FlashcardCategory;
  cardType: CardType;
  createdAt: string;
  interval: number;      // days until next review
  easeFactor: number;    // SM-2 ease factor (>= 1.3)
  repetitions: number;   // consecutive successful reviews
  nextReview: string;    // ISO date when the card is due again
  lapses: number;        // times the card was failed
  mastered?: boolean;    // true once interval first passed 21 days (for progress tracking)
}

export interface FlashcardStats {
  total: number;
  dueToday: number;
  mastered: number;      // interval > 21 days
  byCategory: Record<string, number>;
}

const STORAGE_KEY = 'vera_flashcards';

const VALID_CATEGORIES: FlashcardCategory[] = [
  'english', 'portuguese', 'spanish', 'logistics',
  'football', 'business', 'coding', 'other',
];

const normalizeCategory = (raw?: string): FlashcardCategory => {
  const c = (raw || '').trim().toLowerCase();
  return (VALID_CATEGORIES as string[]).includes(c) ? (c as FlashcardCategory) : 'other';
};

const VALID_CARD_TYPES: CardType[] = ['term', 'chunk', 'pattern', 'case'];

const normalizeCardType = (raw?: string): CardType => {
  const c = (raw || '').trim().toLowerCase();
  return (VALID_CARD_TYPES as string[]).includes(c) ? (c as CardType) : 'term';
};

const generateId = (): string =>
  `fc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const endOfToday = (): number => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

export const getFlashcards = (): Flashcard[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const cards = JSON.parse(saved) as Flashcard[];
    // Back-compat: cards created before cardType existed default to 'term'.
    return cards.map((c) => ({ ...c, cardType: c.cardType || 'term' }));
  } catch {
    return [];
  }
};

const persist = (cards: Flashcard[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
};

export interface NewFlashcard {
  front: string;
  back: string;
  example?: string;
  category?: string;
  cardType?: string;
}

/**
 * Create and store a new flashcard (due immediately).
 * De-duplicates by front + category so Vera re-emitting a term does not pile up copies.
 * Returns the stored card, or the existing one if it was a duplicate.
 */
export const saveFlashcard = (card: NewFlashcard): Flashcard => {
  const cards = getFlashcards();
  const category = normalizeCategory(card.category);
  const front = card.front.trim();
  const back = card.back.trim();

  const existing = cards.find(
    (c) => c.front.trim().toLowerCase() === front.toLowerCase() && c.category === category
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const newCard: Flashcard = {
    id: generateId(),
    front,
    back,
    example: card.example?.trim() || undefined,
    category,
    cardType: normalizeCardType(card.cardType),
    createdAt: now,
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    nextReview: now, // due right away
    lapses: 0,
    mastered: false,
  };

  persist([...cards, newCard]);
  recordCardCreated(category);
  return newCard;
};

/** Cards whose nextReview is now or in the past. */
export const getDueCards = (): Flashcard[] => {
  const now = Date.now();
  return getFlashcards()
    .filter((c) => new Date(c.nextReview).getTime() <= now)
    .sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());
};

/**
 * Grade a card review with the SM-2 algorithm.
 * quality: 0-5 (0 = total blackout, 5 = perfect recall).
 * - quality < 3: reset interval to 1 day, count a lapse.
 * - quality >= 3: interval is 1 on the first success, 6 on the second,
 *   then interval * easeFactor from the third onward.
 * easeFactor uses the standard SM-2 formula and never drops below 1.3.
 */
export const reviewCard = (id: string, quality: number): Flashcard | null => {
  const cards = getFlashcards();
  const idx = cards.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const card = { ...cards[idx] };
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  // Standard SM-2 ease factor update, floored at 1.3.
  const newEase = card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  card.easeFactor = Math.max(1.3, newEase);

  if (q < 3) {
    // Failed: reset the learning progress and record a lapse.
    card.repetitions = 0;
    card.interval = 1;
    card.lapses += 1;
  } else {
    if (card.repetitions === 0) {
      card.interval = 1;
    } else if (card.repetitions === 1) {
      card.interval = 6;
    } else {
      card.interval = Math.round(card.interval * card.easeFactor);
    }
    card.repetitions += 1;
  }

  const next = new Date();
  next.setDate(next.getDate() + card.interval);
  card.nextReview = next.toISOString();

  // Count the card as mastered the first time its interval passes 21 days.
  if (card.interval > 21 && !card.mastered) {
    card.mastered = true;
    recordCardMastered(card.category);
  }

  cards[idx] = card;
  persist(cards);
  return card;
};

export const getStats = (): FlashcardStats => {
  const cards = getFlashcards();
  const dueLimit = endOfToday();

  const byCategory: Record<string, number> = {};
  let dueToday = 0;
  let mastered = 0;

  for (const c of cards) {
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    if (new Date(c.nextReview).getTime() <= dueLimit) dueToday += 1;
    if (c.interval > 21) mastered += 1;
  }

  return {
    total: cards.length,
    dueToday,
    mastered,
    byCategory,
  };
};
