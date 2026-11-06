/**
 * @fileoverview List View Manager - Rend les élèves en vue tableau
 * Part of Liste + Focus UX Revolution - REFACTORED: Inline Appreciation Display
 * @module managers/ListViewManager
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
// ResultCardsUI removed - logic moved to Utils
import { StatsUI } from './StatsUIManager.js';
import { HistoryManager } from './HistoryManager.js';
import { ListSelectionManager } from './list/ListSelectionManager.js';
import { ListViewRenderer } from './list/ListViewRenderer.js';
import { ListViewAnimations } from './list/ListViewAnimations.js';
import { ListViewEvents } from './list/ListViewEvents.js';
import { UI } from './UIManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { StorageManager } from './StorageManager.js';
import { ClassManager } from './ClassManager.js';
import { ResultsUIManager } from './ResultsUIManager.js';
import { AppreciationsManager } from './AppreciationsManager.js';

/** Délai court (ms) avant la première ligne d'un import : démarre dès le début du retrait de la modale sans trou noir */
const IMPORT_REVEAL_START_DELAY_MS = 40;

/**
 * Module de gestion de la vue Liste (tableau des élèves)
 * @namespace ListViewManager
 */
export const ListViewManager = {
    // Renderer Proxies
    _createRowElement(r, p, c) { return ListViewRenderer.createRowElement(r, p, c); },
    _updateRowContent(row, res) { ListViewRenderer.updateRowContent(row, res); },
    updateStudentRow(id) { return ListViewRenderer.updateStudentRow(id); },
    _renderFresh(c, r, p, idx, options) { ListViewRenderer.renderFresh(c, r, p, idx, options); },
    _updateHeaderSortIcons(v) { ListViewRenderer.updateHeaderSortIcons(v); },
    _getAppreciationSkeletonHTML(label, pending) { return ListViewRenderer.getAppreciationSkeletonHTML(label, pending); },
    _getStudentStatusCellContent(result) { return ListViewRenderer.getStudentStatusCellContent(result); },
    _getAppreciationCell(result) { return ListViewRenderer.getAppreciationCell(result); },
    _getStatusBadge(status) { return ListViewRenderer.getStatusBadge(status); },

    // Inject dependencies into SelectionManager
    initSelectionManager() {
        ListSelectionManager?.init?.({
            updateStudentRow: (id) => this.updateStudentRow(id),
            setRowStatus: (id, status) => this.setRowStatus(id, status),
            renderList: () => this.render(appState.filteredResults, document.getElementById('outputList'))
        });
    },

    // Proxies for UI interactions
    _handleSelectionInteraction(id, e) { ListSelectionManager.handleSelectionInteraction(id, e); },
    toggleSelection(id) { ListSelectionManager.toggleSelection(id); },
    toggleSelectVisible(all) { ListSelectionManager.toggleSelectVisible(all); },
    clearSelections() { ListSelectionManager.clearSelections(); },
    _copySingleAppreciation(id) { ListSelectionManager.copySingleAppreciation(id); },
    _bulkReset(ids) { ListSelectionManager.bulkReset(ids); },

    _lastRenderedClassId: null, // Track class changes to force fresh render
    _lastRenderedPeriod: null,  // Track period changes to force fresh render (header column count changes)
    _pendingImportReveal: null, // Pending progressive import reveal metadata
    _activeImportRenderGuard: false, // Prevents synchronous duplicate renderResults() calls from cancelling import animations

    /**
     * Prépare une animation d'entrée progressive pour le rendu post-import qui suit immédiatement.
     * La demande expire à la fin du tick courant si aucun rendu de liste ne la consomme.
     * @param {Object} [meta={}]
     * @param {Iterable<string>} [meta.newIds] - IDs des nouveaux élèves créés
     * @param {Iterable<string>} [meta.updatedIds] - IDs des élèves mis à jour
     * @param {Iterable<string>} [meta.photoIds] - IDs des élèves ayant reçu une photo
     * @param {number} [meta.startDelay] - Délai avant la première ligne (ms), aligné sur la fermeture de la modale
     */
    prepareImportReveal(meta = {}) {
        const reveal = {
            newIds: new Set(meta.newIds || []),
            updatedIds: new Set(meta.updatedIds || []),
            photoIds: new Set(meta.photoIds || []),
            startDelay: meta.startDelay ?? IMPORT_REVEAL_START_DELAY_MS
        };
        this._pendingImportReveal = reveal;
        this._activeImportRenderGuard = false;
        queueMicrotask(() => {
            if (this._pendingImportReveal === reveal) this._pendingImportReveal = null;
        });
    },

    /**
     * Retourne la demande d'animation post-import en attente, sans la consommer
     * @returns {Object|null}
     */
    getPendingImportReveal() {
        return this._pendingImportReveal;
    },

    /**
     * Rend la liste des élèves en format tableau
     * @param {Array} results - Tableau des résultats à afficher
     * @param {HTMLElement} container - Conteneur DOM
     */
    render(results, container) {
        if (!container) return;

        const existingTable = container.querySelector('.student-list-view:not(.skeleton-table-view) .student-list-table');

        // Prevent redundant synchronous re-renders (e.g. direct renderResults() + studentsUpdated/classChanged)
        // from cancelling ongoing import entrance/FLIP animations in the same tick
        if (this._activeImportRenderGuard && existingTable && results.length > 0) {
            return;
        }

        // Cancel any pending filter animation to prevent race conditions
        if (ListViewAnimations.state.activeFilterTimeout) {
            clearTimeout(ListViewAnimations.state.activeFilterTimeout);
            ListViewAnimations.state.activeFilterTimeout = null;
        }

        const importReveal = this._pendingImportReveal;
        this._pendingImportReveal = null;

        if (importReveal && results.length > 0) {
            this._activeImportRenderGuard = true;
            queueMicrotask(() => {
                this._activeImportRenderGuard = false;
            });
        }

        const tbody = existingTable ? existingTable.querySelector('tbody') : null;
        const currentClassId = appState.currentClassId;

        // Handle completely empty class (no students in class at all)
        if (results.length === 0) {
            const remainingInClass = ClassManager.getStudentsForClass(currentClassId).length;
            if (remainingInClass === 0) {
                AppreciationsManager?.renderResults?.();
                return;
            }
        }

        const currentPeriod = appState.currentPeriod;
        const periods = Utils.getPeriods() || ['T1', 'T2', 'T3'];
        const currentPeriodIndex = Math.max(0, periods.indexOf(currentPeriod));

        // CRITICAL FIX: Force fresh render when class or period changes
        // Class change: ensures event listeners are properly attached
        // Period change: ensures header columns match data cells (T1/T2/T3 column count varies)
        const previousPeriod = this._lastRenderedPeriod;
        const classChanged = this._lastRenderedClassId !== null && this._lastRenderedClassId !== currentClassId;
        const periodChanged = this._lastRenderedPeriod !== null && this._lastRenderedPeriod !== currentPeriod;

        this._lastRenderedClassId = currentClassId;
        this._lastRenderedPeriod = currentPeriod;

        if (classChanged || periodChanged) {
            // Class or period changed - force fresh render to ensure header/cell alignment
            ListViewAnimations.resetHeightTransition();
            this.clearSelections(); // Reset selections on class/period change
            const previousIndex = (periodChanged && previousPeriod) ? periods.indexOf(previousPeriod) : -1;
            const isRetreating = periodChanged && !classChanged && previousIndex !== -1 && currentPeriodIndex < previousIndex;
            const isAdvancing = periodChanged && !classChanged && previousIndex !== -1 && currentPeriodIndex > previousIndex;
            this._renderFresh(container, results, periods, currentPeriodIndex, {
                isPeriodSwitch: periodChanged && !classChanged,
                previousPeriod,
                currentPeriod,
                isRetreating,
                isAdvancing,
                previousIndex,
                importReveal
            });
            if (results.length === 0) {
                ResultsUIManager?.updateGenerateButtonState?.();
            }
            return;
        }

        // Check if this is a filter/sort transition (table already exists)
        const existingRows = existingTable ? Array.from(existingTable.querySelectorAll('.student-row')) : [];

        existingTable?.closest('.student-list-view')?.classList.remove('table-fade-in');

        if (existingTable) {
            const existingIds = existingRows.map(r => r.dataset.studentId);
            const newIdsSet = new Set(results.map(r => r.id));

            // Clean up any stuck animation classes from previous animations
            // Preserve 'row-exit' on rows that are still exiting to avoid a visible flash during rapid typing
            existingRows.forEach(row => {
                row.classList.remove('row-move', 'row-moving', 'row-filter-enter', 'row-import-refresh', 'row-animate-in', 'row-stagger-enter');
                if (newIdsSet.has(row.dataset.studentId)) {
                    row.classList.remove('row-exit');
                }
                row.style.transform = '';
                row.style.transition = '';
            });

            const hasIdChange = existingIds.length !== newIdsSet.size ||
                existingIds.some(id => !newIdsSet.has(id));

            if (hasIdChange) {
                // Filter change (including N -> 0 and 0 -> N): use FLIP & height transition
                ListViewAnimations.animateFilterTransition(container, existingRows, results, periods, currentPeriodIndex, importReveal);
            } else if (results.length === 0) {
                // Already 0 student rows in DOM (0 -> 0): ensure empty-state-row is present
                if (tbody && !tbody.querySelector('.empty-state-row')) {
                    const headerThs = existingTable.querySelectorAll('thead th');
                    const colCount = headerThs.length || 7;
                    tbody.innerHTML = ListViewRenderer.getEmptyStateRowHTML(colCount);
                }
            } else {
                // Sort or data update with identical student IDs: reorder & soft-update in place
                ListViewAnimations.animateSortTransition(container, existingRows, results, periods, currentPeriodIndex, importReveal);
            }

            if (results.length === 0) {
                ResultsUIManager?.updateGenerateButtonState?.();
            }
            return;
        }

        // === INITIAL RENDER (no existing table) ===
        this._renderFresh(container, results, periods, currentPeriodIndex, { importReveal });
        if (results.length === 0) {
            ResultsUIManager?.updateGenerateButtonState?.();
        }
    },

    // ListViewAnimations methods extracted

    // ListViewRenderer methods extracted

    // ListViewEvents methods extracted

    /**
     * Updates the status of a specific row (e.g., to show a skeleton loader).
     * @param {string} studentId - The ID of the student.
     * @param {string} status - The new status ('generating', 'pending-skeleton', 'pending', etc.).
     * @param {string} [label] - Optional custom label for the skeleton badge.
     */
    setRowStatus(studentId, status, label) {
        const row = document.querySelector(`.student-row[data-student-id="${studentId}"]`);
        if (!row) return;

        const appreciationCell = row.querySelector('.appreciation-cell');
        if (!appreciationCell) return;

        ListViewRenderer.clearCellCollapseTimers(appreciationCell);

        const actionBtn = row.querySelector('.btn-action-menu');

        if (status === 'generating') {
            appreciationCell.innerHTML = this._getAppreciationSkeletonHTML(label || 'Génération...', false);
            if (actionBtn) actionBtn.disabled = true;
        } else if (status === 'pending-skeleton') {
            const existingWrapper = appreciationCell.querySelector('.appreciation-preview-wrapper');
            const hasExistingText = Boolean(existingWrapper?.querySelector('.appreciation-preview')?.textContent?.trim());

            if (existingWrapper && hasExistingText) {
                existingWrapper.classList.add('is-queued');
                let badge = existingWrapper.querySelector('.generating-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    existingWrapper.appendChild(badge);
                }
                badge.className = 'generating-badge pending';
                badge.innerHTML = `<iconify-icon icon="solar:clock-circle-linear"></iconify-icon> ${Utils.escapeHtml(label || 'En file')}`;
            } else {
                appreciationCell.innerHTML = this._getAppreciationSkeletonHTML(label || 'En file', true);
            }
            if (actionBtn) actionBtn.disabled = true;
        } else {
            // Revert to standard badge if needed (though usually updateRow is called next)
            appreciationCell.innerHTML = this._getStatusBadge(status);
            if (actionBtn) actionBtn.disabled = false;
        }
    },

    /**
     * Updates a specific row with new result data and triggers animation.
     * @param {string} studentId - The ID of the student.
     * @param {Object} result - The updated result object.
     * @param {boolean} [animate=false] - Whether to use the typewriter effect.
     */
    async updateRow(studentId, result, animate = false) {
        ResultsUIManager?.updateGenerateButtonState?.();

        const row = document.querySelector(`.student-row[data-student-id="${studentId}"]`);
        if (!row) return;

        const appreciationCell = row.querySelector('.appreciation-cell');
        if (!appreciationCell) return;

        ListViewRenderer.clearCellCollapseTimers(appreciationCell);

        const statusCell = row.querySelector('.status-cell');

        // Determine status for this result
        // Update status cell
        if (statusCell) {
            statusCell.innerHTML = this._getStudentStatusCellContent(result);
        }

        // 1. Get the appreciation text
        const currentPeriod = appState.currentPeriod;
        let appreciation = '';

        // Logic duplicated from _getAppreciationCell because we need the raw text for typewriter
        const periodApp = result.studentData?.periods?.[currentPeriod]?.appreciation;
        if (periodApp && typeof periodApp === 'string' && periodApp.trim()) {
            appreciation = periodApp.trim();
        } else if (result.appreciation && typeof result.appreciation === 'string' && result.appreciation.trim()) {
            const generationPeriod = result.generationPeriod || result.aiGenerationPeriod;
            if (generationPeriod === currentPeriod) {
                appreciation = result.appreciation.trim();
            }
        }

        const decoded = Utils.decodeHtmlEntities(appreciation);
        const cleanText = decoded.replace(/<[^>]*>/g, '').trim();

        // 2. Render content
        if (animate && cleanText) {
            if (UI?.fadeOutSkeleton) {
                await UI.fadeOutSkeleton(appreciationCell);
            }
            // Create container for typewriter with expanded class for full text during animation
            appreciationCell.innerHTML = `<div class="appreciation-preview expanded"></div>`;
            const targetEl = appreciationCell.querySelector('.appreciation-preview');

            // Use UI Manager's HTML reveal effect
            if (UI?.animateHtmlReveal) {
                await UI.animateHtmlReveal(targetEl, cleanText, { speed: 'fast' });
            } else {
                targetEl.textContent = cleanText;
            }

            // Remove title attribute to avoid unwanted tooltips
            targetEl.removeAttribute('title');

            // Add "just generated" flash effect to the row
            row.classList.add('just-generated');
            setTimeout(() => row.classList.remove('just-generated'), 1000);

            // Smooth collapse - animate the CELL height for smooth row transition
            appreciationCell._collapseTimer = setTimeout(() => {
                appreciationCell._collapseTimer = null;
                if (!targetEl.isConnected) return;
                // 1. Capture current cell height (determines row height)
                const cellExpandedHeight = appreciationCell.offsetHeight;
                appreciationCell.style.height = cellExpandedHeight + 'px';
                appreciationCell.style.overflow = 'hidden';
                appreciationCell.style.boxSizing = 'border-box';

                // 2. Fade out content
                targetEl.style.opacity = '0.3';
                targetEl.style.transition = 'opacity 0.4s ease-out';

                // 3. After fade, switch content to compact and animate cell height
                appreciationCell._collapseInnerTimer = setTimeout(() => {
                    appreciationCell._collapseInnerTimer = null;
                    if (!targetEl.isConnected) return;
                    // Switch to compact mode
                    targetEl.classList.remove('expanded');
                    targetEl.style.opacity = '1';

                    // Measure new compact height
                    appreciationCell.style.height = 'auto';
                    const cellCompactHeight = appreciationCell.offsetHeight;

                    // Reset to expanded and animate
                    appreciationCell.style.height = cellExpandedHeight + 'px';
                    appreciationCell.offsetHeight; // Force reflow

                    // Animate cell height (this controls row height)
                    appreciationCell.style.transition = 'height 0.8s cubic-bezier(0.32, 0.72, 0, 1)';
                    appreciationCell.style.height = cellCompactHeight + 'px';

                    // Clean up after animation
                    appreciationCell._collapseCleanupTimer = setTimeout(() => {
                        appreciationCell._collapseCleanupTimer = null;
                        appreciationCell.style.height = '';
                        appreciationCell.style.overflow = '';
                        appreciationCell.style.boxSizing = '';
                        appreciationCell.style.transition = '';
                        targetEl.style.transition = '';
                    }, 900);
                }, 400);
            }, 2000);

        } else {
            // Standard render
            appreciationCell.innerHTML = this._getAppreciationCell(result);
        }

        const actionBtn = row.querySelector('.btn-action-menu');
        if (actionBtn) actionBtn.disabled = false;
    },

    // _getAppreciationSkeletonHTML extracted

    /**
     * Toggle appreciation content mode (Truncated -> Full View)
     * @param {HTMLElement} listContainer - The list container element
     * @private
     */
    _toggleAppreciationColumn(listContainer) {
        const table = listContainer.classList.contains('student-list-table')
            ? listContainer
            : listContainer.querySelector('.student-list-table');
        if (!table) return;

        const isFullView = table.classList.contains('appreciation-full-view');
        const header = table.querySelector('.appreciation-toggle-header');
        const icon = header?.querySelector('.appreciation-toggle-icon');
        const mobileBtn = listContainer.querySelector('#mobileCompactToggleBtn');
        const mobileIcon = mobileBtn?.querySelector('iconify-icon');

        const nextIsFull = !isFullView;

        // Toggle CSS classes
        table.classList.toggle('appreciation-full-view', nextIsFull);
        header?.classList.toggle('expanded-view', nextIsFull);

        // Update Tooltips
        const tooltipText = nextIsFull ? 'Réduire' : 'Voir tout le texte';
        const toggleBtn = header?.querySelector('#appreciationToggleBtn');
        if (toggleBtn) {
            TooltipsUI.updateTooltip(toggleBtn, tooltipText);
            toggleBtn.setAttribute('aria-label', tooltipText);
        }
        if (mobileBtn) {
            TooltipsUI.updateTooltip(mobileBtn, tooltipText);
            mobileBtn.removeAttribute('title');
        }

        // Update Icons
        const iconName = nextIsFull ? 'solar:minimize-square-linear' : 'solar:maximize-square-linear';
        icon?.setAttribute('icon', iconName);
        mobileIcon?.setAttribute('icon', iconName);

        // Update State & Persistence
        appState.isAppreciationFullView = nextIsFull;
        StorageManager.saveAppState();
    }
};


// Initialize the selection manager bindings
ListViewManager.initSelectionManager();
ListViewRenderer?.init?.({
    attachEventListeners: (el) => ListViewEvents.attachEventListeners(el)
});
ListViewAnimations?.init?.({
    renderFresh: (c, r, p, idx) => ListViewRenderer.renderFresh(c, r, p, idx),
    updateHeaderSortIcons: (v) => ListViewRenderer.updateHeaderSortIcons(v)
});
ListViewEvents?.init?.({
    copySingleAppreciation: (id) => ListViewManager._copySingleAppreciation(id),
    bulkReset: (ids) => ListViewManager._bulkReset(ids),
    deleteStudent: (id) => ListSelectionManager.confirmAndDeleteStudents([id]),
    toggleAppreciationColumn: (c) => ListViewManager._toggleAppreciationColumn(c),
    handleSelectionInteraction: (id, e) => ListSelectionManager.handleSelectionInteraction(id, e),
    clearSelections: () => ListSelectionManager.clearSelections(),
    handleBulkAction: (action) => ListSelectionManager.handleBulkAction(action),
    toggleSelectVisible: (all) => ListSelectionManager.toggleSelectVisible(all),
    updateHeaderSortIcons: (v) => ListViewRenderer.updateHeaderSortIcons(v),
    hasSelections: () => ListSelectionManager.selectedIds.size > 0
});
