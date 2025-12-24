/**
 * @fileoverview Listeners généraux (boutons principaux, thème, sidebar)
 * @module managers/listeners/GeneralListeners
 */

import { DOM } from '../../utils/DOM.js';
import { UI } from '../UIManager.js';
import { SettingsUIManager } from '../SettingsUIManager.js';
import { FormUI } from '../FormUIManager.js';
import { FileImportManager } from '../FileImportManager.js';

let App = null;

export const GeneralListeners = {
    init(appInstance) {
        App = appInstance;
    },

    /**
     * Configure les listeners généraux (boutons principaux, thème, sidebar).
     * @param {Function} addClickListener - Helper pour ajouter un listener click
     */
    setup(addClickListener) {
        addClickListener(DOM.generateAppreciationBtn, App.handleGenerateClick);
        addClickListener(DOM.importGenerateBtn, () => FileImportManager.handleMassImportTrigger());
        addClickListener(DOM.resetFormBtn, App.handleClearClick);
        addClickListener(DOM.darkModeToggle, UI.toggleDarkMode);

        addClickListener(DOM.settingsButton, () => {
            SettingsUIManager.renderSubjectManagementList();
            UI.openModal(DOM.settingsModal);
            FormUI.showSettingsTab('templates'); // Ensure default tab is visible
            SettingsUIManager.updateApiStatusDisplay();
        });

        // Clic sur l'indicateur de modèle IA => ouvre les paramètres sur l'onglet Application
        addClickListener(DOM.headerAiModelChip, () => {
            SettingsUIManager.renderSubjectManagementList();
            UI.openModal(DOM.settingsModal);
            FormUI.showSettingsTab('advanced');
            SettingsUIManager.updateApiStatusDisplay();
        });

        addClickListener(DOM.helpButton, () => {
            App.handleHelpButtonClick();
        });

        // Sidebar removed - toggling handled by Hub Modal now

        // Option G: Accordion toggle for history section
        addClickListener(DOM.historyToggle, () => {
            const accordion = DOM.historyAccordion;
            if (accordion) {
                accordion.classList.toggle('open');
            }
        });
    }
};
