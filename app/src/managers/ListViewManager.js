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

/**
 * Module de gestion de la vue Liste (tableau des Ã©lÃ¨ves)
 * @namespace ListViewManager
 */
export const ListViewManager = {
    _activeDocClickListener: null,
    _activeKeydownListener: null,
    _activePopstateListener: null, // Listener pour gérer le bouton retour sur mobile
    _lastRenderedClassId: null, // Track class changes to force fresh render
    _lastRenderedPeriod: null,  // Track period changes to force fresh render (header column count changes)
    _activeFilterTimeout: null, // Track filter animation timeout to prevent race conditions
    _selectedIds: new Set(),    // Track selected student IDs for bulk actions
    _lastSelectedId: null,      // Track last selected student ID for range selection

    /**
     * Rend la liste des élèves en format tableau
     * @param {Array} results - Tableau des résultats à afficher
     * @param {HTMLElement} container - Conteneur DOM
     */
    render(results, container) {
        // Cancel any pending filter animation to prevent race conditions
        if (this._activeFilterTimeout) {
            clearTimeout(this._activeFilterTimeout);
            this._activeFilterTimeout = null;
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
                // If table exists, just clear rows but KEEP structure (and search bar!)
                const existingRows = tbody.querySelectorAll('.student-row');
                if (existingRows.length > 0) {
                    this._animateRowsOut(existingRows, () => {
                        tbody.innerHTML = `
                            <tr class="empty-state-row">
                                <td colspan="100%" style="text-align:center; padding: 40px; color: var(--text-tertiary);">
                                    <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                                        <i class="fas fa-search" style="font-size:24px; opacity:0.5;"></i>
                                        <span>Aucun élève trouvé</span>
                                    </div>
                                </td>
                            </tr>
                        `;
                    });
                } else if (!tbody.querySelector('.empty-state-row')) {
                    tbody.innerHTML = `
                        <tr class="empty-state-row">
                            <td colspan="100%" style="text-align:center; padding: 40px; color: var(--text-tertiary);">
                                <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                                    <i class="fas fa-search" style="font-size:24px; opacity:0.5;"></i>
                                    <span>Aucun élève trouvé</span>
                                </div>
                            </td>
                        </tr>
                    `;
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
                this._animateFilterTransition(container, existingRows, results, periods, currentPeriodIndex);
                return;
            } else if (hasOrderChange) {
                // Sort change: use simple reorder
                this._animateSortTransition(container, existingRows, results, periods, currentPeriodIndex);
                return;
            } else {
                // Data updated but same IDs and order - Perform soft update to preserve DOM
                this._animateSortTransition(container, existingRows, results, periods, currentPeriodIndex);
                return;
            }
        }

        // === INITIAL RENDER (no existing table) ===
        this._renderFresh(container, results, periods, currentPeriodIndex);
    },

    /**
     * Anime la transition de filtrage avec technique FLIP
     * @param {HTMLElement} container - Conteneur DOM
     * @param {Array} existingRows - Lignes existantes
     * @param {Array} newResults - Nouveaux résultats filtrés
     * @param {Array} periods - Périodes
     * @param {number} currentPeriodIndex - Index de la période courante
     * @private
     */
    _animateFilterTransition(container, existingRows, newResults, periods, currentPeriodIndex) {
        const tbody = container.querySelector('tbody');
        if (!tbody) {
            this._renderFresh(container, newResults, periods, currentPeriodIndex);
            return;
        }

        const newIds = new Set(newResults.map(r => r.id));
        const newResultsMap = new Map(newResults.map(r => [r.id, r]));

        // Identify rows to exit, keep
        const toExit = existingRows.filter(r => !newIds.has(r.dataset.studentId));
        const toKeep = existingRows.filter(r => newIds.has(r.dataset.studentId));
        const existingIdsSet = new Set(existingRows.map(r => r.dataset.studentId));

        // *** FIRST: Capture positions of KEPT rows BEFORE any DOM changes ***
        // This is critical for the "flow up" animation when rows are filtered out
        const firstPositions = new Map();
        toKeep.forEach(row => {
            const rect = row.getBoundingClientRect();
            firstPositions.set(row.dataset.studentId, {
                top: rect.top,
                left: rect.left
            });
        });

        // Step 1: Animate exiting rows (fade + scale out)
        toExit.forEach(row => {
            row.classList.add('row-exit');
        });

        // Step 2: After exit animation, reorganize and animate movement
        const exitDuration = toExit.length > 0 ? 250 : 0;
        this._activeFilterTimeout = setTimeout(() => {
            this._activeFilterTimeout = null;

            // Remove exited rows from DOM
            toExit.forEach(row => row.remove());

            // Build map of kept rows
            const keepMap = new Map(toKeep.map(r => [r.dataset.studentId, r]));

            // Reorder rows IN-PLACE
            const orderedIds = newResults.map(r => r.id);
            let previousNode = null;

            orderedIds.forEach((id, index) => {
                let row;

                if (keepMap.has(id)) {
                    // Existing row - reuse it
                    row = keepMap.get(id);

                    // Update content if needed
                    const result = newResultsMap.get(id);
                    if (result) {
                        this._updateRowContent(row, result);
                    }
                } else {
                    // New row - create it
                    const result = newResultsMap.get(id);
                    if (result) {
                        row = this._createRowElement(result, periods, currentPeriodIndex);
                        row.classList.add('row-filter-enter');
                        row.style.setProperty('--enter-delay', `${50 + index * 30}ms`);
                    }
                }

                if (row) {
                    // Insert in correct position
                    if (previousNode) {
                        if (previousNode.nextSibling !== row) {
                            tbody.insertBefore(row, previousNode.nextSibling);
                        }
                    } else {
                        if (tbody.firstChild !== row) {
                            tbody.insertBefore(row, tbody.firstChild);
                        }
                    }
                    previousNode = row;
                }
            });

            // Force layout recalculation
            void tbody.offsetHeight;

            // *** LAST + INVERT + PLAY: Animate kept rows to their new positions ***
            requestAnimationFrame(() => {
                toKeep.forEach(row => {
                    const id = row.dataset.studentId;
                    const first = firstPositions.get(id);
                    if (!first) return;

                    // LAST: Get current (final) position
                    const last = row.getBoundingClientRect();

                    // Calculate how much the row moved (negative = moved up)
                    const deltaY = first.top - last.top;

                    if (Math.abs(deltaY) > 2) {
                        // Add card effect class for visual feedback
                        row.classList.add('row-moving');

                        // INVERT: Move row back to where it was (its old position)
                        row.style.transform = `translateY(${deltaY}px)`;
                        row.style.transition = 'none';

                        // Force browser to render the inverted state
                        void row.offsetHeight;

                        // PLAY: Animate smoothly to final position (transform: none)
                        requestAnimationFrame(() => {
                            row.classList.add('row-move');
                            row.style.transform = '';

                            // Cleanup after animation
                            const cleanup = (e) => {
                                if (e.propertyName === 'transform') {
                                    row.classList.remove('row-move', 'row-moving');
                                    row.style.transition = '';
                                    row.removeEventListener('transitionend', cleanup);
                                }
                            };
                            row.addEventListener('transitionend', cleanup);
                        });
                    }
                });
            });

            // Re-attach event listeners
            const viewElement = container.querySelector('.student-list-view');
            if (viewElement) {
                // [FIX] Do NOT re-attach listeners here as the view element persists
                // this._attachEventListeners(viewElement); 
                this._updateHeaderSortIcons(viewElement);
            }

            // Cleanup enter animations after delay
            setTimeout(() => {
                const enterRows = tbody.querySelectorAll('.row-filter-enter');
                enterRows.forEach(row => {
                    row.classList.remove('row-filter-enter');
                    row.style.removeProperty('--enter-delay');
                });
            }, 500);

        }, exitDuration);
    },

    /**
     * Animation simple pour le tri (réordonnancement sans changement d'IDs)
     * @param {HTMLElement} container - Conteneur DOM
     * @param {Array} existingRows - Lignes existantes
     * @param {Array} newResults - Nouveaux résultats triés
     * @param {Array} periods - Périodes
     * @param {number} currentPeriodIndex - Index de la période courante
     * @private
     */
    _animateSortTransition(container, existingRows, newResults, periods, currentPeriodIndex) {
        const tbody = container.querySelector('tbody');
        if (!tbody) return;

        // Build map of existing rows by ID
        const rowMap = new Map(existingRows.map(r => [r.dataset.studentId, r]));
        const newResultsMap = new Map(newResults.map(r => [r.id, r]));

        // *** FIRST: Capture positions BEFORE any DOM changes ***
        const firstPositions = new Map();
        existingRows.forEach(row => {
            const rect = row.getBoundingClientRect();
            firstPositions.set(row.dataset.studentId, { top: rect.top });
        });

        // Reorder rows in correct order
        const orderedIds = newResults.map(r => r.id);
        let previousNode = null;

        orderedIds.forEach(id => {
            const row = rowMap.get(id);
            if (row) {
                // Update content if needed
                const result = newResultsMap.get(id);
                if (result) {
                    this._updateRowContent(row, result);
                }

                // Insert in correct position
                if (previousNode) {
                    if (previousNode.nextSibling !== row) {
                        tbody.insertBefore(row, previousNode.nextSibling);
                    }
                } else {
                    if (tbody.firstChild !== row) {
                        tbody.insertBefore(row, tbody.firstChild);
                    }
                }
                previousNode = row;
            }
        });

        // Force layout recalculation
        void tbody.offsetHeight;

        // *** LAST + INVERT + PLAY ***
        existingRows.forEach(row => {
            const id = row.dataset.studentId;
            const first = firstPositions.get(id);
            if (!first) return;

            // LAST: Get new position
            const last = row.getBoundingClientRect();
            const deltaY = first.top - last.top;

            if (Math.abs(deltaY) > 2) {
                // INVERT: Move back to old position
                row.style.transform = `translateY(${deltaY}px)`;
                row.style.transition = 'none';
            }
        });

        // Force browser to render inverted state
        void tbody.offsetHeight;

        // PLAY: Animate to final position
        requestAnimationFrame(() => {
            existingRows.forEach(row => {
                const id = row.dataset.studentId;
                const first = firstPositions.get(id);
                if (!first) return;

                const last = row.getBoundingClientRect();
                // Recalculate because we applied transforms
                const currentTransform = row.style.transform;
                if (currentTransform && currentTransform !== 'none') {
                    row.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
                    row.style.transform = '';
                }
            });

            // Cleanup with timeout (more reliable than transitionend)
            setTimeout(() => {
                existingRows.forEach(row => {
                    row.style.transform = '';
                    row.style.transition = '';
                });
            }, 400);
        });

        // Update header icons
        const viewElement = container.querySelector('.student-list-view');
        if (viewElement) {
            this._updateHeaderSortIcons(viewElement);
        }
    },

    /**
     * Anime la sortie de toutes les lignes
     * @param {NodeList} rows - Lignes à animer
     * @param {Function} callback - Callback après animation
     * @private
     */
    _animateRowsOut(rows, callback) {
        rows.forEach((row, index) => {
            row.style.setProperty('--row-delay', `${index * 15}ms`);
            row.classList.add('row-exit');
        });
        setTimeout(callback, 300);
    },

    /**
     * Crée un élément TR pour une ligne d'élève
     * @param {Object} result - Données de l'élève
     * @param {Array} periods - Périodes
     * @param {number} currentPeriodIndex - Index période courante
     * @returns {HTMLElement} Élément TR
     * @private
     */
    _createRowElement(result, periods, currentPeriodIndex) {
        const tr = document.createElement('tr');
        tr.dataset.studentId = result.id;
        tr.className = 'student-row';
        tr.tabIndex = 0;

        const studentData = result.studentData || {};
        const status = this._getStatus(result);
        const appreciationCell = this._getAppreciationCell(result, status);
        const isSelected = this._selectedIds.has(result.id);
        const avatarHTML = StudentPhotoManager.getAvatarHTML(result, 'sm', isSelected);

        tr.innerHTML = `
            <td class="student-name-cell">
                <div class="student-identity-wrapper ${isSelected ? 'selected' : ''}">
                    ${avatarHTML}
                    <span class="student-nom-prenom">${result.nom} <span class="student-prenom">${result.prenom}</span></span>
                </div>
            </td>
            <td class="status-cell">${this._getStudentStatusCellContent(result)}</td>
            ${this._renderGradeCells(studentData.periods || {}, periods, currentPeriodIndex)}
            <td class="appreciation-cell">${appreciationCell}</td>
             <td class="action-cell">
                <div class="action-dropdown">
                    <button class="btn btn-icon-only btn-action-menu" data-action="toggle-menu" title="Actions">
                        <i class="fas fa-ellipsis-vertical"></i>
                    </button>
                    ${this._generateActionMenuHTML(result.id)}
                </div>
            </td>
        `;

        return tr;
    },

    /**
     * Génère le HTML du menu d'actions pour une ligne élève
     * @param {string} studentId - ID de l'élève
     * @returns {string} HTML du menu
     * @private
     */
    _generateActionMenuHTML(studentId) {
        return `
            <div class="action-dropdown-menu">
                <h5 class="dropdown-header"><i class="fas fa-magic"></i> APPRÉCIATION</h5>
                <button class="action-dropdown-item" data-action="regenerate-student">
                    <i class="fas fa-sync-alt"></i> Régénérer
                </button>
                <button class="action-dropdown-item" data-action="copy-appreciation">
                    <i class="fas fa-copy"></i> Copier
                </button>
                
                <h5 class="dropdown-header"><i class="fas fa-user-graduate"></i> ÉLÈVE</h5>
                <button class="action-dropdown-item" data-action="move-student">
                    <i class="fas fa-arrow-right-arrow-left"></i> Déplacer
                </button>
                <button class="action-dropdown-item" data-action="reset-student">
                    <i class="fas fa-rotate-left"></i> Réinitialiser
                </button>
                <button class="action-dropdown-item danger" data-action="delete-student">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            </div>
        `;
    },



    /**
     * Met à jour le contenu d'une ligne existante
     * @param {HTMLElement} row - Ligne à mettre à jour
     * @param {Object} result - Nouvelles données
     * @private
     */
    _updateRowContent(row, result) {
        // Update appreciation cell
        const appreciationCell = row.querySelector('.appreciation-cell');
        if (appreciationCell) {
            const status = this._getStatus(result);
            appreciationCell.innerHTML = this._getAppreciationCell(result, status);
        }

        // Update status cell
        const statusCell = row.querySelector('.status-cell');
        if (statusCell) {
            statusCell.innerHTML = this._getStudentStatusCellContent(result);
        }

        // Update Identity (Name + Avatar)
        const identityWrapper = row.querySelector('.student-identity-wrapper');
        if (identityWrapper) {
            const isSelected = this._selectedIds.has(result.id);
            const avatarHTML = StudentPhotoManager.getAvatarHTML(result, 'sm', isSelected);

            // Update wrapper class for selection state
            if (isSelected) {
                identityWrapper.classList.add('selected');
            } else {
                identityWrapper.classList.remove('selected');
            }

            identityWrapper.innerHTML = `
                ${avatarHTML}
                <span class="student-nom-prenom">${result.nom} <span class="student-prenom">${result.prenom}</span></span>
            `;
        }

        // Update Grades (replace all cells between status and appreciation)
        const currentPeriod = appState.currentPeriod;
        const periods = Utils.getPeriods() || ['T1', 'T2', 'T3'];
        const currentPeriodIndex = Math.max(0, periods.indexOf(currentPeriod));

        // Re-generate grade cells HTML
        const newGradeCellsHtml = this._renderGradeCells(result.studentData.periods || {}, periods, currentPeriodIndex);

        // Replace existing grade cells
        if (statusCell && appreciationCell) {
            // Remove all siblings between statusCell and appreciationCell
            let next = statusCell.nextElementSibling;
            while (next && next !== appreciationCell) {
                const toRemove = next;
                next = next.nextElementSibling;
                toRemove.remove();
            }

            // Insert new cells after status cell
            statusCell.insertAdjacentHTML('afterend', newGradeCellsHtml);
        }
    },

    /**
     * Updates a specific student row in the list view (Reactive Update)
     * Called when data changes in Focus Panel
     * @param {string} studentId
     */
    updateStudentRow(studentId) {
        if (!studentId) return false;
        const row = document.querySelector(`.student-row[data-student-id="${studentId}"]`);
        if (!row) return false;

        // CRITICAL: Always use generatedResults as source of truth
        // filteredResults contains shallow copies that may be stale after journal modifications
        const result = appState.generatedResults.find(r => r.id === studentId);

        if (result) {
            // Optimization: Check if only dirty indicator needs updating
            const appreciationCell = row.querySelector('.appreciation-cell');
            const existingDirty = appreciationCell?.querySelector('.dirty-indicator');
            const shouldBeDirty = this._isResultDirty(result);
            const hasDirtyIndicator = !!existingDirty;

            // If only dirty state changed, use optimized update (no flash)
            if (appreciationCell && hasDirtyIndicator !== shouldBeDirty) {
                this._updateDirtyIndicatorOnly(appreciationCell, shouldBeDirty);
            } else {
                // Full update needed (appreciation changed, etc.)
                this._updateRowContent(row, result);
            }

            // Also update the global generate button state as dirty counts may have changed
            import('./ResultsUIManager.js').then(({ ResultsUIManager }) => {
                ResultsUIManager.updateGenerateButtonState();
            });
            return true;
        }
        return false;
    },

    /**
     * Optimized update for dirty indicator only (no flash, subtle animation)
     * @param {HTMLElement} cell - The appreciation-cell element
     * @param {boolean} shouldBeDirty - Whether dirty indicator should be shown
     * @private
     */
    _updateDirtyIndicatorOnly(cell, shouldBeDirty) {
        const existingIndicator = cell.querySelector('.dirty-indicator');

        if (shouldBeDirty && !existingIndicator) {
            // ADD dirty indicator with fade-in animation
            const indicator = document.createElement('span');
            indicator.className = 'dirty-indicator tooltip dirty-indicator-enter';
            indicator.setAttribute('data-tooltip', 'Données modifiées depuis la génération.\nActualisation recommandée.');
            indicator.innerHTML = '<i class="fas fa-exclamation-circle"></i>';

            // Insert at the beginning of the cell
            cell.insertBefore(indicator, cell.firstChild);

            // Trigger animation
            requestAnimationFrame(() => {
                indicator.classList.remove('dirty-indicator-enter');
            });
        } else if (!shouldBeDirty && existingIndicator) {
            // REMOVE dirty indicator with fade-out animation
            existingIndicator.classList.add('dirty-indicator-leave');

            // Remove after animation
            setTimeout(() => {
                existingIndicator.remove();
            }, 250);
        }
    },

    /**
     * Rendu initial complet de la liste
     * @param {HTMLElement} container - Conteneur
     * @param {Array} results - Résultats
     * @param {Array} periods - Périodes
     * @param {number} currentPeriodIndex - Index période courante
     * @private
     */
    _renderFresh(container, results, periods, currentPeriodIndex) {
        // Read view preference
        const isExpanded = appState.isAppreciationFullView;
        const tableClass = isExpanded ? 'student-list-table appreciation-full-view' : 'student-list-table';
        const headerClass = isExpanded ? 'appreciation-header appreciation-toggle-header sortable-header expanded-view' : 'appreciation-header appreciation-toggle-header sortable-header';
        const iconClass = isExpanded ? 'fas fa-compress appreciation-toggle-icon' : 'fas fa-expand appreciation-toggle-icon';
        const title = isExpanded ? 'Réduire' : 'Voir tout le texte';

        // Build table HTML (no animation classes in HTML - we'll add them after)
        let html = `
            <div class="student-list-view">
                <table class="${tableClass}">
                    <thead>
                        <tr>
                            <th class="name-header-with-search sortable-header" data-sort-field="name" title="Trier par nom">
                                <div class="header-content-wrapper" id="nameHeaderContent">
                                    Nom
                                    <span class="sort-icon-placeholder name-sort-icon"></span>
                                </div>
                                <button type="button" class="inline-search-trigger-btn header-action-trigger" id="inlineSearchTrigger" title="Rechercher (Ctrl+F)">
                                    <i class="fas fa-search"></i>
                                </button>
                                <div class="inline-search-container" id="inlineSearchContainer">
                                    <i class="fas fa-search search-icon"></i>
                                    <input type="text" class="inline-search-input" id="inlineSearchInput" placeholder="Rechercher..." autocomplete="off">
                                    <button type="button" class="inline-search-clear" id="inlineSearchClear" aria-label="Effacer">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </th>
                            <th class="sortable-header" data-sort-field="status" title="Trier par statut" style="width: 120px;">
                                <div class="header-content-wrapper">
                                    Statut<span class="sort-icon-placeholder"></span>
                                </div>
                            </th>
                            ${this._renderGradeHeaders(periods.slice(0, currentPeriodIndex + 1))}
                            <th class="${headerClass}" title="${title}">
                                <span id="avgWordsChip" class="detail-chip header-action-trigger" data-tooltip="Nombre moyen de mots" style="display:none"></span>
                                <div class="appreciation-header-actions" id="appreciationHeaderActions">
                                    <button type="button" class="btn-generate-inline tooltip" id="generatePendingBtnInline" style="display: none;" data-tooltip="Générer les appréciations en attente">
                                        <i class="fas fa-wand-magic-sparkles"></i>
                                        <span class="generate-badge" id="pendingCountBadgeInline">0</span>
                                    </button>
                                    <button type="button" class="btn-update-inline tooltip" id="updateDirtyBtnInline" style="display: none;" data-tooltip="Actualiser les appréciations modifiées">
                                        <i class="fas fa-sync-alt"></i>
                                        <span class="update-badge" id="dirtyCountBadgeInline">0</span>
                                    </button>
                                </div>
                                <div class="header-content-wrapper">
                                    Appréciation
                                    <i class="${iconClass}"></i>
                                </div>
                            </th>
                            <th class="action-header" style="width: 50px;">
                                <div class="header-content-wrapper global-actions-dropdown">
                                    <button class="btn-action-menu-header" id="tableActionsBtnToggle" title="Actions">
                                        <i class="fas fa-ellipsis-vertical"></i>
                                    </button>
                                    <div class="global-actions-dropdown-menu" id="tableActionsDropdown">
                                        <!-- SECTION SELECTION -->
                                        <button class="action-dropdown-item" id="selectAllBtn-global">
                                            <i class="fas fa-check-double"></i> Tout sélectionner
                                        </button>
                                        
                                        <!-- SECTION VUE -->
                                        <button class="action-dropdown-item action-analyze-class" id="analyzeClassBtn-shortcut">
                                            <i class="fas fa-chart-pie"></i> Analyser la classe
                                        </button>



                                        <!-- SECTION EXPORT -->
                                        <h5 class="dropdown-header"><i class="fas fa-download"></i> Exporter</h5>
                                        <button class="action-dropdown-item" id="exportJsonBtn">
                                            <i class="fas fa-file-code"></i> Données (JSON)
                                        </button>
                                        <button class="action-dropdown-item" id="exportCsvBtn">
                                            <i class="fas fa-file-csv"></i> Tableau (CSV)
                                        </button>
                                        <button class="action-dropdown-item" id="exportPdfBtn">
                                            <i class="fas fa-file-pdf"></i> Imprimer / PDF
                                        </button>
                                    </div>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        results.forEach((result, index) => {
            try {
                // Safeguard against missing studentData
                const studentData = result.studentData || {};

                // Ensure result.studentData is accessible for subsequent calls if it was missing
                if (!result.studentData) result.studentData = studentData;

                const status = this._getStatus(result);
                const appreciationCell = this._getAppreciationCell(result, status);

                const isSelected = this._selectedIds.has(result.id);
                // Generate avatar HTML with selection state
                const avatarHTML = StudentPhotoManager.getAvatarHTML(result, 'sm', isSelected);

                html += `
                    <tr data-student-id="${result.id}" class="student-row" tabindex="0">
                        <td class="student-name-cell">
                            <div class="student-identity-wrapper ${isSelected ? 'selected' : ''}">
                                ${avatarHTML}
                                <span class="student-nom-prenom">${result.nom} <span class="student-prenom">${result.prenom}</span></span>
                            </div>
                        </td>
                        <td class="status-cell">${this._getStudentStatusCellContent(result)}</td>
                        ${this._renderGradeCells(studentData.periods || {}, periods, currentPeriodIndex)}
                        <td class="appreciation-cell">${appreciationCell}</td>
                        <td class="action-cell">
                            <div class="action-dropdown">
                                <button class="btn btn-icon-only btn-action-menu" data-action="toggle-menu" title="Actions">
                                    <i class="fas fa-ellipsis-vertical"></i>
                                </button>
                                ${this._generateActionMenuHTML(result.id)}
                            </div>
                        </td>
                    </tr>
                `;
            } catch (e) {
                console.error("Erreur rendu élève:", result?.nom, e);
                html += `
                    <tr class="error-row">
                        <td colspan="100%">Erreur d'affichage pour ${result?.nom || 'Élève inconnu'}</td>
                    </tr>
                `;
            }
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        // ANTI-FLASH: Hide container, replace content, then fade in
        container.style.opacity = '0';
        container.innerHTML = html;

        // Force reflow
        void container.offsetHeight;

        // Quick fade-in of container
        container.style.transition = 'opacity 0.15s ease-out';
        container.style.opacity = '1';

        const viewElement = container.querySelector('.student-list-view');
        if (viewElement) {
            const rows = viewElement.querySelectorAll('.student-row');
            const rowCount = rows.length;

            // Calculate staggered delays for premium effect
            const maxTotalDuration = 300; // Max total stagger time in ms
            const delayPerRow = Math.min(20, maxTotalDuration / Math.max(rowCount, 1));

            // Apply staggered row animations after container fade
            requestAnimationFrame(() => {
                rows.forEach((row, index) => {
                    row.style.setProperty('--row-delay', `${index * delayPerRow}ms`);
                    row.classList.add('row-animate-in');
                });
            });

            // Clean up after animations complete
            const cleanupDelay = 200 + maxTotalDuration + 300; // fade + stagger + animation duration
            setTimeout(() => {
                if (container) { // Check existence as view might have changed
                    container.style.transition = '';
                    container.style.opacity = '';
                    rows.forEach(row => {
                        row.classList.remove('row-animate-in');
                        row.style.removeProperty('--row-delay');
                    });
                }
            }, cleanupDelay);

            this._attachEventListeners(viewElement);
            this._updateHeaderSortIcons(viewElement);
        }
    },


    /**
     * Génère les headers de notes avec colonnes d'évolution
     * @param {Array} periods - PÃ©riodes Ã  afficher
     * @returns {string} HTML des headers
     * @private
     */
    _renderGradeHeaders(periods) {
        let html = '';
        periods.forEach((p, i) => {
            // Colonne de note - Sortable
            html += `<th class="grade-header sortable-header" data-sort-field="grade" data-sort-param="${p}" title="Trier par notes ${p}">
                        <div class="header-content-wrapper">
                             ${Utils.getPeriodLabel(p, false)} <span class="sort-icon-placeholder"></span>
                        </div>
                     </th>`;

            // Colonne d'évolution (sauf après la dernière période)
            if (i < periods.length - 1) {
                // Evolution is relevant to the NEXT period (target period)
                const nextP = periods[i + 1];
                html += `<th class="evolution-header sortable-header" data-sort-field="evolution" data-sort-param="${nextP}" title="Trier par évolution vers ${nextP}">
                             <div class="header-content-wrapper">
                                <i class="fas fa-chart-line" style="opacity:0.6; font-size:0.9em;"></i> <span class="sort-icon-placeholder"></span>
                             </div>
                         </th>`;
            }
        });
        return html;
    },

    /**
     * Updates sort icons based on current state
     */
    _updateHeaderSortIcons(viewElement) {
        const { field, direction, param } = appState.sortState;

        viewElement.querySelectorAll('.sortable-header').forEach(th => {
            const sortField = th.dataset.sortField;
            const sortParam = th.dataset.sortParam;

            const isSorted = sortField === field && (sortParam === undefined || sortParam === param || (sortParam && param && sortParam === param));

            th.classList.toggle('active-sort', isSorted);

            // Remove old icon
            const placeholder = th.querySelector('.sort-icon-placeholder');
            if (placeholder) {
                placeholder.innerHTML = '';
                if (isSorted) {
                    placeholder.innerHTML = direction === 'asc'
                        ? '<i class="fas fa-sort-up" style="margin-left:4px; color:var(--primary-color);"></i>'
                        : '<i class="fas fa-sort-down" style="margin-left:4px; color:var(--primary-color);"></i>';
                }
            }
        });
    },

    /**
     * Rend les cellules de notes pour un élève avec colonnes d'évolution séparées
     * @param {Object} periods - DonnÃ©es par pÃ©riode
     * @param {Array} allPeriods - Liste de toutes les pÃ©riodes
     * @param {number} currentIndex - Index de la pÃ©riode courante
     * @returns {string} HTML des cellules
     * @private
     */
    _renderGradeCells(periodsData, allPeriods, currentIndex) {
        let html = '';
        const safePeriodsData = periodsData || {}; // Ensure object (renamed for clarity)

        for (let i = 0; i <= currentIndex; i++) {
            try {
                const p = allPeriods[i];
                if (!p) continue; // Skip if period name is somehow missing

                const data = safePeriodsData[p] || {};
                const grade = (data && typeof data.grade === 'number') ? data.grade : null;
                const evalCount = data.evaluationCount;
                let gradeClass = '';

                if (grade !== null) {
                    gradeClass = Utils.getGradeClass(grade);
                }

                // Build tooltip for evaluation count if available
                const tooltipAttr = (typeof evalCount === 'number')
                    ? ` class="tooltip" data-tooltip="Moyenne sur ${evalCount} évaluation${evalCount > 1 ? 's' : ''}"`
                    : '';

                // Cellule de note
                html += `
                    <td class="grade-cell">
                        <div class="grade-content-wrapper"${tooltipAttr}>
                        ${grade !== null
                        ? `<span class="grade-value ${gradeClass}">${grade.toFixed(1).replace('.', ',')}</span>`
                        : `<span class="grade-empty">--</span>`
                    }
                        </div>
                    </td>
                `;

                // Cellule d'Ã©volution (entre cette note et la suivante)
                if (i < currentIndex) {
                    let evolutionHtml = '';
                    try {
                        const nextP = allPeriods[i + 1];
                        if (nextP) {
                            const nextData = safePeriodsData[nextP] || {};
                            const nextGrade = (nextData && typeof nextData.grade === 'number') ? nextData.grade : null;

                            if (grade !== null && nextGrade !== null) {
                                const diff = nextGrade - grade;
                                const diffText = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
                                const evoType = Utils.getEvolutionType(diff);

                                if (['very-positive', 'positive'].includes(evoType)) {
                                    evolutionHtml = `<span class="grade-evolution positive tooltip" data-tooltip="${diffText} pts"><i class="fas fa-arrow-trend-up"></i></span>`;
                                } else if (['very-negative', 'negative'].includes(evoType)) {
                                    evolutionHtml = `<span class="grade-evolution negative tooltip" data-tooltip="${diffText} pts"><i class="fas fa-arrow-trend-down"></i></span>`;
                                } else {
                                    // Stable
                                    evolutionHtml = `<span class="grade-evolution stable tooltip" data-tooltip="${diffText} pts"><i class="fas fa-arrow-right"></i></span>`;
                                }
                            }
                        }
                    } catch (evoErr) {
                        console.warn("Evolution render error", evoErr);
                    }
                    html += `<td class="evolution-cell">${evolutionHtml}</td>`;
                }
            } catch (cellErr) {
                console.error("Cell render error", p, cellErr);
                html += `<td class="grade-cell error">?</td>`;
                if (i < currentIndex) html += `<td class="evolution-cell"></td>`;
            }
        }

        return html;
    },

    /**
     * DÃ©termine le statut d'un rÃ©sultat
     * @param {Object} result - DonnÃ©es de l'Ã©lÃ¨ve
     * @returns {string} 'done' | 'pending' | 'error'
     * @private
     */
    /**
     * DÃ©termine le statut d'un rÃ©sultat
     * @param {Object} result - DonnÃ©es de l'Ã©lÃ¨ve
     * @returns {string} 'done' | 'pending' | 'error'
     * @private
     */
    _getStatus(result) {
        if (result.errorMessage) return 'error';
        if (result.appreciation && !result.isPending) return 'done';
        return 'pending';
    },

    /**
     * Checks if result data has changed since generation (Harmonized with FocusPanelStatus)
     * @param {Object} result - Student result
     * @returns {boolean} True if dirty
     * @private
     */
    _isResultDirty(result) {
        // Use the centralized Source of Truth from FocusPanelStatus
        return FocusPanelStatus.checkDirtyState(result);
    },

    /**
     * GÃ©nÃ¨re le contenu de la cellule d'apprÃ©ciation
     * Affiche l'apprÃ©ciation tronquÃ©e si disponible, sinon le badge de statut
     * @param {Object} result - DonnÃ©es de l'Ã©lÃ¨ve
     * @param {string} status - Statut de gÃ©nÃ©ration (global)
     * @returns {string} HTML de la cellule
     * @private
     */
    _getAppreciationCell(result, status) {
        // [FIX] RÃ©cupÃ©rer l'apprÃ©ciation spÃ©cifique Ã  la pÃ©riode sÃ©lectionnÃ©e
        const currentPeriod = appState.currentPeriod;
        let appreciation = '';

        // 1. PrioritÃ©: apprÃ©ciation stockÃ©e directement dans la pÃ©riode
        const periodApp = result.studentData?.periods?.[currentPeriod]?.appreciation;
        if (periodApp && typeof periodApp === 'string' && periodApp.trim()) {
            appreciation = periodApp.trim();
        }
        // 2. Fallback: result.appreciation (dÃ©jÃ  transformÃ©e dans renderResults pour la pÃ©riode courante)
        else if (result.appreciation && typeof result.appreciation === 'string' && result.appreciation.trim()) {
            // VÃ©rifier que cette apprÃ©ciation correspond bien Ã  la pÃ©riode courante
            // soit via studentData.currentPeriod, soit parce qu'il n'y a qu'une seule pÃ©riode
            const storedPeriod = result.studentData?.currentPeriod || result.aiGenerationPeriod;
            if (!storedPeriod || storedPeriod === currentPeriod) {
                appreciation = result.appreciation.trim();
            }
        }

        // Si c'est une autre pÃ©riode, et qu'on n'a rien trouvÃ©, on n'affiche rien (plutÃ´t que l'apprÃ©ciation d'un autre trimestre)
        // Cela rÃ©pond Ã  la demande : "T1 affiche T1".

        // Supprimer les balises HTML pour la vÃ©rification
        const textOnly = appreciation?.replace(/<[^>]*>/g, '').trim().toLowerCase() || '';

        // VÃ©rifier que c'est une vraie apprÃ©ciation, pas un placeholder
        const isPlaceholder = !appreciation ||
            textOnly === '' ||
            textOnly.includes('aucune apprÃ©ciation') ||
            textOnly.includes('en attente') ||
            textOnly.includes('cliquez sur') ||
            textOnly.startsWith('remplissez');

        // [FIX] On vérifie aussi que status n'est pas 'pending' SI c'est la période active en cours de génération
        // Mais ici on veut juste afficher le contenu stocké.

        const hasContent = appreciation && !isPlaceholder;

        if (hasContent) {
            // === COPY BUTTON INTEGRATION ===
            const btnClass = result.copied ? 'btn-copy-appreciation was-copied' : 'btn-copy-appreciation';
            const icon = result.copied ? '<i class="fas fa-check"></i>' : '<i class="fas fa-copy"></i>';
            const title = result.copied ? 'Appréciation copiée' : 'Copier l\'appréciation';

            const copyButtonHTML = `
                <button class="${btnClass}" data-action="copy-appreciation" title="${title}" onclick="event.stopPropagation(); AppreciationsManager.copyAppreciation('${result.id}', this)">
                    ${icon}
                </button>
            `;

            // === DIRTY STATE INDICATOR ===
            let dirtyBadge = '';
            if (this._isResultDirty(result)) {
                dirtyBadge = `<span class="dirty-indicator tooltip" data-tooltip="Données modifiées depuis la génération.\nActualisation recommandée."><i class="fas fa-exclamation-circle"></i></span>`;
            }

            return `${copyButtonHTML}${dirtyBadge}<div class="appreciation-preview has-copy-btn" onclick="event.stopPropagation(); this.closest('.appreciation-cell').click();">${Utils.decodeHtmlEntities(Utils.cleanMarkdown(appreciation))}</div>`;
        }

        // Si pas de contenu, on dÃ©termine le statut Ã  afficher
        // Pour les pÃ©riodes passÃ©es sans donnÃ©e, afficher simplement un tiret
        const storedPeriod = result.studentData?.currentPeriod || result.aiGenerationPeriod;
        // Si l'élève a une erreur qui concerne la période affichée
        // On affiche l'erreur si: le statut est 'error' ET (pas de période définie OU période == actuelle)
        if (status === 'error' && (!storedPeriod || storedPeriod === currentPeriod)) {
            return this._getStatusBadge('error');
        }

        // Pour les pÃ©riodes passÃ©es sans apprÃ©ciation, afficher un tiret
        const periods = Utils.getPeriods();
        const currentIndex = periods.indexOf(currentPeriod);
        const periodIndex = periods.indexOf(storedPeriod);

        if (storedPeriod && currentIndex < periodIndex) {
            // On regarde une période passée où l'élève n'avait pas encore d'appréciation
            return '<span class="appreciation-preview empty">&mdash;</span>';
        }

        // Sinon, badge "En attente" pour la pÃ©riode actuelle
        return this._getStatusBadge('pending');
    },

    /**
     * Génère le badge de statut HTML
     * @param {string} status - Statut ('pending', 'error', 'done')
     * @returns {string} HTML du badge
     * @private
     */
    _getStatusBadge(status) {
        const labels = {
            'pending': 'En attente',
            'error': 'Erreur',
            'done': 'Terminé',
            'generating': 'Génération...'
        };

        // Icons usually handled by CSS or unnecessary for simple badges, 
        // but adding icons for visual consistency if needed.
        const icons = {
            'pending': '<i class="fas fa-clock"></i>',
            'error': '<i class="fas fa-exclamation-triangle"></i>',
            'done': '<i class="fas fa-check"></i>',
            'generating': '<i class="fas fa-spinner fa-spin"></i>'
        };

        const label = labels[status] || status;
        const icon = icons[status] ? icons[status] + ' ' : '';

        return `<span class="status-badge ${status}">${icon}${label}</span>`;
    },
    /**
     * GÃ©nÃ¨re le contenu de la colonne Statut (Badges Ã©lÃ¨ve + Erreurs)
     * @param {Object} result - RÃ©sultat Ã©lÃ¨ve
     * @returns {string} HTML des badges
     * @private
     */
    _getStudentStatusCellContent(result) {
        let html = '';

        // Note: Le statut d'erreur de génération est affiché dans la colonne Appréciation,
        // pas dans cette colonne Statut qui est réservée aux statuts personnels de l'élève.

        // Statuts élève (PPRE, Délégué, Nouveau, ULIS, etc.)
        const studentStatuses = result.studentData?.statuses || [];
        // Dedup statuses to be safe
        const uniqueStatuses = [...new Set(studentStatuses)];

        uniqueStatuses.forEach(tag => {
            const badgeInfo = Utils.getStatusBadgeInfo(tag);
            // Use smaller gap/margin for multiple badges
            html += `<span class="${badgeInfo.className}" style="margin: 2px;">${badgeInfo.label}</span>`;
        });

        // Si vide, afficher un tiret très subtil (presque invisible)
        if (!html) {
            return '<span style="color:var(--text-tertiary); font-size:10px; opacity:0.4;">&mdash;</span>';
        }

        return `<div class="status-badges-container" style="display:flex; flex-wrap:wrap; justify-content:center; gap:4px;">${html}</div>`;
    },

    /**
     * Attache les event listeners aux Ã©lÃ©ments de la liste
     * @param {HTMLElement} listContainer - Le conteneur spÃ©cifique de la liste
     * @private
     */
    _attachEventListeners(listContainer) {
        // Import EventHandlersManager dynamically
        import('./EventHandlersManager.js').then(({ EventHandlersManager }) => {

            // Sort headers click (exclude appreciation toggle which has its own handler)
            listContainer.querySelectorAll('.sortable-header:not(.appreciation-toggle-header)').forEach(header => {
                header.addEventListener('click', (e) => {
                    e.stopPropagation();
                    EventHandlersManager.handleHeaderSortClick(header);
                });
            });

        });

        // Bouton "Actualiser" inline dans le header du tableau
        const updateBtnInline = listContainer.querySelector('#updateDirtyBtnInline');
        if (updateBtnInline) {
            updateBtnInline.addEventListener('click', async (e) => {
                e.stopPropagation();
                const { ResultsUIManager } = await import('./ResultsUIManager.js');
                await ResultsUIManager.regenerateDirty();
            });
        }

        // Bouton "Générer" inline dans le header du tableau
        const generateBtnInline = listContainer.querySelector('#generatePendingBtnInline');
        if (generateBtnInline) {
            generateBtnInline.addEventListener('click', async (e) => {
                e.stopPropagation();
                const { MassImportManager } = await import('./MassImportManager.js');
                await MassImportManager.generateAllPending();
            });
        }

        // Close any open menus when clicking outside
        const closeAllMenus = () => {
            // Fermer les menus d'actions individuelles
            listContainer.querySelectorAll('.action-dropdown-menu.open').forEach(menu => {
                // Trigger exit animation
                menu.classList.remove('open');

                // Clear any existing timeout to avoid conflict
                if (menu.dataset.closeTimeout) {
                    clearTimeout(parseInt(menu.dataset.closeTimeout));
                }

                // DELAY CLEANUP: Wait for CSS transition (200ms) before resetting styles
                // This prevents the menu from jumping to default position while fading out
                const timeoutId = setTimeout(() => {
                    // Only cleanup if it hasn't been reopened in the meantime
                    if (!menu.classList.contains('open')) {
                        menu.style.position = '';
                        menu.style.top = '';
                        menu.style.left = '';
                        menu.style.right = '';
                        menu.style.width = '';
                        menu.style.zIndex = '';
                    }
                    delete menu.dataset.closeTimeout;
                }, 200);

                menu.dataset.closeTimeout = timeoutId.toString();
            });
            // Fermer le menu global du header
            listContainer.querySelectorAll('.global-actions-dropdown-menu.open').forEach(menu => {
                menu.classList.remove('open');
            });
        };

        // Global click listener to close menus when clicking outside
        // Use capture=true to catch clicks even if other elements stop propagation
        // CRITICAL FIX: Remove previous listener to prevent accumulation on class switch
        if (this._activeDocClickListener) {
            document.removeEventListener('click', this._activeDocClickListener, true);
        }
        this._activeDocClickListener = (e) => {
            // If click is NOT on a menu interaction, close all menus
            if (!e.target.closest('.action-dropdown') && !e.target.closest('.global-actions-dropdown')) {
                closeAllMenus();
            }
        };
        document.addEventListener('click', this._activeDocClickListener, true);

        // Click handler
        listContainer.addEventListener('click', (e) => {
            const target = e.target;

            // Toggle GLOBAL actions dropdown in header
            const globalMenuBtn = target.closest('.btn-action-menu-header');
            if (globalMenuBtn) {
                e.stopPropagation();
                const dropdown = globalMenuBtn.closest('.global-actions-dropdown');
                const menu = dropdown?.querySelector('.global-actions-dropdown-menu');

                const wasOpen = menu?.classList.contains('open');
                closeAllMenus();

                if (!wasOpen) {
                    menu?.classList.add('open');
                }
                return;
            }

            // Toggle dropdown menu (per-row actions)
            const menuBtn = target.closest('[data-action="toggle-menu"]');
            if (menuBtn) {
                e.stopPropagation();
                const dropdown = menuBtn.closest('.action-dropdown');
                const menu = dropdown?.querySelector('.action-dropdown-menu');

                // Check state before closing (because closeAllMenus will reset it)
                const wasOpen = menu?.classList.contains('open');

                // Close other menus first
                closeAllMenus();

                // Toggle this menu (if it was closed, open it; if it was open, it stays closed)
                if (!wasOpen) {
                    // Cancel pending cleanup if re-opening same menu
                    if (menu.dataset.closeTimeout) {
                        clearTimeout(parseInt(menu.dataset.closeTimeout));
                        delete menu.dataset.closeTimeout;
                    }

                    // CRITICAL: Explicitly clear inline styles to ensure default positioning (relative to button)
                    // This fixes the case where menu was previously opened via context menu (absolute/fixed position)
                    menu.style.position = '';
                    menu.style.top = '';
                    menu.style.left = '';
                    menu.style.right = '';
                    menu.style.width = '';
                    menu.style.zIndex = '';

                    menu?.classList.add('open');
                }
                return;
            }

            // Move Student action
            const moveBtn = target.closest('[data-action="move-student"]');
            if (moveBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) ClassUIManager.showMoveStudentsModal([studentId]);
                return;
            }

            // Copy Appreciation action
            const copyAppBtn = target.closest('[data-action="copy-appreciation"]');
            if (copyAppBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) {
                    this._copySingleAppreciation(studentId);
                }
                return;
            }

            // Reset Student action (modal with choices)
            const resetBtn = target.closest('[data-action="reset-student"]');
            if (resetBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) {
                    this._bulkReset([studentId]);
                }
                return;
            }

            // Regenerate Student Action
            const regenBtn = target.closest('[data-action="regenerate-student"]');
            if (regenBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) {
                    import('./AppreciationsManager.js').then(({ AppreciationsManager }) => {
                        AppreciationsManager.regenerateFailedAppreciation(studentId, regenBtn);
                    });
                }
                return;
            }

            // Delete Student action
            const deleteBtn = target.closest('[data-action="delete-student"]');
            if (deleteBtn) {
                e.stopPropagation();
                closeAllMenus();
                const row = target.closest('.student-row');
                const studentId = row?.dataset.studentId;
                if (studentId) this._deleteStudent(studentId, row);
                return;
            }

            // Close menus if clicking elsewhere
            closeAllMenus();

            // Toggle appreciation column visibility (click on header)
            const toggleHeader = target.closest('.appreciation-toggle-header');
            if (toggleHeader) {
                e.stopPropagation();
                this._toggleAppreciationColumn(listContainer);
                return;
            }

            // Avatar selection toggle
            const avatar = target.closest('.student-avatar');
            if (avatar) {
                e.stopPropagation();
                const studentId = avatar.dataset.studentId;
                if (studentId) {
                    this._handleSelectionInteraction(studentId, e);
                }
                return;
            }

            // Click anywhere on the row -> Open Focus Panel OR Select if modifiers used
            const row = target.closest('.student-row');
            // Prevent opening if clicking on sortable headers, etc.
            if (row && !target.closest('.action-dropdown') && !target.closest('.sortable-header') && !target.closest('a') && !target.closest('input')) {
                const studentId = row.dataset.studentId;

                // [NEW] Handle Selection Modifiers (Ctrl/Shift)
                if (studentId && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                    // Prevent text selection during shift-click
                    if (e.shiftKey) {
                        e.preventDefault();
                        const selection = window.getSelection();
                        if (selection) selection.removeAllRanges();
                    }
                    this._handleSelectionInteraction(studentId, e);
                    return; // Stop here, don't open focus panel
                }

                if (studentId) FocusPanelManager.open(studentId);
            }
        });

        // Right click (context menu) on student row to open actions menu
        listContainer.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('.student-row');
            // Allow default context menu on inputs/links/text-selection or if no row found
            if (!row || e.target.closest('a') || e.target.closest('input')) return;

            // Allow text selection context menu if text is selected
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) return;

            e.preventDefault();
            e.stopPropagation();

            const menuBtn = row.querySelector('[data-action="toggle-menu"]');
            if (menuBtn) {
                const dropdown = menuBtn.closest('.action-dropdown');
                const menu = dropdown?.querySelector('.action-dropdown-menu');

                closeAllMenus();

                // Cancel pending cleanup
                if (menu.dataset.closeTimeout) {
                    clearTimeout(parseInt(menu.dataset.closeTimeout));
                    delete menu.dataset.closeTimeout;
                }

                // Position at mouse cursor [USER REQUEST]
                // Use absolute positioning relative to parent so it follows scroll
                const rect = dropdown.getBoundingClientRect();
                const relX = e.clientX - rect.left;
                const relY = e.clientY - rect.top;

                menu.style.position = 'absolute';
                menu.style.top = `${relY}px`;
                menu.style.left = `${relX}px`;
                // CRITICAL FIX: Override 'right: 0' from CSS to prevent stretching
                menu.style.right = 'auto';
                menu.style.width = 'max-content';
                menu.style.zIndex = '9999';

                menu?.classList.add('open');
            }
        });

        // Close menus on escape key
        // CRITICAL FIX: Remove previous listener to prevent accumulation
        // Global shortcuts (Escape, Delete)
        if (this._activeKeydownListener) {
            document.removeEventListener('keydown', this._activeKeydownListener);
        }
        this._activeKeydownListener = (e) => {
            if (e.key === 'Escape') {
                // Priority 1: Close menus if any are open
                const openMenus = listContainer.querySelectorAll('.action-dropdown-menu.open, .global-actions-dropdown-menu.open');
                if (openMenus.length > 0) {
                    closeAllMenus();
                }
                // Priority 2: Clear selections if no menu was open
                else if (this._selectedIds.size > 0) {
                    this.clearSelections();
                }
            }

            // Delete key shortcut for bulk delete
            if (e.key === 'Delete' && this._selectedIds.size > 0) {
                // Ignore if user is typing in an input
                const tag = document.activeElement.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;

                e.preventDefault();
                this._handleBulkAction('delete');
            }

            // Ctrl+A: Select All
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                // Ignore if user is typing in an input
                const tag = document.activeElement.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;

                e.preventDefault();
                this.toggleSelectVisible(true);
            }
        };
        document.addEventListener('keydown', this._activeKeydownListener);

        // [FIX] Prevent native text selection/blue rectangle when using Shift+Click
        listContainer.addEventListener('mousedown', (e) => {
            if (e.shiftKey && e.target.closest('.student-row')) {
                // Don't prevent if user is clicking on an input
                if (e.target.closest('input') || e.target.closest('textarea')) return;

                e.preventDefault();
            }
        });

        // Keyboard navigation - Enter/Space opens Focus Panel
        listContainer.querySelectorAll('.student-row').forEach(row => {
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const studentId = row.dataset.studentId;
                    if (studentId) FocusPanelManager.open(studentId);
                }
            });
        });

        // (Avatar click delegation removed - consolidated above)

        // === GLOBAL ACTIONS DROPDOWN LISTENERS ===
        // These are dynamically created in the table header, so we attach them here
        this._attachGlobalActionsListeners(listContainer, closeAllMenus);
    },

    /**
     * Gère l'interaction de sélection avec support Shift/Ctrl
     * @param {string} studentId 
     * @param {Event} e 
     */
    _handleSelectionInteraction(studentId, e) {
        if (!studentId) return;

        // Shift + Click : Range selection
        if (e.shiftKey && this._lastSelectedId) {
            this._selectRange(this._lastSelectedId, studentId);
            return;
        }

        // Standard toggle (Ctrl or simple click on avatar)
        this.toggleSelection(studentId);
    },

    /**
     * Sélectionne une plage d'élèves
     * @param {string} startId 
     * @param {string} endId 
     */
    _selectRange(startId, endId) {
        // [OPTIMIZATION] Get rows directly from table body
        const tbody = document.querySelector('.student-list-table tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('.student-row'));
        const startIndex = rows.findIndex(r => r.dataset.studentId === startId);
        const endIndex = rows.findIndex(r => r.dataset.studentId === endId);

        if (startIndex === -1 || endIndex === -1) return;

        const [low, high] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

        // Select all in range
        let changed = false;
        for (let i = low; i <= high; i++) {
            const id = rows[i].dataset.studentId;
            if (!this._selectedIds.has(id)) {
                this._selectedIds.add(id);
                this._updateSelectionUI(id, false); // Don't updating toolbar yet
                changed = true;
            }
        }

        if (changed) this._updateToolbarState();

        // Update last selected to the end of range
        this._lastSelectedId = endId;
    },

    /**
     * Bascule l'état de sélection d'un élève
     * @param {string} studentId 
     */
    toggleSelection(studentId) {
        if (!studentId) return;

        if (this._selectedIds.has(studentId)) {
            this._selectedIds.delete(studentId);
        } else {
            this._selectedIds.add(studentId);
        }
        this._lastSelectedId = studentId; // Update anchor for range selection

        this._updateSelectionUI(studentId);
    },

    /**
     * Tout sélectionner ou tout désélectionner (visibles)
     * @param {boolean} selectAll 
     */
    toggleSelectVisible(selectAll = true) {
        const rows = document.querySelectorAll('.student-row');
        rows.forEach(row => {
            const id = row.dataset.studentId;
            if (id) {
                if (selectAll) this._selectedIds.add(id);
                else this._selectedIds.delete(id);
                this._updateSelectionUI(id, false); // Update without calling toolbar update every time
            }
        });
        this._updateToolbarState();
    },

    /**
     * Réinitialise les sélections
     */
    clearSelections() {
        this._selectedIds.clear();
        this._updateSelectionUI(null);
    },

    /**
     * Met à jour l'UI suite à un changement de sélection
     * @param {string|null} studentId - ID de l'élève modifié ou null pour tout reset
     * @param {boolean} updateToolbar - Si on doit rafraîchir la barre d'outils
     * @private
     */
    _updateSelectionUI(studentId, updateToolbar = true) {
        if (studentId) {
            const row = document.querySelector(`.student-row[data-student-id="${studentId}"]`);
            if (row) {
                const isSelected = this._selectedIds.has(studentId);
                row.classList.toggle('selected', isSelected);

                const wrapper = row.querySelector('.student-identity-wrapper');
                if (wrapper) wrapper.classList.toggle('selected', isSelected);

                const avatar = row.querySelector('.student-avatar');
                if (avatar) {
                    const student = appState.generatedResults.find(r => r.id === studentId);
                    if (student) {
                        avatar.outerHTML = StudentPhotoManager.getAvatarHTML(student, 'sm', isSelected);
                    }
                }
            }
        } else {
            // Reset all
            const selectedRows = document.querySelectorAll('.student-row.selected');
            selectedRows.forEach(row => {
                row.classList.remove('selected');
                // also wrapper
                const wrapper = row.querySelector('.student-identity-wrapper.selected');
                if (wrapper) wrapper.classList.remove('selected');

                // AND RESET AVATAR
                const studentId = row.dataset.studentId;
                const avatar = row.querySelector('.student-avatar');
                if (avatar && studentId) {
                    const student = appState.generatedResults.find(r => r.id === studentId);
                    if (student) {
                        // Pass false for isSelected since we are clearing
                        avatar.outerHTML = StudentPhotoManager.getAvatarHTML(student, 'sm', false);
                    }
                }
            });
            // Just in case some wrappers are selected but rows are not (cleanup)
            document.querySelectorAll('.student-identity-wrapper.selected').forEach(w => w.classList.remove('selected'));
        }

        if (updateToolbar) {
            this._updateToolbarState();
        }
    },

    /**
     * Gère l'affichage de la barre d'outils de sélection
     * @private
     */
    _updateToolbarState() {
        const count = this._selectedIds.size;
        let toolbar = document.getElementById('selectionToolbar');

        if (count > 0) {
            if (!toolbar) {
                toolbar = this._createSelectionToolbar();
                document.body.appendChild(toolbar);

                // Initialize tooltips for the new toolbar
                // Import dynamically to avoid circular dependencies or load order issues
                import('./TooltipsManager.js').then(({ TooltipsUI }) => {
                    TooltipsUI.initTooltips();
                });

                // Trigger animation
                requestAnimationFrame(() => toolbar.classList.add('active'));
            }

            const countLabel = toolbar.querySelector('#selectionCount');
            if (countLabel) countLabel.textContent = `${count} ${count > 1 ? 'élèves sélectionnés' : 'élève sélectionné'}`;

            const selectAllLink = toolbar.querySelector('#btnSelectAllLink');
            if (selectAllLink) {
                const totalVisible = document.querySelectorAll('.student-row').length;
                selectAllLink.style.display = count >= totalVisible ? 'none' : '';
            }
        } else if (toolbar) {
            toolbar.classList.remove('active');
            setTimeout(() => {
                if (toolbar) toolbar.remove();
            }, 500);
        }
    },

    /**
     * Crée la barre d'outils de sélection contextualisée
     * @returns {HTMLElement}
     * @private
     */
    _createSelectionToolbar() {
        const div = document.createElement('div');
        div.id = 'selectionToolbar';
        div.className = 'selection-toolbar';

        div.innerHTML = `
            <div class="selection-toolbar-content">
                <div class="selection-info">
                    <button class="btn-deselect tooltip" id="btnDeselectAll" data-tooltip="Annuler la sélection">
                        <i class="fas fa-times"></i>
                    </button>
                    <span id="selectionCount">0 élève sélectionné</span>
                    <button class="btn-select-all-link" id="btnSelectAllLink">Tout sélectionner</button>
                </div>
                <div class="selection-actions">
                    <button class="btn-selection-action tooltip" data-bulk-action="regenerate" data-tooltip="Relancer la génération pour la sélection">
                        <i class="fas fa-sync-alt"></i> <span>Régénérer</span>
                    </button>
                    <button class="btn-selection-action tooltip" data-bulk-action="copy" data-tooltip="Copier les appréciations (Presse-papier)">
                        <i class="fas fa-copy"></i> <span>Copier</span>
                    </button>
                    <div class="selection-action-separator"></div>
                    <button class="btn-selection-action tooltip" data-bulk-action="move" data-tooltip="Transférer vers une autre classe">
                        <i class="fas fa-arrow-right-arrow-left"></i> <span>Déplacer</span>
                    </button>
                    <button class="btn-selection-action tooltip" data-bulk-action="reset" data-tooltip="Choisir les données à réinitialiser">
                        <i class="fas fa-rotate-left"></i> <span>Réinitialiser</span>
                    </button>
                    <button class="btn-selection-action danger tooltip" data-bulk-action="delete" data-tooltip="Supprimer définitivement les élèves">
                        <i class="fas fa-trash"></i> <span>Supprimer</span>
                    </button>
                </div>
            </div>
        `;

        // Listeners for toolbar actions
        div.querySelector('#btnDeselectAll').onclick = (e) => {
            e.stopPropagation();
            this.toggleSelectVisible(false);
        };

        div.querySelector('#btnSelectAllLink').onclick = (e) => {
            e.stopPropagation();
            this.toggleSelectVisible(true);
        };

        div.querySelectorAll('[data-bulk-action]').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this._handleBulkAction(btn.dataset.bulkAction);
            };
        });

        return div;
    },

    /**
     * Dispatcher pour les actions de masse
     * @param {string} action 
     * @private
     */
    async _handleBulkAction(action) {
        const ids = Array.from(this._selectedIds);
        if (ids.length === 0) return;

        switch (action) {
            case 'delete':
                await this._bulkDelete(ids);
                break;
            case 'regenerate':
                await this._bulkRegenerate(ids);
                break;
            case 'copy':
                await this._bulkCopy(ids);
                break;
            case 'move':
                await this._bulkMove(ids);
                break;
            case 'reset':
                await this._bulkReset(ids);
                break;
        }
    },

    async _bulkDelete(ids) {
        const results = appState.generatedResults || [];
        const students = ids.map(id => results.find(r => r.id === id)).filter(Boolean);
        const currentPeriod = appState.currentPeriod;

        // Build smart summary
        const namesPreview = students.slice(0, 5).map(s => `<strong>${s.prenom} ${s.nom}</strong>`);
        const remaining = students.length - namesPreview.length;
        const namesList = namesPreview.join(', ') + (remaining > 0 ? ` et <strong>${remaining} autre${remaining > 1 ? 's' : ''}</strong>` : '');

        // Count data that will be lost
        const withAppreciation = students.filter(s => {
            const app = s.studentData?.periods?.[currentPeriod]?.appreciation || s.appreciation;
            return app && app.replace(/<[^>]*>/g, '').trim().length > 0;
        }).length;
        const withJournal = students.filter(s => s.journal?.length > 0).length;
        const withPhoto = students.filter(s => s.studentPhoto?.data).length;

        const dataLines = [
            withAppreciation > 0 ? `<li>${withAppreciation} appréciation${withAppreciation > 1 ? 's' : ''} générée${withAppreciation > 1 ? 's' : ''}</li>` : '',
            withJournal > 0 ? `<li>${withJournal} journal${withJournal > 1 ? 'x' : ''} de bord</li>` : '',
            withPhoto > 0 ? `<li>${withPhoto} photo${withPhoto > 1 ? 's' : ''}</li>` : ''
        ].filter(Boolean).join('');

        const dataSection = dataLines
            ? `<p class="modal-confirm-detail-label">Données perdues :</p><ul class="modal-confirm-detail-list">${dataLines}</ul>`
            : '';

        const { ModalUI: ModalUIManager } = await import('./ModalUIManager.js');
        const confirmed = await ModalUIManager.showCustomConfirm(
            `<div>
                <p>Supprimer définitivement ${namesList} ?</p>
                ${dataSection}
            </div>`,
            null,
            null,
            {
                title: `Supprimer ${ids.length} élève${ids.length > 1 ? 's' : ''} ?`,
                confirmText: 'Supprimer',
                isDanger: true
            }
        );

        if (confirmed) {
            const { StudentDataManager } = await import('./StudentDataManager.js');
            for (const id of ids) {
                await StudentDataManager.deleteStudent(id);
            }

            const { StorageManager } = await import('./StorageManager.js');
            await StorageManager.saveAppState();

            this.clearSelections();
            this.render(appState.filteredResults, document.getElementById('outputList'));

            const { UI } = await import('./UIManager.js');
            UI?.showNotification(`${ids.length} élève${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}.`, 'success');
        }
    },

    async _bulkMove(ids) {
        ClassUIManager.showMoveStudentsModal(ids, () => {
            this.clearSelections();
        });
    },

    async _bulkRegenerate(ids) {
        const { AppreciationsManager } = await import('./AppreciationsManager.js');
        const { UI } = await import('./UIManager.js');

        UI?.showNotification(`Lancement de la régénération pour ${ids.length} élèves...`, 'info');

        const promises = ids.map(id => AppreciationsManager.regenerateFailedAppreciation(id));
        await Promise.all(promises);

        this.clearSelections();
        UI?.showNotification(`Régénération terminée pour les élèves sélectionnés.`, 'success');
    },

    async _bulkCopy(ids) {
        const { ExportManager } = await import('./ExportManager.js');
        const count = await ExportManager.copyBulkAppreciations(ids);
        if (count > 0) {
            this.clearSelections();
            const { UI } = await import('./UIManager.js');
            UI?.showNotification(`${count} appréciation${count > 1 ? 's' : ''} copiée${count > 1 ? 's' : ''}.`, 'success');
        }
    },

    /**
     * Copie l'appréciation d'un seul élève dans le presse-papier
     * @param {string} studentId
     * @private
     */
    async _copySingleAppreciation(studentId) {
        const { ExportManager } = await import('./ExportManager.js');
        const count = await ExportManager.copyBulkAppreciations([studentId]);
        const { UI } = await import('./UIManager.js');
        if (count > 0) {
            UI?.showNotification('Appréciation copiée.', 'success');
        } else {
            UI?.showNotification('Aucune appréciation à copier.', 'info');
        }
    },

    /**
     * Réinitialisation sélective via modale à choix multiples
     * Fusionne les anciennes actions Effacer + Vider contexte
     * @param {Array<string>} ids - IDs des élèves
     * @private
     */
    async _bulkReset(ids) {
        const { ModalUI: ModalUIManager } = await import('./ModalUIManager.js');
        const results = appState.generatedResults || [];
        const currentPeriod = appState.currentPeriod;
        const isSingle = ids.length === 1;

        // Count existing data for dynamic sublabels
        const students = ids.map(id => results.find(r => r.id === id)).filter(Boolean);
        const withAppreciation = students.filter(s => {
            const app = s.studentData?.periods?.[currentPeriod]?.appreciation || s.appreciation;
            return app && app.replace(/<[^>]*>/g, '').trim().length > 0;
        }).length;
        const withJournal = students.filter(s => s.journal?.length > 0).length;
        const withContext = students.filter(s => s.studentData?.periods?.[currentPeriod]?.context).length;
        const withPhoto = students.filter(s => s.studentPhoto?.data).length;

        const choices = [
            {
                id: 'appreciation',
                label: 'Appréciations',
                sublabel: withAppreciation > 0
                    ? `Efface le texte généré (${withAppreciation} élève${withAppreciation > 1 ? 's' : ''} concerné${withAppreciation > 1 ? 's' : ''}). Notes et données conservées.`
                    : 'Aucune appréciation à effacer.',
                checked: withAppreciation > 0,
                disabled: withAppreciation === 0
            },
            {
                id: 'journal',
                label: 'Journal de bord',
                sublabel: withJournal > 0
                    ? `Efface les observations et gommettes (${withJournal} élève${withJournal > 1 ? 's' : ''}).`
                    : 'Aucun journal à effacer.',
                checked: false,
                disabled: withJournal === 0
            },
            {
                id: 'context',
                label: 'Notes de contexte',
                sublabel: withContext > 0
                    ? `Efface le texte du champ « Contexte » pour ${appState.currentPeriod} (${withContext} élève${withContext > 1 ? 's' : ''}).`
                    : 'Aucune note de contexte.',
                checked: false,
                disabled: withContext === 0
            },
            {
                id: 'photo',
                label: 'Photos',
                sublabel: withPhoto > 0
                    ? `Supprime ${withPhoto} photo${withPhoto > 1 ? 's' : ''} de profil.`
                    : 'Aucune photo à supprimer.',
                checked: false,
                disabled: withPhoto === 0
            }
        ];

        const studentLabel = isSingle
            ? `<strong>${students[0]?.prenom} ${students[0]?.nom}</strong>`
            : `<strong>${ids.length} élèves</strong>`;

        const { confirmed, values } = await ModalUIManager.showChoicesModal(
            'Réinitialiser',
            `Choisissez les données à effacer pour ${studentLabel} :`,
            choices,
            {
                confirmText: 'Réinitialiser',
                cancelText: 'Annuler',
                isDanger: true,
                iconClass: 'fa-rotate-left'
            }
        );

        if (!confirmed) return;

        const clearAppreciation = values.appreciation;
        const clearJournal = values.journal;
        const clearContext = values.context;
        const clearPhoto = values.photo;

        if (!clearAppreciation && !clearJournal && !clearContext && !clearPhoto) return;

        // Snapshot data before mutation (for undo)
        const snapshots = new Map();
        ids.forEach(id => {
            const student = results.find(r => r.id === id);
            if (!student) return;
            snapshots.set(id, {
                appreciation: student.appreciation,
                periodAppreciation: student.studentData?.periods?.[currentPeriod]?.appreciation,
                periodLastModified: student.studentData?.periods?.[currentPeriod]?._lastModified,
                lastModified: student._lastModified,
                copied: student.copied,
                journal: student.journal ? [...student.journal] : [],
                context: student.studentData?.periods?.[currentPeriod]?.context,
                studentPhoto: student.studentPhoto ? { ...student.studentPhoto } : null
            });
        });

        // Execute mutation
        const now = Date.now();
        const counts = { appreciation: 0, journal: 0, context: 0, photo: 0 };

        ids.forEach(id => {
            const student = results.find(r => r.id === id);
            if (!student) return;

            if (clearAppreciation) {
                const app = student.studentData?.periods?.[currentPeriod]?.appreciation || student.appreciation;
                if (app && app.replace(/<[^>]*>/g, '').trim().length > 0) {
                    student.appreciation = '';
                    if (student.studentData?.periods?.[currentPeriod]) {
                        student.studentData.periods[currentPeriod].appreciation = '';
                        student.studentData.periods[currentPeriod]._lastModified = now;
                    }
                    student._lastModified = now;
                    student.copied = false;
                    counts.appreciation++;
                }
            }

            if (clearJournal && student.journal?.length > 0) {
                student.journal = [];
                counts.journal++;
            }

            if (clearContext && student.studentData?.periods?.[currentPeriod]?.context) {
                student.studentData.periods[currentPeriod].context = '';
                counts.context++;
            }

            if (clearPhoto && student.studentPhoto?.data) {
                student.studentPhoto = null;
                student._lastModified = now;
                counts.photo++;
            }

            this.updateStudentRow(id);
        });

        const totalCleared = Object.values(counts).reduce((sum, c) => sum + c, 0);

        if (totalCleared > 0) {
            const { StorageManager } = await import('./StorageManager.js');
            const { UI } = await import('./UIManager.js');
            await StorageManager.saveAppState();
            UI?.updateStats?.();
            const parts = [];
            if (counts.appreciation > 0) parts.push(`${counts.appreciation} appréciation${counts.appreciation > 1 ? 's' : ''}`);
            if (counts.journal > 0) parts.push(`${counts.journal} journal${counts.journal > 1 ? 'x' : ''}`);
            if (counts.context > 0) parts.push(`${counts.context} contexte${counts.context > 1 ? 's' : ''}`);
            if (counts.photo > 0) parts.push(`${counts.photo} photo${counts.photo > 1 ? 's' : ''}`);

            // Show undo toast instead of simple notification
            UI?.showUndoNotification(
                `Réinitialisé : ${parts.join(', ')}.`,
                async () => {
                    // Restore snapshot
                    for (const [id, snap] of snapshots) {
                        const student = results.find(r => r.id === id);
                        if (!student) continue;

                        if (clearAppreciation) {
                            student.appreciation = snap.appreciation;
                            if (student.studentData?.periods?.[currentPeriod]) {
                                student.studentData.periods[currentPeriod].appreciation = snap.periodAppreciation;
                                student.studentData.periods[currentPeriod]._lastModified = snap.periodLastModified;
                            }
                            student._lastModified = snap.lastModified;
                            student.copied = snap.copied;
                        }

                        if (clearJournal) {
                            student.journal = snap.journal;
                        }

                        if (clearContext && student.studentData?.periods?.[currentPeriod]) {
                            student.studentData.periods[currentPeriod].context = snap.context;
                        }

                        if (clearPhoto) {
                            student.studentPhoto = snap.studentPhoto;
                            student._lastModified = snap.lastModified;
                        }

                        this.updateStudentRow(id);
                    }

                    await StorageManager.saveAppState();
                    UI?.updateStats?.();
                    UI?.showNotification('Réinitialisation annulée.', 'success');
                },
                { type: 'warning' }
            );
        }

        if (ids.length > 1) this.clearSelections();
    },

    /**
     * Attache les listeners pour les actions globales (export, copie, etc.)
     * @param {HTMLElement} listContainer - Conteneur de la liste
     * @param {Function} closeAllMenus - Fonction pour fermer tous les menus
     * @private
     */
    _attachGlobalActionsListeners(listContainer, closeAllMenus) {
        // Helper pour ajouter un listener qui ferme le menu
        const addAction = (selector, handler) => {
            const btn = listContainer.querySelector(selector);
            if (btn) {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    closeAllMenus();
                    await handler();
                });
            }
        };

        // Import dynamique des dépendances
        import('./AppreciationsManager.js').then(({ AppreciationsManager }) => {
            import('./StorageManager.js').then(({ StorageManager }) => {
                import('./EventHandlersManager.js').then(({ EventHandlersManager }) => {
                    // Selection
                    addAction('#selectAllBtn-global', () => this.toggleSelectVisible(true));

                    // Maintenance - Moved to toolbar

                    // Export
                    addAction('#exportJsonBtn', () => StorageManager.exportToJson());
                    addAction('#exportCsvBtn', AppreciationsManager.exportToCsv);
                    addAction('#exportPdfBtn', AppreciationsManager.exportToPdf);

                    // Analyze class (in dropdown menu)
                    import('./ClassDashboardManager.js').then(({ ClassDashboardManager }) => {
                        addAction('#analyzeClassBtn-shortcut', () => ClassDashboardManager.openDashboard());
                    });
                });
            });
        });

        // Attach inline search listeners
        this._attachInlineSearchListeners(listContainer);
    },

    /**
     * Attache les listeners pour la recherche inline dans l'entête du tableau
     * @param {HTMLElement} listContainer - Conteneur de la liste
     * @private
     */
    _attachInlineSearchListeners(listContainer) {
        // CLEANUP: Remove previous popstate listener to avoid accumulation
        if (this._activePopstateListener) {
            window.removeEventListener('popstate', this._activePopstateListener);
            this._activePopstateListener = null;
        }

        const nameHeader = listContainer.querySelector('.name-header-with-search');
        const headerContent = listContainer.querySelector('#nameHeaderContent');
        const searchContainer = listContainer.querySelector('#inlineSearchContainer');
        const searchInput = listContainer.querySelector('#inlineSearchInput');
        const searchClear = listContainer.querySelector('#inlineSearchClear');

        if (!nameHeader || !searchContainer || !searchInput) return;

        // Perform UI update for activation (without history push)
        const _performActivateUI = () => {
            searchContainer.classList.add('active');
            // Small delay to ensure transition starts and element is focusable
            setTimeout(() => {
                searchInput.focus();
            }, 50);

            // Sync with existing search value if any
            const existingInput = document.getElementById('searchInput');
            if (existingInput && existingInput.value) {
                searchInput.value = existingInput.value;
                searchContainer.classList.add('has-value');
            }
        };

        // Perform UI update for deactivation (without history manipulation)
        const _performDeactivateUI = () => {
            searchContainer.classList.remove('active');
            if (!searchInput.value) {
                searchContainer.classList.remove('has-value');
            }
        };

        // Helper to activate search mode (With History Push)
        const activateSearch = () => {
            if (searchContainer.classList.contains('active')) return;

            _performActivateUI();

            // HISTORY PUSH: Use HistoryManager for safe navigation
            // Permet de fermer la recherche avec le bouton retour du mobile
            HistoryManager.pushCustomState({ inlineSearch: true });
        };

        // Helper to deactivate search mode (With History Check)
        const deactivateSearch = () => {
            _performDeactivateUI();

            // CRITICAL: Do NOT call history.back() here! It can navigate to landing page.
            // Instead, replace the current state to "neutralize" it.
            if (history.state && history.state.inlineSearch) {
                HistoryManager.replaceCurrentState({ appBase: true, consumed: true });
            }
        };

        // EVENT: Popstate (Back Button) [NEW]
        this._activePopstateListener = (e) => {
            const isSearchState = e.state && e.state.inlineSearch;
            const isVisible = searchContainer.classList.contains('active');

            if (!isSearchState && isVisible) {
                // On est revenu en arrière (plus d'état local) -> on ferme
                _performDeactivateUI();
            } else if (isSearchState && !isVisible) {
                // On est revenu en avant (ou refresh) -> on rouvre
                _performActivateUI();
            }
        };
        window.addEventListener('popstate', this._activePopstateListener);

        // Click on search trigger button to activate search
        const searchTrigger = listContainer.querySelector('#inlineSearchTrigger');
        if (searchTrigger) {
            searchTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                activateSearch();
            });
        }

        // Prevent clicks inside search container from triggering sort
        searchContainer.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Also auto-focus the input when search container is clicked
        searchContainer.addEventListener('mousedown', (e) => {
            // If clicking anywhere in container, focus the input
            if (e.target !== searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
        });

        // Input event - filter as user types
        searchInput.addEventListener('input', (e) => {
            const value = e.target.value;
            searchContainer.classList.toggle('has-value', value.length > 0);

            // Sync with the existing searchInput in toolbar (for backward compatibility)
            const existingInput = document.getElementById('searchInput');
            if (existingInput) {
                existingInput.value = value;
                existingInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Clear button
        if (searchClear) {
            searchClear.addEventListener('click', (e) => {
                e.stopPropagation();
                searchInput.value = '';
                searchContainer.classList.remove('has-value');

                // Sync clear with existing search
                const existingInput = document.getElementById('searchInput');
                if (existingInput) {
                    existingInput.value = '';
                    existingInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        }

        // Escape to close search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                // Clear search when pressing Escape twice, or deactivate if empty
                if (!searchInput.value) {
                    deactivateSearch();
                } else {
                    searchInput.value = '';
                    searchContainer.classList.remove('has-value');
                    // Sync clear
                    const existingInput = document.getElementById('searchInput');
                    if (existingInput) {
                        existingInput.value = '';
                        existingInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        });

        // Click outside to deactivate (if empty)
        document.addEventListener('click', (e) => {
            if (!nameHeader.contains(e.target) && !searchInput.value) {
                if (searchContainer.classList.contains('active')) {
                    deactivateSearch();
                }
            }
        });

        // Ctrl+F keyboard shortcut to activate search
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                // Only intercept if the list view is visible
                if (listContainer.offsetParent !== null) {
                    e.preventDefault();
                    activateSearch();
                }
            }
        });
    },

    /**
     * Supprime un élève avec confirmation
     * @param {string} studentId - ID de l'élève
     * @param {HTMLElement} row - Ligne du tableau
     * @private
     */
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
        const { ModalUI } = await import('./ModalUIManager.js');
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
        const { StudentDataManager } = await import('./StudentDataManager.js');
        await StudentDataManager.deleteStudent(studentId);

        // Save state
        const { StorageManager } = await import('./StorageManager.js');
        await StorageManager.saveAppState();

        // Render with standard FLIP animation
        this.render(appState.filteredResults, document.getElementById('outputList'));

        // Update global UI
        const { UI } = await import('./UIManager.js');
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
            const { UI } = await import('./UIManager.js');
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
            appreciationCell.innerHTML = this._getAppreciationCell(result, 'done');
        }
    },

    /**
     * Generates the HTML for the appreciation skeleton loader.
     * @param {string} [label] - Optional custom label for the skeleton badge.
     * @param {boolean} [pending=false] - Whether it shows pending state.
     * @returns {string} HTML string.
     * @private
     */
    _getAppreciationSkeletonHTML(label, pending = false) {
        return Utils.getSkeletonHTML(true, label, pending);
    },

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

        // Toggle UI
        if (isFullView) {
            // COLLAPSE: Return to truncated view
            table.classList.remove('appreciation-full-view');
            header?.classList.remove('expanded-view');
            header.title = 'Voir tout le texte';

            // Switch to Expand icon
            if (icon) {
                icon.classList.remove('fa-compress');
                icon.classList.add('fa-expand');
            }

            // Update State & Persistence
            appState.isAppreciationFullView = false;
        } else {
            // EXPAND: Show full text
            table.classList.add('appreciation-full-view');
            header?.classList.add('expanded-view');
            header.title = 'Réduire';

            // Switch to Compress icon
            if (icon) {
                icon.classList.remove('fa-expand');
                icon.classList.add('fa-compress');
            }

            // Update State & Persistence
            appState.isAppreciationFullView = true;
        }

        // Save preference
        import('./StorageManager.js').then(({ StorageManager }) => {
            StorageManager.saveAppState();
        });
    }
};

