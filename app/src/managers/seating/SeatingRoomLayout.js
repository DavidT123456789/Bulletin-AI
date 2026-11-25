/**
 * @fileoverview Seating Chart — Room Layout, Grid Dimensions, Presets, Special Spots & Orientation
 * @module managers/seating/SeatingRoomLayout
 */

import { appState } from '../../state/State.js';
import { DEFAULT_SEATING_STATUS_DOTS } from '../../config/Config.js';
import { bus, EVENTS } from '../../core/EventBus.js';
import { SafeStorage, STORAGE_KEYS } from '../../utils/SafeStorage.js';
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

    _getMaxActivityGroupSizeOnGrid() {
        let detectedSize = 0;
        const rows = this._gridState?.length || 0;
        for (let r = 0; r < rows; r++) {
            const cols = this._gridState[r]?.length || 0;
            for (let c = 0; c < cols; c++) {
                const len = this._getCellStudentIds?.(r, c)?.length || 0;
                if (len > detectedSize) detectedSize = len;
            }
        }
        return detectedSize;
    },

    _detectActivityGroupSize() {
        const detectedSize = this._getMaxActivityGroupSizeOnGrid();
        return (detectedSize >= 1 && detectedSize <= MAX_ACTIVITY_GROUP_SIZE) ? detectedSize : 2;
    },

    _getSelectedActivityGroupSize() {
        const popover = document.getElementById('scPlacementPopover');
        const activeBtn = popover?.querySelector('.sc-placement-size-pill.active');
        const domSize = activeBtn ? parseInt(activeBtn.dataset.groupSize, 10) : NaN;
        if (Number.isInteger(domSize) && domSize >= 1 && domSize <= MAX_ACTIVITY_GROUP_SIZE) {
            return domSize;
        }
        if (Number.isInteger(this._activityGroupSize) && this._activityGroupSize >= 1 && this._activityGroupSize <= MAX_ACTIVITY_GROUP_SIZE) {
            return this._activityGroupSize;
        }
        return this._detectActivityGroupSize();
    },

    _setActivityGroupSize(size) {
        const normalized = Math.max(1, Math.min(MAX_ACTIVITY_GROUP_SIZE, parseInt(size, 10) || 2));
        this._activityGroupSize = normalized;
        const popover = document.getElementById('scPlacementPopover');
        if (!popover) return;

        popover.querySelectorAll('.sc-placement-size-pill').forEach(btn => {
            const isMatch = parseInt(btn.dataset.groupSize, 10) === normalized;
            btn.classList.toggle('active', isMatch);
            btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
        });

        const isSolo = normalized === 1;
        const soloTooltip = 'Disponible à partir de 2 élèves par poste';
        popover.querySelectorAll('.sc-popover-item[data-requires-group="true"]').forEach(btn => {
            btn.classList.toggle('sc-popover-item-disabled', isSolo);
            if (isSolo) {
                btn.setAttribute('aria-disabled', 'true');
                btn.setAttribute('data-tooltip', soloTooltip);
                TooltipsUI?.updateTooltip?.(btn, soloTooltip);
            } else {
                btn.removeAttribute('aria-disabled');
                TooltipsUI?.cleanupTooltipsIn?.(btn);
                btn.removeAttribute('data-tooltip');
            }
        });
    },

    _getPlacementPopoverHTML(mode = this._planMode) {
        if (mode === 'activity') {
            const activeSize = this._detectActivityGroupSize();
            this._activityGroupSize = activeSize;
            const isSolo = activeSize === 1;
            const soloDisabledAttrs = isSolo
                ? ' aria-disabled="true" data-tooltip="Disponible à partir de 2 élèves par poste"'
                : '';
            return `
                <div class="sc-placement-size-section">
                    <div class="sc-config-section-title">Élèves par poste</div>
                    <div class="sc-placement-size-pills" role="group" aria-label="Élèves par poste">
                        ${[1, 2, 3, 4].map(sz => `
                            <button type="button" class="sc-placement-size-pill${activeSize === sz ? ' active' : ''}" data-group-size="${sz}" aria-pressed="${activeSize === sz ? 'true' : 'false'}" aria-label="${sz} élève${sz > 1 ? 's' : ''} par poste">${sz}</button>
                        `).join('')}
                    </div>
                </div>
                <div class="sc-placement-actions-section">
                    <div class="sc-config-section-title">Répartition</div>
                    <button class="sc-popover-item" data-mode="random" type="button">
                        <iconify-icon icon="solar:shuffle-linear"></iconify-icon>
                        <span class="sc-popover-item-label">Aléatoire</span>
                    </button>
                    <button class="sc-popover-item${isSolo ? ' sc-popover-item-disabled' : ''}" data-mode="groups-balanced" data-requires-group="true" type="button"${soloDisabledAttrs}>
                        <iconify-icon icon="ph:scales"></iconify-icon>
                        <span class="sc-popover-item-label">Équilibré <small>Par niveau</small></span>
                    </button>
                    <button class="sc-popover-item${isSolo ? ' sc-popover-item-disabled' : ''}" data-mode="pairs-neighbors" data-requires-group="true" type="button"${soloDisabledAttrs}>
                        <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon>
                        <span class="sc-popover-item-label">Voisins <small>Plan de cours</small></span>
                    </button>
                    <button class="sc-popover-item" data-mode="alpha-asc" type="button">
                        <iconify-icon icon="solar:sort-by-alphabet-linear"></iconify-icon>
                        <span class="sc-popover-item-label">Alphabétique <small>A → Z</small></span>
                    </button>
                </div>
            `;
        }

        return `
            <div class="sc-placement-actions-section">
                <div class="sc-config-section-title">Agencement</div>
                <button class="sc-popover-item" data-mode="alpha-asc" type="button">
                    <iconify-icon icon="solar:sort-from-top-to-bottom-linear"></iconify-icon>
                    <span class="sc-popover-item-label">Alphabétique <small>A → Z</small></span>
                </button>
                <button class="sc-popover-item" data-mode="alpha-desc" type="button">
                    <iconify-icon icon="solar:sort-from-bottom-to-top-linear"></iconify-icon>
                    <span class="sc-popover-item-label">Inversé <small>Z → A</small></span>
                </button>
                <button class="sc-popover-item" data-mode="random" type="button">
                    <iconify-icon icon="solar:shuffle-linear"></iconify-icon>
                    <span class="sc-popover-item-label">Aléatoire <small>Vers l'avant</small></span>
                </button>
                <button class="sc-popover-item" data-mode="random-disperse" type="button">
                    <iconify-icon icon="solar:maximize-square-minimalistic-linear"></iconify-icon>
                    <span class="sc-popover-item-label">Disperser <small>Espacement max.</small></span>
                </button>
                <div class="sc-popover-divider"></div>
                <button class="sc-popover-item" data-mode="smart-journal" type="button">
                    <iconify-icon icon="solar:stars-minimalistic-linear"></iconify-icon>
                    <span class="sc-popover-item-texts">
                        <span class="sc-popover-item-label">Placement intelligent</span>
                        <span class="sc-popover-item-sublabel">Dispositifs devant · Bavards espacés</span>
                    </span>
                </button>
            </div>
        `;
    },

    _syncPlacementPopover() {
        const popover = document.getElementById('scPlacementPopover');
        if (popover) {
            if (this._planMode === 'activity') {
                this._activityGroupSize = this._detectActivityGroupSize();
            }
            TooltipsUI?.cleanupTooltipsIn?.(popover);
            popover.innerHTML = this._getPlacementPopoverHTML(this._planMode);
            TooltipsUI?.initTooltips?.(popover);
        }
    },

    _togglePlacementPopover() {
        this._placementPopoverOpen ? this._closePlacementPopover() : this._openPlacementPopover();
    },

    _openPlacementPopover() {
        this._exitAislePaintMode?.();
        this._dismissOnboardingHint?.();
        this._closeConfigPopover();
        this._closeStatusDotsPopover();
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
        }
        this._configPopoverOpen ? this._closeConfigPopover() : this._openConfigPopover();
    },

    _openConfigPopover() {
        this._exitAislePaintMode?.();
        this._dismissOnboardingHint?.();
        this._closePlacementPopover();
        this._closeStatusDotsPopover();
        const popover = document.getElementById('scConfigPopover');
        if (!popover) return;
        this._syncConfigPopoverUI();
        popover.classList.add('open');
        const configBtn = document.getElementById('scConfigBtn');
        configBtn?.classList.remove('sc-has-pulse');
        configBtn?.classList.add('active');
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

    _toggleStatusDotsPopover() {
        this._statusDotsPopoverOpen ? this._closeStatusDotsPopover() : this._openStatusDotsPopover();
    },

    _openStatusDotsPopover() {
        const popover = document.getElementById('scStatusDotsPopover');
        if (!popover || this._isRandomPickerActive?.()) return;
        this._closeContextMenu?.();
        this._closePlacementPopover();
        this._closeConfigPopover();
        this._syncStatusDotsUI();
        popover.classList.add('open');
        popover.setAttribute('aria-hidden', 'false');
        const btn = document.getElementById('scFloatingDotsBtn');
        btn?._tippy?.hide?.();
        btn?.classList.add('active');
        btn?.setAttribute('aria-expanded', 'true');
        this._statusDotsPopoverOpen = true;
        if (!HistoryManager.isOpen('scStatusDotsPopover')) {
            HistoryManager.pushState('scStatusDotsPopover', () => this._closeStatusDotsPopover());
        }
    },

    _closeStatusDotsPopover() {
        const popover = document.getElementById('scStatusDotsPopover');
        if (!popover) return;
        popover.classList.remove('open');
        popover.setAttribute('aria-hidden', 'true');
        const btn = document.getElementById('scFloatingDotsBtn');
        btn?.classList.remove('active');
        btn?.setAttribute('aria-expanded', 'false');
        this._statusDotsPopoverOpen = false;
        if (HistoryManager.isOpen('scStatusDotsPopover')) {
            HistoryManager.handleManualClose('scStatusDotsPopover');
        }
    },

    _syncStatusDotsUI() {
        const dots = { ...DEFAULT_SEATING_STATUS_DOTS, ...(appState.seatingStatusDots || {}) };
        document.querySelectorAll('#seatingStatusDotsSelector input[type="checkbox"][data-dot-category]').forEach(cb => {
            cb.checked = Boolean(dots[cb.dataset.dotCategory]);
        });
    },

    _setStatusDot(category, isVisible) {
        appState.seatingStatusDots = {
            ...DEFAULT_SEATING_STATUS_DOTS,
            ...(appState.seatingStatusDots || {}),
            [category]: isVisible
        };
        bus.emit(EVENTS.APP_SETTINGS_CHANGED, { settings: appState, reason: 'seating-status-dots' });
        StorageManager.saveAppState();
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
        SafeStorage.set(STORAGE_KEYS.SEATING_ORIENTATION, next);
    },

    _applyOrientation(orientation, animate = false, options = {}) {
        const { skipRender = false } = options;
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
        if (skipRender) return;
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
        const isActivity = this._isActivityMode();
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        const globalSpecial = appState[gridKey]?.specialLayout || {};
        const currentClass = this._getCurrentClass();
        const classSpecial = currentClass?.[classSpecialKey] || {};
        const preview = this._getPreviewPresetContext(globalSpecial, rows, cols);
        let specialCount = 0;
        let globalSpecialCount = 0;

        if (preview?.targetGeo) {
            const { committedRows, committedCols, sourcePreset, targetGeo } = preview;
            const { mapCoord } = this._buildPresetResizeMapper(
                sourcePreset,
                committedRows,
                committedCols,
                targetGeo,
                rows,
                cols
            );
            const projectedGlobal = this._buildPresetSpecialLayout(
                globalSpecial,
                rows,
                cols,
                mapCoord,
                targetGeo.isAisle
            );
            const projectedClass = this._remapClassSpecialMap(
                classSpecial,
                rows,
                cols,
                mapCoord,
                projectedGlobal
            );
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cellKey = `${r},${c}`;
                    if (projectedGlobal[cellKey]) {
                        globalSpecialCount++;
                        specialCount++;
                    } else if (projectedClass[cellKey]) {
                        specialCount++;
                    }
                }
            }
        } else if (preview) {
            const previewRowShift = preview.committedRows - rows;
            for (let r = 0; r < rows; r++) {
                const srcR = r + previewRowShift;
                for (let c = 0; c < cols; c++) {
                    if (c >= preview.committedCols) continue;
                    if (srcR < 0) {
                        if (classSpecial[`${srcR},${c}`]) {
                            specialCount++;
                        } else if (globalSpecial[`0,${c}`] === 'aisle') {
                            globalSpecialCount++;
                            specialCount++;
                        }
                    } else if (srcR < preview.committedRows) {
                        if (globalSpecial[`${srcR},${c}`]) {
                            globalSpecialCount++;
                            specialCount++;
                        } else if (classSpecial[`${srcR},${c}`]) {
                            specialCount++;
                        }
                    }
                }
            }
        } else {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (this._isSpecialSpot(r, c)) specialCount++;
                    if (globalSpecial[`${r},${c}`]) globalSpecialCount++;
                }
            }
        }
        const totalSeats = Math.max(0, (rows * cols) - specialCount);
        const globalTotalSeats = Math.max(0, (rows * cols) - globalSpecialCount);
        const activeStudentsList = (this._students || []).filter(s => !this._isStudentDeparted(s));
        const activeClassStudents = activeStudentsList.length;
        const maxClassStudents = this._getMaxClassStudentCount();

        if (isActivity) {
            const activeIds = new Set(activeStudentsList.map(s => s.id));
            let occupiedSeats = 0;
            let placedActiveStudents = 0;
            let maxPlacedGroupSize = 0;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (this._isSpecialSpot(r, c)) continue;
                    const cellIds = this._getCellStudentIds(r, c);
                    if (cellIds.length > 0) {
                        occupiedSeats++;
                        if (cellIds.length > maxPlacedGroupSize) {
                            maxPlacedGroupSize = cellIds.length;
                        }
                        for (const id of cellIds) {
                            if (activeIds.has(id)) placedActiveStudents++;
                        }
                    }
                }
            }
            const unplacedActiveStudents = Math.max(0, activeClassStudents - placedActiveStudents);
            const freeSeats = Math.max(0, totalSeats - occupiedSeats);
            let isShortForCurrent = false;
            if (activeClassStudents > 0) {
                if (totalSeats === 0) {
                    isShortForCurrent = true;
                } else if (occupiedSeats === 0) {
                    isShortForCurrent = (totalSeats * MAX_ACTIVITY_GROUP_SIZE) < activeClassStudents;
                } else if (unplacedActiveStudents > 0) {
                    const effectiveGroupSize = (maxPlacedGroupSize === 1 && occupiedSeats >= 2)
                        ? 1
                        : Math.max(2, Math.round(placedActiveStudents / occupiedSeats));
                    const neededFreeSeats = Math.ceil(unplacedActiveStudents / effectiveGroupSize);
                    isShortForCurrent = freeSeats < neededFreeSeats;
                }
            }
            return {
                rows,
                cols,
                totalSeats,
                globalTotalSeats,
                occupiedSeats,
                activeClassStudents,
                maxClassStudents,
                isShortForCurrent,
                isShortForMax: false
            };
        }

        return {
            rows,
            cols,
            totalSeats,
            globalTotalSeats,
            activeClassStudents,
            maxClassStudents,
            isShortForCurrent: activeClassStudents > 0 && totalSeats < activeClassStudents,
            isShortForMax: maxClassStudents > 0 && globalTotalSeats < maxClassStudents
        };
    },

    _getCapacityBadgeInnerHTML(capInfo = this._getRoomCapacityInfo()) {
        const { totalSeats, activeClassStudents, maxClassStudents, isShortForCurrent, isShortForMax } = capInfo;
        const isActivity = this._isActivityMode();
        const unitLabel = isActivity ? 'poste' : 'place';
        const seatsLabel = `${totalSeats} ${unitLabel}${totalSeats > 1 ? 's' : ''}`;

        if (isShortForCurrent) {
            return `<iconify-icon icon="solar:danger-triangle-bold"></iconify-icon><span><strong>${seatsLabel}</strong> · Insuffisant (${activeClassStudents} élèves)</span>`;
        }
        if (!isActivity && isShortForMax) {
            return `<iconify-icon icon="solar:info-circle-bold"></iconify-icon><span><strong>${seatsLabel}</strong> · Autre classe à ${maxClassStudents} élèves</span>`;
        }
        if (!isActivity && maxClassStudents > activeClassStudents && maxClassStudents > 0) {
            return `<iconify-icon icon="solar:check-circle-bold"></iconify-icon><span><strong>${seatsLabel}</strong> · Calibré (max ${maxClassStudents} élèves)</span>`;
        }
        if (activeClassStudents > 0) {
            return `<iconify-icon icon="solar:check-circle-bold"></iconify-icon><span><strong>${seatsLabel}</strong> pour ${activeClassStudents} élève${activeClassStudents > 1 ? 's' : ''}</span>`;
        }
        return `<iconify-icon icon="solar:chair-linear"></iconify-icon><span><strong>${seatsLabel}</strong> disponibles</span>`;
    },

    _getPresetAisleCols(presetId, cols) {
        if (presetId === 'compact') return [];
        if (presetId === 'center-aisle') {
            return cols >= 3 ? [Math.floor(cols / 2)] : null;
        }
        if (presetId === 'double-aisles') {
            if (cols < 5) return null;
            const side = Math.round((cols - 2) / 3);
            return [side, cols - 1 - side];
        }
        return null;
    },

    _isUShapeLayout(specialLayout, rows, cols) {
        if (!specialLayout || rows < 2 || cols < 3) return false;
        for (let c = 0; c < cols; c++) {
            if (specialLayout[`0,${c}`] === 'aisle') return false;
        }
        for (let r = 1; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const isAisle = specialLayout[`${r},${c}`] === 'aisle';
                const expected = c >= 1 && c < cols - 1;
                if (isAisle !== expected) return false;
            }
        }
        return true;
    },

    _detectPresetFromLayout(specialLayout, rows, cols) {
        if (!specialLayout || rows <= 0 || cols <= 0) return 'compact';

        if (this._isUShapeLayout(specialLayout, rows, cols)) {
            return 'u-shape';
        }

        const aisleCols = [];
        for (let c = 0; c < cols; c++) {
            let aisleCountInCol = 0;
            for (let r = 0; r < rows; r++) {
                if (specialLayout[`${r},${c}`] === 'aisle') aisleCountInCol++;
            }
            if (aisleCountInCol === rows) {
                aisleCols.push(c);
            } else if (aisleCountInCol > 0) {
                return 'custom';
            }
        }

        if (aisleCols.length === 0) {
            return 'compact';
        }
        const centerAisles = this._getPresetAisleCols('center-aisle', cols);
        if (centerAisles && aisleCols.length === 1 && aisleCols[0] === centerAisles[0]) {
            return 'center-aisle';
        }
        const doubleAisles = this._getPresetAisleCols('double-aisles', cols);
        if (doubleAisles && aisleCols.length === 2 && aisleCols[0] === doubleAisles[0] && aisleCols[1] === doubleAisles[1]) {
            return 'double-aisles';
        }
        return 'custom';
    },

    _getPresetGeometry(presetId, rows, cols) {
        if (presetId === 'u-shape') {
            if (rows >= 2 && cols >= 3) {
                return {
                    presetId: 'u-shape',
                    aisleCols: [],
                    isAisle: (r, c) => r >= 1 && c >= 1 && c < cols - 1
                };
            }
            return { presetId: 'compact', aisleCols: [], isAisle: () => false };
        }
        if (presetId === 'double-aisles') {
            const doubleCols = this._getPresetAisleCols('double-aisles', cols);
            if (doubleCols) {
                return { presetId: 'double-aisles', aisleCols: doubleCols, isAisle: (_r, c) => doubleCols.includes(c) };
            }
            const centerCols = this._getPresetAisleCols('center-aisle', cols);
            if (centerCols) {
                return { presetId: 'center-aisle', aisleCols: centerCols, isAisle: (_r, c) => centerCols.includes(c) };
            }
            return { presetId: 'compact', aisleCols: [], isAisle: () => false };
        }
        if (presetId === 'center-aisle') {
            const centerCols = this._getPresetAisleCols('center-aisle', cols);
            if (centerCols) {
                return { presetId: 'center-aisle', aisleCols: centerCols, isAisle: (_r, c) => centerCols.includes(c) };
            }
            return { presetId: 'compact', aisleCols: [], isAisle: () => false };
        }
        if (presetId === 'compact') {
            return { presetId: 'compact', aisleCols: [], isAisle: () => false };
        }
        return null;
    },

    _buildBlockColumnMap(oldCols, oldAisleCols, newCols, newAisleCols) {
        const splitDeskBlocks = (totalCols, aisles) => {
            const aisleSet = new Set(aisles);
            const blocks = [];
            let current = [];
            for (let c = 0; c < totalCols; c++) {
                if (aisleSet.has(c)) {
                    if (current.length > 0) {
                        blocks.push(current);
                        current = [];
                    }
                } else {
                    current.push(c);
                }
            }
            if (current.length > 0) blocks.push(current);
            return blocks;
        };

        const oldBlocks = splitDeskBlocks(oldCols, oldAisleCols);
        const newBlocks = splitDeskBlocks(newCols, newAisleCols);
        const colMap = new Map();

        if (oldBlocks.length === newBlocks.length) {
            for (let b = 0; b < oldBlocks.length; b++) {
                const len = Math.min(oldBlocks[b].length, newBlocks[b].length);
                for (let i = 0; i < len; i++) {
                    colMap.set(oldBlocks[b][i], newBlocks[b][i]);
                }
            }
        } else {
            const oldDeskCols = oldBlocks.flat();
            const newDeskCols = newBlocks.flat();
            const len = Math.min(oldDeskCols.length, newDeskCols.length);
            for (let i = 0; i < len; i++) {
                colMap.set(oldDeskCols[i], newDeskCols[i]);
            }
        }
        return colMap;
    },

    _buildPresetResizeMapper(sourcePreset, oldRows, oldCols, targetGeo, newRows, newCols) {
        if (sourcePreset === 'u-shape') {
            return {
                rowOffset: 0,
                relocateDisplaced: true,
                preserveOutOfBoundsRows: false,
                mapCoord: (r, c) => {
                    if (r < 0) return null;
                    if (r === 0) return (c >= 0 && c < newCols) ? { row: 0, col: c } : null;
                    if (c === 0) return { row: r, col: 0 };
                    if (c === oldCols - 1) return { row: r, col: newCols - 1 };
                    return null;
                }
            };
        }

        const rowOffset = newRows - oldRows;
        const oldAisleCols = this._getPresetAisleCols(sourcePreset, oldCols) || [];
        const colMap = newCols === oldCols
            ? null
            : this._buildBlockColumnMap(oldCols, oldAisleCols, newCols, targetGeo.aisleCols);

        return {
            rowOffset,
            relocateDisplaced: newCols !== oldCols,
            preserveOutOfBoundsRows: newCols === oldCols,
            mapCoord: (r, c) => {
                if (!colMap) {
                    return { row: r + rowOffset, col: c };
                }
                if (!colMap.has(c)) return null;
                return { row: r + rowOffset, col: colMap.get(c) };
            }
        };
    },

    _buildPresetSpecialLayout(oldSpecial, targetRows, targetCols, mapCoord, isAisle, { preserveOutOfBoundsRows = false, skipAisleKeys = null } = {}) {
        const next = {};
        for (const [key, type] of Object.entries(oldSpecial || {})) {
            if (type === 'aisle') continue;
            const [r, c] = key.split(',').map(Number);
            const mapped = mapCoord(r, c);
            if (!mapped || mapped.col < 0 || mapped.col >= targetCols) continue;
            const inRowBounds = mapped.row >= 0 && mapped.row < targetRows;
            if (!inRowBounds && !preserveOutOfBoundsRows) continue;
            if (inRowBounds && isAisle(mapped.row, mapped.col)) continue;
            next[`${mapped.row},${mapped.col}`] = type;
        }
        for (let r = 0; r < targetRows; r++) {
            for (let c = 0; c < targetCols; c++) {
                const cellKey = `${r},${c}`;
                if (isAisle(r, c) && !skipAisleKeys?.has(cellKey)) {
                    next[cellKey] = 'aisle';
                }
            }
        }
        return next;
    },

    _remapClassSpecialMap(specialMap, targetRows, targetCols, mapCoord, newGlobalSpecial, preserveOutOfBoundsRows = false) {
        const next = {};
        for (const [key, type] of Object.entries(specialMap || {})) {
            const [r, c] = key.split(',').map(Number);
            const mapped = mapCoord(r, c);
            if (!mapped || mapped.col < 0 || mapped.col >= targetCols) continue;
            const inRowBounds = mapped.row >= 0 && mapped.row < targetRows;
            if (!inRowBounds && !preserveOutOfBoundsRows) continue;
            const nextKey = `${mapped.row},${mapped.col}`;
            if (inRowBounds && newGlobalSpecial[nextKey]) continue;
            next[nextKey] = type;
        }
        return next;
    },

    _getPreviewPresetContext(globalSpecial, rows, cols) {
        const committedRows = this._gridState?.length || rows;
        const committedCols = this._gridState?.[0]?.length || cols;
        const isPreview = !this._isActivityMode()
            && this._gridState?.length > 0
            && (rows !== committedRows || cols !== committedCols);
        if (!isPreview) return null;

        const sourcePreset = this._detectPresetFromLayout(globalSpecial, committedRows, committedCols);
        const targetGeo = sourcePreset !== 'custom'
            ? this._getPresetGeometry(sourcePreset, rows, cols)
            : null;
        return { committedRows, committedCols, sourcePreset, targetGeo };
    },

    _remapOtherClassesForRoomChange({
        mapCoord,
        oldRows,
        oldCols,
        targetRows,
        targetCols,
        newGlobalSpecial,
        relocateDisplaced = false,
        preserveOutOfBoundsRows = false
    }) {
        const posKey = this._getActivePositionKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        const updatedKey = this._getActiveClassUpdatedKey();
        const currentClassId = this._getCurrentClass()?.id;
        const currentStudentIds = new Set((this._students || []).map(s => s.id));
        const mutatedClassIds = new Set();

        const classSpecialById = new Map();
        (appState.classes || []).forEach(cls => {
            if (!cls || cls.id === currentClassId) return;
            if (!cls[classSpecialKey]) {
                classSpecialById.set(cls.id, {});
                return;
            }
            const oldEntries = Object.entries(cls[classSpecialKey]);
            const nextClassSpecial = this._remapClassSpecialMap(
                cls[classSpecialKey],
                targetRows,
                targetCols,
                mapCoord,
                newGlobalSpecial,
                preserveOutOfBoundsRows
            );
            const nextKeys = Object.keys(nextClassSpecial);
            const changed = nextKeys.length !== oldEntries.length
                || oldEntries.some(([k, v]) => nextClassSpecial[k] !== v);
            if (changed) {
                cls[classSpecialKey] = nextClassSpecial;
                mutatedClassIds.add(cls.id);
            }
            classSpecialById.set(cls.id, cls[classSpecialKey]);
        });

        const studentsByClass = new Map();
        (appState.generatedResults || []).forEach(r => {
            if (!r || currentStudentIds.has(r.id)) return;
            const pos = r[posKey];
            if (!pos || typeof pos.row !== 'number' || typeof pos.col !== 'number') return;
            if (!studentsByClass.has(r.classId)) studentsByClass.set(r.classId, []);
            studentsByClass.get(r.classId).push(r);
        });

        for (const [classId, classStudents] of studentsByClass.entries()) {
            const clsSpecial = classSpecialById.get(classId) || {};
            const occupied = new Set();
            const displaced = [];

            for (const student of classStudents) {
                const pos = student[posKey];
                const wasVisible = pos.row >= 0 && pos.row < oldRows && pos.col >= 0 && pos.col < oldCols;
                const mapped = mapCoord(pos.row, pos.col);

                if (mapped && mapped.row >= 0 && mapped.row < targetRows && mapped.col >= 0 && mapped.col < targetCols) {
                    const cellKey = `${mapped.row},${mapped.col}`;
                    if (!newGlobalSpecial[cellKey] && !clsSpecial[cellKey] && !occupied.has(cellKey)) {
                        if (mapped.row !== pos.row || mapped.col !== pos.col) {
                            student[posKey] = { ...pos, row: mapped.row, col: mapped.col };
                            mutatedClassIds.add(classId);
                        }
                        occupied.add(cellKey);
                    } else if (wasVisible && relocateDisplaced) {
                        displaced.push(student);
                    } else if (mapped.row !== pos.row || mapped.col !== pos.col) {
                        student[posKey] = { ...pos, row: mapped.row, col: mapped.col };
                        mutatedClassIds.add(classId);
                    }
                } else if (wasVisible && relocateDisplaced && (!preserveOutOfBoundsRows || mapped === null)) {
                    displaced.push(student);
                } else if (mapped && (mapped.row !== pos.row || mapped.col !== pos.col)) {
                    student[posKey] = { ...pos, row: mapped.row, col: mapped.col };
                    mutatedClassIds.add(classId);
                }
            }

            if (displaced.length > 0) {
                for (let r = 0; r < targetRows && displaced.length > 0; r++) {
                    for (let c = 0; c < targetCols && displaced.length > 0; c++) {
                        const cellKey = `${r},${c}`;
                        if (!newGlobalSpecial[cellKey] && !clsSpecial[cellKey] && !occupied.has(cellKey)) {
                            const student = displaced.shift();
                            const pos = student[posKey];
                            if (pos.row !== r || pos.col !== c) {
                                student[posKey] = { ...pos, row: r, col: c };
                                mutatedClassIds.add(classId);
                            }
                            occupied.add(cellKey);
                        }
                    }
                }
                while (displaced.length > 0) {
                    const student = displaced.shift();
                    if (student[posKey] !== null) {
                        student[posKey] = null;
                        mutatedClassIds.add(classId);
                    }
                }
            }
        }

        if (mutatedClassIds.size > 0) {
            const now = Date.now();
            (appState.classes || []).forEach(cls => {
                if (cls && mutatedClassIds.has(cls.id)) {
                    cls[updatedKey] = now;
                }
            });
        }
    },

    _detectCurrentRoomPreset() {
        const gridKey = this._getActiveGridKey();
        const rows = this._getRows();
        const cols = this._getCols();
        const specialLayout = appState[gridKey]?.specialLayout || {};
        const preview = this._getPreviewPresetContext(specialLayout, rows, cols);
        if (preview) {
            return preview.targetGeo ? preview.targetGeo.presetId : 'custom';
        }
        return this._detectPresetFromLayout(specialLayout, rows, cols);
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
        const maxStudents = this._getMaxClassStudentCount();
        const uCols = maxStudents <= 15 ? 7 : (maxStudents <= 20 ? 8 : (maxStudents <= 25 ? 9 : 10));
        const presetColsMap = { 'compact': 6, 'center-aisle': 7, 'double-aisles': 8, 'u-shape': uCols };
        const targetCols = presetColsMap[presetId];
        if (!targetCols) return;

        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        const lockKey = this._getActiveClassLockKey();
        const updatedKey = this._getActiveClassUpdatedKey();

        const oldRows = this._gridState?.length || this._getRows();
        const oldCols = this._gridState?.[0]?.length || this._getCols();
        const oldSpecial = appState[gridKey]?.specialLayout || {};
        const oldPreset = this._detectPresetFromLayout(oldSpecial, oldRows, oldCols);

        let minPresetRows = Math.min(10, Math.max(DEFAULT_ROWS, Math.ceil(maxStudents / 6)));
        if (presetId === 'u-shape') {
            const remaining = Math.max(0, maxStudents - uCols);
            minPresetRows = Math.min(10, Math.max(DEFAULT_ROWS, 1 + Math.ceil(remaining / 2)));
        }
        const isLeavingUShape = oldPreset === 'u-shape' && presetId !== 'u-shape';
        const targetRows = presetId === 'u-shape'
            ? Math.min(10, Math.max(3, minPresetRows))
            : (isLeavingUShape || !appState[gridKey] ? minPresetRows : oldRows);

        if (oldPreset === presetId && oldRows === targetRows && oldCols === targetCols) {
            return;
        }

        this._snapshotGrid();

        const targetGeo = this._getPresetGeometry(presetId, targetRows, targetCols);
        const aisleCols = targetGeo.aisleCols;
        const isTargetAisle = targetGeo.isAisle;

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

        const mapPresetCoord = (r, c) => {
            if (r < 0 || r >= targetRows) return null;
            const mappedC = colMap.has(c)
                ? colMap.get(c)
                : (!isTargetAisle(r, c) && c >= 0 && c < targetCols ? c : -1);
            if (mappedC < 0 || mappedC >= targetCols || isTargetAisle(r, mappedC)) return null;
            return { row: r, col: mappedC };
        };

        const newSpecialLayout = this._buildPresetSpecialLayout(
            oldSpecial,
            targetRows,
            targetCols,
            mapPresetCoord,
            isTargetAisle
        );

        const currentClass = this._getCurrentClass();
        if (currentClass?.[classSpecialKey]) {
            currentClass[classSpecialKey] = this._remapClassSpecialMap(
                currentClass[classSpecialKey],
                targetRows,
                targetCols,
                mapPresetCoord,
                newSpecialLayout
            );
        }

        this._remapOtherClassesForRoomChange({
            mapCoord: mapPresetCoord,
            oldRows,
            oldCols,
            targetRows,
            targetCols,
            newGlobalSpecial: newSpecialLayout,
            relocateDisplaced: true,
            preserveOutOfBoundsRows: false
        });

        const newGrid = Array.from({ length: targetRows }, () => Array(targetCols).fill(null));
        const displacedCells = [];
        for (let r = 0; r < oldRows; r++) {
            for (let c = 0; c < oldCols; c++) {
                const cellIds = this._getCellStudentIds(r, c);
                if (cellIds.length === 0) continue;
                const mapped = mapPresetCoord(r, c);
                const cellPayload = cellIds.length === 1 ? cellIds[0] : [...cellIds];
                if (mapped && !newSpecialLayout[`${mapped.row},${mapped.col}`] && !currentClass?.[classSpecialKey]?.[`${mapped.row},${mapped.col}`] && !newGrid[mapped.row][mapped.col]) {
                    newGrid[mapped.row][mapped.col] = cellPayload;
                } else {
                    displacedCells.push(cellPayload);
                }
            }
        }
        if (displacedCells.length > 0) {
            for (let r = 0; r < targetRows && displacedCells.length > 0; r++) {
                for (let c = 0; c < targetCols && displacedCells.length > 0; c++) {
                    if (!newGrid[r][c] && !newSpecialLayout[`${r},${c}`] && !currentClass?.[classSpecialKey]?.[`${r},${c}`]) {
                        newGrid[r][c] = displacedCells.shift();
                    }
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

        const savedPositions = this._savePositionsToState(true);
        const savedGrid = this._saveGridConfig();
        if (!savedPositions && !savedGrid && !this._isVirtualClass()) {
            StorageManager.saveAppState();
        }
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

    _loadGridConfig(options = {}) {
        const gridKey = this._getActiveGridKey();
        const config = appState[gridKey];
        const defaultRows = this._getDefaultRows();
        const rows = this._isRoomConfigured() ? (config?.rows || defaultRows) : Math.max(config?.rows || 0, defaultRows);
        const cols = config?.cols || this._getDefaultCols();

        const rowSlider = document.getElementById('scRowsSlider');
        const colSlider = document.getElementById('scColsSlider');
        if (rowSlider) { rowSlider.value = rows; document.getElementById('scRowsValue').textContent = rows; }
        if (colSlider) { colSlider.value = cols; document.getElementById('scColsValue').textContent = cols; }

        this._orientation = SafeStorage.get(STORAGE_KEYS.SEATING_ORIENTATION) || appState.seatingGrid?.orientation || config?.orientation || 'teacher';
        this._applyOrientation(this._orientation, false, options);
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

        if (isSame || isDefaultUnmodified) return false;

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
            currentClass[this._getActiveClassUpdatedKey()] = Date.now();
            currentClass[lockKey] = false;
        }
        if (this._hasChangesSinceUnlock || (locked && classLocked)) {
            StorageManager.saveAppState();
            return true;
        }
        return false;
    },

    _onGridConfigChange() {
        const newRows = this._getRows();
        const newCols = this._getCols();
        const oldRows = this._gridState ? this._gridState.length : newRows;
        const oldCols = this._gridState?.[0] ? this._gridState[0].length : newCols;
        if (this._gridState?.length > 0 && newRows === oldRows && newCols === oldCols) return;

        const posKey = this._getActivePositionKey();
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        const lockKey = this._getActiveClassLockKey();
        const updatedKey = this._getActiveClassUpdatedKey();
        const isActivity = this._isActivityMode();
        const oldSpecial = appState[gridKey]?.specialLayout || {};
        const oldPreset = isActivity ? 'custom' : this._detectPresetFromLayout(oldSpecial, oldRows, oldCols);
        const targetPresetGeo = (!isActivity && oldPreset !== 'custom')
            ? this._getPresetGeometry(oldPreset, newRows, newCols)
            : null;

        // Récupère toutes les positions connues des étudiants (y compris ceux temporairement hors de la grille visible)
        const placed = {};
        const visibleBeforeIds = new Set();
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
                        visibleBeforeIds.add(id);
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

        const currentClass = this._getCurrentClass();
        let rowOffset = isActivity ? 0 : (newRows - oldRows);
        let relocateDisplaced = false;
        let mapCoord = (r, c) => ({ row: r + rowOffset, col: c });

        // Repositionne d'abord la cartographie des places spéciales (allées, AESH...)
        if (targetPresetGeo) {
            const resizePlan = this._buildPresetResizeMapper(
                oldPreset,
                oldRows,
                oldCols,
                targetPresetGeo,
                newRows,
                newCols
            );
            rowOffset = resizePlan.rowOffset;
            relocateDisplaced = resizePlan.relocateDisplaced;
            mapCoord = resizePlan.mapCoord;

            const restoredClassSpecialKeys = new Set();
            if (newCols === oldCols && rowOffset > 0) {
                (appState.classes || []).forEach(cls => {
                    if (!cls?.[classSpecialKey]) return;
                    for (const key of Object.keys(cls[classSpecialKey])) {
                        const [r, c] = key.split(',').map(Number);
                        if (r < 0) {
                            const newR = r + rowOffset;
                            if (newR >= 0 && newR < rowOffset && c >= 0 && c < newCols) {
                                restoredClassSpecialKeys.add(`${newR},${c}`);
                            }
                        }
                    }
                });
            }

            const newSpecialLayout = this._buildPresetSpecialLayout(
                oldSpecial,
                newRows,
                newCols,
                mapCoord,
                targetPresetGeo.isAisle,
                {
                    preserveOutOfBoundsRows: resizePlan.preserveOutOfBoundsRows,
                    skipAisleKeys: restoredClassSpecialKeys
                }
            );

            if (currentClass?.[classSpecialKey]) {
                currentClass[classSpecialKey] = this._remapClassSpecialMap(
                    currentClass[classSpecialKey],
                    newRows,
                    newCols,
                    mapCoord,
                    newSpecialLayout,
                    resizePlan.preserveOutOfBoundsRows
                );
            }

            if (!appState[gridKey]) {
                appState[gridKey] = {
                    rows: oldRows,
                    cols: oldCols,
                    locked: this._isLocked,
                    roomConfigured: true,
                    specialLayout: newSpecialLayout
                };
            } else {
                appState[gridKey].specialLayout = newSpecialLayout;
            }

            this._remapOtherClassesForRoomChange({
                mapCoord,
                oldRows,
                oldCols,
                targetRows: newRows,
                targetCols: newCols,
                newGlobalSpecial: newSpecialLayout,
                relocateDisplaced,
                preserveOutOfBoundsRows: resizePlan.preserveOutOfBoundsRows
            });
        } else if (rowOffset !== 0) {
            const occupiedClassSpecialKeys = new Set();
            const classes = appState.classes || [];
            classes.forEach(cls => {
                if (cls?.[classSpecialKey]) {
                    const newClassSpecial = {};
                    for (const [key, type] of Object.entries(cls[classSpecialKey])) {
                        const [r, c] = key.split(',').map(Number);
                        const newR = r + rowOffset;
                        const nextKey = `${newR},${c}`;
                        newClassSpecial[nextKey] = type;
                        occupiedClassSpecialKeys.add(nextKey);
                    }
                    cls[classSpecialKey] = newClassSpecial;
                }
            });

            if (appState[gridKey]?.specialLayout) {
                const newSpecialLayout = {};
                for (const [key, type] of Object.entries(oldSpecial)) {
                    const [r, c] = key.split(',').map(Number);
                    const newR = r + rowOffset;
                    if (type === 'aisle' && (newR < 0 || newR >= newRows || c < 0 || c >= newCols)) continue;
                    newSpecialLayout[`${newR},${c}`] = type;
                }
                if (rowOffset > 0) {
                    for (let c = 0; c < newCols; c++) {
                        if (oldSpecial[`0,${c}`] === 'aisle') {
                            for (let r = 0; r < rowOffset; r++) {
                                const cellKey = `${r},${c}`;
                                if (!newSpecialLayout[cellKey] && !occupiedClassSpecialKeys.has(cellKey)) {
                                    newSpecialLayout[cellKey] = 'aisle';
                                }
                            }
                        }
                    }
                }
                appState[gridKey].specialLayout = newSpecialLayout;
            }

            this._shiftOtherClassesStudentRows(rowOffset);
        } else if (appState[gridKey]?.specialLayout) {
            const nextSpecial = {};
            for (const [key, type] of Object.entries(oldSpecial)) {
                const [r, c] = key.split(',').map(Number);
                if (type === 'aisle' && (r < 0 || r >= newRows || c < 0 || c >= newCols)) continue;
                nextSpecial[key] = type;
            }
            if (newRows > oldRows && oldRows > 0) {
                const occupiedClassSpecialKeys = new Set();
                (appState.classes || []).forEach(cls => {
                    if (cls?.[classSpecialKey]) {
                        Object.keys(cls[classSpecialKey]).forEach(k => occupiedClassSpecialKeys.add(k));
                    }
                });
                for (let c = 0; c < newCols; c++) {
                    if (nextSpecial[`${oldRows - 1},${c}`] === 'aisle') {
                        for (let r = oldRows; r < newRows; r++) {
                            const cellKey = `${r},${c}`;
                            if (!nextSpecial[cellKey] && !occupiedClassSpecialKeys.has(cellKey)) {
                                nextSpecial[cellKey] = 'aisle';
                            }
                        }
                    }
                }
            }
            appState[gridKey].specialLayout = nextSpecial;
        }

        // Repositionne les étudiants (en préservant les binômes/groupes et leur ordre)
        const cellBuckets = new Map();
        const displacedStudents = [];
        for (const [resultId, pos] of Object.entries(placed)) {
            const wasVisible = visibleBeforeIds.has(resultId);
            const mapped = mapCoord(pos.row, pos.col);
            if (mapped) {
                pos.row = mapped.row;
                pos.col = mapped.col;
                if (mapped.row >= 0 && mapped.row < newRows && mapped.col >= 0 && mapped.col < newCols && !this._isSpecialSpot(mapped.row, mapped.col)) {
                    const key = `${mapped.row},${mapped.col}`;
                    if (!cellBuckets.has(key)) cellBuckets.set(key, []);
                    cellBuckets.get(key).push({ id: resultId, order: pos.order ?? 0 });
                } else if (wasVisible && relocateDisplaced) {
                    displacedStudents.push(resultId);
                }
            } else if (wasVisible && relocateDisplaced) {
                displacedStudents.push(resultId);
            }
        }

        const isVirtual = this._isVirtualClass(currentClass);
        const maxPerCell = (isVirtual || isActivity) ? MAX_ACTIVITY_GROUP_SIZE : 1;

        for (const [key, items] of cellBuckets.entries()) {
            const [r, c] = key.split(',').map(Number);
            items.sort((a, b) => a.order - b.order);
            this._setCellStudentIds(r, c, items.slice(0, maxPerCell).map(item => item.id));
        }

        if (displacedStudents.length > 0) {
            for (let r = 0; r < newRows && displacedStudents.length > 0; r++) {
                for (let c = 0; c < newCols && displacedStudents.length > 0; c++) {
                    if (this._getCellStudentIds(r, c).length === 0 && !this._isSpecialSpot(r, c)) {
                        this._setCellStudentIds(r, c, [displacedStudents.shift()]);
                    }
                }
            }
        }

        // Met à jour la coordonnée des élèves temporairement hors-grille pour éviter toute collision au ré-agrandissement
        if (newRows !== oldRows || newCols !== oldCols || rowOffset !== 0) {
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
                    if (result) result[posKey] = shiftedPos;
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

    _commitSpecialLayoutChange(currentClass = this._getCurrentClass(), { savePositions = false } = {}) {
        const lockKey = this._getActiveClassLockKey();
        this._hasChangesSinceUnlock = true;
        if (currentClass) {
            currentClass[this._getActiveClassUpdatedKey()] = Date.now();
            currentClass[lockKey] = false;
        }
        if (savePositions) {
            this._dismissOnboardingHint();
            this._savePositionsToState();
        }
        this._saveGridConfig();
        StorageManager.saveAppState();
        this._render();
    },

    _setCellSpecialType(row, col, type) {
        this._snapshotGrid();
        const key = `${row},${col}`;
        const currentClass = this._getCurrentClass();
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();

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

        this._commitSpecialLayoutChange(currentClass);
    },

    _toggleBlockedScope(row, col) {
        this._snapshotGrid();
        const key = `${row},${col}`;
        const currentClass = this._getCurrentClass();
        const className = currentClass?.name || 'la classe';
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();

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

        this._commitSpecialLayoutChange(currentClass);
    },

    _moveSpecialAesh(srcRow, srcCol, targetRow, targetCol) {
        if (this._isLocked) return;
        if (srcRow === targetRow && srcCol === targetCol) return;
        const rows = this._gridState?.length || this._getRows();
        const cols = this._gridState?.[0]?.length || this._getCols();
        if (
            !Number.isInteger(srcRow) || !Number.isInteger(srcCol) ||
            !Number.isInteger(targetRow) || !Number.isInteger(targetCol) ||
            srcRow < 0 || srcRow >= rows || srcCol < 0 || srcCol >= cols ||
            targetRow < 0 || targetRow >= rows || targetCol < 0 || targetCol >= cols
        ) {
            return;
        }
        if (this._isSpecialSpot(targetRow, targetCol)) return;
        if (this._isCellPinned(targetRow, targetCol)) return;

        const srcKey = `${srcRow},${srcCol}`;
        const targetKey = `${targetRow},${targetCol}`;
        const currentClass = this._getCurrentClass();
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();

        const isClassScope = currentClass?.[classSpecialKey]?.[srcKey] === 'aesh';
        const isGlobalScope = !isClassScope && appState[gridKey]?.specialLayout?.[srcKey] === 'aesh';
        if (!isClassScope && !isGlobalScope) return;

        const targetVal = this._gridState[targetRow]?.[targetCol] || null;

        this._snapshotGrid();

        if (isClassScope && currentClass?.[classSpecialKey]) {
            delete currentClass[classSpecialKey][srcKey];
        }
        if (isGlobalScope && appState[gridKey]?.specialLayout) {
            // Preserve legacy global AESH on all other classes before migrating it to per-class scope
            if (currentClass) {
                (appState.classes || []).forEach(cls => {
                    if (!cls || cls.id === currentClass.id || this._isVirtualClass(cls)) return;
                    if (!cls[classSpecialKey]) cls[classSpecialKey] = {};
                    if (!cls[classSpecialKey][srcKey]) {
                        cls[classSpecialKey][srcKey] = 'aesh';
                    }
                });
            }
            delete appState[gridKey].specialLayout[srcKey];
        }

        if (currentClass) {
            if (!currentClass[classSpecialKey]) currentClass[classSpecialKey] = {};
            currentClass[classSpecialKey][targetKey] = 'aesh';
        } else {
            if (!appState[gridKey]) appState[gridKey] = {};
            if (!appState[gridKey].specialLayout) appState[gridKey].specialLayout = {};
            appState[gridKey].specialLayout[targetKey] = 'aesh';
        }

        if (targetVal) {
            this._gridState[srcRow][srcCol] = Array.isArray(targetVal) ? [...targetVal] : targetVal;
            this._gridState[targetRow][targetCol] = null;
        }

        this._commitSpecialLayoutChange(currentClass, { savePositions: true });

        if (targetVal) {
            this._animateCellSwap(srcRow, srcCol, targetRow, targetCol, { fromDrag: true });
        } else {
            this._animateCellPlaced(targetRow, targetCol);
        }
    },

    // ========================================================================
    // CUSTOM AISLE PAINT MODE (Tracer des allées en 1 geste)
    // ========================================================================

    _enterAislePaintMode() {
        if (this._isLocked || this._isVirtualClass() || this._isActivityMode()) return;
        this._closeConfigPopover();
        this._closePlacementPopover();
        this._clearSelection();
        this._dismissOnboardingHint();

        this._isAislePaintMode = true;
        this._aislePaintPointerId = null;
        this._aislePaintAction = null;
        this._aislePaintTouchedKeys = null;
        this._aislePaintHasMutated = false;

        const view = document.getElementById('seatingChartView');
        if (view) view.dataset.aislePaint = 'true';

        const banner = document.getElementById('scAislePaintBanner');
        if (banner) {
            banner.hidden = false;
            banner.classList.add('visible');
        }

        if (!HistoryManager.isOpen('scAislePaint')) {
            HistoryManager.pushState('scAislePaint', () => this._exitAislePaintMode({ causedByHistory: true }));
        }
    },

    _exitAislePaintMode({ causedByHistory = false } = {}) {
        this._finishAislePaintStroke();
        const wasActive = Boolean(this._isAislePaintMode);

        this._isAislePaintMode = false;

        const view = document.getElementById('seatingChartView');
        if (view) delete view.dataset.aislePaint;

        const banner = document.getElementById('scAislePaintBanner');
        if (banner) {
            banner.classList.remove('visible');
            banner.hidden = true;
        }

        if (wasActive && !causedByHistory && HistoryManager.isOpen('scAislePaint')) {
            HistoryManager.handleManualClose('scAislePaint');
        }
    },

    _startAislePaintStroke(cell, pointerId = null) {
        if (!this._isAislePaintMode || this._isLocked || !cell) return;
        const r = parseInt(cell.dataset.row, 10);
        const c = parseInt(cell.dataset.col, 10);
        if (Number.isNaN(r) || Number.isNaN(c)) return;

        const special = this._getCellSpecial(r, c);
        this._aislePaintPointerId = pointerId;
        this._aislePaintAction = special?.type === 'aisle' ? null : 'aisle';
        this._aislePaintTouchedKeys = new Set();
        this._aislePaintHasMutated = false;
        this._applyAislePaintCell(cell, r, c);
    },

    _continueAislePaintStroke(cell) {
        if (!this._isAislePaintMode || this._isLocked || !this._aislePaintTouchedKeys || !cell) return;
        const r = parseInt(cell.dataset.row, 10);
        const c = parseInt(cell.dataset.col, 10);
        if (Number.isNaN(r) || Number.isNaN(c)) return;
        this._applyAislePaintCell(cell, r, c);
    },

    _applyAislePaintCell(cell, r, c) {
        const key = `${r},${c}`;
        if (this._aislePaintTouchedKeys?.has(key)) return;
        this._aislePaintTouchedKeys?.add(key);

        if (this._getCellStudentIds(r, c).length > 0) return;
        const special = this._getCellSpecial(r, c);
        if (special && special.type !== 'aisle') return;

        const targetIsAisle = this._aislePaintAction === 'aisle';
        const currentlyIsAisle = special?.type === 'aisle';
        if (targetIsAisle === currentlyIsAisle) return;

        if (!this._aislePaintHasMutated) {
            this._snapshotGrid();
            this._aislePaintHasMutated = true;
        }

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
        if (!appState[gridKey].specialLayout) appState[gridKey].specialLayout = {};
        appState[gridKey].roomConfigured = true;

        if (targetIsAisle) {
            appState[gridKey].specialLayout[key] = 'aisle';
            cell.classList.add('sc-cell-special-aisle', 'sc-cell-scope-global');
        } else {
            delete appState[gridKey].specialLayout[key];
            cell.classList.remove('sc-cell-special-aisle', 'sc-cell-scope-global');
        }
    },

    _finishAislePaintStroke() {
        const hadMutation = Boolean(this._aislePaintHasMutated);
        this._aislePaintPointerId = null;
        this._aislePaintAction = null;
        this._aislePaintTouchedKeys = null;
        this._aislePaintHasMutated = false;

        if (hadMutation) {
            this._commitSpecialLayoutChange(this._getCurrentClass());
            this._haptic(8);
        }
    }
};
