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

        // Remove app-loading class after initial animation completes
        // to prevent interference with other animations (class/period switch)
        setTimeout(() => {
            const appLayout = document.querySelector('.app-layout');
            if (appLayout) {
                appLayout.classList.remove('app-loading');
            }
        }, 800); // Wait for longest animation (0.6s + 0.3s delay = ~0.9s)

        // Expose modules to global scope for inline HTML handlers
        window.UI = UI;
        window.App = App;
        window.AppreciationsManager = AppreciationsManager;
        window.StorageManager = StorageManager;
        window.appState = appState;
        window.DOM = DOM;

        // Expose global functions for inline HTML onclick handlers
        window.switchHelpTab = (btn, tabId) => {
            const container = btn.closest('.ui-tabs-vertical');
            if (!container) return;
            const buttons = Array.from(container.querySelectorAll('.ui-tabs-sidebar .ui-tabs-btn'));
            const currentButton = buttons.find(b => b.classList.contains('active'));
            const newIndex = buttons.indexOf(btn);
            const currentIndex = currentButton ? buttons.indexOf(currentButton) : 0;

            // Determine direction: going down in list = content exits up
            const direction = newIndex > currentIndex ? 'down' : 'up';
            const contentArea = container.querySelector('.ui-tabs-content');
            if (contentArea) contentArea.dataset.direction = direction;

            // Remove active class from all buttons and contents in this container
            buttons.forEach(b => b.classList.remove('active'));
            container.querySelectorAll('.help-tab-content').forEach(c => c.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            btn.classList.add('active');

            // Search inside the container first for scoped IDs, fallback to global
            const content = container.querySelector(`#${tabId}`) || document.getElementById(tabId);
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
        let registration;

        const showUpdateBanner = () => {
            const banner = document.getElementById('pwaUpdateBanner');
            if (banner) {
                banner.style.display = 'block';

                // Populate Commit Info (Dynamic from version.json)
                const populateUpdateInfo = async () => {
                    try {
                        // Fetch latest version info (bust cache)
                        const res = await fetch('./version.json?t=' + Date.now());
                        if (res.ok) {
                            const data = await res.json();

                            const hashEl = document.getElementById('pwaCommitHash');
                            if (hashEl && data.hash) hashEl.textContent = `${data.hash}`;

                            const msgEl = document.getElementById('pwaCommitMsg');
                            if (msgEl && data.message) msgEl.textContent = data.message;
                        } else {
                            // Fallback to static build constants if fetch fails
                            throw new Error('version.json fetch failed');
                        }
                    } catch (e) {
                        console.warn('[PWA] Failed to fetch dynamic version info, using static fallback:', e);
                        // Fallback to static constants injected by Vite
                        if (typeof __COMMIT_HASH__ !== 'undefined') {
                            const hashEl = document.getElementById('pwaCommitHash');
                            if (hashEl) hashEl.textContent = `${__COMMIT_HASH__}`;
                        }
                        if (typeof __COMMIT_MESSAGE__ !== 'undefined') {
                            const msgEl = document.getElementById('pwaCommitMsg');
                            if (msgEl) msgEl.textContent = __COMMIT_MESSAGE__;
                        }
                    }
                };

                populateUpdateInfo();

                // Handle Details Toggle - Click on the entire text area
                const bannerText = banner.querySelector('.pwa-banner-text');
                const infoBtn = document.getElementById('pwaInfoBtn');
                const details = document.getElementById('pwaUpdateDetails');

                if (bannerText && details && infoBtn) {
                    bannerText.onclick = () => {
                        details.classList.toggle('expanded');
                        infoBtn.classList.toggle('active');
                    };
                }

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

        // Expose update trigger for menu button
        window.triggerAppUpdate = () => {
            if (updateSW) {
                updateSW(true);
            } else {
                window.location.reload();
            }
        };

        // Expose manual check function
        window.checkForUpdates = async () => {
            if (registration) {
                try {
                    await registration.update();
                } catch (e) {
                    console.error('[PWA] Manual update check failed:', e);
                }
            } else {
                console.warn('[PWA] Cannot check for updates: No registration yet.');
            }
        };

        updateSW = registerSW({
            onNeedRefresh() {
                showUpdateBanner();
                // Update global state
                if (window.appState) {
                    window.appState.isUpdateAvailable = true;
                    document.dispatchEvent(new CustomEvent('app-update-available'));
                }
            },
            onOfflineReady() { },
            onRegistered(swRegistration) {
                registration = swRegistration;

                // Check for updates every hour
                setInterval(() => {
                    swRegistration.update();
                }, 60 * 60 * 1000);
            },
            onRegisterError(error) {
                console.error('[PWA] Service worker registration error:', error);
            }
        });
    }).catch((e) => {
        // virtual:pwa-register not available in dev mode
        console.warn('[PWA] Update handler disabled (dev mode or error):', e);
    });
}
