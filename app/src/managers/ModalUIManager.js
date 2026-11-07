/**
 * @fileoverview Gestionnaire des modales de l'application Bulletin AI.
 * 
 * Ce module centralise toutes les fonctions liées à l'ouverture, fermeture
 * et gestion des modales (focus trap, modales empilées, etc.).
 * 
 * @module managers/ModalUIManager
 */

import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { HistoryManager } from './HistoryManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
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
    'backupImportModal', 'moveStudentModal', 'pickExistingStudentsModal'
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

    /** @private Map pour stocker les requestAnimationFrame d'ouverture par modale */
    _animRafs: new WeakMap(),

    /** @private Map pour stocker les hooks de cycle de vie (onClose/onClosed) par modale */
    _modalHooks: new WeakMap(),

    /**
     * Annule un requestAnimationFrame d'ouverture en attente pour une modale.
     * @param {HTMLElement} modal
     * @private
     */
    _cancelAnimRaf(modal) {
        const rafId = this._animRafs.get(modal);
        if (!rafId) return;
        if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(rafId);
        } else {
            clearTimeout(rafId);
        }
        this._animRafs.delete(modal);
    },

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

            if (activeTrapTarget.classList?.contains('is-initial-focus') &&
                (e.key === 'Tab' || e.key.startsWith('Arrow'))) {
                activeTrapTarget.classList.remove('is-initial-focus');
            }

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
        return modal.id === 'helpModal' || DYNAMIC_MODAL_IDS.has(modal.id) || Boolean(options.isStacked);
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

        // Clear any ongoing close animation timeout or pending open rAF to prevent overlaps
        if (this._animTimeouts.has(modal)) {
            clearTimeout(this._animTimeouts.get(modal));
            this._animTimeouts.delete(modal);
        }
        this._cancelAnimRaf(modal);

        const isTrombiModal = modal.id === 'trombiWizardModal' || modal.classList.contains('trombi-wizard-modal');
        if (options.onClose || options.onClosed) {
            this._modalHooks.set(modal, {
                onClose: options.onClose,
                onClosed: options.onClosed
            });
        }
        modal.classList.remove('modal-closing', 'closing', 'modal-visible', 'show');
        modal.classList.add('is-initial-focus');
        if (isTrombiModal) {
            modal.classList.add('visible');
        }

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

        const modalContent = modal.querySelector('.modal-content, .trombi-wizard-content');
        if (modalContent) {
            modalContent.style.transformOrigin = 'center center';
        }

        // Afficher la modale puis déclencher l'animation
        modal.style.display = 'flex';
        // Forcer le reflow pour que la transition s'applique
        void modal.offsetWidth;
        modal.querySelectorAll('.ui-tabs-content, .modal-body:not(.modal-body-flex):not(.import-wizard-body)').forEach(el => {
            FocusPanelManager.bindScrollAffordances?.(el);
        });
        // Ajouter les classes pour déclencher l'animation Apple
        const scheduleVisible = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (fn) => setTimeout(fn, 0);
        const rafId = scheduleVisible(() => {
            this._animRafs.delete(modal);
            if (!modal.classList.contains('modal-closing') && !modal.classList.contains('closing')) {
                modal.classList.add('modal-visible', 'show');
            }
        });
        this._animRafs.set(modal, rafId);

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
            UI.initGliders?.();
            // Then update positions for this modal's visible containers
            modal.querySelectorAll('.ui-segmented-control').forEach(container => {
                if (container.classList.contains('has-glider')) {
                    UI.updateGlider?.(container, true);
                }
            });

            // Si le focus est déjà positionné sur un élément à l'intérieur de la modale (par ex. par UIManager), on le conserve.
            // Pour la modale Personnalisation, conserver le focus sur le conteneur (tabindex="-1") évite d'illuminer le bouton '?' au premier appui sur ←/→.
            if (modal.id === 'personalizationModal' || (document.activeElement && modal.contains(document.activeElement) && document.activeElement !== modal)) {
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

        const isTrombiModal = modal.id === 'trombiWizardModal' || modal.classList.contains('trombi-wizard-modal');
        if (modal.classList.contains('modal-closing') ||
            modal.classList.contains('closing') ||
            modal.style.display === 'none' ||
            (modal.style.display === '' &&
                !modal.classList.contains('modal-visible') &&
                !modal.classList.contains('show') &&
                !modal.classList.contains('visible'))) {
            return;
        }

        this._cancelAnimRaf(modal);
        const hooks = this._modalHooks.get(modal);
        options.onClose?.();
        if (hooks?.onClose && hooks.onClose !== options.onClose) {
            hooks.onClose();
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
        if (isTrombiModal) {
            modal.classList.add('closing');
        }

        // Attendre la fin de l'animation avant de masquer
        const timeoutId = setTimeout(() => {
            this._animTimeouts.delete(modal);
            this._modalHooks.delete(modal);
            modal.style.display = isTrombiModal ? '' : 'none';
            modal.classList.remove('modal-closing', 'closing', 'modal-visible', 'show', 'visible', 'is-initial-focus');
            options.onClosed?.();
            if (hooks?.onClosed && hooks.onClosed !== options.onClosed) {
                hooks.onClosed();
            }

            if (modal.id !== 'helpModal') {
                modal.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open'));
            }

            const modalContent = modal.querySelector('.modal-content, .trombi-wizard-content');
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
                <button type="button" class="btn btn-ghost modal-details-toggle" id="modalAlertDetailsBtn" aria-expanded="false" aria-controls="modalAlertDetails">
                    <span>Détails</span> <iconify-icon icon="solar:alt-arrow-down-linear" aria-hidden="true"></iconify-icon>
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
                <div class="modal-alert-actions${detailsHtml ? ' has-details' : ''}${extraButton ? ' modal-alert-actions-3' : ''}">
                    ${detailsBtnHtml}
                    ${buttonsHTML}
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
                const detailsContainer = document.getElementById('modalAlertDetails');
                detailsBtn.addEventListener('click', () => {
                    if (detailsContainer) {
                        const isOpen = detailsContainer.classList.toggle('is-open');
                        detailsBtn.classList.toggle('is-open', isOpen);
                        detailsBtn.setAttribute('aria-expanded', String(isOpen));
                    }
                });
            }

            // Wrappers pour gérer à la fois Callback et Promise, et la fermeture
            let settled = false;
            let keyHandler; // Définition en amont pour le cleanup

            const cleanup = () => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
            };

            const handleConfirm = () => {
                if (settled) return;
                settled = true;
                cleanup();
                if (onConfirm) onConfirm();
                resolve(true);
                this.closeModal(modal);
            };

            const handleCancel = (shouldClose = true) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (onCancel) onCancel();
                resolve(false);
                if (shouldClose) this.closeModal(modal);
            };

            const handleExtra = () => {
                if (settled) return;
                settled = true;
                cleanup();
                if (extraButton && extraButton.action) extraButton.action();
                resolve(false);
                this.closeModal(modal);
            };

            this._modalHooks.set(modal, {
                onClose: () => handleCancel(false)
            });

            // Event Listeners (once: true pour éviter les doublons)
            okBtn.addEventListener('click', handleConfirm, { once: true });
            cancelBtn.addEventListener('click', () => handleCancel(), { once: true });
            if (closeBtn) closeBtn.addEventListener('click', () => handleCancel(), { once: true });
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
                isDanger = true
            } = options;

            const modalId = 'customChoicesModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';
            if (isDanger) modal.classList.add('modal-danger');

            const confirmBtnClass = isDanger ? 'btn-danger' : 'btn-primary';

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
                                <iconify-icon icon="ph:check-bold"></iconify-icon>
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

            const okBtn = document.getElementById('choicesOkBtn');
            const cancelBtn = document.getElementById('choicesCancelBtn');
            const closeBtn = modal.querySelector('.close-button');

            // Add change listener to toggle checked class for styling and guard confirm state
            const inputs = modal.querySelectorAll('input[type="checkbox"]');
            const syncOkState = () => {
                const hasChecked = Array.from(inputs).some(el => !el.disabled && el.checked);
                if (okBtn) okBtn.disabled = !hasChecked;
            };
            inputs.forEach(input => {
                input.addEventListener('change', (e) => {
                    const item = e.target.closest('.modal-choice-item');
                    if (item) {
                        if (e.target.checked) item.classList.add('checked');
                        else item.classList.remove('checked');
                    }
                    syncOkState();
                });
            });
            syncOkState();

            let settled = false;
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
                okBtn?.removeEventListener('click', handleConfirm);
            };

            const handleConfirm = () => {
                if (settled || okBtn?.disabled) return;
                settled = true;
                cleanup();
                resolve({ confirmed: true, values: getValues() });
                this.closeModal(modal);
            };

            const handleCancel = (shouldClose = true) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve({ confirmed: false, values: {} });
                if (shouldClose) this.closeModal(modal);
            };

            this._modalHooks.set(modal, {
                onClose: () => handleCancel(false)
            });

            okBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', () => handleCancel(), { once: true });
            if (closeBtn) closeBtn.addEventListener('click', () => handleCancel(), { once: true });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) handleCancel();
            });

            keyHandler = (e) => {
                if (this.activeModal !== modal) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                } else if (e.key === 'Enter') {
                    if (!isDanger && document.activeElement?.type !== 'checkbox' && document.activeElement !== cancelBtn && !okBtn?.disabled) {
                        e.preventDefault();
                        handleConfirm();
                    }
                }
            };
            document.addEventListener('keydown', keyHandler);

            if (isDanger || okBtn?.disabled) cancelBtn.focus();
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
                    icon: 'solar:magic-stick-3-linear',
                    title: 'Fusionner les deux versions',
                    desc: 'Combine vos ajouts locaux et les données distantes <strong>sans perte</strong> (nouveaux élèves, entrées de journal de bord, appréciations).'
                },
                overwrite: {
                    id: 'conflictChoiceOverwrite',
                    icon: 'solar:cloud-upload-linear',
                    title: 'Écraser la version Cloud',
                    desc: 'Remplace le Cloud par cet appareil. Les modifications enregistrées depuis un autre appareil seront perdues.'
                },
                restore: {
                    id: 'conflictChoiceRestore',
                    icon: 'solar:cloud-download-linear',
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

            let settled = false;
            let keyHandler;

            const selectChoice = (choice, shouldClose = true) => {
                if (settled) return;
                settled = true;
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
                resolve(choice);
                if (shouldClose) this.closeModal(modal);
            };

            this._modalHooks.set(modal, {
                onClose: () => selectChoice('cancel', false)
            });

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
     * @param {string|null} [providerLabel=null]
     * @param {string|null} [providerIcon=null]
     * @returns {{ label: string, icon: string }}
     * @private
     */
    _getProviderMeta(providerName = 'google', providerLabel = null, providerIcon = null) {
        const meta = {
            google: { label: 'Google Drive', icon: 'logos:google-drive' },
            dropbox: { label: 'Dropbox', icon: 'logos:dropbox' }
        };
        const fallback = meta[providerName] ?? { label: 'Cloud', icon: 'solar:cloud-upload-linear' };
        return {
            label: providerLabel ?? fallback.label,
            icon: providerIcon ?? fallback.icon
        };
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
            items.push({ icon: 'solar:chair-linear', text: 'Plan de classe réorganisé' });
        }

        const modifiedClassNotes = classes.filter(c => c.classNoteUpdatedAt && c.classNoteUpdatedAt > lastSync).length;
        if (modifiedClassNotes > 0) {
            items.push({
                icon: 'solar:bookmark-linear',
                text: modifiedClassNotes > 1 ? `${modifiedClassNotes} mémos de classe mis à jour` : 'Mémo de classe mis à jour'
            });
        }

        // 2. Appréciations / résultats élèves (distingue les éditions de bulletins des simples déplacements ou copies de groupe vierges)
        const students = window.runtimeState?.data?.generatedResults || [];
        const modifiedRecords = students.filter(s => {
            const periods = s.studentData?.periods ? Object.values(s.studentData.periods) : [];
            const hasPeriodEdit = periods.some(p => p?._lastModified && p._lastModified > lastSync);
            if (hasPeriodEdit) return true;
            if (seatingChanged || !s._lastModified || s._lastModified <= lastSync) return false;
            const isBlankPendingFicha = Boolean(s.isPending) &&
                !s.appreciation?.trim() &&
                !periods.some(p =>
                    p?.appreciation?.trim() ||
                    (p?.grade !== null && p?.grade !== undefined && p?.grade !== '') ||
                    p?.context?.trim()
                );
            return !isBlankPendingFicha;
        });
        const modifiedStudents = Utils.countUniqueStudents(modifiedRecords, classes);
        if (modifiedStudents > 0) {
            items.push({
                icon: 'solar:document-text-linear',
                text: `${modifiedStudents} élève${modifiedStudents > 1 ? 's' : ''} avec appréciations ou notes éditées`
            });
        }

        // 3. Journal de bord
        const journalChanged = students.some(s =>
            Array.isArray(s.journal) && s.journal.some(e => e?._lastModified && e._lastModified > lastSync)
        );
        if (journalChanged) {
            items.push({ icon: 'solar:notebook-linear', text: 'Journal de bord mis à jour' });
        }

        // 4. Différence d'effectif / d'affectations (personnes uniques vs inscriptions de groupe)
        const rosterDiff = options.rosterDiff || null;
        if (rosterDiff) {
            const addedCls = rosterDiff.addedClasses || [];
            if (addedCls.length > 0 && addedCls.length <= 2) {
                addedCls.forEach(cls => {
                    items.push({
                        icon: 'solar:users-group-rounded-linear',
                        text: `${cls.isGroup ? 'Nouveau groupe' : 'Nouvelle classe'} : ${Utils.escapeHtml(cls.name)}`
                    });
                });
            } else if (addedCls.length > 2) {
                items.push({
                    icon: 'solar:users-group-rounded-linear',
                    text: `${addedCls.length} nouvelles classes ou groupes créés`
                });
            }

            const removedCls = rosterDiff.removedClasses || [];
            if (removedCls.length > 0 && removedCls.length <= 2) {
                removedCls.forEach(cls => {
                    items.push({
                        icon: 'solar:users-group-rounded-linear',
                        text: `${cls.isGroup ? 'Groupe' : 'Classe'} ${Utils.escapeHtml(cls.name)} supprimé${cls.isGroup ? '' : 'e'}`
                    });
                });
            } else if (removedCls.length > 2) {
                items.push({
                    icon: 'solar:users-group-rounded-linear',
                    text: `${removedCls.length} classes ou groupes supprimés`
                });
            }

            if (rosterDiff.newStudents > 0) {
                const n = rosterDiff.newStudents;
                items.push({
                    icon: 'solar:users-group-rounded-linear',
                    text: `+${n} ${n > 1 ? 'nouveaux élèves' : 'nouvel élève'}`
                });
            }

            if (rosterDiff.removedStudents > 0) {
                const n = rosterDiff.removedStudents;
                items.push({
                    icon: 'solar:users-group-rounded-linear',
                    text: `${n} élève${n > 1 ? 's supprimés' : ' supprimé'}`
                });
            }

            const addedEnr = rosterDiff.addedEnrollments || [];
            if (addedEnr.length > 0 && addedEnr.length <= 3) {
                addedEnr.forEach(({ className, count }) => {
                    items.push({
                        icon: 'solar:users-group-rounded-linear',
                        text: `${count} élève${count > 1 ? 's ajoutés' : ' ajouté'} à ${Utils.escapeHtml(className)}`
                    });
                });
            } else if (addedEnr.length > 3) {
                const total = addedEnr.reduce((acc, e) => acc + e.count, 0);
                items.push({
                    icon: 'solar:users-group-rounded-linear',
                    text: `${total} inscription${total > 1 ? 's ajoutées' : ' ajoutée'} dans ${addedEnr.length} classes/groupes`
                });
            }

            const movedEnr = rosterDiff.movedEnrollments || [];
            movedEnr.forEach(({ toClassName, count }) => {
                items.push({
                    icon: 'solar:users-group-rounded-linear',
                    text: `${count} élève${count > 1 ? 's déplacés' : ' déplacé'} vers ${Utils.escapeHtml(toClassName)}`
                });
            });

            const removedEnr = rosterDiff.removedEnrollments || [];
            if (removedEnr.length > 0 && removedEnr.length <= 3) {
                removedEnr.forEach(({ className, count }) => {
                    items.push({
                        icon: 'solar:users-group-rounded-linear',
                        text: `${count} élève${count > 1 ? 's retirés' : ' retiré'} de ${Utils.escapeHtml(className)}`
                    });
                });
            } else if (removedEnr.length > 3) {
                const total = removedEnr.reduce((acc, e) => acc + e.count, 0);
                items.push({
                    icon: 'solar:users-group-rounded-linear',
                    text: `${total} retrait${total > 1 ? 's' : ''} dans ${removedEnr.length} classes/groupes`
                });
            }
        } else if (options.legacyRosterChanged) {
            items.push({
                icon: 'solar:users-group-rounded-linear',
                text: 'Affectations élèves mises à jour'
            });
        } else {
            const rCount = options.remoteStudentCount ?? null;
            const lCount = options.localStudentCount ?? Utils.countUniqueStudents(students, classes);
            if (typeof rCount === 'number' && rCount > 0 && rCount !== lCount) {
                const diff = lCount - rCount;
                const diffStr = diff > 0 ? `+${diff}` : `${diff}`;
                items.push({
                    icon: 'solar:users-group-rounded-linear',
                    text: `${diffStr} élève${Math.abs(diff) > 1 ? 's' : ''} par rapport au Cloud`
                });
            }
        }

        // Fallback si modifications détectées mais aucun timestamp individuel spécifique (ex. tables, contraintes, réglages IA)
        if (items.length === 0) {
            items.push({ icon: 'solar:pen-new-square-linear', text: 'Modifications récentes de la session locale' });
        }

        return items;
    },

    /**
     * Génère la grille comparative orientée Source → Cible partagée par Sauvegarder et Restaurer.
     * @param {Object} params
     * @returns {string}
     * @private
     */
    _renderCloudComparisonGrid({
        direction = 'cloud-to-local',
        isTargetWarning = false,
        remoteDate = null,
        localDate = null,
        rStudentCount = null,
        rClassCount = null,
        lStudentCount = 0,
        lClassCount = 0,
        showSubStats = false,
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

        if (isInSync) {
            const syncedDateParts = cloudDateParts || localDateParts;
            cloudDateParts = syncedDateParts;
            localDateParts = syncedDateParts;
        } else if (cloudDateParts && localDateParts && (
            cloudDateParts.relative === localDateParts.relative ||
            cloudDateParts.absolute === localDateParts.absolute
        )) {
            cloudDateParts = this._formatDateParts(remoteDate, { precise: true });
            localDateParts = this._formatDateParts(localTimestamp, { precise: true });
        }

        const formatVolume = (students, classes) =>
            `${students} élève${students > 1 ? 's' : ''}${classes !== null ? ` · ${classes} classe${classes > 1 ? 's' : ''}` : ''}`;

        const effectiveRStudentCount = (isInSync && rStudentCount === null) ? lStudentCount : rStudentCount;
        const effectiveRClassCount = (isInSync && rClassCount === null) ? lClassCount : rClassCount;

        const cloudSubStat = (showSubStats && effectiveRStudentCount !== null)
            ? formatVolume(effectiveRStudentCount, effectiveRClassCount)
            : '';
        const localSubStat = showSubStats ? formatVolume(lStudentCount, lClassCount) : '';

        const cloudMainStatText = cloudDateParts
            ? cloudDateParts.relative
            : isInSync
                ? 'Synchronisée'
                : (isFirstSync ? 'Aucune sauvegarde' : 'Date inconnue');

        const cloudExactDateText = cloudDateParts
            ? cloudDateParts.absolute
            : isInSync
                ? 'Aucune modification'
                : (isFirstSync ? 'Première synchronisation' : '');

        const localMainStatText = hasLocalChanges
            ? (localDateParts ? localDateParts.relative : 'À l\'instant')
            : isMissingLocalStudents
                ? 'Données manquantes'
                : isInSync
                    ? (localDateParts ? localDateParts.relative : 'Synchronisée')
                    : (localDateParts ? localDateParts.relative : 'Session locale');

        const localExactDateText = hasLocalChanges
            ? (localDateParts ? localDateParts.absolute : 'Modifié récemment')
            : isMissingLocalStudents
                ? 'Aucun élève sur cet appareil'
                : isInSync
                    ? (localDateParts ? localDateParts.absolute : 'Aucune modification')
                    : (localDateParts ? localDateParts.absolute : 'Écart avec le Cloud');

        const isLocalSource = direction === 'local-to-cloud';
        const targetRoleClass = `is-target${isTargetWarning ? ' is-warning' : ''}`;
        const cloudRoleClass = isLocalSource ? targetRoleClass : 'is-source';
        const localRoleClass = isLocalSource ? 'is-source' : targetRoleClass;

        const renderCard = ({ type, roleClass, icon, label, mainStat, exactDate, subStat }) => `
                        <div class="restore-comparison-card ${type} ${roleClass}">
                            <div class="restore-card-badge">
                                <iconify-icon icon="${Utils.escapeHtml(icon)}"></iconify-icon>
                                <span>${Utils.escapeHtml(label)}</span>
                            </div>
                            <div class="restore-card-main-stat">
                                ${mainStat}
                            </div>
                            ${exactDate ? `<div class="restore-card-exact-date">${exactDate}</div>` : ''}
                            ${subStat ? `<div class="restore-card-sub-stat">${subStat}</div>` : ''}
                        </div>`;

        const cloudCardHtml = renderCard({
            type: 'cloud',
            roleClass: cloudRoleClass,
            icon: resolvedProviderIcon,
            label: resolvedProviderLabel,
            mainStat: cloudMainStatText,
            exactDate: cloudExactDateText,
            subStat: cloudSubStat
        });

        const localCardHtml = renderCard({
            type: 'local',
            roleClass: localRoleClass,
            icon: 'solar:monitor-linear',
            label: 'Session locale',
            mainStat: localMainStatText,
            exactDate: localExactDateText,
            subStat: localSubStat
        });

        const [sourceCardHtml, targetCardHtml] = isLocalSource
            ? [localCardHtml, cloudCardHtml]
            : [cloudCardHtml, localCardHtml];

        return `
                    <div class="restore-comparison-grid${isInSync ? ' is-in-sync' : ''}">
                        ${sourceCardHtml}
                        <div class="restore-flow-connector" aria-hidden="true">
                            <iconify-icon icon="ph:arrow-right-bold"></iconify-icon>
                        </div>
                        ${targetCardHtml}
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
     * Monte et ouvre le gabarit commun des modales de confirmation Cloud (Sauvegarder / Restaurer).
     * @param {Object} params
     * @returns {Promise<boolean>}
     * @private
     */
    _openCloudConfirmModal({
        modalId,
        variant,
        headerIcon,
        title,
        subtitle,
        comparisonGridHtml,
        noticeHtml = null,
        isInSync = false,
        okBtnId,
        cancelBtnId,
        confirmLabel,
        forceConfirmLabel,
        focusCancel = false
    }) {
        return new Promise((resolve) => {
            document.getElementById(modalId)?.remove();

            const resolvedNoticeHtml = noticeHtml ?? `
                    <div class="restore-safety-notice in-sync">
                        <iconify-icon icon="solar:check-circle-bold"></iconify-icon>
                        <div>
                            <strong>Session alignée :</strong> Vos données locales sont déjà synchronisées.
                        </div>
                    </div>`;

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';
            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-content-${variant} modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title has-header-icon">
                        <div class="modal-alert-header-icon cloud">
                            <iconify-icon icon="${headerIcon}"></iconify-icon>
                        </div>
                        <span>${title}</span>
                    </h3>
                    <div class="modal-alert-message">
                        ${subtitle}
                    </div>

                    ${comparisonGridHtml}

                    ${resolvedNoticeHtml}
                </div>

                <div class="modal-alert-actions${isInSync ? ' is-in-sync' : ''}">
                    ${isInSync ? `
                    <button type="button" class="btn btn-secondary" id="${okBtnId}">${forceConfirmLabel}</button>
                    <button type="button" class="btn btn-primary" id="${cancelBtnId}">Fermer</button>
                    ` : `
                    <button type="button" class="btn btn-secondary" id="${cancelBtnId}">Annuler</button>
                    <button type="button" class="btn btn-primary" id="${okBtnId}">${confirmLabel}</button>
                    `}
                </div>
            </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            this._bindConfirmActions(
                modal,
                modal.querySelector(`#${okBtnId}`),
                modal.querySelector(`#${cancelBtnId}`),
                resolve,
                focusCancel
            );
        });
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
            syncState = null,
            rosterDiff = null
        } = options;

        const { label: resolvedProviderLabel, icon: resolvedProviderIcon } =
            this._getProviderMeta(providerName, providerLabel, providerIcon);

        const toCount = (val) => Number.isFinite(val) ? val : (parseInt(val, 10) || 0);
        const rStudentCount = toCount(remoteStudentCount);
        const rClassCount = toCount(remoteClassCount);
        const lStudentCount = toCount(localStudentCount);
        const lClassCount = toCount(localClassCount);

        const isVolumeIdentical = (rStudentCount === lStudentCount) && (rClassCount === lClassCount);
        const hasRosterChanges = Boolean(rosterDiff?.hasAnyChange);
        const isMissingLocalStudents = rStudentCount > 0 && lStudentCount === 0;

        const resolvedSyncState = syncState ||
            window.SyncService?._lastSyncState ||
            (typeof window.SyncService?._computeSyncState === 'function' ? window.SyncService._computeSyncState() : null);
        const hasLocalChanges = !isMissingLocalStudents && (resolvedSyncState === 'local-changes' || resolvedSyncState === 'conflict');
        const hasSyncContext = resolvedSyncState === 'in-sync' || remoteDate !== null || rStudentCount > 0;
        const isInSync = hasSyncContext && !hasLocalChanges && isVolumeIdentical && !hasRosterChanges && resolvedSyncState !== 'cloud-changes';

        const comparisonGridHtml = this._renderCloudComparisonGrid({
            direction: 'cloud-to-local',
            isTargetWarning: hasLocalChanges,
            remoteDate,
            localDate,
            rStudentCount,
            rClassCount,
            lStudentCount,
            lClassCount,
            showSubStats: !isVolumeIdentical || (hasLocalChanges && hasRosterChanges) || (isInSync && lStudentCount > 0),
            isMissingLocalStudents,
            hasLocalChanges,
            isInSync,
            resolvedProviderLabel,
            resolvedProviderIcon
        });

        const noticeHtml = hasLocalChanges
            ? this._renderImpactBox({
                isWarning: true,
                icon: 'solar:danger-triangle-bold',
                title: 'Sera remplacé sur cet appareil :',
                items: this._getLocalDiffDetails(options),
                footerText: 'Une copie de secours de votre session sera créée automatiquement.'
            })
            : isInSync
                ? null
                : `
                    <div class="restore-safety-notice warning">
                        <iconify-icon icon="solar:cloud-download-linear"></iconify-icon>
                        <div>
                            ${isMissingLocalStudents
                                ? `<strong>Restauration recommandée :</strong> Vos élèves sont absents de cet appareil. La sauvegarde Cloud permet de récupérer vos <strong>${rStudentCount} élève${rStudentCount > 1 ? 's' : ''}</strong>.`
                                : `<strong>Différence détectée :</strong> Votre sauvegarde Cloud (${rStudentCount} élève${rStudentCount > 1 ? 's' : ''} · ${rClassCount} classe${rClassCount > 1 ? 's' : ''}) diffère de votre session locale.`}
                        </div>
                    </div>`;

        return this._openCloudConfirmModal({
            modalId: 'restoreConfirmationModal',
            variant: 'restore',
            headerIcon: 'solar:cloud-download-linear',
            title: 'Restaurer depuis le Cloud',
            subtitle: isInSync
                ? 'Aucune modification depuis votre dernière synchronisation.'
                : hasLocalChanges
                    ? 'Vérifiez les dates avant de recharger votre espace de travail.'
                    : 'Rechargez votre espace de travail depuis votre sauvegarde en ligne.',
            comparisonGridHtml,
            noticeHtml,
            isInSync,
            okBtnId: 'restoreConfirmOkBtn',
            cancelBtnId: 'restoreConfirmCancelBtn',
            confirmLabel: 'Restaurer',
            forceConfirmLabel: 'Restaurer quand même',
            focusCancel: hasLocalChanges || isInSync
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
     * @param {number|null} [options.remoteClassCount=null]
     * @param {Object|null} [options.rosterDiff=null]
     * @param {boolean} [options.legacyRosterChanged=false]
     * @param {number|string|null} [options.lastSyncTime=null]
     * @param {number|string|null} [options.localDate=null]
     * @param {string} [options.providerName='google']
     * @param {string} [options.providerLabel='Google Drive']
     * @param {string} [options.providerIcon='logos:google-drive']
     * @param {boolean} [options.isInSync=false]
     * @returns {Promise<boolean>}
     */
    showSaveConfirmationModal(options = {}) {
        const {
            localStudentCount = 0,
            localClassCount = 0,
            remoteStudentCount = null,
            remoteClassCount = null,
            rosterDiff = null,
            legacyRosterChanged = false,
            lastSyncTime = null,
            localDate = null,
            providerName = 'google',
            providerLabel = null,
            providerIcon = null,
            isInSync = false
        } = options;

        const { label: resolvedProviderLabel, icon: resolvedProviderIcon } =
            this._getProviderMeta(providerName, providerLabel, providerIcon);

        const lStudentCount = Number.isFinite(localStudentCount) ? localStudentCount : (parseInt(localStudentCount, 10) || 0);
        const lClassCount = Number.isFinite(localClassCount) ? localClassCount : (parseInt(localClassCount, 10) || 0);
        const rStudentCount = typeof remoteStudentCount === 'number' && remoteStudentCount > 0 ? remoteStudentCount : null;
        const rClassCount = typeof remoteClassCount === 'number' && remoteClassCount >= 0 ? remoteClassCount : null;

        const hasDataShrinkageWarning = rosterDiff
            ? rosterDiff.removedStudents > 0
            : (rStudentCount !== null && lStudentCount < rStudentCount);
        const isVolumeIdentical = (rStudentCount === null || rStudentCount === lStudentCount) &&
            (rClassCount === null || rClassCount === lClassCount);
        const hasRosterChanges = Boolean(rosterDiff?.hasAnyChange || legacyRosterChanged);
        const effectiveIsInSync = Boolean(isInSync) && !hasDataShrinkageWarning && !hasRosterChanges;
        const isFirstSync = !lastSyncTime && rStudentCount === null && !effectiveIsInSync && !localStorage.getItem('bulletin_last_sync');
        const hasLocalChanges = !effectiveIsInSync;

        const comparisonGridHtml = this._renderCloudComparisonGrid({
            direction: 'local-to-cloud',
            isTargetWarning: hasDataShrinkageWarning,
            remoteDate: lastSyncTime,
            localDate,
            rStudentCount,
            rClassCount,
            lStudentCount,
            lClassCount,
            showSubStats: !isVolumeIdentical || (hasLocalChanges && hasRosterChanges && rStudentCount !== null) || (effectiveIsInSync && lStudentCount > 0),
            isMissingLocalStudents: false,
            hasLocalChanges,
            isInSync: effectiveIsInSync,
            isFirstSync,
            resolvedProviderLabel,
            resolvedProviderIcon
        });

        const removedCount = rosterDiff?.removedStudents || 0;
        const shrinkageNoticeHtml = (rStudentCount !== null && lStudentCount < rStudentCount)
            ? `<strong>Attention (réduction de données) :</strong> Votre dernière sauvegarde Cloud contenait <strong>${rStudentCount} élève${rStudentCount > 1 ? 's' : ''}</strong>. Cette action va la remplacer par votre session actuelle (${lStudentCount} élève${lStudentCount > 1 ? 's' : ''}).`
            : `<strong>Attention (suppression d'élève${removedCount > 1 ? 's' : ''}) :</strong> <strong>${removedCount} élève${removedCount > 1 ? 's' : ''}</strong> présent${removedCount > 1 ? 's' : ''} sur le Cloud ${removedCount > 1 ? 'seront définitivement supprimés' : 'sera définitivement supprimé'} de la sauvegarde.`;

        const noticeHtml = hasDataShrinkageWarning
            ? `
                    <div class="restore-safety-notice warning">
                        <iconify-icon icon="solar:danger-triangle-bold"></iconify-icon>
                        <div>
                            ${shrinkageNoticeHtml}
                        </div>
                    </div>`
            : effectiveIsInSync
                ? null
                : this._renderImpactBox({
                    isWarning: false,
                    icon: 'solar:cloud-upload-linear',
                    title: 'Modifications à enregistrer :',
                    items: isFirstSync && lStudentCount > 0
                        ? [{ icon: 'solar:users-group-rounded-linear', text: `${lStudentCount} élève${lStudentCount > 1 ? 's' : ''}${lClassCount > 0 ? ` · ${lClassCount} classe${lClassCount > 1 ? 's' : ''}` : ''}` }]
                        : this._getLocalDiffDetails({
                            lastSyncTime,
                            remoteStudentCount: rStudentCount,
                            localStudentCount: lStudentCount,
                            rosterDiff,
                            legacyRosterChanged
                        })
                });

        return this._openCloudConfirmModal({
            modalId: 'saveConfirmationModal',
            variant: 'save',
            headerIcon: 'solar:cloud-upload-linear',
            title: 'Sauvegarder vers le Cloud',
            subtitle: effectiveIsInSync
                ? 'Aucune modification depuis votre dernière synchronisation.'
                : isFirstSync
                    ? 'Sécurisez votre espace de travail sur votre sauvegarde en ligne.'
                    : 'Vérifiez les dates avant de mettre à jour votre sauvegarde en ligne.',
            comparisonGridHtml,
            noticeHtml,
            isInSync: effectiveIsInSync,
            okBtnId: 'saveConfirmOkBtn',
            cancelBtnId: 'saveConfirmCancelBtn',
            confirmLabel: 'Sauvegarder',
            forceConfirmLabel: 'Sauvegarder quand même',
            focusCancel: hasDataShrinkageWarning || effectiveIsInSync
        });
    },

    /**
     * Branche les actions standard d'une modale de confirmation (boutons, clic extérieur, clavier, fermeture externe).
     * @param {HTMLElement} modal
     * @param {HTMLElement} okBtn
     * @param {HTMLElement} cancelBtn
     * @param {Function} resolve - Résolu avec true (confirmé) ou false (annulé)
     * @param {boolean} [isDestructive=false] - Focus sur Annuler ; Entrée active le bouton focalisé au lieu de confirmer
     * @private
     */
    _bindConfirmActions(modal, okBtn, cancelBtn, resolve, isDestructive = false) {
        let settled = false;
        let keyHandler;

        const finish = (confirmed, shouldClose = true) => {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', keyHandler);
            resolve(confirmed);
            if (shouldClose) this.closeModal(modal);
        };

        this._modalHooks.set(modal, {
            onClose: () => finish(false, false)
        });

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
                <div class="modal-alert-actions">
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

            let settled = false;
            let keyHandler;

            const cleanup = () => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
            };

            const handleConfirm = () => {
                if (settled || okBtn.disabled) return;
                settled = true;
                cleanup();
                resolve(true);
                this.closeModal(modal);
            };

            const handleCancel = (shouldClose = true) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(false);
                if (shouldClose) this.closeModal(modal);
            };

            this._modalHooks.set(modal, {
                onClose: () => handleCancel(false)
            });

            input.addEventListener('input', () => {
                const match = input.value.trim() === confirmWord;
                okBtn.disabled = !match;
                input.classList.toggle('match', match);
            });

            okBtn.addEventListener('click', handleConfirm, { once: true });
            cancelBtn.addEventListener('click', () => handleCancel(), { once: true });
            if (closeBtn) closeBtn.addEventListener('click', () => handleCancel(), { once: true });

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

            setTimeout(() => {
                if (!settled) input.focus();
            }, 150);
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
            ...document.querySelectorAll('.modal.modal-visible, .modal.show')
        ]);
        this.stackedModal = null; // Prevent restoring stacked modals when closing all
        modals.forEach(m => {
            if (m) this.closeModal(m, options);
        });
    }
};

ModalUI._ensureStandaloneFocusTrap();
