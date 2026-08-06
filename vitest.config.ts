import { defineConfig } from 'vitest/config';

// Minimal, standalone test config (no PWA/react plugins needed): the voice-language
// helpers under test are pure functions that run in a plain Node environment.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
