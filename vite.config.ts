import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  base: '/tortur/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.name),
  },
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
      },
      includeAssets: ['favicon.ico', 'icon.svg'],
      manifest: {
        name: 'TorTur tur-app',
        short_name: 'TorTur',
        description: 'En app for å sjekke inn på tidligere postkassetrimmens turposter',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern:
              /https:\/\/(?:[abc]\.tile\.openstreetmap\.org|cache\.kartverket\.no|[abc]\.tile-cyclosm\.openstreetmap\.fr|[abc]\.tile\.opentopomap\.org|server\.arcgisonline\.com|mt[0-3]\.google\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dager
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/data\/hierarchy\.json/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'turposter-hierarchy-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24, // 1 dag
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /\/data\/.*\.json/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'turposter-data-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dager
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
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
    proxy: {
      '/tortur/api/bw-token': {
        target: 'https://id.barentswatch.no',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tortur\/api\/bw-token/, '/connect/token'),
      },
      '/tortur/api/bw-ais': {
        target: 'https://live.ais.barentswatch.no',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tortur\/api\/bw-ais/, ''),
      },
    },
  },
})
