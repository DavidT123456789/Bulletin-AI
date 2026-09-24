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

    /** @private */
    _isIgnoringTooltips: false,

    /** @private Map pour stocker les timeouts d'animation par modale */
    _animTimeouts: new WeakMap(),

    /**
     * Ouvre une modale avec animation style Apple.
     * @param {HTMLElement|string} modalOrId - L'élément modale ou son ID
     */
    openModal(modalOrId) {
        const modal = typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
        if (!modal) return;

        // Déclencher un événement lors de l'ouverture des modales de paramétrage pour créer un snapshot
        if (modal.id === 'appSettingsModal' || modal.id === 'personalizationModal') {
            document.dispatchEvent(new CustomEvent('settings-modal-open', { detail: { modalId: modal.id } }));
        }

        // Clear any ongoing close animation timeout to prevent overlaps
        if (this._animTimeouts.has(modal)) {
            clearTimeout(this._animTimeouts.get(modal));
            this._animTimeouts.delete(modal);
        }

        modal.classList.remove('modal-closing');

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

        // Accessibilité (WCAG 2.1) : ARIA
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        this.activeModal = modal;
        document.body.classList.add('modal-open');

        this._isIgnoringTooltips = true;

        // Configuration du Focus Trap
        if (this._focusTrapHandler) document.removeEventListener('keydown', this._focusTrapHandler);
        this._focusTrapHandler = (e) => {
            if (e.key !== 'Tab') return;
            const focusableElements = Array.from(modal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )).filter(el => !el.disabled && el.offsetParent !== null);
            
            if (focusableElements.length === 0) return;
            const firstEl = focusableElements[0];
            const lastEl = focusableElements[focusableElements.length - 1];

            if (e.shiftKey && document.activeElement === firstEl) {
                lastEl.focus();
                e.preventDefault();
            } else if (!e.shiftKey && document.activeElement === lastEl) {
                firstEl.focus();
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', this._focusTrapHandler);

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
        const timeoutId = setTimeout(() => {
            this._animTimeouts.delete(modal);
            modal.style.display = 'none';
            modal.classList.remove('modal-closing');
            modal.classList.remove('modal-visible');
            modal.classList.remove('show');

            // Gestion des modales empilées
            if (this.stackedModal && modal.id === 'helpModal') {
                this.activeModal = this.stackedModal;
                this.stackedModal = null;
                // Rediriger le focus trap vers la modale restaurée
                this.openModal(this.activeModal.id); 
            } else {
                if (this._focusTrapHandler) {
                    document.removeEventListener('keydown', this._focusTrapHandler);
                    this._focusTrapHandler = null;
                }
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
                const dynamicModals = ['customConfirmModal', 'customChoicesModal', 'hardConfirmModal', 'promptPreviewModal', 'conflictResolutionModal'];
                if (dynamicModals.includes(modal.id) && modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
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
     * Affiche une modale de résolution de conflit Cloud à 3 choix (Merge, Overwrite, Restore).
     * @param {Object} options
     * @param {string|number} [options.remoteDate] - Timestamp de la version Cloud
     * @param {number} [options.localStudentCount] - Nombre d'élèves en local
     * @returns {Promise<'merge'|'overwrite'|'restore'|'cancel'>}
     */
    showConflictResolutionModal(options = {}) {
        return new Promise((resolve) => {
            const {
                remoteDate = null,
                localStudentCount = 0
            } = options;

            const modalId = 'conflictResolutionModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const remoteDateStr = remoteDate
                ? new Date(remoteDate).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                : 'récemment';

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';

            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-content-conflict modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title">⚠️ Conflit de synchronisation</h3>
                    <div class="modal-alert-message">
                        Une sauvegarde plus récente existe sur le Cloud (<strong>${remoteDateStr}</strong>), enregistrée depuis un autre appareil.<br>
                        Des modifications locales existent également (${localStudentCount} élève${localStudentCount > 1 ? 's' : ''}).
                    </div>

                    <div class="conflict-choices-list">
                        <!-- Option 1: Merge (Recommandé) -->
                        <button type="button" class="conflict-choice-card recommended" id="conflictChoiceMerge">
                            <div class="conflict-choice-icon">
                                <iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon>
                            </div>
                            <div class="conflict-choice-body">
                                <div class="conflict-choice-header">
                                    <span class="conflict-choice-title">Fusionner les deux versions</span>
                                    <span class="conflict-badge-rec">Recommandé</span>
                                </div>
                                <span class="conflict-choice-desc">
                                    Combine vos ajouts locaux et les données distantes <strong>sans perte</strong> (nouveaux élèves, entrées de journal de bord, appréciations).
                                </span>
                            </div>
                        </button>

                        <!-- Option 2: Overwrite -->
                        <button type="button" class="conflict-choice-card" id="conflictChoiceOverwrite">
                            <div class="conflict-choice-icon">
                                <iconify-icon icon="solar:cloud-upload-bold"></iconify-icon>
                            </div>
                            <div class="conflict-choice-body">
                                <div class="conflict-choice-header">
                                    <span class="conflict-choice-title">Écraser la version Cloud</span>
                                </div>
                                <span class="conflict-choice-desc">
                                    Remplace le Cloud par cet appareil. Ignore les modifications faites sur l'autre appareil.
                                </span>
                            </div>
                        </button>

                        <!-- Option 3: Restore -->
                        <button type="button" class="conflict-choice-card" id="conflictChoiceRestore">
                            <div class="conflict-choice-icon">
                                <iconify-icon icon="solar:cloud-download-bold"></iconify-icon>
                            </div>
                            <div class="conflict-choice-body">
                                <div class="conflict-choice-header">
                                    <span class="conflict-choice-title">Remplacer par la version Cloud</span>
                                </div>
                                <span class="conflict-choice-desc">
                                    Abandonne les modifications de cet appareil et recharge la version Cloud (une copie de secours locale sera conservée).
                                </span>
                            </div>
                        </button>
                    </div>
                </div>

                <div class="modal-alert-actions">
                    <button type="button" class="btn btn-secondary" id="conflictCancelBtn">Annuler</button>
                </div>
            </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            const mergeBtn = document.getElementById('conflictChoiceMerge');
            const overwriteBtn = document.getElementById('conflictChoiceOverwrite');
            const restoreBtn = document.getElementById('conflictChoiceRestore');
            const cancelBtn = document.getElementById('conflictCancelBtn');

            let keyHandler;

            const cleanup = () => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
            };

            const selectChoice = (choice) => {
                cleanup();
                resolve(choice);
                this.closeModal(modal);
            };

            mergeBtn.addEventListener('click', () => selectChoice('merge'), { once: true });
            overwriteBtn.addEventListener('click', () => selectChoice('overwrite'), { once: true });
            restoreBtn.addEventListener('click', () => selectChoice('restore'), { once: true });
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

            mergeBtn.focus();
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
     * Formate un timestamp sous forme relative + absolue (ex: "Il y a 1h (24 sept., 16:33)").
     * @param {number|string|Date} timestamp
     * @returns {string|null}
     * @private
     */
    _formatRelativeDate(timestamp) {
        if (!timestamp) return null;
        const d = new Date(timestamp);
        if (isNaN(d.getTime())) return null;

        const dateStr = d.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        const diffMs = Date.now() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);

        let rel = '';
        if (diffMin < 2) rel = 'À l\'instant';
        else if (diffMin < 60) rel = `Il y a ${diffMin} min`;
        else if (diffHours < 24) rel = `Il y a ${diffHours}h`;
        else if (diffDays === 1) rel = 'Hier';
        else rel = `Il y a ${diffDays} jrs`;

        return rel ? `${rel} (${dateStr})` : dateStr;
    },

    /**
     * Modale de confirmation comparative pré-restauration.
     * Affiche un comparatif clair (Cloud vs Local) et supprime l'action aveugle.
     * 
     * @param {Object} options
     * @param {string|number} [options.remoteDate] - Date ou timestamp de la version Cloud
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
                remoteStudentCount = 0,
                remoteClassCount = 0,
                localStudentCount = 0,
                localClassCount = 0,
                providerName = 'google'
            } = options;

            const modalId = 'restoreConfirmationModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const { label: providerLabel, icon: providerIcon } = this._getProviderMeta(providerName);
            const formattedTitleDate = this._formatRelativeDate(remoteDate) ?? 'Date inconnue';

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';

            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-content-restore modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title" style="display: flex; align-items: center; gap: 12px;">
                        <div class="modal-alert-header-icon cloud">
                            <iconify-icon icon="solar:cloud-download-bold"></iconify-icon>
                        </div>
                        <span>Restaurer depuis le Cloud</span>
                    </h3>
                    <div class="modal-alert-message">
                        Vérifiez les données distantes avant de recharger votre espace de travail.
                    </div>

                    <div class="restore-comparison-grid">
                        <!-- Carte Cloud -->
                        <div class="restore-comparison-card cloud">
                            <div class="restore-card-badge">
                                <iconify-icon icon="${providerIcon}" style="font-size: 0.9em;"></iconify-icon>
                                <span>${providerLabel}</span>
                            </div>
                            <div class="restore-card-main-stat">
                                ${formattedTitleDate}
                            </div>
                            <div class="restore-card-sub-stat">
                                ${remoteStudentCount} élève${remoteStudentCount > 1 ? 's' : ''} · ${remoteClassCount} classe${remoteClassCount > 1 ? 's' : ''}
                            </div>
                            <div class="restore-card-date">
                                <iconify-icon icon="solar:check-read-linear"></iconify-icon>
                                <span>Sauvegarde complète</span>
                            </div>
                        </div>

                        <!-- Carte Locale -->
                        <div class="restore-comparison-card local">
                            <div class="restore-card-badge">
                                <iconify-icon icon="solar:laptop-linear" style="font-size: 0.9em;"></iconify-icon>
                                <span>Session locale</span>
                            </div>
                            <div class="restore-card-main-stat">
                                Session actuelle
                            </div>
                            <div class="restore-card-sub-stat">
                                ${localStudentCount} élève${localStudentCount > 1 ? 's' : ''} · ${localClassCount} classe${localClassCount > 1 ? 's' : ''}
                            </div>
                            <div class="restore-card-date">
                                <iconify-icon icon="solar:laptop-minimalistic-linear"></iconify-icon>
                                <span>Sur cet appareil</span>
                            </div>
                        </div>
                    </div>

                    <div class="restore-safety-notice">
                        <iconify-icon icon="solar:shield-check-bold"></iconify-icon>
                        <div>
                            <strong>Sécurité garantie :</strong> une copie de secours de votre espace local (élèves, appréciations, paramètres) sera automatiquement conservée.
                        </div>
                    </div>
                </div>

                <div class="modal-alert-actions">
                    <button type="button" class="btn btn-secondary" id="restoreConfirmCancelBtn">Annuler</button>
                    <button type="button" class="btn btn-primary" id="restoreConfirmOkBtn">
                        <iconify-icon icon="solar:cloud-download-bold"></iconify-icon>
                        <span>Restaurer</span>
                    </button>
                </div>
            </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            const okBtn = document.getElementById('restoreConfirmOkBtn');
            const cancelBtn = document.getElementById('restoreConfirmCancelBtn');

            let keyHandler;

            const cleanup = () => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
            };

            const finish = (confirmed) => {
                cleanup();
                resolve(confirmed);
                this.closeModal(modal);
            };

            okBtn?.addEventListener('click', () => finish(true), { once: true });
            cancelBtn?.addEventListener('click', () => finish(false), { once: true });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) finish(false);
            });

            keyHandler = (e) => {
                if (this.activeModal !== modal) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    finish(false);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    finish(true);
                }
            };
            document.addEventListener('keydown', keyHandler);

            okBtn?.focus();
        });
    },

    /**
     * Modale de confirmation de sauvegarde vers le Cloud.
     * Résumé épuré (élèves, classes, provider) sans bruit inutile.
     * Détecte et alerte en cas de régression de données (data shrinkage).
     * 
     * @param {Object} options
     * @param {number} [options.localStudentCount=0]
     * @param {number} [options.localClassCount=0]
     * @param {number|null} [options.remoteStudentCount=null]
     * @param {number|string|null} [options.lastSyncTime=null]
     * @param {string} [options.providerName='google']
     * @param {string} [options.providerLabel='Google Drive']
     * @param {string} [options.providerIcon='logos:google-drive']
     * @returns {Promise<boolean>}
     */
    showSaveConfirmationModal(options = {}) {
        return new Promise((resolve) => {
            const {
                localStudentCount = 0,
                localClassCount = 0,
                remoteStudentCount = null,
                lastSyncTime = null,
                providerName = 'google',
                providerLabel = null,
                providerIcon = null
            } = options;

            const modalId = 'saveConfirmationModal';
            let modal = document.getElementById(modalId);
            if (modal) modal.remove();

            const { label: defaultProviderLabel, icon: defaultProviderIcon } = this._getProviderMeta(providerName);
            const resolvedProviderLabel = providerLabel ?? defaultProviderLabel;
            const resolvedProviderIcon = providerIcon ?? defaultProviderIcon;

            const formattedLastSync = this._formatRelativeDate(lastSyncTime);
            const subtitleDetail = formattedLastSync ? `Dernière sauvegarde : ${formattedLastSync}` : 'Prêt à synchroniser';

            const hasDataShrinkageWarning =
                typeof remoteStudentCount === 'number' &&
                remoteStudentCount > 0 &&
                localStudentCount < remoteStudentCount;

            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';

            modal.innerHTML = `
            <div class="modal-content modal-content-confirm modal-content-save modal-alert-ios">
                <div class="modal-alert-body">
                    <h3 class="modal-alert-title" style="display: flex; align-items: center; gap: 12px;">
                        <div class="modal-alert-header-icon cloud">
                            <iconify-icon icon="solar:cloud-upload-bold"></iconify-icon>
                        </div>
                        <span>Sauvegarder vers le Cloud</span>
                    </h3>
                    <div class="modal-alert-message">
                        Vos données actuelles vont être sécurisées sur votre espace personnel.
                    </div>

                    <div class="save-summary-card">
                        <div class="save-summary-header">
                            <div class="restore-card-badge" style="background: var(--primary-color); color: white;">
                                <iconify-icon icon="${providerIcon}" style="font-size: 0.9em;"></iconify-icon>
                                <span>${providerLabel}</span>
                            </div>
                            <span class="save-card-destination">
                                <iconify-icon icon="solar:shield-check-linear"></iconify-icon>
                                <span>Espace sécurisé</span>
                            </span>
                        </div>
                        <div class="restore-card-main-stat">
                            ${localStudentCount} élève${localStudentCount > 1 ? 's' : ''} · ${localClassCount} classe${localClassCount > 1 ? 's' : ''}
                        </div>
                        <div class="restore-card-date">
                            <iconify-icon icon="solar:check-circle-bold" style="color: var(--success-color, #10b981);"></iconify-icon>
                            <span>${subtitleDetail}</span>
                        </div>
                    </div>

                    ${hasDataShrinkageWarning ? `
                    <div class="restore-safety-notice warning">
                        <iconify-icon icon="solar:danger-triangle-bold"></iconify-icon>
                        <div>
                            <strong>Attention (réduction de données) :</strong> Votre dernière sauvegarde Cloud contenait <strong>${remoteStudentCount} élèves</strong>. Cette action va la remplacer par votre session actuelle (${localStudentCount} élèves).
                        </div>
                    </div>
                    ` : ''}
                </div>

                <div class="modal-alert-actions">
                    <button type="button" class="btn btn-secondary" id="saveConfirmCancelBtn">Annuler</button>
                    <button type="button" class="btn btn-primary" id="saveConfirmOkBtn">
                        <iconify-icon icon="solar:cloud-upload-bold"></iconify-icon>
                        <span>Sauvegarder</span>
                    </button>
                </div>
            </div>`;

            document.body.appendChild(modal);
            this.openModal(modal);

            const okBtn = document.getElementById('saveConfirmOkBtn');
            const cancelBtn = document.getElementById('saveConfirmCancelBtn');

            let keyHandler;

            const cleanup = () => {
                if (keyHandler) document.removeEventListener('keydown', keyHandler);
            };

            const finish = (confirmed) => {
                cleanup();
                resolve(confirmed);
                this.closeModal(modal);
            };

            okBtn?.addEventListener('click', () => finish(true), { once: true });
            cancelBtn?.addEventListener('click', () => finish(false), { once: true });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) finish(false);
            });

            keyHandler = (e) => {
                if (this.activeModal !== modal) return;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    finish(false);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    finish(true);
                }
            };
            document.addEventListener('keydown', keyHandler);

            okBtn?.focus();
        });
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

    closeAllModals() {
        this.stackedModal = null; // Prevent restoring stacked modals when closing all
        const modals = [
            DOM.settingsModal,
            DOM.studentDetailsModal,
            DOM.helpModal,
            DOM.welcomeModal,
            document.getElementById('customConfirmModal'),
            document.getElementById('customChoicesModal'),
            document.getElementById('hardConfirmModal'),
            document.getElementById('classDashboardModal'),
            document.getElementById('promptPreviewModal'),
            DOM.importPreviewModal
        ];
        modals.forEach(m => {
            if (m) this.closeModal(m);
        });
    }
};
