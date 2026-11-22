/**
 * @fileoverview Seating Chart Auto-Placement, Shuffle, Drag Clones & Clear All Actions
 * Extracted from SeatingChartManager for modularity (facade pattern via object spread).
 * @module managers/seating/SeatingAutoPlace
 */

import { appState } from '../../state/State.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { UI } from '../UIManager.js';
import { Utils } from '../../utils/Utils.js';
import { StatsService } from '../../services/StatsService.js';
import { MAX_ACTIVITY_GROUP_SIZE } from './SeatingState.js';

export const SeatingAutoPlace = {
    // ========================================================================
    // ACTIONS — with animation orchestration
    // ========================================================================

    _autoPlace(mode = 'alpha-asc', customGroupSize = null) {
        if (this._isLocked) return;

        let rows = this._getRows();
        let cols = this._getCols();

        if (!this._gridState || this._gridState.length !== rows || this._gridState[0]?.length !== cols) {
            this._initGrid(rows, cols);
        }

        const unplaced = this._getUnplacedStudents();
        const placedIds = this._getPlacedIds();
        const resultsMap = new Map((appState.generatedResults || []).map(x => [x.id, x]));

        const animatePlacedCells = (placedCells) => {
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
        };

        // Cas Groupes / Binômes / Postes d'Activité (pairs-random, pairs-neighbors, pairs-alpha, groups-3, groups-4, groups-balanced, ou 1..4/poste en mode Activité)
        const groupModeSizes = {
            'pairs-random': 2,
            'pairs-neighbors': 2,
            'pairs-alpha': 2,
            'groups-3': 3,
            'groups-4': 4
        };
        const isBalancedGroups = mode === 'groups-balanced';
        const validCustomSize = (this._isActivityMode() && Number.isInteger(customGroupSize) && customGroupSize >= 1 && customGroupSize <= MAX_ACTIVITY_GROUP_SIZE)
            ? customGroupSize
            : 0;
        if ((isBalancedGroups || mode === 'pairs-neighbors') && validCustomSize === 1) {
            return;
        }

        const detectedSize = (this._isActivityMode() || isBalancedGroups)
            ? (this._getMaxActivityGroupSizeOnGrid?.() || 0)
            : 0;

        let activityGroupSize = validCustomSize
            || groupModeSizes[mode]
            || (this._isActivityMode() && (mode === 'random' || mode === 'alpha-asc' || mode === 'alpha-desc') ? 1 : 0);

        if (isBalancedGroups && !validCustomSize) {
            activityGroupSize = (detectedSize >= 2 && detectedSize <= MAX_ACTIVITY_GROUP_SIZE) ? detectedSize : 3;
        }

        if (activityGroupSize > 0) {
            this._activityGroupSize = activityGroupSize;
            let groupSize = activityGroupSize;
            const isChangingGroupSize = validCustomSize > 0 && detectedSize > 0 && detectedSize !== groupSize;
            const shouldRedistributeAll = isBalancedGroups || isChangingGroupSize;
            let studentsToGroup = [];

            if (unplaced.length > 0 && !shouldRedistributeAll) {
                studentsToGroup = [...unplaced];
            } else if (placedIds.size > 0 || unplaced.length > 0) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (this._isCellPinned(r, c, resultsMap)) continue;
                        const ids = this._getCellStudentIds(r, c);
                        ids.forEach(id => {
                            const student = this._students.find(s => s.id === id) || resultsMap.get(id);
                            if (student && !studentsToGroup.some(s => s.id === student.id)) {
                                studentsToGroup.push(student);
                            }
                        });
                    }
                }
                if (shouldRedistributeAll) {
                    unplaced.forEach(student => {
                        if (!studentsToGroup.some(s => s.id === student.id)) {
                            studentsToGroup.push(student);
                        }
                    });
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

            // Validation préalable pour les groupes équilibrés (≥ 4 élèves notés requis)
            let balancedGraded = [];
            let balancedUngraded = [];
            if (isBalancedGroups) {
                const currentPeriod = appState.currentPeriod || 'T1';
                studentsToGroup.forEach(student => {
                    const record = resultsMap.get(student.id) || student;
                    const rawGrade = record?.studentData?.periods?.[currentPeriod]?.grade;
                    const gradeVal = StatsService.parseGrade(rawGrade);
                    if (!isNaN(gradeVal)) {
                        balancedGraded.push({ student, grade: gradeVal });
                    } else {
                        balancedUngraded.push(student);
                    }
                });
                if (balancedGraded.length < 4) {
                    UI.showNotification('Ajoutez au moins 4 moyennes sur la période pour former des groupes équilibrés.', 'info');
                    return;
                }
                if (studentsToGroup.length < 6 && groupSize > 2) {
                    groupSize = 2;
                }
            }

            this._snapshotGrid();

            // Si on réorganise un plan déjà rempli (ou changement de taille / groupes équilibrés complets), libérer les postes non épinglés
            if (unplaced.length === 0 || shouldRedistributeAll) {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (!this._isCellPinned(r, c, resultsMap)) {
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
            if (currentFreeSpots < neededFreeStations) {
                if (specialOrPinnedOrOccupiedCount === 0) {
                    const idealCols = neededFreeStations <= 4
                        ? Math.max(2, neededFreeStations)
                        : (neededFreeStations <= 9
                            ? 3
                            : (neededFreeStations <= 16 ? 4 : (neededFreeStations <= 25 ? 5 : 6)));
                    const idealRows = Math.min(10, Math.max(2, Math.ceil(neededFreeStations / idealCols)));
                    targetCols = Math.max(cols, idealCols);
                    targetRows = Math.min(10, Math.max(rows, idealRows, Math.ceil(neededFreeStations / targetCols)));
                    if (targetRows * targetCols < neededFreeStations) {
                        targetCols = Math.min(10, Math.max(targetCols, Math.ceil(neededFreeStations / targetRows)));
                    }
                } else {
                    const totalNeededCells = specialOrPinnedOrOccupiedCount + neededFreeStations;
                    if (totalNeededCells > 16 && targetCols < 5) {
                        targetCols = totalNeededCells <= 25 ? 5 : 6;
                    }
                    targetRows = Math.min(10, Math.max(rows, Math.ceil(totalNeededCells / targetCols)));
                    if (targetRows * targetCols < totalNeededCells) {
                        targetCols = Math.min(10, Math.max(cols, Math.ceil(totalNeededCells / targetRows)));
                    }
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

            const placedCells = [];
            let cursor = 0;

            if (isBalancedGroups) {
                balancedGraded.sort((a, b) => {
                    if (b.grade !== a.grade) return b.grade - a.grade;
                    return `${a.student.nom} ${a.student.prenom}`.localeCompare(`${b.student.nom} ${b.student.prenom}`, 'fr', { sensitivity: 'base' });
                });
                balancedUngraded.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' }));

                const numGroups = Math.min(targetSpots.length, Math.max(2, Math.ceil(studentsToGroup.length / groupSize)));
                const groups = Array.from({ length: numGroups }, () => []);
                const maxGroupCapacity = Math.min(
                    MAX_ACTIVITY_GROUP_SIZE,
                    Math.max(groupSize, Math.ceil(studentsToGroup.length / numGroups))
                );

                // Distribution en serpentin (0..k-1 puis k-1..0) pour équilibrer la moyenne de chaque groupe
                balancedGraded.forEach(({ student }, idx) => {
                    const round = Math.floor(idx / numGroups);
                    const posInRound = idx % numGroups;
                    const preferredIdx = round % 2 === 0 ? posInRound : (numGroups - 1 - posInRound);
                    if (groups[preferredIdx].length < maxGroupCapacity) {
                        groups[preferredIdx].push(student);
                        return;
                    }
                    // Repli vers le groupe le moins rempli encore sous capacité (évite toute perte silencieuse)
                    let fallbackIdx = -1;
                    let minLen = maxGroupCapacity;
                    for (let g = 0; g < groups.length; g++) {
                        if (groups[g].length < minLen) {
                            minLen = groups[g].length;
                            fallbackIdx = g;
                        }
                    }
                    if (fallbackIdx !== -1) {
                        groups[fallbackIdx].push(student);
                    }
                });

                // Répartir les élèves non notés dans les plus petits groupes disponibles (plafond maxGroupCapacity)
                balancedUngraded.forEach(student => {
                    let targetIdx = -1;
                    let minLen = maxGroupCapacity;
                    for (let g = 0; g < groups.length; g++) {
                        if (groups[g].length < minLen) {
                            minLen = groups[g].length;
                            targetIdx = g;
                        }
                    }
                    if (targetIdx !== -1) {
                        groups[targetIdx].push(student);
                    }
                });

                groups.forEach((group, idx) => {
                    if (group.length === 0 || idx >= targetSpots.length) return;
                    const spot = targetSpots[idx];
                    this._setCellStudentIds(spot.r, spot.c, group.map(s => s.id));
                    placedCells.push({ row: spot.r, col: spot.c, index: idx });
                    cursor += group.length;
                });
            } else {
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

                let stationIdx = 0;
                while (cursor < ordered.length && stationIdx < targetSpots.length) {
                    const spot = targetSpots[stationIdx];
                    const chunk = ordered.slice(cursor, cursor + groupSize);
                    this._setCellStudentIds(spot.r, spot.c, chunk.map(s => s.id));
                    placedCells.push({ row: spot.r, col: spot.c, index: stationIdx });
                    cursor += chunk.length;
                    stationIdx++;
                }
            }

            this._dismissOnboardingHint();
            this._savePositionsToState();
            this._render();
            if (gridResized || this._isFitted) {
                this._applySmartFit(true);
            }
            animatePlacedCells(placedCells);

            const remaining = studentsToGroup.length - cursor;
            if (remaining > 0) {
                UI.showNotification(`${cursor} élèves placés. ${remaining} ne rentrent pas — ajoutez des postes.`, 'warning');
            } else if (isBalancedGroups) {
                UI.showNotification(`${placedCells.length} groupes équilibrés formés (${balancedGraded.length} moyennes utilisées).`, 'success');
            }
            if (cursor >= 8) {
                UI?.recordSupportMilestone?.('seating-action', 1, { classId: appState.currentClassId });
            }
            return;
        }

        // Placement en mode Cours : Alphabétique (A-Z), Inversé (Z-A), Mélanger (regroupé) ou Disperser (toute la salle)
        const movableStudents = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this._isCellPinned(r, c, resultsMap)) continue;
                const ids = this._getCellStudentIds(r, c);
                ids.forEach(id => {
                    const student = this._students.find(s => s.id === id) || resultsMap.get(id);
                    if (student && !this._isStudentDeparted(student) && !movableStudents.some(m => m.id === student.id)) {
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
            if (placedIds.size > 0) {
                UI.showNotification('Tous les élèves placés sont épinglés.', 'info');
            }
            return;
        }
        if (movableStudents.length < 2 && unplaced.length === 0 && mode === 'random') {
            UI.showNotification('Pas assez d\'élèves à mélanger.', 'info');
            return;
        }

        // Places disponibles en partant du 1er rang face au Tableau (r = rows - 1 -> 0, de gauche à droite)
        const candidateSpots = [];
        for (let r = rows - 1; r >= 0; r--) {
            for (let c = 0; c < cols; c++) {
                if (this._isSpecialSpot(r, c) || this._isCellPinned(r, c, resultsMap)) continue;
                candidateSpots.push({ r, c });
            }
        }

        if (candidateSpots.length === 0) {
            UI.showNotification('Aucune place disponible dans la salle.', 'warning');
            return;
        }

        // Placement intelligent local (Journal de bord + dispositifs) :
        // dispositifs (PPRE/PAP/ULIS/AESH/PAI) + difficultés / travail- au 1er rang, bavards espacés
        if (mode === 'smart-journal') {
            const currentPeriod = appState.currentPeriod || 'T1';
            const analyzeSignals = (student) => {
                const record = resultsMap.get(student.id) || student;
                const devices = this._getStudentDeviceStatuses?.(record) || [];
                const entries = (record?.journal || []).filter(e => e && (!e.period || e.period === currentPeriod));
                let frontPriority = devices.length > 0 ? 3 : 0;
                let talkativeCount = 0;
                entries.forEach(e => {
                    if (!Array.isArray(e.tags)) return;
                    e.tags.forEach(tag => {
                        if (tag === 'difficulte') frontPriority += 2;
                        else if (tag === 'travail-') frontPriority += 1;
                        else if (tag === 'bavardage') talkativeCount += 1;
                    });
                });
                return { student, frontPriority, talkativeCount, isTalkative: talkativeCount > 0 };
            };

            const profiles = movableStudents.map(analyzeSignals);
            const hasAnySignal = profiles.some(p => p.frontPriority > 0 || p.isTalkative);
            if (!hasAnySignal) {
                UI.showNotification('Aucun signal (dispositif ou observation Journal) sur la période pour un placement intelligent.', 'info');
                return;
            }

            this._snapshotGrid();

            // Recenser les bavards déjà épinglés pour éviter d'asseoir un bavard mobile juste à côté
            const talkativeCoords = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (this._isCellPinned(r, c, resultsMap)) {
                        const ids = this._getCellStudentIds(r, c);
                        ids.forEach(id => {
                            const st = this._students.find(s => s.id === id) || resultsMap.get(id);
                            if (st && analyzeSignals(st).isTalkative) {
                                talkativeCoords.push({ r, c });
                            }
                        });
                    } else {
                        this._gridState[r][c] = null;
                    }
                }
            }

            // Trier : priorité 1er rang d'abord, puis bavards (pour espacement optimal), puis autres (ordre alphabétique)
            profiles.sort((a, b) => {
                if (b.frontPriority !== a.frontPriority) return b.frontPriority - a.frontPriority;
                if (b.talkativeCount !== a.talkativeCount) return b.talkativeCount - a.talkativeCount;
                return `${a.student.nom} ${a.student.prenom}`.localeCompare(`${b.student.nom} ${b.student.prenom}`, 'fr', { sensitivity: 'base' });
            });

            const available = [...candidateSpots];
            const placedCells = [];
            const scoreTalkativeSpot = (spot) => {
                if (talkativeCoords.length === 0) return spot.r;
                let minCheb = Infinity;
                let minEucl = Infinity;
                for (const t of talkativeCoords) {
                    const dr = Math.abs(spot.r - t.r);
                    const dc = Math.abs(spot.c - t.c);
                    const cheb = Math.max(dr, dc);
                    const eucl = Math.hypot(dr, dc);
                    if (cheb < minCheb) minCheb = cheb;
                    if (eucl < minEucl) minEucl = eucl;
                }
                // Priorité absolue à la non-adjacence (minCheb >= 2), puis distance euclidienne, puis compacité vers l'avant
                return minCheb * 1000 + minEucl * 25 + spot.r * 2;
            };

            let placedCount = 0;
            for (const profile of profiles) {
                if (available.length === 0) break;
                let chosenIndex = 0;

                if (profile.frontPriority > 0) {
                    if (profile.isTalkative && talkativeCoords.length > 0) {
                        const frontRow = available[0].r;
                        let bestScore = -Infinity;
                        for (let i = 0; i < available.length; i++) {
                            if (available[i].r < frontRow - 1) break;
                            const s = scoreTalkativeSpot(available[i]);
                            if (s > bestScore) {
                                bestScore = s;
                                chosenIndex = i;
                            }
                        }
                    } else {
                        chosenIndex = 0; // Place la plus proche du tableau
                    }
                } else if (profile.isTalkative) {
                    let bestScore = -Infinity;
                    for (let i = 0; i < available.length; i++) {
                        const s = scoreTalkativeSpot(available[i]);
                        if (s > bestScore) {
                            bestScore = s;
                            chosenIndex = i;
                        }
                    }
                } else {
                    chosenIndex = 0;
                }

                const [spot] = available.splice(chosenIndex, 1);
                this._gridState[spot.r][spot.c] = profile.student.id;
                if (profile.isTalkative) {
                    talkativeCoords.push(spot);
                }
                placedCells.push({ row: spot.r, col: spot.c, index: placedCount });
                placedCount++;
            }

            this._dismissOnboardingHint();
            this._savePositionsToState();
            this._render();
            animatePlacedCells(placedCells);
            this._scrollToDesk();

            const remainingSmart = profiles.length - placedCount;
            if (remainingSmart > 0) {
                UI.showNotification(`${placedCount} élèves placés. ${remainingSmart} ne rentrent pas — augmentez la grille.`, 'warning');
            } else {
                UI.showNotification('Placement intelligent appliqué (dispositifs devant, bavards espacés).', 'success');
            }
            if (placedCount >= 8) {
                UI?.recordSupportMilestone?.('seating-action', 1, { classId: appState.currentClassId });
            }
            return;
        }

        this._snapshotGrid();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!this._isCellPinned(r, c, resultsMap)) {
                    this._gridState[r][c] = null;
                }
            }
        }

        const ordered = [...movableStudents];
        if (mode === 'alpha-desc') {
            ordered.sort((a, b) => `${b.nom} ${b.prenom}`.localeCompare(`${a.nom} ${a.prenom}`, 'fr', { sensitivity: 'base' }));
        } else if (mode === 'random' || mode === 'random-disperse') {
            for (let i = ordered.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
            }
        } else {
            ordered.sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' }));
        }

        if (mode === 'random-disperse') {
            for (let i = candidateSpots.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidateSpots[i], candidateSpots[j]] = [candidateSpots[j], candidateSpots[i]];
            }

            const occupiedCoords = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (this._isCellPinned(r, c, resultsMap)) {
                        occupiedCoords.push({ r, c });
                    }
                }
            }

            const targetCount = Math.min(candidateSpots.length, ordered.length);
            if (targetCount > 0 && targetCount < candidateSpots.length) {
                const pool = [...candidateSpots];
                const chosenSpots = [];

                if (occupiedCoords.length === 0) {
                    const evenCount = pool.filter(s => (s.r + s.c) % 2 === 0).length;
                    const preferredParity = evenCount >= pool.length - evenCount ? 0 : 1;
                    const seedIdx = pool.findIndex(s => (s.r + s.c) % 2 === preferredParity);
                    const [seed] = pool.splice(seedIdx >= 0 ? seedIdx : 0, 1);
                    chosenSpots.push(seed);
                    occupiedCoords.push(seed);
                }

                while (chosenSpots.length < targetCount && pool.length > 0) {
                    let bestIdx = 0;
                    let bestScore = -Infinity;
                    for (let i = 0; i < pool.length; i++) {
                        const spot = pool[i];
                        let minManh = Infinity;
                        let minCheb = Infinity;
                        let minEucl = Infinity;
                        for (let j = 0; j < occupiedCoords.length; j++) {
                            const occ = occupiedCoords[j];
                            const dr = Math.abs(spot.r - occ.r);
                            const dc = Math.abs(spot.c - occ.c);
                            const manh = dr + dc;
                            const cheb = Math.max(dr, dc);
                            const eucl = Math.hypot(dr, dc);
                            if (manh < minManh) minManh = manh;
                            if (cheb < minCheb) minCheb = cheb;
                            if (eucl < minEucl) minEucl = eucl;
                        }
                        const score = (minManh >= 2 ? 100000 : 0)
                            + (minCheb >= 2 ? 10000 : 0)
                            + minEucl * 100
                            + minManh * 10;
                        if (score > bestScore) {
                            bestScore = score;
                            bestIdx = i;
                        }
                    }
                    const [picked] = pool.splice(bestIdx, 1);
                    chosenSpots.push(picked);
                    occupiedCoords.push(picked);
                }

                candidateSpots.splice(0, candidateSpots.length, ...chosenSpots);
            }
        }

        const k = Math.min(candidateSpots.length, ordered.length);
        const placedCells = [];

        for (let i = 0; i < k; i++) {
            const spot = candidateSpots[i];
            const student = ordered[i];
            this._gridState[spot.r][spot.c] = student.id;
            placedCells.push({ row: spot.r, col: spot.c, index: i });
        }

        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        animatePlacedCells(placedCells);
        this._scrollToDesk();

        const remaining = ordered.length - k;
        if (remaining > 0) {
            UI.showNotification(`${k} élèves placés. ${remaining} ne rentrent pas — augmentez la grille.`, 'warning');
        }
        if (k >= 8) {
            UI?.recordSupportMilestone?.('seating-action', 1, { classId: appState.currentClassId });
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

    _removeDragClones() {
        document.querySelectorAll('.sc-drag-clone').forEach(el => el.remove());
        document.body.classList.remove('sc-drag-over-sidebar');
        document.getElementById('seatingChartView')?.removeAttribute('data-dragging');
        this._hoveredDragCell = null;
        this._lastEvaluatedDragCell = undefined;
        this._isDragOverSidebar = false;
    },

    _getBlankDragCanvas() {
        if (!this._blankDragCanvas && typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            canvas.style.cssText = 'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
            canvas.setAttribute('aria-hidden', 'true');
            this._blankDragCanvas = canvas;
        }
        if (this._blankDragCanvas && !this._blankDragCanvas.isConnected && typeof document !== 'undefined' && document.body) {
            document.body.appendChild(this._blankDragCanvas);
        }
        return this._blankDragCanvas;
    },

    _setFloatingClonePosition(clone, x, y) {
        if (!clone) return;
        clone.style.translate = `${x}px ${y}px 0px`;
    },

    /** Builds a unified floating card clone for both mouse (.sc-drag-clone) and touch (.sc-touch-ghost) */
    _buildFloatingDragClone(sourceEl, { baseClass = 'sc-drag-clone', count = 1, memberStudent = null } = {}) {
        const sampleCell = sourceEl?.classList?.contains('sc-cell')
            ? sourceEl
            : document.querySelector('#scGridContainer .sc-cell');
        const cellW = sampleCell?.offsetWidth || 0;
        const cellH = sampleCell?.offsetHeight || 0;

        let clone;
        if (memberStudent !== null) {
            clone = document.createElement('div');
            clone.className = baseClass;
            if (memberStudent) {
                const nameInfo = this._getStudentCellNameInfo(memberStudent);
                clone.innerHTML = `
                    ${StudentPhotoManager.getAvatarHTML(memberStudent, 'sm')}
                    <span class="sc-cell-name${nameInfo.modifierClass}">${nameInfo.html}</span>
                `;
            } else if (sourceEl) {
                clone.innerHTML = sourceEl.innerHTML;
            }
        } else {
            clone = sourceEl.cloneNode(true);
            clone.className = baseClass;
            if (sourceEl.classList.contains('sc-cell-stacked')) {
                clone.classList.add('sc-cell', 'sc-cell-stacked');
            }
            if (sourceEl.classList.contains('sc-cell-special-aesh')) {
                clone.classList.add('sc-cell', 'empty', 'sc-cell-special-aesh');
            }
            if (sourceEl.classList.contains('has-status-badge')) {
                clone.classList.add('has-status-badge');
            }
            clone.classList.remove('sc-chip-selected', 'dragging');
            clone.removeAttribute('id');
            clone.removeAttribute('data-row');
            clone.removeAttribute('data-col');
            clone.removeAttribute('data-result-id');
            clone.removeAttribute('data-tooltip');
            clone.removeAttribute('data-tooltip-anchor');
            clone.removeAttribute('draggable');
            clone.querySelectorAll('.sc-cell-remove, .sc-cell-pin, .sc-stacked-member-remove, .sc-station-badge, .sc-chip-badge, .sc-chip-profile-btn, .sc-cell-special-tools').forEach(el => el.remove());
            clone.querySelectorAll('[id], [data-result-id], [data-tooltip], [data-tooltip-anchor], [draggable]').forEach(el => {
                el.removeAttribute('id');
                el.removeAttribute('data-result-id');
                el.removeAttribute('data-tooltip');
                el.removeAttribute('data-tooltip-anchor');
                el.removeAttribute('draggable');
            });

            if (sourceEl.classList.contains('sc-student-chip')) {
                const chipNameEl = clone.querySelector('.sc-student-chip-name');
                if (chipNameEl) {
                    const studentId = sourceEl.dataset?.resultId;
                    const student = studentId ? (this._studentMap?.get(studentId) || this._students?.find(s => s.id === studentId)) : null;
                    if (student) {
                        const nameInfo = this._getStudentCellNameInfo(student);
                        chipNameEl.className = `sc-cell-name${nameInfo.modifierClass}`;
                        chipNameEl.innerHTML = nameInfo.html;
                    } else {
                        chipNameEl.className = 'sc-cell-name';
                    }
                }
            }
        }

        if (cellW > 0 && cellH > 0) {
            clone.style.setProperty('--sc-cell-w', `${cellW}px`);
            clone.style.setProperty('--sc-cell-h', `${cellH}px`);
        } else if (this._isActivityMode() && sourceEl?.classList?.contains('sc-cell')) {
            clone.style.setProperty('--sc-cell-w', '118px');
            clone.style.setProperty('--sc-cell-h', '114px');
        }

        const board = sourceEl?.closest?.('#scClassroomBoard') || document.getElementById('scClassroomBoard');
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

        return clone;
    },

    _mountMouseDragClone(e, sourceEl, clone) {
        const blank = this._getBlankDragCanvas();
        if (blank) {
            e.dataTransfer?.setDragImage?.(blank, 0, 0);
        }

        if (this._isTouchInteractionActive?.() || !(e?.clientX > 0 || e?.clientY > 0)) {
            return;
        }

        document.getElementById('seatingChartView')?.setAttribute('data-dragging', 'true');
        this._setFloatingClonePosition(clone, e.clientX, e.clientY);
        document.body.appendChild(clone);

        let lastX = e.clientX;
        let lastY = e.clientY;
        const onDragMove = (ev) => {
            const cx = ev.clientX;
            const cy = ev.clientY;
            if (cx <= 0 && cy <= 0) return;
            if (cx === lastX && cy === lastY) return;
            lastX = cx;
            lastY = cy;
            this._setFloatingClonePosition(clone, cx, cy);
        };

        const onDragEnd = () => {
            clone.remove();
            document.body.classList.remove('sc-drag-over-sidebar');
            document.getElementById('seatingChartView')?.removeAttribute('data-dragging');
            sourceEl.removeEventListener('drag', onDragMove);
            sourceEl.removeEventListener('dragend', onDragEnd);
            window.removeEventListener('dragover', onDragMove, true);
            window.removeEventListener('dragend', onDragEnd);
            window.removeEventListener('drop', onDragEnd);
        };

        sourceEl.addEventListener('drag', onDragMove);
        sourceEl.addEventListener('dragend', onDragEnd);
        window.addEventListener('dragover', onDragMove, true);
        window.addEventListener('dragend', onDragEnd, { once: true });
        window.addEventListener('drop', onDragEnd, { once: true });
    },

    /** Hides native ghost and creates a floating clone that follows the cursor */
    _setCleanDragImage(e, sourceEl, count = 1) {
        this._removeDragClones();
        const clone = this._buildFloatingDragClone(sourceEl, { baseClass: 'sc-drag-clone', count });
        this._mountMouseDragClone(e, sourceEl, clone);
    },

    _setCleanMemberDragImage(e, student, sourceEl) {
        this._removeDragClones();
        const clone = this._buildFloatingDragClone(sourceEl, { baseClass: 'sc-drag-clone', memberStudent: student || false });
        this._mountMouseDragClone(e, sourceEl, clone);
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
