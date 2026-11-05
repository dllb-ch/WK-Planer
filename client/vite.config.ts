import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Browser demo (`vite build --mode demo`, GitHub Pages): the server runs in the page; Node modules it imports are
// replaced by small browser versions (src/demo/shims).
const DEMO_ALIASES = [
  { find: /^express$/, replacement: here('./src/demo/express.ts') },
  { find: /^cookie-parser$/, replacement: here('./src/demo/shims/cookie-parser.ts') },
  { find: /^(node:)?crypto$/, replacement: here('./src/demo/shims/crypto.ts') },
  { find: /^(node:)?async_hooks$/, replacement: here('./src/demo/shims/async_hooks.ts') },
  { find: /^(node:)?fs$/, replacement: here('./src/demo/shims/fs.ts') },
  { find: /^(node:)?path$/, replacement: here('./src/demo/shims/path.ts') },
  { find: /^(node:)?url$/, replacement: here('./src/demo/shims/url.ts') },
  { find: /^(node:)?module$/, replacement: here('./src/demo/shims/empty.ts') },
  { find: /^pg$/, replacement: here('./src/demo/shims/pg.ts') },
  { find: /^virtual:pwa-register$/, replacement: here('./src/demo/shims/pwa-register.ts') },
];

/** GitHub Pages answers unknown paths with 404.html: the app itself, so deep links work. */
const spaFallback = (): Plugin => ({
  name: 'spa-404',
  apply: 'build',
  writeBundle: (opts) => copyFileSync(join(opts.dir!, 'index.html'), join(opts.dir!, '404.html')),
});

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
  base: demo ? (process.env.DEMO_BASE ?? '/WK-Planer/') : '/',
  plugins: [
    react(),
    demo ? spaFallback() : VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'WK-Planer Zivilschutz',
        short_name: 'WK-Planer',
        description: 'Planung von Wiederholungskursen im Zivilschutz',
        lang: 'de-CH',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#1e3a8a',
        background_color: '#f1f5f9',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Data the user has loaded (WK, Zugansicht, documents, Vorbereitung) stays readable offline.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/') && (!url.pathname.startsWith('/api/auth/') || url.pathname === '/api/auth/me'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'wmts.geo.admin.ch',
            handler: 'CacheFirst',
            options: {
              cacheName: 'swisstopo-tiles',
              expiration: { maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: '@shared', replacement: here('../shared') },
      ...(demo ? DEMO_ALIASES : [{ find: /^\.\/demo\/entry$/, replacement: here('./src/demo/entry.off.ts') }]),
    ],
  },
  // PGlite loads its WebAssembly and data files itself.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: demo ? { outDir: 'dist-demo', target: 'es2022', chunkSizeWarningLimit: 4000 } : {},
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:3001' },
  },
  };
});
