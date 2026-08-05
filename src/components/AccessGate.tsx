/**
 * Access gate — a full-screen PIN lock shown before the app when no access
 * code is stored. Validates the code against /api/gemini (a minimal request
 * with the x-access-code header) and, on success, stores it and enters the app.
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';

const ACCESS_KEY = 'vera_access_code';

export default function AccessGate({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': code.trim(),
        },
        // Minimal generateContent just to validate the code.
        body: JSON.stringify({
          model: 'gemini-flash-lite-latest',
          contents: [{ parts: [{ text: 'ping' }] }],
        }),
      });

      if (res.status === 401) {
        setError('Código incorrecto.');
        setShake((s) => s + 1);
        setCode('');
        setLoading(false);
        return;
      }

      // Any non-401 response means the code was accepted by the gate.
      localStorage.setItem(ACCESS_KEY, code.trim());
      onSuccess();
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.');
      setShake((s) => s + 1);
      setLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-screen w-full px-6 text-white"
      style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}
    >
      <motion.div
        key={shake}
        animate={shake ? { x: [0, -10, 10, -8, 8, -4, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xs flex flex-col items-center text-center"
      >
        {/* Avatar */}
        <div
          className="overflow-hidden bg-zinc-900 mb-5 shrink-0"
          style={{ width: 120, height: 120, borderRadius: '50%' }}
        >
          <img
            src="/vera-avatar.jpg"
            alt="Vera"
            className="w-full h-full object-cover object-top"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>

        <h1 className="text-2xl font-black tracking-tighter leading-none">VERA</h1>
        <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 mt-1 mb-8">Personal Tutor</p>

        <form onSubmit={submit} className="w-full flex flex-col items-center gap-4">
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            aria-label="Código de acceso"
            className="w-full text-center bg-white/5 border border-white/15 rounded-2xl py-4 outline-none focus:border-indigo-400 transition-colors placeholder-zinc-600"
            style={{ fontSize: 32, letterSpacing: '0.4em', fontWeight: 800 }}
          />

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-sm font-medium"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading || code.length < 4}
            className="w-full py-3 min-h-[44px] rounded-[14px] text-white font-semibold text-sm transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 15px rgba(99,102,241,0.4)' }}
          >
            {loading ? 'Comprobando…' : 'Entrar'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
