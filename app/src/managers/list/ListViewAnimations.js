/**
 * @fileoverview List View Animations
 * Handles FLIP animations and complex DOM transitions for the List View
 */

import { appState } from '../../state/State.js';
import { ListViewRenderer } from './ListViewRenderer.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { Utils } from '../../utils/Utils.js';

export const ListViewAnimations = {

    state: {
        activeFilterTimeout: null,
        activeHeightTimeout: null,
        activeHeightEndHandler: null,
        activeHeightElement: null,
        activeRevealCleanupTimeout: null
    },

    callbacks: {
        renderFresh: () => { },
        updateHeaderSortIcons: () => { }
    },

    _clearFilterTimeout() {
        if (this.state.activeFilterTimeout) {
            clearTimeout(this.state.activeFilterTimeout);
            this.state.activeFilterTimeout = null;
        }
    },

    _clearPendingHeightCleanup() {
        if (this.state.activeHeightTimeout) {
            clearTimeout(this.state.activeHeightTimeout);
            this.state.activeHeightTimeout = null;
        }
        if (this.state.activeHeightElement && this.state.activeHeightEndHandler) {
            this.state.activeHeightElement.removeEventListener('transitionend', this.state.activeHeightEndHandler);
        }
        this.state.activeHeightEndHandler = null;
    },

    resetHeightTransition(targetElement = this.state.activeHeightElement) {
        this._clearPendingHeightCleanup();
        if (targetElement) {
            targetElement.style.height = '';
            targetElement.style.transition = '';
            targetElement.style.overflow = '';
            targetElement.style.overflowY = '';
        }
        if (!targetElement || targetElement === this.state.activeHeightElement) {
            this.state.activeHeightElement = null;
        }
    },

    /**
     * Capture les coordonnées initiales (FIRST) d'une liste de lignes avant mutation DOM
     * @param {Array<HTMLElement>} rows - Lignes à mesurer
     * @returns {Map<string, {top: number, left: number}>}
     * @private
     */
    _captureRowPositions(rows) {
        const positions = new Map();
        rows.forEach(row => {
            const rect = row.getBoundingClientRect();
            positions.set(row.dataset.studentId, { top: rect.top, left: rect.left });
        });
        return positions;
    },

    /**
     * Nettoie les classes et variables CSS d'entrée/import après l'animation
     * @param {HTMLElement} tbody - Corps de la table
     * @param {number} delayMs - Délai avant nettoyage en ms
     * @private
     */
    _scheduleRevealCleanup(tbody, delayMs) {
        if (this.state.activeRevealCleanupTimeout) {
            clearTimeout(this.state.activeRevealCleanupTimeout);
        }
        this.state.activeRevealCleanupTimeout = setTimeout(() => {
            this.state.activeRevealCleanupTimeout = null;
            tbody.querySelectorAll('.row-filter-enter, .row-import-refresh').forEach(row => {
                row.classList.remove('row-filter-enter', 'row-import-refresh');
                row.style.removeProperty('--enter-delay');
                row.style.removeProperty('--row-delay');
            });
            tbody.querySelectorAll('.avatar-import-pop').forEach(avatar => {
                avatar.classList.remove('avatar-import-pop');
                avatar.style.removeProperty('--avatar-delay');
            });
        }, delayMs);
    },

    /**
     * Applique les classes d'animation post-import (ligne et avatar)
     * @param {HTMLElement} row - Ligne cible
     * @param {boolean} isUpdated - Indique si le contenu de la ligne a été mis à jour
     * @param {boolean} hasPhoto - Indique si une photo a été importée sur la ligne
     * @param {number} delayMs - Délai d'animation de la ligne en ms
     * @param {number} [avatarOffsetMs=0] - Décalage additionnel pour l'avatar en ms
     * @private
     */
    _applyImportRevealClasses(row, isUpdated, hasPhoto, delayMs, avatarOffsetMs = 0) {
        if (isUpdated) {
            row.classList.add('row-import-refresh');
            row.style.setProperty('--row-delay', `${delayMs}ms`);
        }
        if (hasPhoto) {
            const avatar = row.querySelector('.student-avatar');
            if (avatar) {
                avatar.classList.add('avatar-import-pop');
                avatar.style.setProperty('--avatar-delay', `${delayMs + avatarOffsetMs}ms`);
            }
        }
    },

    /**
     * Insère une ligne à sa position ordonnée dans le tbody sans déplacement DOM superflu
     * @param {HTMLElement} tbody - Corps de la table
     * @param {HTMLElement} row - Ligne à positionner
     * @param {HTMLElement|null} previousNode - Ligne précédente dans l'ordre cible
     * @returns {HTMLElement} La ligne insérée (nouveau previousNode)
     * @private
     */
    _insertRowInOrder(tbody, row, previousNode) {
        if (previousNode) {
            if (previousNode.nextSibling !== row) {
                tbody.insertBefore(row, previousNode.nextSibling);
            }
        } else if (tbody.firstChild !== row) {
            tbody.insertBefore(row, tbody.firstChild);
        }
        return row;
    },

    /**
     * Exécute la phase LAST + INVERT + PLAY d'une animation FLIP sur un ensemble de lignes
     * @param {HTMLElement} tbody - Corps de la table
     * @param {Array<HTMLElement>} rows - Lignes à animer
     * @param {Map<string, {top: number, left: number}>} firstPositions - Positions initiales par studentId
     * @param {number} [durationMs=450] - Durée de la transition en ms
     * @private
     */
    _playFlipAnimation(tbody, rows, firstPositions, durationMs = 450) {
        const movedRows = [];
        rows.forEach(row => {
            if (row._flipCleanup) {
                row._flipCleanup();
            }
            const first = firstPositions.get(row.dataset.studentId);
            if (!first) return;

            const rect = row.getBoundingClientRect();
            const deltaX = (first.left ?? rect.left) - rect.left;
            const deltaY = first.top - rect.top;
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                movedRows.push({ row, deltaX, deltaY });
            }
        });

        movedRows.forEach(({ row, deltaX, deltaY }) => {
            row.classList.remove('row-move');
            row.classList.add('row-moving');
            row.style.transition = 'none';
            row.style.transform = Math.abs(deltaX) > 2
                ? `translate(${deltaX}px, ${deltaY}px)`
                : `translateY(${deltaY}px)`;
        });

        // Force layout recalculation once for container height and all inverted rows
        void tbody.offsetHeight;

        if (movedRows.length === 0) return;

        requestAnimationFrame(() => {
            const transitionValue = `transform ${durationMs}ms cubic-bezier(0.32, 0.72, 0, 1)`;
            movedRows.forEach(({ row }) => {
                row.classList.add('row-move');
                row.style.transition = transitionValue;
                row.style.transform = '';

                let cleanedUp = false;
                let fallbackTimer = null;
                const finalizeRow = () => {
                    if (cleanedUp) return;
                    cleanedUp = true;
                    if (fallbackTimer) {
                        clearTimeout(fallbackTimer);
                        fallbackTimer = null;
                    }
                    row._flipCleanup = null;
                    row.classList.remove('row-move', 'row-moving');
                    row.style.transition = '';
                    row.style.transform = '';
                    row.removeEventListener('transitionend', onTransitionEnd);
                };

                const onTransitionEnd = (e) => {
                    if (e.target === row && e.propertyName === 'transform') {
                        finalizeRow();
                    }
                };

                row._flipCleanup = finalizeRow;
                row.addEventListener('transitionend', onTransitionEnd);
                fallbackTimer = setTimeout(finalizeRow, durationMs + 60);
            });
        });
    },

    init(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
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
    animateFilterTransition(container, existingRows, newResults, periods, currentPeriodIndex, importReveal = null) {
        const tbody = container.querySelector('tbody');
        if (!tbody) {
            this.callbacks.renderFresh(container, newResults, periods, currentPeriodIndex, { importReveal });
            return;
        }

        const newIds = new Set(newResults.map(r => r.id));
        const newResultsMap = new Map(newResults.map(r => [r.id, r]));

        // Identify rows to exit, keep
        const toExit = existingRows.filter(r => !newIds.has(r.dataset.studentId));
        const toKeep = existingRows.filter(r => newIds.has(r.dataset.studentId));

        // *** FIRST: Capture positions of KEPT rows BEFORE any DOM changes ***
        // This is critical for the "flow up" animation when rows are filtered out
        const firstPositions = this._captureRowPositions(toKeep);

        // Step 1: Animate exiting rows (fade + scale out) when rows leave
        const hasExitingRows = toExit.length > 0;
        toExit.forEach(row => {
            row.classList.add('row-exit');
        });

        this._clearFilterTimeout();
        this._clearPendingHeightCleanup();

        const commitFilterDomTransition = () => {
            this.state.activeFilterTimeout = null;
            this._clearPendingHeightCleanup();

            const measureHeight = (el) => el.getBoundingClientRect?.().height || el.offsetHeight;
            const viewElement = container.querySelector('.student-list-view');
            let initialHeight = 0;
            if (viewElement) {
                initialHeight = measureHeight(viewElement);
                viewElement.style.height = `${initialHeight}px`;
                viewElement.style.transition = 'none';
                viewElement.style.overflowY = 'clip'; // Clip vertical height changes without clipping horizontal edge-to-edge rows on mobile
            }

            // Remove exited rows and any previous empty-state row from DOM (after initialHeight is captured)
            toExit.forEach(row => {
                TooltipsUI?.cleanupTooltipsIn?.(row);
                row.remove();
            });
            tbody.querySelectorAll('.empty-state-row').forEach(row => row.remove());

            // Build map of kept rows
            const keepMap = new Map(toKeep.map(r => [r.dataset.studentId, r]));

            // Reorder rows IN-PLACE
            const orderedIds = newResults.map(r => r.id);
            let previousNode = null;
            const searchQuery = appState.searchQuery || '';
            const currentClassName = Utils.getCurrentClassName();
            const renderContext = { searchQuery, currentClassName };

            const newRowCount = orderedIds.filter(id => !keepMap.has(id)).length;
            const staggerStep = newRowCount > 1 ? Math.min(28, Math.max(14, Math.floor(480 / newRowCount))) : 0;
            let newRowIndex = 0;
            let updatedKeepIndex = 0;
            const baseDelay = importReveal?.startDelay ?? 50;
            let maxAnimDelay = baseDelay;

            orderedIds.forEach((id) => {
                let row;

                if (keepMap.has(id)) {
                    // Existing row - reuse it
                    row = keepMap.get(id);

                    // Update content if needed
                    const result = newResultsMap.get(id);
                    if (result) {
                        ListViewRenderer.updateRowContent(row, result);
                    }

                    if (importReveal) {
                        const hasPhoto = importReveal.photoIds?.has(id);
                        const isUpdated = importReveal.updatedIds?.has(id);
                        if (hasPhoto || isUpdated) {
                            const keepDelay = baseDelay + Math.min(updatedKeepIndex * 22, 480);
                            updatedKeepIndex++;
                            if (keepDelay > maxAnimDelay) maxAnimDelay = keepDelay;
                            this._applyImportRevealClasses(row, isUpdated, hasPhoto, keepDelay, 40);
                        }
                    }
                } else {
                    // New row - create it
                    const result = newResultsMap.get(id);
                    if (result) {
                        const enterDelay = baseDelay + Math.min(newRowIndex * staggerStep, 480);
                        newRowIndex++;
                        if (enterDelay > maxAnimDelay) maxAnimDelay = enterDelay;

                        row = ListViewRenderer.createRowElement(result, periods, currentPeriodIndex, renderContext);
                        row.classList.add('row-filter-enter');
                        row.style.setProperty('--enter-delay', `${enterDelay}ms`);
                        this._applyImportRevealClasses(row, false, Boolean(importReveal?.photoIds?.has(id)), enterDelay, 60);
                    }
                }

                if (row) {
                    previousNode = this._insertRowInOrder(tbody, row, previousNode);
                }
            });

            if (orderedIds.length === 0) {
                const headerThs = container.querySelectorAll('.student-list-table thead th');
                const colCount = headerThs.length || (currentPeriodIndex * 2 + 5);
                tbody.innerHTML = ListViewRenderer.getEmptyStateRowHTML(
                    colCount,
                    'row-filter-enter',
                    ` style="--enter-delay: ${baseDelay}ms"`
                );
            }

            // Measure final height and transition the container height in sync with rows
            let finalHeight = 0;
            if (viewElement) {
                viewElement.style.height = '';
                finalHeight = measureHeight(viewElement);
                viewElement.style.height = `${initialHeight}px`;
            }

            // *** LAST (batch reads) + INVERT (batch writes) + PLAY: Animate kept rows to their new positions ***
            this._playFlipAnimation(tbody, toKeep, firstPositions, 450);

            if (viewElement) {
                if (finalHeight !== initialHeight) {
                    viewElement.style.transition = 'height 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
                    viewElement.style.height = `${finalHeight}px`;

                    const resetHeightStyles = () => this.resetHeightTransition(viewElement);
                    const onTransitionEnd = (e) => {
                        if (e.target === viewElement && e.propertyName === 'height') {
                            resetHeightStyles();
                        }
                    };

                    this.state.activeHeightElement = viewElement;
                    this.state.activeHeightEndHandler = onTransitionEnd;
                    viewElement.addEventListener('transitionend', onTransitionEnd);

                    this.state.activeHeightTimeout = setTimeout(resetHeightStyles, 550);
                } else {
                    this.resetHeightTransition(viewElement);
                }

                this.callbacks.updateHeaderSortIcons(viewElement);
            }

            if (hasExitingRows && newRowCount > 0) {
                TooltipsUI?.initTooltips?.(tbody);
            }

            // Cleanup enter animations after full stagger duration
            if (newRowCount > 0 || updatedKeepIndex > 0 || orderedIds.length === 0) {
                this._scheduleRevealCleanup(tbody, maxAnimDelay + 450);
            }
        };

        // Step 2: Defer DOM reorganization by 250ms only when exiting rows must fade out first;
        // otherwise commit synchronously (e.g. filter deactivation, 0 -> N, or adding a student)
        if (hasExitingRows) {
            this.state.activeFilterTimeout = setTimeout(commitFilterDomTransition, 250);
        } else {
            commitFilterDomTransition();
        }
    },

    /**
     * Animation simple pour le tri (réordonnancement sans changement d'IDs)
     * @param {HTMLElement} container - Conteneur DOM
     * @param {Array} existingRows - Lignes existantes
     * @param {Array} newResults - Nouveaux résultats triés
     * @param {Array} periods - Périodes
     * @param {number} currentPeriodIndex - Index de la période courante
     * @param {Object|null} [importReveal=null] - Métadonnées d'animation post-import
     * @private
     */
    animateSortTransition(container, existingRows, newResults, periods, currentPeriodIndex, importReveal = null) {
        const tbody = container.querySelector('tbody');
        if (!tbody) return;

        this._clearFilterTimeout();
        this.resetHeightTransition();

        // Build map of existing rows by ID
        const rowMap = new Map(existingRows.map(r => [r.dataset.studentId, r]));
        const newResultsMap = new Map(newResults.map(r => [r.id, r]));

        // *** FIRST: Capture positions BEFORE any DOM changes ***
        const firstPositions = this._captureRowPositions(existingRows);

        // Reorder rows in correct order
        const orderedIds = newResults.map(r => r.id);
        let previousNode = null;

        const affectedCount = importReveal
            ? orderedIds.filter(id => importReveal.photoIds?.has(id) || importReveal.updatedIds?.has(id)).length
            : 0;
        const staggerStep = affectedCount > 1 ? Math.min(28, Math.max(14, Math.floor(480 / affectedCount))) : 0;
        let staggerIdx = 0;
        let maxImportDelay = 0;

        orderedIds.forEach(id => {
            const row = rowMap.get(id);
            if (row) {
                // Update content if needed
                const result = newResultsMap.get(id);
                if (result) {
                    ListViewRenderer.updateRowContent(row, result);
                }

                if (importReveal) {
                    const hasPhoto = importReveal.photoIds?.has(id);
                    const isUpdated = importReveal.updatedIds?.has(id);
                    if (hasPhoto || isUpdated) {
                        const delay = importReveal.startDelay + Math.min(staggerIdx * staggerStep, 480);
                        staggerIdx++;
                        if (delay > maxImportDelay) maxImportDelay = delay;
                        this._applyImportRevealClasses(row, isUpdated, hasPhoto, delay, 0);
                    }
                }

                previousNode = this._insertRowInOrder(tbody, row, previousNode);
            }
        });

        if (maxImportDelay > 0) {
            this._scheduleRevealCleanup(tbody, maxImportDelay + 480);
        }

        // *** LAST (batch reads) + INVERT (batch writes) + PLAY ***
        this._playFlipAnimation(tbody, existingRows, firstPositions, 350);

        // Update header icons
        const viewElement = container.querySelector('.student-list-view');
        if (viewElement) {
            this.callbacks.updateHeaderSortIcons(viewElement);
        }
    }
};
