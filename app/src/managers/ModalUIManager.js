/**
 * @fileoverview Gestionnaire des modales de l'application Bulletin AI.
 * 
 * Ce module centralise toutes les fonctions liées à l'ouverture, fermeture
 * et gestion des modales (focus trap, modales empilées, etc.).
 * 
 * @module managers/ModalUIManager
 */

import { DOM } from '../utils/DOM.js';

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

        setTimeout(() => {
            this._isIgnoringTooltips = false;
        }, 100);
    },

    /**
     * Ferme une modale avec animation style Apple.
     * @param {HTMLElement|string} modalOrId - L'élément modale ou son ID
     */
    closeModal(modalOrId) {
        const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
        if (!modal) return;

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
     * Ferme toutes les modales ouvertes.
     */
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
