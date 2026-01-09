/**
 * @fileoverview Focus Panel History Manager
 * Handles undo/redo functionality for appreciation editing
 * Extracted from FocusPanelManager for better maintainability
 * @module managers/FocusPanelHistory
 */

/**
 * History system for appreciation undo/redo
 * @namespace FocusPanelHistory
 */
export const FocusPanelHistory = {
    /**
     * History state object
     * @private
     */
    _history: {
        versions: [],
        currentIndex: -1,
        maxVersions: 10
    },

    /**
     * Callback functions set by parent manager
     * @private
     */
    _callbacks: {
        onContentChange: null,
        onHistoryChange: null
    },

    /**
     * Initialize with callbacks from parent manager
     * @param {Object} callbacks - Callback functions
     * @param {Function} callbacks.onContentChange - (content) => void
     * @param {Function} callbacks.onHistoryChange - () => void
     */
    init(callbacks = {}) {
        this._callbacks = { ...this._callbacks, ...callbacks };
    },

    /**
     * Push content to history before making changes
     * @param {string} content - The content to save
     */
    push(content) {
        if (!content || document.getElementById('focusAppreciationText')?.classList.contains('empty')) return;

        const history = this._history;

        // If we're not at the end, truncate future versions
        if (history.currentIndex < history.versions.length - 1) {
            history.versions = history.versions.slice(0, history.currentIndex + 1);
        }

        // Don't add if same as last version
        const lastVersion = history.versions[history.versions.length - 1];
        if (lastVersion === content) return;

        // Add new version
        history.versions.push(content);

        // Limit to max versions
        if (history.versions.length > history.maxVersions) {
            history.versions.shift();
        }

        history.currentIndex = history.versions.length - 1;
        this._notifyHistoryChange();
    },

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this._history.currentIndex > 0;
    },

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this._history.currentIndex < this._history.versions.length - 1;
    },

    /**
     * Undo to previous version
     */
    undo() {
        if (!this.canUndo()) return;

        this._history.currentIndex--;
        const content = this._history.versions[this._history.currentIndex];
        this._animateVersionChange(content, 'backward');
    },

    /**
     * Redo to next version
     */
    redo() {
        if (!this.canRedo()) return;

        this._history.currentIndex++;
        const content = this._history.versions[this._history.currentIndex];
        this._animateVersionChange(content, 'forward');
    },

    /**
     * Clear or restore history
     * @param {Object|null} savedHistory - Optional saved history to restore
     */
    clear(savedHistory = null) {
        this._history = savedHistory ? JSON.parse(JSON.stringify(savedHistory)) : {
            versions: [],
            currentIndex: -1,
            maxVersions: 10
        };
        this._notifyHistoryChange();
    },

    /**
     * Get current history state (for saving)
     * @returns {Object}
     */
    getState() {
        return JSON.parse(JSON.stringify(this._history));
    },

    /**
     * Get modification count
     * @returns {number}
     */
    getModificationCount() {
        return Math.max(0, this._history.versions.length - 1);
    },

    /**
     * Restore a specific version from history
     * @param {number} index - Version index
     */
    restoreVersion(index) {
        const history = this._history;
        if (index < 0 || index >= history.versions.length) return;

        const direction = index < history.currentIndex ? 'backward' : 'forward';
        history.currentIndex = index;
        const content = history.versions[index];
        this._animateVersionChange(content, direction);
    },

    /**
     * Show history popover with all versions
     */
    showPopover() {
        const history = this._history;
        if (history.versions.length <= 1) return;

        // Remove existing popover
        const existingPopover = document.getElementById('historyPopover');
        if (existingPopover) existingPopover.remove();

        // Create popover
        const popover = document.createElement('div');
        popover.id = 'historyPopover';
        popover.className = 'history-popover';

        let html = '<div class="history-popover-title">Historique des modifications</div>';
        html += '<div class="history-popover-list">';

        // Show versions in reverse order (newest first)
        for (let i = history.versions.length - 1; i >= 0; i--) {
            const version = history.versions[i];
            const preview = version.substring(0, 80) + (version.length > 80 ? '...' : '');
            const isCurrent = i === history.currentIndex;
            const label = i === 0 ? 'Original' : `Modif. ${i}`;

            html += `
                <div class="history-version-item ${isCurrent ? 'current' : ''}" data-index="${i}">
                    <span class="history-version-label">${label}</span>
                    <span class="history-version-preview">${preview}</span>
                </div>
            `;
        }

        html += '</div>';
        popover.innerHTML = html;

        // Position near the indicator
        const indicator = document.getElementById('focusHistoryIndicator');
        if (indicator) {
            const rect = indicator.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom - 20;
            const spaceAbove = rect.top - 20;
            const minSpaceNeeded = 200;

            let placement = 'bottom';
            let maxListHeight = 300;

            if (spaceBelow < minSpaceNeeded && spaceAbove > spaceBelow) {
                placement = 'top';
                maxListHeight = Math.min(300, spaceAbove - 60);
            } else {
                maxListHeight = Math.min(300, spaceBelow - 60);
            }

            popover.style.position = 'fixed';
            if (placement === 'bottom') {
                popover.style.top = `${rect.bottom + 8}px`;
                popover.style.transformOrigin = 'top right';
            } else {
                popover.style.bottom = `${window.innerHeight - rect.top + 8}px`;
                popover.style.transformOrigin = 'bottom right';
            }
            popover.style.right = `${window.innerWidth - rect.right}px`;

            const listEl = popover.querySelector('.history-popover-list');
            if (listEl) {
                listEl.style.maxHeight = `${Math.max(100, maxListHeight)}px`;
            }
        }

        document.body.appendChild(popover);

        // Add click handlers
        popover.querySelectorAll('.history-version-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index, 10);
                this.restoreVersion(index);
                popover.remove();
            });
        });

        // Close on outside click
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

    /**
     * Animate version change with iOS-style transition
     * @param {string} content - The new content
     * @param {'forward'|'backward'} direction - Animation direction
     * @private
     */
    _animateVersionChange(content, direction = 'forward') {
        const appreciationText = document.getElementById('focusAppreciationText');
        if (!appreciationText) return;

        // Prevent multiple simultaneous animations
        if (appreciationText.classList.contains('history-animating')) return;
        appreciationText.classList.add('history-animating');

        // Apply exit animation
        const exitClass = direction === 'backward' ? 'history-exit-forward' : 'history-exit-backward';
        const enterClass = direction === 'backward' ? 'history-enter-backward' : 'history-enter-forward';

        appreciationText.classList.add(exitClass);

        // After exit animation, update content and animate back in
        setTimeout(() => {
            appreciationText.classList.remove(exitClass);
            appreciationText.textContent = content;
            appreciationText.classList.add(enterClass);

            // Notify parent of content change
            this._notifyContentChange(content);
            this._notifyHistoryChange();

            // Clean up
            setTimeout(() => {
                appreciationText.classList.remove(enterClass, 'history-animating');
            }, 280);
        }, 180);
    },

    /**
     * Notify parent of content change
     * @param {string} content
     * @private
     */
    _notifyContentChange(content) {
        if (this._callbacks.onContentChange) {
            this._callbacks.onContentChange(content);
        }
    },

    /**
     * Notify parent of history state change
     * @private
     */
    _notifyHistoryChange() {
        if (this._callbacks.onHistoryChange) {
            this._callbacks.onHistoryChange();
        }
    }
};
