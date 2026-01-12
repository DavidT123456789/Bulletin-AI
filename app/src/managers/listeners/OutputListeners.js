/**
 * @fileoverview Listeners de la section de sortie (recherche, tri, exports)
 * @module managers/listeners/OutputListeners
 */

import { CONFIG } from '../../config/Config.js';
import { DOM } from '../../utils/DOM.js';
import { Utils } from '../../utils/Utils.js';
// AppreciationsManager et StorageManager déplacés vers ListViewManager._attachGlobalActionsListeners()
import { EventHandlersManager } from '../EventHandlersManager.js';
import { ClassDashboardManager } from '../ClassDashboardManager.js';

export const OutputListeners = {
    /**
     * Configure les listeners de la section de sortie (recherche, tri, exports).
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        // Recherche avec bouton clear
        const searchContainer = DOM.searchInput?.parentElement;
        const searchClearBtn = document.getElementById('searchClearBtn');

        DOM.searchInput?.addEventListener('input', (e) => {
            // Toggle has-value class pour afficher/cacher le bouton clear
            searchContainer?.classList.toggle('has-value', e.target.value.length > 0);
            // Appeler le handler avec debounce
            Utils.debounce(EventHandlersManager.handleSearchInput, CONFIG.DEBOUNCE_TIME_MS)();
        });

        // Bouton clear de recherche
        if (searchClearBtn) {
            addClickListener(searchClearBtn, () => {
                if (DOM.searchInput) {
                    DOM.searchInput.value = '';
                    searchContainer?.classList.remove('has-value');
                    DOM.searchInput.focus();
                    EventHandlersManager.handleSearchInput();
                }
            });
        }

        DOM.sortSelect?.addEventListener('change', EventHandlersManager.handleSortSelectChange);

        // Note: Le menu d'actions global est maintenant dans le header du tableau
        // et ses listeners sont attachés par ListViewManager._attachGlobalActionsListeners()

        // Header error badge is now informational only - errors are handled by the "Actualiser" button
        // Cancel button still works to abort generation in progress

        const headerCancelBtn = document.getElementById('headerCancelBtn');
        if (headerCancelBtn) {
            addClickListener(headerCancelBtn, async () => {
                const { MassImportManager } = await import('../MassImportManager.js');
                MassImportManager.cancelImport();
            });
        }

        // Bouton "Générer" : Only generates pending appreciations (no more regenerate mode)
        addClickListener(DOM.generateAllPendingBtn, async () => {
            const { MassImportManager } = await import('../MassImportManager.js');
            await MassImportManager.generateAllPending();
        });

        // Bouton "Actualiser" : Regenerates dirty and error appreciations
        const updateDirtyBtn = document.getElementById('updateDirtyBtn');
        if (updateDirtyBtn) {
            addClickListener(updateDirtyBtn, async () => {
                const { ResultsUIManager } = await import('../ResultsUIManager.js');
                await ResultsUIManager.regenerateDirty();
            });
        }

        // Bouton Analyse de classe -> Ouvre le nouveau Dashboard
        const analyzeBtn = document.getElementById('analyzeClassBtn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => ClassDashboardManager.openDashboard());
        }

        DOM.activeFilterInfo?.addEventListener('click', EventHandlersManager.handleActiveFilterInfoClick.bind(EventHandlersManager));

        document.querySelectorAll('.stat-card[role="button"], .legend-item[role="button"], .detail-item[role="button"], .hist-bar-group[role="button"]').forEach(card => {
            card.addEventListener('click', EventHandlersManager.handleStatFilterClick.bind(EventHandlersManager, card));
        });
    }
};
