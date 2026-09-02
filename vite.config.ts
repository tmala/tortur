import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg'],
      manifest: {
        name: 'OpenStreetMap Kart',
        short_name: 'Kart',
        description: 'Interaktivt OpenStreetMap-kart med posisjonsvisning og PWA-støtte',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /https:\/\/(?:[abc]\.tile\.openstreetmap\.org|cache\.kartverket\.no|[abc]\.tile-cyclosm\.openstreetmap\.fr|[abc]\.tile\.opentopomap\.org|server\.arcgisonline\.com|mt[0-3]\.google\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 dager
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/data\/.*\.json/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'turposter-data-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 dager
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api/bw-token': {
        target: 'https://id.barentswatch.no',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bw-token/, '/connect/token')
      },
      '/api/bw-ais': {
        target: 'https://live.ais.barentswatch.no',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bw-ais/, '')
      }
    }
  }
})
