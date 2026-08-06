/**
 * Competency map ("temario") service.
 *
 * A persistent map of everything Adri needs to master for his role, separate
 * from the study plan: the plan organizes TIME (what to do this week), this
 * organizes KNOWLEDGE (what he must know and how much he already knows of it).
 *
 * Stored in localStorage under 'vera_curriculum'.
 */

export type CompetencyLevel = 'basico' | 'intermedio' | 'avanzado';
export type CompetencyStatus = 'sin_evaluar' | 'no_lo_se' | 'en_progreso' | 'dominado';

export interface Competency {
  id: string;
  area: string;            // "Incoterms y comercio internacional"
  topic: string;           // "Grupo D: DAP, DPU, DDP"
  description: string;     // qué implica dominarlo
  level: CompetencyLevel;
  status: CompetencyStatus;
  confidence: number;      // 0-100, autoevaluación de Adri
  lastTouched: string | null;
  timesStudied: number;
  notes: string;           // observaciones de Vera sobre su nivel real
}

export interface Curriculum {
  role: string;            // el puesto para el que se generó
  createdAt: string;
  competencies: Competency[];
}

/** Shape returned by generateCurriculum before ids/status are assigned. */
export interface RawCompetency {
  area: string;
  topic: string;
  description: string;
  level: string;
}

export interface AreaCoverage {
  area: string;
  total: number;
  mastered: number;        // status === 'dominado'
  unassessed: number;      // status === 'sin_evaluar'
  inProgress: number;      // status === 'en_progreso'
  coverage: number;        // % dominado (0-100), redondeado
}

const STORAGE_KEY = 'vera_curriculum';

const VALID_LEVELS: CompetencyLevel[] = ['basico', 'intermedio', 'avanzado'];

const normalizeLevel = (raw?: string): CompetencyLevel => {
  const c = (raw || '').trim().toLowerCase();
  return (VALID_LEVELS as string[]).includes(c) ? (c as CompetencyLevel) : 'intermedio';
};

const VALID_STATUSES: CompetencyStatus[] = ['sin_evaluar', 'no_lo_se', 'en_progreso', 'dominado'];

export const normalizeStatus = (raw?: string): CompetencyStatus => {
  const c = (raw || '').trim().toLowerCase();
  return (VALID_STATUSES as string[]).includes(c) ? (c as CompetencyStatus) : 'sin_evaluar';
};

const generateId = (): string =>
  `cmp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

export const getCurriculum = (): Curriculum | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as Curriculum;
  } catch {
    return null;
  }
};

export const saveCurriculum = (c: Curriculum): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
};

export const clearCurriculum = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

/**
 * Turn the raw list the model returns into full Competency objects: assign ids
 * and set every one to 'sin_evaluar' with confidence 0. Does not persist.
 */
export const buildCompetencies = (raw: RawCompetency[]): Competency[] =>
  raw.map((r) => ({
    id: generateId(),
    area: (r.area || '').trim() || 'General',
    topic: (r.topic || '').trim(),
    description: (r.description || '').trim(),
    level: normalizeLevel(r.level),
    status: 'sin_evaluar',
    confidence: 0,
    lastTouched: null,
    timesStudied: 0,
    notes: '',
  }));

/** Build a Curriculum from already-formed competencies and persist it. */
export const createCurriculum = (role: string, competencies: Competency[]): Curriculum => {
  const curriculum: Curriculum = {
    role: role.trim(),
    createdAt: new Date().toISOString(),
    competencies,
  };
  saveCurriculum(curriculum);
  return curriculum;
};

/** Apply a partial update to one competency by id and persist. Returns it (or null). */
export const updateCompetency = (
  id: string,
  changes: Partial<Competency>
): Competency | null => {
  const curriculum = getCurriculum();
  if (!curriculum) return null;

  const idx = curriculum.competencies.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const updated: Competency = { ...curriculum.competencies[idx], ...changes, id };
  curriculum.competencies[idx] = updated;
  saveCurriculum(curriculum);
  return updated;
};

const LEVEL_ORDER: Record<CompetencyLevel, number> = { basico: 0, intermedio: 1, avanzado: 2 };
const STATUS_STUDY_ORDER: Record<string, number> = { no_lo_se: 0, en_progreso: 1, sin_evaluar: 2 };

/**
 * The next competency to work on. Priority:
 *   1. 'no_lo_se' of basic level first,
 *   2. then 'en_progreso' ones, oldest-touched first,
 *   3. then 'sin_evaluar',
 * and within each group, básicas before avanzadas. 'dominado' is excluded.
 */
export const getNextToStudy = (): Competency | null => {
  const curriculum = getCurriculum();
  if (!curriculum) return null;

  const candidates = curriculum.competencies.filter((c) => c.status !== 'dominado');
  if (candidates.length === 0) return null;

  const touchedTime = (c: Competency) => (c.lastTouched ? Date.parse(c.lastTouched) : 0);

  candidates.sort((a, b) => {
    const sa = STATUS_STUDY_ORDER[a.status] ?? 99;
    const sb = STATUS_STUDY_ORDER[b.status] ?? 99;
    if (sa !== sb) return sa - sb;

    // 'en_progreso': the one longest without being touched comes first.
    if (a.status === 'en_progreso') {
      const ta = touchedTime(a);
      const tb = touchedTime(b);
      if (ta !== tb) return ta - tb;
    }
    // Within every group, basic before advanced.
    return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
  });

  return candidates[0] ?? null;
};

/** Coverage per area: % dominado, total competencies and how many are unassessed. */
export const getCoverage = (): AreaCoverage[] => {
  const curriculum = getCurriculum();
  if (!curriculum) return [];

  const byArea = new Map<string, Competency[]>();
  for (const c of curriculum.competencies) {
    const list = byArea.get(c.area) || [];
    list.push(c);
    byArea.set(c.area, list);
  }

  const result: AreaCoverage[] = [];
  for (const [area, list] of byArea) {
    const mastered = list.filter((c) => c.status === 'dominado').length;
    const unassessed = list.filter((c) => c.status === 'sin_evaluar').length;
    const inProgress = list.filter((c) => c.status === 'en_progreso').length;
    result.push({
      area,
      total: list.length,
      mastered,
      unassessed,
      inProgress,
      coverage: list.length ? Math.round((mastered / list.length) * 100) : 0,
    });
  }
  return result;
};

/** Global % dominado across all competencies. */
export const getGlobalCoverage = (): number => {
  const curriculum = getCurriculum();
  if (!curriculum || curriculum.competencies.length === 0) return 0;
  const mastered = curriculum.competencies.filter((c) => c.status === 'dominado').length;
  return Math.round((mastered / curriculum.competencies.length) * 100);
};

/** The n areas with the lowest coverage (weakest first). */
export const getWeakAreas = (n: number): AreaCoverage[] => {
  return [...getCoverage()]
    .sort((a, b) => a.coverage - b.coverage || b.unassessed - a.unassessed)
    .slice(0, Math.max(0, n));
};

/** Competencies still awaiting self-assessment. */
export const getUnassessed = (): Competency[] => {
  const curriculum = getCurriculum();
  if (!curriculum) return [];
  return curriculum.competencies.filter((c) => c.status === 'sin_evaluar');
};
