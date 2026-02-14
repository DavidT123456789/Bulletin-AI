/**
 * PwaInstallManager.js
 * 
 * Premium PWA installation experience with:
 * - Smart banner with platform-specific instructions
 * - Persistent menu button fallback
 * - iOS Safari manual install guide
 * - User preference persistence
 */

import { DOM } from '../utils/DOM.js';
import { UI } from './UIManager.js';

const STORAGE_KEY = 'pwa_install_dismissed';
const BANNER_DELAY_MS = 3000; // Show banner after 3 seconds
const NEVER_SHOW_AGAIN_DAYS = 30; // Respect "don't show again" for 30 days

/**
 * Platform detection utilities
 */
const Platform = {
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    },

    isAndroid() {
        return /Android/.test(navigator.userAgent);
    },

    isDesktop() {
        return !this.isIOS() && !this.isAndroid();
    },

    isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    },

    /**
     * Returns true if the platform requires manual install instructions.
     * On iOS, ALL browsers use WebKit, so none support beforeinstallprompt.
     */
    needsManualInstall() {
        return this.isIOS();
    },

    getPlatformName() {
        if (this.isIOS()) return 'ios';
        if (this.isAndroid()) return 'android';
        return 'desktop';
    }
};

/**
 * Main PWA Install Manager
 */
export const PwaInstallManager = {
    deferredPrompt: null,
    bannerShown: false,

    /**
     * Initialize the PWA install manager
     */
    init() {
        // Skip entirely if already installed as standalone
        if (Platform.isStandalone()) {
            this._hideAllInstallUI();
            return;
        }

        // Listen for the browser's install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this._onInstallAvailable();
        });

        // Listen for successful installation
        window.addEventListener('appinstalled', () => {
            this._onAppInstalled();
        });

        // Setup UI elements
        this._setupBanner();
        this._setupMenuButton();

        // Show banner after delay if appropriate
        this._scheduleBannerDisplay();
    },

    /**
     * Check if we should show the install prompt
     */
    _shouldShowBanner() {
        // Already installed
        if (Platform.isStandalone()) return false;

        // User dismissed recently
        const dismissed = this._getDismissedState();
        if (dismissed) {
            const dismissedDate = new Date(dismissed.date);
            const daysSince = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);

            if (dismissed.permanent || daysSince < NEVER_SHOW_AGAIN_DAYS) {
                return false;
            }
        }

        return true;
    },

    /**
     * Get stored dismissal state
     */
    _getDismissedState() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    },

    /**
     * Store dismissal preference
     */
    _setDismissed(permanent = false) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                date: new Date().toISOString(),
                permanent
            }));
        } catch {
            // Storage might be full or disabled
        }
    },

    /**
     * Called when browser install prompt is available (Chrome/Edge)
     */
    _onInstallAvailable() {
        // Show menu button
        this._showMenuButton();

        // Also consider showing banner if not dismissed
        if (!this.bannerShown && this._shouldShowBanner()) {
            this._showBanner();
        }
    },

    /**
     * Called when app is successfully installed
     */
    _onAppInstalled() {
        this.deferredPrompt = null;
        this._hideAllInstallUI();
        UI.showNotification('Application installée avec succès ! 🎉', 'success');
    },

    /**
     * Schedule banner display after delay
     */
    _scheduleBannerDisplay() {
        if (!this._shouldShowBanner()) return;

        setTimeout(() => {
            // Desktop: Skip banner, only use menu button
            // Native browser install prompt is available in Chrome/Edge
            if (Platform.isDesktop()) {
                if (this.deferredPrompt || !Platform.isStandalone()) {
                    this._showMenuButton();
                }
                return;
            }

            // iOS (all browsers) - show banner with manual instructions
            if (Platform.needsManualInstall()) {
                this._showBanner();
                return;
            }

            // Android Chrome/Edge - show banner if prompt available
            if (this.deferredPrompt) {
                this._showBanner();
            }
            // Fallback: just show the menu button
            else if (!Platform.isStandalone()) {
                this._showMenuButton();
            }
        }, BANNER_DELAY_MS);
    },

    /**
     * Setup the install banner DOM and events
     */
    _setupBanner() {
        const banner = DOM.pwaInstallBanner;
        if (!banner) return;

        // Get action buttons
        const installBtn = banner.querySelector('#pwaInstallBtn');
        const dismissBtn = banner.querySelector('#pwaDismissBtn');
        const laterBtn = banner.querySelector('#pwaLaterBtn');

        // Install button click
        installBtn?.addEventListener('click', () => this._triggerInstall());

        // Dismiss forever
        dismissBtn?.addEventListener('click', () => {
            this._setDismissed(true);
            this._hideBanner();
        });

        // Maybe later (dismiss for now)
        laterBtn?.addEventListener('click', () => {
            this._setDismissed(false);
            this._hideBanner();
        });
    },

    /**
     * Setup the menu button
     */
    _setupMenuButton() {
        const btn = DOM.installPwaBtn;
        if (!btn) return;

        btn.addEventListener('click', () => this._triggerInstall());
    },

    /**
     * Show the install banner with platform-specific content
     */
    _showBanner() {
        const banner = DOM.pwaInstallBanner;
        if (!banner || this.bannerShown) return;

        // Update banner content based on platform
        this._updateBannerContent(banner);

        // Show with animation
        banner.style.display = 'flex';
        requestAnimationFrame(() => {
            banner.classList.add('visible');
        });

        this.bannerShown = true;
    },

    /**
     * Hide the banner with animation
     */
    _hideBanner() {
        const banner = DOM.pwaInstallBanner;
        if (!banner) return;

        banner.classList.remove('visible');
        banner.classList.add('hiding');

        setTimeout(() => {
            banner.style.display = 'none';
            banner.classList.remove('hiding');
        }, 400);
    },

    /**
     * Update banner content based on platform
     */
    _updateBannerContent(banner) {
        const titleEl = banner.querySelector('.pwa-banner-title');
        const subtitleEl = banner.querySelector('.pwa-banner-subtitle');
        const installBtn = banner.querySelector('#pwaInstallBtn');
        const iosGuide = banner.querySelector('.pwa-ios-guide');

        if (Platform.needsManualInstall()) {
            // iOS (all browsers) - show manual instructions
            if (titleEl) titleEl.textContent = 'Installez Bulletin AI';
            if (subtitleEl) subtitleEl.textContent = 'Accédez rapidement depuis votre écran d\'accueil';
            if (installBtn) installBtn.style.display = 'none';
            if (iosGuide) iosGuide.style.display = 'flex';
        } else if (Platform.isAndroid()) {
            if (titleEl) titleEl.textContent = 'Installer l\'application';
            if (subtitleEl) subtitleEl.textContent = 'Ajoutez Bulletin AI à votre écran d\'accueil';
            if (iosGuide) iosGuide.style.display = 'none';
        } else {
            if (titleEl) titleEl.textContent = 'Installer Bulletin AI';
            if (subtitleEl) subtitleEl.textContent = 'Accès rapide depuis votre bureau';
            if (iosGuide) iosGuide.style.display = 'none';
        }
    },

    /**
     * Show the menu button
     */
    _showMenuButton() {
        const btn = DOM.installPwaBtn;
        if (!btn) return;

        btn.style.display = 'flex';

        // Update text based on platform
        if (Platform.needsManualInstall()) {
            // For iOS, update the button text to be clearer
            const textNode = Array.from(btn.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
            if (textNode) {
                textNode.textContent = ' Ajouter à l\'écran';
            }
        }
    },

    /**
     * Hide all install UI elements
     */
    _hideAllInstallUI() {
        if (DOM.pwaInstallBanner) {
            DOM.pwaInstallBanner.style.display = 'none';
        }
        if (DOM.installPwaBtn) {
            DOM.installPwaBtn.style.display = 'none';
        }
    },

    /**
     * Trigger the install flow
     */
    async _triggerInstall() {
        // iOS (all browsers) - show detailed modal with manual steps
        if (Platform.needsManualInstall()) {
            this._showIOSInstallModal();
            this._hideBanner();
            return;
        }

        // Chrome/Edge - use native prompt
        if (this.deferredPrompt) {
            try {
                await this.deferredPrompt.prompt();
                const result = await this.deferredPrompt.userChoice;

                if (result.outcome === 'accepted') {
                    // Will be handled by appinstalled event
                } else {
                    // User declined
                    this._setDismissed(false);
                }

                this.deferredPrompt = null;
            } catch (err) {
                console.warn('[PWA] Install prompt failed:', err);
            }

            this._hideBanner();
            return;
        }

        // Fallback - show manual instructions
        this._showManualInstallModal();
    },

    /**
     * Show iOS-specific install instructions modal
     */
    _showIOSInstallModal() {
        const modalHtml = `
            <div class="pwa-modal-overlay" id="pwaModalOverlay">
                <div class="pwa-modal">
                    <div class="pwa-modal-header">
                        <div class="pwa-modal-icon">
                            <img src="./assets/icon-192.png" alt="Bulletin AI" />
                        </div>
                        <h3>Installer Bulletin AI</h3>
                        <p>Suivez ces étapes simples</p>
                    </div>
                    <div class="pwa-modal-steps">
                        <div class="pwa-step">
                            <div class="pwa-step-number">1</div>
                            <div class="pwa-step-content">
                                <span class="pwa-step-text">Appuyez sur</span>
                                <span class="pwa-step-icon"><iconify-icon icon="solar:upload-square-bold"></iconify-icon></span>
                                <span class="pwa-step-label">Partager</span>
                            </div>
                        </div>
                        <div class="pwa-step">
                            <div class="pwa-step-number">2</div>
                            <div class="pwa-step-content">
                                <span class="pwa-step-text">Puis sur</span>
                                <span class="pwa-step-icon"><iconify-icon icon="solar:add-square-bold"></iconify-icon></span>
                                <span class="pwa-step-label">Sur l'écran d'accueil</span>
                            </div>
                        </div>
                        <div class="pwa-step">
                            <div class="pwa-step-number">3</div>
                            <div class="pwa-step-content">
                                <span class="pwa-step-text">Confirmez avec</span>
                                <span class="pwa-step-highlight">Ajouter</span>
                            </div>
                        </div>
                    </div>
                    <div class="pwa-modal-footer">
                        <button class="btn btn-primary" id="pwaModalCloseBtn">Compris !</button>
                        <button class="btn-text" id="pwaModalNeverBtn">Ne plus afficher</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const overlay = document.getElementById('pwaModalOverlay');
        const closeBtn = document.getElementById('pwaModalCloseBtn');
        const neverBtn = document.getElementById('pwaModalNeverBtn');

        const closeModal = () => {
            overlay?.classList.remove('visible');
            document.removeEventListener('keydown', handleEscape);
            setTimeout(() => overlay?.remove(), 300);
        };

        // Keyboard accessibility: Escape to close
        const handleEscape = (e) => {
            if (e.key === 'Escape') closeModal();
        };
        document.addEventListener('keydown', handleEscape);

        // Animate in
        requestAnimationFrame(() => overlay?.classList.add('visible'));

        closeBtn?.addEventListener('click', closeModal);
        neverBtn?.addEventListener('click', () => {
            this._setDismissed(true);
            closeModal();
        });
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    },

    /**
     * Show generic manual install instructions
     */
    _showManualInstallModal() {
        UI.showNotification(
            'Pour installer : Menu du navigateur → "Installer l\'application" ou "Ajouter à l\'écran d\'accueil"',
            'info',
            8000
        );
    }
};
