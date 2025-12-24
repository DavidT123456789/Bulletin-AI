/**
 * @fileoverview List View Manager - Rend les élèves en vue tableau
 * Part of Liste + Focus UX Revolution - REFACTORED: Inline Appreciation Display
 * @module managers/ListViewManager
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { ResultCardsUI } from './ResultCardsUIManager.js';
import { ClassUIManager } from './ClassUIManager.js';

/**
 * Module de gestion de la vue Liste (tableau des élèves)
 * @namespace ListViewManager
 */
export const ListViewManager = {
    /**
     * Rend la liste des élèves en format tableau
     * @param {Array} results - Tableau des résultats à afficher
     * @param {HTMLElement} container - Conteneur DOM
     */
    render(results, container) {
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
                            <th>Nom</th>
                            ${periods.slice(0, currentPeriodIndex + 1).map(p =>
            `<th class="grade-header">${Utils.getPeriodLabel(p, false)}</th>`
        ).join('')}
                            <th class="appreciation-header">
                                <div class="header-content-wrapper" style="display:flex; align-items:center;  justify-content:center; gap:8px;">
                                    Appréciation
                                    <span id="avgWordsChip" class="detail-chip" data-tooltip="Nombre moyen de mots" style="display:none"></span>
                                </div>
                            </th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        results.forEach((result, index) => {
            try {
                const status = this._getStatus(result);
                const appreciationCell = this._getAppreciationCell(result, status);

                // Génération des badges de statut élève (PPRE, etc.)
                let studentTagsHtml = '';
                const studentStatuses = result.studentData.statuses || [];
                studentStatuses.forEach(tag => {
                    const badgeInfo = Utils.getStatusBadgeInfo(tag);
                    studentTagsHtml += `<span class="${badgeInfo.className}">${badgeInfo.label}</span>`;
                });

                html += `
                    <tr data-student-id="${result.id}" class="student-row" tabindex="0">
                        <td class="student-name-cell">
                            <div class="student-identity-wrapper">
                                <span class="student-nom-prenom">${result.nom} <span class="student-prenom">${result.prenom}</span></span>
                                ${studentTagsHtml ? `<div class="student-tags-list">${studentTagsHtml}</div>` : ''}
                            </div>
                        </td>
                        ${this._renderGradeCells(result.studentData.periods || {}, periods, currentPeriodIndex)}
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
                container.style.transition = '';
                container.style.opacity = '';
                rows.forEach(row => {
                    row.classList.remove('row-animate-in');
                    row.style.removeProperty('--row-delay');
                });
            }, cleanupDelay);

            this._attachEventListeners(viewElement);
        }
    },

    /**
     * Rend les cellules de notes pour un élève
     * @param {Object} periods - Données par période
     * @param {Array} allPeriods - Liste de toutes les périodes
     * @param {number} currentIndex - Index de la période courante
     * @returns {string} HTML des cellules
     * @private
     */
    _renderGradeCells(periods, allPeriods, currentIndex) {
        let html = '';
        let prevGrade = null;

        for (let i = 0; i <= currentIndex; i++) {
            const p = allPeriods[i];
            const data = periods[p] || {};
            const grade = typeof data.grade === 'number' ? data.grade : null;

            let evolutionHtml = '';
            let gradeClass = '';

            if (grade !== null) {
                gradeClass = ResultCardsUI.getGradeClass(grade);
            }

            if (i > 0 && prevGrade !== null && grade !== null) {
                const diff = grade - prevGrade;
                if (diff > 0.5) {
                    evolutionHtml = `<span class="grade-evolution positive">+${diff.toFixed(1)}</span>`;
                } else if (diff < -0.5) {
                    evolutionHtml = `<span class="grade-evolution negative">${diff.toFixed(1)}</span>`;
                }
            }

            html += `
                <td class="grade-cell">
                    <div class="grade-content-wrapper">
                    ${grade !== null
                    ? `${evolutionHtml}<span class="grade-value ${gradeClass}">${grade.toFixed(1).replace('.', ',')}</span>`
                    : `<span class="grade-empty">--</span>`
                }
                    </div>
                </td>
            `;

            prevGrade = grade;
        }

        return html;
    },

    /**
     * Détermine le statut d'un résultat
     * @param {Object} result - Données de l'élève
     * @returns {string} 'done' | 'pending' | 'error'
     * @private
     */
    _getStatus(result) {
        if (result.errorMessage) return 'error';
        if (result.appreciation && !result.isPending) return 'done';
        return 'pending';
    },

    /**
     * Génère le contenu de la cellule d'appréciation
     * Affiche l'appréciation tronquée si disponible, sinon le badge de statut
     * @param {Object} result - Données de l'élève
     * @param {string} status - Statut de génération (global)
     * @returns {string} HTML de la cellule
     * @private
     */
    _getAppreciationCell(result, status) {
        // [FIX] Récupérer l'appréciation spécifique à la période sélectionnée
        const currentPeriod = appState.currentPeriod;
        let appreciation = '';

        if (result.studentData?.periods?.[currentPeriod]?.appreciation) {
            appreciation = result.studentData.periods[currentPeriod].appreciation.trim();
        } else if (result.studentData?.currentPeriod === currentPeriod && result.appreciation) {
            // Fallback: si l'objet racine correspond à la bonne période
            appreciation = result.appreciation.trim();
        }

        // Si c'est une autre période, et qu'on n'a rien trouvé, on n'affiche rien (plutôt que l'appréciation d'un autre trimestre)
        // Cela répond à la demande : "T1 affiche T1".

        // Supprimer les balises HTML pour la vérification
        const textOnly = appreciation?.replace(/<[^>]*>/g, '').trim().toLowerCase() || '';

        // Vérifier que c'est une vraie appréciation, pas un placeholder
        const isPlaceholder = !appreciation ||
            textOnly === '' ||
            textOnly.includes('aucune appréciation') ||
            textOnly.includes('en attente') ||
            textOnly.includes('cliquez sur') ||
            textOnly.startsWith('remplissez');

        // [FIX] On vérifie aussi que status n'est pas 'pending' SI c'est la période active en cours de génération
        // Mais ici on veut juste afficher le contenu stocké.
        const hasContent = appreciation && !isPlaceholder;

        if (hasContent) {
            // [FIX] Décoder les entités HTML (ex: &lt;span) avant d'afficher
            const decoded = Utils.decodeHtmlEntities(appreciation);

            // Supprimer les balises HTML pour l'affichage textuel dans la liste
            const cleanText = decoded.replace(/<[^>]*>/g, '').trim();

            // Tronquer à ~60 caractères pour tenir sur une ligne
            const maxLen = 60;
            const isTruncated = cleanText.length > maxLen;
            const displayText = isTruncated ? cleanText.substring(0, maxLen) + '...' : cleanText;
            const truncatedClass = isTruncated ? ' truncated' : '';
            return `<div class="appreciation-preview${truncatedClass}" title="Cliquer pour éditer">${displayText}</div>`;
        }

        // Si pas de contenu, on détermine le statut à afficher
        // Si on regarde une période passée sans donnée, c'est "vide" plutôt que "en attente" ?
        // Pour l'instant on garde la logique de statut si c'est la période courante.

        // Si l'élève a une erreur globale ET qu'on est sur la période courante
        if (status === 'error' && result.studentData?.currentPeriod === currentPeriod) {
            return this._getStatusBadge('error');
        }

        // Sinon, badge "En attente" ou vide
        return this._getStatusBadge('pending');
    },

    /**
     * Génère le badge de statut HTML
     * @param {string} status - Statut
     * @returns {string} HTML du badge
     * @private
     */
    _getStatusBadge(status) {
        switch (status) {
            case 'done':
                return '<span class="status-badge done"><i class="fas fa-check"></i> Fait</span>';
            case 'error':
                return '<span class="status-badge error"><i class="fas fa-exclamation-triangle"></i> Erreur</span>';
            default:
                return '<span class="status-badge pending"><i class="fas fa-clock"></i> En attente</span>';
        }
    },

    /**
     * Attache les event listeners aux éléments de la liste
     * @param {HTMLElement} listContainer - Le conteneur spécifique de la liste
     * @private
     */
    _attachEventListeners(listContainer) {
        // Close any open menus when clicking outside
        const closeAllMenus = () => {
            listContainer.querySelectorAll('.action-dropdown-menu.open').forEach(menu => {
                menu.classList.remove('open');
            });
        };

        // Click handler
        listContainer.addEventListener('click', (e) => {
            const target = e.target;

            // Toggle dropdown menu
            const menuBtn = target.closest('[data-action="toggle-menu"]');
            if (menuBtn) {
                e.stopPropagation();
                const dropdown = menuBtn.closest('.action-dropdown');
                const menu = dropdown?.querySelector('.action-dropdown-menu');

                // Close other menus first
                closeAllMenus();

                // Toggle this menu
                menu?.classList.toggle('open');
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

            // Click anywhere on the row -> Open Focus Panel
            const row = target.closest('.student-row');
            if (row && !target.closest('.action-dropdown') && !target.closest('a') && !target.closest('input')) {
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
    },

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

        // Simple confirmation via native confirm (or could use UI.showCustomConfirm)
        if (!confirm(`Supprimer l'élève "${studentName}" ?`)) return;

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
            ClassUIManager.updateStudentCount();       // Compteur dans l'entête
            UI?.populateLoadStudentSelect();           // Menu déroulant des élèves
            UI?.updateStats();                         // Stats globales

            // Notify user
            UI?.showNotification(`${studentName} supprimé`, 'success');
        }, 300);
    }
};
