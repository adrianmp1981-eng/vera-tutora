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
  Code2
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
  generateSimulationContext
} from './services/geminiService';
import { getMemory, saveMemory, updateMemory, hasMemory } from './services/memoryService';
import { WeeklyStats } from './types';

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

  const [studyPlan, setStudyPlan] = useState<string | null>(() => {
    return localStorage.getItem('vera_study_plan');
  });
  const [planStep, setPlanStep] = useState(0);
  const [planAnswers, setPlanAnswers] = useState<string[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);

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
    // Initial greeting for returning users
    if (hasMemory() && messages.length === 0) {
      const mem = getMemory();
      if (mem) {
        const lastSeenDate = new Date(mem.lastSeen);
        const daysSince = Math.floor((Date.now() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24));
        
        let greeting = `Welcome back, ${mem.name}! Ready to continue our journey?`;
        if (daysSince > 3) {
          greeting = `Hey ${mem.name}, it's been a few days! Let's get back on track. What are we working on today?`;
        }
        
        const initialMsg: Message = {
          id: 'welcome-back',
          role: 'model',
          text: greeting,
          timestamp: Date.now(),
        };
        setMessages([initialMsg]);
        setIsWelcomeScreen(false);
        
        // Increment sessions
        updateMemory({ 
          totalSessions: (mem.totalSessions || 0) + 1,
          lastSeen: new Date().toISOString()
        });
        setMemory(getMemory());
      }
    }
  }, []);

  const handleNewSession = () => {
    setMessages([]);
    setMode('general');
    setIsWelcomeScreen(true);
    setError(null);
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
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

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

  const getVoice = (lang: string): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    
    if (lang === 'en-US') {
      // Try these specific American voices in order of preference
      const preferred = [
        'Microsoft Aria Online (Natural) - English (United States)',
        'Microsoft Jenny Online (Natural) - English (United States)', 
        'Microsoft Guy Online (Natural) - English (United States)',
        'Google US English',
        'Samantha',
        'Karen',
        'Victoria',
      ];
      for (const name of preferred) {
        const v = voices.find(v => v.name === name);
        if (v) return v;
      }
      // Fallback: any en-US voice that is NOT from a Russian/Eastern European locale
      return voices.find(v => 
        v.lang === 'en-US' && 
        !v.name.includes('Russian') && 
        !v.name.includes('Pavel') &&
        !v.name.includes('Irina') &&
        !v.name.includes('ru-')
      ) || voices.find(v => v.lang === 'en-US') || null;
    }
    
    if (lang === 'pt-PT') {
      return voices.find(v => v.lang === 'pt-PT') || 
             voices.find(v => v.lang.startsWith('pt')) || null;
    }
    
    if (lang === 'es-ES') {
      return voices.find(v => v.lang === 'es-ES') || 
             voices.find(v => v.lang.startsWith('es')) || null;
    }
    
    return null;
  };

  const speakText = async (text: string) => {
    if (!voiceEnabled) return;
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    await new Promise(resolve => {
      if (window.speechSynthesis.getVoices().length > 0) {
        resolve(null);
      } else {
        window.speechSynthesis.onvoiceschanged = () => resolve(null);
      }
    });

    // Clean markdown from text
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/`.*?`/g, '')
      .replace(/\[VISUAL_START\][\s\S]*?\[VISUAL_END\]/g, '')
      .substring(0, 500); // limit to 500 chars to avoid very long speech

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Set language based on current mode
    if (mode === 'portuguese') {
      utterance.lang = 'pt-PT';
    } else if (['english', 'sports', 'business', 'coding', 'logistics'].includes(mode)) {
      utterance.lang = 'en-US';
    } else {
      utterance.lang = 'es-ES';
    }

    const selectedVoice = getVoice(utterance.lang);
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    utterance.volume = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Hands-free call mode: after Vera finishes, listen again automatically
      if (callModeRef.current) {
        setTimeout(() => startListening(), 500);
      }
    };
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
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
      
      // Language auto-detection based on mode
      let lang = 'en-US';
      if (mode === 'portuguese') lang = 'pt-PT';
      else if (['general', 'learn', 'quiz', 'plan'].includes(mode)) lang = 'es-ES';
      
      recognition.lang = lang;
      
      recognition.onstart = () => {
        setIsListening(true);
        stopSpeaking();
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput(transcript);
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

  const handleSend = async (e?: React.FormEvent, overrideInput?: string) => {
    e?.preventDefault();
    const messageText = overrideInput || input;
    if (!messageText.trim() || isLoading) return;

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
    else if (messageText.startsWith('/simulate')) {
      setShowSimulationPicker(true);
      setIsLoading(false);
      setInput('');
      return;
    }
    
    if (detectedMode !== mode) setMode(detectedMode);
    updateProgress(detectedMode);

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
      speakText(veraResponse.text);
      setIsLoading(false);
      setInput('');
      return;
    }

    if (mode === 'simulation' && (messageText.toLowerCase().startsWith('/end') || messageText.toLowerCase().startsWith('/stop'))) {
      const prevMode = localStorage.getItem(STORAGE_KEYS.MODE) as Mode || 'general';
      setMode(prevMode);
      setActiveSimulation(null);
      
      try {
        const response = await sendMessageToVera([...messages, userMessage], 'simulation', activeSimulation || undefined);
        const veraResponse: Message = {
          id: generateId(),
          role: 'model',
          text: response,
          timestamp: Date.now(),
        };
        setMessages(prev => [...prev, veraResponse]);
        speakText(veraResponse.text);
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
        speakText(veraResponse.text);
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
      speakText(correctionMsg.text);
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
        speakText(veraResponse.text);
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
      let responseText = await sendMessageToVera(finalHistory, detectedMode, activeSimulation || undefined);
      
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

      const veraResponse: Message = {
        id: generateId(),
        role: 'model',
        text: responseText,
        visualContent: visualContent,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, veraResponse]);
      speakText(veraResponse.text);

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
      speakText(veraResponse.text);
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
    speakText(initialMsg.text);
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
      {/* Sidebar */}
      <aside 
        className="w-[260px] h-screen bg-[#1a1a2e] text-white flex flex-col shrink-0 z-20 shadow-2xl border-r border-[#ffffff10] overflow-y-auto pb-6"
        style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}
      >
        <div className="p-8 flex flex-col items-center text-center">
          {/* Live video panel */}
          <div
            className={`relative mb-4 overflow-hidden bg-zinc-900 transition-all duration-300 ${isSpeaking ? 'vera-ring-pulse' : ''}`}
            style={{ width: 200, height: 260, borderRadius: 16 }}
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

          {/* Live status indicator */}
          <div className="flex items-center gap-2 mb-6">
            {(() => {
              const status = isListening
                ? { color: 'bg-emerald-500', pulse: true, label: 'Listening...' }
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
                  <span className="text-[12px] font-medium text-zinc-300">{status.label}</span>
                </>
              );
            })()}
          </div>

          {/* Call mode button */}
          <div className="w-full px-2 mb-6">
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
              className="w-full flex items-center justify-center gap-3 px-4 py-[12px] text-white rounded-[14px] transition-all text-[13px] font-semibold hover:scale-[1.02] hover:brightness-110"
              style={callMode
                ? { background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 4px 15px rgba(239,68,68,0.4)' }
                : { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 15px rgba(99,102,241,0.4)' }
              }
            >
              {callMode ? <MicOff size={18} /> : <Mic size={18} />}
              {callMode ? 'End call' : 'Start call'}
            </button>
          </div>

          <h1 className="text-xl font-black tracking-tighter mb-1">VERA</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-zinc-500 mb-6">Personal Tutor</p>

          <ModeBadge currentMode={mode} className="mb-8" />

          <div className="w-full space-y-4 px-2">
            <ProgressBar label="English" value={progress.english} color="bg-blue-500" />
            <ProgressBar label="Habits" value={progress.habits} color="bg-amber-500" />
            <ProgressBar label="Culture" value={progress.culture} color="bg-emerald-500" />
            <ProgressBar label="Sports" value={progress.sports} color="bg-orange-500" />
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
        </div>

        <div className="mt-auto p-6 space-y-2">
          <button 
            onClick={handleNewSession}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#ffffff30] hover:bg-[#ffffff10] text-white transition-all text-sm font-medium"
          >
            <PlusCircle size={18} />
            New Session
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col relative">
        <header className="h-20 border-b border-zinc-200/50 flex items-center px-8 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex-1 flex items-center">
            <h2 className="font-bold text-sm uppercase tracking-widest text-zinc-400">
              {isWelcomeScreen ? "Welcome" : mode}
            </h2>
          </div>
          
          <div className="flex items-center gap-1">
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
                className={`group relative w-16 h-14 flex flex-col items-center justify-center rounded-xl transition-all duration-300 ${
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
            
            <div className="relative ml-1" ref={headerDropdownRef}>
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
          <div className="flex-1"></div>
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
                    src="/vera-intro.mp4" 
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
                <div className="p-8 bg-gradient-to-t from-[#fafaf8] via-[#fafaf8] to-transparent">
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
    </div>
  );
}
