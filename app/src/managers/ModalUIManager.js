/**
 * @fileoverview Gestionnaire des modales de l'application Bulletin AI.
 * 
 * Ce module centralise toutes les fonctions liées à l'ouverture, fermeture
 * et gestion des modales (focus trap, modales empilées, etc.).
 * 
 * @module managers/ModalUIManager
 */

import { DOM } from '../utils/DOM.js';
import { HistoryManager } from './HistoryManager.js';

/**
 * Module de gestion des modales.
 * @namespace ModalUI
 */
export const ModalUI = {
    /** @type {HTMLElement|null} Modale actuellement active */
    activeModal: null,

    /** @type {HTMLElement|null} Dernier élément focalisé avant ouverture */
    lastFocusedElement: null,

    /** @type {HTMLElement|null} Modale empilée (ex: helpModal par-dessus settings) */
    stackedModal: null,

    /** @private */
    _isIgnoringTooltips: false,

    /**
     * Ouvre une modale avec animation style Apple.
     * @param {HTMLElement|string} modalOrId - L'élément modale ou son ID
     */
    openModal(modalOrId) {
        const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
        if (!modal) return;

        // [UX Mobile] History Push via Manager
        HistoryManager.pushState(modal.id, (options) => this.closeModal(modal, options));

        // Si une modale est déjà ouverte et qu'on ouvre helpModal, on la "stack"
        if (this.activeModal && modal.id === 'helpModal') {
            this.stackedModal = this.activeModal;
        } else {
            this.lastFocusedElement = document.activeElement;
        }

        const modalContent = modal.querySelector('.modal-content');

        // Calcul de l'origine de l'animation (effet "sortir du bouton")
        if (this.lastFocusedElement && modalContent) {
            try {
                const rect = this.lastFocusedElement.getBoundingClientRect();
                const triggerX = rect.left + rect.width / 2;
                const triggerY = rect.top + rect.height / 2;

                // Centre de l'écran (où la modale sera centrée)
                const windowCenterX = window.innerWidth / 2;
                const windowCenterY = window.innerHeight / 2;

                // Décalage nécessaire par rapport au centre
                const deltaX = triggerX - windowCenterX;
                const deltaY = triggerY - windowCenterY;

                // Appliquer l'origine dynamique
                modalContent.style.transformOrigin = `calc(50% + ${deltaX}px) calc(50% + ${deltaY}px)`;
            } catch (e) {
                console.warn("Impossible de calculer l'origine de l'animation", e);
                modalContent.style.transformOrigin = 'center center';
            }
        } else if (modalContent) {
            modalContent.style.transformOrigin = 'center center';
        }

        // Afficher la modale puis déclencher l'animation
        modal.style.display = 'flex';
        // Forcer le reflow pour que la transition s'applique
        void modal.offsetWidth;
        // Ajouter les classes pour déclencher l'animation Apple
        requestAnimationFrame(() => {
            modal.classList.add('modal-visible');
            modal.classList.add('show');
        });

        this.activeModal = modal;
        document.body.classList.add('modal-open');

        this._isIgnoringTooltips = true;

        // Focus sur le premier élément focalisable après l'animation
        setTimeout(() => {
            const focusable = Array.from(modal.querySelectorAll(
                'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
            )).find(el => el.offsetParent !== null && !el.disabled);
            if (focusable) focusable.focus();

            // Initialize and update gliders inside the modal (they weren't created when hidden)
            import('./UIManager.js').then(({ UI }) => {
                // Re-run initGliders to ensure gliders exist and have listeners
                UI.initGliders();
                // Then update positions for this modal's visible containers
                modal.querySelectorAll('.generation-mode-selector, .input-mode-tabs').forEach(container => {
                    if (container.classList.contains('has-glider')) {
                        UI.updateGlider(container, true);
                    }
                });
            });
        }, 150);

        // Delay tooltip re-enabling until AFTER focus is set (150ms)
        // to avoid showing tooltip on the initially focused element
        setTimeout(() => {
            this._isIgnoringTooltips = false;
        }, 200);
    },

    /**
     * Ferme une modale avec animation style Apple.
     * @param {HTMLElement|string} modalOrId - L'élément modale ou son ID
     * @param {Object} [options={}] - Options de fermeture
     */
    closeModal(modalOrId, options = {}) {
        const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
        if (!modal) return;

        // [UX Mobile] History Cleanup
        // If closed via UI (X button) and NOT caused by back button, we must clean up history
        if (!options.causedByHistory) {
            HistoryManager.handleManualClose(modal.id);
        }

        if (modal.classList.contains('modal-closing') || modal.style.display === 'none') return;


        this._isIgnoringTooltips = true;

        // Déclencher l'animation de fermeture
        // IMPORTANT: Ne pas retirer modal-visible ici pour permettre à l'animation CSS de fonctionner
        // La classe modal-closing doit avoir priorité sur modal-visible dans le CSS
        modal.classList.add('modal-closing');

        // Attendre la fin de l'animation avant de masquer
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('modal-closing');
            modal.classList.remove('modal-visible');
            modal.classList.remove('show');

            // Gestion des modales empilées
            if (this.stackedModal && modal.id === 'helpModal') {
                this.activeModal = this.stackedModal;
                this.stackedModal = null;
            } else {
                document.body.classList.remove('modal-open');
                if (modal.id !== 'helpModal') {
                    modal.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open'));
                }

                // Restaurer le focus
                if (this.lastFocusedElement) {
                    this.lastFocusedElement.focus();
                    this.lastFocusedElement = null;
                }
                this.activeModal = null;

                // Supprimer les modales de confirmation dynamiques
                if (modal.id === 'customConfirmModal' && modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }
        }, 250); // Durée de l'animation de fermeture

        setTimeout(() => {
            this._isIgnoringTooltips = false;
        }, 300);
    },

    /**
     * Affiche une modale de confirmation personnalisée (Source de vérité unique).
     * Supporte les callbacks (legacy) et les Promesses (moderne).
     * 
     * @param {string} message - Message de confirmation (peut contenir du HTML)
     * @param {Function} [onConfirm] - Callback si confirmé (optionnel)
     * @param {Function} [onCancel] - Callback si annulé (optionnel)
     * @param {Object} [options={}] - Options de personnalisation
     * @param {string} [options.title='Confirmation'] - Titre de la modale
     * @param {string} [options.confirmText='Confirmer'] - Texte bouton confirmation
     * @param {string} [options.cancelText='Annuler'] - Texte bouton annulation
     * @param {boolean} [options.isDanger=true] - Style danger pour bouton confirmer (défaut: true)
     * @param {boolean} [options.compact=false] - Mode compact
     * @param {Object} [options.extraButton] - Bouton supplémentaire {text, class, action}
     * @returns {Promise<boolean>} Résout true si confirmé, false sinon
     */
    showCustomConfirm(message, onConfirm = null, onCancel = null, options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirmation',
                confirmText = 'Confirmer',
                cancelText = 'Annuler',
                extraButton = null,
                isDanger = true, // Par défaut true pour matcher le comportement legacy d'UIManager (bouton rouge)
                compact = false
            } = options;

            const modalId = 'customConfirmModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';
            // Assurer que le z-index est correct (géré par CSS .modal)

            const confirmBtnClass = isDanger ? 'btn-danger' : 'btn-primary';

            let buttonsHTML = `
                <button class="btn btn-secondary" id="confirmCancelBtn">${cancelText}</button>
                <button class="btn ${confirmBtnClass}" id="confirmOkBtn">${confirmText}</button>
            `;

            if (extraButton) {
                buttonsHTML = `<button class="btn ${extraButton.class || 'btn-secondary'}" id="confirmExtraBtn">${extraButton.text}</button>` + buttonsHTML;
            }

            if (compact) {
                modal.innerHTML = `
                <div class="modal-content modal-content-confirm modal-compact">
                    <div class="modal-compact-body">
                        <div class="modal-icon-wrapper">
                             <iconify-icon icon="solar:question-circle-linear" style="color: var(--warning-color); font-size: 24px;"></iconify-icon>
                        </div>
                        <div class="modal-text-wrapper">
                            <p>${message}</p>
                        </div>
                    </div>
                    <div class="modal-compact-actions">
                        ${buttonsHTML}
                    </div>
                </div>`;
            } else {
                modal.innerHTML = `
                <div class="modal-content modal-content-confirm">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <iconify-icon icon="solar:question-circle-linear" class="modal-title-icon" style="color: var(--warning-color);"></iconify-icon>
                            ${title}
                        </h3>
                        <button class="close-button" aria-label="Fermer">
                            <iconify-icon icon="solar:close-circle-linear"></iconify-icon>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        ${buttonsHTML}
                    </div>
                </div>`;
            }

            document.body.appendChild(modal);

            // Ouvrir la modale (animation incluse)
            this.openModal(modal);

            const okBtn = document.getElementById('confirmOkBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');
            const extraBtn = document.getElementById('confirmExtraBtn');
            const closeBtn = modal.querySelector('.close-button');

            // Wrappers pour gérer à la fois Callback et Promise, et la fermeture
            let keyHandler; // Définition en amont pour le cleanup

            const cleanup = () => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
            };

            const handleConfirm = () => {
                cleanup();
                if (onConfirm) onConfirm();
                resolve(true);
                this.closeModal(modal);
            };

            const handleCancel = () => {
                cleanup();
                if (onCancel) onCancel();
                resolve(false);
                this.closeModal(modal);
            };

            const handleExtra = () => {
                // Pas de cleanup ici car le bouton extra ne ferme pas forcément la modale
                // Sauf si on décide qu'il la ferme (comportement d'origine : closeModal appelé)
                cleanup();
                if (extraButton && extraButton.action) extraButton.action();
                this.closeModal(modal);
            };

            // Event Listeners (once: true pour éviter les doublons)
            okBtn.addEventListener('click', handleConfirm, { once: true });
            cancelBtn.addEventListener('click', handleCancel, { once: true });
            if (closeBtn) closeBtn.addEventListener('click', handleCancel, { once: true });
            if (extraBtn) extraBtn.addEventListener('click', handleExtra, { once: true });

            // Fermeture sur clic backdrop
            modal.addEventListener('click', (e) => {
                if (e.target === modal) handleCancel();
            });

            // Gestion clavier (Escape = Annuler, Enter = Confirmer)
            keyHandler = (e) => {
                if (this.activeModal !== modal) return;

                if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                } else if (e.key === 'Enter') {
                    e.preventDefault(); // Empêche le click sur le bouton annulé (si focus)
                    handleConfirm();
                }
            };
            document.addEventListener('keydown', keyHandler);

            // Focus management
            // Focus cancel for safety if danger, else confirm
            if (isDanger) {
                cancelBtn.focus();
            } else {
                okBtn.focus();
            }
        });
    },

    /**
     * Affiche une modale de confirmation avec des choix (checkboxes).
     * @param {string} title - Titre de la modale
     * @param {string} message - Message explicatif
     * @param {Array<{id: string, label: string, checked: boolean}>} choices - Liste des choix
     * @param {Object} [options] - Options standard (textes boutons, danger, etc.)
     * @returns {Promise<{confirmed: boolean, values: Object}>}
     */
    showChoicesModal(title, message, choices, options = {}) {
        return new Promise((resolve) => {
            const {
                confirmText = 'Confirmer',
                cancelText = 'Annuler',
                isDanger = true,
                iconClass = 'solar:checklist-minimalistic-linear'
            } = options;

            const modalId = 'customChoicesModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';

            const confirmBtnClass = isDanger ? 'btn-danger' : 'btn-primary';
            const iconColorVar = isDanger ? 'var(--warning-color)' : 'var(--primary-color)';

            // Generate checkboxes HTML
            const choicesHTML = choices.map(choice => {
                const isDisabled = choice.disabled;
                const checkedState = isDisabled ? false : choice.checked;
                return `
                <div class="modal-choice-item ${checkedState ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}">
                    <label class="modal-choice-label-wrapper" for="choice_${choice.id}">
                        <div class="modal-choice-checkbox-wrapper">
                            <input type="checkbox" id="choice_${choice.id}" ${checkedState ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                            <div class="custom-checkbox-display">
                                <iconify-icon icon="solar:check-read-linear"></iconify-icon>
                            </div>
                        </div>
                        <div class="modal-choice-text">
                            <span class="modal-choice-title">${choice.label}</span>
                            ${choice.sublabel ? `<span class="modal-choice-subtitle">${choice.sublabel}</span>` : ''}
                        </div>
                    </label>
                </div>`;
            }).join('');

            modal.innerHTML = `
                <div class="modal-content modal-content-confirm">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <div class="modal-title-icon" style="color: ${iconColorVar}; background: rgba(var(--${isDanger ? 'warning' : 'primary'}-rgb), 0.1);">
                                <iconify-icon icon="${iconClass}"></iconify-icon>
                            </div>
                            ${title}
                        </h3>
                        <button class="close-button" aria-label="Fermer">
                            <iconify-icon icon="solar:close-circle-linear"></iconify-icon>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom:20px; color: var(--text-secondary);">${message}</p>
                        <div class="modal-choices-container">
                            ${choicesHTML}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="choicesCancelBtn">${cancelText}</button>
                        <button class="btn ${confirmBtnClass}" id="choicesOkBtn">${confirmText}</button>
                    </div>
                </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            // Add change listener to toggle checked class for styling
            const inputs = modal.querySelectorAll('input[type="checkbox"]');
            inputs.forEach(input => {
                input.addEventListener('change', (e) => {
                    const item = e.target.closest('.modal-choice-item');
                    if (item) {
                        if (e.target.checked) item.classList.add('checked');
                        else item.classList.remove('checked');
                    }
                });
            });

            const okBtn = document.getElementById('choicesOkBtn');
            const cancelBtn = document.getElementById('choicesCancelBtn');
            const closeBtn = modal.querySelector('.close-button');

            let keyHandler;

            const getValues = () => {
                const values = {};
                choices.forEach(choice => {
                    const el = document.getElementById(`choice_${choice.id}`);
                    if (el) values[choice.id] = el.checked;
                });
                return values;
            };

            const cleanup = () => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
            };

            const handleConfirm = () => {
                cleanup();
                resolve({ confirmed: true, values: getValues() });
                this.closeModal(modal);
            };

            const handleCancel = () => {
                cleanup();
                resolve({ confirmed: false, values: {} });
                this.closeModal(modal);
            };

            okBtn.addEventListener('click', handleConfirm, { once: true });
            cancelBtn.addEventListener('click', handleCancel, { once: true });
            if (closeBtn) closeBtn.addEventListener('click', handleCancel, { once: true });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) handleCancel();
            });

            keyHandler = (e) => {
                if (this.activeModal !== modal) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                } else if (e.key === 'Enter') {
                    // Only confirm if not interacting with checkboxes
                    if (document.activeElement.type !== 'checkbox') {
                        e.preventDefault();
                        handleConfirm();
                    }
                }
            };
            document.addEventListener('keydown', keyHandler);

            if (isDanger) cancelBtn.focus();
            else okBtn.focus();
        });
    },
    closeAllModals() {
        const modals = [
            DOM.settingsModal,
            DOM.studentDetailsModal,
            // DOM.refinementModal removed - Focus Panel handles all refinement inline
            DOM.helpModal,
            DOM.welcomeModal,
            document.getElementById('customConfirmModal'),
            document.getElementById('classDashboardModal'),
            DOM.classAnalysisModal,
            DOM.importPreviewModal
        ];
        modals.forEach(m => {
            if (m) this.closeModal(m);
        });
    }
};
