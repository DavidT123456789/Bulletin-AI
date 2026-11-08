/**
 * @fileoverview Gestionnaire d'interface utilisateur (UI) principal de l'application Bulletin AI.
 * 
 * Ce module centralise toutes les fonctions liées à la manipulation de l'interface :
 * - Notifications et confirmations
 * - Gestion des thèmes (clair/sombre)
 * - Ouverture/fermeture des modales
 * - Mise à jour des statistiques et des champs de formulaire
 * - Gestion des périodes (trimestres/semestres)
 * - Tooltips et feedback visuel
 * 
 * @module managers/UIManager
 */

import { appState } from '../state/State.js';
import { MODEL_SHORT_NAMES, getProviderForModel } from '../config/models.js';
import { PROVIDER_CONFIG, hasValidApiKey } from '../config/providers.js';
import { CONFIG, CONSTS, DEFAULT_PROMPT_TEMPLATES, DEFAULT_IA_CONFIG, MODEL_DESCRIPTIONS, APP_LINKS } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { EventHandlersManager } from './EventHandlersManager.js';
import { Utils } from '../utils/Utils.js';
import { StorageManager } from './StorageManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { ModalUI } from './ModalUIManager.js';
import { FormUI } from './FormUIManager.js';
import { StatsUI } from './StatsUIManager.js';
import { DropdownManager } from './DropdownManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ThemeManager } from './ThemeManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { GliderManager } from './GliderManager.js';
import { AnimationManager } from './AnimationManager.js';
import { NotificationCoalescer } from './NotificationManager.js';
import { ClassManager } from './ClassManager.js';
import { HistoryManager } from './HistoryManager.js';

/**
 * @typedef {Object} ConfirmOptions
 * @property {string} [confirmText='Confirmer'] - Texte du bouton de confirmation
 * @property {string} [cancelText='Annuler'] - Texte du bouton d'annulation
 * @property {Object} [extraButton] - Bouton supplémentaire optionnel
 * @property {string} [extraButton.text] - Texte du bouton supplémentaire
 * @property {string} [extraButton.class] - Classe CSS du bouton
 * @property {Function} [extraButton.action] - Callback du bouton
 */

/**
 * @typedef {'success'|'error'|'warning'|'info'|'prompt'|'loading'} NotificationType
 */

/** @type {import('./AppManager.js').App|null} */
let App;

const NOTIF_ICONS = {
    success: '<iconify-icon icon="solar:check-circle-bold" aria-hidden="true"></iconify-icon>',
    error: '<iconify-icon icon="solar:close-circle-bold" aria-hidden="true"></iconify-icon>',
    warning: '<iconify-icon icon="solar:danger-circle-bold" aria-hidden="true"></iconify-icon>',
    info: '<iconify-icon icon="solar:info-circle-bold" aria-hidden="true"></iconify-icon>',
    loading: '<span class="notification-spinner" aria-hidden="true"></span>',
    prompt: '<iconify-icon icon="solar:stars-bold-duotone" aria-hidden="true"></iconify-icon>'
};

/** États visuels unifiés pour tous les boutons Générer / Régénérer / Actualiser de l'application. */
const GENERATE_BUTTON_STATES = {
    idle: { variant: 'btn-ai', icon: 'solar:stars-bold-duotone', label: 'Générer', disabled: false },
    done: { variant: 'btn-neutral', icon: 'solar:refresh-bold', label: 'Régénérer', disabled: false },
    dirty: { variant: 'btn-warning', icon: 'solar:refresh-bold', label: 'Actualiser', disabled: false },
    loading: { variant: 'btn-neutral', icon: 'ph:spinner-gap-bold', label: 'Génération…', disabled: true, spin: true }
};


/**
 * Module de gestion de l'interface utilisateur.
 * @namespace UI
 */
export const UI = {
    /**
     * Initialise le module UI avec une référence à l'application.
     * @param {Object} appInstance - Instance de l'application principale
     */
    init(appInstance) {
        App = appInstance;
        // Initialize sub-managers
        FormUI.init(appInstance);
        ThemeManager.init();
        NotificationCoalescer.init();

        // Initialize mobile stats carousel
        StatsUI.initMobileCarousel();
        // Initialize tooltips at startup
        this.initTooltips();
        // Initialize smooth accordion animations
        this.initAccordions();
        // Initialize animated gliders
        this.initGliders();
        if (!this._periodMediaQueryBound && typeof window !== 'undefined' && window.matchMedia) {
            const mq = window.matchMedia(this._compactPeriodMediaQuery);
            if (typeof mq?.addEventListener === 'function') {
                mq.addEventListener('change', () => this.updatePeriodLabels());
                this._periodMediaQueryBound = true;
            }
        }
    },

    // Modal state is now managed by ModalUI
    get activeModal() { return ModalUI.activeModal; },
    set activeModal(val) { ModalUI.activeModal = val; },
    get lastFocusedElement() { return ModalUI.lastFocusedElement; },
    set lastFocusedElement(val) { ModalUI.lastFocusedElement = val; },
    get stackedModal() { return ModalUI.stackedModal; },
    set stackedModal(val) { ModalUI.stackedModal = val; },
    get _isIgnoringTooltips() { return ModalUI._isIgnoringTooltips; },
    set _isIgnoringTooltips(val) { ModalUI._isIgnoringTooltips = val; },

    // ====================================================================
    //  NOTIFICATIONS
    //  Toast notifications et confirmations modales
    // ====================================================================

    /**
     * Retourne (ou crée) le conteneur global des notifications toast.
     * @returns {HTMLElement}
     * @private
     */
    _getNotificationContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            document.body.appendChild(container);
        }
        return container;
    },

    /**
     * Extrait optionnellement un couple { title, subtitle } depuis un message structuré ("Titre : Détail").
     * @param {string} message
     * @param {string|null} [explicitTitle=null]
     * @returns {{ title: string|null, subtitle: string }}
     * @private
     */
    _parseNotificationContent(message, explicitTitle = null) {
        let title = explicitTitle || null;
        let subtitle = message ?? '';

        if (!title && typeof message === 'string' && !message.includes('<div') && !message.includes('<br>')) {
            const match = message.match(/^([^/:<>]{2,32}?)\s*:\s+(.+)$/);
            if (match) {
                const potentialTitle = match[1].trim();
                const potentialSubtitle = match[2].trim();
                if (!potentialTitle.includes('http') && potentialSubtitle.length > 0) {
                    title = potentialTitle;
                    subtitle = potentialSubtitle;
                }
            }
        }
        return { title, subtitle };
    },

    /**
     * Construit le HTML interne du corps d'un toast (1 ligne directe en blanc ou 2 lignes Titre + Sous-titre).
     * @param {string} message
     * @param {string|null} [explicitTitle=null]
     * @returns {string}
     * @private
     */
    _buildNotificationBodyHtml(message, explicitTitle = null) {
        const { title, subtitle } = this._parseNotificationContent(message, explicitTitle);
        return title
            ? `<div class="notification-content"><div class="notification-title">${title}</div><div class="notification-subtitle">${subtitle}</div></div>`
            : `<span class="notification-message">${subtitle}</span>`;
    },

    /**
     * Masque et retire proprement un toast du DOM ainsi que le conteneur s'il devient vide.
     * @param {HTMLElement} notif
     * @private
     */
    _dismissNotification(notif) {
        if (!notif || notif.dataset.removing) return;
        notif.dataset.removing = 'true';
        if (notif._timeoutId) {
            clearTimeout(notif._timeoutId);
            notif._timeoutId = null;
        }
        NotificationCoalescer.unregister?.(notif);
        notif.classList.remove('show');

        setTimeout(() => {
            const container = notif.parentNode;
            notif.remove();
            if (container && container.id === 'notification-container' && container.children.length === 0) {
                container.remove();
            }
        }, 300);
    },

    /**
     * Crée et attache le bouton d'action d'un toast s'il est défini dans les options.
     * @param {HTMLElement} notif
     * @param {{ label?: string, onClick?: Function }|undefined} action
     * @param {Function} onDismiss
     * @private
     */
    _attachNotificationActionButton(notif, action, onDismiss) {
        notif.querySelector('.notification-action-btn')?.remove();
        if (!action?.label) return;

        const actionBtn = document.createElement('button');
        actionBtn.className = 'notification-action-btn';
        actionBtn.type = 'button';
        actionBtn.textContent = action.label;
        actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            try {
                action.onClick?.();
            } catch (err) {
                console.error('[Notification] Action error:', err);
            }
            onDismiss();
        });
        notif.appendChild(actionBtn);
    },

    /**
     * Affiche une notification toast temporaire.
     * @param {string} message - Le message à afficher
     * @param {NotificationType} [type='success'] - Type de notification (success, error, warning, info, prompt, loading)
     * @param {number} [duration=4000] - Durée d'affichage en ms
     * @param {Object} [coalescingOptions={}] - Options de regroupement, titre, icône ou bouton d'action
     */
    showNotification(message, type = 'success', duration = 4000, coalescingOptions = {}) {
        const container = this._getNotificationContainer();

        // Prevent exact duplicate notifications (debounce 1s for same message)
        const timestamp = Date.now();
        if (this._lastNotification &&
            this._lastNotification.message === message &&
            this._lastNotification.type === type &&
            (timestamp - this._lastNotification.timestamp < 1000)) {
            return;
        }
        this._lastNotification = { message, type, timestamp };

        // Intelligent coalescing: evaluate if we should show, group, or queue
        const evaluation = NotificationCoalescer.evaluate(message, type, coalescingOptions);

        if (evaluation.action === 'queue' || evaluation.action === 'skip') return;

        if (evaluation.action === 'coalesce' && evaluation.existingElement) {
            const el = evaluation.existingElement;
            if (el._timeoutId) {
                clearTimeout(el._timeoutId);
                el._timeoutId = null;
            }

            const removeExisting = () => this._dismissNotification(el);

            if (coalescingOptions.replaceExisting) {
                const targetNode = el.querySelector('.notification-content, .notification-message');
                if (targetNode) {
                    const temp = document.createElement('div');
                    temp.innerHTML = this._buildNotificationBodyHtml(message, coalescingOptions.title);
                    targetNode.replaceWith(temp.firstElementChild);
                }

                el.querySelector('.notification-coalesce-badge')?.remove();
                this._attachNotificationActionButton(el, coalescingOptions.action, removeExisting);
            } else {
                NotificationCoalescer.updateBadge(el, evaluation.count);
            }

            if (duration > 0 && duration !== Infinity && !el._isHovered) {
                el._timeoutId = setTimeout(removeExisting, duration);
            }
            return { dismiss: removeExisting, element: el };
        }

        // Standard flow: create new notification
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;

        // Accessibility (A11y) Roles
        if (type === 'error' || type === 'warning') {
            notif.setAttribute('role', 'alert');
            notif.setAttribute('aria-live', 'assertive');
        } else {
            notif.setAttribute('role', 'status');
            notif.setAttribute('aria-live', 'polite');
        }

        const iconHtml = coalescingOptions?.icon
            ? `<iconify-icon icon="${coalescingOptions.icon}" aria-hidden="true"></iconify-icon>`
            : (NOTIF_ICONS[type] || NOTIF_ICONS.info);

        const bodyHtml = this._buildNotificationBodyHtml(message, coalescingOptions?.title);
        notif.innerHTML = `${iconHtml} ${bodyHtml}`;

        const removeNotification = () => this._dismissNotification(notif);
        this._attachNotificationActionButton(notif, coalescingOptions?.action, removeNotification);

        // Interaction: Click to dismiss
        notif.style.cursor = 'pointer';
        notif.onclick = () => removeNotification();

        // Interaction: Pause on hover
        const startTimer = () => {
            notif._isHovered = false;
            if (duration > 0 && duration !== Infinity) {
                if (notif._timeoutId) clearTimeout(notif._timeoutId);
                notif._timeoutId = setTimeout(removeNotification, duration);
            }
        };

        const pauseTimer = () => {
            notif._isHovered = true;
            if (notif._timeoutId) {
                clearTimeout(notif._timeoutId);
                notif._timeoutId = null;
            }
        };

        notif.addEventListener('mouseenter', pauseTimer);
        notif.addEventListener('mouseleave', startTimer);

        container.appendChild(notif);

        // Register for coalescing tracking
        requestAnimationFrame(() => {
            notif.classList.add('show');
            startTimer();
            NotificationCoalescer.register(message, type, notif, coalescingOptions);
        });

        return { dismiss: removeNotification, element: notif };
    },

    /**
     * Affiche une notification avec bouton d'annulation et barre de progression.
     * L'action est déjà exécutée ; si l'utilisateur clique "Annuler", le callback onUndo est appelé.
     * @param {string} message - Message affiché dans le toast
     * @param {Function} onUndo - Callback appelé si l'utilisateur annule
     * @param {Object} [options] - Options
     * @param {number} [options.duration=7000] - Durée avant disparition (ms)
     * @param {string} [options.type='warning'] - Type de notification
     * @param {string|null} [options.title=null] - Titre optionnel au-dessus du message
     * @returns {{ cancel: Function, dismiss: Function, element: HTMLElement }}
     */
    showUndoNotification(message, onUndo, options = {}) {
        const { duration = 7000, type = 'warning', title = null } = options;
        const container = this._getNotificationContainer();

        // Ensure only one undo notification exists at a time (clear any pending timer)
        container.querySelectorAll('.notification-undo').forEach(el => {
            if (el._timeoutId) clearTimeout(el._timeoutId);
            el.remove();
        });

        const notif = document.createElement('div');
        notif.className = `notification ${type} notification-undo`;
        notif.title = 'Cliquer pour masquer';
        notif.style.cursor = 'pointer';

        // Accessibility (A11y) Roles
        notif.setAttribute('role', 'alert');
        notif.setAttribute('aria-live', 'assertive');

        const bodyHtml = this._buildNotificationBodyHtml(message, title);

        notif.innerHTML = `
            ${NOTIF_ICONS[type] || NOTIF_ICONS.warning}
            ${bodyHtml}
            <button class="notification-undo-btn" type="button" title="Annuler cette action">
                <iconify-icon icon="solar:undo-left-round-linear" aria-hidden="true"></iconify-icon>
                <span>Annuler</span>
            </button>
            <div class="notification-undo-progress">
                <div class="notification-undo-progress-fill"></div>
            </div>
        `;

        container.appendChild(notif);

        const progressFill = notif.querySelector('.notification-undo-progress-fill');
        let undone = false;
        let startTime;
        let remaining = duration;

        const removeNotification = () => this._dismissNotification(notif);

        const startCountdown = () => {
            if (undone || notif.dataset.removing) return;
            void progressFill.offsetWidth;
            startTime = Date.now();
            progressFill.style.transition = `width ${remaining}ms linear`;
            progressFill.style.width = '0%';
            if (notif._timeoutId) clearTimeout(notif._timeoutId);
            notif._timeoutId = setTimeout(() => {
                if (!undone) removeNotification();
            }, remaining);
        };

        const pauseCountdown = () => {
            if (notif._timeoutId) {
                clearTimeout(notif._timeoutId);
                notif._timeoutId = null;
            }
            if (!startTime) return;
            const elapsed = Date.now() - startTime;
            remaining = Math.max(0, remaining - elapsed);
            const pct = (remaining / duration) * 100;
            progressFill.style.transition = 'none';
            progressFill.style.width = `${pct}%`;
        };

        const handleUndo = () => {
            if (undone) return;
            undone = true;
            if (notif._timeoutId) {
                clearTimeout(notif._timeoutId);
                notif._timeoutId = null;
            }
            removeNotification();
            onUndo();
        };

        // Events
        notif.querySelector('.notification-undo-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleUndo();
        });
        notif.addEventListener('click', (e) => {
            if (e.target.closest('.notification-undo-btn')) return;
            removeNotification();
        });
        notif.addEventListener('mouseenter', pauseCountdown);
        notif.addEventListener('mouseleave', startCountdown);

        // Launch
        requestAnimationFrame(() => {
            progressFill.style.width = '100%';
            notif.classList.add('show');
            requestAnimationFrame(() => startCountdown());
        });

        return { cancel: handleUndo, dismiss: removeNotification, element: notif };
    },
    /**
     * Affiche une modale de confirmation personnalisée.
     * Délégué à ModalUIManager.
     * @param {string} message - Le message de confirmation
     * @param {Function} [onConfirm] - Callback appelé si l'utilisateur confirme
     * @param {Function} [onCancel] - Callback appelé si l'utilisateur annule
     * @param {ConfirmOptions} [options={}] - Options de personnalisation
     * @returns {Promise<boolean>}
     */
    showCustomConfirm(message, onConfirm, onCancel, options = {}) {
        return ModalUI.showCustomConfirm(message, onConfirm, onCancel, options);
    },

    showConflictResolutionModal(options = {}) {
        return ModalUI.showConflictResolutionModal(options);
    },

    showRestoreConfirmationModal(options = {}) {
        return ModalUI.showRestoreConfirmationModal(options);
    },

    showSaveConfirmationModal(options = {}) {
        return ModalUI.showSaveConfirmationModal(options);
    },

    // ====================================================================
    //  THÈME ET DARK MODE
    // ====================================================================

    // ====================================================================
    //  THÈME ET DARK MODE
    // ====================================================================

    applyTheme() {
        ThemeManager.applyTheme();
    },
    toggleDarkMode() {
        // Legacy support: toggle between light and dark (ignoring system for simple toggle)
        const newTheme = appState.theme === 'dark' ? 'light' : 'dark';
        ThemeManager.setTheme(newTheme);
    },
    updateDarkModeButtonIcon() {
        ThemeManager.updateUI();
    },

    // ====================================================================
    //  SYSTÈME DE PÉRIODES
    //  Gestion des trimestres/semestres et formulaire dynamique
    // ====================================================================

    setPeriod(period) {
        const periods = Utils.getPeriods();
        const validPeriod = periods.includes(period) ? period : periods[0];

        // Skip if already on this period and the DOM radio is already in sync
        const existingRadios = DOM.mainPeriodSelector?.querySelectorAll?.('input[name="periodModeRadio"]');
        const isDomSynced = !existingRadios || existingRadios.length === 0 || Array.from(existingRadios).some(r => r.checked && r.value === validPeriod);
        if (appState.currentPeriod === validPeriod && isDomSynced) return;

        // Save context for the OLD period BEFORE changing appState.currentPeriod
        if (FocusPanelManager?.isOpen() && FocusPanelManager.currentStudentId) {
            FocusPanelManager.saveCurrentContext();
        }

        // Update active period in state
        appState.currentPeriod = validPeriod;

        // Synchronize radio button selection
        document.querySelectorAll('#mainPeriodSelector input[name="periodModeRadio"]').forEach(r => {
            r.checked = (r.value === validPeriod);
        });

        // Trigger progressive label expansion & synchronized glider transition
        this.updatePeriodLabels();
        if (DOM.mainPeriodSelector) {
            this.updateGlider(DOM.mainPeriodSelector);
        }

        // Refresh list results and stats in-place (ZERO black flash, solid background preserved)
        AppreciationsManager?.renderResults();

        // Refresh Focus Panel if open to reflect new period
        if (FocusPanelManager?.isOpen()) {
            FocusPanelManager.refreshPeriod();
        }

        StorageManager?.saveAppState();

        document.dispatchEvent(new CustomEvent('periodChanged', {
            detail: { period: appState.currentPeriod }
        }));
    },
    getPeriods() {
        return Utils.getPeriods();
    },
    getPeriodLabel(period, short = false) {
        return Utils.getPeriodLabel(period, short);
    },
    /**
     * Met à jour le texte des labels de période (court pour inactif, complet pour sélectionné)
     */
    _compactPeriodMediaQuery: '(max-width: 900px)',
    _isCompactMobilePeriod() {
        return typeof window !== 'undefined' && Boolean(window.matchMedia?.(this._compactPeriodMediaQuery)?.matches);
    },
    updatePeriodLabels() {
        const isCompactMobile = this._isCompactMobilePeriod();
        if (!DOM.mainPeriodSelector) return;
        DOM.mainPeriodSelector.querySelectorAll('label').forEach(label => {
            const input = document.getElementById(label.getAttribute('for'));
            if (input && label.dataset.short && label.dataset.full) {
                const isActive = input.checked;
                const targetText = (isActive && !isCompactMobile) ? label.dataset.full : label.dataset.short;
                const textSpan = label.querySelector('.period-label-text');
                if (textSpan) {
                    textSpan.textContent = targetText;
                    textSpan.classList.toggle('is-expanded', isActive);
                    textSpan.classList.toggle('is-collapsed', !isActive);
                } else {
                    label.innerHTML = `<span class="period-label-text ${isActive ? 'is-expanded' : 'is-collapsed'}">${targetText}</span>`;
                }

                // Update tooltip based on active state
                if (isActive) {
                    // Active period: no tooltip
                    label.classList.remove('tooltip');
                    label.removeAttribute('data-tooltip');
                    // Destroy Tippy instance if exists
                    if (label._tippy) {
                        label._tippy.destroy();
                    }
                } else {
                    // Inactive period: show tooltip
                    const tooltip = `Passer au ${label.dataset.full}`;
                    label.classList.add('tooltip');
                    label.setAttribute('data-tooltip', tooltip);
                    // Update or create Tippy instance
                    if (label._tippy) {
                        label._tippy.setContent(tooltip);
                    } else {
                        // Will be init by initTooltips or TooltipsUI
                        TooltipsUI.updateTooltip(label, tooltip);
                    }
                }
            }
        });

        // Keep glider size and position perfectly aligned with current label widths
        this.updateGlider(DOM.mainPeriodSelector);
    },
    updatePeriodSystemUI() {
        const periods = Utils.getPeriods();
        if (!periods.includes(appState.currentPeriod)) {
            appState.currentPeriod = periods[0];
        }

        // Early return if mainPeriodSelector doesn't exist
        if (!DOM.mainPeriodSelector) return;

        // Vérifier si le sélecteur est déjà peuplé pour éviter de détruire le DOM (et le glider)
        const existingInputs = DOM.mainPeriodSelector.querySelectorAll('input[name="periodModeRadio"]');

        if (existingInputs.length > 0 && existingInputs.length === periods.length && existingInputs[0]?.value === periods[0]) {
            // Mise à jour douce : on change juste l'état checked
            existingInputs.forEach(input => {
                input.checked = (input.value === appState.currentPeriod);
            });
            // Mettre à jour l'affichage des labels
            this.updatePeriodLabels();
        } else {
            // Premier rendu ou changement de structure : on construit le HTML
            // Note: getPeriodLabel(p, false) = court (T1), getPeriodLabel(p, true) = long (Trimestre 1)
            const isCompactMobile = this._isCompactMobilePeriod();
            DOM.mainPeriodSelector.innerHTML = periods.map(p => {
                const isActive = appState.currentPeriod === p;
                const tooltip = isActive ? '' : `Passer au ${Utils.getPeriodLabel(p, true)}`;
                return `
                <input type="radio" id="period${p}" name="periodModeRadio" value="${p}" ${isActive ? 'checked' : ''}>
                <label for="period${p}" class="ui-segment ${tooltip ? 'tooltip' : ''}" ${tooltip ? `data-tooltip="${tooltip}"` : ''} data-short="${Utils.getPeriodLabel(p, false)}" data-full="${Utils.getPeriodLabel(p, true)}">
                    <span class="period-label-text ${isActive ? 'is-expanded' : 'is-collapsed'}">
                        ${(isActive && !isCompactMobile) ? Utils.getPeriodLabel(p, true) : Utils.getPeriodLabel(p, false)}
                    </span>
                </label>
            `}).join('');

            DOM.mainPeriodSelector.querySelectorAll('input').forEach(r => r.addEventListener('change', e => this.setPeriod(e.target.value)));

            // On initialise le glider car c'est un nouveau DOM
            this.initGliders();
        }
    },

    updateGenerateButtonState() {
        const model = appState.currentAIModel || '';
        const isOllama = model.startsWith('ollama');
        const isOfflineCloud = !navigator.onLine && !isOllama;
        const hasKey = this.checkAPIKeyPresence(true);
        const isAIAvailable = hasKey && !isOfflineCloud;
        const buttons = [DOM.importGenerateBtn];

        // Déterminer le message approprié selon le provider et l'état réseau
        const warningTooltip = isOfflineCloud
            ? "Connexion Internet requise pour générer avec l'IA."
            : isOllama
                ? "Activez Ollama dans les paramètres pour générer."
                : "Veuillez configurer une clé API dans les paramètres pour générer.";

        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = !isAIAvailable;
                if (!isAIAvailable) {
                    if (!btn.hasAttribute('data-original-tooltip')) {
                        btn.setAttribute('data-original-tooltip', btn.getAttribute('data-tooltip') || '');
                    }
                    btn.setAttribute('data-tooltip', warningTooltip);
                } else {
                    if (btn.hasAttribute('data-original-tooltip')) {
                        btn.setAttribute('data-tooltip', btn.getAttribute('data-original-tooltip'));
                        btn.removeAttribute('data-original-tooltip');
                    }
                }
                btn.classList.toggle('ai-disabled', !isAIAvailable);
            }
        });

        const warningHtml = isOllama
            ? `⚠️ Ollama non activé. <a href="#" class="link-to-settings" data-target-tab="advanced" data-target-element="ollamaToggle">Activez-le dans les paramètres</a> pour générer.`
            : `⚠️ Clé API manquante. <a href="#" class="link-to-settings" data-target-tab="advanced" data-target-element="googleApiKey">Configurez-la dans les paramètres</a> pour activer la génération.`;

        if (!hasKey) {
            if (DOM.massImportApiKeyWarning) {
                DOM.massImportApiKeyWarning.innerHTML = warningHtml;
                DOM.massImportApiKeyWarning.style.display = 'flex';
            }
        } else {
            if (DOM.massImportApiKeyWarning) {
                DOM.massImportApiKeyWarning.style.display = 'none';
            }
        }
    },
    updateHeaderPremiumLook() {
        const header = document.querySelector('.header');
        if (header) {
            const isPremium = this.checkAPIKeyPresence(true);
            header.classList.toggle('ai-active', isPremium);
        }
    },
    updateAIButtonsState() {
        const isAIAvailable = this.checkAPIKeyPresence(true);
        document.querySelectorAll('.appreciation-result').forEach(card => {
            [{ el: card.querySelector('[data-action="details"]'), title: "Analyser" }, { el: card.querySelector('[data-action="variations"], [data-action="undo-variation"]'), title: "Variation / Annuler" }].forEach(btn => {
                if (btn.el) {
                    btn.el.disabled = !isAIAvailable;
                    btn.el.classList.toggle('ai-disabled', !isAIAvailable);
                    if (isAIAvailable) {
                        // Pour "Analyser" (le nom de l'élève), l'étiquette visuelle au survol suffit, pas besoin de tooltip
                        if (btn.title === "Analyser") {
                            btn.el.removeAttribute('data-tooltip');
                        } else {
                            btn.el.setAttribute('data-tooltip', btn.title);
                        }
                    } else {
                        btn.el.setAttribute('data-tooltip', "Clé API requise.");
                    }
                }
            });
        });
    },

    // ====================================================================
    //  LOADING, SPINNERS ET OVERLAYS
    // ====================================================================

    /**
     * Applique un état visuel unifié (idle / done / dirty / loading) à un bouton Générer / Régénérer / Actualiser.
     * @param {HTMLElement|null} btn - Élément bouton cible
     * @param {'idle'|'done'|'dirty'|'loading'} [state='idle'] - État sémantique
     * @param {Object} [options={}] - Options complémentaires ({ label, suffixHtml, disabled })
     * @returns {string} Le libellé appliqué
     */
    setGenerateButtonState(btn, state = 'idle', options = {}) {
        const config = GENERATE_BUTTON_STATES[state] || GENERATE_BUTTON_STATES.idle;
        const label = options.label || config.label;
        if (!btn) return label;

        const suffixHtml = options.suffixHtml ? ` ${options.suffixHtml}` : '';
        const isDisabled = options.disabled ?? config.disabled;
        const spinClass = config.spin ? ' icon-spin rotate-icon' : '';

        btn.classList?.remove('btn-ai', 'btn-ai-outline', 'btn-regenerate-warning', 'btn-neutral', 'btn-warning');
        btn.classList?.add(config.variant);
        btn.disabled = isDisabled;
        if (isDisabled) {
            btn.classList?.add('disabled');
        } else {
            btn.classList?.remove('disabled');
        }
        btn.innerHTML = `<iconify-icon class="iconify-inline${spinClass}" icon="${config.icon}"></iconify-icon> ${label}${suffixHtml}`;
        return label;
    },

    showInlineSpinner(el, label = '', options = {}) {
        if (!el) return;
        if (!el.dataset.originalContent) {
            el.dataset.originalContent = el.innerHTML;
        }
        const orig = el.dataset.originalContent;
        const textContent = label || (orig.includes('Générer') || orig.includes('Régénérer') || orig.includes('Actualiser') ? 'Génération...' : '');
        const isCancellable = options.canCancel ?? (el.id === 'focusGenerateBtn');

        if (isCancellable) {
            el.innerHTML = `<span class="btn-spinner-state"><iconify-icon icon="ph:spinner-gap-bold" class="loading-spinner-svg rotate-icon" aria-hidden="true"></iconify-icon><span>${textContent}</span></span><span class="btn-cancel-state"><iconify-icon icon="ph:x-bold" class="cancel-svg" aria-hidden="true"></iconify-icon><span>Annuler</span></span>`;
            el.disabled = false;
            el.setAttribute('aria-busy', 'true');
            el.classList.add('is-loading', 'is-cancellable');

            const cancelTip = options.cancelTooltip || 'Cliquer pour annuler la génération';
            el.dataset.prevTooltip = el.getAttribute('data-tooltip') || '';
            el.setAttribute('data-tooltip', cancelTip);
            if (el._tippy) el._tippy.setContent(cancelTip);
        } else {
            const labelHtml = textContent ? `<span>${textContent}</span>` : '';
            el.innerHTML = `<iconify-icon icon="ph:spinner-gap-bold" class="loading-spinner-svg rotate-icon" aria-hidden="true"></iconify-icon>${labelHtml}`;
            el.disabled = true;
            el.classList.add('is-loading');
        }
    },
    hideInlineSpinner(el) {
        if (!el) return;
        if (el.dataset.originalContent) {
            el.innerHTML = el.dataset.originalContent;
            delete el.dataset.originalContent;
        }
        el.disabled = false;
        el.removeAttribute('aria-busy');
        el.classList.remove('is-loading', 'is-cancellable');
        if (el.dataset.prevTooltip !== undefined) {
            const prev = el.dataset.prevTooltip;
            delete el.dataset.prevTooltip;
            if (prev) {
                el.setAttribute('data-tooltip', prev);
                if (el._tippy) el._tippy.setContent(prev);
            } else {
                el.removeAttribute('data-tooltip');
            }
        }
    },

    // ====================================================================
    //  DÉLÉGATIONS AUX SOUS-MANAGERS
    //  Façade vers ModalUI, FormUI, StatsUI, ImportUI, ResultCardsUI
    // ====================================================================

    // Modal functions delegated to ModalUIManager
    openModal(modalOrId, options = {}) { ModalUI.openModal(modalOrId, options); },
    closeModal(modalOrId, options = {}) { ModalUI.closeModal(modalOrId, options); },
    closeAllModals() { ModalUI.closeAllModals(); },
    openHelpTab(tabId, sectionId) { ModalUI.openHelpTab(tabId, sectionId); },
    isAnyModalOpen() { return ModalUI.isAnyModalOpen(); },

    // Settings form functions delegated to FormUIManager
    updateSettingsPromptFields() {
        FormUI.updateSettingsFields();
        if (App && App.populatePreviewStudentSelect) App.populatePreviewStudentSelect();
    },
    updateSettingsFields() { FormUI.updateSettingsFields(); },
    updateModelDescription() { FormUI.updateModelDescription(); },

    // Stats functions delegated to StatsUIManager
    animateValue(element, start, end, duration) {
        return StatsUI.animateValue(element, start, end, duration);
    },
    animateNumberWithText(element, start, end, duration, templateFn) {
        return StatsUI.animateNumberWithText(element, start, end, duration, templateFn);
    },
    async updateStats() {
        return StatsUI.updateStats(this);
    },
    updateStatsTooltips() {
        StatsUI.updateStatsTooltips();
    },

    // ====================================================================
    //  GENERATION STATUS CHIP (Header) - Progress + Errors unified
    // ====================================================================

    /**
     * Shows the generation status on the dashboard
     * @param {number} current - Current count
     * @param {number} total - Total count
     * @param {string} [studentName] - Current student name
     */
    showHeaderProgress(current, total, studentName = '') {
        const dashboard = DOM.headerGenDashboard;
        if (!dashboard) return;

        // Griser et animer les boutons d'action en-tête
        const updateBtn = document.getElementById('updateBtnInline');
        const generateBtn = document.getElementById('generateBtnInline');
        if (updateBtn) {
            const isUpdating = appState.activeMassAction === 'update';
            updateBtn.classList.toggle('loading', isUpdating);
            updateBtn.classList.toggle('disabled', !isUpdating);
            updateBtn.disabled = false;
            if (isUpdating) this.updateTooltip(updateBtn, "Cliquer pour annuler l'actualisation");
        }
        if (generateBtn) {
            const isGeneratingBatch = appState.activeMassAction === 'generate';
            generateBtn.classList.toggle('loading', isGeneratingBatch);
            generateBtn.classList.toggle('disabled', !isGeneratingBatch);
            generateBtn.disabled = false;
            if (isGeneratingBatch) this.updateTooltip(generateBtn, 'Cliquer pour annuler la génération');
        }

        // Clear any pending progress hide timeouts
        if (this._hideProgressTimeout) {
            clearTimeout(this._hideProgressTimeout);
            this._hideProgressTimeout = null;
            dashboard.classList.remove('all-complete');
        }

        // Show generating state
        dashboard.classList.add('generating');

        // Update progress bar
        const percent = total > 0 ? (current / total) * 100 : 0;
        if (DOM.dashProgressFill) {
            DOM.dashProgressFill.style.width = `${percent}%`;

            // Indeterminate state for single generation (active but 0%)
            // This allows the "shine" animation to be visible even at 0% width if managed by CSS
            // or forces a visual width for the effect
            if (total === 1 && current === 0) {
                DOM.dashProgressFill.classList.add('indeterminate');
                // Force a visible width for the shine effect
                DOM.dashProgressFill.style.width = '100%';
            } else {
                DOM.dashProgressFill.classList.remove('indeterminate');
            }
        }

        // Update text
        if (DOM.dashProgressText) {
            DOM.dashProgressText.textContent = `${current}/${total}`;
        }
    },

    /**
     * Hides the generating state and refreshes dashboard counts
     * @param {boolean} [hasErrors=false] - Whether there were errors during generation
     */
    hideHeaderProgress(hasErrors = false) {
        const dashboard = DOM.headerGenDashboard;
        if (!dashboard) return;

        // Clear any existing timeouts to prevent overlapping runs
        if (this._hideProgressTimeout) {
            clearTimeout(this._hideProgressTimeout);
            this._hideProgressTimeout = null;
        }

        const cleanup = () => {
            dashboard.classList.remove('generating');
            if (DOM.dashProgressFill) {
                DOM.dashProgressFill.style.width = '0%';
            }
            this.updateDashboardCounts();
            dashboard.classList.remove('all-complete');
            this._hideProgressTimeout = null;

            // Retirer l'état loading et réactiver
            const updateBtn = document.getElementById('updateBtnInline');
            const generateBtn = document.getElementById('generateBtnInline');
            if (updateBtn) {
                updateBtn.classList.remove('loading', 'disabled');
                updateBtn.disabled = false;
            }
            if (generateBtn) {
                generateBtn.classList.remove('loading', 'disabled');
                generateBtn.disabled = false;
            }
        };

        if (!hasErrors) {
            // Force progress text and progress fill to 100% completed state (e.g. 1/1, 8/8) so the user sees the transition
            if (DOM.dashProgressText) {
                const text = DOM.dashProgressText.textContent || '';
                if (text.includes('/')) {
                    const parts = text.split('/');
                    const total = parts[1];
                    DOM.dashProgressText.textContent = `${total}/${total}`;
                }
            }
            if (DOM.dashProgressFill) {
                DOM.dashProgressFill.classList.remove('indeterminate');
                DOM.dashProgressFill.style.width = '100%';
            }

            // Keep the dynamic pill visible at 100% (e.g. 1/1) for 1 second to let the user see the transition
            dashboard.classList.add('all-complete');
            this._hideProgressTimeout = setTimeout(() => {
                cleanup();
            }, 1000); // 1 second visibility delay
        } else {
            cleanup();
        }
    },

    /**
     * Updates the dashboard with current class statistics
     * Called after any generation, import, or data change
     */
    updateDashboardCounts() {
        const results = appState.filteredResults || appState.generatedResults || [];
        const currentPeriod = appState.currentPeriod;

        let validated = 0;
        let pending = 0;
        for (const result of results) {
            // Skip errors — they are handled by the Smart Action Button in the table
            if (result.errorMessage && result.errorPeriod === currentPeriod) continue;
            if (Utils.isStudentDepartedBeforePeriod(result, currentPeriod)) continue;

            if (Utils.isPendingForPeriod(result, currentPeriod)) {
                pending++;
            } else if (!Utils.isPlaceholderAppreciation(Utils.getPeriodAppreciation(result, currentPeriod))) {
                validated++;
            }
        }

        // Update validated count
        if (DOM.dashValidatedCount) {
            DOM.dashValidatedCount.textContent = validated;
        }

        // Pending badge hidden in ultra-minimalist mode (count shown in Generate button)

        // Determine provider config & availability for active model
        const model = appState.currentAIModel || '';
        const providerId = getProviderForModel(model);
        const providerConfig = PROVIDER_CONFIG[providerId] || PROVIDER_CONFIG.openrouter;

        // Check availability
        const isKeyConfigured = hasValidApiKey(providerId, { state: appState });

        const chevronEl = DOM.dashModelLabel?.querySelector('.dash-model-chevron');

        if (!isKeyConfigured) {
            // Unconfigured state
            if (DOM.dashModelName) {
                DOM.dashModelName.textContent = "Configurer l'IA";
            }
            if (DOM.headerGenDashboard) {
                DOM.headerGenDashboard.classList.add('unconfigured');
                const tooltip = `<strong>Aucune clé active</strong><br><span>Cliquez pour activer Albert (Gouv.fr) ou Gemini (100% gratuit)</span>`;
                if (TooltipsUI && TooltipsUI.updateTooltip) {
                    TooltipsUI.updateTooltip(DOM.headerGenDashboard, tooltip);
                } else {
                    DOM.headerGenDashboard.setAttribute('data-tooltip', tooltip);
                }
            }
            if (chevronEl) chevronEl.style.display = 'none';

            const iconEl = DOM.dashModelLabel?.querySelector('.dash-model-icon') || DOM.dashModelLabel?.querySelector('iconify-icon:not(.dash-model-chevron)');
            if (iconEl) {
                iconEl.removeAttribute('style');
                const classesToRemove = Array.from(iconEl.classList).filter(c => c.startsWith('provider-'));
                classesToRemove.forEach(c => iconEl.classList.remove(c));
                iconEl.setAttribute('icon', 'solar:key-linear');
            }
        } else {
            // Configured state
            if (DOM.headerGenDashboard) {
                DOM.headerGenDashboard.classList.remove('unconfigured');
            }
            if (chevronEl) chevronEl.style.display = '';

            const modelName = MODEL_SHORT_NAMES?.[appState.currentAIModel] || appState.currentAIModel || 'IA';
            const shortModelName = providerId === 'albert' ? 'Albert' : modelName.split(' ')[0];

            if (DOM.dashModelName) {
                DOM.dashModelName.textContent = shortModelName;
            }

            if (DOM.dashModelLabel && providerConfig) {
                const iconEl = DOM.dashModelLabel.querySelector('.dash-model-icon') || DOM.dashModelLabel.querySelector('iconify-icon:not(.dash-model-chevron)');
                if (iconEl) {
                    iconEl.removeAttribute('style');
                    const classesToRemove = Array.from(iconEl.classList).filter(c => c.startsWith('provider-'));
                    classesToRemove.forEach(c => iconEl.classList.remove(c));

                    iconEl.setAttribute('icon', providerConfig.icon);
                    if (providerConfig.style) {
                        iconEl.setAttribute('style', providerConfig.style);
                    }
                    if (providerConfig.class) {
                        iconEl.classList.add(providerConfig.class);
                    }
                }
            }

            if (DOM.headerGenDashboard) {
                const tooltip = modelName;
                if (TooltipsUI && TooltipsUI.updateTooltip) {
                    TooltipsUI.updateTooltip(DOM.headerGenDashboard, tooltip);
                } else {
                    DOM.headerGenDashboard.setAttribute('data-tooltip', tooltip);
                }
            }
        }

        // Add all-complete state if everything is done
        if (DOM.headerGenDashboard) {
            const allDone = validated > 0 && pending === 0;
            DOM.headerGenDashboard.classList.toggle('all-complete', allDone);
        }
    },

    /**
     * Resets the dashboard state
     */
    resetHeaderProgress() {
        const dashboard = DOM.headerGenDashboard;
        if (!dashboard) return;

        // Clear any pending timeouts
        if (this._hideProgressTimeout) {
            clearTimeout(this._hideProgressTimeout);
            this._hideProgressTimeout = null;
        }

        dashboard.classList.remove('generating', 'all-complete');

        if (DOM.dashProgressFill) {
            DOM.dashProgressFill.style.width = '0%';
        }
        if (DOM.dashProgressText) {
            DOM.dashProgressText.textContent = '0/0';
        }

        this.updateDashboardCounts();
    },

    showSettingsTab(tabName) {
        const modal = DOM.settingsModal || document.getElementById('appSettingsModal');
        if (modal) {
            const targetBtn = modal.querySelector(`.ui-tabs-btn[onclick*="'${tabName}'"]`) ||
                              modal.querySelector(`.ui-tabs-btn[onclick*='"${tabName}"']`);
            if (targetBtn && typeof window.switchHelpTab === 'function') {
                window.switchHelpTab(targetBtn, tabName);
                return;
            }
        }
        FormUI.showSettingsTab(tabName);
    },

    // ====================================================================
    //  VALIDATION API ET ÉTAT DE L'APPLICATION
    // ====================================================================

    checkAPIKeyPresence(silent = false) {
        const model = appState.currentAIModel || '';
        const provider = getProviderForModel(model);
        const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.openrouter;
        const name = provider === 'groq' ? config.name : (config.shortLabel || config.name);
        const key = provider === 'ollama'
            ? (appState.ollamaEnabled ? 'local' : '')
            : (config.keyProperty ? appState[config.keyProperty] : '');

        const errEl = provider !== 'ollama' ? document.getElementById(`${provider}ApiKeyError`) : null;

        if (name && !key) {
            if (!silent) {
                if (provider === 'ollama') {
                    this.showNotification(`Ollama n'est pas activé. Activez-le dans les paramètres.`, 'warning');
                } else {
                    this.showNotification(`Clé API ${name} manquante.`, 'warning');
                }
                const engineTab = document.getElementById('settings-engine');
                if (errEl && DOM.settingsModal?.style?.display === 'flex' && engineTab?.classList?.contains('active')) {
                    errEl.textContent = `⚠️ Clé ${name} requise.`;
                    errEl.style.display = 'block';
                }
            }
            return false;
        }
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
        return true;
    },
    updateHelpImportFormat(period) {
        const struct = document.getElementById('helpFormatStructure'), ex = document.getElementById('helpFormatExample');
        if (!struct || !ex) return;

        // Fallback si la période n'est pas définie
        const periods = Utils.getPeriods();
        const effectivePeriod = period || appState.currentPeriod || periods[periods.length - 1];
        const periodIndex = periods.indexOf(effectivePeriod);
        const prev = periodIndex > 0 ? periods.slice(0, periodIndex) : [];

        let sParts = ["NOM Prénom", "Statut"], eParts = ["DUPONT Chloé", ""];
        prev.forEach((p, i) => { sParts.push(`Moy ${p}`, `App ${p}`); eParts.push(`${14.5 + i}`, `Bonne période.`); });
        sParts.push(`Moy ${effectivePeriod}`, 'Instructions'); eParts.push(`${15.0 + prev.length}`, 'Sérieux.');
        struct.textContent = sParts.join(' | '); ex.textContent = eParts.join(' | ');

        const sel = document.getElementById('helpFormatSelector');
        if (sel) {
            sel.querySelectorAll('button').forEach(b => b.classList.remove('active'));
            sel.querySelector(`button[data-format="${effectivePeriod}"]`)?.classList.add('active');
        }
    },
    updateWordCount(id, text) {
        const el = document.getElementById(id);
        if (el) {
            const wordCount = Utils.countWords(text);
            const charCount = Utils.countCharacters(text);
            el.textContent = `${wordCount} mot${wordCount > 1 ? 's' : ''} • ${charCount} car.`;
        }
    },

    // ====================================================================
    //  SETTINGS FOCUS UTILITY
    //  Centralized highlight effect for shortcuts to settings
    // ====================================================================

    /**
     * Highlights an element in the settings modal with a focus animation.
     * Used by avgWordsChip, word count badge, and other shortcuts.
     * @param {HTMLElement|string} elementOrId - Element or ID to highlight
     * @param {Object} [options={}] - Options
     * @param {boolean} [options.scrollIntoView=true] - Whether to scroll to the element
     * @param {number} [options.duration=2400] - Duration of the highlight in ms (3 iterations × 800ms)
     * @param {string} [options.tab] - Tab to switch to before highlighting (e.g., 'templates', 'advanced')
     * @param {string|null} [options.parentSelector='.form-group'] - Highlight the closest matching ancestor (null: the element itself)
     */
    highlightSettingsElement(elementOrId, options = {}) {
        const {
            scrollIntoView = true,
            duration = 2400,  // 3 iterations × 800ms animation
            tab = null,
            parentSelector = '.form-group'
        } = options;

        // Switch tab if specified
        if (tab) {
            this.showSettingsTab(tab);
        }

        // Delay to allow modal/tab animations to complete
        setTimeout(() => {
            const element = typeof elementOrId === 'string'
                ? document.getElementById(elementOrId)
                : elementOrId;

            if (!element) return;

            // Determine target element (closest matching ancestor or element itself)
            const target = (parentSelector && element.closest(parentSelector)) || element;

            // Scroll into view
            if (scrollIntoView) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Focus the element for accessibility
            if (element.focus) element.focus();

            // Apply highlight animation class
            target.classList.remove('settings-focus-highlight');
            void target.offsetWidth; // Force reflow for restart
            target.classList.add('settings-focus-highlight');

            // Remove class after animation completes
            setTimeout(() => {
                target.classList.remove('settings-focus-highlight');
            }, duration);
        }, 150);  // Small delay for tab/modal animation
    },

    // ====================================================================
    //  GESTION DES BOUTONS DE CONTRÔLE
    //  Régénération, copie, erreurs, filtres
    // ====================================================================


    initGliders() { GliderManager.init(); },
    updateGlider(container, immediate = false) { GliderManager.update(container, immediate); },

    updateControlButtons() {
        const visible = appState.filteredResults;
        const regenerateBtn = document.getElementById('regenerateAllBtn');
        if (regenerateBtn) regenerateBtn.disabled = visible.length === 0;

        // Update generation dashboard with current counts
        this.updateDashboardCounts();
    },

    getGradeClass(grade) { return Utils.getGradeClass(grade); },
    updateActiveFilterInfo() {
        // Remove any existing close buttons from previous filters
        document.querySelectorAll('.filter-close-btn').forEach(btn => btn.remove());

        if (!appState.activeStatFilter) {
            if (HistoryManager.isOpen('statFilter')) {
                HistoryManager.handleManualClose('statFilter');
            }
            return;
        }

        if (!HistoryManager.isOpen('statFilter')) {
            HistoryManager.pushState('statFilter', (opts) => EventHandlersManager.handleStatFilterClick(null, opts));
        }

        // Restore visual active filter class on corresponding DOM element if not present
        const targetEl = document.querySelector(`[data-stat-id="${appState.activeStatFilter}"], [data-filter-id="${appState.activeStatFilter}"]`);
        if (targetEl && !targetEl.classList.contains('active-filter')) {
            document.querySelectorAll('.stat-card.active-filter, .legend-item.active-filter, .detail-item.active-filter, .hist-bar-group.active-filter').forEach(c => c.classList.remove('active-filter'));
            targetEl.classList.add('active-filter');
        }

        // Add close button on the active element
        const activeElement = document.querySelector('.stat-card.active-filter, .legend-item.active-filter, .detail-item.active-filter, .hist-bar-group.active-filter');
        if (activeElement) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'filter-close-btn';
            closeBtn.innerHTML = '<iconify-icon icon="ph:x"></iconify-icon>';
            closeBtn.setAttribute('aria-label', 'Retirer le filtre');
            activeElement.style.position = 'relative';
            activeElement.appendChild(closeBtn);

            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                EventHandlersManager.handleStatFilterClick(null);
            });
        }
    },

    // ====================================================================
    //  ANIMATIONS DE TEXTE (LEGACY)
    //  Effet de frappe caractère par caractère
    // ====================================================================

    // Animation functions delegated to AnimationManager
    animateTextTyping(element, newHtml) { return AnimationManager.animateTextTyping(element, newHtml); },
    getAppreciationSkeletonHTML(compact, label, pending) { return AnimationManager.getSkeletonHTML(compact, label, pending); },
    showSkeletonInCard(card, badgeText, isPending) { AnimationManager.showSkeletonInCard(card, badgeText, isPending); },
    activateCardBadge(card) { AnimationManager.activateCardBadge(card); },
    fadeOutSkeleton(container) { return AnimationManager.fadeOutSkeleton(container); },
    typewriterReveal(container, text, options) { return AnimationManager.typewriterReveal(container, text, options); },
    animateHtmlReveal(container, htmlContent, options) { return AnimationManager.animateHtmlReveal(container, htmlContent, options); },

    // ====================================================================
    //  TOOLTIPS ET ACCORDÉONS
    //  Initialisation Tippy.js et animations d'accordéon
    // ====================================================================

    // _tippyInstances removed as it caused duplicates with TooltipsManager
    initTooltips(container = null) {
        // Delegate to the specialized manager to avoid duplicates
        TooltipsUI.initTooltips(container);
    },

    /**
     * Ajoute ou met à jour un tooltip sur un élément
     * @param {HTMLElement} element - L'élément cible
     * @param {string} content - Le texte du tooltip
     */
    updateTooltip(element, content) {
        // Delegate to the specialized manager to avoid duplicates
        TooltipsUI.updateTooltip(element, content);
    },

    /**
     * Anime l'ouverture ou la fermeture d'un élément <details> avec fluidité (WAAPI).
     * Anime la hauteur externe de <details> (sans plancher de padding) pour éviter toute saccade.
     * @param {HTMLDetailsElement} details
     * @param {boolean} shouldOpen
     */
    toggleAccordion(details, shouldOpen) {
        if (!details) return;
        const summary = details.querySelector(':scope > summary') || details.querySelector('summary');
        const content = Array.from(details.children).find(el => el.tagName !== 'SUMMARY');
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

        if (!summary || !content || reducedMotion || typeof details.animate !== 'function') {
            details.classList.remove('is-closing');
            details.open = shouldOpen;
            return;
        }

        const currentHeight = details.getBoundingClientRect().height;

        if (details._accordionAnim) {
            details._accordionAnim.cancel();
            details._accordionAnim = null;
        }
        if (details._accordionContentAnim) {
            details._accordionContentAnim.cancel();
            details._accordionContentAnim = null;
        }

        const style = window.getComputedStyle(details);
        const borderAndPadding =
            (parseFloat(style.borderTopWidth) || 0) +
            (parseFloat(style.borderBottomWidth) || 0) +
            (parseFloat(style.paddingTop) || 0) +
            (parseFloat(style.paddingBottom) || 0);
        const closedHeight = summary.getBoundingClientRect().height + borderAndPadding;

        if (shouldOpen) {
            const startHeight = details.open ? currentHeight : closedHeight;
            details.classList.remove('is-closing');
            details.open = true;
            const endHeight = details.getBoundingClientRect().height;
            if (Math.abs(endHeight - startHeight) < 1) return;

            details.style.overflow = 'hidden';
            const anim = details.animate([
                { height: `${startHeight}px` },
                { height: `${endHeight}px` }
            ], {
                duration: 260,
                easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
            });
            details._accordionAnim = anim;
            if (typeof content.animate === 'function') {
                details._accordionContentAnim = content.animate([
                    { opacity: 0, transform: 'translateY(-4px)' },
                    { opacity: 1, transform: 'translateY(0)' }
                ], {
                    duration: 220,
                    easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
                });
            }
            const cleanup = () => {
                details.style.overflow = '';
                details._accordionAnim = null;
                details._accordionContentAnim = null;
            };
            anim.onfinish = cleanup;
            anim.oncancel = cleanup;
        } else {
            const startHeight = currentHeight;
            const endHeight = closedHeight;
            if (Math.abs(startHeight - endHeight) < 1) {
                details.classList.remove('is-closing');
                details.open = false;
                return;
            }

            details.classList.add('is-closing');
            details.style.overflow = 'hidden';
            const anim = details.animate([
                { height: `${startHeight}px` },
                { height: `${endHeight}px` }
            ], {
                duration: 240,
                easing: 'cubic-bezier(0.32, 0.72, 0, 1)'
            });
            details._accordionAnim = anim;
            if (typeof content.animate === 'function') {
                details._accordionContentAnim = content.animate([
                    { opacity: 1, transform: 'translateY(0)' },
                    { opacity: 0, transform: 'translateY(-3px)' }
                ], {
                    duration: 180,
                    easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
                    fill: 'forwards'
                });
            }
            anim.onfinish = () => {
                details.open = false;
                details.classList.remove('is-closing');
                details.style.overflow = '';
                details._accordionContentAnim?.cancel();
                details._accordionAnim = null;
                details._accordionContentAnim = null;
            };
            anim.oncancel = () => {
                details.classList.remove('is-closing');
                details.style.overflow = '';
                details._accordionContentAnim?.cancel();
                details._accordionAnim = null;
                details._accordionContentAnim = null;
            };
        }
    },

    /**
     * Initialise les accordéons (<details>) de toute l'application avec une animation fluide.
     */
    initAccordions() {
        if (this._accordionsDelegated) return;
        this._accordionsDelegated = true;

        document.addEventListener('click', (e) => {
            const summary = e.target.closest('details > summary');
            if (!summary) return;
            if (e.target.closest('a, button, input, select')) return;

            const details = summary.parentElement;
            if (!details || details.tagName !== 'DETAILS') return;

            e.preventDefault();
            const isClosing = details.open && !details.classList.contains('is-closing');
            const shouldOpen = !isClosing;

            if (shouldOpen && details.classList.contains('help-accordion')) {
                const group = details.closest('.help-accordions-group') || details.parentElement;
                group?.querySelectorAll('details.help-accordion[open]').forEach(other => {
                    if (other !== details) this.toggleAccordion(other, false);
                });
            }

            this.toggleAccordion(details, shouldOpen);
        });
    },

    // ====================================================================
    //  CONTEXTE HEADER
    //  Affichage du nombre d'élèves et statuts dans le header
    // ====================================================================

    updateHeaderContext() {
        if (!DOM.headerClassChip || !DOM.headerStudentCount) return;

        const activePeriod = appState.currentPeriod;
        const currentClassId = appState.currentClassId;

        // CORRECTIF: Filtrer par classe actuelle AVANT de compter
        const classResults = ClassManager.getStudentsForClass(currentClassId);

        const activeStudents = classResults.filter(
            result => !Utils.isStudentDepartedBeforePeriod(result, activePeriod)
        );
        const totalCount = activeStudents.length;

        let newCount = 0;
        let departedCount = 0;
        activeStudents.forEach(result => {
            if (Utils.isStudentNew(result, activePeriod)) {
                newCount++;
            }
            if (Utils.isStudentDeparted(result, activePeriod)) {
                departedCount++;
            }
        });

        if (appState.activeStatFilter && appState.filteredResults.length !== totalCount) {
            DOM.headerStudentCount.textContent = `${appState.filteredResults.length}/${totalCount}`;
        } else {
            DOM.headerStudentCount.textContent = totalCount;
        }

        const studentCountBadge = DOM.headerStudentCount?.closest('.student-count-badge');
        if (studentCountBadge) {
            let label = `${totalCount} ${totalCount > 1 ? 'élèves' : 'élève'}`;
            if (newCount > 0) label += `, dont ${newCount} nouveau${newCount > 1 ? 'x' : ''}`;
            if (departedCount > 0) label += `, ${departedCount} départ${departedCount > 1 ? 's' : ''}`;
            studentCountBadge.setAttribute('aria-label', label);
        }

        DOM.headerClassChip.removeAttribute('data-tooltip');
        DOM.headerClassChip.classList.remove('tooltip');
        DOM.headerClassChip._tippy?.destroy?.();
    },

    // ====================================================================
    //  SOUTIEN BÉNÉVOLE (JALONS D'USAGE NON-INTRUSIFS)
    //  Notification sobre en fin de tâche après un volume réel d'usage
    // ====================================================================

    _supportMilestoneKey: 'bulletin-ai-support-milestone-v1',
    _supportMinGenerations: 30,
    _supportMinSeatingActions: 3,
    _supportCooldownMs: 60 * 24 * 60 * 60 * 1000, // 60 jours (~1 trimestre)
    _supportSeatingDebounceMs: 10 * 60 * 1000,    // 10 min entre 2 placements de la même classe

    _getSupportMilestoneState() {
        const defaults = {
            generationsCount: 0,
            seatingActionsCount: 0,
            lastSeatingClassId: null,
            lastSeatingAt: 0,
            lastShownAt: 0,
            supportClickedAt: 0
        };
        try {
            const raw = localStorage.getItem(this._supportMilestoneKey);
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? { ...defaults, ...parsed } : defaults;
        } catch (_) {
            return defaults;
        }
    },

    _saveSupportMilestoneState(state) {
        try {
            localStorage.setItem(this._supportMilestoneKey, JSON.stringify(state));
        } catch (_) {
            // Ignorer silencieusement en navigation privée ou quota plein
        }
    },

    /**
     * Enregistre que l'utilisateur a cliqué sur un lien de soutien Ko-fi
     * afin de ne plus jamais afficher le rappel automatique.
     */
    markSupportLinkClicked() {
        const state = this._getSupportMilestoneState();
        state.supportClickedAt = Date.now();
        this._saveSupportMilestoneState(state);
    },

    /**
     * Enregistre un jalon d'usage réel et affiche une notification sobre
     * uniquement en fin de tâche (lot terminé, export/copie de classe ou 3e plan de classe),
     * avec un délai de grâce trimestriel (60 jours) et zéro rappel après clic.
     *
     * @param {'generation'|'batch-complete'|'bulletin-export'|'seating-action'} event
     * @param {number} [count=1]
     * @param {Object} [options={}]
     * @param {string|null} [options.classId]
     * @param {boolean} [options.isPrint=false]
     * @param {number} [options.delayMs=1200]
     * @returns {boolean} true si une notification de soutien a été programmée
     */
    recordSupportMilestone(event, count = 1, options = {}) {
        const now = Date.now();
        const state = this._getSupportMilestoneState();

        if (event === 'generation') {
            const delta = Math.max(0, Number(count) || 0);
            if (delta > 0) {
                state.generationsCount = (Number(state.generationsCount) || 0) + delta;
                this._saveSupportMilestoneState(state);
            }
            return false;
        }

        if (event === 'seating-action') {
            const classId = options.classId ?? appState?.currentClassId ?? null;
            const isPrint = Boolean(options.isPrint);
            const sameClassRecent = !isPrint
                && classId !== null
                && state.lastSeatingClassId === classId
                && (now - (Number(state.lastSeatingAt) || 0) < this._supportSeatingDebounceMs);

            if (!sameClassRecent) {
                state.seatingActionsCount = (Number(state.seatingActionsCount) || 0) + 1;
                state.lastSeatingClassId = classId;
                state.lastSeatingAt = now;
                this._saveSupportMilestoneState(state);
            }

            if ((Number(state.seatingActionsCount) || 0) < this._supportMinSeatingActions) {
                return false;
            }
        } else if (event === 'batch-complete' || event === 'bulletin-export') {
            if ((Number(state.generationsCount) || 0) < this._supportMinGenerations) {
                return false;
            }
        } else {
            return false;
        }

        // Garde anti-intrusion : jamais si déjà cliqué ou affiché durant les 60 derniers jours
        if ((Number(state.supportClickedAt) || 0) > 0) return false;
        if ((Number(state.lastShownAt) || 0) > 0 && (now - Number(state.lastShownAt) < this._supportCooldownMs)) {
            return false;
        }

        state.lastShownAt = now;
        this._saveSupportMilestoneState(state);

        const isSeating = event === 'seating-action';
        const title = isSeating ? 'Plans de classe prêts ?' : 'Bulletin bouclé ?';
        const subtitle = isSeating
            ? "Outil développé bénévolement par un collègue. S'il vous simplifie la rentrée, un café aide à faire vivre le projet !"
            : "Outil développé bénévolement par un collègue. S'il vous fait gagner votre soirée, un café aide à faire vivre le projet !";

        const showToast = () => {
            this.showNotification(subtitle, 'info', 9000, {
                title,
                icon: 'solar:cup-hot-bold',
                bypassCoalescing: true,
                action: {
                    label: 'Soutenir ☕',
                    onClick: () => {
                        this.markSupportLinkClicked();
                        const url = APP_LINKS?.KOFI || 'https://ko-fi.com/profassistant';
                        if (typeof window !== 'undefined' && typeof window.open === 'function') {
                            window.open(url, '_blank', 'noopener,noreferrer');
                        }
                    }
                }
            });
        };

        const delayMs = typeof options.delayMs === 'number' ? options.delayMs : 1200;
        if (delayMs <= 0) {
            showToast();
        } else {
            setTimeout(showToast, delayMs);
        }

        return true;
    },

    // Result card functions delegated to ResultCardsUIManager - REMOVED (Legacy Card View Deprecated)
    // All card rendering is now handled by ListViewManager or direct DOM manipulation where needed.
};
