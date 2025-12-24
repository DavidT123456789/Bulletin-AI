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

            // Déduplication : évite les notifications en double pour les appels parallèles
            const now = Date.now();
            if (now - this._lastFallbackNotificationTime > this._fallbackNotificationDebounceMs) {
                this._lastFallbackNotificationTime = now;

                // Notification toast améliorée
                UI.showNotification(
                    `⚡ Fallback : ${shortOriginal} → ${shortUsed}`,
                    'warning'
                );
            }

            // Animation de la pillule du modèle IA
            if (DOM.headerAiModelChip) {
                const nameEl = DOM.headerAiModelChip.querySelector('#headerAiModelName');

                // 1. Activer l'état fallback (animation flash + couleur orange)
                DOM.headerAiModelChip.classList.remove('generating');
                DOM.headerAiModelChip.classList.add('fallback-active');

                // 2. Animer le changement de nom du modèle (Effet Slot Machine / Glissement vers le haut)
                if (nameEl) {
                    // Étape A : L'ancien texte monte et disparait
                    nameEl.classList.add('model-name-transition', 'exit-up');

                    setTimeout(() => {
                        // Étape B : On coupe les transitions pour téléporter le texte en bas discrètement
                        nameEl.classList.remove('model-name-transition', 'exit-up');
                        nameEl.classList.add('enter-from-down');

                        // Changement effectif du texte
                        nameEl.textContent = shortUsed;

                        // Force Reflow (obligatoire pour que le navigateur prenne en compte la position basse avant de réanimer)
                        void nameEl.offsetHeight;

                        // Étape C : On rétablit la transition et on fait monter le texte à sa place (0px)
                        nameEl.classList.add('model-name-transition');
                        nameEl.classList.remove('enter-from-down');
                    }, 200);
                }

                // 3. Tooltip avec détails du fallback
                DOM.headerAiModelChip.setAttribute('data-tooltip',
                    `⚡ Fallback : ${shortOriginal} → ${shortUsed}\nRaison : ${reason || 'Erreur API'}`
                );

                // 4. Retour à l'état normal après quelques secondes
                setTimeout(() => {
                    const defaultModelName = MODEL_SHORT_NAMES[appState.currentAIModel] || appState.currentAIModel;

                    if (nameEl) {
                        // Animation de sortie vers le bas (Inverse)
                        nameEl.classList.add('model-name-transition', 'exit-down');

                        setTimeout(() => {
                            // Au milieu de l'animation (texte invisible) :
                            // 1. On change la couleur du badge (retour au bleu/gris)
                            DOM.headerAiModelChip.classList.remove('fallback-active');

                            // 2. On prépare le nouveau texte en HAUT
                            nameEl.classList.remove('model-name-transition', 'exit-down');
                            nameEl.classList.add('enter-from-up');
                            nameEl.textContent = defaultModelName;

                            // Force Reflow
                            void nameEl.offsetHeight;

                            // 3. Animation d'entrée depuis le haut
                            nameEl.classList.add('model-name-transition');
                            nameEl.classList.remove('enter-from-up');
                        }, 200);
                    } else {
                        DOM.headerAiModelChip.classList.remove('fallback-active');
                    }

                    // Restaurer le nom du modèle configuré dans le tooltip
                    DOM.headerAiModelChip.setAttribute('data-tooltip',
                        `Modèle configuré : ${MODEL_SHORT_NAMES[appState.currentAIModel] || appState.currentAIModel}\nDernier utilisé : ${shortUsed}`
                    );
                }, 5000);
            }
        });

        // Listener pour démarrer/arrêter l'animation de génération
        window.addEventListener('ai-generation-start', () => {
            if (DOM.headerAiModelChip) {
                DOM.headerAiModelChip.classList.add('generating');
                DOM.headerAiModelChip.classList.remove('fallback-active');
            }
        });

        window.addEventListener('ai-generation-end', () => {
            if (DOM.headerAiModelChip) {
                DOM.headerAiModelChip.classList.remove('generating');
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
                    setTimeout(() => {
                        UI.openModal(DOM.settingsModal);
                        UI.showSettingsTab(link.dataset.targetTab);
                        setTimeout(() => {
                            const targetElement = document.getElementById(link.dataset.targetElement);
                            if (targetElement) {
                                targetElement.focus();
                                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }, 100);
                    }, 350);
                }
            }

            // Fermer les menus actions et custom dropdowns au clic extérieur
            if (DOM.actionsDropdown && !DOM.actionsDropdown.contains(e.target)) {
                DOM.actionsDropdown.classList.remove('show');
            }
            // Fermer les custom dropdowns si on clique en dehors (mais pas si on clique sur le trigger d'un custom dropdown)
            if (!e.target.closest('.custom-dropdown')) {
                import('../DropdownManager.js').then(({ DropdownManager }) => {
                    DropdownManager.closeAll();
                }).catch(() => { });
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
