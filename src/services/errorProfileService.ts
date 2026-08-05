/**
 * Recurring-error profile for Adri, stored in localStorage under 'vera_error_profile'.
 * Vera emits [ERROR] tags as she corrects; this builds a map of his weak points over time.
 */

export type ErrorType =
  | 'grammar'
  | 'vocabulary'
  | 'calque'
  | 'pronunciation'
  | 'structure'
  | 'concept';

export type ErrorLanguage = 'english' | 'portuguese' | 'spanish' | 'none';

export type ErrorStatus = 'active' | 'improving' | 'resolved';

export interface ErrorPattern {
  id: string;
  type: ErrorType;
  language: ErrorLanguage;
  description: string;
  example: string;
  correction: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  status: ErrorStatus;
  resolvedAt?: string;
}

export interface NewError {
  type: string;
  language: string;
  description: string;
  example: string;
  correction: string;
}

export interface ErrorStats {
  active: number;
  improving: number;
  resolved: number;
  byType: Record<string, number>;
}

const STORAGE_KEY = 'vera_error_profile';

const VALID_TYPES: ErrorType[] = ['grammar', 'vocabulary', 'calque', 'pronunciation', 'structure', 'concept'];
const VALID_LANGS: ErrorLanguage[] = ['english', 'portuguese', 'spanish', 'none'];

const normType = (raw: string): ErrorType => {
  const c = (raw || '').trim().toLowerCase();
  return (VALID_TYPES as string[]).includes(c) ? (c as ErrorType) : 'grammar';
};
const normLang = (raw: string): ErrorLanguage => {
  const c = (raw || '').trim().toLowerCase();
  return (VALID_LANGS as string[]).includes(c) ? (c as ErrorLanguage) : 'none';
};

const generateId = (): string => `err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const daysSince = (iso: string): number => {
  const then = new Date(iso).getTime();
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
};

// Normalize a description for fuzzy matching: lowercase, strip accents/punctuation, collapse spaces.
const normalizeDesc = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Token Jaccard similarity — two descriptions count as the same pattern above ~0.6.
const similar = (a: string, b: string): boolean => {
  const na = normalizeDesc(a);
  const nb = normalizeDesc(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const sa = new Set(na.split(' '));
  const sb = new Set(nb.split(' '));
  let inter = 0;
  sa.forEach((t) => { if (sb.has(t)) inter += 1; });
  const union = new Set([...sa, ...sb]).size;
  return union > 0 && inter / union >= 0.6;
};

const rank: Record<ErrorStatus, number> = { active: 0, improving: 1, resolved: 2 };

const persist = (patterns: ErrorPattern[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
};

/**
 * Read the profile, applying the time-based status rule:
 * >14 days without repeating → improving, >30 days → resolved.
 * Status only moves forward (a manually-set or repeated status is never regressed here).
 */
export const getErrorProfile = (): ErrorPattern[] => {
  let raw: ErrorPattern[] = [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) raw = JSON.parse(saved) as ErrorPattern[];
  } catch {
    raw = [];
  }

  let changed = false;
  const updated = raw.map((p) => {
    const d = daysSince(p.lastSeen);
    const timeStatus: ErrorStatus = d > 30 ? 'resolved' : d > 14 ? 'improving' : 'active';
    // Only promote forward.
    const next = rank[timeStatus] > rank[p.status] ? timeStatus : p.status;
    if (next !== p.status) {
      changed = true;
      const patched: ErrorPattern = { ...p, status: next };
      if (next === 'resolved' && !patched.resolvedAt) patched.resolvedAt = new Date().toISOString();
      return patched;
    }
    return p;
  });

  if (changed) persist(updated);
  return updated;
};

export const recordError = (err: NewError): ErrorPattern => {
  const patterns = getErrorProfile();
  const type = normType(err.type);
  const language = normLang(err.language);
  const now = new Date().toISOString();

  const existing = patterns.find((p) => p.type === type && similar(p.description, err.description));
  if (existing) {
    existing.occurrences += 1;
    existing.lastSeen = now;
    existing.example = err.example || existing.example;
    existing.correction = err.correction || existing.correction;
    existing.status = 'active'; // repeating reactivates it
    delete existing.resolvedAt;
    persist(patterns);
    return existing;
  }

  const created: ErrorPattern = {
    id: generateId(),
    type,
    language,
    description: err.description.trim(),
    example: err.example.trim(),
    correction: err.correction.trim(),
    occurrences: 1,
    firstSeen: now,
    lastSeen: now,
    status: 'active',
  };
  persist([...patterns, created]);
  return created;
};

/** The n active patterns with the most occurrences. */
export const getTopErrors = (n: number): ErrorPattern[] =>
  getErrorProfile()
    .filter((p) => p.status === 'active')
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, n);

const setStatus = (id: string, status: ErrorStatus): void => {
  const patterns = getErrorProfile();
  const p = patterns.find((x) => x.id === id);
  if (!p) return;
  p.status = status;
  if (status === 'resolved') p.resolvedAt = new Date().toISOString();
  else delete p.resolvedAt;
  persist(patterns);
};

export const markImproving = (id: string): void => setStatus(id, 'improving');
export const markResolved = (id: string): void => setStatus(id, 'resolved');

export const getErrorStats = (): ErrorStats => {
  const patterns = getErrorProfile();
  const byType: Record<string, number> = {};
  let active = 0, improving = 0, resolved = 0;
  for (const p of patterns) {
    if (p.status === 'active') active += 1;
    else if (p.status === 'improving') improving += 1;
    else resolved += 1;
    byType[p.type] = (byType[p.type] || 0) + 1;
  }
  return { active, improving, resolved, byType };
};
