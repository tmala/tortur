import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

import { readFileSync, existsSync, unlinkSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

function excludeApiSecretsPlugin() {
  return {
    name: 'exclude-api-secrets',
    closeBundle() {
      const forbidden = [
        './dist/api/service-account.json',
        './dist/api/config.php',
        './dist/api/config.example.php',
        './dist/api/service-account.example.json',
      ]
      for (const rel of forbidden) {
        try {
          const full = fileURLToPath(new URL(rel, import.meta.url))
          if (existsSync(full)) {
            unlinkSync(full)
          }
        } catch {
          // Ignorer hvis filen ikke finnes
        }
      }
    }
  }
}

function barentsWatchAisDevPlugin() {
  let cachedAisData: any[] | null = null
  let cachedAisTime = 0

  return {
    name: 'bw-ais-dev-filter',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/tortur/api/bw-ais/v1/latest/combined') && req.method === 'POST') {
          let bodyStr = ''
          req.on('data', (chunk: any) => {
            bodyStr += chunk
          })
          req.on('end', async () => {
            try {
              let bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null = null
              try {
                const parsed = JSON.parse(bodyStr)
                if (parsed.bounds) {
                  bounds = parsed.bounds
                } else if (parsed.coordinates && Array.isArray(parsed.coordinates[0])) {
                  const pts = parsed.coordinates[0]
                  bounds = {
                    minLng: Math.min(...pts.map((p: any) => p[0])),
                    maxLng: Math.max(...pts.map((p: any) => p[0])),
                    minLat: Math.min(...pts.map((p: any) => p[1])),
                    maxLat: Math.max(...pts.map((p: any) => p[1])),
                  }
                }
              } catch {
                // Ignorer JSON parsefeil
              }

              const authHeader = req.headers['authorization']
              if (!authHeader) {
                res.statusCode = 401
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Mangler Authorization header' }))
                return
              }

              const now = Date.now()
              const wasCached = !!cachedAisData && now - cachedAisTime <= 25000
              if (!wasCached) {
                const bwRes = await fetch('https://live.ais.barentswatch.no/v1/latest/combined', {
                  headers: {
                    Authorization: authHeader,
                    Accept: 'application/json',
                  },
                })
                if (!bwRes.ok) {
                  res.statusCode = bwRes.status
                  const errText = await bwRes.text()
                  res.setHeader('Content-Type', 'application/json')
                  res.end(errText)
                  return
                }
                cachedAisData = await bwRes.json()
                cachedAisTime = now
              }

              let filtered = cachedAisData || []
              if (bounds) {
                const b = bounds
                filtered = filtered.filter((ship: any) => {
                  return (
                    typeof ship.latitude === 'number' &&
                    typeof ship.longitude === 'number' &&
                    ship.latitude >= b.minLat &&
                    ship.latitude <= b.maxLat &&
                    ship.longitude >= b.minLng &&
                    ship.longitude <= b.maxLng
                  )
                })
              }

              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('X-AIS-Cache', wasCached ? 'HIT' : 'MISS')
              res.setHeader('X-AIS-Count', String(filtered.length))
              res.end(JSON.stringify(filtered))
            } catch (err: any) {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: err.message || 'Feil under proxying til BarentsWatch' }))
            }
          })
          return
        }
        next()
      })
    },
  }
}

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
    barentsWatchAisDevPlugin(),
    VitePWA({
      registerType: 'prompt',
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
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/tortur\/api/],
        runtimeCaching: [
          {
            urlPattern:
              /https:\/\/(?:[abc]\.tile\.openstreetmap\.org|cache\.kartverket\.no|[abc]\.tile-cyclosm\.openstreetmap\.fr|[abc]\.tile\.opentopomap\.org|server\.arcgisonline\.com|mt[0-3]\.google\.com|s3\.amazonaws\.com)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: {
                maxEntries: 1500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dager
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
    excludeApiSecretsPlugin(),
  ],
  build: {
    chunkSizeWarningLimit: 600,
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
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
      '/tortur/api': {
        target: 'https://trillebar.no',
        changeOrigin: true,
      },
    },
  },
})
