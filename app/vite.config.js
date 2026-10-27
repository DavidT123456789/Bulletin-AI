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
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,png,jpg,jpeg,webp,svg,ico,woff,woff2,webmanifest}', 'index.html', 'app.html'],
        globIgnores: ['**/Image Source*', 'welcome-transformation.svg', '**/sample-*'],
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
    strictPort: false
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
    chunkSizeWarningLimit: 600,
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
          if (
            normalizedId.includes('/src/managers/SeatingChartManager') ||
            normalizedId.includes('/src/managers/seating/')
          ) {
            return 'seating-chart';
          }
          if (
            normalizedId.includes('/src/managers/TrombinoscopeManager') ||
            normalizedId.includes('/src/utils/PronoteTrombiParser')
          ) {
            return 'trombinoscope';
          }
          if (
            normalizedId.includes('/src/managers/FocusPanel') ||
            normalizedId.includes('/src/managers/focus/') ||
            normalizedId.includes('/src/managers/JournalManager') ||
            normalizedId.includes('/src/managers/VariationsManager')
          ) {
            return 'focus-panel';
          }
          if (
            normalizedId.includes('/src/managers/ImportWizardManager') ||
            normalizedId.includes('/src/managers/FileImportManager') ||
            normalizedId.includes('/src/managers/MassImportManager') ||
            normalizedId.includes('/src/managers/ImportHubManager') ||
            normalizedId.includes('/src/managers/ImportUIManager') ||
            normalizedId.includes('/src/managers/BackupImportManager') ||
            normalizedId.includes('/src/managers/ExportManager') ||
            normalizedId.includes('/src/managers/PreviewManager')
          ) {
            return 'import-wizard';
          }
          if (
            normalizedId.includes('/src/managers/ClassDashboardManager') ||
            normalizedId.includes('/src/managers/StatsUIManager') ||
            normalizedId.includes('/src/services/StatsService')
          ) {
            return 'stats-dashboard';
          }
          if (
            normalizedId.includes('/src/managers/SettingsUIManager') ||
            normalizedId.includes('/src/managers/listeners/SettingsModalListeners') ||
            normalizedId.includes('/src/managers/listeners/OtherModalsListeners') ||
            normalizedId.includes('/src/managers/listeners/ModalListeners') ||
            normalizedId.includes('/src/managers/ApiValidationManager') ||
            normalizedId.includes('/src/managers/ModelSelectionManager') ||
            normalizedId.includes('/src/managers/WelcomeManager') ||
            normalizedId.includes('/src/managers/RestoreTransitionManager') ||
            normalizedId.includes('/src/managers/SpeechRecognitionManager') ||
            normalizedId.includes('/src/managers/SpeechSynthesisManager') ||
            normalizedId.includes('/src/managers/PwaInstallManager') ||
            normalizedId.includes('/src/managers/CrossClassSearchManager')
          ) {
            return 'settings-modals';
          }
          if (
            normalizedId.includes('/src/managers/ListViewManager') ||
            normalizedId.includes('/src/managers/list/') ||
            normalizedId.includes('/src/managers/ResultsUIManager') ||
            normalizedId.includes('/src/managers/DropdownManager') ||
            normalizedId.includes('/src/managers/HistoryManager')
          ) {
            return 'list-view';
          }
          if (normalizedId.includes('/src/managers/')) {
            return 'managers-core';
          }
          if (normalizedId.includes('/src/services/')) {
            return 'services';
          }
          if (normalizedId.includes('/src/utils/')) {
            return 'utils';
          }
        }
      }
    }
  }
});
