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
import { ClassUIManager } from './ClassUIManager.js';
import { StatsUI } from './StatsUIManager.js';
import { HistoryManager } from './HistoryManager.js';
import { ListSelectionManager } from './list/ListSelectionManager.js';
import { ListViewRenderer } from './list/ListViewRenderer.js';
import { ListViewAnimations } from './list/ListViewAnimations.js';
import { ListViewEvents } from './list/ListViewEvents.js';
import { UI } from './UIManager.js';
import { ModalUI } from './ModalUIManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { StudentDataManager } from './StudentDataManager.js';
import { StorageManager } from './StorageManager.js';

/**
 * Module de gestion de la vue Liste (tableau des Ã©lÃ¨ves)
 * @namespace ListViewManager
 */
export const ListViewManager = {
    // Renderer Proxies
    _createRowElement(r, p, c) { return ListViewRenderer.createRowElement(r, p, c); },
    _updateRowContent(row, res) { ListViewRenderer.updateRowContent(row, res); },
    updateStudentRow(id) { return ListViewRenderer.updateStudentRow(id); },
    _renderFresh(c, r, p, idx) { ListViewRenderer.renderFresh(c, r, p, idx); },
    _updateHeaderSortIcons(v) { ListViewRenderer.updateHeaderSortIcons(v); },
    _getAppreciationSkeletonHTML() { return ListViewRenderer.getAppreciationSkeletonHTML(); },
    _getStudentStatusCellContent(result) { return ListViewRenderer.getStudentStatusCellContent(result); },
    _getAppreciationCell(result) { return ListViewRenderer.getAppreciationCell(result); },
    _getStatusBadge(status) { return ListViewRenderer.getStatusBadge(status); },

    // Inject dependencies into SelectionManager
    initSelectionManager() {
        ListSelectionManager.init({
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
    _activeFilterTimeout: null, // Track filter animation timeout to prevent race conditions

    /**
     * Rend la liste des élèves en format tableau
     * @param {Array} results - Tableau des résultats à afficher
     * @param {HTMLElement} container - Conteneur DOM
     */
    render(results, container) {
        // Cancel any pending filter animation to prevent race conditions
        if (ListViewAnimations.state.activeFilterTimeout) {
            clearTimeout(ListViewAnimations.state.activeFilterTimeout);
            ListViewAnimations.state.activeFilterTimeout = null;
        }

        // Cleanup previous document listener handled in _attachEventListeners
        // [FIX] Listener is no longer removed here to prevent losing "click outside"
        // functionality during soft updates (sort/reorder) that don't re-attach listeners.

        if (!container) return;

        const existingTable = container.querySelector('.student-list-table');
        const tbody = existingTable ? existingTable.querySelector('tbody') : null;

        // Handle empty results
        if (results.length === 0) {
            if (existingTable && tbody) {
                const emptyRowHtml = `
                    <tr class="empty-state-row">
                        <td colspan="100%" style="text-align:center; padding: 40px; color: var(--text-tertiary);">
                            <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                                <iconify-icon icon="solar:magnifer-linear" style="font-size:24px; opacity:0.5;"></iconify-icon>
                                <span>Aucun élève trouvé</span>
                            </div>
                        </td>
                    </tr>
                `;

                // If table exists, just clear rows but KEEP structure (and search bar!)
                const existingRows = tbody.querySelectorAll('.student-row');
                if (existingRows.length > 0) {
                    ListViewAnimations.animateRowsOut(existingRows, () => {
                        tbody.innerHTML = emptyRowHtml;
                    });
                } else if (!tbody.querySelector('.empty-state-row')) {
                    tbody.innerHTML = emptyRowHtml;
                }
                return;
            } else {
                // No table yet, render empty state (will create table structure in _renderFresh if needed, or we can handle it here)
                // For consistency, we might need a table structure even for empty state to show search bar
                // But if it's the very first render and empty, maybe we don't need search bar? 
                // Actually, if we want search bar to be available, we should probably render the full structure even if empty.
                // For now, let's fall through to _renderFresh which creates the table.
            }
        }

        const currentPeriod = appState.currentPeriod;
        const periods = Utils.getPeriods() || ['T1', 'T2', 'T3'];
        const currentPeriodIndex = Math.max(0, periods.indexOf(currentPeriod));

        // CRITICAL FIX: Force fresh render when class or period changes
        // Class change: ensures event listeners are properly attached
        // Period change: ensures header columns match data cells (T1/T2/T3 column count varies)
        const currentClassId = appState.currentClassId;
        const classChanged = this._lastRenderedClassId !== null && this._lastRenderedClassId !== currentClassId;
        const periodChanged = this._lastRenderedPeriod !== null && this._lastRenderedPeriod !== currentPeriod;

        this._lastRenderedClassId = currentClassId;
        this._lastRenderedPeriod = currentPeriod;

        if (classChanged || periodChanged) {
            // Class or period changed - force fresh render to ensure header/cell alignment
            this.clearSelections(); // Reset selections on class/period change
            this._renderFresh(container, results, periods, currentPeriodIndex);
            return;
        }

        // Check if this is a filter/sort transition (table already exists)
        // existingTable is already defined above
        const existingRows = existingTable ? Array.from(existingTable.querySelectorAll('.student-row')) : [];

        // Clean up any stuck animation classes from previous animations
        existingRows.forEach(row => {
            row.classList.remove('row-move', 'row-moving', 'row-exit', 'row-filter-enter');
            row.style.transform = '';
            row.style.transition = '';
        });

        if (existingTable) {
            const existingIds = existingRows.map(r => r.dataset.studentId);
            const newIds = results.map(r => r.id);

            // Check if there's any actual change
            const hasIdChange = existingIds.length !== newIds.length ||
                existingIds.some(id => !newIds.includes(id)) ||
                newIds.some(id => !existingIds.includes(id));

            const hasOrderChange = !hasIdChange &&
                existingIds.some((id, i) => id !== newIds[i]);

            if (hasIdChange) {
                // Remove empty state row if present (important for 0 -> N transition)
                const emptyRow = container.querySelector('.empty-state-row');
                if (emptyRow) emptyRow.remove();

                // Filter change: use FLIP animation
                ListViewAnimations.animateFilterTransition(container, existingRows, results, periods, currentPeriodIndex);
                return;
            } else if (hasOrderChange) {
                // Sort change: use simple reorder
                ListViewAnimations.animateSortTransition(container, existingRows, results, periods, currentPeriodIndex);
                return;
            } else {
                // Data updated but same IDs and order - Perform soft update to preserve DOM
                ListViewAnimations.animateSortTransition(container, existingRows, results, periods, currentPeriodIndex);
                return;
            }
        }

        // === INITIAL RENDER (no existing table) ===
        this._renderFresh(container, results, periods, currentPeriodIndex);
    },

    // ListViewAnimations methods extracted

    // ListViewRenderer methods extracted

    // ListViewEvents methods extracted

    /**
     * Supprime un élève avec confirmation
     * @param {string} studentId - ID de l'élève
     * @param {HTMLElement} row - Ligne du tableau
     * @private
     */
    async _deleteStudent(studentId, row) {
        const student = appState.generatedResults.find(r => r.id === studentId);
        if (!student) return;

        const studentName = `${student.prenom} ${student.nom}`;

        // Confirmation via modale personnalisée
        const confirmed = await ModalUI.showCustomConfirm(
            `Êtes-vous sûr de vouloir supprimer définitivement <strong>${studentName}</strong> ?<br>Cette action est irréversible.`,
            null,
            null,
            {
                title: 'Supprimer l\'élève ?',
                confirmText: 'Supprimer',
                cancelText: 'Annuler',
                isDanger: true
            }
        );

        if (!confirmed) return;

        // Use standard data manager
        await StudentDataManager.deleteStudent(studentId);

        // Save state
        await StorageManager.saveAppState();

        // Render with standard FLIP animation
        this.render(appState.filteredResults, document.getElementById('outputList'));

        // Update global UI
        ClassUIManager.updateStudentCount();
        UI?.populateLoadStudentSelect();
        UI?.updateStats();

        // Notify user
        UI?.showNotification(`${studentName} supprimé`, 'success');
    },

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

        if (status === 'generating') {
            appreciationCell.innerHTML = this._getAppreciationSkeletonHTML(label || 'Génération...', false);
        } else if (status === 'pending-skeleton') {
            appreciationCell.innerHTML = this._getAppreciationSkeletonHTML(label || 'En file', true);
        } else {
            // Revert to standard badge if needed (though usually updateRow is called next)
            appreciationCell.innerHTML = this._getStatusBadge(status);
        }
    },

    /**
     * Updates a specific row with new result data and triggers animation.
     * @param {string} studentId - The ID of the student.
     * @param {Object} result - The updated result object.
     * @param {boolean} [animate=false] - Whether to use the typewriter effect.
     */
    async updateRow(studentId, result, animate = false) {
        const row = document.querySelector(`.student-row[data-student-id="${studentId}"]`);
        if (!row) return;

        const appreciationCell = row.querySelector('.appreciation-cell');
        if (!appreciationCell) return;

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
            const storedPeriod = result.studentData?.currentPeriod || result.aiGenerationPeriod;
            if (!storedPeriod || storedPeriod === currentPeriod) {
                appreciation = result.appreciation.trim();
            }
        }

        const decoded = Utils.decodeHtmlEntities(appreciation);
        const cleanText = decoded.replace(/<[^>]*>/g, '').trim();

        // 2. Render content
        if (animate && cleanText) {
            // Create container for typewriter with expanded class for full text during animation
            appreciationCell.innerHTML = `<div class="appreciation-preview expanded"></div>`;
            const targetEl = appreciationCell.querySelector('.appreciation-preview');

            // Use UI Manager's typewriter effect
            if (UI?.typewriterReveal) {
                await UI.typewriterReveal(targetEl, cleanText, { speed: 'fast' });
            } else {
                targetEl.textContent = cleanText;
            }

            // Remove title attribute to avoid unwanted tooltips
            targetEl.removeAttribute('title');

            // Add "just generated" flash effect to the row
            row.classList.add('just-generated');
            setTimeout(() => row.classList.remove('just-generated'), 1000);

            // Smooth collapse - animate the CELL height for smooth row transition
            setTimeout(() => {
                // 1. Capture current cell height (determines row height)
                const cellExpandedHeight = appreciationCell.offsetHeight;
                appreciationCell.style.height = cellExpandedHeight + 'px';
                appreciationCell.style.overflow = 'hidden';
                appreciationCell.style.boxSizing = 'border-box';

                // 2. Fade out content
                targetEl.style.opacity = '0.3';
                targetEl.style.transition = 'opacity 0.4s ease-out';

                // 3. After fade, switch content to compact and animate cell height
                setTimeout(() => {
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
                    setTimeout(() => {
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
    },

    // _getAppreciationSkeletonHTML extracted

    /**
     * Toggle appreciation content mode (Truncated -> Full View)
     * @param {HTMLElement} listContainer - The list container element
     * @private
     */
    _toggleAppreciationColumn(listContainer) {
        const table = listContainer.querySelector('.student-list-table');
        if (!table) return;

        const isFullView = table.classList.contains('appreciation-full-view');
        const header = table.querySelector('.appreciation-toggle-header');
        const icon = header?.querySelector('.appreciation-toggle-icon');
        const mobileBtn = listContainer.querySelector('#mobileCompactToggleBtn');
        const mobileIcon = mobileBtn?.querySelector('iconify-icon');

        // Helper to update tooltip
        const updateTooltip = (text) => {
            const wrapper = header?.querySelector('.header-content-wrapper');
            if (wrapper) {
                TooltipsUI.updateTooltip(wrapper, text);
            }
            if (mobileBtn) {
                TooltipsUI.updateTooltip(mobileBtn, text);
            }
            // Ensure no native tooltip conflicts
            if (header) header.removeAttribute('title');
            if (mobileBtn) mobileBtn.removeAttribute('title');
        };

        // Toggle UI
        if (isFullView) {
            // COLLAPSE: Return to truncated view
            table.classList.remove('appreciation-full-view');
            header?.classList.remove('expanded-view');
            updateTooltip('Voir tout le texte');

            // Switch to Expand icon
            if (icon) {
                icon.setAttribute('icon', 'solar:maximize-square-linear');
            }
            if (mobileIcon) {
                mobileIcon.setAttribute('icon', 'solar:maximize-square-linear');
            }

            // Update State & Persistence
            appState.isAppreciationFullView = false;
        } else {
            // EXPAND: Show full text
            table.classList.add('appreciation-full-view');
            header?.classList.add('expanded-view');
            updateTooltip('Réduire');

            // Switch to Compress icon
            if (icon) {
                icon.setAttribute('icon', 'solar:minimize-square-linear');
            }
            if (mobileIcon) {
                mobileIcon.setAttribute('icon', 'solar:minimize-square-linear');
            }

            // Update State & Persistence
            appState.isAppreciationFullView = true;
        }

        // Save preference
        StorageManager.saveAppState();
    }
};


// Initialize the selection manager bindings
ListViewManager.initSelectionManager();
ListViewRenderer.init({
    attachEventListeners: (el) => ListViewEvents.attachEventListeners(el)
});
ListViewAnimations.init({
    renderFresh: (c, r, p, idx) => ListViewRenderer.renderFresh(c, r, p, idx),
    updateHeaderSortIcons: (v) => ListViewRenderer.updateHeaderSortIcons(v)
});
ListViewEvents.init({
    copySingleAppreciation: (id) => ListViewManager._copySingleAppreciation(id),
    bulkReset: (ids) => ListViewManager._bulkReset(ids),
    deleteStudent: (id, row) => ListViewManager._deleteStudent(id, row),
    toggleAppreciationColumn: (c) => ListViewManager._toggleAppreciationColumn(c),
    handleSelectionInteraction: (id, e) => ListSelectionManager.handleSelectionInteraction(id, e),
    clearSelections: () => ListSelectionManager.clearSelections(),
    handleBulkAction: (action) => ListSelectionManager.handleBulkAction(action),
    toggleSelectVisible: (all) => ListSelectionManager.toggleSelectVisible(all),
    updateHeaderSortIcons: (v) => ListViewRenderer.updateHeaderSortIcons(v),
    hasSelections: () => ListSelectionManager.selectedIds.size > 0
});

