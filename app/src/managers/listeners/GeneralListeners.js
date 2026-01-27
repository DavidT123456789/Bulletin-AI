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
import { StorageManager } from '../StorageManager.js';

import { APP_LINKS } from '../../config/Config.js';


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
        // Initialize external links
        if (DOM.linkGithub) DOM.linkGithub.href = APP_LINKS.GITHUB;
        if (DOM.linkKofi) DOM.linkKofi.href = APP_LINKS.KOFI;
        if (DOM.linkFeedback) DOM.linkFeedback.href = APP_LINKS.FEEDBACK;
        if (DOM.linkLicense) DOM.linkLicense.href = APP_LINKS.LICENSE;

        addClickListener(DOM.generateAppreciationBtn, App.handleGenerateClick);
        addClickListener(DOM.importGenerateBtn, () => FileImportManager.handleMassImportTrigger());
        addClickListener(DOM.resetFormBtn, App.handleClearClick);
        addClickListener(DOM.darkModeToggle, UI.toggleDarkMode);

        // Header Menu Logic - with teleportation for mobile to escape backdrop-filter containing block
        if (DOM.headerMenuBtn && DOM.headerMenuDropdown) {
            const closeMenu = () => {
                DOM.headerMenuDropdown.classList.remove('open');
                DOM.headerMenuBtn.classList.remove('active');
            };

            addClickListener(DOM.headerMenuBtn, (e) => {
                e.stopPropagation();
                const isOpening = !DOM.headerMenuDropdown.classList.contains('open');

                if (isOpening) {
                    DOM.headerMenuDropdown.classList.add('open');
                    DOM.headerMenuBtn.classList.add('active');
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


            // Update Menu Item Logic
            document.addEventListener('app-update-available', () => {
                const updateBtn = document.getElementById('updateMenuItem');
                if (updateBtn) updateBtn.style.display = 'flex';
                // Also show a dot on the menu button
                // Also trigger organic animation on the menu button itself
                if (DOM.headerMenuBtn) {
                    DOM.headerMenuBtn.classList.add('has-update');
                }
            });

            const updateMenuItem = document.getElementById('updateMenuItem');
            if (updateMenuItem) {
                addClickListener(updateMenuItem, () => {
                    if (window.triggerAppUpdate) {
                        window.triggerAppUpdate();
                    } else {
                        window.location.reload();
                    }
                });
            }

            // Cloud Save/Load Logic
            this.setupCloudListeners(addClickListener, closeMenu);
        }

        if (DOM.personalizationBtn) {
            addClickListener(DOM.personalizationBtn, () => {
                SettingsUIManager.createSnapshot();

                UI.openModal(DOM.personalizationModal);
                // [FIX] Refresh Lab data on modal open to sync with current period
                import('./SettingsModalListeners.js').then(({ SettingsModalListeners }) => {
                    SettingsModalListeners._updateStudentContextAndPrompt();
                });
            });
        }

        // Personalization Modal Actions
        const closePersonalization = (isSave = false) => {
            // If cancelling (not saving), restore the original state
            if (!isSave) {
                const restored = SettingsUIManager.restoreSnapshot();
                if (restored) {
                    // Update UI to reflect restored state
                    SettingsUIManager.updatePersonalizationState();
                    import('../FormUIManager.js').then(({ FormUI }) => FormUI.updateSettingsFields());
                }
            } else {
                // Confirm changes: clear snapshot without restoring
                UIState.settingsBeforeEdit = {};
            }

            UI.closeModal(DOM.personalizationModal);
        };

        addClickListener(DOM.closePersonalizationModalBtn, () => closePersonalization(false));
        addClickListener(DOM.cancelPersonalizationBtn, () => closePersonalization(false));

        addClickListener(DOM.savePersonalizationBtn, () => {
            SettingsUIManager.saveSettings(false); // Saves all settings including style
            closePersonalization(true);
            UI.showNotification('Paramètres de personnalisation enregistrés', 'success');
        });

        // Close on backdrop click
        if (DOM.personalizationModal) {
            DOM.personalizationModal.addEventListener('click', (e) => {
                if (e.target === DOM.personalizationModal) {
                    closePersonalization(false);
                }
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && UI.activeModal === DOM.personalizationModal) {
                e.preventDefault();
                e.stopPropagation();
                closePersonalization(false);
            }
        });

        addClickListener(DOM.settingsButton, () => {
            SettingsUIManager.createSnapshot();
            UI.openModal(DOM.settingsModal);
            SettingsUIManager.updateApiStatusDisplay();
        });

        // Model label click -> opens settings (API config) with focus on model selector
        addClickListener(DOM.dashModelLabel, () => {
            SettingsUIManager.createSnapshot();
            UI.openModal(DOM.settingsModal);
            SettingsUIManager.updateApiStatusDisplay();
            // Highlight the model selector for clear feedback
            UI.highlightSettingsElement('iaModelSelect', { tab: 'advanced' });
        });

        // Generation Dashboard badge click handlers
        // Error badge -> regenerate errors
        addClickListener(DOM.dashErrors, () => {
            import('../EventHandlersManager.js').then(({ EventHandlersManager }) => {
                EventHandlersManager.handleRegenerateErrorsClick?.();
            });
        });

        // Cancel button during generation
        addClickListener(DOM.dashCancelBtn, async () => {
            // 1. Cancel mass import if running
            import('../MassImportManager.js').then(({ MassImportManager }) => {
                if (MassImportManager.massImportAbortController) {
                    MassImportManager.massImportAbortController.abort();
                    MassImportManager.massImportAbortController = null;
                }
            });

            // 2. Cancel Focus Panel active generations (refinements)
            import('../FocusPanelManager.js').then(({ FocusPanelManager }) => {
                if (FocusPanelManager._activeGenerations && FocusPanelManager._activeGenerations.size > 0) {
                    for (const [studentId, controller] of FocusPanelManager._activeGenerations) {
                        if (controller && typeof controller.abort === 'function') {
                            controller.abort();
                        }
                    }
                    FocusPanelManager._activeGenerations.clear();
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
    });
    },

/**
 * Configure les listeners spécifiques au Cloud (Sauvegarde/Chargement).
 * Extrait pour la lisibilité.
 * @param {Function} addClickListener - Helper pour créer les listeners
 * @param {Function} closeMenu - Fonction pour fermer le menu action
 */
setupCloudListeners(addClickListener, closeMenu) {
    const cloudSaveBtn = document.getElementById('cloudSaveMenuBtn');
    if (cloudSaveBtn) {
        // Always show the button
        cloudSaveBtn.style.display = 'flex';

        // Update last save time on menu open
        DOM.headerMenuBtn?.addEventListener('click', async () => {
            const hintEl = document.getElementById('cloudSaveTimeHint');
            try {
                const { SyncService } = await import('../../services/SyncService.js');
                if (SyncService.isConnected()) {
                    const lastSync = localStorage.getItem('bulletin_last_sync');
                    if (hintEl && lastSync) {
                        const date = new Date(parseInt(lastSync));
                        hintEl.textContent = `Dernière : ${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
                    } else if (hintEl) {
                        hintEl.textContent = 'Prêt à sauvegarder';
                    }
                } else if (hintEl) {
                    hintEl.textContent = 'Connexion requise';
                }
            } catch {
                if (hintEl) hintEl.textContent = 'Connexion requise';
            }
        });

        // Handle save click - connect if needed, then save
        cloudSaveBtn.addEventListener('click', async () => {
            const labelEl = cloudSaveBtn.querySelector('.cloud-save-label');
            const originalLabel = labelEl?.textContent;

            try {
                const { SyncService } = await import('../../services/SyncService.js');

                // If not connected, connect first
                if (!SyncService.isConnected()) {
                    cloudSaveBtn.classList.add('saving');
                    if (labelEl) labelEl.textContent = 'Connexion';

                    const connected = await SyncService.connect('google');
                    if (!connected) {
                        UI.showNotification('Connexion annulée.', 'warning');
                        return;
                    }

                    // Update Settings UI if open
                    const actionsBar = document.getElementById('cloudActionsBar');
                    if (actionsBar) actionsBar.style.display = 'flex';

                    // [FIX] Stop here. Do not auto-save after connection.
                    UI.showNotification('Connecté à Google Drive', 'success');
                    closeMenu();
                    return;
                }

                // Now save
                cloudSaveBtn.classList.add('saving');
                if (labelEl) labelEl.textContent = 'Enreg...';

                await SyncService.saveToCloud();

                // Update timestamp
                const hintEl = document.getElementById('cloudSaveTimeHint');
                if (hintEl) {
                    const now = new Date();
                    hintEl.textContent = `Dernière : ${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
                }

                UI.showNotification('Données envoyées sur le Cloud !', 'success');
                closeMenu();
            } catch (error) {
                console.error('Cloud save error:', error);
                UI.showNotification('Erreur de sauvegarde : ' + error.message, 'error');
            } finally {
                cloudSaveBtn.classList.remove('saving');
                if (labelEl) labelEl.textContent = originalLabel;
            }
        });

        // Handle load click
        const cloudLoadBtn = document.getElementById('cloudLoadMenuBtn');
        if (cloudLoadBtn) {
            cloudLoadBtn.addEventListener('click', async () => {
                const labelEl = cloudLoadBtn.querySelector('.cloud-save-label');
                const originalLabel = labelEl?.textContent;

                try {
                    const { SyncService } = await import('../../services/SyncService.js');

                    if (!SyncService.isConnected()) {
                        const connected = await SyncService.connect('google');
                        if (!connected) return;
                    }

                    UI.showCustomConfirm(
                        "⚠️ ÉCRASER LES DONNÉES LOCALES ?\n\nVous êtes sur le point de récupérer la sauvegarde du Cloud.\nCeci remplacera TOUTES vos données actuelles (élèves, paramètres) par celles du Cloud.\n\nCette action est irréversible.",
                        async () => {
                            try {
                                cloudLoadBtn.classList.add('saving');
                                if (labelEl) labelEl.textContent = 'Récupération...';

                                const result = await SyncService.loadFromCloud();
                                if (result.success) {
                                    UI.showNotification('Données récupérées avec succès !', 'success');
                                    setTimeout(() => window.location.reload(), 1000);
                                } else {
                                    UI.showNotification('Aucune sauvegarde valide trouvée sur le Cloud.', 'warning');
                                }
                                // Normally close menu, but we might reload
                                closeMenu();
                            } catch (error) {
                                console.error('Cloud load error:', error);
                                UI.showNotification('Erreur de récupération : ' + error.message, 'error');
                            } finally {
                                cloudLoadBtn.classList.remove('saving');
                                if (labelEl) labelEl.textContent = originalLabel;
                            }
                        }
                    );

                } catch (error) {
                    console.error('Cloud load setup error:', error);
                }
            });
        }
    }
}
};
