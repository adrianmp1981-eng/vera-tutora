/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  BookOpen, 
  Zap, 
  History, 
  Dumbbell, 
  CheckCircle2, 
  MessageSquare,
  ChevronRight,
  Terminal,
  LogOut,
  User,
  Key,
  Info,
  X,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  PlusCircle,
  LayoutGrid,
  Sparkles,
  Briefcase,
  Code,
  Truck,
  Globe,
  Languages,
  Trophy,
  Code2,
  Flame,
  Layers,
  RotateCcw,
  Menu,
  Smartphone,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Target,
  ChevronDown,
  GraduationCap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { Message, Mode, SessionLog, UserMemory, Simulation } from './types';
import {
  sendMessageToVera,
  getSummary,
  extractMemoryUpdates,
  correctEnglishText,
  generateStudyPlan,
  generateWeeklyReport,
  searchResources,
  generateSimulationContext,
  buildOpeningMessage,
  OpeningContext,
  generateCurriculum
} from './services/geminiService';
import {
  Curriculum,
  getCurriculum,
  createCurriculum,
  clearCurriculum,
  updateCompetency,
  normalizeStatus,
  getNextToStudy,
  getGlobalCoverage,
  getCoverage,
} from './services/curriculumService';
import { getMemory, saveMemory, updateMemory, hasMemory } from './services/memoryService';
import { detectLanguage, parseLanguageTags, stripLanguageTags, getBaseLang, chunkForSpeech, stripEmoji, stripSpeechMarkers } from './services/voiceLang';
import { WeeklyStats } from './types';
import {
  Flashcard,
  saveFlashcard,
  reviewCard,
  getDueCards,
  getStats as getFlashcardStats,
  FlashcardStats
} from './services/flashcardService';
import {
  getDailyState,
  startSession,
  completeSession,
  addWordsSpoken,
  DailyState
} from './services/dailySessionService';
import {
  getProgress,
  getProgressPercent,
  getLowestModule,
  recordMessage,
  recordSessionCompleted,
  ModuleProgress
} from './services/progressService';
import {
  recordError,
  getErrorProfile,
  ErrorPattern
} from './services/errorProfileService';
import {
  recordSpokenTurn,
  recordCorrection,
  getSnapshots,
  getTrend,
  FluencySnapshot,
  FluencyTrend
} from './services/fluencyService';
import { getFlashcards } from './services/flashcardService';
import AccessGate from './components/AccessGate';

// Preferred modern "Online (Natural)" female voices per language, in priority order.
const PREFERRED_VOICES: Record<string, string[]> = {
  'en-US': ['Aria', 'Jenny', 'Ava', 'Emma'],
  'es-ES': ['Elvira', 'Ximena'],
  'pt-PT': ['Raquel', 'Fernanda'],
};

// Old robotic Windows/legacy voices to avoid as a last resort.
const OLD_VOICE_NAMES = ['Zira', 'David', 'Mark', 'Helena', 'Laura', 'Pablo', 'Helia', 'Hazel', 'George', 'Sabina', 'Raul'];

const LANG_FLAG: Record<string, string> = { 'en-US': '🇺🇸', 'es-ES': '🇪🇸', 'pt-PT': '🇵🇹' };

// Quita bloques NO hablables que pueden abarcar varias frases. Se aplica al texto
// COMPLETO antes de trocear por idioma (un [VISUAL_START]...[VISUAL_END] no debe
// partirse). No toca markdown inline ni las etiquetas [EN]/[ES]/[PT].
const stripNonSpoken = (text: string): string =>
  text.replace(/\[VISUAL_START\][\s\S]*?\[VISUAL_END\]/g, '');

// Limpia markdown inline de un tramo YA troceado. Se aplica DESPUÉS de
// parseLanguageTags, así el strip de enlaces markdown ([..](..)) no se come un
// [ES](...) que aún tuviera forma de enlace.
const cleanSpeechText = (text: string): string =>
  text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/`.*?`/g, '')
    .trim();

// Cloud "Online (Natural)" voices load asynchronously and can be missing on the
// very first utterance. Poll (and listen to onvoiceschanged) until one exists for
// this language, or give up after maxWaitMs so we never block indefinitely.
const waitForNaturalVoice = (lang: string, maxWaitMs = 3000): Promise<void> => {
  return new Promise<void>((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) { resolve(); return; }

    const hasNatural = () =>
      synth.getVoices().some((v) => v.lang === lang && v.name.includes('Natural'));

    if (hasNatural()) { resolve(); return; }

    const start = Date.now();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      synth.onvoiceschanged = null;
      resolve();
    };

    // onvoiceschanged as a shortcut in case it fires before the next poll tick.
    synth.onvoiceschanged = () => { if (hasNatural()) finish(); };
    const timer = setInterval(() => {
      if (hasNatural() || Date.now() - start >= maxWaitMs) finish();
    }, 150);
  });
};

// La primera palabra real a veces se corta porque el motor TTS aún no está activo.
// Una utterance de calentamiento muda (' ', volume 0) lo despierta. Resuelve en
// cuanto arranca (motor ya activo) o al terminar/errar, con tope de 300ms para no
// bloquear. NO tocar pitch/rate (rompen las voces Natural).
const warmUpVoice = (voice: SpeechSynthesisVoice | null, lang: string): Promise<void> =>
  new Promise<void>((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.lang = lang;
      if (voice) u.voice = voice;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      u.onstart = finish;
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
      setTimeout(finish, 300);
    } catch {
      resolve();
    }
  });

const getStartOfWeek = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
};

const getEndOfWeek = () => {
  const start = new Date(getStartOfWeek());
  const sunday = new Date(start.setDate(start.getDate() + 6));
  sunday.setHours(23, 59, 59, 999);
  return sunday.toISOString();
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface Progress {
  english: number;
  habits: number;
  culture: number;
  sports: number;
}

const STORAGE_KEYS = {
  MESSAGES: 'vera_chat_history',
  MODE: 'vera_current_mode',
  PROGRESS: 'vera_user_progress',
  MUTE: 'vera_voice_muted',
  WEEKLY_STATS: 'vera_weekly_stats',
  LAST_REPORT: 'vera_last_report'
};

const SIMULATIONS: Simulation[] = [
  {
    id: 'job-interview-logistics',
    title: 'Job Interview — Logistics Manager',
    description: 'Practice a job interview for a logistics manager position at a major shipping company',
    category: 'logistics',
    difficulty: 'intermediate',
    veraRole: 'HR Manager at DHL conducting a job interview for a Logistics Manager position',
    userRole: 'Candidate applying for the Logistics Manager position',
    context: 'This is a formal job interview at DHL headquarters. The position requires experience in supply chain management, warehouse operations, and team leadership.',
    objectives: ['Answer competency questions', 'Demonstrate logistics knowledge', 'Ask good questions', 'Negotiate salary'],
    language: 'english'
  },
  {
    id: 'english-negotiation',
    title: 'Business Negotiation in English',
    description: 'Negotiate a contract with a supplier in English — price, terms and delivery',
    category: 'english',
    difficulty: 'intermediate',
    veraRole: 'Sales Director at a European supplier company, tough negotiator who defends her prices',
    userRole: 'Procurement Manager trying to get the best deal for your company',
    context: 'You are in a video call negotiating a 12-month supply contract. The supplier wants €50,000, your budget is €38,000. You need to negotiate price, payment terms and delivery schedule.',
    objectives: ['Negotiate in English naturally', 'Use negotiation vocabulary', 'Make counteroffers', 'Reach an agreement'],
    language: 'english'
  },
  {
    id: 'football-scouting',
    title: 'Football Scouting Meeting',
    description: 'Present your scouting report to the sporting director and defend your player recommendation',
    category: 'football',
    difficulty: 'advanced',
    veraRole: 'Sporting Director of a Championship club, analytical and demanding, asks tough questions about data',
    userRole: 'Head Scout presenting a player recommendation with data',
    context: 'You are presenting a scouting report for a 24-year-old midfielder. You have xG data, passing stats and match footage analysis. Budget is £3M. The sporting director is skeptical.',
    objectives: ['Use football analytics vocabulary', 'Defend your recommendation with data', 'Handle objections', 'Speak confidently in English'],
    language: 'english'
  },
  {
    id: 'logistics-crisis',
    title: 'Supply Chain Crisis',
    description: 'Manage a real-time supply chain disruption — a key supplier just failed',
    category: 'logistics',
    difficulty: 'advanced',
    veraRole: 'CEO of your company who just found out a critical supplier failed to deliver, needs solutions NOW',
    userRole: 'Supply Chain Manager who has to explain the situation and propose solutions',
    context: 'Your main supplier in China has just declared bankruptcy. You have 48 hours before your production line stops. You need to find alternatives, manage stakeholders and communicate a plan.',
    objectives: ['Crisis communication in English', 'Demonstrate supply chain knowledge', 'Propose concrete solutions', 'Stay calm under pressure'],
    language: 'english'
  },
  {
    id: 'portuguese-cafe',
    title: 'Café em Lisboa',
    description: 'Order coffee, ask for directions and chat with a local in European Portuguese',
    category: 'portuguese',
    difficulty: 'beginner',
    veraRole: 'Friendly café owner in Lisbon who speaks no English',
    userRole: 'Tourist visiting Lisbon for the first time',
    context: 'You are in a traditional café in Lisbon. You want to order a coffee and a pastel de nata, ask about the best places to visit nearby, and practice basic conversation.',
    objectives: ['Order food and drinks in Portuguese', 'Ask for directions', 'Use basic pleasantries', 'Understand European Portuguese accent'],
    language: 'portuguese'
  },
  {
    id: 'business-pitch',
    title: 'Startup Pitch to Investors',
    description: 'Pitch your business idea to a panel of investors and handle tough questions',
    category: 'business',
    difficulty: 'advanced',
    veraRole: 'Skeptical venture capitalist who has seen thousands of pitches and asks hard questions about unit economics, market size and competition',
    userRole: 'Startup founder pitching your idea for funding',
    context: 'You have 5 minutes to pitch your startup idea and then face 10 minutes of questions. The investor is looking for a clear problem, scalable solution, realistic financials and strong team.',
    objectives: ['Structure a clear pitch', 'Handle investor objections', 'Discuss financials confidently', 'Negotiate terms'],
    language: 'english'
  },
];

// Accent color per mode, used for the active side of the teaching-language toggle.
const MODE_COLORS: Record<string, string> = {
  general: '#6366f1', learn: '#6366f1', quiz: '#6366f1', plan: '#6366f1',
  habits: '#f59e0b', sports: '#f97316', business: '#8b5cf6', coding: '#14b8a6',
  logistics: '#ef4444', daily: '#6366f1', explain: '#0ea5e9', case: '#d946ef',
  shadow: '#ec4899', curriculum: '#06b6d4', assess: '#06b6d4',
};
const getModeColor = (mode: string): string => MODE_COLORS[mode] || '#6366f1';

// Visual metadata for competency status/level badges in the curriculum modal.
const STATUS_META: Record<string, { label: string; badge: string; bar: string }> = {
  sin_evaluar: { label: 'Sin evaluar', badge: 'bg-zinc-100 text-zinc-500', bar: 'bg-zinc-300' },
  no_lo_se:    { label: 'No lo sé',    badge: 'bg-red-100 text-red-600',   bar: 'bg-red-400' },
  en_progreso: { label: 'En progreso', badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  dominado:    { label: 'Dominado',    badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
};

const LEVEL_META: Record<string, { label: string; badge: string }> = {
  basico:     { label: 'Básico',     badge: 'bg-sky-100 text-sky-700' },
  intermedio: { label: 'Intermedio', badge: 'bg-violet-100 text-violet-700' },
  avanzado:   { label: 'Avanzado',   badge: 'bg-fuchsia-100 text-fuchsia-700' },
};

export default function App() {
  // Persistence initialization
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.MESSAGES);
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved) as Message[];
      // Migration: Ensure unique IDs for all loaded messages
      const seenIds = new Set<string>();
      return parsed.map(msg => {
        // If ID is missing or already seen, generate a new unique one
        if (!msg.id || seenIds.has(msg.id)) {
          const newId = generateId();
          seenIds.add(newId);
          return { ...msg, id: newId };
        }
        seenIds.add(msg.id);
        return msg;
      });
    } catch (e) {
      return [];
    }
  });
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.MODE);
    return (saved as Mode) || 'general';
  });
  const [progress, setProgress] = useState<Progress>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PROGRESS);
    return saved ? JSON.parse(saved) : { english: 0, habits: 0, culture: 0, sports: 0 };
  });
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.MUTE) === 'true';
  });
  // Teaching language for professional modes: 'es' by default, 'en' for immersion.
  // Language modes (english/portuguese) ignore this — they use their fixed rule.
  const [teachingLang, setTeachingLang] = useState<'es' | 'en'>(() => {
    return localStorage.getItem('vera_teaching_lang') === 'en' ? 'en' : 'es';
  });

  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.WEEKLY_STATS);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Check if it's a new week
      if (parsed.weekStart === getStartOfWeek()) {
        return parsed;
      }
    }
    return {
      messagesPerMode: {},
      totalMessages: 0,
      weekStart: getStartOfWeek(),
      weekEnd: getEndOfWeek(),
      errorsCorrected: 0
    };
  });

  const [lastReport, setLastReport] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEYS.LAST_REPORT);
  });
  const [showReportModal, setShowReportModal] = useState(false);

  // Voice Conversation System State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    const saved = localStorage.getItem('vera_voice_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [callMode, setCallMode] = useState(false);
  const callModeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Cada llamada a speakText incrementa este contador; los onend encadenados
  // comprueban que siguen en la secuencia vigente para no avanzar una cola cancelada.
  const speechSeqRef = useRef(0);
  // Duración del último API de Vera (ms), para la instrumentación de latencia en speakText.
  const apiMsRef = useRef<number | null>(null);

  // Idioma de escucha del micrófono. null = automático (lo decide la conversación).
  const [listeningLang, setListeningLang] = useState<string | null>(() =>
    localStorage.getItem('vera_listening_lang')
  );
  const langLongPressRef = useRef(false);
  const langTimerRef = useRef<any>(null);

  // Daily session + flashcards state
  const [dailyState, setDailyState] = useState<DailyState>(() => getDailyState());
  const [cardStats, setCardStats] = useState<FlashcardStats>(() => getFlashcardStats());
  const [progressData, setProgressData] = useState<Record<string, ModuleProgress>>(() => getProgress());

  // Progress screen + fluency widget
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [fluencyWeekWords, setFluencyWeekWords] = useState<number>(() =>
    getSnapshots(7).reduce((a, s) => a + s.wordsSpoken, 0)
  );
  const [fluencyTrend, setFluencyTrend] = useState<FluencyTrend>(() => getTrend());
  const voiceInputRef = useRef(false);

  // Access gate (PIN)
  const [hasAccess, setHasAccess] = useState(() => !!localStorage.getItem('vera_access_code'));

  // Mobile drawer + PWA install
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<Flashcard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewFlipped, setReviewFlipped] = useState(false);
  const [reviewDone, setReviewDone] = useState(0); // cards graded this review session

  const refreshDaily = () => {
    setDailyState(getDailyState());
    setCardStats(getFlashcardStats());
    setProgressData(getProgress());
    setFluencyWeekWords(getSnapshots(7).reduce((a, s) => a + s.wordsSpoken, 0));
    setFluencyTrend(getTrend());
  };

  const countWords = (s: string) =>
    s.trim().split(/\s+/).filter(Boolean).length;

  const [studyPlan, setStudyPlan] = useState<string | null>(() => {
    return localStorage.getItem('vera_study_plan');
  });
  const [planStep, setPlanStep] = useState(0);
  const [planAnswers, setPlanAnswers] = useState<string[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);

  // Competency map ("temario") state
  const [curriculum, setCurriculum] = useState<Curriculum | null>(() => getCurriculum());
  const [showCurriculumModal, setShowCurriculumModal] = useState(false);
  const [curriculumStep, setCurriculumStep] = useState(0);
  const [curriculumAnswers, setCurriculumAnswers] = useState<string[]>([]);
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
  const refreshCurriculum = () => setCurriculum(getCurriculum());

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isWelcomeScreen, setIsWelcomeScreen] = useState(messages.length === 0);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  
  // Memory State
  const [memory, setMemory] = useState<UserMemory | null>(getMemory());
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState<Partial<UserMemory>>({
    name: '',
    goals: [],
    level: { english: 'beginner', habits: 'beginner', culture: 'beginner', sports: 'beginner' },
    preferences: { learningStyle: 'practical', sessionLength: 'medium', language: 'both' },
    weaknesses: [],
    strengths: [],
    notes: [],
    totalSessions: 0,
    lastSeen: new Date().toISOString()
  });
  const [isAboutPanelOpen, setIsAboutPanelOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isHeaderDropdownOpen, setIsHeaderDropdownOpen] = useState(false);
  const [activeSimulation, setActiveSimulation] = useState<Simulation | null>(null);
  const [showSimulationPicker, setShowSimulationPicker] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const headerDropdownRef = useRef<HTMLDivElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persistence effects
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (headerDropdownRef.current && !headerDropdownRef.current.contains(event.target as Node)) {
        setIsHeaderDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MODE, mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MUTE, String(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem('vera_teaching_lang', teachingLang);
  }, [teachingLang]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WEEKLY_STATS, JSON.stringify(weeklyStats));
  }, [weeklyStats]);

  useEffect(() => {
    if (lastReport) {
      localStorage.setItem(STORAGE_KEYS.LAST_REPORT, lastReport);
    }
  }, [lastReport]);

  useEffect(() => {
    // Check for Monday reset
    const checkReset = () => {
      const currentWeekStart = getStartOfWeek();
      if (weeklyStats.weekStart !== currentWeekStart) {
        setWeeklyStats({
          messagesPerMode: {},
          totalMessages: 0,
          weekStart: currentWeekStart,
          weekEnd: getEndOfWeek(),
          errorsCorrected: 0
        });
      }
    };
    
    const interval = setInterval(checkReset, 1000 * 60 * 60); // Check every hour
    checkReset();
    return () => clearInterval(interval);
  }, [weeklyStats.weekStart]);

  useEffect(() => {
    // Wait until the user is past the access gate before contacting the API.
    if (!hasAccess) return;
    // Vera takes the initiative for returning users with a concrete proposal
    if (hasMemory() && messages.length === 0) {
      const mem = getMemory();
      if (mem) {
        updateMemory({
          totalSessions: (mem.totalSessions || 0) + 1,
          lastSeen: new Date().toISOString()
        });
        setMemory(getMemory());
        openWithProposal();
      }
    }
  }, [hasAccess]);

  // Capture the PWA install prompt so we can trigger it from our own button.
  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstallDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const isStandalone =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(display-mode: standalone)').matches;
  const showInstallCard = !!deferredPrompt && !installDismissed && !isStandalone;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore
    }
    // Hide the card whether the user accepted or dismissed.
    setDeferredPrompt(null);
    setInstallDismissed(true);
  };

  // Calendar days between an ISO date and today (0 = same day).
  const calendarDaysSince = (iso: string): number => {
    const from = new Date(iso);
    const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const now = new Date();
    const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Generate Vera's proactive opening message from the user's real state.
  const openWithProposal = async () => {
    const mem = getMemory();
    const daily = getDailyState();
    const ctx: OpeningContext = {
      memory: mem,
      streak: daily.streak,
      dueCards: getDueCards().length,
      lowestModule: getLowestModule(),
      daysSinceLastSession: daily.lastSessionDate ? calendarDaysSince(daily.lastSessionDate) : null,
    };
    setIsWelcomeScreen(false);
    setIsLoading(true);
    try {
      const text = await buildOpeningMessage(ctx);
      const msg: Message = { id: generateId(), role: 'model', text, timestamp: Date.now() };
      setMessages([msg]);
      // El saludo lo escribe buildOpeningMessage en el idioma de preferencia (por
      // defecto español). No lleva etiquetas, así que le pasamos su idioma base.
      speakText(text, undefined, getMemory()?.preferences?.language === 'english' ? 'en-US' : 'es-ES');
    } catch (err) {
      const msg: Message = {
        id: generateId(),
        role: 'model',
        text: `Hey ${mem?.name || 'Adri'}, ¿arrancamos con tu sesión diaria de hoy?`,
        timestamp: Date.now(),
      };
      setMessages([msg]);
    } finally {
      setIsLoading(false);
      refreshDaily();
    }
  };

  const handleNewSession = () => {
    setMessages([]);
    setMode('general');
    setError(null);
    setSidebarOpen(false);
    if (hasMemory()) {
      // Vera opens the new session with a concrete proposal instead of a passive picker
      openWithProposal();
    } else {
      setIsWelcomeScreen(true);
    }
  };

  const updateProgress = (currentMode: Mode) => {
    setProgress(prev => {
      const next = { ...prev };
      if (currentMode === 'english') next.english = Math.min(100, next.english + 5);
      else if (currentMode === 'habits') next.habits = Math.min(100, next.habits + 5);
      else if (currentMode === 'learn') next.culture = Math.min(100, next.culture + 5);
      else if (currentMode === 'sports') next.sports = Math.min(100, next.sports + 5);
      return next;
    });
  };

  useEffect(() => {
    localStorage.setItem('vera_voice_enabled', String(voiceEnabled));
    if (!voiceEnabled) {
      stopSpeaking();
    }
  }, [voiceEnabled]);

  const stopSpeaking = () => {
    // Invalida cualquier cola encadenada en curso para que sus onend no reanuden.
    speechSeqRef.current++;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  // Persiste la preferencia manual de idioma de escucha.
  useEffect(() => {
    if (listeningLang) localStorage.setItem('vera_listening_lang', listeningLang);
    else localStorage.removeItem('vera_listening_lang');
  }, [listeningLang]);

  // Keep the ref in sync so async callbacks (utterance.onend) read the latest value
  useEffect(() => {
    callModeRef.current = callMode;
  }, [callMode]);

  // Live-video effect: play & show the clip while Vera is speaking, reset otherwise
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isSpeaking) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isSpeaking]);

  // Warm up the speech engine on mount: the first getVoices() call is what
  // triggers Edge to start loading the cloud "Online (Natural)" voice list.
  useEffect(() => {
    if (window.speechSynthesis) window.speechSynthesis.getVoices();
  }, []);

  // Pick the best voice for a language, strongly preferring modern
  // "Online (Natural)" voices over the old robotic ones (Zira, David, Helena...).
  const getVoice = (lang: string): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    const prefix = lang.split('-')[0];
    const preferred = PREFERRED_VOICES[lang] || [];

    // 1. Exact language + "Natural" + one of the preferred female names, in order.
    for (const name of preferred) {
      const v = voices.find(v => v.lang === lang && v.name.includes('Natural') && v.name.includes(name));
      if (v) return v;
    }

    // 2. Any exact-language voice whose name contains "Natural".
    const naturalExact = voices.find(v => v.lang === lang && v.name.includes('Natural'));
    if (naturalExact) return naturalExact;

    // 3. Any voice with the same language prefix that contains "Natural".
    const naturalPrefix = voices.find(v => v.lang.startsWith(prefix) && v.name.includes('Natural'));
    if (naturalPrefix) return naturalPrefix;

    // 4. Last resort: any exact-language voice that is NOT a known old/robotic one.
    const nonLegacy = voices.find(
      v => v.lang === lang && !OLD_VOICE_NAMES.some(old => v.name.includes(old))
    );
    if (nonLegacy) return nonLegacy;

    return null;
  };

  // speakText(text, spoken?, baseLang?):
  // - spoken (si existe) es el texto CON etiquetas [EN]/[ES]/[PT]; si no, se usa text.
  // - baseLang fija el idioma del texto FUERA de etiquetas de forma determinista
  //   (nunca se adivina). Sin baseLang se cae a la heurística (compatibilidad).
  const speakText = async (text: string, spoken?: string, baseLang?: string) => {
    if (!voiceEnabled) return;
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const speakEntry = Date.now();

    // Quita bloques no hablables del texto completo, trocea por idioma respetando
    // las etiquetas (base = baseLang), y limpia markdown inline por segmento.
    const source = stripNonSpoken(spoken ?? text);
    let segments = parseLanguageTags(source, baseLang)
      // Limpia markdown, emojis y símbolos no hablables (viñetas, marcadores de
      // lista, blockquote; flechas → pausa) por segmento (el TTS leía "👉" como
      // "mano"). El chat NO se toca: esto solo afecta al texto hablado. El filtro
      // descarta un tramo que quede vacío tras limpiar (p. ej. uno que era solo
      // un emoji o una viñeta suelta).
      .map((s) => ({ text: stripSpeechMarkers(stripEmoji(cleanSpeechText(s.text))), lang: s.lang }))
      .filter((s) => s.text.length > 0);

    // NO fundimos tramos extranjeros cortos en la voz base: Vera enseña idiomas y
    // Adri necesita la pronunciación nativa de CADA término (incluidos los de dos
    // palabras como "lead time"). TODO tramo etiquetado se pronuncia en su idioma,
    // sin excepción de longitud — enseñar bien pesa más que suavizar transiciones.
    // (mergeShortForeignSegments queda en voiceLang.ts pero ya NO se usa aquí.)

    // Trocea cada segmento en frases de ~200 chars (corte en límite de frase o, si
    // no, en coma/espacio; nunca a mitad de palabra). Se habla TODO el texto: sin
    // tope global que recortara los mensajes largos.
    segments = segments.flatMap((s) =>
      chunkForSpeech(s.text, 200).map((t) => ({ text: t, lang: s.lang }))
    );
    if (segments.length === 0) return;

    // Texto COMPLETO de cada segmento (con 30 chars no se podía auditar el
    // etiquetado por idioma ni las transiciones de voz).
    console.log('[Vera voice]', segments.map((s) => `${s.lang}:${s.text}`));

    // Esta llamada se convierte en la secuencia vigente; invalida las anteriores.
    const mySeq = ++speechSeqRef.current;

    // Las voces "Online (Natural)" de Edge cargan tarde. Espera a que exista una
    // para cada idioma presente antes de empezar, o la primera utterance cae al
    // motor robótico. Si otra llamada nos releva mientras esperamos, abortamos.
    const langs = [...new Set(segments.map((s) => s.lang))];
    const voiceWaitStart = Date.now();
    await Promise.all(langs.map((l) => waitForNaturalVoice(l)));
    const voiceWaitMs = Date.now() - voiceWaitStart;
    if (mySeq !== speechSeqRef.current) return;

    // Calentamiento: despierta el motor antes de la primera utterance real para que
    // no se coma la primera palabra (tope de 300ms, ver warmUpVoice).
    await warmUpVoice(getVoice(segments[0].lang), segments[0].lang);
    if (mySeq !== speechSeqRef.current) return;

    // Instrumentación de latencia (aún sin optimizar nada).
    console.log(
      '[Vera timing]',
      `api=${apiMsRef.current != null ? apiMsRef.current : '-'}ms voice-wait=${voiceWaitMs}ms speak-start=${Date.now() - speakEntry}ms`
    );
    apiMsRef.current = null;

    // Encola TODAS las utterances de golpe: la cola nativa del navegador las
    // reproduce con hueco mínimo, sin el corte que dejaba esperar al onend de una
    // para lanzar la siguiente. speechSeqRef invalida las colas canceladas.
    setIsSpeaking(true);
    const lastIndex = segments.length - 1;
    segments.forEach((seg, index) => {
      const utterance = new SpeechSynthesisUtterance(seg.text);
      utterance.lang = seg.lang;

      const selectedVoice = getVoice(seg.lang);
      if (selectedVoice) utterance.voice = selectedVoice;

      // Las voces "Online (Natural)" son de nube y no admiten rate/pitch: al
      // modificarlos, el navegador cae al motor local robótico. No tocarlos.
      utterance.volume = 1;

      // Solo la ÚLTIMA apaga el indicador y, en modo llamada, reactiva el micro
      // una única vez. Las intermedias no tocan estado.
      if (index === lastIndex) {
        utterance.onend = () => {
          if (mySeq !== speechSeqRef.current) return; // cola cancelada
          setIsSpeaking(false);
          if (callModeRef.current) {
            setTimeout(() => startListening(), 500);
          }
        };
        utterance.onerror = () => {
          if (mySeq !== speechSeqRef.current) return;
          setIsSpeaking(false);
        };
      }

      window.speechSynthesis.speak(utterance);
    });
  };

  // Idioma en el que debe escuchar el micrófono. Prioridad:
  // 1) fijado manualmente por el usuario; 2) idioma del último mensaje de Vera
  // (si te acaba de hablar en inglés, lo natural es responder en inglés);
  // 3) en módulos profesionales, el idioma de enseñanza (inmersión → inglés);
  // 4) idioma del modo activo como antes.
  const getListeningLang = (): string => {
    if (listeningLang) return listeningLang;

    // Base determinista del modo/idioma de enseñanza; también sirve de reserva
    // para la detección del último mensaje (si puntúa cero, no adivina inglés).
    const base = getBaseLang(mode, teachingLang);

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'model' && messages[i].text?.trim()) {
        return detectLanguage(messages[i].text, base);
      }
    }

    return base;
  };

  // Toque corto: cicla en-US → es-ES → pt-PT (fija el idioma manualmente).
  const cycleListeningLang = () => {
    const order = ['en-US', 'es-ES', 'pt-PT'];
    const current = listeningLang ?? getListeningLang();
    setListeningLang(order[(order.indexOf(current) + 1) % order.length]);
  };

  const startLangPress = () => {
    langLongPressRef.current = false;
    langTimerRef.current = setTimeout(() => {
      langLongPressRef.current = true;
      setListeningLang(null); // pulsación larga → vuelve a automático
    }, 500);
  };
  const endLangPress = () => {
    clearTimeout(langTimerRef.current);
    if (!langLongPressRef.current) cycleListeningLang();
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Voice requires Chrome or Edge browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      // El idioma de escucha lo marca la conversación (o el ajuste manual), no el modo.
      recognition.lang = getListeningLang();
      
      recognition.onstart = () => {
        setIsListening(true);
        stopSpeaking();
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput(transcript);
          voiceInputRef.current = true; // this send came from the microphone
          // Small delay to allow state update to be visible before sending
          setTimeout(() => {
            handleSend(undefined, transcript);
          }, 500);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech Recognition Error:", event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setError("Microphone permission denied. Please enable it in your browser settings.");
        } else {
          setError(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error("Speech Recognition Init Error:", err);
      setError("Could not start speech recognition.");
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Parse Vera's control tags ([FLASHCARD], [REVIEW], [STARTCALL], [SESSIONCOMPLETE]),
  // run their side effects, and return the text with the tags stripped for display.
  const extractControlTags = (text: string): string => {
    let out = text;
    let touched = false;

    // [FLASHCARD]cardType|front|back|example|category[/FLASHCARD]
    // Back-compat: if only 4 fields arrive, assume cardType 'term'.
    const fcRegex = /\[FLASHCARD\]([\s\S]*?)\[\/FLASHCARD\]/g;
    let m: RegExpExecArray | null;
    while ((m = fcRegex.exec(text)) !== null) {
      const parts = m[1].split('|').map(s => s.trim());
      let cardType: string;
      let front: string, back: string, example: string, category: string;
      if (parts.length >= 5) {
        [cardType, front, back, example, category] = parts;
      } else {
        cardType = 'term';
        [front, back, example, category] = parts;
      }
      if (front && back) {
        saveFlashcard({ cardType, front, back, example: example || undefined, category });
        touched = true;
      }
    }
    out = out.replace(fcRegex, '');

    // [ERROR]type|language|description|example|correction[/ERROR] — record a recurring-error pattern
    const errRegex = /\[ERROR\]([\s\S]*?)\[\/ERROR\]/g;
    while ((m = errRegex.exec(text)) !== null) {
      const [type, language, description, example, correction] = m[1].split('|').map(s => s.trim());
      if (description) {
        recordError({
          type: type || 'grammar',
          language: language || 'none',
          description,
          example: example || '',
          correction: correction || '',
        });
        recordCorrection();
        touched = true;
      }
    }
    out = out.replace(errRegex, '');

    // [REVIEW]cardId|quality[/REVIEW] — grade a reviewed card (daily Phase 1)
    const rvRegex = /\[REVIEW\]([\s\S]*?)\[\/REVIEW\]/g;
    while ((m = rvRegex.exec(text)) !== null) {
      const [id, q] = m[1].split('|').map(s => s.trim());
      const quality = parseInt(q, 10);
      if (id && !isNaN(quality)) {
        reviewCard(id, quality);
        touched = true;
      }
    }
    out = out.replace(rvRegex, '');

    // [COMPETENCY]id|status|confidence[/COMPETENCY] — update a competency in the map
    const compRegex = /\[COMPETENCY\]([\s\S]*?)\[\/COMPETENCY\]/g;
    while ((m = compRegex.exec(text)) !== null) {
      const [id, status, conf] = m[1].split('|').map(s => s.trim());
      if (id && status) {
        const confidence = Math.max(0, Math.min(100, parseInt(conf || '0', 10) || 0));
        const existing = getCurriculum()?.competencies.find(c => c.id === id);
        updateCompetency(id, {
          status: normalizeStatus(status),
          confidence,
          lastTouched: new Date().toISOString(),
          timesStudied: (existing?.timesStudied || 0) + 1,
        });
        touched = true;
      }
    }
    out = out.replace(compRegex, '');

    // [STARTCALL] — kick off hands-free voice mode (daily Phase 2).
    // Enabling call mode is enough: utterance.onend auto-starts listening after
    // Vera finishes speaking. Only start manually if voice output is off (no onend).
    if (/\[STARTCALL\]/.test(out)) {
      out = out.replace(/\[STARTCALL\](\[\/STARTCALL\])?/g, '');
      setCallMode(true);
      if (!voiceEnabled) {
        setTimeout(() => startListening(), 500);
      }
    }

    // [SESSIONCOMPLETE] — finish the daily session (daily Phase 3)
    if (/\[SESSIONCOMPLETE\]/.test(out)) {
      out = out.replace(/\[SESSIONCOMPLETE\]/g, '');
      completeSession();
      recordSessionCompleted('english'); // daily sessions center on English fluency
      setCallMode(false);
      touched = true;
    }

    if (touched) {
      refreshDaily();
      refreshCurriculum();
    }

    // NOTE: language tags [EN]/[ES]/[PT] are intentionally LEFT IN here so the voice
    // can use them (parseLanguageTags). The chat display strips them via
    // stripLanguageTags at the call site; speech reads spokenText, which keeps them.
    return out.replace(/\n{3,}/g, '\n\n').trim();
  };

  const openReviewModal = () => {
    setReviewQueue(getDueCards());
    setReviewIndex(0);
    setReviewFlipped(false);
    setReviewDone(0);
    setShowReviewModal(true);
    setSidebarOpen(false);
  };

  // Self-graded review (Again/Hard/Good/Easy → SM-2 quality)
  const gradeReview = (quality: number) => {
    const card = reviewQueue[reviewIndex];
    if (card) reviewCard(card.id, quality);
    refreshDaily();
    if (reviewIndex + 1 >= reviewQueue.length) {
      setReviewDone(d => d + 1);
      setReviewQueue([]); // triggers the "all done" view
      setReviewIndex(0);
      setReviewFlipped(false);
    } else {
      setReviewDone(d => d + 1);
      setReviewIndex(i => i + 1);
      setReviewFlipped(false);
    }
  };

  const handleSend = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault();
    const messageText = overrideInput || input;
    if (!messageText.trim() || isLoading) return;

    // /review opens the flashcard review modal without contacting the model
    if (messageText.trim().toLowerCase().startsWith('/review')) {
      openReviewModal();
      setInput('');
      return;
    }

    // /progress opens the full-screen progress screen without contacting the model
    if (messageText.trim().toLowerCase().startsWith('/progress')) {
      setShowProgressModal(true);
      setSidebarOpen(false);
      setInput('');
      return;
    }

    // /curriculum — if a map exists, open it; otherwise start the generation Q&A
    if (messageText.trim().toLowerCase().startsWith('/curriculum')) {
      const existing = getCurriculum();
      if (existing) {
        setCurriculum(existing);
        setShowCurriculumModal(true);
        setSidebarOpen(false);
        setInput('');
        return;
      }
      // No map yet: kick off the conversational generation flow
      if (isWelcomeScreen) setIsWelcomeScreen(false);
      const userMessage: Message = { id: generateId(), role: 'user', text: messageText, timestamp: Date.now() };
      const firstQ: Message = {
        id: generateId(),
        role: 'model',
        text: "Vamos a construir tu mapa de competencias 🎯 — el temario de todo lo que necesitas dominar para tu puesto.\n\nPrimero: ¿cuál es el puesto o rol objetivo para el que quieres prepararte? Descríbelo con tus palabras.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMessage, firstQ]);
      speakText(firstQ.text, undefined, 'es-ES');
      setMode('curriculum');
      setCurriculumStep(1);
      setCurriculumAnswers([]);
      setSidebarOpen(false);
      setIsLoading(false);
      setInput('');
      return;
    }

    // Did this send come from the microphone? (used for fluency metrics)
    const fromVoice = callMode || voiceInputRef.current;
    voiceInputRef.current = false;

    // Count Adri's spoken words while the hands-free call is active (daily Phase 2)
    if (mode === 'daily' && callMode) {
      addWordsSpoken(countWords(messageText));
    }

    if (isWelcomeScreen) setIsWelcomeScreen(false);

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      text: messageText,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    // Detect mode
    let detectedMode = mode;
    if (messageText.startsWith('/english')) detectedMode = 'english';
    else if (messageText.startsWith('/portuguese')) detectedMode = 'portuguese';
    else if (messageText.startsWith('/habits')) detectedMode = 'habits';
    else if (messageText.startsWith('/learn')) detectedMode = 'learn';
    else if (messageText.startsWith('/quiz')) detectedMode = 'quiz';
    else if (messageText.startsWith('/sports')) detectedMode = 'sports';
    else if (messageText.startsWith('/business')) detectedMode = 'business';
    else if (messageText.startsWith('/coding')) detectedMode = 'coding';
    else if (messageText.startsWith('/logistics')) detectedMode = 'logistics';
    else if (messageText.startsWith('/daily')) detectedMode = 'daily';
    else if (messageText.startsWith('/explain')) detectedMode = 'explain';
    else if (messageText.startsWith('/case')) detectedMode = 'case';
    else if (messageText.startsWith('/shadow')) detectedMode = 'shadow';
    else if (messageText.startsWith('/assess')) detectedMode = 'assess';
    else if (messageText.startsWith('/simulate')) {
      setShowSimulationPicker(true);
      setIsLoading(false);
      setInput('');
      return;
    }
    
    if (detectedMode !== mode) setMode(detectedMode);
    updateProgress(detectedMode);
    recordMessage(detectedMode);
    setProgressData(getProgress());

    // Kick off a fresh daily session when /daily is invoked
    if (messageText.startsWith('/daily')) {
      startSession();
      refreshDaily();
    }

    // Update weekly stats
    setWeeklyStats(prev => ({
      ...prev,
      totalMessages: prev.totalMessages + 1,
      messagesPerMode: {
        ...prev.messagesPerMode,
        [detectedMode]: (prev.messagesPerMode[detectedMode] || 0) + 1
      }
    }));

    if (messageText.startsWith('/plan')) {
      setMode('plan');
      setPlanStep(1);
      setPlanAnswers([]);
      const veraResponse: Message = {
        id: generateId(),
        role: 'model',
        text: "Let's build your personalized study plan! First, what's your main goal? (e.g. speak fluent English, launch a business, learn to code)",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, veraResponse]);
      speakText(veraResponse.text, undefined, 'en-US');
      setIsLoading(false);
      setInput('');
      return;
    }

    if (mode === 'simulation' && (messageText.toLowerCase().startsWith('/end') || messageText.toLowerCase().startsWith('/stop'))) {
      const prevMode = localStorage.getItem(STORAGE_KEYS.MODE) as Mode || 'general';
      setMode(prevMode);
      setActiveSimulation(null);
      
      try {
        const apiStart = Date.now();
        const response = await sendMessageToVera([...messages, userMessage], 'simulation', activeSimulation || undefined);
        apiMsRef.current = Date.now() - apiStart;
        const veraResponse: Message = {
          id: generateId(),
          role: 'model',
          text: stripLanguageTags(response),
          spokenText: response,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, veraResponse]);
        speakText(veraResponse.text, veraResponse.spokenText, getBaseLang(mode, teachingLang));
      } catch (err: any) {
        setError(err.message || "Failed to get debrief.");
      } finally {
        setIsLoading(false);
        setInput('');
      }
      return;
    }

    if (mode === 'plan') {
      const updatedAnswers = [...planAnswers, messageText];
      setPlanAnswers(updatedAnswers);
      
      if (planStep < 5) {
        const nextQuestions = [
          "When do you want to achieve it? Give me a date.",
          "How many minutes per day can you dedicate?",
          "What's your current level in this area? (beginner/intermediate/advanced)",
          "What's the biggest obstacle for you right now?"
        ];
        const nextQuestion = nextQuestions[planStep - 1];
        
        const veraResponse: Message = {
          id: generateId(),
          role: 'model',
          text: nextQuestion,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, veraResponse]);
        speakText(veraResponse.text, undefined, 'en-US'); // preguntas canned en inglés
        setPlanStep(planStep + 1);
        setIsLoading(false);
        setInput('');
      } else {
        try {
          const plan = await generateStudyPlan(updatedAnswers, memory);
          localStorage.setItem('vera_study_plan', plan);
          setStudyPlan(plan);
          const veraResponse: Message = {
            id: generateId(),
            role: 'model',
            text: plan,
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, veraResponse]);
          // El plan lo genera el modelo en idioma libre (texto largo): heurística.
          speakText(veraResponse.text);
          setMode('general');
          setPlanStep(0);
        } catch (err: any) {
          setError(err.message || "Failed to generate plan.");
        } finally {
          setIsLoading(false);
          setInput('');
        }
      }
      return;
    }

    // Competency-map generation Q&A: 1) target role, 2) experience/calibration, then generate.
    if (mode === 'curriculum') {
      const updatedAnswers = [...curriculumAnswers, messageText];
      setCurriculumAnswers(updatedAnswers);

      if (curriculumStep < 2) {
        const veraResponse: Message = {
          id: generateId(),
          role: 'model',
          text: "Genial. Ahora, para calibrar bien el temario a tu nivel: ¿cuántos años llevas en ese ámbito y qué partes ya manejas con soltura?",
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, veraResponse]);
        speakText(veraResponse.text, undefined, 'es-ES');
        setCurriculumStep(2);
        setIsLoading(false);
        setInput('');
      } else {
        try {
          const role = updatedAnswers[0];
          const context = updatedAnswers[1] || 'Sin contexto adicional.';
          const competencies = await generateCurriculum(role, context);
          const created = createCurriculum(role, competencies);
          setCurriculum(created);
          const areaCount = new Set(competencies.map(c => c.area)).size;
          const veraResponse: Message = {
            id: generateId(),
            role: 'model',
            text: `¡Listo! 🎯 He creado tu mapa de competencias para **${role}**: **${areaCount} áreas** y **${competencies.length} competencias** en total.\n\nAhora lo suyo es hacer una autoevaluación rápida para saber de qué partes ya sabes y por dónde empezar. Lo hacemos de 8 en 8 para que no se haga pesado.\n\nEscribe **/assess** cuando quieras empezar, o abre tu mapa con **/curriculum**.`,
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, veraResponse]);
          speakText(veraResponse.text, undefined, 'es-ES');
          setMode('general');
          setCurriculumStep(0);
          setCurriculumAnswers([]);
        } catch (err: any) {
          setError(err.message || "No se pudo generar el temario.");
        } finally {
          setIsLoading(false);
          setInput('');
        }
      }
      return;
    }

    // Correction logic for English mode
    let correctionMsg: Message | null = null;
    let weaknessMention = "";
    
    if (detectedMode === 'english' && !messageText.startsWith('/')) {
      try {
        const correction = await correctEnglishText(messageText);
        if (correction && correction.hasErrors) {
          // Increment errors corrected
          setWeeklyStats(prev => ({
            ...prev,
            errorsCorrected: prev.errorsCorrected + 1
          }));

          correctionMsg = {
            id: `correction-${generateId()}`,
            role: 'model',
            type: 'correction',
            text: correction.explanation,
            timestamp: Date.now(),
            correctionData: {
              original: messageText,
              corrected: correction.corrected,
              explanation: correction.explanation
            }
          };
          
          // Update memory with weakness
          if (correction.errorType) {
            const current = getMemory();
            if (current) {
              const newWeaknesses = [...current.weaknesses, correction.errorType];
              const errorCount = newWeaknesses.filter(w => w === correction.errorType).length;
              
              if (errorCount === 3) {
                weaknessMention = `I notice you often forget ${correction.errorType}. Let's practice that. `;
              }
              
              updateMemory({ weaknesses: newWeaknesses });
              setMemory(getMemory());
            }
          }
        }
      } catch (err) {
        console.error("Correction failed", err);
      }
    }

    if (correctionMsg) {
      setMessages(prev => [...prev, correctionMsg!]);
      speakText(correctionMsg.text, undefined, 'en-US'); // explicación del coach de inglés
    }

    const finalHistory = correctionMsg ? [...newMessages, correctionMsg] : newMessages;

    if (messageText.startsWith('/summary')) {
      try {
        const summary = await getSummary(finalHistory);
        const veraResponse: Message = {
          id: generateId(),
          role: 'model',
          text: summary,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, veraResponse]);
        speakText(veraResponse.text);
      } catch (err: any) {
        setError(err.message || "No se pudo generar el resumen.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (messageText.startsWith('/report')) {
      try {
        const report = await generateWeeklyReport(weeklyStats, memory, messages.slice(-20));
        setLastReport(report);
        setShowReportModal(true);
        const veraResponse: Message = {
          id: generateId(),
          role: 'model',
          text: "Here is your weekly progress report! I've also saved it for you to review anytime.",
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, veraResponse]);
        speakText(veraResponse.text, undefined, 'en-US'); // confirmación canned en inglés
      } catch (err: any) {
        setError(err.message || "Failed to generate report.");
      } finally {
        setIsLoading(false);
        setInput('');
      }
      return;
    }

    if (detectedMode === 'portuguese' && (
      messageText.toLowerCase().includes('recursos') || 
      messageText.toLowerCase().includes('resources') || 
      messageText.toLowerCase().includes('libros') || 
      messageText.toLowerCase().includes('books')
    )) {
      try {
        const resources = await searchResources(messageText);
        const veraResponse: Message = {
          id: generateId(),
          role: 'model',
          text: resources,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, veraResponse]);
        speakText(veraResponse.text);
      } catch (err: any) {
        setError("No se pudieron buscar recursos.");
      } finally {
        setIsLoading(false);
        setInput('');
      }
      return;
    }

    try {
      const apiStart = Date.now();
      let responseText = await sendMessageToVera(finalHistory, detectedMode, activeSimulation || undefined, teachingLang);
      apiMsRef.current = Date.now() - apiStart;

      // Parse & run Vera's control tags (flashcards, review grades, call mode, session end)
      responseText = extractControlTags(responseText);

      // Upgrade 2: Parse visuals
      let visualContent = undefined;
      if (responseText.includes('[VISUAL_START]') && responseText.includes('[VISUAL_END]')) {
        const startIdx = responseText.indexOf('[VISUAL_START]') + '[VISUAL_START]'.length;
        const endIdx = responseText.indexOf('[VISUAL_END]');
        visualContent = responseText.substring(startIdx, endIdx).trim();
        // Remove visual block from text
        responseText = (responseText.substring(0, responseText.indexOf('[VISUAL_START]')) + 
                        responseText.substring(endIdx + '[VISUAL_END]'.length)).trim();
      }
      
      // Add weakness mention if triggered
      if (weaknessMention) {
        responseText = `${weaknessMention}\n\n${responseText}`;
      }

      // responseText keeps Vera's [EN]/[ES]/[PT] tags. The voice uses them
      // (spokenText); the chat shows the stripped version (text).
      const spokenText = responseText;
      const displayText = stripLanguageTags(responseText);

      const veraResponse: Message = {
        id: generateId(),
        role: 'model',
        text: displayText,
        spokenText,
        visualContent: visualContent,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, veraResponse]);
      // Idioma base determinista del modo + inmersión (nunca se adivina el base).
      speakText(veraResponse.text, veraResponse.spokenText, getBaseLang(detectedMode, teachingLang));

      // Fluency metrics: record a spoken turn when the message came from the mic
      if (fromVoice) {
        recordSpokenTurn(countWords(messageText), countWords(displayText));
        refreshDaily();
      }

      // Memory Updates
      updateMemory({ lastSeen: new Date().toISOString() });
      if (newMessages.length % 15 === 0) {
        extractMemoryUpdates(newMessages).then(updates => {
          if (updates) {
            const current = getMemory();
            if (current) {
              updateMemory({
                weaknesses: Array.from(new Set([...current.weaknesses, ...(updates.weaknesses || [])])),
                strengths: Array.from(new Set([...current.strengths, ...(updates.strengths || [])])),
                notes: Array.from(new Set([...current.notes, ...(updates.notes || [])])).slice(-10) // Keep last 10 notes
              });
              setMemory(getMemory());
            }
          }
        });
      }
    } catch (err: any) {
      setError(err.message || "Vera no pudo responder. Revisa tu API key.");
    } finally {
      setIsLoading(false);
    }
  };

  const startSimulation = async (simulation: Simulation) => {
    setActiveSimulation(simulation);
    setMode('simulation');
    setShowSimulationPicker(false);
    setIsLoading(true);
    setError(null);

    try {
      const openingLine = await generateSimulationContext(simulation);
      const veraResponse: Message = {
        id: generateId(),
        role: 'model',
        text: openingLine,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, veraResponse]);
      const simLang = simulation.language === 'english' ? 'en-US'
        : simulation.language === 'portuguese' ? 'pt-PT' : 'es-ES';
      speakText(veraResponse.text, undefined, simLang);
    } catch (err: any) {
      setError("Failed to start simulation.");
    } finally {
      setIsLoading(false);
    }
  };

  const startMode = (selectedMode: Mode) => {
    setMode(selectedMode);
    const greeting = {
      english: "Let's practice your English! How can I help you today?",
      portuguese: "Olá! Vamos aprender Português de Portugal? Qual é o teu nível atual (A1-C2)?",
      habits: "Time to build some great routines. What habit are we focusing on?",
      learn: "I'm ready to teach. What topic would you like to explore?",
      sports: "AI in sports is fascinating. Want to see some real use cases?",
      business: "Business and entrepreneurship! Ready to launch something big? What's your idea?",
      coding: "Let's write some code. What language do you want to start with? (HTML, CSS, JS, Python...)",
      logistics: "Logistics and supply chain! Ready to optimize some operations? What should we look at?",
      general: "Hey! I'm Vera. What's on your mind today?",
      plan: "Let's build your personalized study plan!"
    }[selectedMode];

    const initialMsg: Message = {
      id: generateId(),
      role: 'model',
      text: greeting,
      timestamp: Date.now(),
    };
    setMessages([initialMsg]);
    // Saludos canned: todos en inglés salvo el de portugués.
    speakText(initialMsg.text, undefined, selectedMode === 'portuguese' ? 'pt-PT' : 'en-US');
    setIsWelcomeScreen(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const ModeBadge = ({ currentMode, className = "" }: { currentMode: Mode, className?: string }) => {
    const config = {
      general: { label: 'General', icon: MessageSquare, color: 'bg-zinc-800 text-zinc-300' },
      english: { label: 'English', icon: BookOpen, color: 'bg-blue-900/50 text-blue-200' },
      portuguese: { label: 'Português PT', icon: BookOpen, color: 'bg-emerald-900/50 text-emerald-200' },
      habits: { label: 'Habits', icon: Zap, color: 'bg-amber-900/50 text-amber-200' },
      learn: { label: 'Culture', icon: History, color: 'bg-emerald-900/50 text-emerald-200' },
      quiz: { label: 'Quiz', icon: CheckCircle2, color: 'bg-purple-900/50 text-purple-200' },
      sports: { label: 'AI Sports', icon: Dumbbell, color: 'bg-orange-900/50 text-orange-200' },
      plan: { label: 'Plan Mode', icon: Sparkles, color: 'bg-indigo-900/50 text-indigo-200' },
      business: { label: 'Business', icon: Briefcase, color: 'bg-amber-600/50 text-amber-100' },
      coding: { label: 'Coding', icon: Code, color: 'bg-teal-600/50 text-teal-100' },
      logistics: { label: 'Logistics', icon: Truck, color: 'bg-orange-600/50 text-orange-100' },
      simulation: { label: 'Simulation', icon: Trophy, color: 'bg-indigo-600 text-white shadow-lg' },
      daily: { label: 'Daily Session', icon: Flame, color: 'bg-indigo-900/50 text-indigo-200' },
    };
    const { label, icon: Icon, color } = config[currentMode];
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${color} ${className}`}>
        <Icon size={12} />
        {label}
      </div>
    );
  };

  const ProgressBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter text-zinc-500">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1 w-full bg-[#ffffff15] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          className={`h-full ${color}`}
        />
      </div>
    </div>
  );

  // Small trend indicator: green up / red down / gray flat, with a % change.
  const TrendPill = ({ value, label }: { value: number; label?: string }) => {
    const up = value > 0;
    const down = value < 0;
    const color = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-zinc-500';
    const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${color}`}>
        <Icon size={12} />
        {value > 0 ? '+' : ''}{value}%
        {label && <span className="text-zinc-500 font-medium ml-1">{label}</span>}
      </span>
    );
  };

  const completeOnboarding = () => {
    const finalMemory = {
      ...onboardingData,
      totalSessions: 1,
      lastSeen: new Date().toISOString()
    } as UserMemory;
    saveMemory(finalMemory);
    setMemory(finalMemory);
    setOnboardingStep(0);
    setIsWelcomeScreen(true);
  };

  // Access gate: lock the whole app behind a PIN until a code is stored.
  if (!hasAccess) {
    return <AccessGate onSuccess={() => setHasAccess(true)} />;
  }

  if (!memory && onboardingStep > 0) {
    return (
      <div className="flex h-screen bg-[#1a1a2e] text-white font-sans items-center justify-center p-8">
        <AnimatePresence mode="wait">
          <motion.div 
            key={onboardingStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-xl w-full flex gap-12 items-center"
          >
            <div className="flex-1 space-y-8">
              {onboardingStep === 1 && (
                <div className="space-y-6">
                  <h2 className="text-4xl font-black tracking-tighter">Hi! I'm Vera. <br/>What's your name?</h2>
                  <input 
                    autoFocus
                    type="text" 
                    className="w-full bg-transparent border-b-2 border-zinc-700 py-4 text-2xl focus:outline-none focus:border-amber-500 transition-colors"
                    placeholder="Enter your name..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.target as HTMLInputElement).value) {
                        setOnboardingData(prev => ({ ...prev, name: (e.target as HTMLInputElement).value }));
                        setOnboardingStep(2);
                      }
                    }}
                  />
                </div>
              )}

              {onboardingStep === 2 && (
                <div className="space-y-6">
                  <h2 className="text-4xl font-black tracking-tighter">What's your main goal with me?</h2>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'english', label: 'Improve English' },
                      { id: 'habits', label: 'Build better habits' },
                      { id: 'learn', label: 'Learn new topics' },
                      { id: 'all', label: 'All of the above' }
                    ].map(goal => (
                      <button 
                        key={goal.id}
                        onClick={() => {
                          setOnboardingData(prev => ({ ...prev, goals: [goal.label] }));
                          setOnboardingStep(3);
                        }}
                        className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl text-left hover:border-amber-500 hover:bg-zinc-800 transition-all font-bold"
                      >
                        {goal.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {onboardingStep === 3 && (
                <div className="space-y-6">
                  <h2 className="text-4xl font-black tracking-tighter">How would you describe your English level?</h2>
                  <div className="grid grid-cols-1 gap-3">
                    {['Beginner', 'Intermediate', 'Advanced'].map(lvl => (
                      <button 
                        key={lvl}
                        onClick={() => {
                          setOnboardingData(prev => ({ 
                            ...prev, 
                            level: { ...prev.level!, english: lvl.toLowerCase() as any } 
                          }));
                          setOnboardingStep(4);
                        }}
                        className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl text-left hover:border-amber-500 hover:bg-zinc-800 transition-all font-bold"
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {onboardingStep === 4 && (
                <div className="space-y-6">
                  <h2 className="text-4xl font-black tracking-tighter">How long do you want our sessions to be?</h2>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { id: 'short', label: '10 min' },
                      { id: 'medium', label: '20 min' },
                      { id: 'long', label: '30 min+' }
                    ].map(len => (
                      <button 
                        key={len.id}
                        onClick={() => {
                          setOnboardingData(prev => ({ 
                            ...prev, 
                            preferences: { ...prev.preferences!, sessionLength: len.id as any } 
                          }));
                          completeOnboarding();
                        }}
                        className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl text-left hover:border-amber-500 hover:bg-zinc-800 transition-all font-bold"
                      >
                        {len.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden md:block w-64 h-64 rounded-full shimmer bg-zinc-800 overflow-hidden border-8 border-zinc-800/50">
              <img 
                src="/vera-avatar.jpg" 
                alt="Vera Avatar" 
                className="w-full h-full object-cover object-top"
                onError={(e) => { e.currentTarget.style.display='none'; }}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // Auto-start onboarding if no memory
  if (!memory && onboardingStep === 0) {
    setOnboardingStep(1);
  }

  return (
    <div className="flex h-screen bg-[#fafaf8] text-zinc-900 font-sans overflow-hidden">
      {/* Mobile drawer overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar — static on desktop, sliding drawer on mobile */}
      <aside
        className={`w-[260px] h-screen bg-[#1a1a2e] text-white flex flex-col shrink-0 shadow-2xl border-r border-[#ffffff10]
          fixed md:static top-0 left-0 z-40 transform transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}
      >
        {/* Fixed zone (does not scroll): identity row + action buttons */}
        <div className="px-5 pt-5 pb-3 flex flex-col flex-shrink-0 gap-4">
          {/* Identity row: circular avatar + name / tutor / status */}
          <div className="flex items-center gap-3">
            {/* Circular live video avatar */}
            <div
              className={`relative overflow-hidden bg-zinc-900 shrink-0 transition-all duration-300 ${isSpeaking ? 'vera-ring-pulse' : ''}`}
              style={{ width: 110, height: 110, borderRadius: '50%' }}
            >
              {/* Base layer: still portrait, always visible */}
              <img
                src="/vera-avatar.jpg"
                alt="Vera Avatar"
                className="absolute inset-0 w-full h-full object-cover object-top"
                onError={(e) => { e.currentTarget.style.display='none'; }}
              />
              {/* Top layer: video, fades in while speaking */}
              <video
                ref={videoRef}
                src="/Vera_720p.mp4"
                muted
                playsInline
                loop
                preload="auto"
                className="absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-300"
                style={{ opacity: isSpeaking ? 1 : 0 }}
              />
            </div>

            {/* Name + tutor + live status */}
            <div className="flex flex-col items-start text-left min-w-0">
              <h1 className="text-[16px] font-black tracking-tighter leading-none">VERA</h1>
              <p className="text-[9px] uppercase tracking-widest font-bold text-zinc-500 mt-1">Personal Tutor</p>
              <div className="flex items-center gap-2 mt-2">
                {(() => {
                  const status = isListening
                    ? { color: 'bg-emerald-500', pulse: true, label: `Listening ${LANG_FLAG[getListeningLang()]}...` }
                    : isSpeaking
                    ? { color: 'bg-indigo-500', pulse: true, label: 'Speaking' }
                    : isLoading
                    ? { color: 'bg-amber-500', pulse: true, label: 'Thinking...' }
                    : { color: 'bg-zinc-500', pulse: false, label: 'Online' };
                  return (
                    <>
                      <span
                        className={`rounded-full ${status.color} ${status.pulse ? 'animate-pulse' : ''}`}
                        style={{ width: 8, height: 8 }}
                      />
                      <span className="text-[11px] font-medium text-zinc-300">{status.label}</span>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Action buttons row: Daily session + Start/End call */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { closeSidebar(); handleSend(undefined, '/daily'); }}
              className="w-1/2 flex items-center justify-center gap-1.5 px-2 py-2 text-white rounded-[12px] transition-all text-[11px] font-semibold shadow-[0_4px_15px_rgba(99,102,241,0.4)] hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <span className="whitespace-nowrap">Daily session</span>
              <span className="text-[10px] font-bold whitespace-nowrap">🔥{dailyState.streak}</span>
            </button>
            <button
              onClick={() => {
                if (callMode) {
                  setCallMode(false);
                  stopListening();
                } else {
                  setCallMode(true);
                  startListening();
                }
              }}
              className="w-1/2 flex items-center justify-center gap-1.5 px-2 py-2 text-white rounded-[12px] transition-all text-[11px] font-semibold hover:brightness-110"
              style={callMode
                ? { background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 4px 15px rgba(239,68,68,0.4)' }
                : { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 15px rgba(99,102,241,0.4)' }
              }
            >
              {callMode ? <MicOff size={14} /> : <Mic size={14} />}
              <span className="whitespace-nowrap">{callMode ? 'End call' : 'Start call'}</span>
            </button>
          </div>
        </div>

        {/* Scroll zone: progress bars, streak/flashcards cards, study plan, report, about */}
        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 flex flex-col items-center text-center">
          <div className="w-full space-y-4 px-2">
            {[
              { label: 'English', module: 'english', color: 'bg-blue-500' },
              { label: 'Portuguese', module: 'portuguese', color: 'bg-green-500' },
              { label: 'Logistics', module: 'logistics', color: 'bg-red-500' },
              { label: 'Football', module: 'sports', color: 'bg-orange-500' },
              { label: 'Business', module: 'business', color: 'bg-purple-500' },
              { label: 'Coding', module: 'coding', color: 'bg-teal-500' },
            ].map((b) => {
              // Reference progressData so the bars re-render whenever it refreshes.
              void progressData;
              return (
                <ProgressBar
                  key={b.module}
                  label={b.label}
                  value={getProgressPercent(b.module)}
                  color={b.color}
                />
              );
            })}
            <div className="pt-1 text-[10px] font-medium text-zinc-500 text-left">
              {cardStats.total} terms learned · {cardStats.mastered} mastered
            </div>
          </div>

          {/* Daily streak + Flashcards widgets */}
          <div className="w-full mt-8 px-2 space-y-3">
            <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800 text-left">
              <div className="flex items-center gap-2 mb-1">
                <Flame size={16} className="text-orange-400" />
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Daily streak</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tighter text-white">{dailyState.streak}</span>
                <span className="text-[11px] text-zinc-400 font-medium">days in a row</span>
              </div>
              {dailyState.todayCompleted ? (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                  <CheckCircle2 size={13} /> Done today
                </div>
              ) : (
                <button
                  onClick={() => { closeSidebar(); handleSend(undefined, '/daily'); }}
                  className="w-full mt-3 py-2 rounded-xl text-[11px] font-bold text-white transition-all hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                >
                  Start today's session
                </button>
              )}
            </div>

            <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800 text-left">
              <div className="flex items-center gap-2 mb-1">
                <Layers size={16} className="text-indigo-400" />
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Flashcards</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tighter text-white">{cardStats.dueToday}</span>
                <span className="text-[11px] text-zinc-400 font-medium">due today</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                {cardStats.total} total · {cardStats.mastered} mastered
              </div>
              {cardStats.dueToday > 0 ? (
                <button
                  onClick={openReviewModal}
                  className="w-full mt-3 py-2 rounded-xl text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all"
                >
                  Review now
                </button>
              ) : (
                <div className="mt-3 text-[11px] text-zinc-500 font-medium">All caught up ✓</div>
              )}
            </div>

            {/* Competency map widget */}
            <button
              onClick={() => {
                closeSidebar();
                if (curriculum) setShowCurriculumModal(true);
                else handleSend(undefined, '/curriculum');
              }}
              className="w-full bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800 text-left hover:border-zinc-700 transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <Target size={16} className="text-cyan-400" />
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Competency map</span>
              </div>
              {curriculum ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tracking-tighter text-white">{getGlobalCoverage()}%</span>
                    <span className="text-[11px] text-zinc-400 font-medium">dominado</span>
                  </div>
                  {(() => {
                    const next = getNextToStudy();
                    return next ? (
                      <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">
                        Siguiente: {next.topic}
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-400 mt-0.5 font-medium">¡Mapa completo! ✓</div>
                    );
                  })()}
                </>
              ) : (
                <div className="text-[11px] text-zinc-400 mt-1 font-medium">Crea tu temario de competencias →</div>
              )}
            </button>

            {/* Fluency widget */}
            <button
              onClick={() => { closeSidebar(); setShowProgressModal(true); }}
              className="w-full bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800 text-left hover:border-zinc-700 transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-emerald-400" />
                <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Fluency</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tighter text-white">{fluencyWeekWords}</span>
                <span className="text-[11px] text-zinc-400 font-medium">words this week</span>
              </div>
              <div className="mt-1">
                <TrendPill value={fluencyTrend.wordsChange} label="vs last week" />
              </div>
            </button>
          </div>

          {studyPlan && (
            <div className="w-full mt-8 px-2">
              <button 
                onClick={() => setShowPlanModal(true)}
                className="w-full flex items-center gap-3 px-4 py-[12px] text-white rounded-[14px] transition-all text-[13px] font-semibold shadow-[0_4px_15px_rgba(99,102,241,0.4)] hover:scale-[1.02] hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                <Sparkles size={18} />
                My Study Plan
              </button>
            </div>
          )}

          <div className="w-full mt-4 px-2">
            <button 
              onClick={() => {
                if (lastReport) {
                  setShowReportModal(true);
                } else {
                  handleSend(undefined, '/report');
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-[12px] text-white rounded-[14px] transition-all text-[13px] font-semibold shadow-[0_4px_15px_rgba(79,70,229,0.3)] hover:scale-[1.02] hover:brightness-110 opacity-85"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
            >
              <Terminal size={18} />
              Weekly Report
            </button>
          </div>

          {/* Memory Panel */}
          {memory && (
            <div className="w-full mt-8 px-2">
              <button 
                onClick={() => setIsAboutPanelOpen(!isAboutPanelOpen)}
                className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.1em] text-[#ffffff60] hover:text-white transition-colors mb-4"
              >
                <span>About you</span>
                <ChevronRight size={12} className={`transition-transform ${isAboutPanelOpen ? 'rotate-90' : ''}`} />
              </button>
              
              <AnimatePresence>
                {isAboutPanelOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-4"
                  >
                    <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-800">
                      <div className="text-[9px] text-zinc-500 uppercase mb-1">Name</div>
                      <div className="text-xs font-bold">{memory.name}</div>
                    </div>
                    <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-800">
                      <div className="text-[9px] text-zinc-500 uppercase mb-1">Main Goal</div>
                      <div className="text-xs font-bold">{memory.goals[0]}</div>
                    </div>
                    <div className="bg-zinc-900/50 rounded-xl p-3 border border-zinc-800">
                      <div className="text-[9px] text-zinc-500 uppercase mb-1">English Level</div>
                      <div className="inline-block px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[9px] font-bold uppercase">
                        {memory.level.english}
                      </div>
                    </div>
                    {memory.notes.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[9px] text-zinc-500 uppercase">Recent Notes</div>
                        {memory.notes.slice(-2).map((note, i) => (
                          <div key={i} className="text-[10px] text-zinc-400 leading-relaxed italic">
                            "{note}"
                          </div>
                        ))}
                      </div>
                    )}
                    <button 
                      onClick={() => {
                        setOnboardingStep(1);
                        setMemory(null);
                      }}
                      className="w-full py-2 border border-zinc-700 rounded-lg text-[9px] font-bold uppercase hover:bg-zinc-800 transition-colors"
                    >
                      Edit Profile
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* PWA install prompt card */}
          {showInstallCard && (
            <div className="w-full mt-8 px-2">
              <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800 text-left">
                <div className="flex items-center gap-2 mb-3">
                  <Smartphone size={16} className="text-indigo-400" />
                  <span className="text-[12px] font-semibold text-zinc-200">Install Vera on your phone</span>
                </div>
                <button
                  onClick={handleInstall}
                  className="w-full min-h-[44px] py-2.5 rounded-xl text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all"
                >
                  Install
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-auto p-6 space-y-2">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl border border-[#ffffff30] hover:bg-[#ffffff10] text-white transition-all text-sm font-medium"
          >
            <PlusCircle size={18} />
            New Session
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('vera_access_code');
              window.location.reload();
            }}
            className="w-full text-center py-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col relative">
        <header className="h-20 border-b border-zinc-200/50 flex items-center px-4 md:px-8 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden mr-2 w-11 h-11 flex items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 shrink-0"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <div className="hidden md:flex flex-1 items-center">
            <h2 className="font-bold text-sm uppercase tracking-widest text-zinc-400">
              {isWelcomeScreen ? "Welcome" : mode}
            </h2>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 md:flex-none">
            {[
              { id: 'english', label: 'English', icon: Globe, color: '#3b82f6' },
              { id: 'portuguese', label: 'Português', icon: Languages, color: '#10b981' },
              { id: 'habits', label: 'Habits', icon: Zap, color: '#f59e0b' },
              { id: 'learn', label: 'Learn', icon: BookOpen, color: '#6366f1' },
              { id: 'sports', label: 'Sports', icon: Trophy, color: '#f97316' },
              { id: 'business', label: 'Business', icon: Briefcase, color: '#8b5cf6' },
              { id: 'coding', label: 'Coding', icon: Code2, color: '#14b8a6' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => startMode(m.id as Mode)}
                className={`group relative shrink-0 w-14 md:w-16 h-14 flex flex-col items-center justify-center rounded-xl transition-all duration-300 ${
                  mode === m.id
                    ? 'shadow-md'
                    : 'hover:bg-zinc-100'
                }`}
                style={{ 
                  backgroundColor: mode === m.id ? m.color : 'transparent',
                }}
              >
                <m.icon 
                  size={20} 
                  className={`mb-1 transition-colors ${
                    mode === m.id ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-700'
                  }`} 
                />
                <span className={`text-[9px] font-bold uppercase tracking-tighter transition-colors ${
                  mode === m.id ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-700'
                }`}>
                  {m.label}
                </span>
                
                {mode === m.id && (
                  <motion.div
                    layoutId="activeHeaderTab"
                    className="absolute inset-0 rounded-xl z-[-1]"
                    style={{ backgroundColor: m.color }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            ))}
            
            <div className="relative ml-1 flex items-center" ref={headerDropdownRef}>
              <button
                onClick={() => setIsHeaderDropdownOpen(!isHeaderDropdownOpen)}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isHeaderDropdownOpen ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}
              >
                <PlusCircle size={20} />
              </button>
              {/* Voice Toggle */}
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ml-1 ${voiceEnabled ? 'text-indigo-500 bg-indigo-50' : 'text-zinc-400 hover:bg-zinc-100'}`}
                title="Voice on/off"
              >
                {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>

              {/* Teaching-language toggle: only in professional modes (not english/portuguese) */}
              {mode !== 'english' && mode !== 'portuguese' && (
                <div
                  className="inline-flex items-center rounded-full bg-zinc-100 p-0.5 ml-1 align-middle select-none"
                  title="Idioma de las clases"
                >
                  {(['es', 'en'] as const).map((lng) => {
                    const active = teachingLang === lng;
                    return (
                      <button
                        key={lng}
                        type="button"
                        onClick={() => setTeachingLang(lng)}
                        className={`px-2 py-1 rounded-full text-[10px] font-black tracking-wide transition-all ${active ? 'text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                        style={active ? { backgroundColor: getModeColor(mode) } : undefined}
                      >
                        {lng.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              )}

              <AnimatePresence>
                {isHeaderDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-0 mt-2 w-48 bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden z-50"
                  >
                    <div className="p-2">
                      {[
                        { id: 'general', label: 'General', icon: MessageSquare },
                        { id: 'logistics', label: 'Logistics', icon: Truck },
                        { id: 'quiz', label: 'Quiz', icon: CheckCircle2 },
                        { id: 'plan', label: 'Build Plan', icon: Sparkles },
                        { id: 'simulate', label: 'Start Simulation', icon: Trophy, emoji: '🎭' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            if (m.id === 'plan') handleSend(undefined, '/plan');
                            else if (m.id === 'simulate') setShowSimulationPicker(true);
                            else startMode(m.id as Mode);
                            setIsHeaderDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[11px] font-semibold uppercase tracking-wider text-zinc-600 hover:bg-zinc-50 transition-all"
                        >
                          {m.emoji ? <span className="text-sm">{m.emoji}</span> : <m.icon size={14} />}
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="hidden md:block flex-1"></div>
        </header>

        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {isWelcomeScreen ? (
              <motion.div 
                key="welcome"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="absolute inset-0 flex flex-col items-center justify-center p-8 overflow-y-auto"
              >
                <div className="w-32 h-32 rounded-full shimmer bg-zinc-200 mb-8 overflow-hidden border-4 border-white shadow-xl">
                  <video
                    src="/Vera_720p.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <h3 className="text-3xl font-black tracking-tighter mb-2">Ready to start?</h3>
                <p className="text-zinc-500 mb-12 text-center max-w-md">Choose a focus area to begin your personalized session with Vera.</p>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-3xl">
                  {[
                    { id: 'english', title: 'English', desc: 'Practice conversation and grammar', icon: BookOpen, color: 'hover:border-blue-500 hover:bg-blue-50' },
                    { id: 'portuguese', title: 'Portuguese', desc: 'Learn European Portuguese A1-C2', icon: BookOpen, color: 'hover:border-emerald-500 hover:bg-emerald-50' },
                    { id: 'habits', title: 'Habits', desc: 'Build routines and consistency', icon: Zap, color: 'hover:border-amber-500 hover:bg-amber-50' },
                    { id: 'learn', title: 'Culture', desc: 'History, business, and more', icon: History, color: 'hover:border-emerald-500 hover:bg-emerald-50' },
                    { id: 'sports', title: 'AI Sports', desc: 'Trends and real use cases', icon: Dumbbell, color: 'hover:border-orange-500 hover:bg-orange-50' },
                    { id: 'business', title: 'Business', desc: 'Strategy, marketing, and finance', icon: Briefcase, color: 'hover:border-amber-600 hover:bg-amber-50' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => startMode(item.id as Mode)}
                      className={`p-6 bg-white border border-zinc-200 rounded-2xl text-left transition-all group ${item.color} shadow-sm hover:shadow-md`}
                    >
                      <item.icon className="mb-4 text-zinc-400 group-hover:text-current transition-colors" size={24} />
                      <h4 className="font-bold mb-1">{item.title}</h4>
                      <p className="text-xs text-zinc-500">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col"
              >
                {mode === 'simulation' && activeSimulation && (
                  <div className="bg-indigo-600 text-white px-6 py-3 flex items-center justify-between shadow-lg z-10">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🎭</span>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider leading-none mb-1">Simulation Active</h4>
                        <p className="text-[11px] font-bold opacity-90">{activeSimulation.title}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded uppercase">Type /end to stop</span>
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth">
                  <div className="max-w-3xl mx-auto space-y-10">
                    {messages.map((msg, index) => (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                          <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center overflow-hidden shadow-sm ${msg.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200'}`}>
                            {msg.role === 'user' ? (
                              <User size={18} />
                            ) : (
                              <div className="relative">
                                <img 
                                  src="/vera-avatar.jpg" 
                                  alt="Vera Avatar" 
                                  className="w-full h-full object-cover object-top"
                                  onError={(e) => { e.currentTarget.style.display='none'; }}
                                />
                                {isSpeaking && index === messages.length - 1 && (
                                  <motion.div 
                                    animate={{ scale: [1, 1.2, 1] }}
                                    transition={{ repeat: Infinity, duration: 1 }}
                                    className="absolute -top-1 -right-1 bg-indigo-500 text-white rounded-full p-0.5 shadow-sm"
                                  >
                                    <Volume2 size={8} />
                                  </motion.div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className={`
                              p-5 rounded-2xl text-sm leading-relaxed shadow-sm relative
                              ${msg.role === 'user' 
                                ? 'bg-zinc-900 text-white rounded-tr-none' 
                                : msg.type === 'correction'
                                  ? 'bg-emerald-50 text-emerald-900 border-l-4 border-emerald-500 rounded-tl-none'
                                  : 'bg-[#fffdfa] text-zinc-800 border-l-4 border-zinc-200 rounded-tl-none'}
                            `}
                            style={msg.role === 'model' && msg.type !== 'correction' ? { borderLeftColor: {
                              english: '#3b82f6',
                              habits: '#f59e0b',
                              learn: '#10b981',
                              sports: '#f97316',
                              general: '#71717a',
                              quiz: '#a855f7'
                            }[mode] } : {}}
                            >
                              {msg.type === 'correction' && msg.correctionData ? (
                                <div className="space-y-4">
                                  <div className="flex items-center gap-2 text-emerald-600 font-bold text-[10px] uppercase tracking-widest">
                                    <CheckCircle2 size={14} />
                                    Writing Correction
                                  </div>
                                  <div className="space-y-3">
                                    <div className="p-3 bg-white/50 rounded-xl border border-emerald-100">
                                      <div className="text-[9px] uppercase text-emerald-500 font-bold mb-1">Original</div>
                                      <div className="text-zinc-500 line-through decoration-red-400/50">{msg.correctionData.original}</div>
                                    </div>
                                    <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-200">
                                      <div className="text-[9px] uppercase text-emerald-600 font-bold mb-1">Corrected</div>
                                      <div className="font-medium text-emerald-900">{msg.correctionData.corrected}</div>
                                    </div>
                                    <div className="text-xs text-emerald-800/80 italic">
                                      {msg.correctionData.explanation}
                                    </div>
                                  </div>
                                </div>
                              ) : msg.role === 'model' ? (
                                <div className="markdown-content">
                                  {msg.visualContent && (
                                    <div 
                                      className="max-w-full overflow-hidden bg-white border border-zinc-100 rounded-xl p-3 mb-3 shadow-sm"
                                      dangerouslySetInnerHTML={{ __html: msg.visualContent }}
                                    />
                                  )}
                                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                                  {currentlyPlayingId === msg.id && (
                                    <motion.div 
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      className="absolute top-2 right-2 text-amber-500"
                                    >
                                      <Volume2 size={14} className="animate-pulse" />
                                    </motion.div>
                                  )}
                                </div>
                              ) : (
                                <p>{msg.text}</p>
                              )}
                            </div>
                            <div className={`flex items-center gap-2 text-[9px] font-bold text-zinc-400 uppercase tracking-widest ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              {msg.role === 'user' ? 'You' : 'Vera'}
                              <span>•</span>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="flex gap-4">
                          <div className="w-9 h-9 rounded-xl bg-white border border-zinc-200 flex items-center justify-center overflow-hidden shimmer">
                            <img 
                              src="/vera-avatar.jpg" 
                              alt="Vera Avatar" 
                              className="w-full h-full object-cover object-top"
                              onError={(e) => { e.currentTarget.style.display='none'; }}
                            />
                          </div>
                          <div className="bg-white border border-zinc-200 p-5 rounded-2xl rounded-tl-none shadow-sm">
                            <div className="flex gap-1.5">
                              <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                              <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                              <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Input Area */}
                <div
                  className="px-4 pt-4 pb-4 md:p-8 bg-gradient-to-t from-[#fafaf8] via-[#fafaf8] to-transparent"
                  style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
                >
                  <div className="max-w-3xl mx-auto">
                    {isListening && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-center gap-3 mb-4"
                      >
                        <div className="flex gap-1">
                          {[0, 1, 2, 3, 4].map(i => (
                            <motion.div
                              key={i}
                              animate={{ height: [8, 20, 8] }}
                              transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                              className="w-1 bg-red-500 rounded-full"
                            />
                          ))}
                        </div>
                        <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Listening... speak now</span>
                      </motion.div>
                    )}
                    
                    {isSpeaking && (
                      <motion.div 
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-center gap-2 mb-4"
                      >
                        <Volume2 size={14} className="text-indigo-500 animate-pulse" />
                        <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Vera is speaking...</span>
                      </motion.div>
                    )}

                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-4 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center justify-between shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Info size={16} />
                          {error}
                        </div>
                        <button onClick={() => setError(null)} className="hover:bg-red-100 p-1 rounded-lg transition-colors">
                          <X size={16} />
                        </button>
                      </motion.div>
                    )}
                    <form 
                      onSubmit={handleSend}
                      className="flex items-center gap-3 relative group"
                    >
                      <div className="relative" ref={dropdownRef}>
                        <button 
                          type="button"
                          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                          className="w-9 h-9 bg-white border border-zinc-200 rounded-full hover:bg-zinc-50 text-zinc-500 transition-all shadow-sm flex items-center justify-center"
                        >
                          <LayoutGrid size={18} />
                        </button>

                        <AnimatePresence>
                          {isDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute bottom-full mb-3 left-0 w-72 bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden z-50"
                            >
                              <div className="p-2 max-h-[400px] overflow-y-auto no-scrollbar">
                                {[
                                  { id: 'daily', label: 'Daily session', icon: '🔥', cmd: '/daily' },
                                  { id: 'review', label: 'Review flashcards', icon: '🃏', cmd: '/review' },
                                  { id: 'progress', label: 'My progress', icon: '📈', cmd: '/progress' },
                                  { id: 'curriculum', label: 'My competency map', icon: '🎯', cmd: '/curriculum' },
                                  { id: 'explain', label: 'Explain it back (Feynman)', icon: '🧠', cmd: '/explain' },
                                  { id: 'case', label: 'Real-world case', icon: '📋', cmd: '/case' },
                                  { id: 'shadow', label: 'Shadowing practice', icon: '🎙️', cmd: '/shadow' },
                                  { id: 'english', label: 'English practice', icon: '🇺🇸', cmd: '/english' },
                                  { id: 'portuguese', label: 'Portuguese (Portugal)', icon: '🇵🇹', cmd: '/portuguese' },
                                  { id: 'habits', label: 'Habits & productivity', icon: '⚡', cmd: '/habits' },
                                  { id: 'learn', label: 'Learn a topic', icon: '📚', cmd: '/learn ' },
                                  { id: 'quiz', label: 'Quiz me', icon: '🧠', cmd: '/quiz ' },
                                  { id: 'sports', label: 'Football & sports', icon: '⚽', cmd: '/sports' },
                                  { id: 'logistics', label: 'Logistics & transport', icon: '🚛', cmd: '/logistics' },
                                  { id: 'sports-logistics', label: 'Sports event logistics', icon: '🏟️', cmd: '/learn sports event logistics' },
                                  { id: 'business', label: 'Business', icon: '💼', cmd: '/business' },
                                  { id: 'coding', label: 'Coding', icon: '💻', cmd: '/coding' },
                                  { id: 'math', label: 'Mathematics', icon: '➗', cmd: '/learn mathematics' },
                                  { id: 'culture', label: 'Culture & history', icon: '🌍', cmd: '/learn culture' },
                                  { id: 'plan', label: 'My study plan', icon: '📋', cmd: '/plan' },
                                  { id: 'report', label: 'Weekly report', icon: '📊', cmd: '/report' },
                                  { id: 'summary', label: 'Summary', icon: '📝', cmd: '/summary' },
                                ].map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      handleSend(undefined, m.cmd);
                                      setIsDropdownOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all border-l-4 ${mode === m.id ? 'bg-zinc-50 text-zinc-900 font-bold border-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 border-transparent'}`}
                                  >
                                    <span className="text-xl">{m.icon}</span>
                                    <span>{m.label}</span>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Listening-language selector: toque cicla el idioma, pulsación larga → auto */}
                      <button
                        type="button"
                        title={listeningLang
                          ? 'Idioma de escucha fijado — toca para cambiar, mantén pulsado para automático'
                          : 'Idioma de escucha automático — toca para fijarlo'}
                        onPointerDown={startLangPress}
                        onPointerUp={endLangPress}
                        onPointerLeave={() => clearTimeout(langTimerRef.current)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm text-lg leading-none select-none bg-white ${
                          listeningLang
                            ? 'border-2 border-indigo-500'
                            : 'border border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        {LANG_FLAG[getListeningLang()]}
                      </button>

                      {/* Microphone Button */}
                      <button
                        type="button"
                        onClick={isListening ? stopListening : startListening}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
                          isListening 
                            ? 'bg-red-500 text-white animate-pulse' 
                            : isSpeaking
                              ? 'bg-indigo-50 text-indigo-500'
                              : 'bg-white border border-zinc-200 text-zinc-400 hover:bg-zinc-50'
                        }`}
                      >
                        {isListening ? <MicOff size={20} /> : isSpeaking ? <Volume2 size={20} className="animate-pulse" /> : <Mic size={20} />}
                      </button>

                      <div className="relative flex-1">
                        <input 
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder={isListening ? "Listening..." : "Type a message or command..."}
                          className="w-full bg-white border border-zinc-200 rounded-2xl px-6 py-5 pr-16 text-sm focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all shadow-lg"
                        />
                        <button 
                          type="submit"
                          disabled={!input.trim() || isLoading}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                        >
                          <Send size={20} />
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Study Plan Modal */}
      <AnimatePresence>
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-indigo-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 text-white rounded-xl">
                    <Sparkles size={20} />
                  </div>
                  <h3 className="text-xl font-black tracking-tighter text-indigo-900">Your Personalized Plan</h3>
                </div>
                <button 
                  onClick={() => setShowPlanModal(false)}
                  className="p-2 hover:bg-indigo-100 text-indigo-400 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 prose prose-indigo max-w-none">
                <ReactMarkdown>{studyPlan || ''}</ReactMarkdown>
              </div>
              <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex justify-end">
                <button 
                  onClick={() => setShowPlanModal(false)}
                  className="px-6 py-2 bg-zinc-900 text-white rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Competency Map Modal */}
      <AnimatePresence>
        {showCurriculumModal && curriculum && (() => {
          const coverage = getCoverage();
          const globalCoverage = getGlobalCoverage();
          const totalUnassessed = curriculum.competencies.filter(c => c.status === 'sin_evaluar').length;
          const sortedAreas = [...coverage].sort((a, b) => a.coverage - b.coverage);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                {/* Header: role + global coverage + big progress bar */}
                <div className="p-6 border-b border-zinc-100 bg-cyan-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-cyan-600 text-white rounded-xl shrink-0">
                        <Target size={20} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xl font-black tracking-tighter text-cyan-900 truncate">Mapa de competencias</h3>
                        <p className="text-[12px] text-cyan-700/80 font-medium truncate">{curriculum.role}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCurriculumModal(false)}
                      className="p-2 hover:bg-cyan-100 text-cyan-500 rounded-full transition-colors shrink-0"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-[11px] uppercase tracking-widest font-bold text-cyan-700">Cobertura global</span>
                      <span className="text-2xl font-black tracking-tighter text-cyan-900">{globalCoverage}%</span>
                    </div>
                    <div className="w-full h-3 bg-cyan-100 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${globalCoverage}%` }} />
                    </div>
                    <div className="mt-1.5 text-[11px] text-cyan-700/80 font-medium">
                      {curriculum.competencies.length} competencias · {coverage.length} áreas · {totalUnassessed} sin evaluar
                    </div>
                  </div>
                  {totalUnassessed > 0 && (
                    <button
                      onClick={() => { setShowCurriculumModal(false); handleSend(undefined, '/assess'); }}
                      className="w-full mt-4 py-2.5 rounded-xl text-[13px] font-bold text-white bg-cyan-600 hover:bg-cyan-500 transition-all flex items-center justify-center gap-2"
                    >
                      <GraduationCap size={16} /> Continuar autoevaluación ({totalUnassessed})
                    </button>
                  )}
                </div>

                {/* Areas as collapsible cards, weakest coverage first */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-zinc-50">
                  {sortedAreas.map((area) => {
                    const open = !!expandedAreas[area.area];
                    const comps = curriculum.competencies.filter(c => c.area === area.area);
                    return (
                      <div key={area.area} className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                        <button
                          onClick={() => setExpandedAreas(prev => ({ ...prev, [area.area]: !prev[area.area] }))}
                          className="w-full p-4 flex items-center gap-3 text-left hover:bg-zinc-50 transition-colors"
                        >
                          <div className="shrink-0 w-11 h-11 rounded-xl bg-zinc-100 flex flex-col items-center justify-center">
                            <span className="text-[13px] font-black tracking-tighter text-zinc-800 leading-none">{area.coverage}%</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-zinc-900 truncate">{area.area}</div>
                            <div className="text-[11px] text-zinc-500 mt-0.5">
                              {area.mastered} dominadas · {area.inProgress} en progreso · {area.unassessed} sin evaluar
                            </div>
                            <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden mt-1.5">
                              <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${area.coverage}%` }} />
                            </div>
                          </div>
                          <ChevronDown size={18} className={`text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>

                        {open && (
                          <div className="px-4 pb-4 space-y-2.5 border-t border-zinc-100 pt-3">
                            {comps.map((c) => {
                              const st = STATUS_META[c.status] || STATUS_META.sin_evaluar;
                              const lv = LEVEL_META[c.level] || LEVEL_META.intermedio;
                              return (
                                <div key={c.id} className="rounded-xl bg-zinc-50 border border-zinc-100 p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="font-semibold text-[13px] text-zinc-900">{c.topic}</div>
                                      {c.description && (
                                        <div className="text-[11px] text-zinc-500 mt-0.5">{c.description}</div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center flex-wrap gap-1.5 mt-2">
                                    <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${lv.badge}`}>{lv.label}</span>
                                    <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
                                    {c.notes && (
                                      <span className="text-[10px] text-zinc-400 italic truncate">{c.notes}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                    <div className="flex-1 h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${c.confidence}%` }} />
                                    </div>
                                    <span className="text-[10px] font-bold text-zinc-400 w-8 text-right">{c.confidence}%</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setShowCurriculumModal(false);
                                      handleSend(undefined, `/learn ${c.topic} — ${c.description}`);
                                    }}
                                    className="w-full mt-2.5 py-1.5 rounded-lg text-[11px] font-bold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 transition-all"
                                  >
                                    Estudiar esto
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer: discreet regenerate */}
                <div className="p-4 border-t border-zinc-100 bg-white flex justify-center">
                  <button
                    onClick={() => {
                      if (window.confirm('¿Regenerar el temario? Se perderá TODO el progreso actual (autoevaluaciones y competencias dominadas).')) {
                        clearCurriculum();
                        setCurriculum(null);
                        setExpandedAreas({});
                        setShowCurriculumModal(false);
                        handleSend(undefined, '/curriculum');
                      }
                    }}
                    className="text-[11px] text-zinc-400 hover:text-red-500 font-medium transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw size={12} /> Regenerar temario
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Weekly Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-3xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-900 text-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500 text-zinc-900 rounded-xl">
                    <Terminal size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tighter">Weekly Progress Report</h3>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">
                      {new Date(weeklyStats.weekStart).toLocaleDateString()} - {new Date(weeklyStats.weekEnd).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowReportModal(false)}
                  className="p-2 hover:bg-zinc-800 text-zinc-400 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                  <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Total Messages</div>
                    <div className="text-3xl font-black tracking-tighter text-zinc-900">{weeklyStats.totalMessages}</div>
                  </div>
                  <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Errors Corrected</div>
                    <div className="text-3xl font-black tracking-tighter text-emerald-600">{weeklyStats.errorsCorrected}</div>
                  </div>
                  <div className="bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                    <div className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Active Days</div>
                    <div className="text-3xl font-black tracking-tighter text-amber-600">
                      {Object.keys(weeklyStats.messagesPerMode).length} Modules
                    </div>
                  </div>
                </div>

                <div className="mb-10 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Activity by Module</h4>
                  <div className="space-y-4">
                    {Object.entries(weeklyStats.messagesPerMode).map(([m, count]) => (
                      <div key={m} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold uppercase text-zinc-600">
                          <span>{m}</span>
                          <span>{count} messages</span>
                        </div>
                        <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (count / weeklyStats.totalMessages) * 100)}%` }}
                            className={`h-full ${
                              m === 'english' ? 'bg-blue-500' :
                              m === 'portuguese' ? 'bg-emerald-500' :
                              m === 'habits' ? 'bg-amber-500' :
                              m === 'learn' ? 'bg-emerald-500' :
                              m === 'sports' ? 'bg-orange-500' :
                              m === 'business' ? 'bg-amber-600' :
                              m === 'coding' ? 'bg-teal-500' :
                              m === 'logistics' ? 'bg-orange-600' : 'bg-zinc-400'
                            }`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="prose prose-zinc max-w-none border-t border-zinc-100 pt-8">
                  <ReactMarkdown>{lastReport || ''}</ReactMarkdown>
                </div>
              </div>
              
              <div className="p-6 border-t border-zinc-100 bg-zinc-50 flex justify-end">
                <button 
                  onClick={() => setShowReportModal(false)}
                  className="px-8 py-3 bg-zinc-900 text-white rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all shadow-lg"
                >
                  Close Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Simulation Picker Modal */}
      <AnimatePresence>
        {showSimulationPicker && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#fafaf8] overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-6xl min-h-screen py-12 px-6"
            >
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-5xl font-black tracking-tighter mb-2">Role-Play Simulations</h2>
                  <p className="text-zinc-500 font-medium">Practice real-life situations with Vera acting as a character.</p>
                </div>
                <button 
                  onClick={() => setShowSimulationPicker(false)}
                  className="w-12 h-12 flex items-center justify-center bg-white border border-zinc-200 rounded-full hover:bg-zinc-50 transition-all shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {SIMULATIONS.map((sim) => (
                  <button
                    key={sim.id}
                    onClick={() => startSimulation(sim)}
                    className="group bg-white border border-zinc-200 rounded-[32px] p-8 text-left transition-all hover:shadow-2xl hover:-translate-y-1 flex flex-col h-full"
                  >
                    <div className="flex items-center justify-between mb-6">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        sim.difficulty === 'beginner' ? 'bg-emerald-100 text-emerald-700' :
                        sim.difficulty === 'intermediate' ? 'bg-blue-100 text-blue-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {sim.difficulty}
                      </div>
                      <div className="text-2xl">
                        {sim.language === 'portuguese' ? '🇵🇹' : sim.language === 'spanish' ? '🇪🇸' : '🇬🇧'}
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-black tracking-tighter mb-3 group-hover:text-indigo-600 transition-colors">{sim.title}</h3>
                    <p className="text-sm text-zinc-500 leading-relaxed mb-8 flex-1">{sim.description}</p>
                    
                    <div className="space-y-4 mb-8">
                      <div className="flex items-center gap-3 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        <User size={14} />
                        <span>Vera: {sim.veraRole.split(' ')[0]}...</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                        <Briefcase size={14} />
                        <span>You: {sim.userRole.split(' ')[0]}...</span>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-zinc-100 flex items-center justify-between group-hover:border-indigo-100 transition-colors">
                      <span className="text-xs font-black uppercase tracking-widest text-zinc-400 group-hover:text-indigo-600 transition-colors">Start Simulation</span>
                      <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Flashcard Review Modal */}
      <AnimatePresence>
        {showReviewModal && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-0 py-6 md:p-6 bg-[#1a1a2e]/95 backdrop-blur-md">
            {/* Header / close */}
            <div className="absolute top-6 right-6 flex items-center gap-4">
              {reviewQueue.length > 0 && (
                <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  {reviewIndex + 1} / {reviewQueue.length}
                </span>
              )}
              <button
                onClick={() => { setShowReviewModal(false); refreshDaily(); }}
                className="w-11 h-11 flex items-center justify-center bg-white/10 text-white rounded-full hover:bg-white/20 transition-all"
              >
                <X size={22} />
              </button>
            </div>

            {reviewQueue.length === 0 ? (
              // All caught up / finished
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center text-white max-w-md"
              >
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={40} className="text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black tracking-tighter mb-2">
                  {reviewDone > 0 ? 'Review complete!' : 'All caught up'}
                </h3>
                <p className="text-zinc-400 mb-8">
                  {reviewDone > 0
                    ? `You reviewed ${reviewDone} card${reviewDone === 1 ? '' : 's'}. Nice work.`
                    : 'No flashcards are due right now. Come back later.'}
                </p>
                <button
                  onClick={() => { setShowReviewModal(false); refreshDaily(); }}
                  className="px-8 py-3 rounded-xl font-bold text-sm text-white transition-all hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                >
                  Done
                </button>
              </motion.div>
            ) : (
              <div className="w-full max-w-xl flex flex-col items-center px-4">
                {/* Card type + category chips */}
                <div className="mb-6 flex items-center gap-2">
                  {(() => {
                    const t = reviewQueue[reviewIndex].cardType || 'term';
                    const styles: Record<string, string> = {
                      term: 'bg-zinc-500/20 text-zinc-300',
                      chunk: 'bg-blue-500/20 text-blue-300',
                      pattern: 'bg-purple-500/20 text-purple-300',
                      case: 'bg-amber-500/20 text-amber-300',
                    };
                    return (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${styles[t] || styles.term}`}>
                        {t}
                      </span>
                    );
                  })()}
                  <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/10 text-indigo-200">
                    {reviewQueue[reviewIndex].category}
                  </span>
                </div>

                {/* Card with flip animation */}
                <div className="w-full h-72 mb-8" style={{ perspective: 1200 }}>
                  <motion.div
                    className="relative w-full h-full"
                    style={{ transformStyle: 'preserve-3d' }}
                    animate={{ rotateY: reviewFlipped ? 180 : 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    {/* Front */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-white shadow-2xl p-8 text-center"
                      style={{ backfaceVisibility: 'hidden' }}
                    >
                      <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold mb-4">Prompt</span>
                      <span className="text-3xl font-black tracking-tighter text-zinc-900">
                        {reviewQueue[reviewIndex].front}
                      </span>
                    </div>
                    {/* Back */}
                    <div
                      className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-indigo-600 text-white shadow-2xl p-8 text-center"
                      style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                    >
                      <span className="text-[10px] uppercase tracking-widest text-indigo-200 font-bold mb-3">Answer</span>
                      <span className="text-2xl font-black tracking-tighter mb-3">
                        {reviewQueue[reviewIndex].back}
                      </span>
                      {reviewQueue[reviewIndex].example && (
                        <span className="text-sm text-indigo-100 italic leading-relaxed">
                          "{reviewQueue[reviewIndex].example}"
                        </span>
                      )}
                    </div>
                  </motion.div>
                </div>

                {!reviewFlipped ? (
                  <button
                    onClick={() => setReviewFlipped(true)}
                    className="px-8 py-3 min-h-[44px] rounded-xl font-bold text-sm text-white bg-white/10 hover:bg-white/20 transition-all flex items-center gap-2"
                  >
                    <RotateCcw size={16} />
                    Show answer
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-4 gap-2 w-full"
                  >
                    {[
                      { label: 'Again', quality: 1, cls: 'bg-red-500 hover:bg-red-400' },
                      { label: 'Hard', quality: 3, cls: 'bg-amber-500 hover:bg-amber-400' },
                      { label: 'Good', quality: 4, cls: 'bg-emerald-500 hover:bg-emerald-400' },
                      { label: 'Easy', quality: 5, cls: 'bg-blue-500 hover:bg-blue-400' },
                    ].map(b => (
                      <button
                        key={b.label}
                        onClick={() => gradeReview(b.quality)}
                        className={`py-3 min-h-[44px] rounded-xl font-bold text-sm text-white transition-all ${b.cls}`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Progress Screen Modal */}
      <AnimatePresence>
        {showProgressModal && (
          <div className="fixed inset-0 z-[100] bg-[#fafaf8] overflow-y-auto">
            {(() => {
              // ---- Compute all data for the screen ----
              const dayKey = (d: Date) => {
                const y = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${y}-${mm}-${dd}`;
              };
              const snaps = getSnapshots(60);
              const byDate: Record<string, FluencySnapshot> = {};
              snaps.forEach((s) => { byDate[s.date] = s; });
              const series: { date: string; value: number }[] = [];
              for (let i = 13; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = dayKey(d);
                series.push({ date: key, value: byDate[key]?.wordsSpoken || 0 });
              }
              const last7 = series.slice(-7).map((p) => byDate[p.date]).filter(Boolean) as FluencySnapshot[];
              const weekWords = last7.reduce((a, s) => a + s.wordsSpoken, 0);
              const weekTurns = last7.reduce((a, s) => a + s.turnsSpoken, 0);
              const avgTurn = weekTurns ? Math.round(weekWords / weekTurns) : 0;
              const weekVera = last7.reduce((a, s) => a + s.veraWords, 0);
              const ratio = weekWords + weekVera > 0 ? Math.round((weekWords / (weekWords + weekVera)) * 100) : 0;
              const trend = getTrend();

              // SVG chart geometry
              const W = 600, H = 140, PAD = 8;
              const maxV = Math.max(1, ...series.map((p) => p.value));
              const pts = series.map((p, i) => {
                const x = PAD + (i / (series.length - 1)) * (W - 2 * PAD);
                const y = H - PAD - (p.value / maxV) * (H - 2 * PAD);
                return { x, y, ...p };
              });
              const linePts = pts.map((p) => `${p.x},${p.y}`).join(' ');
              const areaPts = `${PAD},${H - PAD} ${linePts} ${W - PAD},${H - PAD}`;

              // Errors
              const profile = getErrorProfile();
              const activeErrors = profile.filter((p) => p.status !== 'resolved').sort((a, b) => b.occurrences - a.occurrences);
              const resolvedErrors = profile.filter((p) => p.status === 'resolved').sort((a, b) => b.occurrences - a.occurrences);
              const typeColors: Record<string, string> = {
                grammar: 'bg-blue-100 text-blue-700',
                vocabulary: 'bg-emerald-100 text-emerald-700',
                calque: 'bg-red-100 text-red-700',
                pronunciation: 'bg-purple-100 text-purple-700',
                structure: 'bg-amber-100 text-amber-700',
                concept: 'bg-teal-100 text-teal-700',
              };
              const statusColors: Record<string, string> = {
                active: 'bg-red-100 text-red-600',
                improving: 'bg-amber-100 text-amber-600',
                resolved: 'bg-emerald-100 text-emerald-600',
              };

              // Knowledge
              const cards = getFlashcards();
              const catAgg: Record<string, { total: number; mastered: number }> = {};
              let chunks = 0, terms = 0;
              cards.forEach((c) => {
                catAgg[c.category] = catAgg[c.category] || { total: 0, mastered: 0 };
                catAgg[c.category].total += 1;
                if (c.mastered || c.interval > 21) catAgg[c.category].mastered += 1;
                if (c.cardType === 'chunk') chunks += 1;
                else if (c.cardType === 'term') terms += 1;
              });
              const cats = Object.entries(catAgg).sort((a, b) => b[1].total - a[1].total);

              const ErrorRow = ({ p, active }: { p: ErrorPattern; active: boolean }) => (
                <div className="bg-white border border-zinc-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${typeColors[p.type] || 'bg-zinc-100 text-zinc-600'}`}>{p.type}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${statusColors[p.status]}`}>{p.status}</span>
                        <span className="text-[10px] font-bold text-zinc-400">{p.occurrences}×</span>
                      </div>
                      <div className="text-sm font-semibold text-zinc-800">{p.description}</div>
                      {(p.example || p.correction) && (
                        <div className="text-[11px] text-zinc-500 mt-1">
                          <span className="line-through decoration-red-300">{p.example}</span>
                          {p.correction && <span className="text-emerald-600 font-medium"> → {p.correction}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  {active && (
                    <button
                      onClick={() => { setShowProgressModal(false); handleSend(undefined, `/english Let's drill this specific mistake: ${p.description}`); }}
                      className="mt-3 px-3 py-2 min-h-[40px] rounded-xl text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-all"
                    >
                      Practicar este error
                    </button>
                  )}
                </div>
              );

              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  className="max-w-4xl mx-auto px-4 md:px-8 py-10"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-zinc-900 text-white rounded-xl"><BarChart3 size={22} /></div>
                      <h2 className="text-3xl md:text-4xl font-black tracking-tighter">My Progress</h2>
                    </div>
                    <button
                      onClick={() => setShowProgressModal(false)}
                      className="w-11 h-11 flex items-center justify-center bg-white border border-zinc-200 rounded-full hover:bg-zinc-50 transition-all shadow-sm"
                    >
                      <X size={22} />
                    </button>
                  </div>

                  {/* BLOCK 1 — Fluency */}
                  <section className="mb-12">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4">Fluency</h3>
                    <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Words spoken · last 14 days</div>
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" preserveAspectRatio="none">
                        <polygon points={areaPts} fill="rgba(99,102,241,0.10)" />
                        <polyline points={linePts} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        {pts.map((p, i) => (
                          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#6366f1" />
                        ))}
                      </svg>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                        <div className="bg-zinc-50 rounded-2xl p-4">
                          <div className="text-3xl font-black tracking-tighter text-zinc-900">{weekWords}</div>
                          <div className="text-[11px] text-zinc-500 font-medium mb-1">words this week</div>
                          <TrendPill value={trend.wordsChange} />
                        </div>
                        <div className="bg-zinc-50 rounded-2xl p-4">
                          <div className="text-3xl font-black tracking-tighter text-zinc-900">{avgTurn}</div>
                          <div className="text-[11px] text-zinc-500 font-medium mb-1">avg words / turn</div>
                          <TrendPill value={trend.turnLengthChange} />
                        </div>
                        <div className="bg-zinc-50 rounded-2xl p-4">
                          <div className="text-3xl font-black tracking-tighter text-zinc-900">{ratio}%</div>
                          <div className="text-[11px] text-zinc-500 font-medium mb-1">you vs Vera</div>
                          <TrendPill value={trend.ratioChange} />
                        </div>
                      </div>

                      {ratio > 0 && ratio < 40 && (
                        <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm font-medium">
                          <Info size={16} />
                          Vera habla más que tú. Intenta responder con frases más largas.
                        </div>
                      )}
                    </div>
                  </section>

                  {/* BLOCK 2 — Recurring errors */}
                  <section className="mb-12">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4">Tus errores recurrentes</h3>
                    {activeErrors.length === 0 ? (
                      <div className="text-sm text-zinc-500">Aún no hay errores registrados. Vera los irá detectando a medida que practiquéis.</div>
                    ) : (
                      <div className="space-y-3">
                        {activeErrors.map((p) => <ErrorRow key={p.id} p={p} active />)}
                      </div>
                    )}

                    {resolvedErrors.length > 0 && (
                      <details className="mt-4 group">
                        <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                          <ChevronRight size={14} className="group-open:rotate-90 transition-transform" />
                          Superados ({resolvedErrors.length})
                        </summary>
                        <div className="space-y-3 mt-3">
                          {resolvedErrors.map((p) => <ErrorRow key={p.id} p={p} active={false} />)}
                        </div>
                      </details>
                    )}
                  </section>

                  {/* BLOCK 3 — Knowledge */}
                  <section className="mb-8">
                    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4">Conocimiento</h3>
                    <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
                      <div className="flex items-center gap-6 mb-6">
                        <div>
                          <div className="text-2xl font-black tracking-tighter text-blue-600">{chunks}</div>
                          <div className="text-[11px] text-zinc-500 font-medium">chunks learned</div>
                        </div>
                        <div className="text-zinc-300 font-black text-xl">vs</div>
                        <div>
                          <div className="text-2xl font-black tracking-tighter text-zinc-700">{terms}</div>
                          <div className="text-[11px] text-zinc-500 font-medium">single terms</div>
                        </div>
                      </div>
                      {cats.length === 0 ? (
                        <div className="text-sm text-zinc-500">Aún no hay cartas. Vera las creará mientras enseña.</div>
                      ) : (
                        <div className="space-y-3">
                          {cats.map(([cat, agg]) => (
                            <div key={cat} className="space-y-1">
                              <div className="flex justify-between text-[11px] font-bold uppercase tracking-tighter text-zinc-500">
                                <span>{cat}</span>
                                <span>{agg.mastered} / {agg.total} mastered</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${agg.total ? (agg.mastered / agg.total) * 100 : 0}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </motion.div>
              );
            })()}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
