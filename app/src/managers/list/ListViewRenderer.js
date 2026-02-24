/**
 * @fileoverview List View Renderer
 * Handles HTML rendering and DOM updates for the List View
 */

import { appState } from '../../state/State.js';
import { Utils } from '../../utils/Utils.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { ListSelectionManager } from './ListSelectionManager.js';
import { FocusPanelStatus } from '../FocusPanelStatus.js';
import { ResultsUIManager } from '../ResultsUIManager.js';

export const ListViewRenderer = {

    callbacks: {
        updateSelectionUI: () => { },
        attachEventListeners: () => { }
    },

    init(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
    },

    /**
         * Crée un élément TR pour une ligne d'élève
         * @param {Object} result - Données de l'élève
         * @param {Array} periods - Périodes
         * @param {number} currentPeriodIndex - Index période courante
         * @returns {HTMLElement} Élément TR
         * @private
         */
    createRowElement(result, periods, currentPeriodIndex) {
        const tr = document.createElement('tr');
        tr.dataset.studentId = result.id;
        tr.className = 'student-row';
        tr.tabIndex = 0;

        const studentData = result.studentData || {};
        const appreciationCell = this.getAppreciationCell(result);
        const isSelected = ListSelectionManager.selectedIds.has(result.id);
        const avatarHTML = StudentPhotoManager.getAvatarHTML(result, 'sm', isSelected);

        tr.innerHTML = `
            <td class="student-name-cell">
                <div class="student-identity-wrapper ${isSelected ? 'selected' : ''}">
                    ${avatarHTML}
                    <span class="student-nom-prenom">${result.nom} <span class="student-prenom">${result.prenom}</span></span>
                </div>
            </td>
            <td class="status-cell">${this.getStudentStatusCellContent(result)}</td>
            ${this.renderGradeCells(studentData.periods || {}, periods, currentPeriodIndex)}
            <td class="appreciation-cell">${appreciationCell}</td>
            <td class="action-cell">
                <div class="action-dropdown">
                    <button class="btn btn-icon-only btn-action-menu" data-action="toggle-menu" aria-label="Actions" data-tooltip="Actions">
                        <iconify-icon icon="solar:menu-dots-bold" style="transform: rotate(90deg);"></iconify-icon>
                    </button>
                    ${this.generateActionMenuHTML(result.id)}
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
    generateActionMenuHTML(studentId) {
        return `
            <div class="action-dropdown-menu">
                <h5 class="dropdown-header"><iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon> APPRÉCIATION</h5>
                <button class="action-dropdown-item" data-action="regenerate-student">
                    <iconify-icon icon="solar:refresh-linear"></iconify-icon> Régénérer
                </button>
                <button class="action-dropdown-item" data-action="copy-appreciation">
                    <iconify-icon icon="solar:copy-linear"></iconify-icon> Copier
                </button>
                
                <h5 class="dropdown-header"><iconify-icon icon="solar:mortarboard-linear"></iconify-icon> ÉLÈVE</h5>
                <button class="action-dropdown-item" data-action="move-student">
                    <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon> Déplacer
                </button>
                <button class="action-dropdown-item" data-action="reset-student">
                    <iconify-icon icon="solar:restart-linear"></iconify-icon> Réinitialiser
                </button>
                <button class="action-dropdown-item danger" data-action="delete-student">
                    <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon> Supprimer
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
    updateRowContent(row, result) {
        // Update appreciation cell
        const appreciationCell = row.querySelector('.appreciation-cell');
        if (appreciationCell) {
            appreciationCell.innerHTML = this.getAppreciationCell(result);
        }

        // Update status cell
        const statusCell = row.querySelector('.status-cell');
        if (statusCell) {
            statusCell.innerHTML = this.getStudentStatusCellContent(result);
        }

        // Update Identity (Name + Avatar)
        const identityWrapper = row.querySelector('.student-identity-wrapper');
        if (identityWrapper) {
            const isSelected = ListSelectionManager.selectedIds.has(result.id);
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
        const newGradeCellsHtml = this.renderGradeCells(result.studentData.periods || {}, periods, currentPeriodIndex);

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
            const appreciationCell = row.querySelector('.appreciation-cell');

            // CRITICAL: If the cell shows a skeleton (generating/pending), always do a full update
            // The dirty-only optimization would otherwise add an indicator on top of the skeleton
            const hasSkeleton = !!appreciationCell?.querySelector('.appreciation-skeleton');

            if (hasSkeleton) {
                this.updateRowContent(row, result);
            } else {
                // Optimization: Check if only dirty indicator needs updating
                const existingDirty = appreciationCell?.querySelector('.dirty-indicator');
                const shouldBeDirty = this.isResultDirty(result);
                const hasDirtyIndicator = !!existingDirty;

                if (appreciationCell && hasDirtyIndicator !== shouldBeDirty) {
                    this.updateDirtyIndicatorOnly(appreciationCell, shouldBeDirty);
                } else {
                    this.updateRowContent(row, result);
                }
            }

            // Also update the global generate button state as dirty counts may have changed
            ResultsUIManager.updateGenerateButtonState();
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
    updateDirtyIndicatorOnly(cell, shouldBeDirty) {
        const existingIndicator = cell.querySelector('.dirty-indicator');

        if (shouldBeDirty && !existingIndicator) {
            // ADD dirty indicator with fade-in animation
            const indicator = document.createElement('span');
            indicator.className = 'dirty-indicator tooltip dirty-indicator-enter';
            indicator.setAttribute('data-tooltip', 'Données modifiées depuis la génération.\nActualisation recommandée.');
            indicator.innerHTML = '<iconify-icon icon="solar:danger-circle-linear"></iconify-icon>';

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
    renderFresh(container, results, periods, currentPeriodIndex) {
        // Read view preference
        const isExpanded = appState.isAppreciationFullView;
        const tableClass = isExpanded ? 'student-list-table appreciation-full-view' : 'student-list-table';
        const headerClass = isExpanded ? 'appreciation-header appreciation-toggle-header sortable-header expanded-view' : 'appreciation-header appreciation-toggle-header sortable-header';
        // Solar icons for expand/compress
        const iconClass = isExpanded ? 'solar:minimize-square-linear appreciation-toggle-icon' : 'solar:maximize-square-linear appreciation-toggle-icon';
        const title = isExpanded ? 'Réduire' : 'Voir tout le texte';

        // Build table HTML (no animation classes in HTML - we'll add them after)
        let html = `
            <div class="student-list-view">
                <table class="${tableClass}">
                    <thead>
                        <tr>
                            <th class="name-header-with-search sortable-header" data-sort-field="name">
                                <div class="header-content-wrapper" id="nameHeaderContent" data-tooltip="Trier par nom">
                                    Nom
                                    <span class="sort-icon-placeholder name-sort-icon"></span>
                                </div>
                                <button type="button" class="inline-search-trigger-btn header-action-trigger" id="inlineSearchTrigger" aria-label="Rechercher" data-tooltip="Rechercher (Ctrl+F)">
                                    <iconify-icon icon="solar:magnifer-linear"></iconify-icon>
                                </button>
                                <div class="inline-search-container" id="inlineSearchContainer">
                                    <iconify-icon icon="solar:magnifer-linear" class="search-icon"></iconify-icon>
                                    <input type="text" class="inline-search-input" id="inlineSearchInput" placeholder="Rechercher..." autocomplete="off">
                                    <button type="button" class="inline-search-clear" id="inlineSearchClear" aria-label="Effacer">
                                        <iconify-icon icon="ph:x"></iconify-icon>
                                    </button>
                                </div>
                            </th>
                            <th class="sortable-header" data-sort-field="status" data-tooltip="Trier par statut" style="width: 120px;">
                                <div class="header-content-wrapper">
                                    Statut<span class="sort-icon-placeholder"></span>
                                </div>
                            </th>
                            ${this.renderGradeHeaders(periods.slice(0, currentPeriodIndex + 1))}
                            <th class="${headerClass}">
                                <span id="avgWordsChip" class="detail-chip header-action-trigger" data-tooltip="Nombre moyen de mots" style="display:none"></span>
                                <div class="appreciation-header-actions" id="appreciationHeaderActions">
                                    <button type="button" class="btn-mobile-compact-toggle header-action-trigger tooltip" id="mobileCompactToggleBtn" style="display: none;" aria-label="Mode compact" data-tooltip="${title}">
                                        <iconify-icon icon="${iconClass.split(' ')[0]}"></iconify-icon>
                                    </button>
                                    <button type="button" class="btn-smart-action-inline tooltip" id="smartActionBtnInline" style="display: none;" data-action-mode="generate" data-tooltip="Générer les appréciations en attente">
                                        <iconify-icon icon="solar:magic-stick-3-linear" class="smart-action-icon"></iconify-icon>
                                        <span class="smart-action-badge" id="smartActionBadgeInline">0</span>
                                    </button>
                                </div>
                                <div class="header-content-wrapper" data-tooltip="${title}">
                                    Appréciation
                                    <iconify-icon icon="${iconClass.split(' ')[0]}" class="${iconClass.split(' ').slice(1).join(' ')}"></iconify-icon>
                                </div>
                            </th>
                            <th class="action-header" style="width: 50px;">
                                <div class="header-content-wrapper global-actions-dropdown">
                                    <button class="btn-action-menu-header" id="tableActionsBtnToggle" aria-label="Actions" data-tooltip="Actions">
                                        <iconify-icon icon="solar:menu-dots-bold" style="transform: rotate(90deg);"></iconify-icon>
                                    </button>
                                    <div class="global-actions-dropdown-menu" id="tableActionsDropdown">
                                        <!-- SECTION SELECTION -->
                                        <button class="action-dropdown-item" id="selectAllBtn-global">
                                            <iconify-icon icon="ph:check-square"></iconify-icon> Tout sélectionner
                                        </button>
                                        
                                        <!-- SECTION VUE -->
                                        <button class="action-dropdown-item action-analyze-class" id="analyzeClassBtn-shortcut">
                                            <iconify-icon icon="solar:pie-chart-2-linear"></iconify-icon> Analyser la classe
                                        </button>



                                        <!-- SECTION EXPORT -->
                                        <h5 class="dropdown-header"><iconify-icon icon="solar:download-minimalistic-linear"></iconify-icon> Exporter</h5>
                                        <button class="action-dropdown-item" id="exportJsonBtn">
                                            <iconify-icon icon="solar:code-square-linear"></iconify-icon> Données (JSON)
                                        </button>
                                        <button class="action-dropdown-item" id="exportCsvBtn">
                                            <iconify-icon icon="solar:file-text-linear"></iconify-icon> Tableau (CSV)
                                        </button>
                                        <button class="action-dropdown-item" id="exportPdfBtn">
                                            <iconify-icon icon="solar:printer-linear"></iconify-icon> Imprimer / PDF
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

                const appreciationCell = this.getAppreciationCell(result);

                const isSelected = ListSelectionManager.selectedIds.has(result.id);
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
                        <td class="status-cell">${this.getStudentStatusCellContent(result)}</td>
                        ${this.renderGradeCells(studentData.periods || {}, periods, currentPeriodIndex)}
                        <td class="appreciation-cell">${appreciationCell}</td>
                        <td class="action-cell">
                            <div class="action-dropdown">
                                <button class="btn btn-icon-only btn-action-menu" data-action="toggle-menu" aria-label="Actions" data-tooltip="Actions">
                                    <iconify-icon icon="solar:menu-dots-bold" style="transform: rotate(90deg);"></iconify-icon>
                                </button>
                                ${this.generateActionMenuHTML(result.id)}
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

            this.callbacks.attachEventListeners(viewElement);
            this.updateHeaderSortIcons(viewElement);
        }
    },


    /**
     * Génère les headers de notes avec colonnes d'évolution
     * @param {Array} periods - PÃ©riodes Ã  afficher
     * @returns {string} HTML des headers
     * @private
     */
    renderGradeHeaders(periods) {
        let html = '';
        periods.forEach((p, i) => {
            // Colonne de note - Sortable
            html += `<th class="grade-header sortable-header" data-sort-field="grade" data-sort-param="${p}" data-tooltip="Trier par notes ${p}">
                        <div class="header-content-wrapper">
                             ${Utils.getPeriodLabel(p, false)} <span class="sort-icon-placeholder"></span>
                        </div>
                     </th>`;

            // Colonne d'évolution (sauf après la dernière période)
            if (i < periods.length - 1) {
                // Evolution is relevant to the NEXT period (target period)
                const nextP = periods[i + 1];
                html += `<th class="evolution-header sortable-header" data-sort-field="evolution" data-sort-param="${nextP}" data-tooltip="Trier par évolution vers ${nextP}">
                             <div class="header-content-wrapper">
                            <iconify-icon icon="solar:chart-2-linear" style="opacity:0.6; font-size:1.1em;"></iconify-icon> <span class="sort-icon-placeholder"></span>
                             </div>
                         </th>`;
            }
        });
        return html;
    },

    /**
     * Updates sort icons based on current state
     */
    updateHeaderSortIcons(viewElement) {
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
                        ? '<iconify-icon icon="solar:sort-from-bottom-to-top-linear"></iconify-icon>'
                        : '<iconify-icon icon="solar:sort-from-top-to-bottom-linear"></iconify-icon>';
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
    renderGradeCells(periodsData, allPeriods, currentIndex) {
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
                                const diffText = diff >= 0 ? `+${diff.toFixed(1).replace('.', ',')}` : diff.toFixed(1).replace('.', ',');
                                const evoType = Utils.getEvolutionType(diff);

                                if (['very-positive', 'positive'].includes(evoType)) {
                                    evolutionHtml = `<span class="grade-evolution positive tooltip" data-tooltip="${diffText} pts"><iconify-icon icon="solar:course-up-linear"></iconify-icon></span>`;
                                } else if (diff < 0) {
                                    evolutionHtml = `<span class="grade-evolution negative tooltip" data-tooltip="${diffText} pts"><iconify-icon icon="solar:course-down-linear"></iconify-icon></span>`;
                                } else {
                                    evolutionHtml = `<span class="grade-evolution stable tooltip" data-tooltip="${diffText} pts"><iconify-icon icon="solar:arrow-right-linear"></iconify-icon></span>`;
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
     * Checks if result data has changed since generation (Harmonized with FocusPanelStatus)
     * @param {Object} result - Student result
     * @returns {boolean} True if dirty
     * @private
     */
    isResultDirty(result) {
        // Use the centralized Source of Truth from FocusPanelStatus
        return FocusPanelStatus.checkDirtyState(result);
    },

    /**
     * Génère le contenu de la cellule d'appréciation.
     * Affiche l'appréciation tronquée si disponible, sinon le badge de statut.
     * @param {Object} result - Données de l'élève
     * @returns {string} HTML de la cellule
     * @private
     */
    getAppreciationCell(result) {
        // Short-circuit: error state always takes priority over content/period logic
        if (result.errorMessage) {
            return this.getStatusBadge('error');
        }

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
            const icon = result.copied ? '<iconify-icon icon="ph:check"></iconify-icon>' : '<iconify-icon icon="solar:copy-linear"></iconify-icon>';
            const title = result.copied ? 'Appréciation copiée' : 'Copier l\'appréciation';

            const copyButtonHTML = `
                <button class="${btnClass}" data-action="copy-appreciation" aria-label="${title}" data-tooltip="${title}" onclick="event.stopPropagation(); AppreciationsManager.copyAppreciation('${result.id}', this)">
                    ${icon}
                </button>
            `;

            // === DIRTY STATE INDICATOR ===
            let dirtyBadge = '';
            if (this.isResultDirty(result)) {
                dirtyBadge = `<span class="dirty-indicator tooltip" data-tooltip="Données modifiées depuis la génération.\nActualisation recommandée."><iconify-icon icon="solar:danger-circle-linear"></iconify-icon></span>`;
            }

            return `${copyButtonHTML}${dirtyBadge}<div class="appreciation-preview has-copy-btn" onclick="event.stopPropagation(); this.closest('.appreciation-cell').click();">${Utils.decodeHtmlEntities(Utils.cleanMarkdown(appreciation))}</div>`;
        }

        // No content: show dash for past periods, pending badge for current
        const storedPeriod = result.studentData?.currentPeriod || result.aiGenerationPeriod;
        const periods = Utils.getPeriods();
        const currentIndex = periods.indexOf(currentPeriod);
        const periodIndex = periods.indexOf(storedPeriod);

        if (storedPeriod && currentIndex < periodIndex) {
            return '<span class="appreciation-preview empty">&mdash;</span>';
        }

        return this.getStatusBadge('pending');
    },

    /**
     * Génère le badge de statut HTML
     * @param {string} status - Statut ('pending', 'error', 'done')
     * @returns {string} HTML du badge
     * @private
     */
    getStatusBadge(status) {
        const labels = {
            'pending': 'En attente',
            'error': 'Erreur',
            'done': 'Terminé',
            'generating': 'Génération...'
        };

        // Icons usually handled by CSS or unnecessary for simple badges, 
        // but adding icons for visual consistency if needed.
        const icons = {
            'pending': '<iconify-icon icon="solar:clock-circle-linear"></iconify-icon>',
            'error': '<iconify-icon icon="solar:danger-triangle-linear"></iconify-icon>',
            'done': '<iconify-icon icon="ph:check"></iconify-icon>',
            'generating': '<iconify-icon icon="solar:spinner-linear" class="rotate-icon"></iconify-icon>'
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
    getStudentStatusCellContent(result) {
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
         * Generates the HTML for the appreciation skeleton loader.
         * @param {string} [label] - Optional custom label for the skeleton badge.
         * @param {boolean} [pending=false] - Whether it shows pending state.
         * @returns {string} HTML string.
         * @private
         */
    getAppreciationSkeletonHTML(label, pending = false) {
        return Utils.getSkeletonHTML(true, label, pending);
    },
};
