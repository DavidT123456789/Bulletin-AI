/**
 * @fileoverview Focus Panel Analysis Manager
 * Handles AI Analysis page (strengths/weaknesses/next steps) with per-period scoping and inline editing.
 * Extracted from FocusPanelManager for better maintainability.
 * @module managers/FocusPanelAnalysis
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { HistoryManager } from './HistoryManager.js';
import { PromptService } from '../services/PromptService.js';
import { FocusPanelRefinement } from './FocusPanelRefinement.js';

/** @type {import('./AppreciationsManager.js').AppreciationsManager|null} */
let AppreciationsManager = null;

const PROMPT_PREVIEW_HINT = '<br><span class="kbd-hint">Clic droit : aperçu du prompt</span>';
const ANALYSIS_GENERATE_TOOLTIPS = {
    idle: `Générer l'analyse de l'élève avec l'IA${PROMPT_PREVIEW_HINT}`,
    dirty: `Données modifiées · Mettre à jour l'analyse${PROMPT_PREVIEW_HINT}`,
    done: `Proposer une nouvelle analyse${PROMPT_PREVIEW_HINT}`
};

/**
 * Configuration déclarative des 3 cartes d'analyse individuelle (SSOT DOM/rendu)
 * @type {Array<{key: 'strengths'|'weaknesses'|'nextSteps', contentId: string, emptyIcon: string, idleText: string, emptyText: string}>}
 */
const ANALYSIS_CARDS = [
    {
        key: 'strengths',
        contentId: 'analysisForcesContent',
        emptyIcon: 'solar:stars-line-linear',
        idleText: 'Cliquez sur « Générer » pour découvrir les points forts — ou cliquez pour ajouter',
        emptyText: 'Aucun point fort renseigné — cliquez pour ajouter'
    },
    {
        key: 'weaknesses',
        contentId: 'analysisWeaknessesContent',
        emptyIcon: 'solar:magnifer-zoom-in-linear',
        idleText: 'Cliquez sur « Générer » pour identifier les points de vigilance — ou cliquez pour ajouter',
        emptyText: 'Aucun point de vigilance particulier — cliquez pour ajouter'
    },
    {
        key: 'nextSteps',
        contentId: 'analysisSuggestionsContent',
        emptyIcon: 'solar:signpost-linear',
        idleText: 'Cliquez sur « Générer » pour obtenir des pistes de progrès — ou cliquez pour ajouter',
        emptyText: 'Aucune piste renseignée — cliquez pour ajouter'
    }
];

/**
 * Analysis system for AI-powered student insights
 * @namespace FocusPanelAnalysis
 */
export const FocusPanelAnalysis = {
    /**
     * Callback functions set by parent manager
     * @private
     */
    _callbacks: {
        getCurrentStudentId: null
    },

    /** @type {ReturnType<typeof setTimeout>|null} */
    _autoGenerateTimer: null,

    /** @type {ReturnType<typeof setTimeout>|null} */
    _doneBadgeTimer: null,

    /** @type {Map<string, AbortController>} Active analysis generation controllers by student ID */
    _activeGenerations: new Map(),

    /**
     * Cancel an active analysis generation for a student
     * @param {string} studentId
     * @param {Object} [options]
     * @param {boolean} [options.restoreUI=true]
     */
    cancelGenerationForStudent(studentId, { restoreUI = true } = {}) {
        if (!studentId || !this._activeGenerations.has(studentId)) return;
        const controller = this._activeGenerations.get(studentId);
        controller?.abort?.();
        this._activeGenerations.delete(studentId);

        if (restoreUI && this._getCurrentStudentId() === studentId) {
            const generateBtn = document.getElementById('focusGenerateAnalysisBtn');
            if (generateBtn) UI.hideInlineSpinner(generateBtn);
            const result = appState.generatedResults.find(r => r.id === studentId);
            const currentPeriod = appState.currentPeriod;
            const periodAnalysis = Utils.getStudentAnalysisForPeriod(result, currentPeriod);
            this._resetSection();
            if (periodAnalysis) {
                this._populateExisting(result, periodAnalysis);
            }
            this._updateAnalysisGenerateButton(result, periodAnalysis);
        }
    },

    /**
     * Initialize with callbacks and references from parent manager
     * @param {Object} callbacks - Callback functions
     * @param {Function} callbacks.getCurrentStudentId - () => string|null
     * @param {Object} appreciationsManager - Reference to AppreciationsManager
     */
    init(callbacks = {}, appreciationsManager = null) {
        this._callbacks = { ...this._callbacks, ...callbacks };
        AppreciationsManager = appreciationsManager;
    },

    /**
     * Get current student ID via callback
     * @returns {string|null}
     * @private
     */
    _getCurrentStudentId() {
        return this._callbacks.getCurrentStudentId ? this._callbacks.getCurrentStudentId() : null;
    },

    /**
     * Build a normalized snapshot of student data used for analysis dirty-state detection
     * @param {Object} result - Student result object
     * @param {string} [period=appState.currentPeriod]
     * @returns {Object}
     * @private
     */
    _buildAnalysisSnapshot(result, period = appState.currentPeriod) {
        return Utils.buildStudentAnalysisSnapshot(result, period);
    },

    /**
     * Check if any data used for analysis has changed since generation for the active period
     * @param {Object} result - Student result object
     * @param {Object|null} [periodAnalysis=null] - Pre-resolved analysis for the period
     * @param {string} [period=appState.currentPeriod]
     * @returns {boolean} True if any analysis-relevant data has changed
     * @private
     */
    _checkAnalysisDirtyState(result, periodAnalysis = null, period = appState.currentPeriod) {
        if (!result) return false;

        const analysis = periodAnalysis ?? Utils.getStudentAnalysisForPeriod(result, period);
        if (!Utils.hasStudentAnalysisContent(analysis)) return false;

        const snapshot = analysis.snapshot;
        if (!snapshot) {
            if (analysis.sourceAppreciation) {
                const currentAppreciation = result.studentData?.periods?.[period]?.appreciation || '';
                return currentAppreciation.trim() !== analysis.sourceAppreciation.trim();
            }
            return false;
        }

        if (snapshot.period && snapshot.period !== period) {
            return true;
        }

        const current = this._buildAnalysisSnapshot(result, period);
        if (current.appreciation !== (snapshot.appreciation || '').trim()) return true;
        if (current.statuses.join(',') !== [...(snapshot.statuses || [])].sort().join(',')) return true;
        if (current.context !== (snapshot.context || '').trim()) return true;
        if (current.grade !== snapshot.grade) return true;
        if (current.journalCount !== (snapshot.journalCount || 0)) return true;

        return false;
    },

    /**
     * Construit le HTML d'un état vide interactif ou d'une liste éditable inline.
     * @param {Object} cardCfg - Entrée de ANALYSIS_CARDS
     * @param {string[]} items - Liste des points
     * @param {boolean} [hasAnalysisRecord=false] - True si la période possède déjà une analyse
     * @returns {string}
     * @private
     */
    _buildCardHtml(cardCfg, items, hasAnalysisRecord = false) {
        if (!Array.isArray(items) || items.length === 0) {
            const label = hasAnalysisRecord ? cardCfg.emptyText : cardCfg.idleText;
            return `<button type="button" class="analysis-placeholder" data-analysis-add="${cardCfg.key}">
                <iconify-icon icon="${cardCfg.emptyIcon}" aria-hidden="true"></iconify-icon>
                <span>${Utils.escapeHtml(label)}</span>
            </button>`;
        }
        return `<ul>${items.map(item => `<li contenteditable="true" spellcheck="true">${Utils.cleanMarkdown(item)}</li>`).join('')}</ul>`;
    },

    /**
     * Rend une carte d'analyse individuelle avec gestion uniforme des badges et de l'état vide.
     * @param {Object} cardCfg
     * @param {string[]} items
     * @param {Object} [options={}]
     * @private
     */
    async _renderCard(cardCfg, items, { hasAnalysisRecord = false, badgeState = null, animate = false, signal = null } = {}) {
        const contentEl = document.getElementById(cardCfg.contentId);
        if (!contentEl) return;

        const card = contentEl.closest('.analysis-card');
        const normalized = Utils.normalizeAnalysisItems(items);
        const html = this._buildCardHtml(cardCfg, normalized, hasAnalysisRecord);

        if (animate && normalized.length > 0 && UI.animateHtmlReveal) {
            await UI.animateHtmlReveal(contentEl, html, { speed: 'fast', signal });
            if (signal?.aborted) return;
        } else if (normalized.length === 0) {
            const existingPlaceholder = contentEl.querySelector(`button.analysis-placeholder[data-analysis-add="${cardCfg.key}"]`);
            const hasOnlyPlaceholder = existingPlaceholder && !contentEl.querySelector('ul, .analysis-skeleton');
            if (hasOnlyPlaceholder) {
                const label = hasAnalysisRecord ? cardCfg.emptyText : cardCfg.idleText;
                const span = existingPlaceholder.querySelector('span');
                if (span && span.textContent !== label) {
                    span.textContent = label;
                }
            } else {
                contentEl.innerHTML = html;
            }
        } else {
            contentEl.innerHTML = html;
        }

        card?.classList.remove('has-error');
        card?.classList.toggle('has-content', normalized.length > 0);

        if (badgeState) {
            this._setCardBadge(card, badgeState);
        } else {
            card?.querySelector('.analysis-status-badge')?.remove();
        }
    },

    /**
     * Show the analysis page (slide from right)
     */
    show() {
        const container = document.getElementById('focusPagesContainer');
        if (!container) return;

        if (this._autoGenerateTimer) {
            clearTimeout(this._autoGenerateTimer);
            this._autoGenerateTimer = null;
        }

        // Toujours réinitialiser avant d'afficher l'élève / la période courante
        this._resetSection();

        container.classList.add('show-analysis');
        HistoryManager.pushState('focusAnalysis', (opts) => this.hide(opts));

        const mainPage = document.getElementById('focusMainPage');
        const analysisPage = document.getElementById('focusAnalysisPage');
        if (mainPage) mainPage.setAttribute('inert', '');
        if (analysisPage) analysisPage.removeAttribute('inert');

        const studentId = this._getCurrentStudentId();
        const currentPeriod = appState.currentPeriod;
        const result = appState.generatedResults.find(r => r.id === studentId);

        const avatarContainer = document.getElementById('focusAnalysisAvatarContainer');
        const titleEl = document.getElementById('focusAnalysisTitle');
        if (result) {
            if (avatarContainer) {
                avatarContainer.innerHTML = StudentPhotoManager.getAvatarHTML(result, 'lg');
            }
            if (titleEl) {
                const periodShort = Utils.getPeriodLabel(currentPeriod, false);
                titleEl.textContent = periodShort ? `Analyse de ${result.prenom} · ${periodShort}` : `Analyse de ${result.prenom}`;
            }
        }

        const generateBtn = document.getElementById('focusGenerateAnalysisBtn');
        const activeCtrl = studentId ? this._activeGenerations.get(studentId) : null;
        if (activeCtrl && (!activeCtrl._targetPeriod || activeCtrl._targetPeriod === currentPeriod)) {
            this._showSkeleton();
            if (generateBtn) UI.showInlineSpinner(generateBtn);
            return;
        }

        if (generateBtn) {
            UI.hideInlineSpinner(generateBtn);
        }

        const periodAnalysis = Utils.getStudentAnalysisForPeriod(result, currentPeriod);
        this._updateAnalysisGenerateButton(result, periodAnalysis);

        if (periodAnalysis) {
            this._populateExisting(result, periodAnalysis);
        } else if (result) {
            const periodAppreciation = result.studentData?.periods?.[currentPeriod]?.appreciation;
            const hasApiKey = UI.checkAPIKeyPresence(true);

            if (periodAppreciation && periodAppreciation.trim() && hasApiKey) {
                this._autoGenerateTimer = setTimeout(() => {
                    this._autoGenerateTimer = null;
                    if (this.isVisible() && this._getCurrentStudentId() === studentId) {
                        this.generate();
                    }
                }, 150);
            }
        }
    },

    /**
     * Valide et persiste immédiatement une puce en cours d'édition avant navigation,
     * fermeture, passage en arrière-plan ou export PDF afin qu'aucune retouche ne soit perdue.
     * @param {Object} [options={}]
     * @param {boolean} [options.blur=true] - Si false, synchronise sans retirer le focus ni déplacer le curseur
     */
    flushPendingEdit({ blur = true } = {}) {
        const activeEl = document.activeElement;
        const editable = activeEl?.closest?.('#focusAnalysisPage .analysis-card-body li[contenteditable="true"]');
        if (!editable) return;
        if (!blur) {
            const cleanedText = (editable.innerText || editable.textContent || '').replace(/\s+/g, ' ').trim();
            const initialText = editable._initialTextBeforeEdit ?? '';
            if (cleanedText && cleanedText !== initialText) {
                editable._initialTextBeforeEdit = cleanedText;
                this._syncManualAnalysisEdit();
            }
            return;
        }
        this.commitEditableBlur(editable);
        if (document.activeElement === editable) {
            editable.blur();
        }
    },

    /**
     * Hide the analysis page (slide back to main)
     * @param {Object} [options={}]
     */
    hide(options = {}) {
        if (!options?.discardPending) {
            this.flushPendingEdit();
        }
        if (this._autoGenerateTimer) {
            clearTimeout(this._autoGenerateTimer);
            this._autoGenerateTimer = null;
        }
        const container = document.getElementById('focusPagesContainer');
        const wasVisible = container?.classList.contains('show-analysis') ?? false;
        if (container) {
            container.classList.remove('show-analysis');
        }

        if (wasVisible && !options?.causedByHistory && !options?.silentHistory && HistoryManager.isOpen('focusAnalysis')) {
            HistoryManager.handleManualClose('focusAnalysis');
        }

        const mainPage = document.getElementById('focusMainPage');
        const analysisPage = document.getElementById('focusAnalysisPage');
        if (mainPage) mainPage.removeAttribute('inert');
        if (analysisPage) analysisPage.setAttribute('inert', '');
    },

    /**
     * Check if analysis page is visible
     * @returns {boolean}
     */
    isVisible() {
        const container = document.getElementById('focusPagesContainer');
        return container?.classList.contains('show-analysis') ?? false;
    },

    /**
     * Update analysis generate button state (Générer vs Régénérer vs Actualiser)
     * @param {Object} result - Student result object
     * @param {Object|null} [periodAnalysis=null]
     * @private
     */
    _updateAnalysisGenerateButton(result, periodAnalysis = null) {
        const generateBtn = document.getElementById('focusGenerateAnalysisBtn');
        if (!generateBtn) return;

        const currentPeriod = appState.currentPeriod;
        const analysis = periodAnalysis ?? Utils.getStudentAnalysisForPeriod(result, currentPeriod);
        const hasAnalysis = Utils.hasStudentAnalysisContent(analysis);
        const isDirty = hasAnalysis && this._checkAnalysisDirtyState(result, analysis, currentPeriod);
        const state = !hasAnalysis ? 'idle' : (isDirty ? 'dirty' : 'done');
        UI.setGenerateButtonState(generateBtn, state);
        const tooltipText = ANALYSIS_GENERATE_TOOLTIPS[state] || ANALYSIS_GENERATE_TOOLTIPS.idle;
        if (typeof UI?.updateTooltip === 'function') {
            UI.updateTooltip(generateBtn, tooltipText);
        } else {
            generateBtn.setAttribute('data-tooltip', tooltipText);
        }
    },

    /**
     * Reset analysis section content to placeholder state
     * @private
     */
    _resetSection() {
        if (this._doneBadgeTimer) {
            clearTimeout(this._doneBadgeTimer);
            this._doneBadgeTimer = null;
        }
        ANALYSIS_CARDS.forEach(cardCfg => {
            const contentEl = document.getElementById(cardCfg.contentId);
            if (contentEl) {
                contentEl.innerHTML = this._buildCardHtml(cardCfg, [], false);
            }
            const card = contentEl?.closest('.analysis-card');
            if (card) {
                card.classList.remove('has-content', 'has-error');
                card.querySelector('.analysis-status-badge')?.remove();
            }
        });
    },

    /**
     * Show skeleton loading state in analysis cards
     * @private
     */
    _showSkeleton() {
        const skeleton = `<div class="analysis-skeleton">
            <div class="analysis-skeleton-line"></div>
            <div class="analysis-skeleton-line"></div>
            <div class="analysis-skeleton-line"></div>
        </div>`;

        ANALYSIS_CARDS.forEach(cardCfg => {
            const contentEl = document.getElementById(cardCfg.contentId);
            if (contentEl) contentEl.innerHTML = skeleton;
            this._setCardBadge(contentEl?.closest('.analysis-card'), 'loading');
        });
    },

    /**
     * Set badge state on an analysis card
     * @param {HTMLElement} card - The analysis card element
     * @param {'loading'|'done'|'error'|'modified'} state - Badge state
     * @private
     */
    _setCardBadge(card, state) {
        if (!card) return;

        const header = card.querySelector('.analysis-card-header');
        if (!header) return;

        let badge = header.querySelector('.analysis-status-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'analysis-status-badge';
            const addBtn = header.querySelector('.analysis-add-item-btn');
            if (addBtn) {
                header.insertBefore(badge, addBtn);
            } else {
                header.appendChild(badge);
            }
        }

        badge.className = 'analysis-status-badge';
        badge.removeAttribute('title');
        badge.removeAttribute('data-tooltip');
        badge.onclick = null;
        switch (state) {
            case 'loading':
                badge.classList.add('loading');
                badge.innerHTML = '<iconify-icon icon="ph:spinner-gap-bold" class="icon-spin"></iconify-icon>';
                break;
            case 'done':
                badge.classList.add('done');
                badge.innerHTML = '<iconify-icon icon="ph:check"></iconify-icon>';
                break;
            case 'error':
                badge.classList.add('error');
                badge.innerHTML = '<iconify-icon icon="solar:danger-triangle-bold"></iconify-icon>';
                break;
            case 'modified':
                badge.classList.add('modified', 'tooltip');
                badge.innerHTML = '<iconify-icon icon="solar:refresh-linear"></iconify-icon>';
                badge.setAttribute('data-tooltip', 'Données modifiées depuis l\'analyse<br><span class="kbd-hint">Cliquer pour actualiser</span>');
                badge.onclick = () => this.generate();
                UI.initTooltips?.();
                break;
        }
    },

    /**
     * Affiche la modale de prévisualisation du prompt unifié d'analyse (clic droit sur Générer).
     */
    async showPromptPreview() {
        const studentId = this._getCurrentStudentId();
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result || !AppreciationsManager?.getAllPrompts) return;

        const currentPeriod = appState.currentPeriod;
        const prompts = PromptService.getAllPrompts({
            ...result.studentData,
            id: result.id,
            classId: result.classId ?? result.studentData?.classId ?? appState.currentClassId,
            currentPeriod
        });
        await FocusPanelRefinement.displayPromptModal(
            prompts.analysis,
            `Prompt d'analyse — ${result.prenom} (${Utils.getPeriodLabel(currentPeriod, true)})`
        );
    },

    /**
     * Generate AI analysis for current student & active period in a single unified JSON call
     */
    async generate() {
        const studentId = this._getCurrentStudentId();
        if (!studentId) return;

        if (this._activeGenerations.has(studentId)) {
            this.cancelGenerationForStudent(studentId);
            return;
        }

        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result) return;

        if (!UI.checkAPIKeyPresence()) return;

        const targetPeriod = appState.currentPeriod;
        const periodData = result.studentData?.periods?.[targetPeriod] || {};
        const hasGrade = periodData.grade !== null && periodData.grade !== undefined && String(periodData.grade).trim() !== '';
        const hasAppreciation = Boolean(periodData.appreciation && periodData.appreciation.trim());
        const hasContext = Boolean(periodData.context && periodData.context.trim());
        const hasPeriodJournal = Array.isArray(result.journal) && result.journal.some(e => e && (!e.period || e.period === targetPeriod));

        if (!hasAppreciation && !hasGrade && !hasContext && !hasPeriodJournal) {
            UI.showNotification(`Aucune donnée disponible pour analyser ${Utils.getPeriodLabel(targetPeriod, false)}`, 'warning');
            return;
        }

        if (this._autoGenerateTimer) {
            clearTimeout(this._autoGenerateTimer);
            this._autoGenerateTimer = null;
        }

        const abortController = new AbortController();
        abortController._targetPeriod = targetPeriod;
        const { signal } = abortController;
        this._activeGenerations.set(studentId, abortController);

        const existingEntry = result.analysisPerPeriod?.[targetPeriod] || Utils.getStudentAnalysisForPeriod(result, targetPeriod);
        const previousManualBackup = (
            existingEntry &&
            (existingEntry.hasManualEdits || existingEntry.source === 'manual') &&
            Utils.hasStudentAnalysisContent(existingEntry)
        ) ? Utils.deepClone(existingEntry) : null;

        this._showSkeleton();

        const generateBtn = document.getElementById('focusGenerateAnalysisBtn');
        if (generateBtn) {
            UI.showInlineSpinner(generateBtn);
        }

        try {
            await this._fetchAnalyses(result, targetPeriod, signal);
            if (signal.aborted) return;

            if (previousManualBackup) {
                UI.showNotification('Analyse régénérée.', 'info', 6000, {
                    bypassCoalescing: true,
                    action: {
                        label: 'Rétablir',
                        onClick: () => this._restoreAnalysisEntry(studentId, targetPeriod, previousManualBackup)
                    }
                });
            }
        } catch (error) {
            if (signal.aborted || error.name === 'AbortError') return;
            console.error('Erreur analyse:', error);
            const msg = Utils.translateErrorMessage ? Utils.translateErrorMessage(error.message) : error.message;
            UI.showNotification(`Erreur : ${msg}`, 'error');

            if (this._getCurrentStudentId() === studentId) {
                const existing = Utils.getStudentAnalysisForPeriod(result, appState.currentPeriod);
                if (existing) {
                    this._populateExisting(result, existing);
                } else {
                    this._showError(msg);
                }
            }
        } finally {
            if (this._activeGenerations.get(studentId) === abortController) {
                this._activeGenerations.delete(studentId);
            }
            if (!this._activeGenerations.has(studentId) && generateBtn && this._getCurrentStudentId() === studentId) {
                UI.hideInlineSpinner(generateBtn);
                this._updateAnalysisGenerateButton(result);
            }
        }
    },

    /**
     * Fetch unified AI analysis for the captured period and animate display if context matches
     * @param {Object} result - Student result object
     * @param {string} targetPeriod - Captured period at generation launch
     * @param {AbortSignal|null} [signal=null]
     * @private
     */
    async _fetchAnalyses(result, targetPeriod, signal = null) {
        const id = result.id;
        await AppreciationsManager.generateStudentAnalysis(id, targetPeriod, true, signal);
        if (signal?.aborted) return;

        if (this._getCurrentStudentId() !== id || appState.currentPeriod !== targetPeriod) return;

        const savedAnalysis = Utils.getStudentAnalysisForPeriod(result, targetPeriod);
        const revealPromises = ANALYSIS_CARDS.map(cardCfg =>
            this._renderCard(cardCfg, savedAnalysis?.[cardCfg.key] || [], {
                hasAnalysisRecord: true,
                badgeState: 'done',
                animate: true,
                signal
            })
        );
        await Promise.all(revealPromises);
        if (signal?.aborted) return;

        if (this._doneBadgeTimer) {
            clearTimeout(this._doneBadgeTimer);
        }
        this._doneBadgeTimer = setTimeout(() => {
            this._doneBadgeTimer = null;
            if (this._getCurrentStudentId() === id && appState.currentPeriod === targetPeriod) {
                document.querySelectorAll('#focusAnalysisPage .analysis-status-badge.done').forEach(b => b.remove());
            }
        }, 1500);
    },

    /**
     * Restaure une analyse manuelle sauvegardée juste avant une régénération IA.
     * @param {string} studentId
     * @param {string} targetPeriod
     * @param {Object} backupEntry
     * @private
     */
    _restoreAnalysisEntry(studentId, targetPeriod, backupEntry) {
        const targetResult = appState.generatedResults.find(r => r.id === studentId);
        if (!targetResult || !backupEntry) return;

        const now = Date.now();
        if (!targetResult.analysisPerPeriod || typeof targetResult.analysisPerPeriod !== 'object') {
            targetResult.analysisPerPeriod = {};
        }
        targetResult.analysisPerPeriod[targetPeriod] = {
            ...Utils.deepClone(backupEntry),
            _lastModified: now
        };
        targetResult._lastModified = now;
        Utils.syncStudentAnalysisRootCache(targetResult, targetPeriod);
        StorageManager.saveAppState();

        if (this._getCurrentStudentId() === studentId && appState.currentPeriod === targetPeriod) {
            this._resetSection();
            this._populateExisting(targetResult);
            this._updateAnalysisGenerateButton(targetResult);
        }
    },

    /**
     * Ajoute une nouvelle puce éditable dans une carte et lui donne le focus.
     * @param {'strengths'|'weaknesses'|'nextSteps'} sectionKey
     */
    addEditableItem(sectionKey) {
        const studentId = this._getCurrentStudentId();
        if (!studentId || this._activeGenerations.has(studentId)) return;

        const cardCfg = ANALYSIS_CARDS.find(c => c.key === sectionKey);
        if (!cardCfg) return;
        const contentEl = document.getElementById(cardCfg.contentId);
        if (!contentEl) return;

        let list = contentEl.querySelector('ul');
        if (!list) {
            contentEl.innerHTML = '<ul></ul>';
            list = contentEl.querySelector('ul');
        }

        const li = document.createElement('li');
        li.setAttribute('contenteditable', 'true');
        li.setAttribute('spellcheck', 'true');
        li._initialTextBeforeEdit = '';
        list.appendChild(li);

        const card = contentEl.closest('.analysis-card');
        card?.classList.remove('has-error');
        card?.classList.add('has-content');

        li.focus();
    },

    /**
     * Annule l'édition en cours sur une puce et restaure son contenu initial.
     * @param {HTMLElement} editable
     */
    cancelEditableItem(editable) {
        if (!editable) return;
        editable._cancelEdit = true;
        editable.textContent = editable._initialTextBeforeEdit ?? '';
        editable.blur();
    },

    /**
     * Valide la sortie de focus d'une puce éditable : normalise, supprime si vide et persiste.
     * @param {HTMLElement} editable
     */
    commitEditableBlur(editable) {
        if (!editable || !editable.isConnected) return;

        const wasCancelled = Boolean(editable._cancelEdit);
        delete editable._cancelEdit;

        const cleanedText = (editable.innerText || editable.textContent || '').replace(/\s+/g, ' ').trim();
        const initialText = editable._initialTextBeforeEdit ?? '';

        if (wasCancelled) {
            if (!cleanedText) {
                const contentEl = editable.closest('.analysis-card-body');
                editable.remove();
                const remaining = contentEl?.querySelectorAll('li').length || 0;
                if (remaining === 0 && contentEl) {
                    const cardCfg = ANALYSIS_CARDS.find(c => c.contentId === contentEl.id);
                    const result = appState.generatedResults.find(r => r.id === this._getCurrentStudentId());
                    const hasRecord = Boolean(Utils.getStudentAnalysisForPeriod(result, appState.currentPeriod));
                    if (cardCfg) {
                        contentEl.innerHTML = this._buildCardHtml(cardCfg, [], hasRecord);
                        contentEl.closest('.analysis-card')?.classList.remove('has-content');
                    }
                }
            }
            return;
        }

        if (!cleanedText) {
            editable.remove();
            this._syncManualAnalysisEdit();
            return;
        }

        editable.textContent = cleanedText;
        if (cleanedText === initialText) return;

        editable._initialTextBeforeEdit = cleanedText;
        this._syncManualAnalysisEdit();
    },

    /**
     * Synchronise les retouches manuelles du DOM vers `analysisPerPeriod[currentPeriod]`,
     * le miroir racine rétrocompatible et la sauvegarde locale/cloud.
     * @private
     */
    _syncManualAnalysisEdit() {
        const studentId = this._getCurrentStudentId();
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result) return;

        const currentPeriod = appState.currentPeriod;
        const collected = {};
        ANALYSIS_CARDS.forEach(cardCfg => {
            const contentEl = document.getElementById(cardCfg.contentId);
            const rawItems = contentEl
                ? Array.from(contentEl.querySelectorAll('li')).map(li => li.innerText || li.textContent || '')
                : [];
            collected[cardCfg.key] = Utils.normalizeAnalysisItems(rawItems);
        });

        const prevEntry = result.analysisPerPeriod?.[currentPeriod] || Utils.getStudentAnalysisForPeriod(result, currentPeriod);
        const now = Date.now();
        if (!result.analysisPerPeriod || typeof result.analysisPerPeriod !== 'object') {
            result.analysisPerPeriod = {};
        }

        result.analysisPerPeriod[currentPeriod] = {
            strengths: collected.strengths,
            weaknesses: collected.weaknesses,
            nextSteps: collected.nextSteps,
            source: prevEntry?.source && prevEntry.source !== 'legacy' ? prevEntry.source : 'manual',
            hasManualEdits: true,
            timestamp: prevEntry?.timestamp || new Date(now).toISOString(),
            _lastModified: now,
            snapshot: prevEntry?.snapshot ?? this._buildAnalysisSnapshot(result, currentPeriod),
            sourceAppreciation: prevEntry?.sourceAppreciation ?? (result.studentData?.periods?.[currentPeriod]?.appreciation || '').trim(),
            model: prevEntry?.model ?? null
        };
        result._lastModified = now;

        Utils.syncStudentAnalysisRootCache(result, currentPeriod);

        const updatedPeriodAnalysis = Utils.getStudentAnalysisForPeriod(result, currentPeriod);
        const hasAnyContent = Utils.hasStudentAnalysisContent(updatedPeriodAnalysis);
        const isDirty = hasAnyContent && this._checkAnalysisDirtyState(result, updatedPeriodAnalysis, currentPeriod);
        const badgeState = isDirty ? 'modified' : null;

        ANALYSIS_CARDS.forEach(cardCfg => {
            if (collected[cardCfg.key].length === 0) {
                this._renderCard(cardCfg, [], { hasAnalysisRecord: true, badgeState });
            } else {
                const card = document.getElementById(cardCfg.contentId)?.closest('.analysis-card');
                card?.classList.add('has-content');
                if (badgeState) this._setCardBadge(card, badgeState);
            }
        });

        this._updateAnalysisGenerateButton(result, updatedPeriodAnalysis);
        StorageManager.saveAppState();
    },

    /**
     * Show error state in analysis cards
     * @param {string} message - Error message
     * @private
     */
    _showError(message) {
        const errorHtml = `<span style="color:var(--error-text); font-size: 12px; display: flex; align-items: center; gap: 4px;">
            <iconify-icon icon="solar:danger-circle-bold"></iconify-icon> ${Utils.escapeHtml(message.substring(0, 60))}...
        </span>`;

        ANALYSIS_CARDS.forEach(cardCfg => {
            const contentEl = document.getElementById(cardCfg.contentId);
            if (contentEl) contentEl.innerHTML = errorHtml;
            const card = contentEl?.closest('.analysis-card');
            card?.classList.add('has-error');
            this._setCardBadge(card, 'error');
        });
    },

    /**
     * Pre-populate analysis section with existing period data
     * @param {Object} result - Student result object
     * @param {Object|null} [periodAnalysis=null] - Pre-resolved analysis for active period
     * @private
     */
    _populateExisting(result, periodAnalysis = null) {
        const currentPeriod = appState.currentPeriod;
        const analysis = periodAnalysis ?? Utils.getStudentAnalysisForPeriod(result, currentPeriod);
        if (!analysis) return;

        const hasAnyContent = Utils.hasStudentAnalysisContent(analysis);
        const isDirty = hasAnyContent && this._checkAnalysisDirtyState(result, analysis, currentPeriod);
        const badgeState = isDirty ? 'modified' : null;

        ANALYSIS_CARDS.forEach(cardCfg => {
            this._renderCard(cardCfg, analysis[cardCfg.key] || [], {
                hasAnalysisRecord: true,
                badgeState
            });
        });
    }
};
