/**
 * Per-module progress tracking, stored in localStorage under 'vera_progress'.
 * Progress reflects REAL activity: messages exchanged, flashcards created/mastered
 * and daily sessions completed.
 */

export interface ModuleProgress {
  messagesExchanged: number;
  cardsCreated: number;
  cardsMastered: number;
  sessionsCompleted: number;
  lastActivity: string | null;
}

const STORAGE_KEY = 'vera_progress';

/** Modules that get their own progress entry. */
export const PROGRESS_MODULES = [
  'english', 'portuguese', 'habits', 'learn',
  'sports', 'business', 'coding', 'logistics',
] as const;

export type ProgressModule = typeof PROGRESS_MODULES[number];

const emptyModule = (): ModuleProgress => ({
  messagesExchanged: 0,
  cardsCreated: 0,
  cardsMastered: 0,
  sessionsCompleted: 0,
  lastActivity: null,
});

const isModule = (m: string): m is ProgressModule =>
  (PROGRESS_MODULES as readonly string[]).includes(m);

/** Map a flashcard category to the module it counts towards. */
const moduleForCategory = (category: string): ProgressModule => {
  switch ((category || '').toLowerCase()) {
    case 'football': return 'sports';
    case 'english': return 'english';
    case 'portuguese': return 'portuguese';
    case 'logistics': return 'logistics';
    case 'business': return 'business';
    case 'coding': return 'coding';
    case 'spanish': return 'learn';
    default: return 'learn';
  }
};

export const getProgress = (): Record<string, ModuleProgress> => {
  let stored: Record<string, ModuleProgress> = {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) stored = JSON.parse(saved) as Record<string, ModuleProgress>;
  } catch {
    stored = {};
  }
  // Ensure every module has an entry.
  const full: Record<string, ModuleProgress> = {};
  for (const m of PROGRESS_MODULES) {
    full[m] = { ...emptyModule(), ...(stored[m] || {}) };
  }
  return full;
};

const persist = (data: Record<string, ModuleProgress>): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

const update = (module: string, fn: (p: ModuleProgress) => void): void => {
  if (!isModule(module)) return;
  const data = getProgress();
  fn(data[module]);
  data[module].lastActivity = new Date().toISOString();
  persist(data);
};

export const recordMessage = (module: string): void => {
  update(module, (p) => { p.messagesExchanged += 1; });
};

export const recordCardCreated = (category: string): void => {
  update(moduleForCategory(category), (p) => { p.cardsCreated += 1; });
};

export const recordCardMastered = (category: string): void => {
  update(moduleForCategory(category), (p) => { p.cardsMastered += 1; });
};

export const recordSessionCompleted = (module: string): void => {
  update(module, (p) => { p.sessionsCompleted += 1; });
};

/**
 * 0-100 progress for a module, combining:
 * - messages exchanged: 30% weight, saturates at 100 messages
 * - cards created:      30% weight, saturates at 50 cards
 * - cards mastered:     40% weight, saturates at 30 cards
 */
export const getProgressPercent = (module: string): number => {
  const data = getProgress();
  const p = data[module];
  if (!p) return 0;

  const msgPart = 30 * Math.min(p.messagesExchanged, 100) / 100;
  const createdPart = 30 * Math.min(p.cardsCreated, 50) / 50;
  const masteredPart = 40 * Math.min(p.cardsMastered, 30) / 30;

  return Math.round(msgPart + createdPart + masteredPart);
};

/** The module with the lowest progress among the given candidates (defaults to Adri's focus areas). */
export const getLowestModule = (
  candidates: string[] = ['english', 'portuguese', 'logistics', 'sports', 'business', 'coding']
): string => {
  let lowest = candidates[0];
  let lowestPct = getProgressPercent(lowest);
  for (const m of candidates.slice(1)) {
    const pct = getProgressPercent(m);
    if (pct < lowestPct) {
      lowest = m;
      lowestPct = pct;
    }
  }
  return lowest;
};
