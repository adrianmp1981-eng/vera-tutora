import { describe, it, expect } from 'vitest';
import { backoffMs, chatModelForAttempt } from './geminiService';

// La lógica de "¿cuánto espero antes del reintento N?" es pura y sin estado, así
// que se prueba de forma aislada (sin red ni SDK). El resto del reintento —
// contar intentos, respetar la AbortSignal, disparar el fetch — depende de red/
// timers y no se testea aquí: no habría forma honesta de hacerlo puro.
describe('backoffMs', () => {
  it('crece exponencialmente: 1s, 2s, 4s para los intentos 1, 2, 3', () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(2)).toBe(2000);
    expect(backoffMs(3)).toBe(4000);
  });

  it('duplica la espera en cada intento (2^(n-1) segundos)', () => {
    for (let n = 1; n <= 3; n++) {
      expect(backoffMs(n)).toBe(1000 * 2 ** (n - 1));
    }
  });
});

// Qué modelo toca en cada intento del chat: el intento 0 usa el modelo primario;
// del 1 en adelante, el fallback. Pura y determinista (sin red), así que se fija
// aquí. El resto del fallback (cuándo se dispara, el aborto, el mensaje al
// usuario) depende de red/timers y no se testea de forma pura.
describe('chatModelForAttempt', () => {
  it('intento 0 → modelo primario gemini-3.5-flash', () => {
    expect(chatModelForAttempt(0)).toBe('gemini-3.5-flash');
  });

  it('intento 1 → modelo de fallback gemini-3.1-flash-lite', () => {
    expect(chatModelForAttempt(1)).toBe('gemini-3.1-flash-lite');
  });

  it('cualquier intento ≥1 sigue en el fallback (no hay tercer modelo)', () => {
    expect(chatModelForAttempt(2)).toBe('gemini-3.1-flash-lite');
    expect(chatModelForAttempt(5)).toBe('gemini-3.1-flash-lite');
  });
});
