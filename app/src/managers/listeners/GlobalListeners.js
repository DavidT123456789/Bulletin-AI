/**
 * @fileoverview Listeners globaux (clavier, scroll, resize)
 * @module managers/listeners/GlobalListeners
 */

import { appState } from '../../state/State.js';
import { CONSTS } from '../../config/Config.js';
import { MODEL_SHORT_NAMES } from '../../config/models.js';
import { DOM } from '../../utils/DOM.js';
import { Utils } from '../../utils/Utils.js';
import { UI } from '../UIManager.js';
import { SettingsUIManager } from '../SettingsUIManager.js';
import { EventHandlersManager } from '../EventHandlersManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { ClassUIManager } from '../ClassUIManager.js';
import { MassImportManager } from '../MassImportManager.js';
import { ListViewManager } from '../ListViewManager.js';
import { ResultsUIManager } from '../ResultsUIManager.js';
import { DropdownManager } from '../DropdownManager.js';
import { TooltipsUI } from '../TooltipsManager.js';

export const GlobalListeners = {
    /**
     * Configure les listeners globaux (clavier, scroll, resize).
     */
    setup() {
        this._setupKeyboardListeners();
        this._setupScrollListeners();
        this._setupAiFallbackListener();
        this._setupBodyClickListener();
        this._setupResizeListener();
        this._setupStudentsUpdatedListener();
    },

    /**
     * Écoute l'événement 'studentsUpdated' pour synchroniser l'UI
     * après les imports en masse, imports de photos, ou modifications de données.
     * @private
     */
    _setupStudentsUpdatedListener() {
        window.addEventListener('studentsUpdated', () => {
            // Rafraîchir le compteur d'élèves dans l'en-tête et le dropdown
            ClassUIManager.updateStudentCount();
            // Rafraîchir la liste des élèves
            AppreciationsManager.renderResults();
            // Rafraîchir les statistiques
            UI?.updateStats?.();
            // Rafraîchir les boutons de contrôle
            UI?.updateControlButtons?.();
        });

        // Écoute les changements de dirty state pour mettre à jour la ligne spécifique
        window.addEventListener('studentDirtyStateChanged', async (e) => {
            const { studentId, result } = e.detail || {};
            if (!studentId) return;

            try {

                // Update the specific row dirty indicator
                if (ListViewManager?.updateStudentRow) {
                    ListViewManager.updateStudentRow(studentId);
                }

                // CRITICAL: Also update the "Actualiser" button badge count
                if (ResultsUIManager?.updateGenerateButtonState) {
                    ResultsUIManager.updateGenerateButtonState();
                }
            } catch (err) {
                console.warn('[GlobalListeners] Failed to update UI on dirty state change:', err);
            }
        });

        window.addEventListener('journalThresholdChanged', async () => {
            try {

                if (!ListViewManager?.updateStudentRow) return;

                // Update all rows with appreciations that have a hash (can be dirty)
                const results = appState.generatedResults || [];
                for (const result of results) {
                    if (result.promptHash || result.generationSnapshot) {
                        ListViewManager.updateStudentRow(result.id);
                    }
                }

                // Update the "Actualiser" button to reflect new dirty counts
                if (ResultsUIManager?.updateGenerateButtonState) {
                    ResultsUIManager.updateGenerateButtonState();
                }
            } catch (err) {
                console.warn('[GlobalListeners] Failed to update rows on threshold change:', err);
            }
        });
    },

    _setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (UI.activeModal) {
                if (e.key === 'Escape') UI.closeAllModals();
                if (e.key === 'Tab') EventHandlersManager.handleFocusTrap(e, UI.activeModal);

                // Ctrl+S to save settings when settings modal is open
                if (e.ctrlKey && (e.key === 's' || e.key === 'S') && UI.activeModal.id === 'settingsModal') {
                    e.preventDefault();
                    SettingsUIManager.saveSettings();
                }

                const keyMap = {
                    'studentDetailsModal': { 'ArrowLeft': DOM.prevStudentBtn, 'ArrowRight': DOM.nextStudentBtn }
                    // refinementModal removed - Focus Panel handles all refinement inline
                };
                const navButtons = keyMap[UI.activeModal.id];
                if (navButtons && navButtons[e.key] && !navButtons[e.key].disabled) {
                    e.preventDefault();
                    navButtons[e.key].click();
                }
            } else {
                // Global keyboard shortcuts when no modal is open

                // Ctrl+Shift+Enter to generate and go to next
                if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
                    e.preventDefault();
                    if (appState.currentInputMode === CONSTS.INPUT_MODE.SINGLE) {
                        DOM.generateAndNextBtn?.click();
                    } else {
                        DOM.importGenerateBtn?.click();
                    }
                    return;
                }

                // Ctrl+Enter or Ctrl+G to generate
                if (e.ctrlKey && (e.key === 'g' || e.key === 'G' || e.key === 'Enter')) {
                    e.preventDefault();
                    if (appState.currentInputMode === CONSTS.INPUT_MODE.MASS) {
                        DOM.importGenerateBtn?.click();
                    } else {
                        DOM.generateAppreciationBtn?.click();
                    }
                    return;
                }

                EventHandlersManager.handleResultListKeyboardNav(e);
            }
        });
    },

    _setupScrollListeners() {
        window.addEventListener('scroll', () => DOM.backToTopBtn.classList.toggle('show', window.scrollY > 200));
        DOM.backToTopBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    },

    _aiFallbackListenerAttached: false,
    _lastFallbackNotificationTime: 0,
    _fallbackNotificationDebounceMs: 3000,
    _modelHistory: [], // Track model usage history

    /**
     * Counter for active AI generations.
     * This unified approach ensures the header progress badge is hidden when ALL
     * concurrent generations complete, regardless of their context (single, mass, lab, refinement).
     * No need to pass context to each call site - it "just works".
     */
    _activeGenerationsCount: 0,

    _setupAiFallbackListener() {
        // Guard: avoid adding listener multiple times
        if (this._aiFallbackListenerAttached) return;
        this._aiFallbackListenerAttached = true;

        window.addEventListener('ai-fallback', (e) => {
            const { originalModel, usedModel, reason } = e.detail;

            appState.lastUsedFallbackModel = usedModel;
            appState.lastFallbackReason = reason;

            // Noms courts pour l'affichage
            const shortOriginal = MODEL_SHORT_NAMES[originalModel] || originalModel;
            const shortUsed = MODEL_SHORT_NAMES[usedModel] || usedModel;

            // Track model history
            this._modelHistory.push({ from: shortOriginal, to: shortUsed, reason, timestamp: Date.now() });
            if (this._modelHistory.length > 5) this._modelHistory.shift(); // Keep last 5

            // Déduplication : évite les notifications en double pour les appels parallèles
            const now = Date.now();
            if (now - this._lastFallbackNotificationTime > this._fallbackNotificationDebounceMs) {
                this._lastFallbackNotificationTime = now;

                // Notification toast
                let shortReason = reason || 'Erreur API';
                if (shortReason.length > 60) shortReason = shortReason.substring(0, 60) + '…';

                UI.showNotification(
                    `⚡ <strong>Fallback</strong> • ${shortOriginal} → ${shortUsed}<br>📋 <strong>Raison</strong> • ${shortReason}`,
                    'warning'
                );
            }

            // Animation de la pillule du modèle IA (migré vers dashModelLabel)
            if (DOM.headerGenDashboard && DOM.dashModelName) {
                const nameEl = DOM.dashModelName;
                const targetName = shortUsed.split(' ')[0]; // Keep first word only
                const currentDisplayedName = nameEl.textContent.trim();

                // 1. Activer l'état fallback (animation flash + couleur orange)
                DOM.headerGenDashboard.classList.add('fallback-active');

                // 2. Animer le changement de nom SEULEMENT si le texte change réellement
                if (currentDisplayedName !== targetName) {
                    nameEl.classList.add('model-name-transition', 'exit-up');

                    setTimeout(() => {
                        nameEl.classList.remove('model-name-transition', 'exit-up');
                        nameEl.classList.add('enter-from-down');
                        nameEl.textContent = targetName;

                        void nameEl.offsetHeight; // Force reflow

                        nameEl.classList.add('model-name-transition');
                        nameEl.classList.remove('enter-from-down');
                    }, 200);
                }

                // 3. Tooltip avec historique des modèles (sur la pilule entière)
                const historyLines = this._modelHistory.map(h => `${h.from} → ${h.to}`).join('<br>');
                const tooltipText = `⚡ Fallback actif<br>${historyLines}`;

                if (TooltipsUI?.updateTooltip) {
                    TooltipsUI.updateTooltip(DOM.headerGenDashboard, tooltipText);
                } else {
                    DOM.headerGenDashboard?.setAttribute('data-tooltip', tooltipText);
                }

                // 4. Retour à l'état normal après 8 secondes
                setTimeout(() => {
                    const defaultModelName = MODEL_SHORT_NAMES[appState.currentAIModel] || appState.currentAIModel;
                    const shortDefault = defaultModelName.split(' ')[0];

                    if (nameEl) {
                        const currentText = nameEl.textContent.trim();

                        // Animer le retour SEULEMENT si le texte change réellement
                        if (currentText !== shortDefault) {
                            nameEl.classList.add('model-name-transition', 'exit-down');

                            setTimeout(() => {
                                DOM.headerGenDashboard.classList.remove('fallback-active');
                                nameEl.classList.remove('model-name-transition', 'exit-down');
                                nameEl.classList.add('enter-from-up');
                                nameEl.textContent = shortDefault;

                                void nameEl.offsetHeight;

                                nameEl.classList.add('model-name-transition');
                                nameEl.classList.remove('enter-from-up');
                            }, 200);
                        } else {
                            // Pas d'animation nécessaire, juste retirer l'état fallback
                            DOM.headerGenDashboard.classList.remove('fallback-active');
                        }
                    } else {
                        DOM.headerGenDashboard.classList.remove('fallback-active');
                    }

                    // Restaurer le tooltip standard avec historique
                    const configuredModel = MODEL_SHORT_NAMES[appState.currentAIModel] || appState.currentAIModel;
                    const lastUsed = this._modelHistory.length > 0
                        ? this._modelHistory[this._modelHistory.length - 1].to
                        : configuredModel;

                    const finalTooltip = `⚙️ ${configuredModel}<br>✅ Dernier : ${lastUsed}`;

                    if (TooltipsUI?.updateTooltip) {
                        TooltipsUI.updateTooltip(DOM.headerGenDashboard, finalTooltip);
                    } else {
                        DOM.headerGenDashboard?.setAttribute('data-tooltip', finalTooltip);
                    }
                }, 8000);
            }
        });

        // Listener pour démarrer/arrêter l'animation de génération
        // UNIFIED APPROACH: Uses a counter to track ALL active generations.
        // This ensures the badge is hidden when ALL generations complete,
        // regardless of their source (single, mass, lab preview, refinement).
        window.addEventListener('ai-generation-start', async (e) => {
            this._activeGenerationsCount++;

            if (DOM.headerGenDashboard) {
                DOM.headerGenDashboard.classList.add('generating');
                DOM.headerGenDashboard.classList.remove('fallback-active');
            }

            // For isolated generations (single, refinement, lab preview), show the mini progress bar
            // Mass operations handle their own progress display (1/8, 2/8...)
            // Check if a mass operation is in progress - if so, don't interfere
            if (this._activeGenerationsCount === 1) {
                if (MassImportManager.massImportAbortController) {
                    // Mass operation in progress - let it handle its own progress
                    return;
                }

                UI.showHeaderProgress(0, 1, e.detail?.studentName || '');
            }
        });

        // Unified end handler: hide progress only when ALL generations are complete
        // AND no mass import/regeneration is in progress (those manage their own progress)
        window.addEventListener('ai-generation-end', async (e) => {
            this._activeGenerationsCount = Math.max(0, this._activeGenerationsCount - 1);

            // Only hide when all concurrent generations are done
            if (this._activeGenerationsCount === 0) {
                // Check if a mass operation is in progress - if so, let it handle its own progress
                if (MassImportManager.massImportAbortController) {
                    // Mass operation in progress - don't interfere with its progress display
                    return;
                }

                UI.hideHeaderProgress();
            }
        });
    },

    _setupBodyClickListener() {
        document.body.addEventListener('click', e => {
            const isStartingEdit = e.target.closest('[data-action="edit"]');

            if (appState.currentEditingId && !isStartingEdit && !e.target.closest('#inputSection') && !e.target.closest('.modal')) {
                AppreciationsManager.resetForm(false);
                return;
            }

            if (appState.activeStatFilter && !e.target.closest('.stats-container') && !e.target.closest('.appreciation-result') && !e.target.closest('.output-toolbar') && !e.target.closest('.modal')) {
                EventHandlersManager.handleStatFilterClick(null);
            }

            const link = e.target.closest('.link-to-settings, [data-action="open-help"]');
            if (link) {
                e.preventDefault();
                if (link.dataset.action === "open-help") {
                    UI.openModal(DOM.helpModal, { isStacked: true });
                    const section = document.getElementById(link.dataset.targetSection);
                    if (section) {
                        section.open = true;
                        setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                    }
                } else {
                    UI.closeAllModals();
                    // Explicitly close actions dropdown and custom dropdowns
                    DOM.actionsDropdown?.classList.remove('show');
                    DropdownManager.closeAll();

                    setTimeout(() => {
                        UI.openModal(DOM.settingsModal);
                        // Use centralized highlight utility
                        UI.highlightSettingsElement(link.dataset.targetElement, {
                            tab: link.dataset.targetTab
                        });
                    }, 350);
                }
            }

            // Fermer les menus actions et custom dropdowns au clic extérieur
            if (DOM.actionsDropdown && !DOM.actionsDropdown.contains(e.target)) {
                DOM.actionsDropdown.classList.remove('show');
            }
            // Fermer les custom dropdowns si on clique en dehors (mais pas si on clique sur le trigger d'un custom dropdown)
            if (!e.target.closest('.custom-dropdown')) {
                try {
                    DropdownManager.closeAll();
                } catch { }
            } else {
                // Si on clique SUR un custom dropdown, fermer le menu actions
                DOM.actionsDropdown?.classList.remove('show');
            }

            // Handle result card actions
            if (e.target.closest('.appreciation-result [data-action]')) {
                EventHandlersManager.handleResultCardAction(e);
            }
        });
    },

    _setupResizeListener() {
        window.addEventListener('resize', Utils.debounce(() => {
            // CSS handles responsive layout, no direct action needed
        }, 200));
    }
};
