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
                    UI.openModal(DOM.personalizationModal);
                    SettingsModalListeners._updateStudentContextAndPrompt();
                });
            }

            if (DOM.settingsButton) {
                addClickListener(DOM.settingsButton, () => {
                    closeMenu();
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
            // Fermer la modale d'abord pour une animation fluide
            UI.closeModal(DOM.personalizationModal);

            // If cancelling (not saving), restore the original state after animation (250ms)
            if (!isSave) {
                setTimeout(() => {
                    const restored = SettingsUIManager.restoreSnapshot();
                    if (restored) {
                        // Update UI to reflect restored state
                        SettingsUIManager.updatePersonalizationState();
                        FormUI.updateSettingsFields();
                    }
                }, 260);
            } else {
                // Confirm changes: clear snapshot without restoring
                UIState.settingsBeforeEdit = {};
            }
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
                // Ignore clicks on the Cancel button during generation
                if (e.target.closest('#dashCancelBtn')) return;

                UI.openModal(DOM.settingsModal);
                SettingsUIManager.updateApiStatusDisplay();
                // Highlight the model selector for clear feedback
                UI.highlightSettingsElement('iaModelSelect', { tab: 'advanced' });
            });
        }



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

        // --- Refresh sync state on menu open ---
        DOM.headerMenuBtn?.addEventListener('click', async () => {
            try {
                const { SyncService } = await import('../../services/SyncService.js');
                if (SyncService.isConnected()) {
                    await SyncService.checkRemoteStatus();
                }
                this._updateCloudReminder();
            } catch { /* Ignore */ }
        });

        // --- Save button: guard empty data + confirmation + auto-reconnect ---
        cloudSaveBtn.addEventListener('click', async () => {
            const labelEl = cloudSaveBtn.querySelector('.cloud-save-label');
            const originalLabel = labelEl?.textContent;

            try {
                const { SyncService } = await import('../../services/SyncService.js');
                const { runtimeState, userSettings } = await import('../../state/State.js');

                const studentCount = runtimeState.data.generatedResults?.length || 0;
                const classCount = userSettings.academic.classes?.length || 0;

                if (studentCount === 0) {
                    closeMenu();
                    const isPurge = runtimeState._dataPurgeDetected;
                    const message = isPurge
                        ? `Vos données élèves semblent avoir été <strong>effacées par le navigateur</strong> après une longue inactivité.`
                        : `Vos données locales sont <strong>vides</strong> (0 élève).`;
                    const shouldRestore = await UI.showCustomConfirm(
                        message,
                        null, null,
                        {
                            title: isPurge ? 'Restaurer depuis le Cloud ?' : 'Données locales vides',
                            confirmText: 'Restaurer depuis le Cloud',
                            cancelText: 'Annuler',
                            isDanger: false,
                            detailsHtml: `
                                <p style="margin-bottom:8px;">Envoyer des données vides écraserait votre sauvegarde Cloud existante.</p>
                                <p>Nous vous recommandons de <strong>restaurer</strong> vos données depuis le Cloud pour récupérer votre travail.</p>
                            `
                        }
                    );
                    if (shouldRestore) {
                        document.getElementById('cloudLoadMenuBtn')?.click();
                    }
                    return;
                }

                closeMenu();

                const syncState = SyncService._lastSyncState;
                const isCloudNewer = syncState === 'cloud-changes' || syncState === 'conflict';
                const detailsHtml = isCloudNewer
                    ? `<p style="margin-bottom:8px;"><strong>Attention :</strong> Le Cloud contient des modifications plus récentes (probablement depuis un autre appareil).</p>
                       <p>Si vous sauvegardez, la version Cloud sera <strong>écrasée</strong> par vos données locales.</p>`
                    : `<p>Ceci remplacera la sauvegarde Cloud existante. Vos données seront accessibles depuis n'importe quel appareil connecté.</p>`;

                const confirmed = await UI.showCustomConfirm(
                    `Vous allez envoyer <strong>${studentCount} élève${studentCount > 1 ? 's' : ''}</strong> dans <strong>${classCount} classe${classCount > 1 ? 's' : ''}</strong>.`,
                    null, null,
                    {
                        title: 'Sauvegarder vers le Cloud ?',
                        confirmText: 'Sauvegarder',
                        cancelText: 'Annuler',
                        isDanger: isCloudNewer,
                        detailsHtml
                    }
                );
                if (!confirmed) return;

                cloudSaveBtn.classList.add('saving');

                if (!SyncService.isConnected()) {
                    if (labelEl) labelEl.textContent = 'Connexion...';
                    const connected = await ensureConnected(SyncService);
                    if (!connected) {
                        UI.showNotification('Connexion annulée.', 'warning');
                        return;
                    }
                }

                if (labelEl) labelEl.textContent = 'Envoi...';
                await SyncService.saveToCloud();

                DOM.headerMenuBtn?.classList.remove('has-cloud-reminder');

                UI.showNotification('Données envoyées sur le Cloud !', 'success');
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

                    closeMenu();

                    const syncState = SyncService._lastSyncState;
                    const hasLocalChanges = syncState === 'local-changes' || syncState === 'conflict';
                    const restoreDetailsHtml = hasLocalChanges
                        ? `<p style="margin-bottom:8px;"><strong>Attention :</strong> Vous avez des modifications locales non sauvegardées qui seront perdues.</p>
                           <p style="opacity:0.8;">Une copie de sécurité de votre état actuel sera créée automatiquement avant la restauration.</p>`
                        : `<p style="margin-bottom:8px;">Vos données locales (élèves, classes, paramètres) seront écrasées par celles du Cloud.</p>
                           <p style="opacity:0.8;">Une copie de sécurité de votre état actuel sera créée automatiquement avant la restauration.</p>`;

                    UI.showCustomConfirm(
                        `Ceci remplacera <strong>toutes</strong> vos données locales actuelles.`,
                        async () => {
                            try {
                                cloudLoadBtn.classList.add('saving');
                                if (labelEl) labelEl.textContent = 'Restauration...';

                                const { StorageManager } = await import('../../managers/StorageManager.js');
                                await StorageManager.savePreRestoreSnapshot();

                                const result = await SyncService.loadFromCloud();
                                if (result.success) {
                                    UI.showNotification('Données restaurées avec succès !', 'success');
                                    setTimeout(() => window.location.reload(), 1000);
                                } else {
                                    UI.showNotification('Aucune sauvegarde valide trouvée sur le Cloud.', 'warning');
                                }
                            } catch (error) {
                                UI.showNotification('Erreur de restauration : ' + error.message, 'error');
                            } finally {
                                cloudLoadBtn.classList.remove('saving');
                                if (labelEl) labelEl.textContent = originalLabel;
                            }
                        },
                        null,
                        {
                            title: 'Restaurer depuis le Cloud ?',
                            confirmText: 'Oui, restaurer',
                            cancelText: 'Annuler',
                            isDanger: true,
                            detailsHtml: restoreDetailsHtml
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
    },

    /**
     * Update the cloud reminder dot on the menu button.
     * Delegates to SyncService._computeSyncState for a unified state check.
     * @private
     */
    _updateCloudReminder() {
        if (!localStorage.getItem('bulletin_sync_provider')) return;

        const needsAction = this._hasUnsyncedChanges();
        DOM.headerMenuBtn?.classList.toggle('has-cloud-reminder', needsAction);
    },

    /**
     * Check if local data has unsynced changes (used for menu dot and boot check).
     * Mirrors SyncService._computeSyncState logic without requiring the service import.
     * @returns {boolean}
     * @private
     */
    _hasUnsyncedChanges() {
        const lastSync = parseInt(localStorage.getItem('bulletin_last_sync') || '0');
        const lastModified = parseInt(localStorage.getItem('bulletin_last_modified') || '0');
        return lastModified > lastSync;
    },

    /**
     * Initialize the cloud reminder on app startup.
     * Called once after SyncService.init() to set the menu button dot.
     */
    initCloudReminder() {
        if (!localStorage.getItem('bulletin_sync_provider')) return;

        if (this._hasUnsyncedChanges()) {
            DOM.headerMenuBtn?.classList.add('has-cloud-reminder');
        }
    }
};

