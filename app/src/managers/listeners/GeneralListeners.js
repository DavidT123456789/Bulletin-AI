/**
 * @fileoverview Listeners généraux (boutons principaux, thème, sidebar)
 * @module managers/listeners/GeneralListeners
 */

import { DOM } from '../../utils/DOM.js';
import { appState, UIState } from '../../state/State.js';
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

        // Header Menu Logic - with teleportation for mobile to escape backdrop-filter containing block
        if (DOM.headerMenuBtn && DOM.headerMenuDropdown) {
            // Store original parent for restoration
            const originalParent = DOM.headerMenuDropdown.parentElement;

            const closeMenu = () => {
                DOM.headerMenuDropdown.classList.remove('open');
                DOM.headerMenuBtn.classList.remove('active');
                // Return to original parent if teleported
                if (DOM.headerMenuDropdown.parentElement === document.body && originalParent) {
                    originalParent.appendChild(DOM.headerMenuDropdown);
                    // Reset inline styles
                    DOM.headerMenuDropdown.style.position = '';
                    DOM.headerMenuDropdown.style.top = '';
                    DOM.headerMenuDropdown.style.right = '';
                    DOM.headerMenuDropdown.style.left = '';
                    DOM.headerMenuDropdown.style.zIndex = '';
                }
            };

            addClickListener(DOM.headerMenuBtn, (e) => {
                e.stopPropagation();
                const isOpening = !DOM.headerMenuDropdown.classList.contains('open');

                if (isOpening) {
                    DOM.headerMenuDropdown.classList.add('open');
                    DOM.headerMenuBtn.classList.add('active');

                    // On narrow screens, teleport dropdown to body to escape header clipping
                    if (window.innerWidth < 768) {
                        const btnRect = DOM.headerMenuBtn.getBoundingClientRect();
                        document.body.appendChild(DOM.headerMenuDropdown);
                        DOM.headerMenuDropdown.style.position = 'fixed';
                        DOM.headerMenuDropdown.style.top = `${btnRect.bottom + 8}px`;
                        DOM.headerMenuDropdown.style.right = '12px';
                        DOM.headerMenuDropdown.style.left = 'auto';
                        DOM.headerMenuDropdown.style.zIndex = '9999';
                    }
                } else {
                    closeMenu();
                }
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (DOM.headerMenuDropdown.classList.contains('open') &&
                    !DOM.headerMenuDropdown.contains(e.target) &&
                    !DOM.headerMenuBtn.contains(e.target)) {
                    closeMenu();
                }
            });

            // Close on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && DOM.headerMenuDropdown.classList.contains('open')) {
                    closeMenu();
                }
            });
        }

        if (DOM.personalizationBtn) {
            addClickListener(DOM.personalizationBtn, () => {
                UI.openModal(DOM.personalizationModal);
            });
        }

        // Personalization Modal Actions
        const closePersonalization = () => UI.closeModal(DOM.personalizationModal);
        addClickListener(DOM.closePersonalizationModalBtn, closePersonalization);
        addClickListener(DOM.cancelPersonalizationBtn, closePersonalization);
        addClickListener(DOM.savePersonalizationBtn, () => {
            SettingsUIManager.saveSettings(false); // Saves all settings including style
            closePersonalization();
            UI.showNotification('Paramètres de personnalisation enregistrés', 'success');
        });

        addClickListener(DOM.settingsButton, () => {
            // [FIX] Create snapshot of current state before opening modal
            // This allows Cancel to properly revert changes including auto-saved ones
            UIState.settingsBeforeEdit = {
                useSubjectPersonalization: appState.useSubjectPersonalization,
                subjects: JSON.parse(JSON.stringify(appState.subjects))
            };
            UI.openModal(DOM.settingsModal);
            SettingsUIManager.updateApiStatusDisplay();
        });

        // Model label click -> opens settings (API config)
        addClickListener(DOM.dashModelLabel, () => {
            // [FIX] Same snapshot logic for this entry point
            UIState.settingsBeforeEdit = {
                useSubjectPersonalization: appState.useSubjectPersonalization,
                subjects: JSON.parse(JSON.stringify(appState.subjects))
            };
            UI.openModal(DOM.settingsModal);
            SettingsUIManager.updateApiStatusDisplay();
        });

        // Generation Dashboard badge click handlers
        // Error badge -> regenerate errors
        addClickListener(DOM.dashErrors, () => {
            import('../EventHandlersManager.js').then(({ EventHandlersManager }) => {
                EventHandlersManager.handleRegenerateErrorsClick?.();
            });
        });

        // Cancel button during generation
        addClickListener(DOM.dashCancelBtn, () => {
            import('../MassImportManager.js').then(({ MassImportManager }) => {
                if (MassImportManager.massImportAbortController) {
                    MassImportManager.massImportAbortController.abort();
                    MassImportManager.massImportAbortController = null;
                }
            });
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
