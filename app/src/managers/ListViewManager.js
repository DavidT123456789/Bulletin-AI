/**
 * @fileoverview List View Manager - Rend les √©l√®ves en vue tableau
 * Part of Liste + Focus UX Revolution - REFACTORED: Inline Appreciation Display
 * @module managers/ListViewManager
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
// ResultCardsUI removed - logic moved to Utils
import { ClassUIManager } from './ClassUIManager.js';
import { StatsUI } from './StatsUIManager.js';

/**
 * Module de gestion de la vue Liste (tableau des √©l√®ves)
 * @namespace ListViewManager
 */
export const ListViewManager = {
    _activeDocClickListener: null,
    _activeKeydownListener: null,
    _lastRenderedClassId: null, // Track class changes to force fresh render
    /**
     * Rend la liste des ÈlËves en format tableau
     * @param {Array} results - Tableau des rÈsultats ‡ afficher
     * @param {HTMLElement} container - Conteneur DOM
     */
    render(results, container) {
        // Cleanup previous document listener if exists
        if (this._activeDocClickListener) {
            document.removeEventListener('click', this._activeDocClickListener, true);
            this._activeDocClickListener = null;
        }

        if (!container) return;

        // Handle empty results
        if (results.length === 0) {
            // Animate out existing rows if any
            const existingRows = container.querySelectorAll('.student-row');
            if (existingRows.length > 0) {
                this._animateRowsOut(existingRows, () => {
                    container.innerHTML = '';
                });
            } else {
                container.innerHTML = '';
            }
            return;
        }

        const currentPeriod = appState.currentPeriod;
        const periods = Utils.getPeriods() || ['T1', 'T2', 'T3'];
        const currentPeriodIndex = Math.max(0, periods.indexOf(currentPeriod));

        // CRITICAL FIX: Force fresh render when class changes
        // This ensures event listeners are properly attached after class switch
        const currentClassId = appState.currentClassId;
        const classChanged = this._lastRenderedClassId !== null && this._lastRenderedClassId !== currentClassId;
        this._lastRenderedClassId = currentClassId;

        if (classChanged) {
            // Class changed - force fresh render to reattach all event listeners
            this._renderFresh(container, results, periods, currentPeriodIndex);
            return;
        }

        // Check if this is a filter/sort transition (table already exists)
        const existingTable = container.querySelector('.student-list-table');
        const existingRows = existingTable ? Array.from(existingTable.querySelectorAll('.student-row')) : [];

        // Clean up any stuck animation classes from previous animations
        existingRows.forEach(row => {
            row.classList.remove('row-move', 'row-moving', 'row-exit', 'row-filter-enter');
            row.style.transform = '';
            row.style.transition = '';
        });

        if (existingRows.length > 0) {
            const existingIds = existingRows.map(r => r.dataset.studentId);
            const newIds = results.map(r => r.id);

            // Check if there's any actual change
            const hasIdChange = existingIds.length !== newIds.length ||
                existingIds.some(id => !newIds.includes(id)) ||
                newIds.some(id => !existingIds.includes(id));

            const hasOrderChange = !hasIdChange &&
                existingIds.some((id, i) => id !== newIds[i]);

            if (hasIdChange) {
                // Filter change: use FLIP animation
                this._animateFilterTransition(container, existingRows, results, periods, currentPeriodIndex);
                return;
            } else if (hasOrderChange) {
                // Sort change: use simple reorder
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
     * @param {Array} newResults - Nouveaux rÈsultats filtrÈs
     * @param {Array} periods - PÈriodes
     * @param {number} currentPeriodIndex - Index de la pÈriode courante
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
        setTimeout(() => {
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
                this._attachEventListeners(viewElement);
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
     * Animation simple pour le tri (rÈordonnancement sans changement d'IDs)
     * @param {HTMLElement} container - Conteneur DOM
     * @param {Array} existingRows - Lignes existantes
     * @param {Array} newResults - Nouveaux rÈsultats triÈs
     * @param {Array} periods - PÈriodes
     * @param {number} currentPeriodIndex - Index de la pÈriode courante
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
     * @param {NodeList} rows - Lignes ‡ animer
     * @param {Function} callback - Callback aprËs animation
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
     * CrÈe un ÈlÈment TR pour une ligne d'ÈlËve
     * @param {Object} result - DonnÈes de l'ÈlËve
     * @param {Array} periods - PÈriodes
     * @param {number} currentPeriodIndex - Index pÈriode courante
     * @returns {HTMLElement} …lÈment TR
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
        const avatarHTML = StudentPhotoManager.getAvatarHTML(result, 'sm');

        tr.innerHTML = `
            <td class="student-name-cell">
                <div class="student-identity-wrapper">
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
                    <div class="action-dropdown-menu">
                        <button class="action-dropdown-item" data-action="move-student">
                            <i class="fas fa-arrow-right-arrow-left"></i> DÈplacer
                        </button>
                        <button class="action-dropdown-item danger" data-action="delete-student">
                            <i class="fas fa-trash"></i> Supprimer
                        </button>
                    </div>
                </div>
            </td>
        `;

        return tr;
    },

    /**
     * Met ‡ jour le contenu d'une ligne existante
     * @param {HTMLElement} row - Ligne ‡ mettre ‡ jour
     * @param {Object} result - Nouvelles donnÈes
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
    },

    /**
     * Rendu initial complet de la liste
     * @param {HTMLElement} container - Conteneur
     * @param {Array} results - RÈsultats
     * @param {Array} periods - PÈriodes
     * @param {number} currentPeriodIndex - Index pÈriode courante
     * @private
     */
    _renderFresh(container, results, periods, currentPeriodIndex) {
        // Build table HTML (no animation classes in HTML - we'll add them after)
        let html = `
            <div class="student-list-view">
                <table class="student-list-table">
                    <thead>
                        <tr>
                            <th class="sortable-header" data-sort-field="name" title="Trier par nom">
                                <div class="header-content-wrapper">
                                    Nom <span class="sort-icon-placeholder name-sort-icon"></span>
                                </div>
                            </th>
                            <th class="sortable-header" data-sort-field="status" title="Trier par statut" style="width: 120px;">
                                <div class="header-content-wrapper">
                                    Statut<span class="sort-icon-placeholder"></span>
                                </div>
                            </th>
                            ${this._renderGradeHeaders(periods.slice(0, currentPeriodIndex + 1))}
                            <th class="appreciation-header appreciation-toggle-header sortable-header" title="Cliquer pour voir tout le texte">
                                <span id="avgWordsChip" class="detail-chip" data-tooltip="Nombre moyen de mots" style="display:none"></span>
                                <div class="header-content-wrapper">
                                    ApprÈciation
                                    <i class="fas fa-expand appreciation-toggle-icon"></i>
                                </div>
                            </th>
                            <th class="action-header" style="width: 50px;">
                                <div class="header-content-wrapper global-actions-dropdown">
                                    <button class="btn-action-menu-header" id="tableActionsBtnToggle" title="Actions">
                                        <i class="fas fa-ellipsis-vertical"></i>
                                    </button>
                                    <div class="global-actions-dropdown-menu" id="tableActionsDropdown">
                                        <h5 class="dropdown-header"><i class="fas fa-users"></i> Actions sur les ÈlËves</h5>
                                        <button class="action-dropdown-item" id="copyAllBtn-shortcut">
                                            <i class="fas fa-copy"></i> Copier les visibles
                                        </button>
                                        <button class="action-dropdown-item" id="regenerateAllBtn">
                                            <i class="fas fa-sync-alt"></i> RÈgÈnÈrer les visibles
                                        </button>
                                        <button class="action-dropdown-item" id="regenerateErrorsBtn-shortcut" style="display:none;">
                                            <i class="fas fa-exclamation-triangle"></i> RÈgÈnÈrer les erreurs
                                        </button>
                                        <h5 class="dropdown-header"><i class="fas fa-download"></i> Exporter</h5>
                                        <button class="action-dropdown-item" id="exportJsonBtn">
                                            <i class="fas fa-file-code"></i> DonnÈes (JSON)
                                        </button>
                                        <button class="action-dropdown-item" id="exportCsvBtn">
                                            <i class="fas fa-file-csv"></i> Tableau (CSV)
                                        </button>
                                        <button class="action-dropdown-item" id="exportPdfBtn">
                                            <i class="fas fa-file-pdf"></i> Imprimer / PDF
                                        </button>
                                        <div class="dropdown-divider danger-divider"></div>
                                        <button class="action-dropdown-item danger" id="clearAllResultsBtn-shortcut">
                                            <i class="fas fa-trash-alt"></i> Effacer les visibles
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

                // Generate avatar HTML
                const avatarHTML = StudentPhotoManager.getAvatarHTML(result, 'sm');

                html += `
                    <tr data-student-id="${result.id}" class="student-row" tabindex="0">
                        <td class="student-name-cell">
                            <div class="student-identity-wrapper">
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
                                <div class="action-dropdown-menu">
                                    <button class="action-dropdown-item" data-action="move-student">
                                        <i class="fas fa-arrow-right-arrow-left"></i> DÈplacer
                                    </button>
                                    <button class="action-dropdown-item danger" data-action="delete-student">
                                        <i class="fas fa-trash"></i> Supprimer
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            } catch (e) {
                console.error("Erreur rendu ÈlËve:", result?.nom, e);
                html += `
                    <tr class="error-row">
                        <td colspan="100%">Erreur d'affichage pour ${result?.nom || '…lËve inconnu'}</td>
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
     * G√©n√®re les headers de notes avec colonnes d'√©volution
     * @param {Array} periods - P√©riodes √† afficher
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

            // Colonne d'Èvolution (sauf aprËs la derniËre pÈriode)
            if (i < periods.length - 1) {
                // Evolution is relevant to the NEXT period (target period)
                const nextP = periods[i + 1];
                html += `<th class="evolution-header sortable-header" data-sort-field="evolution" data-sort-param="${nextP}" title="Trier par Èvolution vers ${nextP}">
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
     * Rend les cellules de notes pour un √©l√®ve avec colonnes d'√©volution s√©par√©es
     * @param {Object} periods - Donn√©es par p√©riode
     * @param {Array} allPeriods - Liste de toutes les p√©riodes
     * @param {number} currentIndex - Index de la p√©riode courante
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
                let gradeClass = '';

                if (grade !== null) {
                    gradeClass = Utils.getGradeClass(grade);
                }

                // Cellule de note
                html += `
                    <td class="grade-cell">
                        <div class="grade-content-wrapper">
                        ${grade !== null
                        ? `<span class="grade-value ${gradeClass}">${grade.toFixed(1).replace('.', ',')}</span>`
                        : `<span class="grade-empty">--</span>`
                    }
                        </div>
                    </td>
                `;

                // Cellule d'√©volution (entre cette note et la suivante)
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
     * D√©termine le statut d'un r√©sultat
     * @param {Object} result - Donn√©es de l'√©l√®ve
     * @returns {string} 'done' | 'pending' | 'error'
     * @private
     */
    _getStatus(result) {
        if (result.errorMessage) return 'error';
        if (result.appreciation && !result.isPending) return 'done';
        return 'pending';
    },

    /**
     * G√©n√®re le contenu de la cellule d'appr√©ciation
     * Affiche l'appr√©ciation tronqu√©e si disponible, sinon le badge de statut
     * @param {Object} result - Donn√©es de l'√©l√®ve
     * @param {string} status - Statut de g√©n√©ration (global)
     * @returns {string} HTML de la cellule
     * @private
     */
    _getAppreciationCell(result, status) {
        // [FIX] R√©cup√©rer l'appr√©ciation sp√©cifique √† la p√©riode s√©lectionn√©e
        const currentPeriod = appState.currentPeriod;
        let appreciation = '';

        // 1. Priorit√©: appr√©ciation stock√©e directement dans la p√©riode
        const periodApp = result.studentData?.periods?.[currentPeriod]?.appreciation;
        if (periodApp && typeof periodApp === 'string' && periodApp.trim()) {
            appreciation = periodApp.trim();
        }
        // 2. Fallback: result.appreciation (d√©j√† transform√©e dans renderResults pour la p√©riode courante)
        else if (result.appreciation && typeof result.appreciation === 'string' && result.appreciation.trim()) {
            // V√©rifier que cette appr√©ciation correspond bien √† la p√©riode courante
            // soit via studentData.currentPeriod, soit parce qu'il n'y a qu'une seule p√©riode
            const storedPeriod = result.studentData?.currentPeriod || result.aiGenerationPeriod;
            if (!storedPeriod || storedPeriod === currentPeriod) {
                appreciation = result.appreciation.trim();
            }
        }

        // Si c'est une autre p√©riode, et qu'on n'a rien trouv√©, on n'affiche rien (plut√¥t que l'appr√©ciation d'un autre trimestre)
        // Cela r√©pond √† la demande : "T1 affiche T1".

        // Supprimer les balises HTML pour la v√©rification
        const textOnly = appreciation?.replace(/<[^>]*>/g, '').trim().toLowerCase() || '';

        // V√©rifier que c'est une vraie appr√©ciation, pas un placeholder
        const isPlaceholder = !appreciation ||
            textOnly === '' ||
            textOnly.includes('aucune appr√©ciation') ||
            textOnly.includes('en attente') ||
            textOnly.includes('cliquez sur') ||
            textOnly.startsWith('remplissez');

        // [FIX] On vÈrifie aussi que status n'est pas 'pending' SI c'est la pÈriode active en cours de gÈnÈration
        // Mais ici on veut juste afficher le contenu stockÈ.

        const hasContent = appreciation && !isPlaceholder;

        if (hasContent) {
            // === COPY BUTTON INTEGRATION ===
            const btnClass = result.copied ? 'btn-copy-appreciation was-copied' : 'btn-copy-appreciation';
            const icon = result.copied ? '<i class="fas fa-check"></i>' : '<i class="fas fa-copy"></i>';
            const title = result.copied ? 'ApprÈciation copiÈe' : 'Copier l\'apprÈciation';

            const copyButtonHTML = `
                <button class="${btnClass}" data-action="copy-appreciation" title="${title}" onclick="event.stopPropagation(); AppreciationsManager.copyAppreciation('${result.id}', this)">
                    ${icon}
                </button>
            `;

            return `${copyButtonHTML}<div class="appreciation-preview has-copy-btn" onclick="event.stopPropagation(); this.closest('.appreciation-cell').click();">${appreciation}</div>`;
        }

        // Si pas de contenu, on d√©termine le statut √† afficher
        // Pour les p√©riodes pass√©es sans donn√©e, afficher simplement un tiret
        const storedPeriod = result.studentData?.currentPeriod || result.aiGenerationPeriod;
        // Si l'ÈlËve a une erreur qui concerne la pÈriode affichÈe
        // On affiche l'erreur si: le statut est 'error' ET (pas de pÈriode dÈfinie OU pÈriode == actuelle)
        if (status === 'error' && (!storedPeriod || storedPeriod === currentPeriod)) {
            return this._getStatusBadge('error');
        }

        // Pour les p√©riodes pass√©es sans appr√©ciation, afficher un tiret
        const periods = Utils.getPeriods();
        const currentIndex = periods.indexOf(currentPeriod);
        const periodIndex = periods.indexOf(storedPeriod);

        if (storedPeriod && currentIndex < periodIndex) {
            // On regarde une pÈriode passÈe o˘ l'ÈlËve n'avait pas encore d'apprÈciation
            return '<span class="appreciation-preview empty">&mdash;</span>';
        }

        // Sinon, badge "En attente" pour la p√©riode actuelle
        return this._getStatusBadge('pending');
    },

    /**
     * GÈnËre le badge de statut HTML
     * @param {string} status - Statut ('pending', 'error', 'done')
     * @returns {string} HTML du badge
     * @private
     */
    _getStatusBadge(status) {
        const labels = {
            'pending': 'En attente',
            'error': 'Erreur',
            'done': 'TerminÈ',
            'generating': 'GÈnÈration...'
        };

        // Icons usually handled by CSS or unnecessary for simple badges, 
        // but adding icons for visual consistency if needed.
        const icons = {
            'pending': '<i class="fas fa-hourglass-start"></i>',
            'error': '<i class="fas fa-exclamation-triangle"></i>',
            'done': '<i class="fas fa-check"></i>',
            'generating': '<i class="fas fa-spinner fa-spin"></i>'
        };

        const label = labels[status] || status;
        const icon = icons[status] ? icons[status] + ' ' : '';

        return `<span class="status-badge ${status}">${icon}${label}</span>`;
    },
    /**
     * G√©n√®re le contenu de la colonne Statut (Badges √©l√®ve + Erreurs)
     * @param {Object} result - R√©sultat √©l√®ve
     * @returns {string} HTML des badges
     * @private
     */
    _getStudentStatusCellContent(result) {
        let html = '';

        // Note: Le statut d'erreur de gÈnÈration est affichÈ dans la colonne ApprÈciation,
        // pas dans cette colonne Statut qui est rÈservÈe aux statuts personnels de l'ÈlËve.

        // Statuts ÈlËve (PPRE, DÈlÈguÈ, Nouveau, ULIS, etc.)
        const studentStatuses = result.studentData?.statuses || [];
        // Dedup statuses to be safe
        const uniqueStatuses = [...new Set(studentStatuses)];

        uniqueStatuses.forEach(tag => {
            const badgeInfo = Utils.getStatusBadgeInfo(tag);
            // Use smaller gap/margin for multiple badges
            html += `<span class="${badgeInfo.className}" style="margin: 2px;">${badgeInfo.label}</span>`;
        });

        // Si vide, afficher un tiret trËs subtil (presque invisible)
        if (!html) {
            return '<span style="color:var(--text-tertiary); font-size:10px; opacity:0.4;">&mdash;</span>';
        }

        return `<div class="status-badges-container" style="display:flex; flex-wrap:wrap; justify-content:center; gap:4px;">${html}</div>`;
    },

    /**
     * Attache les event listeners aux √©l√©ments de la liste
     * @param {HTMLElement} listContainer - Le conteneur sp√©cifique de la liste
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

        // Close any open menus when clicking outside
        const closeAllMenus = () => {
            // Fermer les menus d'actions individuelles
            listContainer.querySelectorAll('.action-dropdown-menu.open').forEach(menu => {
                menu.classList.remove('open');
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
                if (studentId) ClassUIManager.showMoveStudentModal(studentId);
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

            // Click anywhere on the row -> Open Focus Panel
            const row = target.closest('.student-row');
            // Prevent opening if clicking on sortable headers (which are in THEAD, but just in case)
            if (row && !target.closest('.action-dropdown') && !target.closest('.sortable-header') && !target.closest('a') && !target.closest('input')) {
                const studentId = row.dataset.studentId;
                if (studentId) FocusPanelManager.open(studentId);
            }
        });

        // Close menus on escape key
        // CRITICAL FIX: Remove previous listener to prevent accumulation
        if (this._activeKeydownListener) {
            document.removeEventListener('keydown', this._activeKeydownListener);
        }
        this._activeKeydownListener = (e) => {
            if (e.key === 'Escape') closeAllMenus();
        };
        document.addEventListener('keydown', this._activeKeydownListener);

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

        // === GLOBAL ACTIONS DROPDOWN LISTENERS ===
        // These are dynamically created in the table header, so we attach them here
        this._attachGlobalActionsListeners(listContainer, closeAllMenus);
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

        // Import dynamique des dÈpendances
        import('./AppreciationsManager.js').then(({ AppreciationsManager }) => {
            import('./StorageManager.js').then(({ StorageManager }) => {
                import('./EventHandlersManager.js').then(({ EventHandlersManager }) => {
                    // Actions sur les ÈlËves
                    addAction('#copyAllBtn-shortcut', AppreciationsManager.copyAllResults);
                    addAction('#regenerateAllBtn', EventHandlersManager.handleRegenerateAllClick);
                    addAction('#regenerateErrorsBtn-shortcut', EventHandlersManager.handleRegenerateErrorsClick);
                    addAction('#clearAllResultsBtn-shortcut', () => AppreciationsManager.clearAllResults());

                    // Export
                    addAction('#exportJsonBtn', () => StorageManager.exportToJson());
                    addAction('#exportCsvBtn', AppreciationsManager.exportToCsv);
                    addAction('#exportPdfBtn', AppreciationsManager.exportToPdf);
                });
            });
        });
    },

    /**
     * Supprime un √©l√®ve avec confirmation
     * @param {string} studentId - ID de l'√©l√®ve
     * @param {HTMLElement} row - Ligne du tableau
     * @private
     */
    /**
     * Supprime un √©l√®ve avec confirmation
     * @param {string} studentId - ID de l'√©l√®ve
     * @param {HTMLElement} row - Ligne du tableau
     * @private
     */
    async _deleteStudent(studentId, row) {
        const student = appState.generatedResults.find(r => r.id === studentId);
        if (!student) return;

        const studentName = `${student.prenom} ${student.nom}`;

        // Simple confirmation via native confirm (or could use UI.showCustomConfirm)
        if (!confirm(`Supprimer l'√©l√®ve "${studentName}" ?`)) return;

        // Animate row removal
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
        row.style.transition = 'all 0.3s ease-out';

        setTimeout(async () => {
            // Remove from arrays
            appState.generatedResults = appState.generatedResults.filter(r => r.id !== studentId);
            appState.filteredResults = appState.filteredResults.filter(r => r.id !== studentId);

            // Remove row from DOM
            row.remove();

            // Persist to storage (IndexedDB + localStorage)
            const { StorageManager } = await import('./StorageManager.js');
            await StorageManager.saveAppState();

            // Update UI elements
            const { UI } = await import('./UIManager.js');
            ClassUIManager.updateStudentCount();       // Compteur dans l'ent√™te
            UI?.populateLoadStudentSelect();           // Menu d√©roulant des √©l√®ves
            UI?.updateStats();                         // Stats globales

            // Notify user
            UI?.showNotification(`${studentName} supprim√©`, 'success');
        }, 300);
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
            appreciationCell.innerHTML = this._getAppreciationSkeletonHTML(label || 'GÈnÈration...', false);
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

        if (isFullView) {
            // COLLAPSE: Return to truncated view
            table.classList.remove('appreciation-full-view');
            header?.classList.remove('expanded-view');
            header.title = 'Cliquer pour voir tout le texte';

            // Switch to Expand icon
            if (icon) {
                icon.classList.remove('fa-compress');
                icon.classList.add('fa-expand');
            }
        } else {
            // EXPAND: Show full text
            table.classList.add('appreciation-full-view');
            header?.classList.add('expanded-view');
            header.title = 'Cliquer pour rÈduire';

            // Switch to Compress icon
            if (icon) {
                icon.classList.remove('fa-expand');
                icon.classList.add('fa-compress');
            }
        }
    }
};
