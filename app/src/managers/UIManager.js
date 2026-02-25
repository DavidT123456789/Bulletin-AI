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
import { MODEL_SHORT_NAMES } from '../config/models.js';
import { CONFIG, CONSTS, DEFAULT_PROMPT_TEMPLATES, DEFAULT_IA_CONFIG, MODEL_DESCRIPTIONS, APP_VERSION } from '../config/Config.js';
import { DOM } from '../utils/DOM.js';
import { EventHandlersManager } from './EventHandlersManager.js';
import { Utils } from '../utils/Utils.js';
import { StorageManager } from './StorageManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';
import { ModalUI } from './ModalUIManager.js';
import { FormUI } from './FormUIManager.js';
import { ImportUI } from './ImportUIManager.js';
import { StatsUI } from './StatsUIManager.js';
import { DropdownManager } from './DropdownManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ThemeManager } from './ThemeManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { GliderManager } from './GliderManager.js';
import { AnimationManager } from './AnimationManager.js';

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
 * @typedef {'success'|'error'|'warning'|'info'} NotificationType
 */

/** @type {import('./AppManager.js').App|null} */
let App;

const NOTIF_ICONS = {
    success: '<iconify-icon icon="ph:check"></iconify-icon>',
    error: '<iconify-icon icon="solar:close-circle-linear"></iconify-icon>',
    warning: '<iconify-icon icon="solar:danger-circle-linear"></iconify-icon>',
    info: '<iconify-icon icon="solar:info-circle-linear"></iconify-icon>'
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

        ImportUI.init(this, appInstance);
        ThemeManager.init();


        // Initialize mobile stats carousel
        StatsUI.initMobileCarousel();
        // Initialize tooltips at startup
        this.initTooltips();
        // Initialize smooth accordion animations
        this.initAccordions();
        // Initialize animated gliders
        this.initGliders();
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
     * Affiche une notification toast temporaire.
     * @param {string} message - Le message à afficher
     * @param {NotificationType} [type='success'] - Type de notification (success, error, warning, info)
     * @param {number} [duration=4000] - Durée d'affichage en ms
     */
    showNotification(message, type = 'success', duration = 4000) {
        const container = document.getElementById('notification-container') || (() => {
            const c = document.createElement('div');
            c.id = 'notification-container';
            document.body.appendChild(c);
            return c;
        })();

        // Prevent duplicate notifications (debounce 1s for same message)
        const timestamp = Date.now();
        if (this._lastNotification &&
            this._lastNotification.message === message &&
            this._lastNotification.type === type &&
            (timestamp - this._lastNotification.timestamp < 1000)) {
            return;
        }
        this._lastNotification = { message, type, timestamp };

        const notif = document.createElement('div');
        notif.className = `notification ${type}`;

        notif.innerHTML = `${NOTIF_ICONS[type] || NOTIF_ICONS.info} <span>${message}</span>`;

        // Interaction: Click to dismiss
        notif.style.cursor = 'pointer';
        notif.onclick = () => removeNotification();

        // Interaction: Pause on hover
        let timeoutId;

        const removeNotification = () => {
            if (notif.dataset.removing) return;
            notif.dataset.removing = 'true';

            notif.classList.remove('show');
            setTimeout(() => {
                if (notif.parentNode === container) container.removeChild(notif);
                if (container.children.length === 0 && container.parentNode === document.body) {
                    if (document.body.contains(container)) document.body.removeChild(container);
                }
            }, 300);
        };

        const startTimer = () => {
            timeoutId = setTimeout(removeNotification, duration);
        };

        const pauseTimer = () => {
            if (timeoutId) clearTimeout(timeoutId);
        };

        notif.addEventListener('mouseenter', pauseTimer);
        notif.addEventListener('mouseleave', startTimer);

        container.appendChild(notif);
        // RAF for animation to ensure class addition happens after DOM insertion
        requestAnimationFrame(() => {
            notif.classList.add('show');
            startTimer();
        });
    },
    /**
     * Affiche une notification cliquable avec action.
     * @param {string} message - Le message à afficher
     * @param {NotificationType} [type='success'] - Type de notification
     * @param {Function} [onClick] - Callback exécuté au clic sur la notification
     * @param {number} [duration=5000] - Durée d'affichage en ms (plus long pour permettre le clic)
     */
    showActionableNotification(message, type = 'success', onClick = null, duration = 5000) {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            document.body.appendChild(container);
        }
        const notif = document.createElement('div');
        notif.className = `notification ${type} actionable`;

        notif.innerHTML = `${NOTIF_ICONS[type] || NOTIF_ICONS.info} <span>${message}</span>`;
        notif.style.cursor = 'pointer';
        container.appendChild(notif);

        if (onClick) {
            notif.addEventListener('click', () => {
                onClick();
                notif.classList.remove('show');
                setTimeout(() => {
                    if (notif.parentNode === container) container.removeChild(notif);
                    if (container.children.length === 0 && container.parentNode === document.body) document.body.removeChild(container);
                }, 300);
            });
        }

        setTimeout(() => notif.classList.add('show'), 10);
        setTimeout(() => {
            notif.classList.remove('show');
            setTimeout(() => {
                if (notif.parentNode === container) container.removeChild(notif);
                if (container.children.length === 0 && container.parentNode === document.body) document.body.removeChild(container);
            }, 300);
        }, duration);
    },

    /**
     * Affiche une notification avec bouton d'annulation et barre de progression.
     * L'action est déjà exécutée ; si l'utilisateur clique "Annuler", le callback onUndo est appelé.
     * @param {string} message - Message affiché dans le toast
     * @param {Function} onUndo - Callback appelé si l'utilisateur annule
     * @param {Object} [options] - Options
     * @param {number} [options.duration=8000] - Durée avant disparition (ms)
     * @param {string} [options.type='warning'] - Type de notification
     * @returns {{ cancel: Function }} Objet avec méthode cancel pour annuler programmatiquement
     */
    showUndoNotification(message, onUndo, options = {}) {
        const { duration = 8000, type = 'warning' } = options;

        const container = document.getElementById('notification-container') || (() => {
            const c = document.createElement('div');
            c.id = 'notification-container';
            document.body.appendChild(c);
            return c;
        })();

        const notif = document.createElement('div');
        notif.className = `notification ${type} notification-undo`;

        notif.innerHTML = `
            ${NOTIF_ICONS[type] || NOTIF_ICONS.warning}
            <span class="notification-undo-message">${message}</span>
            <button class="notification-undo-btn">Annuler</button>
            <div class="notification-undo-progress">
                <div class="notification-undo-progress-fill"></div>
            </div>
        `;

        container.appendChild(notif);

        const progressFill = notif.querySelector('.notification-undo-progress-fill');
        let undone = false;
        let timeoutId;
        let startTime;
        let remaining = duration;

        const removeNotification = () => {
            if (notif.dataset.removing) return;
            notif.dataset.removing = 'true';
            notif.classList.remove('show');
            setTimeout(() => {
                if (notif.parentNode === container) container.removeChild(notif);
                if (container.children.length === 0 && container.parentNode === document.body) {
                    if (document.body.contains(container)) document.body.removeChild(container);
                }
            }, 300);
        };

        const startCountdown = () => {
            startTime = Date.now();
            progressFill.style.transition = `width ${remaining}ms linear`;
            progressFill.style.width = '0%';
            timeoutId = setTimeout(() => {
                if (!undone) removeNotification();
            }, remaining);
        };

        const pauseCountdown = () => {
            if (timeoutId) clearTimeout(timeoutId);
            const elapsed = Date.now() - startTime;
            remaining = Math.max(0, remaining - elapsed);
            const pct = (remaining / duration) * 100;
            progressFill.style.transition = 'none';
            progressFill.style.width = `${pct}%`;
        };

        const handleUndo = () => {
            if (undone) return;
            undone = true;
            if (timeoutId) clearTimeout(timeoutId);
            removeNotification();
            onUndo();
        };

        // Events
        notif.querySelector('.notification-undo-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleUndo();
        });
        notif.addEventListener('mouseenter', pauseCountdown);
        notif.addEventListener('mouseleave', startCountdown);

        // Launch
        requestAnimationFrame(() => {
            progressFill.style.width = '100%';
            notif.classList.add('show');
            requestAnimationFrame(() => startCountdown());
        });

        return { cancel: handleUndo };
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
        // Skip if already on this period
        if (appState.currentPeriod === period) return;

        // [FIX] Save context for the OLD period BEFORE changing appState.currentPeriod
        // This ensures that any edits made to context/grade/appreciation in Focus Panel
        // are saved to the correct period before we switch
        if (FocusPanelManager.isOpen() && FocusPanelManager.currentStudentId) {
            FocusPanelManager.saveCurrentContext();
        }

        // Trigger period-specific animation (horizontal slide - temporal navigation feel)
        const containersToAnimate = document.querySelectorAll('.stats-container, #outputList, .output-header');
        containersToAnimate.forEach(el => {
            el.classList.remove('period-refresh-animation');
            void el.offsetWidth; // Force reflow
            el.classList.add('period-refresh-animation');
        });

        // Delay data swap to sync with slide peak (50% of 350ms ≈ 175ms)
        setTimeout(() => {
            appState.currentPeriod = period;
            document.querySelectorAll('#mainPeriodSelector input[name="periodModeRadio"]').forEach(r => r.checked = r.value === period);
            if (DOM.sidebarPeriodContext) {
                DOM.sidebarPeriodContext.textContent = Utils.getPeriodLabel(period, true);
            }
            this.updatePeriodSystemUI();

            // Update glider
            if (DOM.mainPeriodSelector) this.updateGlider(DOM.mainPeriodSelector);

            AppreciationsManager.renderResults();

            // [FIX] Refresh Focus Panel if open to show the new period's appreciation and context
            if (FocusPanelManager.isOpen()) {
                if (FocusPanelManager.currentStudentId) {
                    FocusPanelManager.open(FocusPanelManager.currentStudentId);
                } else {
                    // No student ID means we're in creation mode
                    // Re-render the timeline to reflect the new period's context
                    FocusPanelManager._renderStudentDetailsTimeline(null, true);

                    // Also update the context card period label
                    const gradeLabel = document.getElementById('focusCurrentGradeLabel');
                    if (gradeLabel) {
                        gradeLabel.textContent = Utils.getPeriodLabel(appState.currentPeriod, false) + ' :';
                    }

                    // Clear inputs for new period (since it's a new student with no data)
                    const gradeInput = document.getElementById('focusCurrentGradeInput');
                    if (gradeInput) gradeInput.value = '';

                    const contextInput = document.getElementById('focusContextInput');
                    if (contextInput) contextInput.value = '';

                    // Update generate button label
                    const generateBtn = document.getElementById('focusGenerateBtn');
                    if (generateBtn) {
                        const periodLabel = Utils.getPeriodLabel(appState.currentPeriod, false);
                        generateBtn.innerHTML = `<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon> Générer ${periodLabel}`;
                    }

                    // Update Previous Grades chips (force refresh for creation mode)
                    const prevGradesEl = document.getElementById('focusPreviousGrades');
                    if (prevGradesEl) {
                        prevGradesEl.innerHTML = '';
                        const periods = Utils.getPeriods();
                        const currentIdx = periods.indexOf(appState.currentPeriod);

                        periods.forEach((p, idx) => {
                            if (idx >= currentIdx) return;

                            // Render chip "--" for consistency
                            const chip = document.createElement('span');
                            chip.className = 'previous-grade-chip';
                            chip.innerHTML = `<span class="prev-grade-label">${Utils.getPeriodLabel(p, false)} :</span> <span class="prev-grade-value">--</span>`;
                            prevGradesEl.appendChild(chip);
                        });
                    }
                }
            }

            StorageManager.saveAppState();

            // [FIX] Dispatch custom event so Lab/Prompt Inspector can sync
            document.dispatchEvent(new CustomEvent('periodChanged', {
                detail: { period: appState.currentPeriod }
            }));

            // Cleanup animation after it finishes
            setTimeout(() => {
                containersToAnimate.forEach(el => {
                    el.classList.remove('period-refresh-animation');
                });
            }, 200); // Remaining animation time
        }, 175);
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
    updatePeriodLabels() {
        if (!DOM.mainPeriodSelector) return;
        DOM.mainPeriodSelector.querySelectorAll('label').forEach(label => {
            const input = document.getElementById(label.getAttribute('for'));
            if (input && label.dataset.short && label.dataset.full) {
                const isActive = input.checked;
                label.textContent = isActive ? label.dataset.full : label.dataset.short;

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
    },
    updatePeriodSystemUI() {
        const periods = Utils.getPeriods();

        // Early return if mainPeriodSelector doesn't exist
        if (!DOM.mainPeriodSelector) return;

        // Vérifier si le sélecteur est déjà peuplé pour éviter de détruire le DOM (et le glider)
        const existingInputs = DOM.mainPeriodSelector.querySelectorAll('input[name="periodModeRadio"]');

        if (existingInputs.length > 0 && existingInputs.length === periods.length) {
            // Mise à jour douce : on change juste l'état checked
            existingInputs.forEach(input => {
                input.checked = (input.value === appState.currentPeriod);
            });
            // Mettre à jour l'affichage des labels
            this.updatePeriodLabels();
        } else {
            // Premier rendu ou changement de structure : on construit le HTML
            // Note: getPeriodLabel(p, false) = court (T1), getPeriodLabel(p, true) = long (Trimestre 1)
            DOM.mainPeriodSelector.innerHTML = periods.map(p => {
                const isActive = appState.currentPeriod === p;
                const tooltip = isActive ? '' : `Passer au ${Utils.getPeriodLabel(p, true)}`;
                return `
                <input type="radio" id="period${p}" name="periodModeRadio" value="${p}" ${isActive ? 'checked' : ''}>
                <label for="period${p}" class="ui-segment ${tooltip ? 'tooltip' : ''}" ${tooltip ? `data-tooltip="${tooltip}"` : ''} data-short="${Utils.getPeriodLabel(p, false)}" data-full="${Utils.getPeriodLabel(p, true)}">
                    ${isActive ? Utils.getPeriodLabel(p, true) : Utils.getPeriodLabel(p, false)}
                </label>
            `}).join('');

            DOM.mainPeriodSelector.querySelectorAll('input').forEach(r => r.addEventListener('change', e => this.setPeriod(e.target.value)));

            // On initialise le glider car c'est un nouveau DOM
            this.initGliders();
        }

        if (DOM.sidebarPeriodContext) {
            DOM.sidebarPeriodContext.textContent = Utils.getPeriodLabel(appState.currentPeriod, true);
        }

        // Option G: Update current period labels in sidebar card
        if (DOM.currentPeriodLabel) {
            DOM.currentPeriodLabel.textContent = Utils.getPeriodLabel(appState.currentPeriod, true);
        }
        if (DOM.contextPeriodLabel) {
            DOM.contextPeriodLabel.textContent = `(${Utils.getPeriodLabel(appState.currentPeriod, false)})`;
        }

        const currentPeriodIndex = periods.indexOf(appState.currentPeriod);
        let formHtml = '';

        for (let i = 0; i <= currentPeriodIndex; i++) {
            const p = periods[i];
            const isCurrent = (i === currentPeriodIndex);

            if (isCurrent) {
                const movementOptions = [`Nouveau ${p}`, `Départ ${p}`];
                const statusOptions = ["PPRE", "PAP", "ULIS", "Délégué"];

                const createPills = (options) => options.map(opt => `
                    <input type="checkbox" id="statut-${opt.replace(' ', '-')}" name="statuses" value="${opt}">
                    <label for="statut-${opt.replace(' ', '-')}">${opt.split(' ')[0]}</label>
                `).join('');

                formHtml += `<div class="period-input-group">
                    <h3><iconify-icon icon="solar:calendar-mark-linear"></iconify-icon> ${Utils.getPeriodLabel(p, true)} <span class="detail-chip-small">(Période Actuelle)</span></h3>
                    <div class="form-row period-main-row">
                        <div class="form-group current-grade-group">
                            <label for="moy${p}">Moyenne ${p}&nbsp;:</label>
                            <input type="text" id="moy${p}" placeholder="14.5">
                            <div class="error-message" id="moy${p}Error"></div>
                        </div>
                         <div class="form-group">
                            <label>Statuts (optionnel)&nbsp;:</label>
                            <div class="status-pills-container">
                                ${createPills(movementOptions)}
                                ${createPills(statusOptions)}
                            </div>
                        </div>
                    </div>
                </div>`;
            } else {
                formHtml += `<div class="period-input-group previous-period-group">
                    <h4>
                        <iconify-icon icon="solar:history-linear"></iconify-icon> ${Utils.getPeriodLabel(p, true)} 
                        <span class="detail-chip-small">(Période précédente)</span>
                    </h4>
                    <div class="form-row">
                        <div class="form-group previous-grade-group">
                            <label for="moy${p}">Moyenne ${p}&nbsp;:</label>
                            <input type="text" id="moy${p}" placeholder="14.5"><div class="error-message" id="moy${p}Error"></div>
                        </div>
                        <div class="form-group">
                            <label for="app${p}">Appréciation ${p}&nbsp;:</label>
                            <textarea id="app${p}" class="period-app-textarea" rows="1"></textarea>
                        </div>
                    </div>
                </div>`;
            }
        }

        // Only render if element exists (sidebar form may have been removed - Lista + Focus UX)
        if (DOM.singleStudentPeriodInputs) {
            DOM.singleStudentPeriodInputs.innerHTML = formHtml;
            DOM.singleStudentPeriodInputs.querySelectorAll('input[type="text"]').forEach(input => input.addEventListener('input', () => Utils.validateGrade(input)));
        }
    },

    // ====================================================================
    //  MODES D'ENTRÉE ET ÉTATS DES BOUTONS
    //  Bascule entre saisie individuelle et import de masse
    // ====================================================================

    setInputMode(mode, force = false) {
        if (!force && appState.currentInputMode === mode) return;
        appState.currentInputMode = mode;
        const isMass = mode === CONSTS.INPUT_MODE.MASS;

        if (DOM.massImportSection) DOM.massImportSection.style.display = isMass ? 'block' : 'none';
        if (DOM.singleStudentFormDiv) DOM.singleStudentFormDiv.style.display = isMass ? 'none' : 'block';

        if (DOM.massImportActions) DOM.massImportActions.style.display = isMass ? 'flex' : 'none';
        if (DOM.singleStudentActions) DOM.singleStudentActions.style.display = isMass ? 'none' : 'flex';

        if (DOM.massImportTab) { DOM.massImportTab.classList.toggle('active', isMass); DOM.massImportTab.setAttribute('aria-selected', String(isMass)); }
        if (DOM.singleStudentTab) { DOM.singleStudentTab.classList.toggle('active', !isMass); DOM.singleStudentTab.setAttribute('aria-selected', String(!isMass)); }

        // Update glider animation (le conteneur est le parent des tabs)
        const tabsContainer = document.querySelector('.input-mode-tabs');
        if (tabsContainer) this.updateGlider(tabsContainer);

        if (!isMass) {
            AppreciationsManager.resetForm();
            // Focus on available element (sidebar elements may not exist)
            const focusTarget = DOM.loadStudentSelect || DOM.nomInput;
            if (focusTarget) setTimeout(() => focusTarget.focus(), 100);
        } else {
            if (DOM.massData) setTimeout(() => DOM.massData.focus(), 100);
        }
        StorageManager.saveAppState();
    },
    updateGenerateButtonState() {
        const isAIAvailable = this.checkAPIKeyPresence(true);
        const buttons = [DOM.importGenerateBtn, DOM.generateAppreciationBtn, DOM.generateAndNextBtn];

        // Déterminer le message approprié selon le provider
        const model = appState.currentAIModel;
        const isOllama = model.startsWith('ollama');
        const warningTooltip = isOllama
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

        if (!isAIAvailable) {
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
    switchToCreationModeUI() {
        if (DOM.generateAppreciationBtn) DOM.generateAppreciationBtn.style.display = 'none';
        if (DOM.generateAndNextBtn) {
            DOM.generateAndNextBtn.style.display = 'inline-flex';
            DOM.generateAndNextBtn.innerHTML = `<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon> Générer ${Utils.getPeriodLabel(appState.currentPeriod, false)} <span class="kbd-hint">Ctrl+⏎</span>`;
            DOM.generateAndNextBtn.className = 'btn btn-ai';
            DOM.generateAndNextBtn.setAttribute('data-tooltip', 'Génère l\'appréciation et prépare le formulaire pour l\'élève suivant. Raccourci : Ctrl+Enter');
        }
        if (DOM.cancelEditBtn) DOM.cancelEditBtn.style.display = 'none';
        if (DOM.resetFormBtn) DOM.resetFormBtn.style.display = 'inline-flex';
    },
    switchToEditModeUI() {
        if (DOM.generateAppreciationBtn) {
            DOM.generateAppreciationBtn.style.display = 'inline-flex';
            DOM.generateAppreciationBtn.innerHTML = `<iconify-icon icon="solar:refresh-linear"></iconify-icon> Mettre à Jour ${Utils.getPeriodLabel(appState.currentPeriod, false)} <span class="kbd-hint">Ctrl+⏎</span>`;
            DOM.generateAppreciationBtn.className = 'btn btn-ai';
            DOM.generateAppreciationBtn.setAttribute('data-tooltip', 'Regénère l\'appréciation avec les données modifiées. Raccourci : Ctrl+Enter');
        }
        if (DOM.generateAndNextBtn) DOM.generateAndNextBtn.style.display = 'none';
        if (DOM.cancelEditBtn) DOM.cancelEditBtn.style.display = 'inline-flex';
        if (DOM.resetFormBtn) DOM.resetFormBtn.style.display = 'none';
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
        // Le bouton Analyser reste toujours actif car il affiche des statistiques calculées localement
        // Seule la génération de synthèse IA nécessite une clé API (géré dans ClassDashboardManager)
        if (DOM.analyzeClassBtn) {
            DOM.analyzeClassBtn.disabled = false;
            DOM.analyzeClassBtn.classList.remove('ai-disabled');
            DOM.analyzeClassBtn.setAttribute('data-tooltip', "Ouvrir le tableau de bord de classe avec statistiques détaillées et analyse IA.");
        }
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

    showLoadingOverlay(msg = 'Génération...') { if (DOM.loadingOverlay) DOM.loadingOverlay.style.display = 'flex'; if (DOM.loadingText) DOM.loadingText.textContent = msg; },
    hideLoadingOverlay() { if (DOM.loadingOverlay) DOM.loadingOverlay.style.display = 'none'; },
    showInlineSpinner(el) { el.dataset.originalContent = el.innerHTML; el.innerHTML = `<div class="loading-spinner" style="margin:auto;"></div>`; el.disabled = true; },
    hideInlineSpinner(el) { if (el.dataset.originalContent) el.innerHTML = el.dataset.originalContent; el.disabled = false; },

    // ====================================================================
    //  DÉLÉGATIONS AUX SOUS-MANAGERS
    //  Façade vers ModalUI, FormUI, StatsUI, ImportUI, ResultCardsUI
    // ====================================================================

    // Modal functions delegated to ModalUIManager
    openModal(modalOrId) { ModalUI.openModal(modalOrId); },
    closeModal(modalOrId) { ModalUI.closeModal(modalOrId); },
    closeAllModals() { ModalUI.closeAllModals(); },

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

        dashboard.classList.remove('generating');

        // Reset progress
        if (DOM.dashProgressFill) {
            DOM.dashProgressFill.style.width = '0%';
        }

        // Refresh the dashboard counts
        this.updateDashboardCounts();

        // Brief success flash if no errors
        if (!hasErrors) {
            dashboard.classList.add('all-complete');
            setTimeout(() => {
                dashboard.classList.remove('all-complete');
            }, 1500);
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
            if (result.errorMessage && result.errorPeriod === currentPeriod) {
                continue;
            }

            // Check if has valid appreciation for current period
            const periodData = result.studentData?.periods?.[currentPeriod];
            const appreciation = periodData?.appreciation || result.appreciation;

            if (appreciation && typeof appreciation === 'string') {
                const textOnly = appreciation.replace(/<[^>]*>/g, '').trim().toLowerCase();
                const isPlaceholder = textOnly === '' ||
                    textOnly.includes('en attente') ||
                    textOnly.includes('aucune appréciation') ||
                    textOnly.includes('cliquez sur') ||
                    textOnly.startsWith('remplissez');

                if (!isPlaceholder) {
                    validated++;
                } else {
                    pending++;
                }
            } else {
                pending++;
            }
        }

        // Update validated count
        if (DOM.dashValidatedCount) {
            DOM.dashValidatedCount.textContent = validated;
        }

        // Pending badge hidden in ultra-minimalist mode (count shown in Generate button)

        // Update model name display
        const modelName = MODEL_SHORT_NAMES?.[appState.currentAIModel] || appState.currentAIModel || 'IA';
        // Extract just the first word for compact display (e.g., "Gemini 2.5 Flash" -> "Gemini")
        const shortModelName = modelName.split(' ')[0];

        // Update model name TEXT
        if (DOM.dashModelName) {
            DOM.dashModelName.textContent = shortModelName;
        }

        // Use consistent icon for all providers (model NAME provides differentiation)
        const providerIcon = 'solar:cpu-bold';

        // Update icon in DOM
        if (DOM.dashModelLabel) {
            const iconEl = DOM.dashModelLabel.querySelector('iconify-icon');
            if (iconEl) iconEl.setAttribute('icon', providerIcon);
        }

        if (DOM.headerGenDashboard) {
            const tooltip = `<strong>${modelName}</strong><br><span style="font-family: monospace; opacity: 0.6; font-size: 0.85em;">${appState.currentAIModel}</span>`;

            if (TooltipsUI && TooltipsUI.updateTooltip) {
                TooltipsUI.updateTooltip(DOM.headerGenDashboard, tooltip);
            } else {
                DOM.headerGenDashboard.setAttribute('data-tooltip', tooltip);
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

        dashboard.classList.remove('generating', 'all-complete');

        if (DOM.dashProgressFill) {
            DOM.dashProgressFill.style.width = '0%';
        }
        if (DOM.dashProgressText) {
            DOM.dashProgressText.textContent = '0/0';
        }

        this.updateDashboardCounts();
    },

    /**
     * Legacy method - now calls updateDashboardCounts
     * @deprecated Use updateDashboardCounts instead
     */
    updateGenerateChipState(pendingCount) {
        this.updateDashboardCounts();
    },

    // Legacy delegations - now redirect to header chip
    updateOutputProgress(cur, total, studentName) { this.showHeaderProgress(cur, total, studentName); },
    resetProgressBar() { this.resetHeaderProgress(); },
    showSettingsTab(tabName) { FormUI.showSettingsTab(tabName); },
    toggleAIKeyFields() { FormUI.toggleAIKeyFields(); },

    // ====================================================================
    //  VALIDATION API ET ÉTAT DE L'APPLICATION
    // ====================================================================

    checkAPIKeyPresence(silent = false) {
        if (appState.isDemoMode) return true;

        const model = appState.currentAIModel;
        let key = '', name = '', provider = '';

        if (model.startsWith('ollama')) {
            // Ollama est local, pas de clé API nécessaire
            provider = 'ollama';
            key = appState.ollamaEnabled ? 'local' : '';
            name = 'Ollama';
        } else if (model.endsWith('-free')) {
            // Modèles gratuits OpenRouter (même gemini-*-free !)
            provider = 'openrouter';
            key = appState.openrouterApiKey;
            name = 'OpenRouter';
        } else if (model.startsWith('openai')) {
            provider = 'openai';
            key = appState.openaiApiKey;
            name = 'OpenAI';
        } else if (model.startsWith('gemini')) {
            provider = 'google';
            key = appState.googleApiKey;
            name = 'Google';
        } else if (model.startsWith('mistral-direct')) {
            provider = 'mistral';
            key = appState.mistralApiKey;
            name = 'Mistral';
        } else if (model.startsWith('anthropic')) {
            provider = 'anthropic';
            key = appState.anthropicApiKey;
            name = 'Anthropic';
        } else {
            provider = 'openrouter';
            key = appState.openrouterApiKey;
            name = 'OpenRouter';
        }

        const errEl = provider !== 'ollama' ? document.getElementById(`${provider}ApiKeyError`) : null;

        if (name && !key) {
            if (!silent) {
                if (provider === 'ollama') {
                    this.showNotification(`Ollama n'est pas activé. Activez-le dans les paramètres.`, 'warning');
                } else {
                    this.showNotification(`Clé API ${name} manquante.`, 'warning');
                }
                if (errEl && DOM.settingsModal.style.display === 'flex' && DOM.advancedTabContent.style.display === 'block') {
                    errEl.textContent = `⚠️ Clé ${name} requise.`;
                    errEl.style.display = 'block';
                }
            }
            return false;
        }
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
        return true;
    },
    // renderVocabList supprimé - fonctionnalité vocabulaire dépréciée
    renderSettingsLists() { FormUI.renderSettingsLists(); },
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
     * @param {boolean} [options.useParentFormGroup=true] - Apply highlight to parent .form-group if available
     */
    highlightSettingsElement(elementOrId, options = {}) {
        const {
            scrollIntoView = true,
            duration = 2400,  // 3 iterations × 800ms animation
            tab = null,
            useParentFormGroup = true
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

            // Determine target element (parent form-group or element itself)
            let target = element;
            if (useParentFormGroup) {
                const formGroup = element.closest('.form-group');
                if (formGroup) target = formGroup;
            }

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
    updateCopyAllButton() {
        const total = appState.generatedResults.length, filtered = appState.filteredResults.length;
        if (DOM.copyAllBtn) {
            DOM.copyAllBtn.innerHTML = `<iconify-icon icon="solar:copy-bold"></iconify-icon> Copier les visibles`;
            DOM.copyAllBtn.disabled = filtered === 0;
        }
    },
    _getMappingOptions() { return ImportUI._getMappingOptions(); },
    _guessInitialMapping(selects, firstLineData, availableOptions) { return ImportUI._guessInitialMapping(selects, firstLineData, availableOptions); },
    updateMassImportPreview() { ImportUI.updateMassImportPreview(); },

    getGradeClass(grade) { return Utils.getGradeClass(grade); },
    populateLoadStudentSelect() {
        if (!DOM.loadStudentSelect) return;

        // CORRECTIF: Utiliser filteredResults pour afficher seulement la classe courante
        const students = [...appState.filteredResults].sort((a, b) =>
            `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`)
        );

        const currentSelection = DOM.loadStudentSelect.value;
        DOM.loadStudentSelect.innerHTML = `<option value="">-- Nouvel élève --</option>`;

        students.forEach(s => {
            const option = document.createElement('option');
            option.value = s.id;
            option.textContent = `${s.nom} ${s.prenom}`;
            DOM.loadStudentSelect.appendChild(option);
        });

        // Garder la sélection si l'élève est dans la classe courante
        if (students.some(s => s.id === currentSelection)) {
            DOM.loadStudentSelect.value = currentSelection;
        }

        // Refresh custom dropdown if enhanced
        DropdownManager.refresh('loadStudentSelect');
    },
    updateActiveFilterInfo() {
        // Remove any existing close buttons from previous filters
        document.querySelectorAll('.filter-close-btn').forEach(btn => btn.remove());

        if (!DOM.activeFilterInfo) return;

        if (appState.activeStatFilter) {
            const filterLabels = {
                'minGrade': 'Moyenne la plus basse',
                'maxGrade': 'Moyenne la plus haute',
                'gradeRange_0-4': 'Notes 0-4',
                'gradeRange_4-8': 'Notes 4-8',
                'gradeRange_8-12': 'Notes 8-12',
                'gradeRange_12-16': 'Notes 12-16',
                'gradeRange_16-20': 'Notes 16-20',
                'progressCount': 'Élèves en progression',
                'stableCount': 'Élèves stables',
                'regressionCount': 'Élèves en régression'
            };

            const card = document.querySelector(`[data-stat-id="${appState.activeStatFilter}"], [data-filter-id="${appState.activeStatFilter}"]`);
            const label = filterLabels[appState.activeStatFilter] || (card ? card.querySelector('.stat-label, .legend-label, .detail-label')?.textContent : 'Filtre');

            // Show overlay banner
            DOM.activeFilterInfo.innerHTML = `<p><iconify-icon icon="solar:filter-linear"></iconify-icon> Filtre : <strong>${label}</strong></p><button type="button" class="btn-link" id="removeFilterBtn"><iconify-icon icon="ph:x"></iconify-icon> Retirer</button>`;
            DOM.activeFilterInfo.classList.add('show');

            // Also add close button on the active element
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
        } else {
            DOM.activeFilterInfo.classList.remove('show');
            DOM.activeFilterInfo.innerHTML = '';
        }
    },
    // DEPRECATED: Use ImportWizardManager.openWithData() instead
    openImportPreviewModal() { console.warn('[UI] openImportPreviewModal is deprecated. Use ImportWizardManager.openWithData() instead.'); },
    resetCopyButtonState(buttonEl) {
        if (buttonEl) {
            const isCopied = buttonEl.closest('.appreciation-result')?.querySelector('.copy-btn.was-copied');
            if (!isCopied) {
                buttonEl.classList.remove('copied');
                buttonEl.innerHTML = '<iconify-icon icon="solar:copy-bold"></iconify-icon>';
            }
        }
    },
    setMassImportProcessingState(isProcessing) { ImportUI.setMassImportProcessingState(isProcessing); },

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
    initTooltips() {
        // Delegate to the specialized manager to avoid duplicates
        TooltipsUI.initTooltips();
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
     * Initialise les accordéons avec une animation fluide.
     * Intercepte le toggle pour permettre à l'animation CSS de se jouer à la fermeture.
     */
    initAccordions() {
        document.querySelectorAll('.ui-accordion').forEach(details => {
            // Éviter d'ajouter plusieurs fois le listener
            if (details.dataset.accordionInit) return;
            details.dataset.accordionInit = 'true';

            const summary = details.querySelector('summary');
            if (!summary) return;

            summary.addEventListener('click', (e) => {
                e.preventDefault();

                // Éviter les clics multiples pendant l'animation
                if (details.dataset.animating === 'true') return;

                const content = details.querySelector('.ui-accordion-content');
                if (!content) {
                    details.open = !details.open;
                    return;
                }

                if (details.open) {
                    // Fermeture avec animation
                    details.dataset.animating = 'true';

                    // Forcer le navigateur à calculer l'état actuel
                    content.style.gridTemplateRows = '1fr';
                    content.style.opacity = '1';

                    // Déclencher le reflow
                    content.offsetHeight;

                    // Appliquer l'animation de fermeture
                    content.style.gridTemplateRows = '0fr';
                    content.style.opacity = '0';

                    // Écouter la fin de la transition
                    const onTransitionEnd = (e) => {
                        if (e.propertyName === 'grid-template-rows' || e.propertyName === 'opacity') {
                            content.removeEventListener('transitionend', onTransitionEnd);
                            details.open = false;
                            content.style.gridTemplateRows = '';
                            content.style.opacity = '';
                            details.dataset.animating = 'false';
                        }
                    };
                    content.addEventListener('transitionend', onTransitionEnd);

                    // Fallback si transitionend ne se déclenche pas
                    setTimeout(() => {
                        if (details.dataset.animating === 'true') {
                            details.open = false;
                            content.style.gridTemplateRows = '';
                            content.style.opacity = '';
                            details.dataset.animating = 'false';
                        }
                    }, 400);
                } else {
                    // Ouverture normale (CSS gère l'animation)
                    details.open = true;
                }
            });
        });
    },

    // ====================================================================
    //  CONTEXTE HEADER
    //  Affichage du nombre d'élèves et statuts dans le header
    // ====================================================================

    updateHeaderContext() {
        if (!DOM.headerClassContext || !DOM.headerStudentCount) return;

        const activePeriod = appState.currentPeriod;
        const activePeriodIndex = Utils.getPeriods().indexOf(activePeriod);
        const currentClassId = appState.currentClassId;

        // CORRECTIF: Filtrer par classe actuelle AVANT de compter
        const classResults = appState.generatedResults.filter(r =>
            !currentClassId || r.classId === currentClassId
        );

        const activeStudents = classResults.filter(result => {
            const statuses = result.studentData?.statuses || [];
            const departStatus = statuses.find(s => s.startsWith('Départ'));
            if (!departStatus) return true;

            const departPeriodKey = departStatus.split(' ')[1];
            const departPeriodIndex = Utils.getPeriods().indexOf(departPeriodKey);

            return departPeriodIndex >= activePeriodIndex;
        });
        const totalCount = activeStudents.length;

        let newCount = 0;
        let departedCount = 0;
        activeStudents.forEach(result => {
            const statuses = result.studentData.statuses || [];
            if (statuses.some(s => s === `Nouveau ${activePeriod}`)) {
                newCount++;
            }
            if (statuses.some(s => s === `Départ ${activePeriod}`)) {
                departedCount++;
            }
        });

        if (appState.activeStatFilter && appState.filteredResults.length !== totalCount) {
            DOM.headerStudentCount.textContent = `${appState.filteredResults.length}/${totalCount}`;
        } else {
            DOM.headerStudentCount.textContent = totalCount;
        }

        let tooltipLines = [`${totalCount} ${totalCount > 1 ? 'élèves' : 'élève'} au total.`];
        if (newCount > 0) {
            tooltipLines.push(`<span style="color: var(--success-color); font-weight: 600;">Nouveaux : ${newCount}</span>`);
        }
        if (departedCount > 0) {
            tooltipLines.push(`<span style="color: var(--error-color); font-weight: 600;">Départs : ${departedCount}</span>`);
        }

        let tooltipText = tooltipLines[0];
        if (tooltipLines.length > 1) {
            tooltipText += '<br>' + tooltipLines.slice(1).join(' | ');
        }

        DOM.headerClassContext.setAttribute('data-tooltip', tooltipText);

        this.initTooltips();
    },

    // Result card functions delegated to ResultCardsUIManager - REMOVED (Legacy Card View Deprecated)
    // All card rendering is now handled by ListViewManager or direct DOM manipulation where needed.
};
