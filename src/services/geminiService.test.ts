import { describe, it, expect } from 'vitest';
import { backoffMs } from './geminiService';

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
