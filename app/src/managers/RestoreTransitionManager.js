/**
 * @fileoverview RestoreTransitionManager — Minimalist iOS 2026 Workspace Rehydration
 * Eliminates screen flash and popup jumping during data restoration.
 * 
 * @module managers/RestoreTransitionManager
 */

import { ModalUI } from './ModalUIManager.js';
import { DOM } from '../utils/DOM.js';

let isTransitioning = false;

export const RestoreTransitionManager = {
    /**
     * Minimalist workspace transition: gentle frosted veil on the workspace,
     * in-memory rehydration, and silky spring reveal.
     * No popup modals, no frantic flashing cards.
     * 
     * @param {Object} [options]
     * @param {Function} [options.onRehydrate] Custom rehydration logic
     * @returns {Promise<boolean>}
     */
    async rehydrateAndTransition({ onRehydrate = null } = {}) {
        if (isTransitioning) return true;
        isTransitioning = true;

        const mainWrapper = document.querySelector('.main-content-wrapper') || document.body;

        try {
            // 1. Close any open settings/confirm modals smoothly
            if (ModalUI?.closeAllModals) {
                ModalUI.closeAllModals();
            }

            // 2. Apply gentle frosted veil to workspace
            document.body.classList.add('is-restoring-data');
            mainWrapper.classList.add('is-restoring-data');

            // 3. Rehydrate in memory
            if (typeof onRehydrate === 'function') {
                await onRehydrate();
            } else if (window.App?.rehydrateAll) {
                await window.App.rehydrateAll();
            } else {
                const { StorageManager } = await import('./StorageManager.js');
                await StorageManager.loadAppState({ checkPendingRestore: false });
                if (window.App?.updateUIOnLoad) {
                    window.App.updateUIOnLoad();
                }
            }

            // 4. Subtle dwell for visual continuity (250ms)
            await new Promise(r => setTimeout(r, 250));

            return true;
        } catch (error) {
            console.error('[RestoreTransitionManager] Rehydration error:', error);
            throw error;
        } finally {
            // 5. Smooth spring reveal
            document.body.classList.remove('is-restoring-data', 'is-cloud-syncing');
            mainWrapper.classList.remove('is-restoring-data', 'is-cloud-syncing');
            DOM.headerMenuBtn?.classList.remove('cloud-syncing');
            isTransitioning = false;

            document.dispatchEvent(new CustomEvent('app-data-restored'));
        }
    },

    /**
     * Fallback for actions strictly requiring a browser reload (e.g. factory reset).
     * @param {Object} [options]
     * @param {Function} [options.onBeforeReload]
     */
    async performReloadTransition({ onBeforeReload = null } = {}) {
        document.body.classList.add('is-restoring-data');
        if (typeof onBeforeReload === 'function') {
            try {
                await onBeforeReload();
            } catch {
                // best effort
            }
        }
        setTimeout(() => {
            window.location.reload();
        }, 300);
    },

    /**
     * Checks if a transition flag was active on startup
     */
    checkPendingReloadTransition() {
        sessionStorage.removeItem('bulletin_restore_transition');
        document.documentElement.classList.remove('is-restoring-transition');
    },

    isActive() {
        return isTransitioning;
    }
};
