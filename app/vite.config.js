import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages: /Bulletin-AI/ | Local dev: ./
  base: process.env.GITHUB_ACTIONS ? '/Bulletin-AI/' : './',
  plugins: [
    VitePWA({
      registerType: 'prompt', // Changed to 'prompt' to show custom update notification
      manifest: false, // Utilise public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,png,svg,ico,woff,woff2}', 'app.html'],
        navigateFallback: null, // Don't cache navigation requests
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache',
              expiration: { maxAgeSeconds: 86400 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unpkg-cache',
              expiration: { maxAgeSeconds: 86400 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxAgeSeconds: 86400 * 365 }
            }
          }
        ]
      }
    })
  ],
  server: {
    open: true,
    port: 4000,
    strictPort: false
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) || 'dev'),
    __COMMIT_MESSAGE__: JSON.stringify(process.env.COMMIT_MESSAGE || 'Development build'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString())
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'esbuild',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        app: 'app.html'
      },
      output: {
        format: 'es',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
