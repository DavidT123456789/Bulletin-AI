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
import { CloudActionsManager } from '../CloudActionsManager.js';
import { EventHandlersManager } from '../EventHandlersManager.js';
import { SettingsModalListeners } from './SettingsModalListeners.js';
import { MassImportManager } from '../MassImportManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { ModelSelectionManager } from '../ModelSelectionManager.js';
import { HistoryManager } from '../HistoryManager.js';

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
            DOM.headerMenuBtn.setAttribute('aria-haspopup', 'menu');
            DOM.headerMenuBtn.setAttribute('aria-expanded', 'false');

            const closeMenu = (options = {}) => {
                const wasOpen = DOM.headerMenuDropdown.classList.contains('open');
                DOM.headerMenuDropdown.classList.remove('open');
                DOM.headerMenuBtn.classList.remove('active');
                DOM.headerMenuBtn.setAttribute('aria-expanded', 'false');
                DOM.headerMenuBtn.blur();
                document.body.classList.remove('header-menu-open');
                DOM.headerMenuDropdown.style.maxHeight = '';

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

                if (wasOpen && !options?.causedByHistory && HistoryManager.isOpen('headerMenu')) {
                    HistoryManager.handleManualClose('headerMenu');
                }
            };
            this.closeHeaderMenu = closeMenu;

            addClickListener(DOM.headerMenuBtn, (e) => {
                e.stopPropagation();
                if (document.body.classList.contains('is-cloud-syncing')) return;
                const isOpening = !DOM.headerMenuDropdown.classList.contains('open');

                if (isOpening) {
                    ModelSelectionManager.closeDropdown?.();
                    DOM.headerMenuDropdown.classList.add('open');
                    DOM.headerMenuBtn.classList.add('active');
                    DOM.headerMenuBtn.setAttribute('aria-expanded', 'true');
                    document.body.classList.add('header-menu-open');

                    const btnRect = DOM.headerMenuBtn.getBoundingClientRect();
                    const availableBelow = window.innerHeight - btnRect.bottom - 20;
                    if (availableBelow > 120) {
                        DOM.headerMenuDropdown.style.maxHeight = `${Math.floor(availableBelow)}px`;
                    }
                    DOM.headerMenuDropdown.scrollTop = 0;

                    // TELEPORTATION FIX FOR MOBILE
                    // When header has glassmorphism (backdrop-filter), it creates a stacking context 
                    // that traps fixed/absolute children. We must move the menu to body.
                    if (window.innerWidth < 768) {
                        document.body.appendChild(DOM.headerMenuDropdown);

                        // Calculated positioning
                        DOM.headerMenuDropdown.style.position = 'fixed';
                        DOM.headerMenuDropdown.style.top = `${btnRect.bottom + 12}px`;
                        DOM.headerMenuDropdown.style.right = '16px';
                        DOM.headerMenuDropdown.style.left = 'auto';
                        DOM.headerMenuDropdown.style.zIndex = '10001'; // Above everything
                        DOM.headerMenuDropdown.style.width = '220px'; // Ensure good width
                    }

                    HistoryManager.pushState('headerMenu', (opts) => closeMenu(opts));
                    this._onMenuOpen();
                } else {
                    closeMenu();
                }
            });

            // Close menu when clicking outside (capture phase to absorb click and prevent triggering underlying cards/buttons)
            if (this._headerMenuDocClick) {
                document.removeEventListener('click', this._headerMenuDocClick, true);
            }
            this._headerMenuDocClick = (e) => {
                if (DOM.headerMenuDropdown.classList.contains('open') &&
                    !DOM.headerMenuDropdown.contains(e.target) &&
                    !DOM.headerMenuBtn.contains(e.target)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    closeMenu();
                }
            };
            document.addEventListener('click', this._headerMenuDocClick, true);

            // Close menu when scrolling main content
            if (this._headerMenuScroll) {
                window.removeEventListener('scroll', this._headerMenuScroll, true);
            }
            this._headerMenuScroll = (e) => {
                if (DOM.headerMenuDropdown.classList.contains('open') &&
                    !(e.target instanceof Node && DOM.headerMenuDropdown.contains(e.target))) {
                    closeMenu();
                }
            };
            window.addEventListener('scroll', this._headerMenuScroll, { capture: true, passive: true });

            // Close on Escape key
            if (this._headerMenuKeydown) {
                document.removeEventListener('keydown', this._headerMenuKeydown);
            }
            this._headerMenuKeydown = (e) => {
                if (e.key === 'Escape' && DOM.headerMenuDropdown.classList.contains('open')) {
                    closeMenu();
                }
            };
            document.addEventListener('keydown', this._headerMenuKeydown);


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
                    closeMenu();
                    if (window.triggerAppUpdate) {
                        window.triggerAppUpdate(updateMenuItem);
                    } else {
                        window.location.reload();
                    }
                });
            }

            if (DOM.installPwaBtn) {
                addClickListener(DOM.installPwaBtn, () => {
                    closeMenu();
                });
            }

            // Cloud Save/Load Logic
            this.setupCloudListeners(addClickListener, closeMenu);

            // Integrated Menu Items Handlers
            if (DOM.personalizationBtn) {
                addClickListener(DOM.personalizationBtn, () => {
                    closeMenu();
                    UI.openModal(DOM.personalizationModal);
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



        // FAST AI MODEL SELECTION / ONBOARDING:
        // Clic sur l'en-tête ouvre directement les paramètres si aucune clé n'est prête,
        // ou le menu déroulant rapide des modèles si au moins une IA est active.
        if (DOM.headerGenDashboard) {
            addClickListener(DOM.headerGenDashboard, (e) => {
                // Ignore clicks on Cancel button during generation
                if (e.target.closest('#dashCancelBtn')) return;

                ModelSelectionManager.handleHeaderClick();
            });

            DOM.headerGenDashboard.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target.closest('#dashCancelBtn')) return;
                    e.preventDefault();
                    ModelSelectionManager.handleHeaderClick();
                }
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

        // --- "Connecter Google Drive" button (first-time users) ---
        const connectBtn = document.getElementById('cloudConnectBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', async () => {
                if (!navigator.onLine) {
                    UI.showNotification('Mode hors-ligne : vos modifications sont enregistrées sur cet appareil.', 'info');
                    return;
                }
                const iconEl = connectBtn.querySelector('iconify-icon');
                let wrapper = null;

                try {
                    connectBtn.classList.add('saving');
                    if (iconEl) {
                        wrapper = document.createElement('span');
                        wrapper.className = 'icon-spin-wrapper';
                        iconEl.parentNode.insertBefore(wrapper, iconEl);
                        wrapper.appendChild(iconEl);
                    }
                    const { SyncService } = await import('../../services/SyncService.js');
                    const connected = await SyncService.connect('google');
                    if (connected) {
                        UI.showNotification('Connecté à Google Drive', 'success');
                    } else {
                        UI.showNotification('Connexion annulée.', 'warning');
                    }
                } catch (error) {
                    const errorMsg = error?.message || error?.result?.error?.message || 'Erreur inconnue';
                    UI.showNotification('Erreur de connexion : ' + errorMsg, 'error');
                } finally {
                    connectBtn.classList.remove('saving');
                    if (wrapper && iconEl) {
                        wrapper.parentNode.insertBefore(iconEl, wrapper);
                        wrapper.remove();
                    }
                }
            });
        }

        // --- Save / Restore: shared orchestration, menu-specific button feedback ---
        const SPINNER_ICON = 'ph:spinner-gap-bold';
        const bindCloudAction = (btn, action) => {
            if (!btn) return;
            const labelEl = btn.querySelector('.cloud-save-label');
            const iconEl = btn.querySelector('iconify-icon');
            let restLabel = null;
            let restIcon = null;

            const onProgress = (label) => {
                if (label) {
                    if (iconEl?.getAttribute('icon') !== SPINNER_ICON) {
                        restIcon = iconEl?.getAttribute('icon') || null;
                        restLabel = labelEl?.textContent || null;
                    }
                    btn.classList.add('saving');
                    btn.setAttribute('aria-busy', 'true');
                    if (labelEl) labelEl.textContent = label;
                    iconEl?.setAttribute('icon', SPINNER_ICON);
                    iconEl?.classList.add('rotate-icon');
                    return;
                }
                btn.classList.remove('saving');
                btn.removeAttribute('aria-busy');
                // SyncService may have refreshed the button state meanwhile (e.g. Reconnecter -> Sauvegarder)
                if (restIcon && iconEl?.getAttribute('icon') === SPINNER_ICON) {
                    iconEl.setAttribute('icon', restIcon);
                    if (labelEl && restLabel) labelEl.textContent = restLabel;
                }
                iconEl?.classList.remove('rotate-icon');
            };

            btn.addEventListener('click', () => action({ onProgress, onBeforePrompt: closeMenu }));
        };

        bindCloudAction(cloudSaveBtn, (hooks) => (
            cloudSaveBtn.dataset.cloudMode === 'reconnect'
                ? CloudActionsManager.reconnect(hooks)
                : CloudActionsManager.save(hooks)
        ));
        bindCloudAction(document.getElementById('cloudLoadMenuBtn'), (hooks) => CloudActionsManager.restore(hooks));
    },

    /**
     * Update the cloud reminder dot on the menu button.
     * Delegates to SyncService.refreshLocalIndicator for a unified single-source state check.
     * @param {Object} [syncService] - Optional SyncService instance
     * @private
     */
    async _updateCloudReminder(syncService) {
        if (!localStorage.getItem('bulletin_sync_provider') || !navigator.onLine) {
            DOM.headerMenuBtn?.classList.remove('has-cloud-reminder', 'has-cloud-conflict', 'has-cloud-warning');
            return;
        }

        let service = syncService || window.SyncService;
        if (!service) {
            try {
                const mod = await import('../../services/SyncService.js');
                service = mod.SyncService;
            } catch { /* Ignore */ }
        }

        if (!service || !service._isOnline) {
            DOM.headerMenuBtn?.classList.remove('has-cloud-reminder', 'has-cloud-conflict', 'has-cloud-warning');
            return;
        }

        service._wasConfigured = true;
        service.refreshLocalIndicator();
    },

    /**
     * Triggered when header menu dropdown opens.
     * Automatically refreshes cloud sync status with checking spinner.
     * @private
     */
    async _onMenuOpen() {
        if (!localStorage.getItem('bulletin_sync_provider')) return;
        try {
            const SyncService = window.SyncService || (await import('../../services/SyncService.js')).SyncService;
            await SyncService.refreshStatus({ showChecking: true });
        } catch (e) {
            console.warn('[GeneralListeners] Failed to refresh cloud state on menu open:', e);
        }
    },

    /**
     * Initialize the cloud reminder on app startup.
     * Called once after SyncService.init() to set the menu button dot.
     */
    initCloudReminder() {
        if (!localStorage.getItem('bulletin_sync_provider')) return;
        this._updateCloudReminder();
    }
};

