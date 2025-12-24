/**
 * @fileoverview Listeners des autres modales (détails, raffinement, aide, etc.)
 * @module managers/listeners/OtherModalsListeners
 */

import { DOM } from '../../utils/DOM.js';
import { Utils } from '../../utils/Utils.js';
import { UI } from '../UIManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { ClassAnalysisManager } from '../ClassAnalysisManager.js';
// RefinementManager removed - Focus Panel handles all refinement inline
import { FileImportManager } from '../FileImportManager.js';
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

        // _setupRefinementModal removed - Focus Panel handles all refinement inline
        this._setupHelpModal(addClickListener);
        this._setupClassAnalysisModal(addClickListener);
        this._setupImportPreviewModal(addClickListener);
    },



    // _setupRefinementModal removed - Refinement modal deleted, Focus Panel handles all refinement

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

    _setupClassAnalysisModal(addClickListener) {
        addClickListener(DOM.closeClassAnalysisModalBtn, () => UI.closeModal(DOM.classAnalysisModal));
        addClickListener(DOM.closeClassAnalysisFooterBtn, () => UI.closeModal(DOM.classAnalysisModal));
        addClickListener(DOM.copyAnalysisBtn, ClassAnalysisManager.copyClassAnalysis);
        addClickListener(DOM.copyClassAnalysisBtn, ClassAnalysisManager.copyClassAnalysis);
        DOM.classAnalysisModal.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-refine-type]');
            if (button) ClassAnalysisManager.handleClassAnalysisActions(button);
        });
    },

    _setupImportPreviewModal(addClickListener) {
        addClickListener(DOM.closeImportPreviewModalBtn, () => UI.closeModal(DOM.importPreviewModal));
        addClickListener(DOM.cancelImportPreviewBtn, () => UI.closeModal(DOM.importPreviewModal));

        // Import des données (sans génération - nouveau workflow data-first)
        addClickListener(DOM.importOnlyBtn, async () => {
            try {
                await FileImportManager.handleImportOnlyConfirmation();
            } catch (err) {
                console.error("Erreur lors de l'import :", err);
                UI.showNotification("Une erreur est survenue lors de l'import.", 'error');
            }
        });

        DOM.importPreviewModal?.addEventListener('click', (e) => {
            if (e.target.id === 'forgetSavedImportFormatBtn') {
                e.preventDefault();
                FileImportManager.forgetSavedImportFormat();
            }
        });

        DOM.importPreviewModal?.addEventListener('change', e => {
            const targetId = e.target.id;
            if (targetId === 'separatorSelect' || targetId === 'strategyMerge' || targetId === 'strategyReplace' || e.target.classList.contains('mapping-select')) {
                if (targetId === 'separatorSelect') {
                    const isCustom = e.target.value === 'custom';
                    DOM.customSeparatorInput.style.display = isCustom ? 'inline-block' : 'none';
                    if (isCustom) DOM.customSeparatorInput.focus();
                }
                FileImportManager.updateImportPreview();
            }
        });
        DOM.customSeparatorInput?.addEventListener('input', Utils.debounce(() => FileImportManager.updateImportPreview(), 200));
    }
};
