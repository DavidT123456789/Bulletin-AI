/**
 * @fileoverview Seating Chart Auto-Placement, Shuffle, Drag Clones & Clear All Actions
 * Extracted from SeatingChartManager for modularity (facade pattern via object spread).
 * @module managers/seating/SeatingAutoPlace
 */

import { appState } from '../../state/State.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { UI } from '../UIManager.js';
import { Utils } from '../../utils/Utils.js';

export const SeatingAutoPlace = {
    // ========================================================================
    // ACTIONS — with animation orchestration
    // ========================================================================

    _autoPlace(mode = 'alpha-asc') {
        if (this._isLocked) return;

        let rows = this._getRows();
        let cols = this._getCols();

        if (!this._gridState || this._gridState.length !== rows) {
            this._initGrid(rows, cols);
        }

        const posKey = this._getActivePositionKey();
        const unplaced = this._getUnplacedStudents();
        const placedIds = this._getPlacedIds();
        const resultsMap = new Map((appState.generatedResults || []).map(x => [x.id, x]));

        const isCellPinned = (r, c) => {
            const ids = this._getCellStudentIds(r, c);
            return ids.some(id => Boolean(resultsMap.get(id)?.[posKey]?.pinned));
        };

        const animatePlacedCells = (placedCells) => {
            requestAnimationFrame(() => {
                placedCells.forEach(({ row, col, index }) => {
                    const cell = document.querySelector(`.sc-cell[data-row="${row}"][data-col="${col}"]`);
                    if (!cell) return;
                    cell.style.setProperty('--place-i', index);
                    cell.classList.add('sc-auto-placed');
                    cell.addEventListener('animationend', () => {
                        cell.classList.remove('sc-auto-placed');
                        cell.style.removeProperty('--place-i');
                    }, { once: true });
                });
            });
        };

        // Cas Groupes / Binômes / Postes d'Activité (pairs-random, pairs-neighbors, pairs-alpha, groups-3, groups-4, ou 1/poste en mode Activité)
        const groupModeSizes = {
            'pairs-random': 2,
            'pairs-neighbors': 2,
            'pairs-alpha': 2,
            'groups-3': 3,
            'groups-4': 4
        };
        const activityGroupSize = groupModeSizes[mode]
            || (this._isActivityMode() && (mode === 'random' || mode === 'alpha-asc' || mode === 'alpha-desc') ? 1 : 0);

        if (activityGroupSize > 0) {
            const groupSize = activityGroupSize;
            let studentsToGroup = [];

            if (unplaced.length > 0) {
                studentsToGroup = [...unplaced];
            } else if (placedIds.size > 0) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (isCellPinned(r, c)) continue;
                        const ids = this._getCellStudentIds(r, c);
                        ids.forEach(id => {
                            const student = this._students.find(s => s.id === id) || resultsMap.get(id);
                            if (student) studentsToGroup.push(student);
                        });
                    }
                }
                if (studentsToGroup.length === 0) {
                    UI.showNotification('Tous les postes occupés sont épinglés.', 'info');
                    return;
                }
                if (studentsToGroup.length < 2 && mode === 'random') {
                    UI.showNotification('Pas assez d\'élèves à mélanger.', 'info');
                    return;
                }
            } else {
                return;
            }

            this._snapshotGrid();

            // Si on réorganise un plan déjà rempli, libérer les postes non épinglés
            if (unplaced.length === 0) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (!isCellPinned(r, c)) {
                            this._gridState[r][c] = null;
                        }
                    }
                }
            }

            // Auto-dimensionnement intelligent de la grille Activité pour accueillir 100% des groupes/postes sans effort
            const neededFreeStations = Math.ceil(studentsToGroup.length / groupSize);
            let specialOrPinnedOrOccupiedCount = 0;
            let currentFreeSpots = 0;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (this._isSpecialSpot(r, c) || this._getCellStudentIds(r, c).length > 0) {
                        specialOrPinnedOrOccupiedCount++;
                    } else {
                        currentFreeSpots++;
                    }
                }
            }

            let targetRows = rows;
            let targetCols = cols;
            if (specialOrPinnedOrOccupiedCount === 0) {
                targetCols = neededFreeStations <= 4
                    ? Math.max(2, neededFreeStations)
                    : (neededFreeStations <= 9
                        ? 3
                        : (neededFreeStations <= 16 ? 4 : (neededFreeStations <= 25 ? 5 : 6)));
                targetRows = Math.min(10, Math.max(2, Math.ceil(neededFreeStations / targetCols)));
                if (targetRows * targetCols < neededFreeStations) {
                    targetCols = Math.min(10, Math.ceil(neededFreeStations / targetRows));
                }
            } else if (currentFreeSpots < neededFreeStations) {
                const totalNeededCells = specialOrPinnedOrOccupiedCount + neededFreeStations;
                if (totalNeededCells > 16 && targetCols < 5) {
                    targetCols = totalNeededCells <= 25 ? 5 : 6;
                }
                targetRows = Math.min(10, Math.max(rows, Math.ceil(totalNeededCells / targetCols)));
                if (targetRows * targetCols < totalNeededCells) {
                    targetCols = Math.min(10, Math.max(cols, Math.ceil(totalNeededCells / targetRows)));
                }
            }

            const gridResized = targetRows !== rows || targetCols !== cols;
            if (gridResized) {
                const newGrid = Array.from({ length: targetRows }, (_, r) =>
                    Array.from({ length: targetCols }, (__, c) => (this._gridState[r]?.[c] ?? null))
                );
                this._gridState = newGrid;
                rows = targetRows;
                cols = targetCols;
                const rowSlider = document.getElementById('scRowsSlider');
                const colSlider = document.getElementById('scColsSlider');
                if (rowSlider) {
                    rowSlider.value = rows;
                    const rv = document.getElementById('scRowsValue');
                    if (rv) rv.textContent = rows;
                }
                if (colSlider) {
                    colSlider.value = cols;
                    const cv = document.getElementById('scColsValue');
                    if (cv) cv.textContent = cols;
                }
                this._hasChangesSinceUnlock = true;
                this._saveGridConfig();
            }

            const targetSpots = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (this._isSpecialSpot(r, c)) continue;
                    if (this._getCellStudentIds(r, c).length === 0) {
                        targetSpots.push({ r, c });
                    }
                }
            }

            if (targetSpots.length === 0) {
                UI.showNotification('Aucun poste disponible.', 'warning');
                return;
            }

            const ordered = [...studentsToGroup];
            if (mode === 'pairs-alpha' || mode === 'alpha-asc') {
                ordered.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' }));
            } else if (mode === 'alpha-desc') {
                ordered.sort((a, b) => `${b.nom} ${b.prenom}`.localeCompare(`${a.nom} ${a.prenom}`, 'fr', { sensitivity: 'base' }));
            } else if (mode === 'pairs-neighbors') {
                ordered.sort((a, b) => {
                    const posA = resultsMap.get(a.id)?.seatingPosition || a.seatingPosition;
                    const posB = resultsMap.get(b.id)?.seatingPosition || b.seatingPosition;
                    const hasA = typeof posA?.row === 'number' && typeof posA?.col === 'number';
                    const hasB = typeof posB?.row === 'number' && typeof posB?.col === 'number';
                    if (hasA && hasB) {
                        if (posA.row !== posB.row) return posA.row - posB.row;
                        return posA.col - posB.col;
                    }
                    if (hasA) return -1;
                    if (hasB) return 1;
                    return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' });
                });
            } else {
                for (let i = ordered.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
                }
            }

            let cursor = 0;
            let stationIdx = 0;
            const placedCells = [];

            while (cursor < ordered.length && stationIdx < targetSpots.length) {
                const spot = targetSpots[stationIdx];
                const chunk = ordered.slice(cursor, cursor + groupSize);
                this._setCellStudentIds(spot.r, spot.c, chunk.map(s => s.id));
                placedCells.push({ row: spot.r, col: spot.c, index: stationIdx });
                cursor += chunk.length;
                stationIdx++;
            }

            this._dismissOnboardingHint();
            this._savePositionsToState();
            this._render();
            if (gridResized || this._isFitted) {
                this._applySmartFit(true);
            }
            animatePlacedCells(placedCells);

            const remaining = ordered.length - cursor;
            if (remaining > 0) {
                UI.showNotification(`${cursor} élèves placés. ${remaining} ne rentrent pas — ajoutez des postes.`, 'warning');
            }
            return;
        }

        // Cas : Dispersion aléatoire sur l'ensemble de la salle (idéal examen / devoir surveillé)
        if (mode === 'random-disperse') {
            const movableStudents = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (isCellPinned(r, c)) continue;
                    const ids = this._getCellStudentIds(r, c);
                    ids.forEach(id => {
                        const student = this._students.find(s => s.id === id) || resultsMap.get(id);
                        if (student && !movableStudents.some(m => m.id === student.id)) {
                            movableStudents.push(student);
                        }
                    });
                }
            }
            unplaced.forEach(s => {
                if (!movableStudents.some(m => m.id === s.id)) {
                    movableStudents.push(s);
                }
            });

            if (movableStudents.length === 0) {
                UI.showNotification('Tous les élèves placés sont épinglés.', 'info');
                return;
            }

            const candidateSpots = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (this._isSpecialSpot(r, c) || isCellPinned(r, c)) continue;
                    candidateSpots.push({ r, c });
                }
            }

            if (candidateSpots.length === 0) {
                UI.showNotification('Aucune place disponible dans la salle.', 'warning');
                return;
            }

            this._snapshotGrid();

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (!isCellPinned(r, c)) {
                        this._gridState[r][c] = null;
                    }
                }
            }

            for (let i = candidateSpots.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidateSpots[i], candidateSpots[j]] = [candidateSpots[j], candidateSpots[i]];
            }

            for (let i = movableStudents.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [movableStudents[i], movableStudents[j]] = [movableStudents[j], movableStudents[i]];
            }

            const k = Math.min(candidateSpots.length, movableStudents.length);
            const placedCells = [];

            for (let i = 0; i < k; i++) {
                const spot = candidateSpots[i];
                const student = movableStudents[i];
                this._gridState[spot.r][spot.c] = student.id;
                placedCells.push({ row: spot.r, col: spot.c, index: i });
            }

            this._dismissOnboardingHint();
            this._savePositionsToState();
            this._render();
            animatePlacedCells(placedCells);

            this._scrollToDesk();

            const remaining = movableStudents.length - k;
            if (remaining > 0) {
                UI.showNotification(`${k} élèves placés. ${remaining} ne rentrent pas — augmentez la grille.`, 'warning');
            }
            return;
        }

        // Cas 1 : Tous les élèves sont déjà placés sur la grille -> réorganiser les élèves non-épinglés
        if (unplaced.length === 0 && placedIds.size > 0) {
            const movable = [];
            const occupiedSpots = [];

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const ids = this._getCellStudentIds(r, c);
                    if (ids.length > 0 && !isCellPinned(r, c)) {
                        occupiedSpots.push({ r, c });
                        ids.forEach(id => {
                            const student = this._students.find(s => s.id === id) || resultsMap.get(id);
                            if (student) movable.push(student);
                        });
                    }
                }
            }

            if (movable.length === 0) {
                UI.showNotification('Tous les élèves placés sont épinglés.', 'info');
                return;
            }
            if (movable.length < 2 && mode === 'random') {
                UI.showNotification('Pas assez d\'élèves à mélanger.', 'info');
                return;
            }

            this._snapshotGrid();

            const ordered = [...movable];
            if (mode === 'alpha-desc') {
                ordered.sort((a, b) => `${b.nom} ${b.prenom}`.localeCompare(`${a.nom} ${a.prenom}`, 'fr', { sensitivity: 'base' }));
            } else if (mode === 'random') {
                for (let i = ordered.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
                }
            } else {
                ordered.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' }));
            }

            occupiedSpots.forEach(spot => {
                this._gridState[spot.r][spot.c] = null;
            });

            let targetSpots = occupiedSpots;
            if (targetSpots.length < ordered.length) {
                targetSpots = [];
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (!this._isSpecialSpot(r, c) && this._getCellStudentIds(r, c).length === 0) {
                            targetSpots.push({ r, c });
                        }
                    }
                }
            }

            const placedCells = [];
            const k = Math.min(targetSpots.length, ordered.length);
            for (let i = 0; i < k; i++) {
                const spot = targetSpots[i];
                const student = ordered[i];
                this._gridState[spot.r][spot.c] = student.id;
                placedCells.push({ row: spot.r, col: spot.c, index: i });
            }

            this._savePositionsToState();
            this._render();
            animatePlacedCells(placedCells);

            const remaining = ordered.length - k;
            if (remaining > 0) {
                UI.showNotification(`${k} élèves placés. ${remaining} ne rentrent pas — augmentez la grille.`, 'warning');
            }

            return;
        }

        // Cas 2 : Il y a des élèves non placés -> les placer dans les places libres
        if (unplaced.length === 0) {
            UI.showNotification('Tous les élèves sont déjà placés.', 'info');
            return;
        }
        this._snapshotGrid();

        const availableSpots = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this._getCellStudentIds(r, c).length === 0 && !this._isSpecialSpot(r, c)) {
                    availableSpots.push({ r, c });
                }
            }
        }

        const k = Math.min(availableSpots.length, unplaced.length);
        if (k === 0) return;

        const ordered = [...unplaced];
        if (mode === 'alpha-desc') {
            ordered.sort((a, b) => `${b.nom} ${b.prenom}`.localeCompare(`${a.nom} ${a.prenom}`, 'fr', { sensitivity: 'base' }));
        } else if (mode === 'random') {
            for (let i = ordered.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
            }
        } else {
            ordered.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' }));
        }

        const spotsToFill = this._isActivityMode() ? availableSpots.slice(0, k) : availableSpots.slice(-k);
        let placed = 0;
        const placedCells = [];

        for (let i = 0; i < k; i++) {
            const spot = spotsToFill[i];
            const student = ordered[i];

            this._gridState[spot.r][spot.c] = student.id;
            placedCells.push({ row: spot.r, col: spot.c, index: placed });
            placed++;
        }

        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        animatePlacedCells(placedCells);

        if (!this._isActivityMode()) {
            this._scrollToDesk();
        }

        const remaining = unplaced.length - placed;
        if (remaining > 0) {
            UI.showNotification(`${placed} élèves placés. ${remaining} ne rentrent pas — augmentez la grille.`, 'warning');
        }
    },

    /** Shuffles non-pinned students across valid seats while preserving current group format in Activity mode */
    _shuffle() {
        if (!this._isActivityMode()) {
            this._autoPlace('random');
            return;
        }
        let maxGroupSize = 0;
        let occupiedStations = 0;
        for (let r = 0; r < (this._gridState?.length || 0); r++) {
            for (let c = 0; c < (this._gridState[r]?.length || 0); c++) {
                const len = this._getCellStudentIds(r, c).length;
                if (len > 0) {
                    occupiedStations++;
                    if (len > maxGroupSize) maxGroupSize = len;
                }
            }
        }
        if (maxGroupSize >= 4) {
            this._autoPlace('groups-4');
        } else if (maxGroupSize === 3) {
            this._autoPlace('groups-3');
        } else if (maxGroupSize === 1 && occupiedStations >= 2) {
            this._autoPlace('random');
        } else {
            this._autoPlace('pairs-random');
        }
    },

    /** Hides native ghost and creates a floating clone that follows the cursor */
    _setCleanDragImage(e, sourceEl, count = 1) {
        const blank = new Image();
        blank.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(blank, 0, 0);

        const clone = sourceEl.cloneNode(true);
        clone.className = 'sc-drag-clone';
        if (sourceEl.classList.contains('sc-cell-stacked')) {
            clone.classList.add('sc-cell', 'sc-cell-stacked');
        }
        if (sourceEl.classList.contains('has-status-badge')) {
            clone.classList.add('has-status-badge');
        }
        if (sourceEl.offsetWidth > 0 && sourceEl.offsetHeight > 0 && sourceEl.classList.contains('sc-cell')) {
            clone.style.setProperty('--sc-cell-w', `${sourceEl.offsetWidth}px`);
            clone.style.setProperty('--sc-cell-h', `${sourceEl.offsetHeight}px`);
        } else if (this._isActivityMode() && sourceEl.classList.contains('sc-cell')) {
            clone.style.setProperty('--sc-cell-w', '118px');
            clone.style.setProperty('--sc-cell-h', '114px');
        }
        clone.classList.remove('sc-chip-selected');
        clone.querySelectorAll('.sc-cell-remove, .sc-cell-pin, .sc-stacked-member-remove, .sc-station-badge, .sc-stacked-count-pill').forEach(el => el.remove());

        const board = sourceEl.closest?.('#scClassroomBoard');
        if (board) {
            const boardScale = parseFloat(board.style.getPropertyValue('--sc-scale')) || this._zoomScale || 1;
            clone.style.setProperty('--sc-drag-scale', boardScale.toString());
        }

        if (count > 1) {
            const badge = document.createElement('div');
            badge.className = 'sc-drag-badge';
            badge.textContent = `+${count - 1}`;
            clone.appendChild(badge);
            clone.classList.add('sc-drag-multi');
        }

        clone.style.left = `${e.clientX}px`;
        clone.style.top = `${e.clientY}px`;
        document.body.appendChild(clone);

        const onDrag = (ev) => {
            if (ev.clientX === 0 && ev.clientY === 0) return;
            clone.style.left = `${ev.clientX}px`;
            clone.style.top = `${ev.clientY}px`;
        };

        const onDragEnd = () => {
            clone.remove();
            document.body.classList.remove('sc-drag-over-sidebar');
            sourceEl.removeEventListener('drag', onDrag);
            sourceEl.removeEventListener('dragend', onDragEnd);
        };

        sourceEl.addEventListener('drag', onDrag);
        sourceEl.addEventListener('dragend', onDragEnd);
    },

    _setCleanMemberDragImage(e, student, sourceEl) {
        const blank = new Image();
        blank.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer?.setDragImage?.(blank, 0, 0);

        const clone = document.createElement('div');
        clone.className = 'sc-drag-clone sc-student-chip';
        if (student) {
            clone.innerHTML = `
                ${StudentPhotoManager.getAvatarHTML(student, 'sm')}
                <span class="sc-student-chip-name">${Utils.formatStudentName(student.nom, student.prenom, true)}</span>
            `;
        } else {
            clone.innerHTML = sourceEl.innerHTML;
        }

        const board = sourceEl.closest?.('#scClassroomBoard');
        if (board) {
            const boardScale = parseFloat(board.style.getPropertyValue('--sc-scale')) || this._zoomScale || 1;
            clone.style.setProperty('--sc-drag-scale', boardScale.toString());
        }

        clone.style.left = `${e.clientX}px`;
        clone.style.top = `${e.clientY}px`;
        document.body.appendChild(clone);

        const onDrag = (ev) => {
            if (ev.clientX === 0 && ev.clientY === 0) return;
            clone.style.left = `${ev.clientX}px`;
            clone.style.top = `${ev.clientY}px`;
        };

        const onDragEnd = () => {
            clone.remove();
            document.body.classList.remove('sc-drag-over-sidebar');
            sourceEl.removeEventListener('drag', onDrag);
            sourceEl.removeEventListener('dragend', onDragEnd);
        };

        sourceEl.addEventListener('drag', onDrag);
        sourceEl.addEventListener('dragend', onDragEnd);
    },

    _clearAll() {
        if (this._isLocked) return;
        const placedCount = this._getPlacedIds().size;
        if (placedCount === 0) return;

        const isActivity = this._isActivityMode();
        const modalTitle = isActivity
            ? `Vider le plan d'activité (${placedCount}) ?`
            : `Vider le plan de classe (${placedCount}) ?`;
        const modalDesc = isActivity
            ? 'Les élèves seront retirés des postes d\'activité (le plan de cours habituel reste intact).'
            : 'Les élèves seront retirés du plan mais resteront dans la liste.';

        UI.showCustomConfirm(modalDesc, () => {
            this._snapshotGrid();
            this._pulseSidebarReceiving();
            const occupiedCells = document.querySelectorAll('#scGridContainer .sc-cell.occupied');

            occupiedCells.forEach((cell, index) => {
                cell.style.setProperty('--cell-i', index);
                cell.classList.add('sc-cell-removing');
            });

            const animDuration = (occupiedCells.length - 1) * 15 + 300;

            setTimeout(() => {
                this._initGrid(this._getRows(), this._getCols());
                this._savePositionsToState();
                this._updatePlanModeSwitchUI();
                this._renderGrid();
                this._renderSidebar(null, true);
                this._updateFooter();
                this._updateSidebarLockState();
                this._updateUndoRedoButtons();
                this._saveGridConfig();
                this._applySmartFit(true);
                this._staggerCellEntrance();
                this._maybeShowOnboardingHint();
            }, animDuration);
        }, null, { title: modalTitle, isDanger: true });
    }
};
