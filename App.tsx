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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Message, Mode, SessionLog } from './types';
import { sendMessageToVera, getSummary, generateVeraPortrait, generateVeraVideo, generateVeraAudio, clearVeraPortraitCache } from './services/geminiService';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'model',
      text: "Hey, I'm Vera. I'm your personal tutor. We can work on English, productivity, history, or AI in sports. Just tell me what you want to focus on today and we'll get started.",
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('general');
  const [progress, setProgress] = useState<SessionLog[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [veraPortrait, setVeraPortrait] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPortraitLoading, setIsPortraitLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const checkKey = async () => {
    const selected = await window.aistudio.hasSelectedApiKey();
    setHasKey(selected);
    if (selected && !veraPortrait) {
      setIsPortraitLoading(true);
      try {
        const portrait = await generateVeraPortrait();
        setVeraPortrait(portrait);
      } finally {
        setIsPortraitLoading(false);
      }
    }
  };

  useEffect(() => {
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    await window.aistudio.openSelectKey();
    setHasKey(true); // Assume success as per guidelines
    setIsPortraitLoading(true);
    try {
      const portrait = await generateVeraPortrait();
      setVeraPortrait(portrait);
    } finally {
      setIsPortraitLoading(false);
    }
  };

  const handleRegeneratePortrait = async () => {
    clearVeraPortraitCache();
    setVeraPortrait(null);
    setIsPortraitLoading(true);
    try {
      const portrait = await generateVeraPortrait();
      setVeraPortrait(portrait);
    } finally {
      setIsPortraitLoading(false);
    }
  };

  const handleGenerateIntro = async () => {
    const selected = await window.aistudio.hasSelectedApiKey();
    if (!selected) {
      await window.aistudio.openSelectKey();
      // After opening, we try to proceed
    }

    if (!veraPortrait) {
      setIsPortraitLoading(true);
      try {
        const portrait = await generateVeraPortrait();
        setVeraPortrait(portrait);
      } finally {
        setIsPortraitLoading(false);
      }
    }
    
    if (!veraPortrait || isVideoLoading) return;
    
    setIsVideoLoading(true);
    const text = "Hey, I'm Vera. I'm your personal tutor. We can work on English, productivity, history, or AI in sports. Just tell me what you want to focus on today and we'll get started.";
    
    try {
      const [videoUrl, audioUrl] = await Promise.all([
        generateVeraVideo(veraPortrait, "Vera is speaking directly to the camera with a warm smile, introducing herself as a tutor."),
        generateVeraAudio(text)
      ]);

      if (videoUrl) {
        const videoMessage: Message = {
          id: Date.now().toString(),
          role: 'model',
          text: text,
          timestamp: Date.now(),
          videoUrl: videoUrl,
          audioUrl: audioUrl || undefined
        };
        setMessages(prev => [...prev, videoMessage]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsVideoLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Detect mode from input
    if (input.startsWith('/english')) setMode('english');
    else if (input.startsWith('/habits')) setMode('habits');
    else if (input.startsWith('/learn')) setMode('learn');
    else if (input.startsWith('/quiz')) setMode('quiz');
    else if (input.startsWith('/sports')) setMode('sports');
    else if (input.startsWith('/summary')) {
      const summary = await getSummary(newMessages);
      const veraResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: summary,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, veraResponse]);
      
      // Add to progress log
      const newLog: SessionLog = {
        topic: mode === 'general' ? 'Sesión General' : mode,
        date: new Date().toLocaleDateString(),
        summary: summary.substring(0, 100) + '...'
      };
      setProgress(prev => [newLog, ...prev]);
      setIsLoading(false);
      return;
    }

    try {
      const responseText = await sendMessageToVera(newMessages, mode);
      const veraResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, veraResponse]);
    } catch (error: any) {
      setError(error.message || "An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const ModeBadge = ({ currentMode }: { currentMode: Mode }) => {
    const config = {
      general: { label: 'General', icon: MessageSquare, color: 'bg-zinc-100 text-zinc-700' },
      english: { label: 'Inglés', icon: BookOpen, color: 'bg-blue-100 text-blue-700' },
      habits: { label: 'Hábitos', icon: Zap, color: 'bg-amber-100 text-amber-700' },
      learn: { label: 'Aprendizaje', icon: History, color: 'bg-emerald-100 text-emerald-700' },
      quiz: { label: 'Quiz', icon: CheckCircle2, color: 'bg-purple-100 text-purple-700' },
      sports: { label: 'IA Deportes', icon: Dumbbell, color: 'bg-orange-100 text-orange-700' },
    };

    const { label, icon: Icon, color } = config[currentMode];

    return (
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
        <Icon size={12} />
        {label}
      </div>
    );
  };

  if (hasKey === false && (isVideoLoading || !veraPortrait)) {
    // We only block if they are trying to generate something that REQUIRES the key
    // and they haven't selected one yet. But let's make it even smoother:
    // We won't block the whole app anymore.
  }

  return (
    <div className="flex h-screen bg-[#F5F5F5] text-zinc-900 font-sans overflow-hidden">
      {/* Sidebar - Progress Log */}
      <AnimatePresence>
        {showLog && (
          <motion.aside 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="w-80 bg-white border-r border-zinc-200 flex flex-col shadow-xl z-20"
          >
            <div className="p-6 border-bottom border-zinc-100 flex justify-between items-center">
              <h2 className="font-semibold text-lg flex items-center gap-2">
                <History size={18} className="text-zinc-400" />
                Registro
              </h2>
              <button onClick={() => setShowLog(false)} className="text-zinc-400 hover:text-zinc-600">
                <LogOut size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {progress.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center mt-10 italic">No hay registros todavía.</p>
              ) : (
                progress.map((log, i) => (
                  <div key={i} className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 hover:border-zinc-300 transition-colors cursor-default">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{log.topic}</span>
                      <span className="text-[10px] text-zinc-400">{log.date}</span>
                    </div>
                    <p className="text-sm text-zinc-600 line-clamp-2">{log.summary}</p>
                  </div>
                ))
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            {!showLog && (
              <button 
                onClick={() => setShowLog(true)}
                className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 transition-colors"
              >
                <History size={20} />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 overflow-hidden border border-zinc-200 flex items-center justify-center relative group">
                {isPortraitLoading ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Zap size={20} className="text-zinc-400" />
                  </motion.div>
                ) : veraPortrait ? (
                  <>
                    <img src={veraPortrait} alt="Vera" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button 
                      onClick={handleRegeneratePortrait}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                      title="Regenerar retrato"
                    >
                      <Zap size={16} />
                    </button>
                  </>
                ) : (
                  <User size={20} className="text-zinc-400" />
                )}
              </div>
              <div className="flex flex-col">
                <h1 className="font-bold text-sm tracking-tight flex items-center gap-2">
                  VERA
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </h1>
                <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-zinc-400">Tutora Personal</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSelectKey}
              className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors"
              title="Configurar API Key"
            >
              <Key size={18} />
            </button>
            {veraPortrait && (
              <button 
                onClick={handleGenerateIntro}
                disabled={isVideoLoading}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-bold hover:bg-zinc-800 transition-all disabled:opacity-50"
              >
                {isVideoLoading ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Zap size={14} />
                  </motion.div>
                ) : <Zap size={14} />}
                {isVideoLoading ? 'Generando...' : 'Video Intro'}
              </button>
            )}
            <ModeBadge currentMode={mode} />
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
          <div className="max-w-3xl mx-auto space-y-8">
            {messages.map((msg) => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center overflow-hidden ${msg.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-white border border-zinc-200'}`}>
                    {msg.role === 'user' ? (
                      <User size={14} />
                    ) : (
                      veraPortrait ? (
                        <img src={veraPortrait} alt="Vera" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <User size={14} className="text-zinc-400" />
                      )
                    )}
                  </div>
                  <div>
                    <div className={`
                      p-4 rounded-2xl text-sm leading-relaxed shadow-sm
                      ${msg.role === 'user' 
                        ? 'bg-zinc-900 text-white rounded-tr-none' 
                        : 'bg-white text-zinc-800 border border-zinc-200 rounded-tl-none'}
                    `}>
                      {msg.videoUrl && (
                        <div className="mb-4 rounded-xl overflow-hidden border border-zinc-100 bg-black aspect-square flex items-center justify-center">
                          <video 
                            src={msg.videoUrl} 
                            controls 
                            autoPlay 
                            className="w-full h-full object-cover"
                          />
                          {msg.audioUrl && <audio src={msg.audioUrl} autoPlay className="hidden" />}
                        </div>
                      )}
                      {msg.text.split('\n').map((line, i) => (
                        <p key={i} className={i > 0 ? 'mt-2' : ''}>{line}</p>
                      ))}
                    </div>
                    <div className={`mt-1.5 flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-wider ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'user' ? 'Tú' : 'Vera'}
                      <span>•</span>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center overflow-hidden">
                    {veraPortrait ? (
                      <img src={veraPortrait} alt="Vera" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <User size={14} className="text-zinc-400" />
                    )}
                  </div>
                  <div className="bg-white border border-zinc-200 p-4 rounded-2xl rounded-tl-none shadow-sm">
                    <div className="flex gap-1">
                      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                      <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 bg-gradient-to-t from-[#F5F5F5] via-[#F5F5F5] to-transparent">
          <div className="max-w-3xl mx-auto">
            {/* Error Banner */}
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
              className="relative group"
            >
              <div className="absolute -top-10 left-0 flex gap-2 overflow-x-auto pb-2 no-scrollbar max-w-full">
                {['/english', '/habits', '/learn', '/quiz', '/sports', '/summary'].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => setInput(cmd + ' ')}
                    className="px-3 py-1 bg-white border border-zinc-200 rounded-md text-[10px] font-bold text-zinc-500 hover:border-zinc-900 hover:text-zinc-900 transition-all whitespace-nowrap"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Escribe un comando o mensaje..."
                className="w-full bg-white border border-zinc-200 rounded-2xl px-5 py-4 pr-14 text-sm focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all shadow-sm"
              />
              <button 
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send size={18} />
              </button>
            </form>
            <div className="mt-4 flex items-center justify-center gap-6 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              <span className="flex items-center gap-1.5"><Terminal size={12} /> Comandos Disponibles</span>
              <span className="flex items-center gap-1.5"><Dumbbell size={12} /> Práctica Diaria</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
