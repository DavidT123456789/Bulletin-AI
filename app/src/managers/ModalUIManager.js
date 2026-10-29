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
import { UI } from './UIManager.js';

/** Modales de dialogue générées dynamiquement : empilées au-dessus de la modale active et retirées du DOM à la fermeture */
const DYNAMIC_MODAL_IDS = new Set([
    'customConfirmModal',
    'customChoicesModal',
    'hardConfirmModal',
    'promptPreviewModal',
    'conflictResolutionModal',
    'restoreConfirmationModal',
    'saveConfirmationModal',
    'backupImportModal'
]);

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

    /** @private Handler pour le focus trap (WCAG) */
    _focusTrapHandler: null,

    /** @private Conteneur actuellement piégé par le Focus Trap */
    _focusTrapContainer: null,

    /** @private Écouteur délégué pour les dialogues autonomes (#importHubBackdrop, #trombiWizardModal, #focusPanel) */
    _standaloneTrapInitialized: false,

    /** @private */
    _isIgnoringTooltips: false,

    /** @private Map pour stocker les timeouts d'animation par modale */
    _animTimeouts: new WeakMap(),

    /**
     * Retourne les éléments focalisables visibles à l'intérieur d'un conteneur.
     * @param {HTMLElement|null} container
     * @returns {HTMLElement[]}
     * @private
     */
    _getFocusableElements(container) {
        if (!container) return [];
        const candidates = Array.from(container.querySelectorAll(
            'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
        )).filter(el =>
            !el.disabled &&
            el.getAttribute('aria-hidden') !== 'true' &&
            !el.closest('[inert], [style*="display: none"], [style*="display:none"]')
        );
        const visibleCandidates = candidates.filter(el => el.offsetParent !== null);
        return visibleCandidates.length > 0 ? visibleCandidates : candidates;
    },

    /**
     * Active le Focus Trap clavier WCAG (Tab / Shift+Tab) sur une modale ou un dialogue autonome.
     * @param {HTMLElement|string|null} containerOrId - Élément conteneur ou son ID
     */
    activateFocusTrap(containerOrId) {
        const container = typeof containerOrId === 'string'
            ? document.getElementById(containerOrId)
            : containerOrId;
        if (!container || typeof document === 'undefined') return;

        if (this._focusTrapHandler) {
            document.removeEventListener('keydown', this._focusTrapHandler);
        }
        this._focusTrapContainer = container;
        this._focusTrapHandler = (e) => {
            const activeTrapTarget = this.activeModal ||
                this._focusTrapContainer ||
                document.querySelector('#trombiWizardModal.visible, #importHubBackdrop.active, #focusPanel.open');
            if (!activeTrapTarget) return;

            if (e.key === 'Escape') {
                const hub = document.getElementById('importHubBackdrop');
                if (hub && hub.classList.contains('active') && activeTrapTarget === hub) {
                    e.preventDefault();
                    hub.classList.remove('active');
                    if (document.body) document.body.style.overflow = '';
                    HistoryManager.handleManualClose?.('importHub');
                    this.deactivateFocusTrap(hub);
                }
                return;
            }

            if (e.key !== 'Tab') return;
            const focusableElements = this._getFocusableElements(activeTrapTarget);
            if (focusableElements.length === 0) return;

            const firstEl = focusableElements[0];
            const lastEl = focusableElements[focusableElements.length - 1];

            if (e.shiftKey && (document.activeElement === firstEl || !activeTrapTarget.contains(document.activeElement))) {
                lastEl.focus();
                e.preventDefault();
            } else if (!e.shiftKey && (document.activeElement === lastEl || !activeTrapTarget.contains(document.activeElement))) {
                firstEl.focus();
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', this._focusTrapHandler);
    },

    /**
     * Désactive le Focus Trap clavier WCAG.
     * @param {HTMLElement|string|null} [containerOrId=null] - Conteneur optionnel à vérifier avant retrait
     */
    deactivateFocusTrap(containerOrId = null) {
        const container = typeof containerOrId === 'string'
            ? document.getElementById(containerOrId)
            : containerOrId;
        if (container && this._focusTrapContainer && this._focusTrapContainer !== container) {
            return;
        }
        if (this._focusTrapHandler && typeof document !== 'undefined') {
            document.removeEventListener('keydown', this._focusTrapHandler);
            this._focusTrapHandler = null;
        }
        this._focusTrapContainer = null;
    },

    /**
     * Garantit que les dialogues autonomes ouverts via classes CSS (#importHubBackdrop.active,
     * #trombiWizardModal.visible, #focusPanel.open) bénéficient du Focus Trap et de Escape.
     * @private
     */
    _ensureStandaloneFocusTrap() {
        if (this._standaloneTrapInitialized || typeof document === 'undefined') return;
        this._standaloneTrapInitialized = true;
        document.addEventListener('keydown', (e) => {
            if (this._focusTrapHandler) return;
            const standaloneTarget = document.querySelector('#trombiWizardModal.visible, #importHubBackdrop.active, #focusPanel.open');
            if (!standaloneTarget) return;

            if (e.key === 'Escape' && standaloneTarget.id === 'importHubBackdrop') {
                e.preventDefault();
                standaloneTarget.classList.remove('active');
                if (document.body) document.body.style.overflow = '';
                HistoryManager.handleManualClose?.('importHub');
                return;
            }

            if (e.key !== 'Tab') return;
            const focusableElements = this._getFocusableElements(standaloneTarget);
            if (focusableElements.length === 0) return;

            const firstEl = focusableElements[0];
            const lastEl = focusableElements[focusableElements.length - 1];

            if (e.shiftKey && (document.activeElement === firstEl || !standaloneTarget.contains(document.activeElement))) {
                lastEl.focus();
                e.preventDefault();
            } else if (!e.shiftKey && (document.activeElement === lastEl || !standaloneTarget.contains(document.activeElement))) {
                firstEl.focus();
                e.preventDefault();
            }
        });
    },

    /** @private */
    _isOverlayModal(modal, options = {}) {
        return modal.id === 'helpModal' || modal.id === 'moveStudentModal' || DYNAMIC_MODAL_IDS.has(modal.id) || Boolean(options.isStacked);
    },

    /**
     * Indique si au moins une modale ou un dialogue plein écran est actuellement ouvert.
     * Couvre à la fois les modales gérées par ModalUI et les dialogues autonomes (Trombinoscope, Hub d'import, PWA).
     * @returns {boolean}
     */
    isAnyModalOpen() {
        if (this.activeModal) return true;
        if (typeof document === 'undefined') return false;
        if (document.body?.classList?.contains('modal-open')) return true;
        return Boolean(document.querySelector(
            '.modal.modal-visible, .modal.show, #trombiWizardModal.visible, #importHubBackdrop.active, #pwaModalOverlay.visible'
        ));
    },

    /**
     * Ouvre une modale avec animation style Apple / iOS 2026.
     * @param {HTMLElement|string} modalOrId - L'élément modale ou son ID
     * @param {Object} [options={}] - Options d'ouverture (ex: { isStacked: true })
     */
    openModal(modalOrId, options = {}) {
        const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
        if (!modal) return;

        // Déclencher un événement lors de l'ouverture des modales de paramétrage pour créer un snapshot
        if (!options.isRestoringStacked && (modal.id === 'appSettingsModal' || modal.id === 'personalizationModal')) {
            document.dispatchEvent(new CustomEvent('settings-modal-open', { detail: { modalId: modal.id } }));
        }

        // Clear any ongoing close animation timeout to prevent overlaps
        if (this._animTimeouts.has(modal)) {
            clearTimeout(this._animTimeouts.get(modal));
            this._animTimeouts.delete(modal);
        }

        modal.classList.remove('modal-closing');

        // [UX Mobile] History Push via Manager
        if (!options.isRestoringStacked) {
            HistoryManager.pushState(modal.id, (closeOptions) => this.closeModal(modal, closeOptions));
        }

        // Une modale "overlay" (aide, confirmation dynamique) s'empile sur la modale active
        if (this.activeModal && this.activeModal !== modal && this._isOverlayModal(modal, options)) {
            if (!this.activeModal.classList.contains('modal-closing') || !this.stackedModal) {
                this.stackedModal = this.activeModal;
            }
        } else if (!options.isRestoringStacked) {
            this.lastFocusedElement = document.activeElement;
        }

        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
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

        // Accessibilité (WCAG 2.1) : ARIA
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        this.activeModal = modal;
        document.body.classList.add('modal-open');

        // Retirer immédiatement le focus de l'interface d'arrière-plan (ex: .main-content)
        // avant le délai de 150ms pour éviter que les flèches clavier n'agissent derrière la modale
        if (!modal.hasAttribute('tabindex')) {
            modal.setAttribute('tabindex', '-1');
        }
        if (!modal.contains(document.activeElement)) {
            modal.focus?.({ preventScroll: true });
        }

        this._isIgnoringTooltips = true;

        // Configuration du Focus Trap WCAG partagé
        this.activateFocusTrap(modal);

        // Focus sur le premier élément focalisable après l'animation (en évitant le bouton de fermeture si possible)
        setTimeout(() => {
            // Initialize and update gliders inside the modal (they weren't created when hidden)
            UI.initGliders();
            // Then update positions for this modal's visible containers
            modal.querySelectorAll('.ui-segmented-control').forEach(container => {
                if (container.classList.contains('has-glider')) {
                    UI.updateGlider(container, true);
                }
            });

            // Si le focus est déjà positionné sur un élément à l'intérieur de la modale (par ex. par UIManager), on le conserve
            if (document.activeElement && modal.contains(document.activeElement) && document.activeElement !== modal) {
                return;
            }

            const focusableElements = Array.from(modal.querySelectorAll(
                'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
            )).filter(el => el.offsetParent !== null && !el.disabled);

            // Chercher un élément qui n'est pas le bouton de fermeture
            let focusable = focusableElements.find(el => !el.classList.contains('close-button'));

            // Fallback: si seul le bouton close existe (ou aucun), prendre le premier
            if (!focusable && focusableElements.length > 0) focusable = focusableElements[0];

            if (focusable) focusable.focus();
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

        if (modal.classList.contains('modal-closing') ||
            modal.style.display === 'none' ||
            (modal.style.display === '' && !modal.classList.contains('modal-visible') && !modal.classList.contains('show'))) {
            return;
        }

        // [UX Mobile] History Cleanup
        // If closed via UI (X button) and NOT caused by back button, we must clean up history
        if (!options.causedByHistory && !options.skipHistory) {
            HistoryManager.handleManualClose(modal.id);
        }

        if (modal.id === 'welcomeModal') {
            document.dispatchEvent(new CustomEvent('welcome-modal-close', { detail: { modalId: modal.id, options } }));
        }

        this._isIgnoringTooltips = true;

        // Déclencher l'animation de fermeture
        // IMPORTANT: Ne pas retirer modal-visible ici pour permettre à l'animation CSS de fonctionner
        // La classe modal-closing doit avoir priorité sur modal-visible dans le CSS
        modal.classList.add('modal-closing');

        // Attendre la fin de l'animation avant de masquer
        const timeoutId = setTimeout(() => {
            this._animTimeouts.delete(modal);
            modal.style.display = 'none';
            modal.classList.remove('modal-closing');
            modal.classList.remove('modal-visible');
            modal.classList.remove('show');

            if (modal.id !== 'helpModal') {
                modal.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open'));
            }

            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.transformOrigin = '';
            }

            // Supprimer les modales de confirmation dynamiques
            if (DYNAMIC_MODAL_IDS.has(modal.id)) {
                modal.remove();
            }

            const canRestoreStacked = Boolean(
                this.stackedModal &&
                this.stackedModal !== modal &&
                this.stackedModal.style.display !== 'none' &&
                !this.stackedModal.classList.contains('modal-closing')
            );

            if (this.activeModal && this.activeModal !== modal) {
                // Une autre modale a été ouverte pendant la fermeture (ex: bascule Trombi -> ImportWizard ou customConfirm -> hardConfirm)
                if (!canRestoreStacked || !this._isOverlayModal(this.activeModal)) {
                    this.stackedModal = null;
                }
            } else if (this._isOverlayModal(modal, options) && canRestoreStacked) {
                // Restaure la modale sous-jacente (focus trap) sans dupliquer l'historique
                this.activeModal = this.stackedModal;
                this.stackedModal = null;
                this.openModal(this.activeModal, { isRestoringStacked: true });
            } else {
                this.stackedModal = null;
                const underlyingStandalone = typeof document !== 'undefined'
                    ? document.querySelector('#trombiWizardModal.visible, #importHubBackdrop.active, #focusPanel.open')
                    : null;
                if (underlyingStandalone) {
                    this.activateFocusTrap(underlyingStandalone);
                } else {
                    this.deactivateFocusTrap();
                }
                document.body.classList.remove('modal-open');

                // Restaurer le focus
                if (this.lastFocusedElement) {
                    this.lastFocusedElement.focus();
                    this.lastFocusedElement = null;
                }
                this.activeModal = null;
            }
        }, 250); // Durée de l'animation de fermeture

        this._animTimeouts.set(modal, timeoutId);

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
                focusCancel = false,
                compact = false,
                modalClass = '',
                detailsHtml = '' // Permet d'ajouter un accordéon "En savoir plus"
            } = options;

            const modalId = 'customConfirmModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = `modal ${modalClass}`;
            // Assurer que le z-index est correct (géré par CSS .modal)

            const confirmBtnClass = isDanger ? 'btn-danger' : 'btn-primary';

            let buttonsHTML = `
                <button class="btn btn-secondary" id="confirmCancelBtn">${cancelText}</button>
                <button class="btn ${confirmBtnClass}" id="confirmOkBtn">${confirmText}</button>
            `;

            if (extraButton) {
                buttonsHTML = `<button class="btn ${extraButton.class || 'btn-secondary'}" id="confirmExtraBtn">${extraButton.text}</button>` + buttonsHTML;
            }

            // Optional message
            const messageHtml = message ? `<div class="modal-alert-message">${message}</div>` : '';

            // Accordion content (without the button)
            const accordionContentHtml = detailsHtml ? `
                <div class="modal-alert-details" id="modalAlertDetails">
                    <div class="modal-alert-details-content-wrapper">
                        <div class="modal-alert-details-content-inner">
                            <div class="modal-alert-details-content">
                                ${detailsHtml}
                            </div>
                        </div>
                    </div>
                </div>
            ` : '';

            // Details button for the footer
            const detailsBtnHtml = detailsHtml ? `
                <button type="button" class="btn btn-ghost modal-details-toggle" id="modalAlertDetailsBtn">
                    <span>Détails</span> <iconify-icon icon="solar:alt-arrow-down-linear"></iconify-icon>
                </button>
            ` : '';

            // Design minimaliste et élégant (Gold Standard / iOS-like)
            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title">${title}</h3>
                    ${messageHtml}
                    ${accordionContentHtml}
                </div>
                <div class="modal-alert-actions" style="justify-content: ${detailsHtml ? 'space-between' : 'flex-end'}; width: 100%; align-items: center;">
                    ${detailsHtml ? `<div class="modal-alert-actions-left">${detailsBtnHtml}</div>` : ''}
                    <div class="modal-alert-actions-right" style="display: flex; gap: 12px;">
                        ${buttonsHTML}
                    </div>
                </div>
            </div>`;

            document.body.appendChild(modal);

            // Ouvrir la modale (animation incluse)
            this.openModal(modal);

            const okBtn = document.getElementById('confirmOkBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');
            const extraBtn = document.getElementById('confirmExtraBtn');
            const closeBtn = modal.querySelector('.close-button');
            const detailsBtn = document.getElementById('modalAlertDetailsBtn');

            // Toggle fluid accordion and button active state
            if (detailsBtn) {
                detailsBtn.addEventListener('click', () => {
                    const detailsContainer = document.getElementById('modalAlertDetails');
                    if (detailsContainer) {
                        detailsContainer.classList.toggle('is-open');
                        detailsBtn.classList.toggle('is-open');
                    }
                });
            }

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
            // Focus cancel for safety if danger or explicitly requested, else confirm
            if (isDanger || focusCancel) {
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
            if (isDanger) modal.classList.add('modal-danger');

            const confirmBtnClass = isDanger ? 'btn-danger' : 'btn-primary';
            const iconColorVar = isDanger ? 'var(--error-color)' : 'var(--primary-color)';

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
                                <iconify-icon icon="ph:check"></iconify-icon>
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
            <div class="modal-content modal-content-confirm modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title">${title}</h3>
                    <div class="modal-alert-message">${message}</div>
                    <div class="modal-choices-container">
                        ${choicesHTML}
                    </div>
                </div>
                <div class="modal-alert-actions">
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

    /**
     * Modale de résolution quand le Cloud est plus récent que la dernière synchronisation.
     * - `conflict` : modifications des deux côtés → Fusionner (recommandé), Écraser, Remplacer.
     * - `cloud-changes` : aucune modification locale → Récupérer (recommandé), Écraser.
     * @param {Object} options
     * @param {string|number} [options.remoteDate] - Timestamp de la version Cloud
     * @param {'conflict'|'cloud-changes'} [options.syncState='conflict'] - État de synchronisation détecté
     * @returns {Promise<'merge'|'overwrite'|'restore'|'cancel'>}
     */
    showConflictResolutionModal(options = {}) {
        return new Promise((resolve) => {
            const {
                remoteDate = null,
                syncState = 'conflict'
            } = options;

            const modalId = 'conflictResolutionModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const remoteDateStr = this._formatDateParts(remoteDate)?.absolute || 'récemment';

            const isConflict = syncState !== 'cloud-changes';

            const choices = {
                merge: {
                    id: 'conflictChoiceMerge',
                    icon: 'solar:magic-stick-3-bold-duotone',
                    title: 'Fusionner les deux versions',
                    desc: 'Combine vos ajouts locaux et les données distantes <strong>sans perte</strong> (nouveaux élèves, entrées de journal de bord, appréciations).'
                },
                overwrite: {
                    id: 'conflictChoiceOverwrite',
                    icon: 'solar:cloud-upload-bold',
                    title: 'Écraser la version Cloud',
                    desc: 'Remplace le Cloud par cet appareil. Les modifications enregistrées depuis un autre appareil seront perdues.'
                },
                restore: {
                    id: 'conflictChoiceRestore',
                    icon: 'solar:cloud-download-bold',
                    title: isConflict ? 'Remplacer par la version Cloud' : 'Récupérer la version Cloud',
                    desc: isConflict
                        ? 'Abandonne les modifications de cet appareil et recharge la version Cloud (une copie de secours locale sera conservée).'
                        : 'Recharge la sauvegarde la plus récente sur cet appareil (une copie de secours locale sera conservée).'
                }
            };

            const order = isConflict ? ['merge', 'overwrite', 'restore'] : ['restore', 'overwrite'];
            const recommended = order[0];

            const renderChoice = (key) => {
                const { id, icon, title, desc } = choices[key];
                const isRecommended = key === recommended;
                return `
                        <button type="button" class="conflict-choice-card${isRecommended ? ' recommended' : ''}" id="${id}" data-choice="${key}">
                            <div class="conflict-choice-icon">
                                <iconify-icon icon="${icon}"></iconify-icon>
                            </div>
                            <div class="conflict-choice-body">
                                <div class="conflict-choice-header">
                                    <span class="conflict-choice-title">${title}</span>
                                    ${isRecommended ? '<span class="conflict-badge-rec">Recommandé</span>' : ''}
                                </div>
                                <span class="conflict-choice-desc">${desc}</span>
                            </div>
                        </button>`;
            };

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';

            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-content-conflict modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title has-header-icon">
                        <div class="modal-alert-header-icon warning">
                            <iconify-icon icon="solar:danger-triangle-bold"></iconify-icon>
                        </div>
                        <span>${isConflict ? 'Conflit de synchronisation' : 'Version Cloud plus récente'}</span>
                    </h3>
                    <div class="modal-alert-message">
                        Une sauvegarde plus récente existe sur le Cloud (<strong>${remoteDateStr}</strong>).<br>
                        ${isConflict
                            ? 'Cet appareil contient aussi des modifications non sauvegardées.'
                            : 'Cet appareil n\'a aucune modification non sauvegardée.'}
                    </div>

                    <div class="conflict-choices-list">
                        ${order.map(renderChoice).join('')}
                    </div>
                </div>

                <div class="modal-alert-actions">
                    <button type="button" class="btn btn-secondary" id="conflictCancelBtn">Annuler</button>
                </div>
            </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            const cancelBtn = document.getElementById('conflictCancelBtn');

            let keyHandler;

            const selectChoice = (choice) => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
                resolve(choice);
                this.closeModal(modal);
            };

            modal.querySelectorAll('.conflict-choice-card').forEach(card => {
                card.addEventListener('click', () => selectChoice(card.dataset.choice), { once: true });
            });
            cancelBtn.addEventListener('click', () => selectChoice('cancel'), { once: true });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) selectChoice('cancel');
            });

            keyHandler = (e) => {
                if (this.activeModal !== modal) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    selectChoice('cancel');
                }
            };
            document.addEventListener('keydown', keyHandler);

            document.getElementById(choices[recommended].id)?.focus();
        });
    },

    /**
     * Résout le libellé et l'icône d'un provider Cloud.
     * @param {string} [providerName='google']
     * @returns {{ label: string, icon: string }}
     * @private
     */
    _getProviderMeta(providerName = 'google') {
        const meta = {
            google: { label: 'Google Drive', icon: 'logos:google-drive' },
            dropbox: { label: 'Dropbox', icon: 'logos:dropbox' }
        };
        return meta[providerName] ?? { label: 'Cloud', icon: 'solar:cloud-upload-linear' };
    },

    /**
     * Décompose un timestamp en parties temporelles relatives et absolues prévues.
     * @param {number|string|Date} timestamp
     * @param {Object} [options]
     * @param {boolean} [options.precise=false] - Affiche les secondes pour départager deux dates proches
     * @returns {{ relative: string, absolute: string }|null}
     * @private
     */
    _formatDateParts(timestamp, { precise = false } = {}) {
        if (!timestamp) return null;
        const d = new Date(timestamp);
        if (isNaN(d.getTime())) return null;

        const dateStr = d.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short'
        });
        const timeStr = d.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            ...(precise ? { second: '2-digit' } : {})
        });
        const absolute = `${dateStr} à ${timeStr}`;

        const diffMs = Math.max(0, Date.now() - d.getTime());
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);

        let relative = '';
        if (precise && diffMin < 60) {
            const remSec = diffSec % 60;
            if (diffMin === 0) {
                relative = diffSec <= 1 ? 'À l\'instant' : `Il y a ${diffSec} s`;
            } else {
                relative = remSec > 0 ? `Il y a ${diffMin} min ${remSec} s` : `Il y a ${diffMin} min`;
            }
        } else if (diffMin < 1) {
            relative = 'À l\'instant';
        } else if (diffMin < 60) {
            relative = `Il y a ${diffMin} min`;
        } else if (diffHours < 24) {
            relative = `Il y a ${diffHours}h`;
        } else if (diffDays === 1) {
            relative = 'Hier';
        } else {
            relative = `Il y a ${diffDays} jrs`;
        }

        return { relative, absolute };
    },

    /**
     * Calcule la liste synthétique des modifications locales (macro-diff).
     * @param {Object} options
     * @returns {Array<{icon: string, text: string}>}
     * @private
     */
    _getLocalDiffDetails(options = {}) {
        const lastSync = options.lastSyncTime || parseInt(localStorage.getItem('bulletin_last_sync') || '0', 10);
        const items = [];

        // 1. Plan de classe / activité
        const classes = window.appState?.classes || [];
        const seatingChanged = classes.some(c =>
            (c.seatingUpdatedAt && c.seatingUpdatedAt > lastSync) ||
            (c.seatingValidatedAt && c.seatingValidatedAt > lastSync) ||
            (c.seatingActivityUpdatedAt && c.seatingActivityUpdatedAt > lastSync) ||
            (c.seatingActivityValidatedAt && c.seatingActivityValidatedAt > lastSync)
        );
        if (seatingChanged) {
            items.push({ icon: 'solar:chair-bold', text: 'Plan de classe réorganisé' });
        }

        // 2. Appréciations / résultats élèves (distingue les éditions de bulletins des simples déplacements de plan de classe)
        const students = window.runtimeState?.data?.generatedResults || [];
        const modifiedStudents = students.filter(s => {
            const periods = s.studentData?.periods ? Object.values(s.studentData.periods) : [];
            const hasPeriodEdit = periods.some(p => p?._lastModified && p._lastModified > lastSync);
            return hasPeriodEdit || (!seatingChanged && s._lastModified && s._lastModified > lastSync);
        }).length;
        if (modifiedStudents > 0) {
            items.push({
                icon: 'solar:document-text-bold',
                text: `${modifiedStudents} élève${modifiedStudents > 1 ? 's' : ''} avec appréciations ou notes éditées`
            });
        }

        // 3. Journal de bord
        const journalChanged = students.some(s =>
            Array.isArray(s.journal) && s.journal.some(e => e?._lastModified && e._lastModified > lastSync)
        );
        if (journalChanged) {
            items.push({ icon: 'solar:notebook-bold', text: 'Journal de bord mis à jour' });
        }

        // 4. Différence d'effectif (si élèves ajoutés ou supprimés)
        const rCount = options.remoteStudentCount ?? null;
        const lCount = options.localStudentCount ?? students.length;
        if (typeof rCount === 'number' && rCount > 0 && rCount !== lCount) {
            const diff = lCount - rCount;
            const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
            items.push({
                icon: 'solar:users-group-rounded-bold',
                text: `${diffStr} élève${Math.abs(diff) > 1 ? 's' : ''} par rapport au Cloud`
            });
        }

        // Fallback si modifications détectées mais aucun timestamp individuel spécifique (ex. tables, contraintes, réglages IA)
        if (items.length === 0) {
            items.push({ icon: 'solar:pen-new-square-bold', text: 'Modifications récentes de la session locale' });
        }

        return items;
    },

    /**
     * Génère la grille comparative à 2 cartes (Cloud vs Session locale) partagée par Sauvegarder et Restaurer.
     * @param {Object} params
     * @returns {string}
     * @private
     */
    _renderCloudComparisonGrid({
        remoteDate = null,
        localDate = null,
        rStudentCount = null,
        rClassCount = null,
        lStudentCount = 0,
        lClassCount = 0,
        isVolumeIdentical = true,
        isMissingLocalStudents = false,
        hasLocalChanges = false,
        isInSync = false,
        isFirstSync = false,
        resolvedProviderLabel = 'Google Drive',
        resolvedProviderIcon = 'logos:google-drive'
    }) {
        const localTimestamp = localDate || parseInt(localStorage.getItem('bulletin_last_modified') || '0', 10) || null;
        let cloudDateParts = this._formatDateParts(remoteDate);
        let localDateParts = this._formatDateParts(localTimestamp);

        if (!isInSync && cloudDateParts && localDateParts && (
            cloudDateParts.relative === localDateParts.relative ||
            cloudDateParts.absolute === localDateParts.absolute
        )) {
            cloudDateParts = this._formatDateParts(remoteDate, { precise: true });
            localDateParts = this._formatDateParts(localTimestamp, { precise: true });
        }

        const cloudSubStatHtml = (isVolumeIdentical || rStudentCount === null)
            ? ''
            : `<div class="restore-card-sub-stat">${rStudentCount} élève${rStudentCount > 1 ? 's' : ''}${rClassCount !== null ? ` · ${rClassCount} classe${rClassCount > 1 ? 's' : ''}` : ''}</div>`;

        const localSubStatHtml = isVolumeIdentical
            ? ''
            : `<div class="restore-card-sub-stat">${lStudentCount} élève${lStudentCount > 1 ? 's' : ''} · ${lClassCount} classe${lClassCount > 1 ? 's' : ''}</div>`;

        const cloudMainStatText = cloudDateParts
            ? cloudDateParts.relative
            : (isFirstSync ? 'Aucune sauvegarde' : 'Date inconnue');

        const cloudExactDateHtml = cloudDateParts
            ? `<div class="restore-card-exact-date">${cloudDateParts.absolute}</div>`
            : (isFirstSync ? '<div class="restore-card-exact-date">Première synchronisation</div>' : '');

        const localMainStatText = hasLocalChanges
            ? (localDateParts ? localDateParts.relative : 'À l\'instant')
            : isMissingLocalStudents
                ? 'Données manquantes'
                : isInSync
                    ? 'Session à jour'
                    : (localDateParts ? localDateParts.relative : 'Session locale');

        const localExactDateText = hasLocalChanges
            ? (localDateParts ? localDateParts.absolute : 'Modifié récemment')
            : isMissingLocalStudents
                ? 'Aucun élève sur cet appareil'
                : isInSync
                    ? 'Parfaitement synchronisée'
                    : (localDateParts ? localDateParts.absolute : 'Écart avec le Cloud');

        return `
                    <div class="restore-comparison-grid">
                        <!-- Carte Cloud -->
                        <div class="restore-comparison-card cloud">
                            <div class="restore-card-badge">
                                <iconify-icon icon="${resolvedProviderIcon}"></iconify-icon>
                                <span>${resolvedProviderLabel}</span>
                            </div>
                            <div class="restore-card-main-stat">
                                ${cloudMainStatText}
                            </div>
                            ${cloudExactDateHtml}
                            ${cloudSubStatHtml}
                        </div>

                        <!-- Carte Locale -->
                        <div class="restore-comparison-card local">
                            <div class="restore-card-badge">
                                <iconify-icon icon="solar:laptop-linear"></iconify-icon>
                                <span>Session locale</span>
                            </div>
                            <div class="restore-card-main-stat">
                                ${localMainStatText}
                            </div>
                            <div class="restore-card-exact-date">
                                ${localExactDateText}
                            </div>
                            ${localSubStatHtml}
                        </div>
                    </div>`;
    },

    /**
     * Génère l'encart de synthèse des modifications (`.restore-impact-box`) partagé par Sauvegarder et Restaurer.
     * @param {Object} params
     * @returns {string}
     * @private
     */
    _renderImpactBox({ isWarning = false, icon, title, items = [], footerText = null }) {
        return `
                    <div class="restore-impact-box${isWarning ? ' warning' : ''}">
                        <div class="restore-impact-header">
                            <iconify-icon icon="${icon}"></iconify-icon>
                            <span>${title}</span>
                        </div>
                        <ul class="restore-impact-list">
                            ${items.map(item => `
                                <li>
                                    <iconify-icon icon="${item.icon}"></iconify-icon>
                                    <span>${item.text}</span>
                                </li>
                            `).join('')}
                        </ul>
                        ${footerText ? `
                        <div class="restore-impact-footer">
                            <iconify-icon icon="solar:shield-check-bold"></iconify-icon>
                            <span>${footerText}</span>
                        </div>` : ''}
                    </div>`;
    },

    /**
     * Modale de confirmation comparative pré-restauration.
     * Affiche un comparatif clair (Cloud vs Local) et supprime l'action aveugle.
     * 
     * @param {Object} options
     * @param {string|number} [options.remoteDate] - Date ou timestamp de la version Cloud
     * @param {string|number} [options.localDate] - Date ou timestamp de la version locale
     * @param {number} [options.remoteStudentCount=0] - Nombre d'élèves distants
     * @param {number} [options.remoteClassCount=0] - Nombre de classes distantes
     * @param {number} [options.localStudentCount=0] - Nombre d'élèves locaux actuels
     * @param {number} [options.localClassCount=0] - Nombre de classes locales actuelles
     * @param {string} [options.providerName='google'] - Nom du provider (google | dropbox)
     * @returns {Promise<boolean>} Résout true si confirmé, false sinon
     */
    showRestoreConfirmationModal(options = {}) {
        return new Promise((resolve) => {
            const {
                remoteDate = null,
                localDate = null,
                remoteStudentCount = 0,
                remoteClassCount = 0,
                localStudentCount = 0,
                localClassCount = 0,
                providerName = 'google',
                providerLabel = null,
                providerIcon = null,
                syncState = null
            } = options;

            const modalId = 'restoreConfirmationModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const { label: defaultProviderLabel, icon: defaultProviderIcon } = this._getProviderMeta(providerName);
            const resolvedProviderLabel = providerLabel ?? defaultProviderLabel;
            const resolvedProviderIcon = providerIcon ?? defaultProviderIcon;

            const rStudentCount = Number.isFinite(remoteStudentCount) ? remoteStudentCount : (parseInt(remoteStudentCount, 10) || 0);
            const rClassCount = Number.isFinite(remoteClassCount) ? remoteClassCount : (parseInt(remoteClassCount, 10) || 0);
            const lStudentCount = Number.isFinite(localStudentCount) ? localStudentCount : (parseInt(localStudentCount, 10) || 0);
            const lClassCount = Number.isFinite(localClassCount) ? localClassCount : (parseInt(localClassCount, 10) || 0);

            const isVolumeIdentical = (rStudentCount === lStudentCount) && (rClassCount === lClassCount);
            const isMissingLocalStudents = rStudentCount > 0 && lStudentCount === 0;

            const resolvedSyncState = syncState ||
                window.SyncService?._lastSyncState ||
                (typeof window.SyncService?._computeSyncState === 'function' ? window.SyncService._computeSyncState() : null);
            const hasLocalChanges = !isMissingLocalStudents && (resolvedSyncState === 'local-changes' || resolvedSyncState === 'conflict');
            const isInSync = !hasLocalChanges && isVolumeIdentical && resolvedSyncState !== 'cloud-changes';

            const diffItems = hasLocalChanges ? this._getLocalDiffDetails(options) : [];
            const comparisonGridHtml = this._renderCloudComparisonGrid({
                remoteDate,
                localDate,
                rStudentCount,
                rClassCount,
                lStudentCount,
                lClassCount,
                isVolumeIdentical,
                isMissingLocalStudents,
                hasLocalChanges,
                isInSync,
                resolvedProviderLabel,
                resolvedProviderIcon
            });

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';

            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-content-restore modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title has-header-icon">
                        <div class="modal-alert-header-icon cloud">
                            <iconify-icon icon="solar:cloud-download-bold"></iconify-icon>
                        </div>
                        <span>Restaurer depuis le Cloud</span>
                    </h3>
                    <div class="modal-alert-message">
                        ${hasLocalChanges
                            ? 'Vérifiez les dates avant de recharger votre espace de travail.'
                            : 'Rechargez votre espace de travail depuis votre sauvegarde en ligne.'}
                    </div>

                    ${comparisonGridHtml}

                    ${hasLocalChanges ? this._renderImpactBox({
                        isWarning: true,
                        icon: 'solar:danger-triangle-bold',
                        title: 'Sera remplacé sur cet appareil :',
                        items: diffItems,
                        footerText: 'Une copie de secours de votre session sera créée automatiquement.'
                    }) : isInSync ? `
                    <div class="restore-safety-notice in-sync">
                        <iconify-icon icon="solar:check-circle-bold"></iconify-icon>
                        <div>
                            <strong>Session alignée :</strong> Vos données locales sont déjà synchronisées.
                        </div>
                    </div>
                    ` : `
                    <div class="restore-safety-notice warning">
                        <iconify-icon icon="solar:cloud-download-bold"></iconify-icon>
                        <div>
                            ${isMissingLocalStudents
                                ? `<strong>Restauration recommandée :</strong> Vos élèves sont absents de cet appareil. La sauvegarde Cloud permet de récupérer vos <strong>${rStudentCount} élève${rStudentCount > 1 ? 's' : ''}</strong>.`
                                : `<strong>Différence détectée :</strong> Votre sauvegarde Cloud (${rStudentCount} élève${rStudentCount > 1 ? 's' : ''} · ${rClassCount} classe${rClassCount > 1 ? 's' : ''}) diffère de votre session locale.`}
                        </div>
                    </div>
                    `}
                </div>

                <div class="modal-alert-actions">
                    <button type="button" class="btn btn-secondary" id="restoreConfirmCancelBtn">Annuler</button>
                    <button type="button" class="btn btn-primary" id="restoreConfirmOkBtn">Restaurer</button>
                </div>
            </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            this._bindConfirmActions(
                modal,
                document.getElementById('restoreConfirmOkBtn'),
                document.getElementById('restoreConfirmCancelBtn'),
                resolve,
                hasLocalChanges
            );
        });
    },

    /**
     * Modale de confirmation de sauvegarde vers le Cloud.
     * Partage la même grille comparative à 2 cartes (Cloud vs Session locale) que la restauration.
     * 
     * @param {Object} options
     * @param {number} [options.localStudentCount=0]
     * @param {number} [options.localClassCount=0]
     * @param {number|null} [options.remoteStudentCount=null]
     * @param {number|string|null} [options.lastSyncTime=null]
     * @param {number|string|null} [options.localDate=null]
     * @param {string} [options.providerName='google']
     * @param {string} [options.providerLabel='Google Drive']
     * @param {string} [options.providerIcon='logos:google-drive']
     * @param {boolean} [options.isInSync=false]
     * @returns {Promise<boolean>}
     */
    showSaveConfirmationModal(options = {}) {
        return new Promise((resolve) => {
            const {
                localStudentCount = 0,
                localClassCount = 0,
                remoteStudentCount = null,
                lastSyncTime = null,
                localDate = null,
                providerName = 'google',
                providerLabel = null,
                providerIcon = null,
                isInSync = false
            } = options;

            const modalId = 'saveConfirmationModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const { label: defaultProviderLabel, icon: defaultProviderIcon } = this._getProviderMeta(providerName);
            const resolvedProviderLabel = providerLabel ?? defaultProviderLabel;
            const resolvedProviderIcon = providerIcon ?? defaultProviderIcon;

            const lStudentCount = Number.isFinite(localStudentCount) ? localStudentCount : (parseInt(localStudentCount, 10) || 0);
            const lClassCount = Number.isFinite(localClassCount) ? localClassCount : (parseInt(localClassCount, 10) || 0);
            const rStudentCount = typeof remoteStudentCount === 'number' && remoteStudentCount > 0 ? remoteStudentCount : null;

            const hasDataShrinkageWarning = rStudentCount !== null && lStudentCount < rStudentCount;
            const isVolumeIdentical = rStudentCount === null || rStudentCount === lStudentCount;
            const isFirstSync = !lastSyncTime && rStudentCount === null && !isInSync && !localStorage.getItem('bulletin_last_sync');
            const hasLocalChanges = !isInSync;

            const diffItems = (!hasDataShrinkageWarning && hasLocalChanges)
                ? (isFirstSync && lStudentCount > 0
                    ? [{ icon: 'solar:users-group-rounded-bold', text: `${lStudentCount} élève${lStudentCount > 1 ? 's' : ''}${lClassCount > 0 ? ` · ${lClassCount} classe${lClassCount > 1 ? 's' : ''}` : ''}` }]
                    : this._getLocalDiffDetails({ lastSyncTime, remoteStudentCount: rStudentCount, localStudentCount: lStudentCount }))
                : [];

            const comparisonGridHtml = this._renderCloudComparisonGrid({
                remoteDate: lastSyncTime,
                localDate,
                rStudentCount,
                rClassCount: null,
                lStudentCount,
                lClassCount,
                isVolumeIdentical,
                isMissingLocalStudents: false,
                hasLocalChanges,
                isInSync,
                isFirstSync,
                resolvedProviderLabel,
                resolvedProviderIcon
            });

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';

            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-content-save modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title has-header-icon">
                        <div class="modal-alert-header-icon cloud">
                            <iconify-icon icon="solar:cloud-upload-bold"></iconify-icon>
                        </div>
                        <span>Sauvegarder vers le Cloud</span>
                    </h3>
                    <div class="modal-alert-message">
                        ${hasLocalChanges
                            ? 'Vérifiez les dates avant de mettre à jour votre sauvegarde en ligne.'
                            : 'Sécurisez votre espace de travail sur votre sauvegarde en ligne.'}
                    </div>

                    ${comparisonGridHtml}

                    ${hasDataShrinkageWarning ? `
                    <div class="restore-safety-notice warning">
                        <iconify-icon icon="solar:danger-triangle-bold"></iconify-icon>
                        <div>
                            <strong>Attention (réduction de données) :</strong> Votre dernière sauvegarde Cloud contenait <strong>${rStudentCount} élèves</strong>. Cette action va la remplacer par votre session actuelle (${lStudentCount} élève${lStudentCount > 1 ? 's' : ''}).
                        </div>
                    </div>
                    ` : isInSync ? `
                    <div class="restore-safety-notice in-sync">
                        <iconify-icon icon="solar:check-circle-bold"></iconify-icon>
                        <div>
                            <strong>Session alignée :</strong> Vos données locales sont déjà synchronisées.
                        </div>
                    </div>
                    ` : this._renderImpactBox({
                        isWarning: false,
                        icon: 'solar:cloud-upload-bold',
                        title: 'Modifications à enregistrer :',
                        items: diffItems
                    })}
                </div>

                <div class="modal-alert-actions">
                    <button type="button" class="btn btn-secondary" id="saveConfirmCancelBtn">Annuler</button>
                    <button type="button" class="btn btn-primary" id="saveConfirmOkBtn">Sauvegarder</button>
                </div>
            </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            this._bindConfirmActions(
                modal,
                document.getElementById('saveConfirmOkBtn'),
                document.getElementById('saveConfirmCancelBtn'),
                resolve,
                hasDataShrinkageWarning
            );
        });
    },

    /**
     * Branche les actions standard d'une modale de confirmation (boutons, clic extérieur, clavier).
     * @param {HTMLElement} modal
     * @param {HTMLElement} okBtn
     * @param {HTMLElement} cancelBtn
     * @param {Function} resolve - Résolu avec true (confirmé) ou false (annulé)
     * @param {boolean} [isDestructive=false] - Focus sur Annuler ; Entrée active le bouton focalisé au lieu de confirmer
     * @private
     */
    _bindConfirmActions(modal, okBtn, cancelBtn, resolve, isDestructive = false) {
        let keyHandler;

        const finish = (confirmed) => {
            document.removeEventListener('keydown', keyHandler);
            resolve(confirmed);
            this.closeModal(modal);
        };

        okBtn.addEventListener('click', () => finish(true), { once: true });
        cancelBtn.addEventListener('click', () => finish(false), { once: true });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) finish(false);
        });

        keyHandler = (e) => {
            if (this.activeModal !== modal) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            } else if (e.key === 'Enter' && !isDestructive) {
                e.preventDefault();
                finish(true);
            }
        };
        document.addEventListener('keydown', keyHandler);

        (isDestructive ? cancelBtn : okBtn).focus();
    },

    /**
     * Modale de confirmation "dure" — l'utilisateur doit taper un mot précis pour confirmer.
     * Utilisée pour les actions irréversibles (factory reset, suppression totale).
     * 
     * @param {Object} options
     * @param {string} options.title - Titre de la modale
     * @param {string} options.message - Message HTML explicatif
     * @param {string} options.confirmWord - Mot que l'utilisateur doit taper (ex: "SUPPRIMER")
     * @param {string} [options.confirmText='Confirmer'] - Texte du bouton de confirmation
     * @param {string} [options.cancelText='Annuler'] - Texte du bouton d'annulation
     * @param {string} [options.inputPlaceholder] - Placeholder du champ
     * @returns {Promise<boolean>}
     */
    showHardConfirmModal(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirmation requise',
                message = '',
                confirmWord = 'SUPPRIMER',
                confirmText = 'Confirmer',
                cancelText = 'Annuler',
                inputPlaceholder
            } = options;

            const modalId = 'hardConfirmModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal modal-danger';

            const placeholder = inputPlaceholder || `Tapez ${confirmWord} pour confirmer`;

            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title">${title}</h3>
                    <div class="modal-alert-message">${message}</div>
                    
                    <div class="hard-confirm-input-wrapper">
                        <label class="hard-confirm-label" for="hardConfirmInput">
                            Tapez <strong class="hard-confirm-word">${confirmWord}</strong> pour confirmer :
                        </label>
                        <input 
                            type="text" 
                            id="hardConfirmInput" 
                            class="hard-confirm-input" 
                            placeholder="${placeholder}" 
                            autocomplete="off" 
                            spellcheck="false"
                        >
                    </div>
                </div>
                <div class="modal-alert-actions" style="margin-top: 12px;">
                    <button class="btn btn-secondary" id="hardConfirmCancelBtn">${cancelText}</button>
                    <button class="btn btn-danger" id="hardConfirmOkBtn" disabled>${confirmText}</button>
                </div>
            </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            const input = document.getElementById('hardConfirmInput');
            const okBtn = document.getElementById('hardConfirmOkBtn');
            const cancelBtn = document.getElementById('hardConfirmCancelBtn');
            const closeBtn = modal.querySelector('.close-button');

            let keyHandler;

            const cleanup = () => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
            };

            const handleConfirm = () => {
                if (okBtn.disabled) return;
                cleanup();
                resolve(true);
                this.closeModal(modal);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
                this.closeModal(modal);
            };

            input.addEventListener('input', () => {
                const match = input.value.trim() === confirmWord;
                okBtn.disabled = !match;
                input.classList.toggle('match', match);
            });

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
                } else if (e.key === 'Enter' && !okBtn.disabled) {
                    e.preventDefault();
                    handleConfirm();
                }
            };
            document.addEventListener('keydown', keyHandler);

            setTimeout(() => input.focus(), 150);
        });
    },

    closeAllModals(options = {}) {
        const modals = new Set([
            this.activeModal,
            this.stackedModal,
            DOM.settingsModal,
            DOM.personalizationModal,
            DOM.studentDetailsModal,
            DOM.helpModal,
            DOM.welcomeModal,
            DOM.importPreviewModal,
            ...document.querySelectorAll('.modal.modal-visible, .modal.show')
        ]);
        this.stackedModal = null; // Prevent restoring stacked modals when closing all
        modals.forEach(m => {
            if (m) this.closeModal(m, options);
        });
    }
};

ModalUI._ensureStandaloneFocusTrap();
