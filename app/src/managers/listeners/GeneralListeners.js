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
import { HistoryManager } from '../HistoryManager.js';  // Import ajouté
import { EventHandlersManager } from '../EventHandlersManager.js';
import { SettingsModalListeners } from './SettingsModalListeners.js';
import { MassImportManager } from '../MassImportManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';

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
            // Store original parent for clean restoration
            const originalParent = DOM.headerMenuDropdown.parentElement;

            const closeMenu = (options = {}) => {
                // [UX Mobile] History Cleanup
                if (!options.causedByHistory) {
                    HistoryManager.handleManualClose('headerMenu');
                }

                DOM.headerMenuDropdown.classList.remove('open');
                DOM.headerMenuBtn.classList.remove('active');

                // RESTORE to header if it was teleported
                if (DOM.headerMenuDropdown.parentElement === document.body && originalParent) {
                    originalParent.appendChild(DOM.headerMenuDropdown);
                    // Clear precise positioning styles applied during teleport
                    DOM.headerMenuDropdown.style.top = '';
                    DOM.headerMenuDropdown.style.right = '';
                    DOM.headerMenuDropdown.style.left = '';
                    DOM.headerMenuDropdown.style.position = '';
                    DOM.headerMenuDropdown.style.width = '';
                }
            };

            addClickListener(DOM.headerMenuBtn, (e) => {
                e.stopPropagation();
                const isOpening = !DOM.headerMenuDropdown.classList.contains('open');

                if (isOpening) {
                    // [UX Mobile] Push History State
                    HistoryManager.pushState('headerMenu', closeMenu);

                    DOM.headerMenuDropdown.classList.add('open');
                    DOM.headerMenuBtn.classList.add('active');

                    // TELEPORTATION FIX FOR MOBILE
                    // When header has glassmorphism (backdrop-filter), it creates a stacking context 
                    // that traps fixed/absolute children. We must move the menu to body.
                    if (window.innerWidth < 768) {
                        const btnRect = DOM.headerMenuBtn.getBoundingClientRect();
                        document.body.appendChild(DOM.headerMenuDropdown);

                        // Calculated positioning
                        DOM.headerMenuDropdown.style.position = 'fixed';
                        DOM.headerMenuDropdown.style.top = `${btnRect.bottom + 12}px`;
                        DOM.headerMenuDropdown.style.right = '16px';
                        DOM.headerMenuDropdown.style.left = 'auto';
                        DOM.headerMenuDropdown.style.zIndex = '10001'; // Above everything
                        DOM.headerMenuDropdown.style.width = '220px'; // Ensure good width
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

            // Integrated Menu Items Handlers
            if (DOM.personalizationBtn) {
                addClickListener(DOM.personalizationBtn, () => {
                    closeMenu();
                    SettingsUIManager.createSnapshot();
                    UI.openModal(DOM.personalizationModal);
                    SettingsModalListeners._updateStudentContextAndPrompt();
                });
            }

            if (DOM.settingsButton) {
                addClickListener(DOM.settingsButton, () => {
                    closeMenu();
                    SettingsUIManager.createSnapshot();
                    UI.openModal(DOM.settingsModal);
                    SettingsUIManager.updateApiStatusDisplay();
                });
            }

            if (DOM.helpButton) {
                addClickListener(DOM.helpButton, () => {
                    closeMenu();
                    App.handleHelpButtonClick();
                });
            }
        }



        // Personalization Modal Actions
        const closePersonalization = (isSave = false) => {
            // If cancelling (not saving), restore the original state
            if (!isSave) {
                const restored = SettingsUIManager.restoreSnapshot();
                if (restored) {
                    // Update UI to reflect restored state
                    SettingsUIManager.updatePersonalizationState();
                    FormUI.updateSettingsFields();
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



        // UNIFIED PILL INTERACTION: Clicking anywhere on the dashboard opens settings
        // (except if clicking on specific action buttons inside like Cancel or Errors)
        if (DOM.headerGenDashboard) {
            addClickListener(DOM.headerGenDashboard, (e) => {
                // Ignore clicks that originated from specific buttons 
                // (though stopPropagation in their listeners should handle this, double-check is safer)
                if (e.target.closest('#dashCancelBtn') || e.target.closest('#dashErrors')) return;

                SettingsUIManager.createSnapshot();
                UI.openModal(DOM.settingsModal);
                SettingsUIManager.updateApiStatusDisplay();
                // Highlight the model selector for clear feedback
                UI.highlightSettingsElement('iaModelSelect', { tab: 'advanced' });
            });
        }

        // Generation Dashboard badge click handlers
        // Error badge -> regenerate errors
        addClickListener(DOM.dashErrors, (e) => {
            e && e.stopPropagation(); // Prevent opening settings
            EventHandlersManager.handleRegenerateErrorsClick?.();
        });

        // Cancel button during generation
        addClickListener(DOM.dashCancelBtn, async (e) => {
            e && e.stopPropagation(); // Prevent opening settings

            // 1. Cancel mass import if running
            if (MassImportManager.massImportAbortController) {
                MassImportManager.massImportAbortController.abort();
                MassImportManager.massImportAbortController = null;
            }

            // 2. Cancel Focus Panel active generations (refinements)
            if (FocusPanelManager._activeGenerations && FocusPanelManager._activeGenerations.size > 0) {
                for (const [studentId, controller] of FocusPanelManager._activeGenerations) {
                    if (controller && typeof controller.abort === 'function') {
                        controller.abort();
                    }
                }
                FocusPanelManager._activeGenerations.clear();
            }
        });



        // Sidebar removed - toggling handled by Hub Modal now

        // Option G: Accordion toggle for history section
        addClickListener(DOM.historyToggle, () => {
            const accordion = DOM.historyAccordion;
            if (accordion) {
                accordion.classList.toggle('open');
            }
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
        if (!cloudSaveBtn) return;

        // --- Helper: ensure connection, auto-reconnect if expired ---
        const ensureConnected = async (SyncService) => {
            if (SyncService.isConnected()) return true;
            const providerName = SyncService.currentProviderName || localStorage.getItem('bulletin_sync_provider') || 'google';
            return SyncService.connect(providerName);
        };

        // --- "Connecter Google Drive" button (first-time users) ---
        const connectBtn = document.getElementById('cloudConnectBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', async () => {
                try {
                    connectBtn.classList.add('saving');
                    const { SyncService } = await import('../../services/SyncService.js');
                    const connected = await SyncService.connect('google');
                    if (connected) {
                        UI.showNotification('Connecté à Google Drive', 'success');
                        closeMenu();
                    } else {
                        UI.showNotification('Connexion annulée.', 'warning');
                    }
                } catch (error) {
                    UI.showNotification('Erreur de connexion : ' + error.message, 'error');
                } finally {
                    connectBtn.classList.remove('saving');
                }
            });
        }

        // --- Update time hints on menu open ---
        DOM.headerMenuBtn?.addEventListener('click', async () => {
            try {
                const { SyncService } = await import('../../services/SyncService.js');
                const saveHint = document.getElementById('cloudSaveTimeHint');
                const loadHint = document.getElementById('cloudLoadTimeHint');

                if (SyncService.isConnected()) {
                    const lastSync = localStorage.getItem('bulletin_last_sync');
                    if (saveHint && lastSync) {
                        const date = new Date(parseInt(lastSync));
                        saveHint.textContent = `Dernière : ${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
                    } else if (saveHint) {
                        saveHint.textContent = 'Prêt à sauvegarder';
                    }

                    // Refresh remote status for Load hint
                    if (loadHint) {
                        await SyncService.checkRemoteStatus();
                    }
                }
            } catch { /* Ignore */ }
        });

        // --- Save button: auto-reconnect then save ---
        cloudSaveBtn.addEventListener('click', async () => {
            const labelEl = cloudSaveBtn.querySelector('.cloud-save-label');
            const originalLabel = labelEl?.textContent;

            try {
                const { SyncService } = await import('../../services/SyncService.js');
                cloudSaveBtn.classList.add('saving');

                // Auto-reconnect if needed
                if (!SyncService.isConnected()) {
                    if (labelEl) labelEl.textContent = 'Connexion...';
                    const connected = await ensureConnected(SyncService);
                    if (!connected) {
                        UI.showNotification('Connexion annulée.', 'warning');
                        return;
                    }
                }

                if (labelEl) labelEl.textContent = 'Enreg...';
                await SyncService.saveToCloud();

                const hintEl = document.getElementById('cloudSaveTimeHint');
                if (hintEl) {
                    const now = new Date();
                    hintEl.textContent = `Dernière : ${now.toLocaleDateString('fr-FR')} ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
                }

                UI.showNotification('Données envoyées sur le Cloud !', 'success');
                closeMenu();
            } catch (error) {
                UI.showNotification('Erreur de sauvegarde : ' + error.message, 'error');
            } finally {
                cloudSaveBtn.classList.remove('saving');
                if (labelEl) labelEl.textContent = originalLabel;
            }
        });

        // --- Load button: auto-reconnect then load ---
        const cloudLoadBtn = document.getElementById('cloudLoadMenuBtn');
        if (cloudLoadBtn) {
            cloudLoadBtn.addEventListener('click', async () => {
                const labelEl = cloudLoadBtn.querySelector('.cloud-save-label');
                const originalLabel = labelEl?.textContent;

                try {
                    const { SyncService } = await import('../../services/SyncService.js');

                    if (!SyncService.isConnected()) {
                        const connected = await ensureConnected(SyncService);
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
                                closeMenu();
                            } catch (error) {
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

        // --- Reconnect button ---
        const reconnectBtn = document.getElementById('cloudReconnectBtn');
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', async () => {
                const iconEl = reconnectBtn.querySelector('iconify-icon');
                const originalIcon = iconEl?.getAttribute('icon');

                try {
                    reconnectBtn.classList.add('saving');
                    if (iconEl) {
                        iconEl.setAttribute('icon', 'solar:spinner-bold-duotone');
                        iconEl.classList.add('icon-spin');
                    }

                    const { SyncService } = await import('../../services/SyncService.js');
                    const success = await SyncService.reconnect({ skipIndicator: true });

                    if (success) {
                        closeMenu();
                    } else {
                        UI.showNotification('Reconnexion annulée', 'info');
                    }
                } catch (error) {
                    UI.showNotification('Erreur de reconnexion : ' + error.message, 'error');
                } finally {
                    reconnectBtn.classList.remove('saving');
                    if (iconEl) {
                        iconEl.setAttribute('icon', originalIcon);
                        iconEl.classList.remove('icon-spin');
                    }
                }
            });
        }
    }
};
