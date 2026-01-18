/**
 * @fileoverview Focus Panel History Manager
 * UI layer for history management - delegates logic to HistoryUtils
 * @module managers/FocusPanelHistory
 */

import { appState } from '../state/State.js';
import { StorageManager } from './StorageManager.js';
import * as HistoryUtils from '../utils/HistoryUtils.js';

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

    _getState() {
        const result = this._getResult();
        return result ? HistoryUtils.getHistoryState(result) : null;
    },

    _save() {
        StorageManager.saveAppState();
    },

    load(resultId) {
        this._currentResultId = resultId;
        this._getState(); // Initialize if needed
        this._notifyHistoryChange();
    },

    reset() {
        this._currentResultId = null;
        this._notifyHistoryChange();
    },

    push(content, source = 'edit') {
        if (!content) return;
        const textEl = document.getElementById('focusAppreciationText');
        if (textEl?.classList.contains('empty')) return;

        const state = this._getState();
        if (HistoryUtils.pushToState(state, content, source)) {
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
        const content = HistoryUtils.undo(this._getState());
        if (content !== null) {
            this._save();
            this._animateVersionChange(content, 'backward');
        }
    },

    redo() {
        const content = HistoryUtils.redo(this._getState());
        if (content !== null) {
            this._save();
            this._animateVersionChange(content, 'forward');
        }
    },

    clearForResult() {
        const result = this._getResult();
        if (result) {
            result.historyState = { versions: [], currentIndex: -1 };
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

    restoreVersion(index) {
        const state = this._getState();
        const oldIndex = state?.currentIndex ?? 0;
        const content = HistoryUtils.goToVersion(state, index);
        if (content !== null) {
            this._save();
            this._animateVersionChange(content, index < oldIndex ? 'backward' : 'forward');
        }
    },

    showPopover() {
        const state = this._getState();
        if (!HistoryUtils.hasMultipleVersions(state)) return;

        const existing = document.getElementById('historyPopover');
        if (existing) existing.remove();

        const popover = document.createElement('div');
        popover.id = 'historyPopover';
        popover.className = 'history-popover';

        let html = '<div class="history-popover-title">Historique des modifications</div>';
        html += '<div class="history-popover-list">';

        // Source labels for refinement types
        const sourceLabels = {
            'original': null, // No label for original
            'edit': null, // No label for manual edits
            'concise': 'Concise',
            'detailed': 'Détaillée',
            'encouraging': 'Encourageante',
            'variation': 'Variation',
            'regenerate': 'Régénéré'
        };

        for (let i = state.versions.length - 1; i >= 0; i--) {
            const versionData = HistoryUtils.normalizeVersion(state.versions[i]);
            const content = versionData.content;
            // Let CSS line-clamp handle truncation - no manual substring needed
            const isCurrent = i === state.currentIndex;
            const isOriginal = i === 0;
            const label = isOriginal ? 'Original' : `Modif. ${i}`;

            // Calculate word count diff from previous version
            let wordDiffHtml = '';
            if (i > 0) {
                const prevVersion = HistoryUtils.normalizeVersion(state.versions[i - 1]);
                const diff = versionData.wordCount - prevVersion.wordCount;
                if (diff !== 0) {
                    const sign = diff > 0 ? '+' : '';
                    const diffClass = diff > 0 ? 'positive' : 'negative';
                    wordDiffHtml = `<span class="history-word-diff ${diffClass}">${sign}${diff}</span>`;
                }
            }

            // Format relative timestamp
            let timeHtml = '';
            if (versionData.timestamp) {
                timeHtml = `<span class="history-time">${this._formatRelativeTime(versionData.timestamp)}</span>`;
            }

            // Source label (for refinements)
            let sourceHtml = '';
            const sourceLabel = sourceLabels[versionData.source];
            if (sourceLabel) {
                sourceHtml = `<span class="history-source">${sourceLabel}</span>`;
            }

            // Separator before Original
            const separatorClass = isOriginal ? 'history-version-item--original' : '';

            html += `
                <div class="history-version-item ${isCurrent ? 'current' : ''} ${separatorClass}" data-index="${i}">
                    <div class="history-version-header">
                        <span class="history-version-label">${label}</span>
                        ${sourceHtml}
                        ${wordDiffHtml}
                        ${timeHtml}
                    </div>
                    <span class="history-version-preview">${content}</span>
                </div>
            `;
        }

        html += '</div>';
        popover.innerHTML = html;

        const indicator = document.getElementById('focusHistoryIndicator');
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
            });
        });

        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target)) {
                    popover.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    },

    _animateVersionChange(content, direction = 'forward') {
        const textEl = document.getElementById('focusAppreciationText');
        if (!textEl || textEl.classList.contains('history-animating')) return;

        textEl.classList.add('history-animating');
        const exitClass = direction === 'backward' ? 'history-exit-forward' : 'history-exit-backward';
        const enterClass = direction === 'backward' ? 'history-enter-backward' : 'history-enter-forward';

        textEl.classList.add(exitClass);

        setTimeout(() => {
            textEl.classList.remove(exitClass);
            textEl.textContent = content;
            textEl.classList.add(enterClass);

            this._notifyContentChange(content);
            this._notifyHistoryChange();

            setTimeout(() => {
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
