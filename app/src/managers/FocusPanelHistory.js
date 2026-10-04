/**
 * @fileoverview Focus Panel History Manager
 * UI layer for history management - delegates logic to HistoryUtils
 * @module managers/FocusPanelHistory
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import * as HistoryUtils from '../utils/HistoryUtils.js';
import { Utils } from '../utils/Utils.js';

/**
 * Focus Panel history UI controller
 * @namespace FocusPanelHistory
 */
export const FocusPanelHistory = {
    _currentResultId: null,
    _callbacks: { onContentChange: null, onHistoryChange: null },

    init(callbacks = {}) {
        this._callbacks = { ...this._callbacks, ...callbacks };
    },

    _getResult() {
        if (!this._currentResultId) return null;
        return appState.generatedResults.find(r => r.id === this._currentResultId);
    },

    /**
     * Get period-scoped history state for the current period.
     *
     * Architecture:
     * - History lives in result.historyPerPeriod[period] (one state per period)
     * - Legacy result.historyState is migrated to the correct period on first access
     * - History entries are ONLY created through push() (generation, edit, refinement)
     * - No auto-seeding: this avoids cross-period contamination
     *
     * @returns {Object|null}
     * @private
     */
    _getState(createIfMissing = false) {
        const result = this._getResult();
        if (!result) return null;

        const currentPeriod = appState.currentPeriod;

        // 1. Migrate legacy historyState → historyPerPeriod
        if (result.historyState?.versions?.length > 0) {
            if (!result.historyPerPeriod) result.historyPerPeriod = {};
            const legacyPeriod = result.generationPeriod;
            if (legacyPeriod && !result.historyPerPeriod[legacyPeriod]) {
                result.historyPerPeriod[legacyPeriod] = result.historyState;
            }
            result.historyState = null;
        }

        // 2. Return existing period history, or create empty state only if requested
        if (!result.historyPerPeriod?.[currentPeriod]) {
            if (createIfMissing) {
                if (!result.historyPerPeriod) result.historyPerPeriod = {};
                result.historyPerPeriod[currentPeriod] = { versions: [], currentIndex: -1 };
                this._seedInitialVersionIfNeeded(result, currentPeriod);
                return result.historyPerPeriod[currentPeriod];
            }
            return { versions: [], currentIndex: -1 };
        }

        this._seedInitialVersionIfNeeded(result, currentPeriod);
        return result.historyPerPeriod[currentPeriod];
    },

    _seedInitialVersionIfNeeded(result, period) {
        if (!result || !result.historyPerPeriod?.[period]) return;
        HistoryUtils.seedInitialVersion(result.historyPerPeriod[period], result, period);
    },

    _save() {
        StorageManager.saveAppState();
    },

    load(resultId) {
        this._currentResultId = resultId;
        const result = this._getResult();
        const currentPeriod = appState.currentPeriod;
        if (result?.studentData?.periods?.[currentPeriod]?.appreciation?.trim()) {
            this._getState(true);
        } else {
            this._getState(false);
        }
        this._notifyHistoryChange();
    },

    reset() {
        this._currentResultId = null;
        this._notifyHistoryChange();
    },

    push(content, source = 'edit') {
        if (!content || typeof content !== 'string') return;
        const cleanContent = content.trim();
        if (!cleanContent) return;
        if (cleanContent.includes('Aucune appréciation')) return;

        const state = this._getState(true);
        // Capture all metadata from the result so the version carries full context
        const result = this._getResult();
        const appreciationSource = result?.appreciationSource ?? null;
        const aiModel = result?.studentData?.currentAIModel ?? null;
        const tokenUsage = result?.tokenUsage ? Utils.deepClone(result.tokenUsage) : null;

        if (HistoryUtils.pushToState(state, cleanContent, source, appreciationSource, aiModel, tokenUsage)) {
            this._save();
            this._notifyHistoryChange();
        }
    },

    canUndo() {
        return HistoryUtils.canUndo(this._getState());
    },

    canRedo() {
        return HistoryUtils.canRedo(this._getState());
    },

    undo() {
        const textEl = document.getElementById('focusAppreciationText');
        const state = this._getState();
        if (!state) return;

        // Si l'utilisateur a effacé le texte dans l'éditeur, Undo restaure directement la version courante
        const isCurrentlyEmpty = textEl?.classList.contains('empty') || !textEl?.textContent?.trim();
        if (isCurrentlyEmpty && state.currentIndex >= 0 && state.versions[state.currentIndex]) {
            const version = HistoryUtils.normalizeVersion(state.versions[state.currentIndex]);
            this._save();
            this._animateVersionChange(version, 'backward');
            return;
        }

        const version = HistoryUtils.undo(state);
        if (version !== null) {
            this._save();
            this._animateVersionChange(version, 'backward');
        }
    },

    redo() {
        const version = HistoryUtils.redo(this._getState());
        if (version !== null) {
            this._save();
            this._animateVersionChange(version, 'forward');
        }
    },

    clearForResult() {
        const result = this._getResult();
        if (result) {
            const currentPeriod = appState.currentPeriod;
            if (result.historyPerPeriod?.[currentPeriod]) {
                result.historyPerPeriod[currentPeriod] = { versions: [], currentIndex: -1 };
            }
            this._save();
        }
        this._notifyHistoryChange();
    },

    getModificationCount() {
        return HistoryUtils.getModificationCount(this._getState());
    },

    getVersionCount() {
        const state = this._getState();
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
        const state = this._getState();
        const oldIndex = state?.currentIndex ?? 0;
        const version = HistoryUtils.goToVersion(state, index);
        if (version !== null) {
            this._save();
            this._animateVersionChange(version, index < oldIndex ? 'backward' : 'forward');
        }
    },

    showPopover() {
        const indicator = document.getElementById('focusHistoryIndicator');
        const existing = document.getElementById('historyPopover');
        if (existing) {
            existing.remove();
            indicator?.classList.remove('active');
            return;
        }

        const state = this._getState();
        if (!HistoryUtils.hasMultipleVersions(state)) return;

        indicator?._tippy?.hide();
        indicator?.classList.add('active');

        const popover = document.createElement('div');
        popover.id = 'historyPopover';
        popover.className = 'history-popover';

        let html = '<div class="history-popover-title"><iconify-icon icon="solar:history-linear"></iconify-icon> Historique des versions</div>';
        html += '<div class="history-popover-list">';

        for (let i = state.versions.length - 1; i >= 0; i--) {
            const versionData = HistoryUtils.normalizeVersion(state.versions[i]);
            const content = versionData.content;
            const isCurrent = i === state.currentIndex;
            const presentation = this._getVersionPresentation(versionData, i);

            // Format relative timestamp
            let timeHtml = '';
            if (versionData.timestamp) {
                timeHtml = `<span class="history-time">${this._formatRelativeTime(versionData.timestamp)}</span>`;
            }

            const currentBadgeHtml = isCurrent ? '<span class="history-badge-current">Actuelle</span>' : '';
            const itemTitle = isCurrent ? 'Version actuellement affichée' : 'Cliquer pour restaurer';

            html += `
                    <div class="history-version-item ${isCurrent ? 'current' : ''}" data-index="${i}" title="${itemTitle}">
                        <div class="history-version-header">
                            <div class="history-version-title-group">
                                <span class="history-source-icon ${presentation.typeClass}" title="${presentation.tooltip}">
                                    ${presentation.icon}
                                </span>
                                <span class="history-version-label">${presentation.title}</span>
                                ${currentBadgeHtml}
                            </div>
                            ${timeHtml}
                        </div>
                        <span class="history-version-preview">${content}</span>
                    </div>
                `;
        }

        html += '</div>';
        popover.innerHTML = html;

        if (indicator) {
            const rect = indicator.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom - 20;
            const spaceAbove = rect.top - 20;
            const titleHeight = 50;

            popover.style.position = 'fixed';
            popover.style.right = `${window.innerWidth - rect.right}px`;

            // Always choose direction with MORE space
            const placeAbove = spaceAbove > spaceBelow;

            if (placeAbove) {
                popover.style.bottom = `${window.innerHeight - rect.top + 8}px`;
                popover.style.transformOrigin = 'bottom right';
            } else {
                popover.style.top = `${rect.bottom + 8}px`;
                popover.style.transformOrigin = 'top right';
            }

            // Calculate maxHeight based on available space (up to 400px)
            const availableSpace = placeAbove ? spaceAbove : spaceBelow;
            const listEl = popover.querySelector('.history-popover-list');
            if (listEl) {
                const maxListHeight = Math.min(400, Math.max(150, availableSpace - titleHeight));
                listEl.style.maxHeight = `${maxListHeight}px`;
            }
        }

        document.body.appendChild(popover);

        popover.querySelectorAll('.history-version-item').forEach(item => {
            item.addEventListener('click', () => {
                this.restoreVersion(parseInt(item.dataset.index, 10));
                popover.remove();
                indicator?.classList.remove('active');
            });
        });

        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target) && !indicator?.contains(e.target)) {
                    popover.remove();
                    indicator?.classList.remove('active');
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    },

    _animateVersionChange(versionData, direction = 'forward') {
        const textEl = document.getElementById('focusAppreciationText');
        if (!textEl) return;

        const content = versionData.content;
        const appreciationSource = versionData.appreciationSource;

        // Restore ALL metadata on the result BEFORE notifying
        const result = this._getResult();
        if (result) {
            result.appreciation = content;
            const currentPeriod = appState.currentPeriod;
            if (result.studentData?.periods) {
                if (!result.studentData.periods[currentPeriod]) {
                    result.studentData.periods[currentPeriod] = {};
                }
                result.studentData.periods[currentPeriod].appreciation = content;
            }

            // 1. Source Indicator
            if (appreciationSource !== undefined) {
                result.appreciationSource = appreciationSource;
                if (appreciationSource === 'ai') {
                    result.wasGenerated = true; // Restore "Generated" status for dirty logic
                } else if (appreciationSource === 'manual' || appreciationSource === 'imported') {
                    result.wasGenerated = false;
                }
            }

            // 2. AI Model (for tooltip)
            if (versionData.aiModel) {
                if (!result.studentData) result.studentData = {};
                result.studentData.currentAIModel = versionData.aiModel;
            }

            // 3. Token Usage (for tooltip)
            if (versionData.tokenUsage) {
                result.tokenUsage = Utils.deepClone(versionData.tokenUsage);
            }
        }

        // Notify history change immediately for snappy UI feel (updates arrows and x/y badge)
        this._notifyHistoryChange();

        // Prevent overlapping animations by clearing previous timeouts
        if (this._animTimeoutExit) clearTimeout(this._animTimeoutExit);
        if (this._animTimeoutEnter) clearTimeout(this._animTimeoutEnter);

        // Reset classes from any ongoing animation
        textEl.classList.remove('history-animating', 'history-exit-forward', 'history-exit-backward', 'history-enter-forward', 'history-enter-backward');

        // Force reflow to restart CSS animation synchronously
        void textEl.offsetWidth;

        textEl.classList.add('history-animating');
        const exitClass = direction === 'backward' ? 'history-exit-forward' : 'history-exit-backward';
        const enterClass = direction === 'backward' ? 'history-enter-backward' : 'history-enter-forward';

        textEl.classList.add(exitClass);

        this._animTimeoutExit = setTimeout(() => {
            textEl.classList.remove(exitClass);
            textEl.innerHTML = Utils.decodeHtmlEntities(Utils.cleanMarkdown(content));
            textEl.classList.add(enterClass);

            this._notifyContentChange(content);

            this._animTimeoutEnter = setTimeout(() => {
                textEl.classList.remove(enterClass, 'history-animating');
                this._animTimeoutExit = null;
                this._animTimeoutEnter = null;
            }, 280);
        }, 180);
    },

    _notifyContentChange(content) {
        this._callbacks.onContentChange?.(content);
    },

    _notifyHistoryChange() {
        this._callbacks.onHistoryChange?.();
    },

    /**
     * Get user-friendly label, icon, and tooltip for a history version
     * @private
     * @param {Object} versionData
     * @param {number} index
     * @returns {{ title: string, icon: string, typeClass: string, tooltip: string }}
     */
    _getVersionPresentation(versionData, index) {
        const isOriginal = index === 0;
        const source = versionData.source;
        let sourceType = versionData.appreciationSource;

        if (!sourceType) {
            if (source === 'edit') sourceType = 'manual';
            else if (source === 'imported') sourceType = 'imported';
            else if (source === 'dictation') sourceType = 'dictation';
            else if (versionData.aiModel || (isOriginal && versionData.aiModel)) sourceType = 'ai';
            else if (isOriginal) sourceType = 'manual';
            else sourceType = 'manual';
        }

        const modelInfo = versionData.aiModel ? ` (${versionData.aiModel})` : '';

        if (source === 'dictation' || sourceType === 'dictation') {
            return {
                title: 'Dictée vocale',
                icon: '<iconify-icon icon="solar:microphone-3-linear"></iconify-icon>',
                typeClass: 'source-dictation',
                tooltip: 'Saisie par dictée vocale'
            };
        }

        if (source === 'concise') {
            return {
                title: 'Version concise',
                icon: '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>',
                typeClass: 'source-ai',
                tooltip: `Raffinement IA - Plus concise${modelInfo}`
            };
        }

        if (source === 'detailed') {
            return {
                title: 'Version détaillée',
                icon: '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>',
                typeClass: 'source-ai',
                tooltip: `Raffinement IA - Plus détaillée${modelInfo}`
            };
        }

        if (source === 'encouraging') {
            return {
                title: 'Version encourageante',
                icon: '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>',
                typeClass: 'source-ai',
                tooltip: `Raffinement IA - Plus encourageante${modelInfo}`
            };
        }

        if (source === 'variation') {
            return {
                title: 'Variation IA',
                icon: '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>',
                typeClass: 'source-ai',
                tooltip: `Variation générée par IA${modelInfo}`
            };
        }

        if (source === 'regenerate') {
            return {
                title: 'Régénération IA',
                icon: '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>',
                typeClass: 'source-ai',
                tooltip: `Régénéré par IA${modelInfo}`
            };
        }

        if (sourceType === 'ai') {
            return {
                title: isOriginal ? 'Génération initiale' : 'Génération IA',
                icon: '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>',
                typeClass: 'source-ai',
                tooltip: `Généré par IA${modelInfo}`
            };
        }

        if (sourceType === 'imported' || source === 'imported') {
            return {
                title: 'Texte importé',
                icon: '<iconify-icon icon="solar:file-download-linear"></iconify-icon>',
                typeClass: 'source-imported',
                tooltip: 'Importé depuis un fichier'
            };
        }

        if (isOriginal) {
            return {
                title: 'Version initiale',
                icon: '<iconify-icon icon="solar:document-text-linear"></iconify-icon>',
                typeClass: 'source-initial',
                tooltip: 'Texte d\'origine'
            };
        }

        return {
            title: 'Modifié à la main',
            icon: '<iconify-icon icon="solar:pen-linear"></iconify-icon>',
            typeClass: 'source-manual',
            tooltip: 'Rédigé manuellement'
        };
    },

    /**
     * Format a timestamp as relative time in French
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string} Formatted relative time (e.g., "il y a 5 min")
     */
    _formatRelativeTime(timestamp) {
        if (!timestamp) return '';

        const now = Date.now();
        const diff = now - timestamp;

        // Less than 1 minute
        if (diff < 60 * 1000) {
            return 'à l\'instant';
        }

        // Less than 1 hour
        if (diff < 60 * 60 * 1000) {
            const minutes = Math.floor(diff / (60 * 1000));
            return `il y a ${minutes} min`;
        }

        // Less than 24 hours
        if (diff < 24 * 60 * 60 * 1000) {
            const hours = Math.floor(diff / (60 * 60 * 1000));
            return `il y a ${hours}h`;
        }

        // Less than 7 days
        if (diff < 7 * 24 * 60 * 60 * 1000) {
            const days = Math.floor(diff / (24 * 60 * 60 * 1000));
            return `il y a ${days}j`;
        }

        // Older than 7 days - show date
        const date = new Date(timestamp);
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
};
