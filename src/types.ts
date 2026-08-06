export type Mode = 'general' | 'english' | 'habits' | 'learn' | 'quiz' | 'sports' | 'plan' | 'business' | 'coding' | 'logistics' | 'portuguese' | 'simulation' | 'daily' | 'explain' | 'case' | 'shadow' | 'curriculum' | 'assess';

export interface Simulation {
  id: string;
  title: string;
  description: string;
  category: 'english' | 'logistics' | 'football' | 'business' | 'portuguese';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  veraRole: string;
  userRole: string;
  context: string;
  objectives: string[];
  language: 'english' | 'spanish' | 'portuguese';
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  videoUrl?: string;
  audioUrl?: string;
  visualContent?: string;
  type?: 'correction';
  correctionData?: {
    original: string;
    corrected: string;
    explanation: string;
  };
}

export interface SessionLog {
  topic: string;
  date: string;
  summary: string;
}

export interface AppState {
  messages: Message[];
  currentMode: Mode;
  progressLog: SessionLog[];
}

export interface WeeklyStats {
  messagesPerMode: Record<string, number>;
  totalMessages: number;
  weekStart: string;
  weekEnd: string;
  errorsCorrected: number;
}

export interface UserMemory {
  name: string;
  level: {
    english: 'beginner' | 'intermediate' | 'advanced';
    habits: 'beginner' | 'intermediate' | 'advanced';
    culture: 'beginner' | 'intermediate' | 'advanced';
    sports: 'beginner' | 'intermediate' | 'advanced';
  };
  goals: string[];
  weaknesses: string[];
  strengths: string[];
  preferences: {
    learningStyle: 'visual' | 'practical' | 'theoretical';
    sessionLength: 'short' | 'medium' | 'long';
    language: 'spanish' | 'english' | 'both';
  };
  totalSessions: number;
  lastSeen: string;
  notes: string[];
}
