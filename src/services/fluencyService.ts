/**
 * Real spoken-fluency metrics, stored in localStorage under 'vera_fluency'.
 * One snapshot per calendar day, updated whenever Adri speaks by voice.
 */

export interface FluencySnapshot {
  date: string;            // YYYY-MM-DD (local)
  wordsSpoken: number;     // total words Adri spoke by voice
  turnsSpoken: number;     // how many times he spoke
  avgWordsPerTurn: number;
  longestTurn: number;     // longest single turn, in words
  veraWords: number;       // Vera's words, for the ratio
  speakingRatio: number;   // wordsSpoken / (wordsSpoken + veraWords)
  errorsCorrected: number;
}

export interface FluencyTrend {
  wordsChange: number;      // % change vs previous 7 days
  ratioChange: number;
  turnLengthChange: number;
}

const STORAGE_KEY = 'vera_fluency';

const dayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const emptySnapshot = (date: string): FluencySnapshot => ({
  date,
  wordsSpoken: 0,
  turnsSpoken: 0,
  avgWordsPerTurn: 0,
  longestTurn: 0,
  veraWords: 0,
  speakingRatio: 0,
  errorsCorrected: 0,
});

const readAll = (): FluencySnapshot[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as FluencySnapshot[]) : [];
  } catch {
    return [];
  }
};

const persist = (snaps: FluencySnapshot[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps));
};

const getToday = (snaps: FluencySnapshot[]): FluencySnapshot => {
  const key = dayKey(new Date());
  let today = snaps.find((s) => s.date === key);
  if (!today) {
    today = emptySnapshot(key);
    snaps.push(today);
  }
  return today;
};

/** Record one spoken exchange: Adri's words and Vera's reply words. */
export const recordSpokenTurn = (userWords: number, veraWords: number): void => {
  const u = Math.max(0, Math.floor(userWords) || 0);
  const v = Math.max(0, Math.floor(veraWords) || 0);
  if (u === 0 && v === 0) return;

  const snaps = readAll();
  const today = getToday(snaps);
  today.wordsSpoken += u;
  today.turnsSpoken += 1;
  today.veraWords += v;
  today.longestTurn = Math.max(today.longestTurn, u);
  today.avgWordsPerTurn = today.turnsSpoken > 0 ? today.wordsSpoken / today.turnsSpoken : 0;
  const denom = today.wordsSpoken + today.veraWords;
  today.speakingRatio = denom > 0 ? today.wordsSpoken / denom : 0;
  persist(snaps);
};

export const recordCorrection = (): void => {
  const snaps = readAll();
  const today = getToday(snaps);
  today.errorsCorrected += 1;
  persist(snaps);
};

/** The last N days of snapshots, oldest first. */
export const getSnapshots = (days: number): FluencySnapshot[] => {
  const snaps = readAll().slice().sort((a, b) => a.date.localeCompare(b.date));
  return snaps.slice(-days);
};

const avg = (nums: number[]): number =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;

const pctChange = (recent: number, prev: number): number => {
  if (prev === 0) return recent > 0 ? 100 : 0;
  return Math.round(((recent - prev) / prev) * 100);
};

/** Compare the mean of the last 7 days with the 7 days before that. */
export const getTrend = (): FluencyTrend => {
  const last14 = getSnapshots(14);
  const recent = last14.slice(-7);
  const prev = last14.slice(-14, -7);

  const wordsChange = pctChange(avg(recent.map((s) => s.wordsSpoken)), avg(prev.map((s) => s.wordsSpoken)));
  const ratioChange = pctChange(avg(recent.map((s) => s.speakingRatio)), avg(prev.map((s) => s.speakingRatio)));
  const turnLengthChange = pctChange(avg(recent.map((s) => s.avgWordsPerTurn)), avg(prev.map((s) => s.avgWordsPerTurn)));

  return { wordsChange, ratioChange, turnLengthChange };
};
