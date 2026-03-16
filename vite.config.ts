import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devProxyCookies = env.ARCH_DEV_API_COOKIES?.trim() ?? ''

  return {
  optimizeDeps: {
    // Some environments export NODE_ENV=production globally; force dev React runtime during Vite dev.
    esbuildOptions: {
      define: {
        'process.env.NODE_ENV': '"development"',
      },
    },
  },
  server: {
    host: true,
    proxy: {
      // Auth + proxy requests go to the Express backend on :3001
      '/auth': { target: 'http://localhost:3001', changeOrigin: false },
      '/proxy': { target: 'http://localhost:3001', changeOrigin: false },
      // Legacy /api/* kept for fallback (hardcoded cookies)
      '/api': {
        target: 'https://academia.srmist.edu.in/srm_university/academia-academic-services',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (devProxyCookies) {
              proxyReq.setHeader('Cookie', devProxyCookies)
            }
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
            proxyReq.setHeader('Referer', 'https://academia.srmist.edu.in/')
          })
        },
        secure: false,
      },
      '/photo': {
        target: 'https://creatorexport.zoho.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/photo/, ''),
        secure: false,
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('framer-motion')) return 'motion-vendor'
          if (id.includes('recharts') || id.includes('\\d3-') || id.includes('/d3-')) return 'charts-vendor'
          return undefined
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-maskable-512.png',
      ],
      manifest: {
        id: '/',
        name: 'Arch',
        short_name: 'Arch',
        description:
          'Arch is a compact mobile-first student portal focused on instant loads, trusted-device resume, and installable offline access.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'document',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'documents',
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ request }) =>
              request.destination === 'script' ||
              request.destination === 'style' ||
              request.destination === 'worker',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assets',
            },
          },
          {
            urlPattern: ({ request }) =>
              request.destination === 'image' ||
              request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'media',
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  }
})
