/**
 * @fileoverview Listeners des autres modales (détails, raffinement, aide, etc.)
 * @module managers/listeners/OtherModalsListeners
 */

import { DOM } from '../../utils/DOM.js';
import { UI } from '../UIManager.js';
import { ClassDashboardManager } from '../ClassDashboardManager.js';
import { WelcomeManager } from '../WelcomeManager.js';

let App = null;

export const OtherModalsListeners = {
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Configure les listeners des autres modales (détails, raffinement, aide, etc.).
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        this._setupHelpModal(addClickListener);
        this._setupClassDashboardModal(addClickListener);
        // Note: Import modal is now handled by ImportWizardManager
    },

    _setupHelpModal(addClickListener) {
        addClickListener(DOM.closeHelpModalBtn, () => UI.closeModal(DOM.helpModal));
        addClickListener(DOM.closeHelpModalFooterBtn, () => UI.closeModal(DOM.helpModal));
        DOM.helpGoToSettingsBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            UI.closeAllModals();
            UI.openModal(DOM.settingsModal);
            UI.showSettingsTab('advanced');
        });
        DOM.helpFormatSelector?.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.format) {
                UI.updateHelpImportFormat(e.target.dataset.format);
            }
        });

        // Bouton pour relancer le guide de bienvenue (dans le footer de la modale d'aide)
        const relaunchBtn = document.getElementById('relaunchWelcomeBtn');
        relaunchBtn?.addEventListener('click', (e) => {
            WelcomeManager.handleRelaunchWelcomeGuide(e);
        });
    },

    /**
     * Setup listeners for the new Class Dashboard modal
     */
    _setupClassDashboardModal(addClickListener) {
        const modal = document.getElementById('classDashboardModal');
        if (!modal) return;

        // Close buttons
        const closeBtnHeader = document.getElementById('closeDashboardModalBtn');
        const closeBtnFooter = document.getElementById('closeDashboardFooterBtn');

        addClickListener(closeBtnHeader, () => ClassDashboardManager.closeDashboard());
        addClickListener(closeBtnFooter, () => ClassDashboardManager.closeDashboard());

        // Generate AI Synthesis button
        const generateBtn = document.getElementById('generateSynthesisBtn');
        addClickListener(generateBtn, () => ClassDashboardManager.generateAISynthesis());

        // Copy button
        const copyBtn = document.getElementById('copyDashboardSynthesisBtn');
        addClickListener(copyBtn, () => ClassDashboardManager.copySynthesis());

        // Click handlers for interactive elements
        modal.addEventListener('click', (e) => {
            // Click on student highlight to focus on them
            const highlightItem = e.target.closest('.highlight-item[data-student-id]');
            if (highlightItem) {
                const studentId = highlightItem.dataset.studentId;
                ClassDashboardManager.closeDashboard();
                // Open focus panel for this student
                setTimeout(async () => {
                    const { FocusPanelManager } = await import('../FocusPanelManager.js');
                    FocusPanelManager.openByStudentId(studentId);
                }, 300);
            }
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                ClassDashboardManager.closeDashboard();
            }
        });
    }
};
