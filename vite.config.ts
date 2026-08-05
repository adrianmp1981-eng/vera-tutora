import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['vera-avatar.jpg', 'Vera_720p.mp4'],
        manifest: {
          name: 'Vera — Personal Tutor',
          short_name: 'Vera',
          description: 'Tu tutora personal de inglés, portugués, logística y más',
          start_url: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#1a1a2e',
          theme_color: '#6366f1',
          icons: [
            {src: '/vera-avatar.jpg', sizes: '512x512', type: 'image/jpeg', purpose: 'any'},
            {src: '/vera-avatar.jpg', sizes: '192x192', type: 'image/jpeg', purpose: 'any'},
          ],
        },
        workbox: {
          // Precache the static build assets.
          globPatterns: ['**/*.{js,css,html,jpg,mp4,woff2}'],
          // Large media (the intro video) needs a higher size limit to be precached.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              // NEVER cache Gemini API calls — always hit the network.
              urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
              method: 'GET',
            },
            {
              urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
              handler: 'NetworkOnly',
              method: 'POST',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
