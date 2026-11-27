/**
 * @fileoverview Focus Panel History Manager
 * UI layer for student appreciation version history — delegates state logic to HistoryUtils
 * and shared stepper/popover rendering to HistoryPopoverUI.
 * @module managers/FocusPanelHistory
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import { AnimationManager } from './AnimationManager.js';
import * as HistoryUtils from '../utils/HistoryUtils.js';
import * as HistoryPopoverUI from '../utils/HistoryPopoverUI.js';
import { Utils } from '../utils/Utils.js';

const POPOVER_ID = 'historyPopover';
const HISTORY_KEY = 'focusHistoryPopover';
const EDIT_COMMIT_DEBOUNCE_MS = 450;

/**
 * Focus Panel history UI controller
 * @namespace FocusPanelHistory
 */
export const FocusPanelHistory = {
    _currentResultId: null,
    _panel: null,
    _callbacks: { onContentChange: null, onHistoryChange: null },
    _editSession: HistoryUtils.createEditSession(),
    _editCommitTimer: null,
    _animTimeoutExit: null,
    _animTimeoutEnter: null,

    init(callbacksOrPanel = {}, maybeCallbacks = null) {
        if (callbacksOrPanel && typeof callbacksOrPanel === 'object' && ('currentStudentId' in callbacksOrPanel || '_getCurrentStudent' in callbacksOrPanel)) {
            this._panel = callbacksOrPanel;
            if (maybeCallbacks && typeof maybeCallbacks === 'object') {
                this._callbacks = { ...this._callbacks, ...maybeCallbacks };
            }
        } else {
            this._callbacks = { ...this._callbacks, ...callbacksOrPanel };
        }
    },

    _getActiveStudentId(studentId = null) {
        return studentId || this._currentResultId || this._panel?.currentStudentId || null;
    },

    _getResult(studentId = null) {
        const targetId = this._getActiveStudentId(studentId);
        if (!targetId) return null;
        return appState.generatedResults.find(r => r.id === targetId);
    },

    _isBusy(studentId = null) {
        const targetId = this._getActiveStudentId(studentId);
        return Boolean(targetId && this._panel?._activeGenerations?.has(targetId));
    },

    /**
     * Get period-scoped history state for the current (or specified) period.
     * @param {boolean} [createIfMissing=false]
     * @param {string|null} [targetPeriod=null]
     * @param {string|null} [targetStudentId=null]
     * @param {boolean} [autoSeed=true]
     * @returns {Object|null}
     * @private
     */
    _getState(createIfMissing = false, targetPeriod = null, targetStudentId = null, autoSeed = true) {
        const result = this._getResult(targetStudentId);
        if (!result) return null;
        const currentPeriod = targetPeriod || appState.currentPeriod;
        return HistoryUtils.getStudentPeriodState(result, currentPeriod, { createIfMissing, autoSeed });
    },

    _save() {
        StorageManager.saveAppState();
    },

    _isTextAnimating(textEl = null) {
        const el = textEl || document.getElementById('focusAppreciationText');
        return Boolean(
            this._animTimeoutExit
            || this._animTimeoutEnter
            || el?._activeRevealId
            || el?.classList?.contains('progressive-reveal-container')
            || el?.classList?.contains('history-animating')
        );
    },

    _cancelVersionAnimation() {
        if (this._animTimeoutExit) {
            clearTimeout(this._animTimeoutExit);
            this._animTimeoutExit = null;
        }
        if (this._animTimeoutEnter) {
            clearTimeout(this._animTimeoutEnter);
            this._animTimeoutEnter = null;
        }
        const textEl = document.getElementById('focusAppreciationText');
        if (textEl) {
            textEl.classList.remove(
                'history-animating',
                'history-exit-forward',
                'history-exit-backward',
                'history-enter-forward',
                'history-enter-backward'
            );
        }
    },

    load(resultId, targetPeriod = null) {
        this._cancelVersionAnimation();
        this.endEditSession();
        this.closePopover();
        this._currentResultId = resultId;
        const result = this._getResult(resultId);
        const currentPeriod = targetPeriod || appState.currentPeriod;
        const hasPeriodAppreciation = Boolean(
            result?.studentData?.periods?.[currentPeriod]?.appreciation?.trim()
            || (result?.generationPeriod === currentPeriod && result?.appreciation?.trim())
        );
        this._getState(hasPeriodAppreciation, currentPeriod, resultId, true);
        this._notifyHistoryChange();
    },

    reset() {
        this._cancelVersionAnimation();
        this.endEditSession();
        this.closePopover();
        this._currentResultId = null;
        this._notifyHistoryChange();
    },

    /**
     * Schedule a coalesced manual-edit commit during active typing (so `< 2/2 >` appears live without polluting the popover).
     * @param {string} content
     */
    scheduleEditCommit(content) {
        if (this._editCommitTimer) {
            clearTimeout(this._editCommitTimer);
            this._editCommitTimer = null;
        }
        const targetStudentId = this._getActiveStudentId();
        const targetPeriod = appState.currentPeriod;
        this._editCommitTimer = setTimeout(() => {
            this._editCommitTimer = null;
            if (this._getActiveStudentId() !== targetStudentId || appState.currentPeriod !== targetPeriod) return;
            if (this._isBusy(targetStudentId)) return;
            this.flushEditSession(content, { studentId: targetStudentId, period: targetPeriod });
        }, EDIT_COMMIT_DEBOUNCE_MS);
    },

    /**
     * Immediately commit or update in-place the active manual-edit session.
     * @param {string|null} [content=null]
     * @param {Object} [options={}]
     * @returns {boolean} True if history state changed
     */
    flushEditSession(content = null, options = {}) {
        if (this._editCommitTimer) {
            clearTimeout(this._editCommitTimer);
            this._editCommitTimer = null;
        }

        const rawContent = typeof content === 'string'
            ? content
            : (document.getElementById('focusAppreciationText')?.textContent || '');
        const cleanContent = rawContent.trim();
        if (!cleanContent || cleanContent.includes('Aucune appréciation')) return false;

        const targetPeriod = options?.period || appState.currentPeriod;
        const targetStudentId = options?.studentId || this._getActiveStudentId();
        const result = this._getResult(targetStudentId);
        if (!result) return false;

        const state = this._getState(true, targetPeriod, targetStudentId, true);
        if (!state) return false;

        const res = HistoryUtils.upsertEditVersion(state, cleanContent, this._editSession, {
            appreciationSource: result.appreciationSource ?? 'manual',
            aiModel: result.studentData?.currentAIModel ?? null,
            tokenUsage: null
        });
        this._editSession = res.session;

        if (res.changed) {
            this._save();
            const isCurrentStudent = !targetStudentId || targetStudentId === this._getActiveStudentId();
            const isCurrentPeriod = !targetPeriod || targetPeriod === appState.currentPeriod;
            if (isCurrentStudent && isCurrentPeriod) {
                this._notifyHistoryChange();
            }
        }
        return res.changed;
    },

    /**
     * Close the current manual-edit coalescing session (on blur, version switch, or AI action).
     */
    endEditSession() {
        if (this._editCommitTimer) {
            clearTimeout(this._editCommitTimer);
            this._editCommitTimer = null;
        }
        this._editSession = HistoryUtils.createEditSession();
    },

    push(content, source = 'edit', options = {}) {
        if (!content || typeof content !== 'string') return;
        const cleanContent = content.trim();
        if (!cleanContent) return;
        if (cleanContent.includes('Aucune appréciation')) return;

        const targetPeriod = typeof options === 'string' ? options : (options?.period || null);
        const targetStudentId = typeof options === 'object' ? (options?.studentId || null) : null;
        const autoSeed = typeof options === 'object' && options?.autoSeed === false ? false : true;

        const isCurrentStudent = !targetStudentId || targetStudentId === this._getActiveStudentId();
        const isCurrentPeriod = !targetPeriod || targetPeriod === appState.currentPeriod;
        if (isCurrentStudent && isCurrentPeriod) {
            this.endEditSession();
        }

        const state = this._getState(true, targetPeriod, targetStudentId, autoSeed);
        const result = this._getResult(targetStudentId);
        if (!state || !result) return;

        const appreciationSource = result?.appreciationSource ?? null;
        const aiModel = result?.studentData?.currentAIModel ?? null;
        const tokenUsage = result?.tokenUsage ? Utils.deepClone(result.tokenUsage) : null;
        const extraMeta = typeof options === 'object' && options
            ? {
                customInstruction: options.customInstruction || null,
                toneBaseContent: options.toneBaseContent || null
            }
            : null;

        if (HistoryUtils.pushToState(state, cleanContent, source, appreciationSource, aiModel, tokenUsage, extraMeta)) {
            this._save();
            if (isCurrentStudent && isCurrentPeriod) {
                this._notifyHistoryChange();
            }
        }
    },

    /**
     * Retourne l'entrée normalisée de la version active dans l'historique (ou null).
     * @param {string|null} [targetPeriod=null]
     * @param {string|null} [targetStudentId=null]
     * @returns {Object|null}
     */
    getCurrentVersion(targetPeriod = null, targetStudentId = null) {
        const state = this._getState(false, targetPeriod, targetStudentId, false);
        if (!state || !Array.isArray(state.versions) || state.currentIndex < 0 || state.currentIndex >= state.versions.length) {
            return null;
        }
        return HistoryUtils.normalizeVersion(state.versions[state.currentIndex]);
    },

    /**
     * Cherche dans l'historique une variante de ton déjà calculée pour un texte de base donné.
     * @param {'encouraging'|'demanding'} toneType
     * @param {string} baseContent
     * @param {string|null} [targetPeriod=null]
     * @param {string|null} [targetStudentId=null]
     * @returns {number} Index de la variante trouvée, ou -1
     */
    findToneVariantIndex(toneType, baseContent, targetPeriod = null, targetStudentId = null) {
        const cleanBase = typeof baseContent === 'string' ? baseContent.trim() : '';
        if (!toneType || !cleanBase) return -1;
        const state = this._getState(false, targetPeriod, targetStudentId, false);
        if (!state || !Array.isArray(state.versions)) return -1;

        for (let i = state.versions.length - 1; i >= 0; i--) {
            const v = state.versions[i];
            if (v && typeof v === 'object' && v.source === toneType && v.toneBaseContent?.trim() === cleanBase) {
                return i;
            }
        }
        return -1;
    },

    /**
     * Cherche dans l'historique l'index d'un contenu exact (utilisé pour restaurer la base d'une bascule de ton).
     * @param {string} content
     * @param {string|null} [targetPeriod=null]
     * @param {string|null} [targetStudentId=null]
     * @returns {number} Index trouvé ou -1
     */
    findContentIndex(content, targetPeriod = null, targetStudentId = null) {
        const clean = typeof content === 'string' ? content.trim() : '';
        if (!clean) return -1;
        const state = this._getState(false, targetPeriod, targetStudentId, false);
        if (!state || !Array.isArray(state.versions)) return -1;
        return state.versions.findIndex(v => HistoryUtils.getVersionContent(v).trim() === clean);
    },

    canUndo() {
        return HistoryUtils.canUndo(this._getState());
    },

    canRedo() {
        return HistoryUtils.canRedo(this._getState());
    },

    /**
     * True when Ctrl+Z should be handled by FocusPanelHistory instead of browser native undo:
     * either there is a previous version, the editor was cleared with a recoverable version,
     * or the user has typed uncommitted edits on top of an existing stored version.
     * @param {string} [currentText='']
     * @returns {boolean}
     */
    canUndoWithPending(currentText = '') {
        if (this._isBusy()) return false;
        const state = this._getState();
        if (!state || !Array.isArray(state.versions) || state.versions.length === 0) return false;

        const clean = String(currentText || '').trim();
        if (!clean) {
            return state.currentIndex >= 0 && Boolean(state.versions[state.currentIndex]);
        }
        if (HistoryUtils.canUndo(state)) return true;

        const activeContent = HistoryUtils.getVersionContent(state.versions[state.currentIndex]).trim();
        return Boolean(activeContent) && clean !== activeContent;
    },

    undo() {
        if (this._isBusy()) return;
        const textEl = document.getElementById('focusAppreciationText');
        const state = this._getState();
        if (!state) return;

        const isAnimating = this._isTextAnimating(textEl);
        const isCurrentlyEmpty = !isAnimating && (textEl?.classList.contains('empty') || !textEl?.textContent?.trim());
        if (isCurrentlyEmpty && state.currentIndex >= 0 && state.versions[state.currentIndex]) {
            this.endEditSession();
            const version = HistoryUtils.normalizeVersion(state.versions[state.currentIndex]);
            this._save();
            this._animateVersionChange(version, 'backward');
            return;
        }

        // Flush any uncommitted typing so the draft is preserved in history (Redo restores it)
        // Skip while animating so transitional/previous DOM text is never committed as a manual edit.
        if (textEl && !isAnimating) {
            this.flushEditSession(textEl.textContent || '');
        }
        this.endEditSession();

        const version = HistoryUtils.undo(state);
        if (version !== null) {
            this._save();
            this._animateVersionChange(version, 'backward');
        }
    },

    redo() {
        if (this._isBusy()) return;
        this.endEditSession();
        const version = HistoryUtils.redo(this._getState());
        if (version !== null) {
            this._save();
            this._animateVersionChange(version, 'forward');
        }
    },

    getModificationCount() {
        return HistoryUtils.getModificationCount(this._getState());
    },

    getVersionCount(targetPeriod = null, targetStudentId = null) {
        const result = this._getResult(targetStudentId);
        const currentPeriod = targetPeriod || appState.currentPeriod;
        const hasExistingAppreciation = Boolean(result?.studentData?.periods?.[currentPeriod]?.appreciation?.trim());
        const state = this._getState(hasExistingAppreciation, currentPeriod, targetStudentId, true);
        return state ? state.versions.length : 0;
    },

    getCurrentVersionInfo() {
        const state = this._getState();
        if (!state || !state.versions || state.versions.length === 0) {
            return { current: 0, total: 0 };
        }
        return {
            current: (state.currentIndex ?? 0) + 1,
            total: state.versions.length
        };
    },

    restoreVersion(index) {
        if (this._isBusy()) return;
        const state = this._getState();
        const textEl = document.getElementById('focusAppreciationText');
        const isAnimating = this._isTextAnimating(textEl);
        const isCurrentlyEmpty = !isAnimating && (textEl?.classList.contains('empty') || !textEl?.textContent?.trim());
        const oldIndex = state?.currentIndex ?? 0;

        if (!isCurrentlyEmpty && index === oldIndex) return;
        this.endEditSession();

        const version = HistoryUtils.goToVersion(state, index);
        if (version !== null) {
            this._save();
            this._animateVersionChange(version, index <= oldIndex ? 'backward' : 'forward');
        }
    },

    closePopover(options = {}) {
        HistoryPopoverUI.closePopover(POPOVER_ID, options);
    },

    showPopover() {
        if (this._isBusy()) return;
        const indicator = document.getElementById('focusHistoryIndicator');
        const textEl = document.getElementById('focusAppreciationText');
        const isAnimating = this._isTextAnimating(textEl);
        const isCurrentlyEmpty = !isAnimating && (textEl?.classList.contains('empty') || !textEl?.textContent?.trim());

        if (!isCurrentlyEmpty && !isAnimating && textEl) {
            this.flushEditSession(textEl.textContent || '');
        }

        const state = this._getState();
        HistoryPopoverUI.togglePopover({
            popoverId: POPOVER_ID,
            historyKey: HISTORY_KEY,
            indicatorEl: indicator,
            state,
            isCurrentlyEmpty,
            onSelectVersion: (idx) => this.restoreVersion(idx),
            bindScrollAffordances: (listEl) => this._panel?.bindScrollAffordances?.(listEl)
        });
    },

    _animateVersionChange(versionData, direction = 'forward') {
        const textEl = document.getElementById('focusAppreciationText');
        if (!textEl) return;

        const content = versionData.content;
        const appreciationSource = versionData.appreciationSource;
        const expectedStudentId = this._getActiveStudentId();
        const expectedPeriod = appState.currentPeriod;

        // Restore ALL metadata on the result BEFORE notifying
        const result = this._getResult();
        if (result) {
            result.appreciation = content;
            const currentPeriod = appState.currentPeriod;
            Utils.setAppreciationCopied(result, currentPeriod, false);
            if (result.studentData?.periods) {
                Utils.markStudentModified(result, currentPeriod);
                result.studentData.periods[currentPeriod].appreciation = content;
            }

            if (appreciationSource !== undefined) {
                result.appreciationSource = appreciationSource;
                if (appreciationSource === 'ai') {
                    result.wasGenerated = true;
                } else if (appreciationSource === 'manual' || appreciationSource === 'imported') {
                    result.wasGenerated = false;
                }
            }

            if (versionData.aiModel) {
                if (!result.studentData) result.studentData = {};
                result.studentData.currentAIModel = versionData.aiModel;
            }

            if (versionData.tokenUsage) {
                result.tokenUsage = Utils.deepClone(versionData.tokenUsage);
            }
        }

        const wasExitPending = Boolean(this._animTimeoutExit);
        AnimationManager.cancelHtmlReveal(textEl);
        this._cancelVersionAnimation();

        const wasEmpty = !wasExitPending && (textEl.classList.contains('empty') || !textEl.textContent?.trim());
        textEl.classList.remove('empty');

        const exitClass = direction === 'backward' ? 'history-exit-forward' : 'history-exit-backward';
        const enterClass = direction === 'backward' ? 'history-enter-backward' : 'history-enter-forward';

        // When recovering from an erased editor or superseding a pending exit, skip exit and slide directly in
        if (wasEmpty || wasExitPending) {
            textEl.innerHTML = Utils.cleanMarkdown(content);
            textEl.classList.add('filled', 'history-animating');
            this._notifyContentChange(content);
            this._notifyHistoryChange();

            void textEl.offsetWidth;
            textEl.classList.add(enterClass);

            this._animTimeoutEnter = setTimeout(() => {
                this._animTimeoutEnter = null;
                if (this._getActiveStudentId() !== expectedStudentId || appState.currentPeriod !== expectedPeriod) {
                    return;
                }
                textEl.classList.remove(enterClass, 'history-animating');
            }, 280);
            return;
        }

        this._notifyHistoryChange();

        // Force reflow to restart CSS animation synchronously
        void textEl.offsetWidth;

        textEl.classList.add('history-animating', exitClass);

        this._animTimeoutExit = setTimeout(() => {
            this._animTimeoutExit = null;
            if (this._getActiveStudentId() !== expectedStudentId || appState.currentPeriod !== expectedPeriod) {
                return;
            }
            textEl.classList.remove(exitClass);
            textEl.innerHTML = Utils.cleanMarkdown(content);
            textEl.classList.add('filled', enterClass);

            this._notifyContentChange(content);
            this._notifyHistoryChange();

            this._animTimeoutEnter = setTimeout(() => {
                this._animTimeoutEnter = null;
                if (this._getActiveStudentId() !== expectedStudentId || appState.currentPeriod !== expectedPeriod) {
                    return;
                }
                textEl.classList.remove(enterClass, 'history-animating');
            }, 280);
        }, 180);
    },

    _notifyContentChange(content) {
        this._callbacks.onContentChange?.(content);
    },

    _notifyHistoryChange() {
        this._callbacks.onHistoryChange?.();
    },

    _getVersionPresentation(versionData, index) {
        return HistoryPopoverUI.getVersionPresentation(versionData, index);
    },

    _formatRelativeTime(timestamp) {
        return HistoryPopoverUI.formatRelativeTime(timestamp);
    }
};
