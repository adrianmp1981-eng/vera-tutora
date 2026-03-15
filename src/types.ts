export type Mode = 'general' | 'english' | 'habits' | 'learn' | 'quiz' | 'sports';

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  videoUrl?: string;
  audioUrl?: string;
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
