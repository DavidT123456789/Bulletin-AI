/**
 * @fileoverview List View Animations
 * Handles FLIP animations and complex DOM transitions for the List View
 */

import { ListViewRenderer } from './ListViewRenderer.js';
import { Utils } from '../../utils/Utils.js';

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

            const viewElement = container.querySelector('.student-list-view');
            let initialHeight = 0;
            if (viewElement) {
                initialHeight = viewElement.offsetHeight;
                viewElement.style.height = `${initialHeight}px`;
                viewElement.style.transition = 'none';
                viewElement.style.overflow = 'hidden'; // Keep layout clipping clean during height changes
            }

            // Remove exited rows from DOM
            toExit.forEach(row => row.remove());

            // Build map of kept rows
            const keepMap = new Map(toKeep.map(r => [r.dataset.studentId, r]));

            // Reorder rows IN-PLACE
            const orderedIds = newResults.map(r => r.id);
            let previousNode = null;
            const searchQuery = document.getElementById('searchInput')?.value || '';
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

                            if (isUpdated) {
                                row.classList.add('row-import-refresh');
                                row.style.setProperty('--row-delay', `${keepDelay}ms`);
                            }
                            if (hasPhoto) {
                                const avatar = row.querySelector('.student-avatar');
                                if (avatar) {
                                    avatar.classList.add('avatar-import-pop');
                                    avatar.style.setProperty('--avatar-delay', `${keepDelay + 40}ms`);
                                }
                            }
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

                        if (importReveal?.photoIds?.has(id)) {
                            const avatar = row.querySelector('.student-avatar');
                            if (avatar) {
                                avatar.classList.add('avatar-import-pop');
                                avatar.style.setProperty('--avatar-delay', `${enterDelay + 60}ms`);
                            }
                        }
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

            // Measure final height and transition the container height in sync with rows
            let finalHeight = 0;
            if (viewElement) {
                viewElement.style.height = '';
                finalHeight = viewElement.offsetHeight;
                viewElement.style.height = `${initialHeight}px`;
            }

            // Force layout recalculation
            void tbody.offsetHeight;

            if (viewElement && finalHeight !== initialHeight) {
                viewElement.style.transition = 'height 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
                viewElement.style.height = `${finalHeight}px`;

                const onTransitionEnd = (e) => {
                    if (e.propertyName === 'height') {
                        viewElement.style.height = '';
                        viewElement.style.transition = '';
                        viewElement.style.overflow = '';
                        viewElement.removeEventListener('transitionend', onTransitionEnd);
                    }
                };
                viewElement.addEventListener('transitionend', onTransitionEnd);

                setTimeout(() => {
                    if (viewElement.style.height) {
                        viewElement.style.height = '';
                        viewElement.style.transition = '';
                        viewElement.style.overflow = '';
                    }
                }, 550);
            }

            // *** LAST (batch reads) + INVERT (batch writes) + PLAY: Animate kept rows to their new positions ***
            requestAnimationFrame(() => {
                const movedRows = [];
                toKeep.forEach(row => {
                    const first = firstPositions.get(row.dataset.studentId);
                    if (!first) return;

                    const rect = row.getBoundingClientRect();
                    const deltaX = (first.left ?? rect.left) - rect.left;
                    const deltaY = first.top - rect.top;
                    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                        movedRows.push({ row, deltaX, deltaY });
                    }
                });

                if (movedRows.length === 0) return;

                movedRows.forEach(({ row, deltaX, deltaY }) => {
                    row.classList.add('row-moving');
                    row.style.transform = Math.abs(deltaX) > 2
                        ? `translate(${deltaX}px, ${deltaY}px)`
                        : `translateY(${deltaY}px)`;
                    row.style.transition = 'none';
                });

                // Force browser to render the inverted state once for all moved rows
                void tbody.offsetHeight;

                requestAnimationFrame(() => {
                    movedRows.forEach(({ row }) => {
                        row.classList.add('row-move');
                        row.style.transform = '';

                        const cleanup = (e) => {
                            if (e.propertyName === 'transform') {
                                row.classList.remove('row-move', 'row-moving');
                                row.style.transition = '';
                                row.removeEventListener('transitionend', cleanup);
                            }
                        };
                        row.addEventListener('transitionend', cleanup);
                    });
                });
            });

            // Re-attach event listeners
            if (viewElement) {
                this.callbacks.updateHeaderSortIcons(viewElement);
            }

            // Cleanup enter animations after full stagger duration
            setTimeout(() => {
                tbody.querySelectorAll('.row-filter-enter, .row-import-refresh').forEach(row => {
                    row.classList.remove('row-filter-enter', 'row-import-refresh');
                    row.style.removeProperty('--enter-delay');
                    row.style.removeProperty('--row-delay');
                });
                tbody.querySelectorAll('.avatar-import-pop').forEach(avatar => {
                    avatar.classList.remove('avatar-import-pop');
                    avatar.style.removeProperty('--avatar-delay');
                });
            }, maxAnimDelay + 450);

        }, exitDuration);
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

        // Build map of existing rows by ID
        const rowMap = new Map(existingRows.map(r => [r.dataset.studentId, r]));
        const newResultsMap = new Map(newResults.map(r => [r.id, r]));

        // *** FIRST: Capture positions BEFORE any DOM changes ***
        const firstPositions = new Map();
        existingRows.forEach(row => {
            const rect = row.getBoundingClientRect();
            firstPositions.set(row.dataset.studentId, { top: rect.top, left: rect.left });
        });

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

                        if (isUpdated) {
                            row.classList.add('row-import-refresh');
                            row.style.setProperty('--row-delay', `${delay}ms`);
                        }
                        if (hasPhoto) {
                            const avatar = row.querySelector('.student-avatar');
                            if (avatar) {
                                avatar.classList.add('avatar-import-pop');
                                avatar.style.setProperty('--avatar-delay', `${delay}ms`);
                            }
                        }
                    }
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

        if (maxImportDelay > 0) {
            setTimeout(() => {
                tbody.querySelectorAll('.row-import-refresh').forEach(row => {
                    row.classList.remove('row-import-refresh');
                    row.style.removeProperty('--row-delay');
                });
                tbody.querySelectorAll('.avatar-import-pop').forEach(avatar => {
                    avatar.classList.remove('avatar-import-pop');
                    avatar.style.removeProperty('--avatar-delay');
                });
            }, maxImportDelay + 480);
        }

        // *** LAST (batch reads) + INVERT (batch writes) + PLAY ***
        const invertedRows = [];
        existingRows.forEach(row => {
            const first = firstPositions.get(row.dataset.studentId);
            if (!first) return;

            const rect = row.getBoundingClientRect();
            const deltaX = (first.left ?? rect.left) - rect.left;
            const deltaY = first.top - rect.top;
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
                invertedRows.push({ row, deltaX, deltaY });
            }
        });

        invertedRows.forEach(({ row, deltaX, deltaY }) => {
            row.style.transform = Math.abs(deltaX) > 2
                ? `translate(${deltaX}px, ${deltaY}px)`
                : `translateY(${deltaY}px)`;
            row.style.transition = 'none';
        });

        // Force browser to render inverted state
        void tbody.offsetHeight;

        // PLAY: Animate to final position
        requestAnimationFrame(() => {
            invertedRows.forEach(({ row }) => {
                row.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
                row.style.transform = '';
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
