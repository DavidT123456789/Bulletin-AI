import { initDOM, DOM } from './utils/DOM.js';
import { initErrorBoundary } from './utils/ErrorBoundary.js';
import { App } from './managers/AppManager.js';
import { UI } from './managers/UIManager.js';
import { AppreciationsManager } from './managers/AppreciationsManager.js';
import { StorageManager } from './managers/StorageManager.js';
import { WelcomeManager } from './managers/WelcomeManager.js';
import { appState } from './state/State.js';
import './css/main.css';

document.addEventListener('DOMContentLoaded', () => {
    // Initialiser l'error boundary en premier pour capturer toutes les erreurs
    initErrorBoundary();

    try {
        initDOM();
        App.init();

        // Expose modules to global scope for inline HTML handlers
        window.UI = UI;
        window.App = App;
        window.AppreciationsManager = AppreciationsManager;
        window.StorageManager = StorageManager;
        window.appState = appState;
        window.DOM = DOM;

        // Expose global functions for inline HTML onclick handlers
        window.switchHelpTab = (btn, tabId) => {
            const buttons = Array.from(document.querySelectorAll('.modal-tabs-sidebar .modal-tab-btn'));
            const currentButton = buttons.find(b => b.classList.contains('active'));
            const newIndex = buttons.indexOf(btn);
            const currentIndex = currentButton ? buttons.indexOf(currentButton) : 0;

            // Determine direction: going down in list = content exits up
            const direction = newIndex > currentIndex ? 'down' : 'up';
            const contentArea = document.querySelector('.modal-tabs-content-area');
            if (contentArea) contentArea.dataset.direction = direction;

            // Remove active class from all buttons and contents
            buttons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.help-tab-content').forEach(c => c.classList.remove('active'));
            // Add active class to clicked button and corresponding content
            btn.classList.add('active');
            const content = document.getElementById(tabId);
            if (content) content.classList.add('active');
        };

        window.relaunchSetupWizard = () => {
            WelcomeManager.handleRelaunchWelcomeGuide({ preventDefault: () => { } });
        };

        // PWA Update Handler
        setupPWAUpdateHandler();

    } catch (e) {
        alert(`Erreur d'initialisation : ${e.message}\n${e.stack}`);
        console.error(e);
    }
});

/**
 * Configures the PWA service worker update handler.
 * Shows a notification banner when a new version is available.
 */
function setupPWAUpdateHandler() {
    // Check if service worker is available
    if (!('serviceWorker' in navigator)) return;

    // Import the virtual module from vite-plugin-pwa
    import('virtual:pwa-register').then(({ registerSW }) => {
        let updateSW;

        const showUpdateBanner = () => {
            const banner = document.getElementById('pwaUpdateBanner');
            if (banner) {
                banner.style.display = 'flex';

                // Update button - reload the app
                const updateBtn = document.getElementById('pwaUpdateBtn');
                if (updateBtn) {
                    updateBtn.onclick = () => {
                        updateSW && updateSW(true);
                    };
                }

                // Dismiss button - hide for this session
                const dismissBtn = document.getElementById('pwaUpdateDismissBtn');
                if (dismissBtn) {
                    dismissBtn.onclick = () => {
                        banner.style.display = 'none';
                    };
                }
            }
        };

        updateSW = registerSW({
            onNeedRefresh() {
                showUpdateBanner();
            },
            onOfflineReady() {
            },
            onRegistered(registration) {
                // Check for updates every hour
                setInterval(() => {
                    registration?.update();
                }, 60 * 60 * 1000);
            },
            onRegisterError(error) {
                console.error('[PWA] Service worker registration error:', error);
            }
        });
    }).catch(() => {
        // virtual:pwa-register not available in dev mode
    });
}
