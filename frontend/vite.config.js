import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Tuiles IGN Plan v2 (Géoplateforme, sans clé)
const IGN_TILES = /^https:\/\/data\.geopf\.fr\/wmts/
// Jamais en cache : compte, administration, et horaires en direct (une réponse ancienne serait trompeuse ;
// le trajet hors ligne a son propre paquet dans IndexedDB)
const NO_CACHE = ['/api/v1/me', '/api/v1/admin', '/api/v1/auth', '/api/v1/departures']

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'AtouVent',
        short_name: 'AtouVent',
        description: 'Se déplacer en Île-de-France malgré la chaleur, le froid, la neige, les orages et le vent.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#F2F4F7',
        theme_color: '#0F1B2D',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /\.html$/],
        // Les fichiers de données (gares, analyse) sont gardés pour fonctionner sans réseau
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Données de l'API : réseau d'abord, dernière réponse connue sinon
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1/') && !NO_CACHE.some((p) => url.pathname.startsWith(p)),
            handler: 'NetworkFirst',
            method: 'GET',
            options: { cacheName: 'api', networkTimeoutSeconds: 5, expiration: { maxEntries: 200, maxAgeSeconds: 86400 } },
          },
          {
            urlPattern: IGN_TILES,
            handler: 'CacheFirst',
            options: { cacheName: 'tuiles', expiration: { maxEntries: 800, maxAgeSeconds: 30 * 86400 } },
          },
        ],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1100 }, // maplibre est chargé à la demande
  // Le dossier android/ (projet Capacitor) contient une copie de l'application : jamais surveillé ni analysé
  server: { proxy: { '/api': 'http://localhost:8000' }, watch: { ignored: ['**/android/**'] } },
  optimizeDeps: { entries: ['index.html'], include: ['maplibre-gl'] },
  // Worker de MapLibre en module ES (il importe le code partagé de MapLibre)
  worker: { format: 'es' },
  preview: { proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'node' },
})
