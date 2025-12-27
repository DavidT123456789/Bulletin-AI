/**
 * @fileoverview List View Manager - Rend les Ã©lÃ¨ves en vue tableau
 * Part of Liste + Focus UX Revolution - REFACTORED: Inline Appreciation Display
 * @module managers/ListViewManager
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { FocusPanelManager } from './FocusPanelManager.js';
// ResultCardsUI removed - logic moved to Utils
import { ClassUIManager } from './ClassUIManager.js';
import { StatsUI } from './StatsUIManager.js';

/**
 * Module de gestion de la vue Liste (tableau des Ã©lÃ¨ves)
 * @namespace ListViewManager
 */
export const ListViewManager = {
    _activeDocClickListener: null,
    /**
     * Rend la liste des Ã©lÃ¨ves en format tableau
     * @param {Array} results - Tableau des rÃ©sultats Ã  afficher
     * @param {HTMLElement} container - Conteneur DOM
     */
    render(results, container) {
        // Cleanup previous document listener if exists
        if (this._activeDocClickListener) {
            document.removeEventListener('click', this._activeDocClickListener, true);
            this._activeDocClickListener = null;
        }

        if (!container) return;

        if (results.length === 0) {
            container.innerHTML = '';
            return;
        }

        const currentPeriod = appState.currentPeriod;
        const periods = Utils.getPeriods() || ['T1', 'T2', 'T3'];
        const currentPeriodIndex = Math.max(0, periods.indexOf(currentPeriod));

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
                                <div class="header-content-wrapper">
                                    Appréciation
                                    <span id="avgWordsChip" class="detail-chip" data-tooltip="Nombre moyen de mots" style="display:none"></span>
                                    <i class="fas fa-expand appreciation-toggle-icon"></i>
                                </div>
                            </th>
                            <th class="action-header" style="width: 50px;">
                                <div class="header-content-wrapper global-actions-dropdown">
                                    <button class="btn-action-menu-header" id="tableActionsBtnToggle" title="Actions">
                                        <i class="fas fa-ellipsis-vertical"></i>
                                    </button>
                                    <div class="global-actions-dropdown-menu" id="tableActionsDropdown">
                                        <h5 class="dropdown-header"><i class="fas fa-users"></i> Actions sur les élèves</h5>
                                        <button class="action-dropdown-item" id="copyAllBtn-shortcut">
                                            <i class="fas fa-copy"></i> Copier les visibles
                                        </button>
                                        <button class="action-dropdown-item" id="regenerateAllBtn">
                                            <i class="fas fa-sync-alt"></i> Régénérer les visibles
                                        </button>
                                        <button class="action-dropdown-item" id="regenerateErrorsBtn-shortcut" style="display:none;">
                                            <i class="fas fa-exclamation-triangle"></i> Régénérer les erreurs
                                        </button>
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

                html += `
                    <tr data-student-id="${result.id}" class="student-row" tabindex="0">
                        <td class="student-name-cell">
                            <div class="student-identity-wrapper">
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
                                        <i class="fas fa-arrow-right-arrow-left"></i> Déplacer
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
     * GÃ©nÃ¨re les headers de notes avec colonnes d'Ã©volution
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
     * Rend les cellules de notes pour un Ã©lÃ¨ve avec colonnes d'Ã©volution sÃ©parÃ©es
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
    _getStatus(result) {
        if (result.errorMessage) return 'error';
        if (result.appreciation && !result.isPending) return 'done';
        return 'pending';
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

        // [FIX] On vÃ©rifie aussi que status n'est pas 'pending' SI c'est la pÃ©riode active en cours de gÃ©nÃ©ration
        // Mais ici on veut juste afficher le contenu stockÃ©.
        const hasContent = appreciation && !isPlaceholder;

        if (hasContent) {
            // [FIX] DÃ©coder les entitÃ©s HTML (ex: &lt;span) avant d'afficher
            const decoded = Utils.decodeHtmlEntities(appreciation);

            // Supprimer les balises HTML pour l'affichage textuel dans la liste
            const cleanText = decoded.replace(/<[^>]*>/g, '').trim();

            // Let CSS handle truncation dynamically based on available space
            return `<div class="appreciation-preview">${cleanText}</div>`;
        }

        // Si pas de contenu, on dÃ©termine le statut Ã  afficher
        // Pour les pÃ©riodes passÃ©es sans donnÃ©e, afficher simplement un tiret
        const storedPeriod = result.studentData?.currentPeriod || result.aiGenerationPeriod;
        const errorPeriod = result.errorMessage ? storedPeriod : null;

        // Si l'Ã©lÃ¨ve a une erreur qui concerne la pÃ©riode affichÃ©e
        if (status === 'error' && errorPeriod === currentPeriod) {
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
     * GÃ©nÃ¨re le contenu de la colonne Statut (Badges Ã©lÃ¨ve + Erreurs)
     * @param {Object} result - RÃ©sultat Ã©lÃ¨ve
     * @returns {string} HTML des badges
     * @private
     */
    _getStudentStatusCellContent(result) {
        let html = '';

        // 1. Statut critique : Erreur de gÃ©nÃ©ration
        if (result.errorMessage) {
            html += '<span class="status-badge error" title="Erreur de gÃ©nÃ©ration"><i class="fas fa-exclamation-triangle"></i> Erreur</span>';
        }

        // 2. Statuts Ã©lÃ¨ve (PPRE, DÃ©lÃ©guÃ©, Nouveau...)
        const studentStatuses = result.studentData?.statuses || [];
        // Dedup statuses to be safe
        const uniqueStatuses = [...new Set(studentStatuses)];

        uniqueStatuses.forEach(tag => {
            const badgeInfo = Utils.getStatusBadgeInfo(tag);
            // Use smaller gap/margin for multiple badges
            html += `<span class="${badgeInfo.className}" style="margin: 2px;">${badgeInfo.label}</span>`;
        });

        // 3. Si vide, on affiche le statut de production UNIQUEMENT si en erreur ou particulier?
        // Non, la demande est "Statut Ã©lÃ¨ve". Si pas de statut, on laisse vide ou tiret.
        if (!html) {
            return '<span style="color:var(--text-tertiary); font-size:12px;">&mdash;</span>';
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
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAllMenus();
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

        // Import dynamique des dépendances
        import('./AppreciationsManager.js').then(({ AppreciationsManager }) => {
            import('./StorageManager.js').then(({ StorageManager }) => {
                import('./EventHandlersManager.js').then(({ EventHandlersManager }) => {
                    // Actions sur les élèves
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
     * Supprime un Ã©lÃ¨ve avec confirmation
     * @param {string} studentId - ID de l'Ã©lÃ¨ve
     * @param {HTMLElement} row - Ligne du tableau
     * @private
     */
    /**
     * Supprime un Ã©lÃ¨ve avec confirmation
     * @param {string} studentId - ID de l'Ã©lÃ¨ve
     * @param {HTMLElement} row - Ligne du tableau
     * @private
     */
    async _deleteStudent(studentId, row) {
        const student = appState.generatedResults.find(r => r.id === studentId);
        if (!student) return;

        const studentName = `${student.prenom} ${student.nom}`;

        // Simple confirmation via native confirm (or could use UI.showCustomConfirm)
        if (!confirm(`Supprimer l'Ã©lÃ¨ve "${studentName}" ?`)) return;

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
            ClassUIManager.updateStudentCount();       // Compteur dans l'entÃªte
            UI?.populateLoadStudentSelect();           // Menu dÃ©roulant des Ã©lÃ¨ves
            UI?.updateStats();                         // Stats globales

            // Notify user
            UI?.showNotification(`${studentName} supprimÃ©`, 'success');
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
            header.title = 'Cliquer pour réduire';

            // Switch to Compress icon
            if (icon) {
                icon.classList.remove('fa-expand');
                icon.classList.add('fa-compress');
            }
        }
    }
};
