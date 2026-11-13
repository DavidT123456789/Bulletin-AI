import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import pkg from './package.json' with { type: 'json' };

const getGitInfo = () => {
  try {
    const hash = execSync('git rev-parse --short HEAD').toString().trim();
    // %s = subject only (first line) to avoid breaking UI with long messages
    const message = execSync('git log -1 --pretty=%s').toString().trim();
    return { hash, message };
  } catch (e) {
    console.warn('Failed to fetch git info:', e.message);
    return { hash: 'dev', message: 'Development build' };
  }
};

const gitInfo = getGitInfo();

export default defineConfig({
  // GitHub Pages: /Bulletin-AI/ | Local dev: ./
  base: process.env.GITHUB_ACTIONS ? '/Bulletin-AI/' : './',
  plugins: [
    VitePWA({
      registerType: 'prompt', // Changed to 'prompt' to show custom update notification
      manifest: false, // Utilise public/manifest.webmanifest
      workbox: {
        importScripts: ['sw-rescue.js'],
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Only skip Workbox revision hashing on Vite-generated content-hashed bundles,
        // so static files in public/assets/ (logo.png, icon.svg, icon-192.png, icon-512.png)
        // receive a proper MD5 revision and are refreshed when updated.
        dontCacheBustURLsMatching: /^assets\/.*-[a-zA-Z0-9_-]{8}\./,
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
        globPatterns: ['**/*.{js,css,png,jpg,jpeg,webp,svg,ico,woff,woff2,webmanifest}', 'index.html', 'app.html'],
        globIgnores: ['**/Image Source*', '**/sample-*', 'sw-rescue.js'],
        navigateFallback: null, // Don't cache navigation requests
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.mjs$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-worker-cache',
              expiration: { maxEntries: 5, maxAgeSeconds: 86400 * 90 }
            }
          },
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
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-static',
              expiration: { maxAgeSeconds: 86400 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/code\.iconify\.design\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'iconify-cdn-cache',
              expiration: { maxAgeSeconds: 86400 * 30 }
            }
          },
          {
            urlPattern: /^https:\/\/api\.iconify\.design\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'iconify-api-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 86400 * 30 }
            }
          }
        ]
      }
    })
  ],
  server: {
    open: true,
    port: 4000,
    strictPort: false,
    proxy: {
      '/api/albert/v1': {
        target: 'https://albert.api.etalab.gouv.fr/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/albert\/v1/, '')
      }
    }
  },
  preview: {
    proxy: {
      '/api/albert/v1': {
        target: 'https://albert.api.etalab.gouv.fr/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/albert\/v1/, '')
      }
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version} Beta`),
    __RAW_VERSION__: JSON.stringify(pkg.version),
    __STORAGE_SCHEMA_VERSION__: JSON.stringify(2),
    __COMMIT_HASH__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) || gitInfo.hash),
    __COMMIT_MESSAGE__: JSON.stringify(process.env.COMMIT_MESSAGE || gitInfo.message),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString())
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'esbuild',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: {
        main: 'index.html',
        app: 'app.html'
      },
      output: {
        format: 'es',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('pdfjs-dist') || normalizedId.includes('pdf.mjs') || normalizedId.includes('pdf.worker.mjs')) {
            return 'pdfjs-lib';
          }
          if (normalizedId.includes('node_modules')) {
            return 'vendor';
          }
          if (!normalizedId.endsWith('.css') && normalizedId.includes('/src/landing/')) {
            return 'landing';
          }
          if (
            !normalizedId.endsWith('.css') &&
            (normalizedId.includes('/src/') ||
              normalizedId.includes('virtual:pwa-register') ||
              normalizedId.includes('vite/preload-helper'))
          ) {
            return 'app-core';
          }
        }
      }
    }
  }
});
