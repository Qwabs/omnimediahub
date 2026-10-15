import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Cross-origin isolation headers.
 *
 * Required for SharedArrayBuffer, which powers the multithreaded
 * WebAssembly engines (ffmpeg.wasm core-mt, threaded codecs). Kept in one
 * place so dev, preview and the deployed `_headers` file stay in sync.
 */
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      /*
       * Offline strategy:
       *  - the app shell (JS/CSS/fonts/icons) is precached, so the toolbox
       *    boots with no network;
       *  - navigations are NetworkFirst: online you always get the
       *    prerendered page straight from the host, offline the last visit
       *    (or the shell) is served from cache;
       *  - engines and models — hundreds of megabytes — are never
       *    precached; they cache on first use via CacheFirst.
       */
      workbox: {
        globPatterns: ['**/*.{html,js,css,svg,woff2}'],
        globIgnores: ['**/models/**', '**/wasm/**', '**/ffmpeg/**'],
        navigateFallback: '/index.html',
        // `_`-prefixed paths are internal (the browser test probes live
        // there) and must be served as files, never as the app shell.
        navigateFallbackDenylist: [/^\/_/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'omh-pages',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // WASM engines: libvips, ffmpeg core, ONNX runtime.
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/wasm/') ||
              url.pathname.startsWith('/ffmpeg/') ||
              url.pathname.startsWith('/models/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'omh-engines',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Oversized engine binaries pinned to jsDelivr: the ffmpeg core
            // wasm and the ONNX runtime builds — see src/engine/vendor.ts.
            urlPattern: ({ url }) =>
              url.origin === 'https://cdn.jsdelivr.net' &&
              (url.pathname.startsWith('/npm/@ffmpeg/core@') ||
                url.pathname.startsWith('/npm/onnxruntime-web@')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'omh-engines',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/fonts/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'omh-fonts',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'OmniMediaHub — private media toolbox',
        short_name: 'OmniMediaHub',
        description:
          'Batch image, GIF, video and audio tools that run entirely in your browser. No uploads, no signup, free forever.',
        theme_color: '#fdfcfc',
        background_color: '#fdfcfc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    headers: crossOriginIsolation,
  },
  preview: {
    headers: crossOriginIsolation,
  },
})
