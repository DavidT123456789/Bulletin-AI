/**
 * @fileoverview Seating Chart — Room Layout, Grid Dimensions, Presets, Special Spots & Orientation
 * @module managers/seating/SeatingRoomLayout
 */

import { appState } from '../../state/State.js';
import { StorageManager } from '../StorageManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { UI } from '../UIManager.js';
import { ClassManager } from '../ClassManager.js';
import { HistoryManager } from '../HistoryManager.js';
import {
    DEFAULT_COLS,
    DEFAULT_ROWS,
    MIN_COLS,
    MAX_COLS,
    MIN_ROWS,
    MAX_ROWS,
    DEFAULT_ACTIVITY_COLS,
    DEFAULT_ACTIVITY_ROWS,
    MAX_ACTIVITY_GROUP_SIZE
} from './SeatingState.js';

export const SeatingRoomLayout = {
    // ========================================================================
    // CONFIG & PLACEMENT POPOVERS
    // ========================================================================

    _getPlacementPopoverHTML(mode = this._planMode) {
        if (mode === 'activity') {
            return `
                <button class="sc-popover-item" data-mode="pairs-random" type="button">
                    <iconify-icon icon="solar:users-group-two-rounded-linear"></iconify-icon>
                    <span>Binômes aléatoires (par 2)</span>
                </button>
                <button class="sc-popover-item" data-mode="pairs-neighbors" type="button">
                    <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon>
                    <span>Binômes voisins du cours</span>
                </button>
                <button class="sc-popover-item" data-mode="pairs-alpha" type="button">
                    <iconify-icon icon="solar:sort-by-alphabet-linear"></iconify-icon>
                    <span>Binômes (A → Z)</span>
                </button>
                <div class="sc-popover-divider"></div>
                <button class="sc-popover-item" data-mode="groups-3" type="button">
                    <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                    <span>Groupes de 3 (Îlots)</span>
                </button>
                <button class="sc-popover-item" data-mode="groups-4" type="button">
                    <iconify-icon icon="solar:widget-4-linear"></iconify-icon>
                    <span>Groupes de 4 / Terrains</span>
                </button>
                <div class="sc-popover-divider"></div>
                <button class="sc-popover-item" data-mode="random" type="button">
                    <iconify-icon icon="solar:shuffle-linear"></iconify-icon>
                    <span>Individuel aléatoire (1/poste)</span>
                </button>
                <button class="sc-popover-item" data-mode="alpha-asc" type="button">
                    <iconify-icon icon="solar:sort-by-alphabet-linear"></iconify-icon>
                    <span>Individuel (A → Z)</span>
                </button>
            `;
        }

        return `
            <button class="sc-popover-item" data-mode="alpha-asc" type="button">
                <iconify-icon icon="solar:sort-by-alphabet-linear"></iconify-icon>
                <span>Alphabétique (A → Z)</span>
            </button>
            <button class="sc-popover-item" data-mode="alpha-desc" type="button">
                <iconify-icon icon="solar:sort-from-bottom-to-top-linear"></iconify-icon>
                <span>Inversé (Z → A)</span>
            </button>
            <button class="sc-popover-item" data-mode="random" type="button">
                <iconify-icon icon="solar:shuffle-linear"></iconify-icon>
                <span>Mélanger (regroupé)</span>
            </button>
            <button class="sc-popover-item" data-mode="random-disperse" type="button">
                <iconify-icon icon="solar:maximize-square-minimalistic-linear"></iconify-icon>
                <span>Disperser (toute la salle)</span>
            </button>
            <div class="sc-popover-divider"></div>
            <div class="sc-popover-item sc-popover-item-disabled" title="Disponible prochainement">
                <iconify-icon icon="solar:stars-minimalistic-linear"></iconify-icon>
                <span>Intelligent (Journal)</span>
                <span class="sc-popover-badge">Bientôt</span>
            </div>
        `;
    },

    _syncPlacementPopover() {
        const popover = document.getElementById('scPlacementPopover');
        if (popover) {
            popover.innerHTML = this._getPlacementPopoverHTML(this._planMode);
        }
    },

    _togglePlacementPopover() {
        this._placementPopoverOpen ? this._closePlacementPopover() : this._openPlacementPopover();
    },

    _openPlacementPopover() {
        this._closeConfigPopover();
        const popover = document.getElementById('scPlacementPopover');
        if (!popover) return;
        this._syncPlacementPopover();
        popover.classList.add('open');
        document.getElementById('scAutoPlaceBtn')?.classList.add('active');
        this._placementPopoverOpen = true;

        if (!HistoryManager.isOpen('scPlacementPopover')) {
            HistoryManager.pushState('scPlacementPopover', () => this._closePlacementPopover());
        }
    },

    _closePlacementPopover() {
        const popover = document.getElementById('scPlacementPopover');
        if (!popover) return;
        popover.classList.remove('open');
        document.getElementById('scAutoPlaceBtn')?.classList.remove('active');
        this._placementPopoverOpen = false;

        if (HistoryManager.isOpen('scPlacementPopover')) {
            HistoryManager.handleManualClose('scPlacementPopover');
        }
    },


    _toggleConfigPopover() {
        if (!this._configPopoverOpen) {
            this._closePlacementPopover();
            document.getElementById('scConfigBtn')?.classList.remove('sc-has-pulse');
        }
        this._configPopoverOpen ? this._closeConfigPopover() : this._openConfigPopover();
    },

    _openConfigPopover() {
        this._closePlacementPopover();
        const popover = document.getElementById('scConfigPopover');
        if (!popover) return;
        this._syncConfigPopoverUI();
        popover.classList.add('open');
        document.getElementById('scConfigBtn')?.classList.add('active');
        this._configPopoverOpen = true;

        if (!HistoryManager.isOpen('scConfigPopover')) {
            HistoryManager.pushState('scConfigPopover', () => this._closeConfigPopover());
        }
    },

    _closeConfigPopover() {
        const popover = document.getElementById('scConfigPopover');
        if (!popover) return;
        popover.classList.remove('open');
        document.getElementById('scConfigBtn')?.classList.remove('active');
        this._configPopoverOpen = false;

        if (HistoryManager.isOpen('scConfigPopover')) {
            HistoryManager.handleManualClose('scConfigPopover');
        }
    },
    // ========================================================================
    // VIEW ORIENTATION (Teacher ⇄ Student Projection)
    // ========================================================================

    _isStudentOrientation() {
        return !this._isActivityMode() && this._orientation === 'student';
    },

    _toggleOrientation() {
        if (this._isActivityMode()) return;
        const next = this._orientation === 'student' ? 'teacher' : 'student';
        this._applyOrientation(next, true);
        localStorage.setItem('bulletin_seating_orientation', next);
    },

    _applyOrientation(orientation, animate = false) {
        this._orientation = orientation;
        const effectiveOrientation = this._isActivityMode() ? 'teacher' : orientation;
        const view = document.getElementById('seatingChartView');
        if (view) {
            view.dataset.orientation = effectiveOrientation;
        }

        const isStudent = effectiveOrientation === 'student';

        const tooltip = isStudent
            ? 'Vue Élèves active • Inverser'
            : 'Vue Prof active • Inverser';
        const ariaLabel = isStudent
            ? 'Vue Élèves active (cliquer pour inverser la vue)'
            : 'Vue Prof active (cliquer pour inverser la vue)';

        // Update desk text, icons & accessibility
        const desk = document.getElementById('scDesk');
        if (desk) {
            desk.innerHTML = '<iconify-icon class="sc-desk-cap" icon="solar:square-academic-cap-linear"></iconify-icon><span>Tableau</span>';
            desk.setAttribute('aria-label', ariaLabel);
            desk.setAttribute('data-tooltip', tooltip);
        }

        // Update orientation action buttons
        const orientationBtns = [
            document.getElementById('scOrientationBtn'),
            document.getElementById('scFloatingOrientationBtn')
        ];
        orientationBtns.forEach(btn => {
            if (!btn) return;
            btn.classList.toggle('active', isStudent);
            btn.setAttribute('aria-label', ariaLabel);
            btn.setAttribute('data-tooltip', tooltip);
            const icon = btn.querySelector('iconify-icon');
            if (icon) {
                icon.setAttribute('icon', 'solar:users-group-rounded-linear');
            }
        });
        TooltipsUI.initTooltips(document.getElementById('seatingChartView'));

        if (animate) {
            // 180° rotation spring transition on board
            const board = document.getElementById('scClassroomBoard');
            if (board) {
                board.classList.remove('sc-orienting');
                void board.offsetWidth;
                board.classList.add('sc-orienting');
                setTimeout(() => board.classList.remove('sc-orienting'), 550);
            }

            this._renderGrid();
            this._staggerCellEntrance(140);
        } else {
            this._renderGrid();
        }

        if (this._isFitted) {
            setTimeout(() => this._applySmartFit(), animate ? 560 : 0);
        }

        this._scrollToDesk();
    },
    // ========================================================================
    // GRID CONFIGURATION
    // ========================================================================

    _getMaxClassStudentCount() {
        let maxCount = (this._students || []).filter(s => !this._isStudentDeparted(s)).length;
        const classes = appState.classes || [];
        for (const cls of classes) {
            if (!cls || cls.isVirtual || ClassManager.isVirtualClass(cls.id)) continue;
            const results = ClassManager.getStudentsForClass(cls.id);
            const activeCount = results.filter(r => !this._isStudentDeparted(r)).length;
            if (activeCount > maxCount) {
                maxCount = activeCount;
            }
        }
        return maxCount;
    },

    _getDefaultRows(mode = this._planMode) {
        if (mode === 'activity') return DEFAULT_ACTIVITY_ROWS;
        const maxStudents = this._getMaxClassStudentCount();
        if (maxStudents > DEFAULT_ROWS * DEFAULT_COLS) {
            return Math.min(10, Math.ceil(maxStudents / DEFAULT_COLS));
        }
        return DEFAULT_ROWS;
    },

    _getDefaultCols(mode = this._planMode) {
        return mode === 'activity' ? DEFAULT_ACTIVITY_COLS : DEFAULT_COLS;
    },

    _isRoomConfigured(mode = this._planMode) {
        if (mode === 'activity') return true;
        const grid = appState.seatingGrid;
        if (grid && typeof grid === 'object') {
            if (grid.roomConfigured) return true;
            if (grid.specialLayout && Object.keys(grid.specialLayout).length > 0) return true;
            if ((typeof grid.rows === 'number' && grid.rows !== DEFAULT_ROWS) ||
                (typeof grid.cols === 'number' && grid.cols !== DEFAULT_COLS)) {
                return true;
            }
        }
        const results = appState.generatedResults || appState.results || [];
        return results.some(r => r?.seatingPosition?.row != null && r?.seatingPosition?.col != null);
    },

    _getRoomCapacityInfo() {
        const rows = this._getRows();
        const cols = this._getCols();
        let specialCount = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this._isSpecialSpot(r, c)) specialCount++;
            }
        }
        const totalSeats = Math.max(0, (rows * cols) - specialCount);
        const activeClassStudents = (this._students || []).filter(s => !this._isStudentDeparted(s)).length;
        const maxClassStudents = this._getMaxClassStudentCount();
        return {
            rows,
            cols,
            totalSeats,
            activeClassStudents,
            maxClassStudents,
            isShortForCurrent: activeClassStudents > 0 && totalSeats < activeClassStudents,
            isShortForMax: maxClassStudents > 0 && totalSeats < maxClassStudents
        };
    },

    _getCapacityBadgeInnerHTML(capInfo = this._getRoomCapacityInfo()) {
        const { totalSeats, activeClassStudents, maxClassStudents, isShortForCurrent, isShortForMax } = capInfo;
        const unitLabel = this._isActivityMode() ? 'poste' : 'place';
        const seatsLabel = `${totalSeats} ${unitLabel}${totalSeats > 1 ? 's' : ''}`;

        if (isShortForCurrent) {
            return `<iconify-icon icon="solar:danger-triangle-bold"></iconify-icon><span><strong>${seatsLabel}</strong> · Insuffisant (${activeClassStudents} élèves)</span>`;
        }
        if (isShortForMax) {
            return `<iconify-icon icon="solar:info-circle-bold"></iconify-icon><span><strong>${seatsLabel}</strong> · Classe max à ${maxClassStudents} élèves</span>`;
        }
        if (maxClassStudents > activeClassStudents && maxClassStudents > 0) {
            return `<iconify-icon icon="solar:check-circle-bold"></iconify-icon><span><strong>${seatsLabel}</strong> · Calibré (max ${maxClassStudents} élèves)</span>`;
        }
        if (activeClassStudents > 0) {
            return `<iconify-icon icon="solar:check-circle-bold"></iconify-icon><span><strong>${seatsLabel}</strong> pour ${activeClassStudents} élève${activeClassStudents > 1 ? 's' : ''}</span>`;
        }
        return `<iconify-icon icon="solar:chair-linear"></iconify-icon><span><strong>${seatsLabel}</strong> disponibles</span>`;
    },

    _detectCurrentRoomPreset() {
        const gridKey = this._getActiveGridKey();
        const rows = this._getRows();
        const cols = this._getCols();
        const specialLayout = appState[gridKey]?.specialLayout || {};

        const aisleCols = [];
        for (let c = 0; c < cols; c++) {
            let aisleCountInCol = 0;
            for (let r = 0; r < rows; r++) {
                if (specialLayout[`${r},${c}`] === 'aisle') aisleCountInCol++;
            }
            if (rows > 0 && aisleCountInCol === rows) {
                aisleCols.push(c);
            } else if (aisleCountInCol > 0) {
                return 'custom';
            }
        }

        if (aisleCols.length === 0) {
            return 'compact';
        }
        if (cols === 7 && aisleCols.length === 1 && aisleCols[0] === 3) {
            return 'center-aisle';
        }
        if (cols === 8 && aisleCols.length === 2 && aisleCols[0] === 2 && aisleCols[1] === 5) {
            return 'double-aisles';
        }
        return 'custom';
    },

    _syncConfigPopoverUI() {
        const popover = document.getElementById('scConfigPopover');
        if (!popover) return;

        const isActivity = this._isActivityMode();
        const presetsSection = document.getElementById('scConfigPresetsSection');
        if (presetsSection) {
            presetsSection.style.display = isActivity ? 'none' : '';
        }

        const activePreset = isActivity ? 'custom' : this._detectCurrentRoomPreset();
        popover.querySelectorAll('.sc-config-preset-pill').forEach(pill => {
            const isActive = pill.dataset.preset === activePreset;
            pill.classList.toggle('active', isActive);
            pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        const cols = this._getCols();
        const rows = this._getRows();
        popover.querySelectorAll('.sc-config-step-btn').forEach(btn => {
            const dim = btn.dataset.dim;
            const delta = parseInt(btn.dataset.delta, 10);
            const val = dim === 'cols' ? cols : rows;
            btn.disabled = (delta < 0 && val <= 2) || (delta > 0 && val >= 10);
        });

        const capEl = document.getElementById('scConfigCapacity');
        if (capEl) {
            const capInfo = this._getRoomCapacityInfo();
            capEl.className = `sc-config-capacity ${capInfo.isShortForCurrent || capInfo.isShortForMax ? 'is-warning' : 'is-ok'}`;
            capEl.innerHTML = this._getCapacityBadgeInnerHTML(capInfo);
        }
    },

    _stepGridDimension(dim, delta) {
        if (this._isLocked) return;
        const isCols = dim === 'cols';
        const slider = document.getElementById(isCols ? 'scColsSlider' : 'scRowsSlider');
        const valEl = document.getElementById(isCols ? 'scColsValue' : 'scRowsValue');
        const current = isCols ? this._getCols() : this._getRows();
        const next = Math.max(2, Math.min(10, current + delta));
        if (next === current) return;

        this._snapshotGrid();
        if (slider) {
            slider.value = String(next);
        } else {
            const gridKey = this._getActiveGridKey();
            if (!appState[gridKey]) {
                appState[gridKey] = {
                    rows: this._getRows(),
                    cols: this._getCols(),
                    locked: this._isLocked,
                    roomConfigured: true,
                    specialLayout: {}
                };
            }
            if (isCols) appState[gridKey].cols = next;
            else appState[gridKey].rows = next;
        }
        if (valEl) valEl.textContent = String(next);
        this._onGridConfigChange();
        this._haptic(10);
    },

    _applyRoomPreset(presetId) {
        if (this._isLocked) return;
        const presetConfigs = {
            'compact': { cols: 6, aisles: [] },
            'center-aisle': { cols: 7, aisles: [3] },
            'double-aisles': { cols: 8, aisles: [2, 5] }
        };
        const preset = presetConfigs[presetId];
        if (!preset) return;

        this._snapshotGrid();

        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        const lockKey = this._getActiveClassLockKey();
        const updatedKey = this._getActiveClassUpdatedKey();

        const oldRows = this._gridState?.length || this._getRows();
        const oldCols = this._gridState?.[0]?.length || this._getCols();
        const minRowsForMaxClass = Math.min(10, Math.max(DEFAULT_ROWS, Math.ceil(this._getMaxClassStudentCount() / 6)));
        const targetRows = Math.max(oldRows, !appState[gridKey] ? minRowsForMaxClass : oldRows);
        const targetCols = preset.cols;
        const aisleCols = preset.aisles;

        const oldSpecial = appState[gridKey]?.specialLayout || {};
        const oldAisleCols = [];
        for (let c = 0; c < oldCols; c++) {
            let aisleRows = 0;
            for (let r = 0; r < oldRows; r++) {
                if (oldSpecial[`${r},${c}`] === 'aisle') aisleRows++;
            }
            if (oldRows > 0 && aisleRows >= Math.ceil(oldRows / 2)) {
                oldAisleCols.push(c);
            }
        }

        const oldDeskCols = [];
        for (let c = 0; c < oldCols; c++) {
            if (!oldAisleCols.includes(c)) oldDeskCols.push(c);
        }
        const newDeskCols = [];
        for (let c = 0; c < targetCols; c++) {
            if (!aisleCols.includes(c)) newDeskCols.push(c);
        }

        const colMap = new Map();
        const mapLen = Math.min(oldDeskCols.length, newDeskCols.length);
        for (let i = 0; i < mapLen; i++) {
            colMap.set(oldDeskCols[i], newDeskCols[i]);
        }

        const newSpecialLayout = {};
        for (const [key, type] of Object.entries(oldSpecial)) {
            if (type === 'aisle') continue;
            const [r, c] = key.split(',').map(Number);
            const mappedC = colMap.has(c) ? colMap.get(c) : c;
            if (r >= 0 && r < targetRows && mappedC >= 0 && mappedC < targetCols && !aisleCols.includes(mappedC)) {
                newSpecialLayout[`${r},${mappedC}`] = type;
            }
        }
        for (let r = 0; r < targetRows; r++) {
            for (const c of aisleCols) {
                newSpecialLayout[`${r},${c}`] = 'aisle';
            }
        }

        const currentClass = this._getCurrentClass();
        if (currentClass?.[classSpecialKey]) {
            const nextClassSpecial = {};
            for (const [key, type] of Object.entries(currentClass[classSpecialKey])) {
                const [r, c] = key.split(',').map(Number);
                const mappedC = colMap.has(c) ? colMap.get(c) : c;
                if (r >= 0 && r < targetRows && mappedC >= 0 && mappedC < targetCols && !aisleCols.includes(mappedC)) {
                    nextClassSpecial[`${r},${mappedC}`] = type;
                }
            }
            currentClass[classSpecialKey] = nextClassSpecial;
        }

        const newGrid = Array.from({ length: targetRows }, () => Array(targetCols).fill(null));
        for (let r = 0; r < Math.min(oldRows, targetRows); r++) {
            for (let c = 0; c < oldCols; c++) {
                const cellIds = this._getCellStudentIds(r, c);
                if (cellIds.length === 0) continue;
                const mappedC = colMap.has(c) ? colMap.get(c) : (!aisleCols.includes(c) && c < targetCols ? c : -1);
                if (mappedC >= 0 && mappedC < targetCols && !newSpecialLayout[`${r},${mappedC}`] && !currentClass?.[classSpecialKey]?.[`${r},${mappedC}`]) {
                    newGrid[r][mappedC] = cellIds.length === 1 ? cellIds[0] : [...cellIds];
                }
            }
        }
        this._gridState = newGrid;

        const rowSlider = document.getElementById('scRowsSlider');
        const colSlider = document.getElementById('scColsSlider');
        const rowValEl = document.getElementById('scRowsValue');
        const colValEl = document.getElementById('scColsValue');
        if (rowSlider) rowSlider.value = String(targetRows);
        if (rowValEl) rowValEl.textContent = String(targetRows);
        if (colSlider) colSlider.value = String(targetCols);
        if (colValEl) colValEl.textContent = String(targetCols);

        appState[gridKey] = {
            rows: targetRows,
            cols: targetCols,
            locked: this._isLocked,
            roomConfigured: true,
            specialLayout: newSpecialLayout
        };

        this._hasChangesSinceUnlock = true;
        if (currentClass) {
            currentClass[lockKey] = false;
            currentClass[updatedKey] = Date.now();
        }

        this._savePositionsToState(true);
        this._saveGridConfig();
        this._render();
        this._applySmartFit(true);
        this._staggerCellEntrance();
        this._haptic(12);
    },

    _getRows() {
        const gridKey = this._getActiveGridKey();
        const sliderVal = parseInt(document.getElementById('scRowsSlider')?.value);
        if (!isNaN(sliderVal)) return sliderVal;
        const defaultRows = this._getDefaultRows();
        return this._isRoomConfigured() ? (appState[gridKey]?.rows ?? defaultRows) : Math.max(appState[gridKey]?.rows ?? 0, defaultRows);
    },

    _getCols() {
        const gridKey = this._getActiveGridKey();
        const sliderVal = parseInt(document.getElementById('scColsSlider')?.value);
        return !isNaN(sliderVal) ? sliderVal : (appState[gridKey]?.cols ?? this._getDefaultCols());
    },

    _loadGridConfig() {
        const gridKey = this._getActiveGridKey();
        const config = appState[gridKey];
        const defaultRows = this._getDefaultRows();
        const rows = this._isRoomConfigured() ? (config?.rows || defaultRows) : Math.max(config?.rows || 0, defaultRows);
        const cols = config?.cols || this._getDefaultCols();

        const rowSlider = document.getElementById('scRowsSlider');
        const colSlider = document.getElementById('scColsSlider');
        if (rowSlider) { rowSlider.value = rows; document.getElementById('scRowsValue').textContent = rows; }
        if (colSlider) { colSlider.value = cols; document.getElementById('scColsValue').textContent = cols; }

        this._orientation = localStorage.getItem('bulletin_seating_orientation') || appState.seatingGrid?.orientation || config?.orientation || 'teacher';
        this._applyOrientation(this._orientation);
    },

    _saveGridConfig() {
        if (this._isVirtualClass()) return;
        const rows = this._getRows();
        const cols = this._getCols();
        const locked = this._isLocked;
        const gridKey = this._getActiveGridKey();
        const lockKey = this._getActiveClassLockKey();
        const currentGrid = appState[gridKey];
        const currentClass = this._getCurrentClass();
        const classLocked = Boolean(currentClass?.[lockKey]);

        const isSame = currentGrid &&
            currentGrid.rows === rows &&
            currentGrid.cols === cols &&
            currentGrid.locked === locked;

        const isDefaultUnmodified = !currentGrid &&
            !this._hasChangesSinceUnlock &&
            !classLocked &&
            rows === this._getDefaultRows() &&
            cols === this._getDefaultCols();

        if (isSame || isDefaultUnmodified) return;

        const nextGrid = {
            rows,
            cols,
            locked,
            specialLayout: currentGrid?.specialLayout || {}
        };
        if (currentGrid?.roomConfigured || this._hasChangesSinceUnlock) {
            nextGrid.roomConfigured = true;
        }
        appState[gridKey] = nextGrid;
        if (currentClass && this._hasChangesSinceUnlock && !locked) {
            currentClass[lockKey] = false;
        }
        if (this._hasChangesSinceUnlock || (locked && classLocked)) {
            StorageManager.saveAppState();
        }
    },

    _onGridConfigChange() {
        const newRows = this._getRows();
        const newCols = this._getCols();
        const oldRows = this._gridState ? this._gridState.length : newRows;
        const posKey = this._getActivePositionKey();
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        const lockKey = this._getActiveClassLockKey();
        const updatedKey = this._getActiveClassUpdatedKey();
        
        // Récupère toutes les positions connues des étudiants (y compris ceux temporairement hors de la grille visible)
        const placed = {};
        this._students.forEach(s => {
            const pos = s[posKey];
            if (pos?.row != null && pos?.col != null) {
                placed[s.id] = {
                    row: pos.row,
                    col: pos.col,
                    pinned: pos.pinned || false,
                    order: pos.order ?? 0
                };
            }
        });
        if (this._gridState) {
            for (let r = 0; r < this._gridState.length; r++) {
                for (let c = 0; c < this._gridState[r].length; c++) {
                    const cellIds = this._getCellStudentIds(r, c);
                    cellIds.forEach((id, idx) => {
                        placed[id] = {
                            row: r,
                            col: c,
                            pinned: placed[id]?.pinned || false,
                            order: idx
                        };
                    });
                }
            }
        }

        this._initGrid(newRows, newCols);

        // Calcule le décalage pour ajouter/supprimer les rangées par le haut (éloigné du bureau)
        // car le bureau (bottom) est l'origine visuelle.
        const rowOffset = newRows - oldRows;

        // Repositionne d'abord la cartographie des places spéciales (allées, AESH...)
        if (rowOffset !== 0) {
            if (appState[gridKey]?.specialLayout) {
                const oldSpecial = appState[gridKey].specialLayout;
                const newSpecialLayout = {};
                for (const [key, type] of Object.entries(oldSpecial)) {
                    const [r, c] = key.split(',').map(Number);
                    const newR = r + rowOffset;
                    newSpecialLayout[`${newR},${c}`] = type;
                }
                if (rowOffset > 0) {
                    for (let c = 0; c < newCols; c++) {
                        if (oldSpecial[`0,${c}`] === 'aisle') {
                            for (let r = 0; r < rowOffset; r++) {
                                if (!newSpecialLayout[`${r},${c}`]) {
                                    newSpecialLayout[`${r},${c}`] = 'aisle';
                                }
                            }
                        }
                    }
                }
                appState[gridKey].specialLayout = newSpecialLayout;
            }

            const classes = appState.classes || [];
            classes.forEach(cls => {
                if (cls?.[classSpecialKey]) {
                    const newClassSpecial = {};
                    for (const [key, type] of Object.entries(cls[classSpecialKey])) {
                        const [r, c] = key.split(',').map(Number);
                        const newR = r + rowOffset;
                        newClassSpecial[`${newR},${c}`] = type;
                    }
                    cls[classSpecialKey] = newClassSpecial;
                }
            });
        }

        // Repositionne les étudiants (en préservant les binômes/groupes et leur ordre)
        const cellBuckets = new Map();
        for (const [resultId, pos] of Object.entries(placed)) {
            const newR = pos.row + rowOffset;
            pos.row = newR;
            if (newR >= 0 && newR < newRows && pos.col >= 0 && pos.col < newCols && !this._isSpecialSpot(newR, pos.col)) {
                const key = `${newR},${pos.col}`;
                if (!cellBuckets.has(key)) cellBuckets.set(key, []);
                cellBuckets.get(key).push({ id: resultId, order: pos.order ?? 0 });
            }
        }

        const currentClass = this._getCurrentClass();
        const isVirtual = this._isVirtualClass(currentClass);
        const maxPerCell = (isVirtual || this._isActivityMode()) ? MAX_ACTIVITY_GROUP_SIZE : 1;

        for (const [key, items] of cellBuckets.entries()) {
            const [r, c] = key.split(',').map(Number);
            items.sort((a, b) => a.order - b.order);
            this._setCellStudentIds(r, c, items.slice(0, maxPerCell).map(item => item.id));
        }

        // Met à jour la coordonnée décalée des élèves temporairement hors-grille pour éviter toute collision avec la rangée 0
        if (rowOffset !== 0) {
            const activePlacedIds = this._getPlacedIds();
            this._students.forEach(s => {
                if (!activePlacedIds.has(s.id) && placed[s.id]) {
                    const shiftedPos = {
                        row: placed[s.id].row,
                        col: placed[s.id].col,
                        pinned: placed[s.id].pinned || false,
                        ...(placed[s.id].order > 0 ? { order: placed[s.id].order } : {})
                    };
                    const result = appState.generatedResults?.find(r => r.id === s.id);
                    if (result) {
                        result[posKey] = shiftedPos;
                        result._lastModified = Date.now();
                    }
                    s[posKey] = shiftedPos;
                }
            });
        }

        this._hasChangesSinceUnlock = true;
        if (currentClass) {
            currentClass[lockKey] = false;
            currentClass[updatedKey] = Date.now();
        }
        this._savePositionsToState(true); // Conserve les coordonnées des élèves temporairement hors-grille
        this._render();
        this._applySmartFit(true);
        this._saveGridConfig();
        this._staggerCellEntrance();
    },
    _getCellSpecial(row, col) {
        const key = `${row},${col}`;
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        // 1. Structure globale (salle entière : allée, place condamnée salle, legacy)
        const globalType = appState[gridKey]?.specialLayout?.[key];
        if (globalType) return { type: globalType, scope: 'global' };

        // 2. Dispositif spécifique à la classe en cours (place AESH, place condamnée classe)
        const currentClass = this._getCurrentClass();
        const classType = currentClass?.[classSpecialKey]?.[key];
        if (classType) return { type: classType, scope: 'class' };

        return null;
    },

    _isSpecialSpot(row, col) {
        return !!this._getCellSpecial(row, col);
    },

    _setCellSpecialType(row, col, type) {
        this._snapshotGrid();
        const key = `${row},${col}`;
        const currentClass = this._getCurrentClass();
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        const lockKey = this._getActiveClassLockKey();

        if (!type) {
            // Rétablir : libérer des deux niveaux (global et classe)
            if (appState[gridKey]?.specialLayout) {
                delete appState[gridKey].specialLayout[key];
            }
            if (currentClass?.[classSpecialKey]) {
                delete currentClass[classSpecialKey][key];
            }
        } else if (type === 'aisle') {
            // Allée : structure physique de la salle (salle entière / global)
            if (!appState[gridKey]) appState[gridKey] = {};
            if (!appState[gridKey].specialLayout) appState[gridKey].specialLayout = {};
            appState[gridKey].specialLayout[key] = 'aisle';
            if (currentClass?.[classSpecialKey]) {
                delete currentClass[classSpecialKey][key];
            }
        } else if (type === 'aesh') {
            // AESH : spécifique à la classe en cours
            if (currentClass) {
                if (!currentClass[classSpecialKey]) currentClass[classSpecialKey] = {};
                currentClass[classSpecialKey][key] = 'aesh';
                if (appState[gridKey]?.specialLayout?.[key]) {
                    delete appState[gridKey].specialLayout[key];
                }
            } else {
                if (!appState[gridKey]) appState[gridKey] = {};
                if (!appState[gridKey].specialLayout) appState[gridKey].specialLayout = {};
                appState[gridKey].specialLayout[key] = 'aesh';
            }
        } else if (type === 'blocked') {
            // Condamné : spécifique à la classe en cours par défaut
            if (currentClass) {
                if (!currentClass[classSpecialKey]) currentClass[classSpecialKey] = {};
                currentClass[classSpecialKey][key] = 'blocked';
                if (appState[gridKey]?.specialLayout?.[key]) {
                    delete appState[gridKey].specialLayout[key];
                }
            } else {
                if (!appState[gridKey]) appState[gridKey] = {};
                if (!appState[gridKey].specialLayout) appState[gridKey].specialLayout = {};
                appState[gridKey].specialLayout[key] = 'blocked';
            }
        }

        this._hasChangesSinceUnlock = true;
        if (currentClass) currentClass[lockKey] = false;
        this._saveGridConfig();
        this._render();
    },

    _toggleBlockedScope(row, col) {
        this._snapshotGrid();
        const key = `${row},${col}`;
        const currentClass = this._getCurrentClass();
        const className = currentClass?.name || 'la classe';
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        const lockKey = this._getActiveClassLockKey();

        const isGlobal = !!appState[gridKey]?.specialLayout?.[key];
        const isClass = !!currentClass?.[classSpecialKey]?.[key];

        if (isClass) {
            // Passer en portée globale (toutes les classes / salle)
            delete currentClass[classSpecialKey][key];
            if (!appState[gridKey]) appState[gridKey] = {};
            if (!appState[gridKey].specialLayout) appState[gridKey].specialLayout = {};
            appState[gridKey].specialLayout[key] = 'blocked';
            UI.showNotification('Place condamnée pour toutes les classes (salle)', 'info');
        } else if (isGlobal) {
            // Restreindre à la classe en cours
            delete appState[gridKey].specialLayout[key];
            if (currentClass) {
                if (!currentClass[classSpecialKey]) currentClass[classSpecialKey] = {};
                currentClass[classSpecialKey][key] = 'blocked';
                UI.showNotification(`Place condamnée pour ${className} uniquement`, 'info');
            } else {
                UI.showNotification('Aucune classe active sélectionnée', 'warning');
                return;
            }
        }

        this._hasChangesSinceUnlock = true;
        if (currentClass) currentClass[lockKey] = false;
        this._saveGridConfig();
        this._render();
    }
};
