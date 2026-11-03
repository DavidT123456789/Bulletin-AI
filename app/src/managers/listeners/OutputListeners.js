import { DOM } from '../../utils/DOM.js';
import { EventHandlersManager } from '../EventHandlersManager.js';
import { MassImportManager } from '../MassImportManager.js';

export const OutputListeners = {
    /**
     * Configure les listeners de la section de sortie (tri, génération, filtres statistiques).
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        DOM.sortSelect?.addEventListener('change', EventHandlersManager.handleSortSelectChange);

        // Note: Le menu d'actions global et la recherche inline sont dans le header du tableau
        // et leurs listeners sont attachés par ListViewEvents.attachEventListeners()

        // Header error badge is now informational only - errors are handled by the "Actualiser" button
        // Cancel button still works to abort generation in progress

        const headerCancelBtn = document.getElementById('headerCancelBtn');
        if (headerCancelBtn) {
            addClickListener(headerCancelBtn, async () => {
                MassImportManager.cancelImport();
            });
        }

        // Header Generate Button (in header chip - idle-pending state)
        const headerGenerateBtn = document.getElementById('headerGenerateBtn');
        if (headerGenerateBtn) {
            addClickListener(headerGenerateBtn, async () => {
                await MassImportManager.generateAllPending();
            });
        }

        document.querySelectorAll('.stat-card[role="button"], .legend-item[role="button"], .detail-item[role="button"], .hist-bar-group[role="button"]').forEach(card => {
            card.addEventListener('click', EventHandlersManager.handleStatFilterClick.bind(EventHandlersManager, card));
        });
    }
};
