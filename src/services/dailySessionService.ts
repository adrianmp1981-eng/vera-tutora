/**
 * Daily session + streak tracking, stored in localStorage under 'vera_daily'.
 * Drives Adri's "learn something every day" habit and hands-free speaking practice.
 */

export interface DailyState {
  lastSessionDate: string | null; // ISO date of the last completed session
  streak: number;                 // consecutive days with a completed session
  sessionsCompleted: number;      // lifetime total
  todayCompleted: boolean;        // whether today's session is done (resets each day)
  wordsSpokenToday: number;       // words Adri spoke today
}

const STORAGE_KEY = 'vera_daily';

const defaultState = (): DailyState => ({
  lastSessionDate: null,
  streak: 0,
  sessionsCompleted: 0,
  todayCompleted: false,
  wordsSpokenToday: 0,
});

/** YYYY-MM-DD in local time, used to compare calendar days. */
const dayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const daysBetween = (fromISO: string, to: Date): number => {
  const from = new Date(fromISO);
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
};

const persist = (state: DailyState): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

/**
 * Read the daily state, rolling over `todayCompleted` and `wordsSpokenToday`
 * when a new calendar day has started since the last completed session.
 */
export const getDailyState = (): DailyState => {
  let state: DailyState;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    state = saved ? { ...defaultState(), ...(JSON.parse(saved) as DailyState) } : defaultState();
  } catch {
    state = defaultState();
  }

  // New day since the last completed session → reset the per-day counters.
  if (state.lastSessionDate) {
    const today = dayKey(new Date());
    const last = dayKey(new Date(state.lastSessionDate));
    if (today !== last) {
      state.todayCompleted = false;
      state.wordsSpokenToday = 0;
      persist(state);
    }
  }

  return state;
};

/** Called when a daily session begins. Resets today's word counter. */
export const startSession = (): DailyState => {
  const state = getDailyState();
  state.wordsSpokenToday = 0;
  persist(state);
  return state;
};

/**
 * Mark today's session complete and update the streak.
 * Streak rises by 1 if the last session was yesterday, stays if it was today,
 * and resets to 1 if more than a day passed (or it's the first ever).
 */
export const completeSession = (): DailyState => {
  const state = getDailyState();
  const now = new Date();

  if (!state.lastSessionDate) {
    state.streak = 1;
  } else {
    const gap = daysBetween(state.lastSessionDate, now);
    if (gap === 0) {
      // Already did a session today — keep the streak as is.
      state.streak = Math.max(1, state.streak);
    } else if (gap === 1) {
      state.streak += 1;
    } else {
      state.streak = 1;
    }
  }

  state.lastSessionDate = now.toISOString();
  state.sessionsCompleted += 1;
  state.todayCompleted = true;
  persist(state);
  return state;
};

/** Add to today's spoken-word count. */
export const addWordsSpoken = (n: number): DailyState => {
  const state = getDailyState();
  state.wordsSpokenToday += Math.max(0, Math.floor(n) || 0);
  persist(state);
  return state;
};

/**
 * Current streak, accounting for missed days.
 * If more than one day passed since the last session, the streak is broken (0).
 */
export const getStreak = (): number => {
  const state = getDailyState();
  if (!state.lastSessionDate) return 0;
  const gap = daysBetween(state.lastSessionDate, new Date());
  if (gap > 1) return 0;
  return state.streak;
};
