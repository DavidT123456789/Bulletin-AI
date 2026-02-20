/**
 * @fileoverview List View Animations
 * Handles FLIP animations and complex DOM transitions for the List View
 */

import { ListViewRenderer } from './ListViewRenderer.js';

export const ListViewAnimations = {

    // shared context state like _activeFilterTimeout is injected or managed
    state: {
        activeFilterTimeout: null
    },

    callbacks: {
        renderFresh: () => { },
        updateHeaderSortIcons: () => { }
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
    animateFilterTransition(container, existingRows, newResults, periods, currentPeriodIndex) {
        const tbody = container.querySelector('tbody');
        if (!tbody) {
            this.callbacks.renderFresh(container, newResults, periods, currentPeriodIndex);
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

        if (this.state.activeFilterTimeout) {
            clearTimeout(this.state.activeFilterTimeout);
        }

        this.state.activeFilterTimeout = setTimeout(() => {
            this.state.activeFilterTimeout = null;

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
                        ListViewRenderer.updateRowContent(row, result);
                    }
                } else {
                    // New row - create it
                    const result = newResultsMap.get(id);
                    if (result) {
                        row = ListViewRenderer.createRowElement(result, periods, currentPeriodIndex);
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
                this.callbacks.updateHeaderSortIcons(viewElement);
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
    animateSortTransition(container, existingRows, newResults, periods, currentPeriodIndex) {
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
                    ListViewRenderer.updateRowContent(row, result);
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
            this.callbacks.updateHeaderSortIcons(viewElement);
        }
    },

    /**
     * Anime la sortie de toutes les lignes
     * @param {NodeList} rows - Lignes à animer
     * @param {Function} callback - Callback après animation
     * @private
     */
    animateRowsOut(rows, callback) {
        rows.forEach((row, index) => {
            row.style.setProperty('--row-delay', `${index * 15}ms`);
            row.classList.add('row-exit');
        });
        setTimeout(callback, 300);
    },
};
