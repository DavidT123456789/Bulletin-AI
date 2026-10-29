/**
 * @fileoverview Seating Chart — State, Plan Mode, Lock/Pin, Undo/Redo & Persistence
 * @module managers/seating/SeatingState
 */

import { appState } from '../../state/State.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { StorageManager } from '../StorageManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { UI } from '../UIManager.js';
import { Utils } from '../../utils/Utils.js';
import { ClassManager } from '../ClassManager.js';
import { ClassUIManager } from '../ClassUIManager.js';
import { HistoryManager } from '../HistoryManager.js';

export const DEFAULT_COLS = 6;
export const DEFAULT_ROWS = 5;
export const MIN_COLS = 2;
export const MAX_COLS = 10;
export const MIN_ROWS = 2;
export const MAX_ROWS = 10;
export const DEFAULT_ACTIVITY_COLS = 5;
export const DEFAULT_ACTIVITY_ROWS = 3;
export const MAX_ACTIVITY_GROUP_SIZE = 4;
export const MAX_UNDO_LEVELS = 5;

export const SeatingState = {
    // ========================================================================
    // PLAN MODE SWITCHING (Cours ↔ Activité)
    // ========================================================================

    _isActivityMode() {
        return this._planMode === 'activity';
    },

    _getActiveGridKey(mode = this._planMode) {
        return mode === 'activity' ? 'seatingActivityGrid' : 'seatingGrid';
    },

    _getActivePositionKey(mode = this._planMode) {
        return mode === 'activity' ? 'seatingActivityPosition' : 'seatingPosition';
    },

    _getActiveClassLockKey(mode = this._planMode) {
        return mode === 'activity' ? 'seatingActivityLocked' : 'seatingLocked';
    },

    _getActiveClassValidatedKey(mode = this._planMode) {
        return mode === 'activity' ? 'seatingActivityValidatedAt' : 'seatingValidatedAt';
    },

    _getActiveClassUpdatedKey(mode = this._planMode) {
        return mode === 'activity' ? 'seatingActivityUpdatedAt' : 'seatingUpdatedAt';
    },

    _getActiveClassSpecialKey(mode = this._planMode) {
        return mode === 'activity' ? 'seatingActivitySpecialLayout' : 'seatingSpecialLayout';
    },

    _getStudentPos(student, mode = this._planMode) {
        return mode === 'activity' ? student?.seatingActivityPosition : student?.seatingPosition;
    },

    _hasClassCoursePlan(cls = this._getCurrentClass()) {
        if (!cls) return false;
        return this._getValidPlacedIdsForClass(cls, 'course').size > 0;
    },

    _hasClassActivityPlan(cls = this._getCurrentClass()) {
        if (!cls) return false;
        return this._getValidPlacedIdsForClass(cls, 'activity').size > 0;
    },

    _restoreUnmodifiedClassLock() {
        if (!this._hasChangesSinceUnlock && this._wasLockedBeforeEdit && !this._isLocked) {
            const currentClass = this._getCurrentClass();
            const lockKey = this._getActiveClassLockKey();
            const gridKey = this._getActiveGridKey();
            if (currentClass) currentClass[lockKey] = true;
            this._isLocked = true;
            if (appState[gridKey]) appState[gridKey].locked = true;
        }
    },

    _updatePlanModeSwitchUI() {
        const view = document.getElementById('seatingChartView');
        const board = document.getElementById('scClassroomBoard');
        const switchEl = document.getElementById('scPlanModeSwitch');
        const hasActivity = this._hasClassActivityPlan();

        if (view) {
            view.dataset.planMode = this._planMode;
            view.dataset.hasActivity = hasActivity ? 'true' : 'false';
            view.dataset.orientation = this._isActivityMode() ? 'teacher' : this._orientation;
        }
        if (board) {
            board.dataset.planMode = this._planMode;
            board.dataset.locked = this._isLocked ? 'true' : 'false';
        }

        if (!switchEl) return;

        switchEl.dataset.activeMode = this._planMode;
        switchEl.querySelectorAll('.sc-mode-tab').forEach(tab => {
            const isActive = tab.dataset.planMode === this._planMode;
            const fullLabel = tab.dataset.fullLabel || (tab.dataset.planMode === 'activity' ? 'Activité' : 'Cours');
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');

            const labelEl = tab.querySelector('.sc-mode-label');
            if (labelEl) {
                labelEl.classList.toggle('is-expanded', isActive);
                labelEl.classList.toggle('is-collapsed', !isActive);
            }

            if (isActive) {
                tab.removeAttribute('data-tooltip');
                if (tab._tippy) {
                    tab._tippy.destroy();
                }
            } else {
                const nextTooltip = `Passer en mode ${fullLabel}`;
                tab.setAttribute('data-tooltip', nextTooltip);
                TooltipsUI?.updateTooltip?.(tab, nextTooltip);
            }
        });

        // Progressive disclosure: hide completely in Consultation mode when class has no Activity plan
        const shouldHide = this._isLocked && !hasActivity && this._planMode === 'course';
        switchEl.classList.toggle('sc-mode-switch-hidden', shouldHide);
    },

    _canSwitchPlanMode(targetMode) {
        if (!this._isActive) return false;
        if (targetMode !== 'course' && targetMode !== 'activity') return false;
        if (targetMode === this._planMode) return false;
        if (this._isLocked && targetMode === 'activity' && !this._hasClassActivityPlan()) {
            return false;
        }
        return true;
    },

    _canSwitchAdjacentClass(delta) {
        return Boolean(ClassUIManager?.getAdjacentClassId?.(delta));
    },

    _focusListScrollContainer() {
        if (FocusPanelManager.isOpen?.() || UI.isAnyModalOpen()) return;
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) return;
        if (!mainContent.hasAttribute('tabindex')) {
            mainContent.setAttribute('tabindex', '-1');
        }
        mainContent.focus?.({ preventScroll: true });
    },

    _switchAdjacentClass(delta) {
        if (!this._canSwitchAdjacentClass(delta)) return Promise.resolve(false);
        if (this._isActive) {
            this._restoreUnmodifiedClassLock();
            this._savePositionsToState(true);
            this._saveGridConfig();
        }
        return ClassUIManager.switchAdjacentClass(delta);
    },

    switchPlanMode(mode, options = {}) {
        if (mode !== 'course' && mode !== 'activity') return;
        const { force = false, animate = true } = options;
        if (mode === this._planMode && !force) return;

        const prevMode = this._planMode;
        const isForward = mode === 'activity';
        const shouldAnimateCarousel = Boolean(
            animate &&
            this._isActive &&
            prevMode !== mode &&
            !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        );

        const ghost = shouldAnimateCarousel ? this._captureModeCarouselGhost(prevMode) : null;
        if (!shouldAnimateCarousel) {
            this._cleanupModeCarousel();
        }
        this._cleanupFoldContinuum();

        // 1. Persist current mode state before switching
        if (this._isActive) {
            this._restoreUnmodifiedClassLock();
            this._savePositionsToState(true);
            this._saveGridConfig();
        }

        this._clearSelection();
        this._closeMobileSheet(true);
        this._closeConfigPopover();
        this._closePlacementPopover();

        // Remove any existing onboarding hint so the new mode can render its own contextual hint
        document.querySelector('.sc-onboarding-hint')?.remove();
        this._onboardingStep = null;

        this._planMode = mode;
        this._prevPlacedCount = 0;
        this._undoStack = [];
        this._redoStack = [];

        this._students = this._getCurrentClassStudents();
        this._loadGridConfig();
        this._loadPositionsFromState();

        const currentClass = this._getCurrentClass();
        const isVirtual = this._isVirtualClass(currentClass);
        const locked = isVirtual ? true : (this._getPlacedIds().size > 0);

        this._applyLockState(locked, { skipSmartFit: true });
        this._syncPlacementPopover();
        this._render();
        this._applySmartFit(true);
        this._scrollToDesk();

        if (animate) {
            this._playModeCarousel(ghost, isForward);
            this._staggerSidebarEntrance(40);
        }

        this._maybeShowOnboardingHint();
    },
    // ========================================================================
    // LOCK
    // ========================================================================

    _syncLockControlsUI(locked) {
        if (this._tooltipSuppressTimer) {
            clearTimeout(this._tooltipSuppressTimer);
            this._tooltipSuppressTimer = null;
        }
        if (TooltipsUI) TooltipsUI.isIgnoringTooltips = false;
        const isVirtual = this._isVirtualClass();
        const view = document.getElementById('seatingChartView');
        if (view) {
            view.dataset.locked = locked;
            view.dataset.virtual = isVirtual ? 'true' : 'false';
        }
        const board = document.getElementById('scClassroomBoard');
        if (board) board.dataset.locked = locked ? 'true' : 'false';

        const sidebar = document.getElementById('scSidebar');
        if (sidebar) sidebar.inert = Boolean(locked);

        const btn = document.getElementById('scLockBtn');
        if (btn) {
            const btnLabel = isVirtual
                ? 'Classe reconstituée en lecture seule'
                : (locked ? 'Déverrouiller pour ajuster' : 'Valider et figer le plan');
            btn.classList.toggle('locked', locked);
            btn.setAttribute('aria-checked', (!locked).toString());
            btn.setAttribute('aria-label', btnLabel);
            btn.setAttribute('data-tooltip', btnLabel);
            TooltipsUI?.updateTooltip?.(btn, btnLabel);
        }

        const floatingUnlockBtn = document.getElementById('scUnlockFloatingBtn');
        if (floatingUnlockBtn) {
            floatingUnlockBtn.style.display = isVirtual ? 'none' : '';
            const floatLabel = locked ? 'Déverrouiller pour ajuster' : 'Mode Édition';
            floatingUnlockBtn.setAttribute('aria-label', floatLabel);
            floatingUnlockBtn.setAttribute('data-tooltip', floatLabel);
            TooltipsUI?.updateTooltip?.(floatingUnlockBtn, floatLabel);
        }

        // [UX Mobile] History integration for Edit Mode
        if (!locked) {
            if (!HistoryManager.isOpen('seatingChartEdit')) {
                HistoryManager.pushState('seatingChartEdit', () => {
                    if (!this._isLocked) {
                        this._toggleLock();
                    }
                });
            }
        } else if (HistoryManager.isOpen('seatingChartEdit')) {
            HistoryManager.handleManualClose('seatingChartEdit');
        }
    },

    _applyLockState(locked, options = {}) {
        const { skipSmartFit = false } = options;
        const board = document.getElementById('scClassroomBoard');
        if (board) board.style.transition = 'none';
        const currentClass = this._getCurrentClass();
        const lockKey = this._getActiveClassLockKey();
        this._isLocked = locked;
        this._wasLockedBeforeEdit = Boolean(currentClass?.[lockKey]);
        this._hasChangesSinceUnlock = false;
        this._dragSource = null;
        this._touchSourceInfo = null;
        this._syncLockControlsUI(locked);
        this._updatePlanModeSwitchUI();
        this._updateCellsDraggability();
        if (!skipSmartFit) {
            this._applySmartFit(true);
        } else if (board) {
            void board.offsetWidth;
            board.style.removeProperty('transition');
        }
    },

    _bindBoardSlideCleanup(board, timeoutMs = 600) {
        if (!board) return;
        let timer = null;
        let cleaned = false;
        const onTransEnd = (e) => {
            if (e.target === board && (!e.propertyName || e.propertyName === 'transform' || e.propertyName === 'translate')) {
                cleanup();
            }
        };
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (timer) clearTimeout(timer);
            board.removeEventListener('transitionend', onTransEnd);
            board.classList.remove('sc-lock-sliding');
            board.style.removeProperty('transform');
            board.style.removeProperty('transform-origin');
            board.style.removeProperty('transition');
            if (this._zoomAnimCleanup === cleanup) {
                this._zoomAnimCleanup = null;
            }
        };
        this._zoomAnimCleanup = cleanup;
        if (timeoutMs > 0) timer = setTimeout(cleanup, timeoutMs);
        board.addEventListener('transitionend', onTransEnd);
    },

    _toggleLock() {
        if (this._isVirtualClass()) {
            this._isLocked = true;
            this._syncLockControlsUI(true);
            UI?.showNotification?.(
                'Classe reconstituée en lecture seule. Modifiez le plan directement dans chaque groupe.',
                'info'
            );
            return;
        }
        const view = document.getElementById('seatingChartView');
        const btn = document.getElementById('scLockBtn');
        if (!view || !btn) return;

        const board = document.getElementById('scClassroomBoard');
        const currentClass = this._getCurrentClass();
        const lockKey = this._getActiveClassLockKey();
        const validatedKey = this._getActiveClassValidatedKey();
        this._isLocked = !this._isLocked;
        this._dragSource = null;
        this._touchSourceInfo = null;
        this._undoStack = [];
        this._redoStack = [];
        this._updateUndoRedoButtons();
        if (!this._isLocked) {
            this._wasLockedBeforeEdit = Boolean(currentClass?.[lockKey]);
            this._hasChangesSinceUnlock = false;
        }

        this._clearSelection();
        this._closeMobileSheet();
        if (this._isLocked) {
            this._closeConfigPopover();
            this._dismissOnboardingHint();
        } else {
            this._maybeShowOnboardingHint();
        }

        let shouldPersistValidation = false;
        if (currentClass) {
            const placedCount = this._getPlacedIds().size;
            if (this._isLocked) {
                if (placedCount > 0) {
                    if (this._hasChangesSinceUnlock) {
                        this._savePositionsToState(false);
                    }
                    const wasAlreadyValidated = Boolean(this._wasLockedBeforeEdit && currentClass[lockKey] && currentClass[validatedKey]);
                    currentClass[lockKey] = true;
                    shouldPersistValidation = Boolean(this._hasChangesSinceUnlock || !wasAlreadyValidated);
                    if (shouldPersistValidation) {
                        currentClass[validatedKey] = Date.now();
                    }
                    this._wasLockedBeforeEdit = true;
                    this._hasChangesSinceUnlock = false;
                } else {
                    currentClass[lockKey] = false;
                    this._wasLockedBeforeEdit = false;
                }
            } else if (!this._wasLockedBeforeEdit) {
                currentClass[lockKey] = false;
            }
        }

        const gridArea = document.getElementById('scGridArea');
        const gridContainer = document.getElementById('scGridContainer');
        const expectedCells = this._getEffectiveRowCount() * this._getCols();
        const didRebuildGrid = this._isActivityMode() && gridContainer?.children.length !== expectedCells;
        const areaW = gridArea?.clientWidth || window.innerWidth || 0;
        const isNativeDesktopSlide = !this._isCompactLayout()
            && areaW >= 1180
            && Boolean(this._isFitted && board?.style.getPropertyValue('--sc-scale'))
            && !didRebuildGrid;
        const rBefore = isNativeDesktopSlide ? null : (board?.getBoundingClientRect?.() || null);
        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }
        // Freeze child cell transitions before flipping data-locked so the GPU slides a static texture at 120Hz
        board?.classList.add('sc-lock-sliding');

        if (!isNativeDesktopSlide && board) {
            board.style.transition = 'none';
        }

        if (didRebuildGrid) {
            this._renderGrid();
        } else {
            this._updateCellsDraggability();
        }
        this._updatePlanModeSwitchUI();
        this._updateSidebarLockState();
        this._updateFooter();
        this._saveGridConfig();
        if (shouldPersistValidation) {
            StorageManager.saveAppState();
        }

        if (isNativeDesktopSlide) {
            this._syncLockControlsUI(this._isLocked);
            this._bindBoardSlideCleanup(board, 600);
        } else {
            this._syncLockControlsUI(this._isLocked);
            this._applySmartFit(true);
            if (rBefore && rBefore.width > 0) {
                this._animateFLIPTransition(rBefore, { lockToggle: true });
            } else {
                board?.classList.remove('sc-lock-sliding');
                board?.style.removeProperty('transition');
            }
        }

        if (didRebuildGrid) {
            setTimeout(() => {
                if (this._isActive) TooltipsUI?.initTooltips?.(document.getElementById('seatingChartView'));
            }, 540);
        }
        window.dispatchEvent(new CustomEvent('seating-chart:status-changed', {
            detail: { classId: currentClass?.id, locked: this._isLocked, planMode: this._planMode }
        }));
    },
    _getCurrentClass() {
        const classId = appState.currentClassId;
        if (!classId) return null;
        return ClassManager.getClassById(classId) || (appState.classes || []).find(c => c.id === classId) || null;
    },

    _isVirtualClass(cls = this._getCurrentClass()) {
        if (cls?.isVirtual) return true;
        const id = cls?.id || appState.currentClassId;
        return ClassManager.isVirtualClass(id);
    },
    // ========================================================================
    // GRID STATE
    // ========================================================================

    _initGrid(rows, cols) {
        this._gridState = Array.from({ length: rows }, () => Array(cols).fill(null));
    },

    _getCellStudentIds(row, col) {
        const val = this._gridState?.[row]?.[col];
        if (!val) return [];
        return Array.isArray(val) ? val.filter(Boolean) : [val];
    },

    _setCellStudentIds(row, col, ids) {
        if (!this._gridState?.[row]) return;
        const clean = (Array.isArray(ids) ? ids : (ids ? [ids] : [])).filter(Boolean);
        if (clean.length === 0) {
            this._gridState[row][col] = null;
        } else if (clean.length === 1) {
            this._gridState[row][col] = clean[0];
        } else {
            this._gridState[row][col] = clean;
        }
    },

    _getStationNumber(targetRow, targetCol) {
        if (this._isSpecialSpot(targetRow, targetCol)) return null;
        const rows = this._gridState?.length || this._getRows();
        const cols = this._gridState?.[0]?.length || this._getCols();
        let count = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this._isSpecialSpot(r, c)) continue;
                count++;
                if (r === targetRow && c === targetCol) return count;
            }
        }
        return null;
    },

    _getPlacedMap() {
        const map = {};
        this._gridState.forEach((row, r) => {
            row.forEach((val, c) => {
                if (Array.isArray(val)) {
                    val.forEach((id, idx) => { if (id) map[id] = { row: r, col: c, order: idx }; });
                } else if (val) {
                    map[val] = { row: r, col: c, order: 0 };
                }
            });
        });
        return map;
    },

    _getPlacedIds() {
        const ids = new Set();
        this._gridState.forEach(row => row.forEach(val => {
            if (Array.isArray(val)) {
                val.forEach(id => { if (id) ids.add(id); });
            } else if (val) {
                ids.add(val);
            }
        }));
        return ids;
    },

    _getUnplacedStudents(includeDeparted = false) {
        const placedIds = this._getPlacedIds();
        return this._students.filter(s => !placedIds.has(s.id) && (includeDeparted || !this._isStudentDeparted(s)));
    },

    // ========================================================================
    // UNDO / REDO (Full-snapshot, two-stack)
    // ========================================================================

    _captureSnapshot() {
        const currentClass = this._getCurrentClass();
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        return {
            gridState: this._gridState.map(row => row.map(cell => Array.isArray(cell) ? [...cell] : cell)),
            specialLayout: Utils.deepClone(appState[gridKey]?.specialLayout || {}),
            classSpecialLayout: currentClass?.[classSpecialKey]
                ? Utils.deepClone(currentClass[classSpecialKey])
                : null,
            rows: this._getRows(),
            cols: this._getCols()
        };
    },

    _snapshotGrid() {
        try {
            this._undoStack.push(this._captureSnapshot());
            if (this._undoStack.length > MAX_UNDO_LEVELS) this._undoStack.shift();
            this._redoStack = [];
            this._updateUndoRedoButtons();
        } catch (_) { /* never block caller */ }
    },

    _undo() {
        if (this._undoStack.length === 0 || this._isLocked) return;
        this._redoStack.push(this._captureSnapshot());
        const snapshot = this._undoStack.pop();
        const willRestoreCleanLock = this._undoStack.length === 0 && this._wasLockedBeforeEdit;
        this._restoreSnapshot(snapshot);
        if (willRestoreCleanLock) {
            this._hasChangesSinceUnlock = false;
            const currentClass = this._getCurrentClass();
            const lockKey = this._getActiveClassLockKey();
            if (currentClass) currentClass[lockKey] = true;
            StorageManager.saveAppState();
        }
    },

    _redo() {
        if (this._redoStack.length === 0 || this._isLocked) return;
        this._undoStack.push(this._captureSnapshot());
        const snapshot = this._redoStack.pop();
        this._restoreSnapshot(snapshot);
        this._hasChangesSinceUnlock = true;
        const currentClass = this._getCurrentClass();
        const lockKey = this._getActiveClassLockKey();
        if (currentClass) currentClass[lockKey] = false;
    },

    _restoreSnapshot(snapshot) {
        const gridKey = this._getActiveGridKey();
        const classSpecialKey = this._getActiveClassSpecialKey();
        this._gridState = snapshot.gridState.map(row => row.map(cell => Array.isArray(cell) ? [...cell] : cell));
        if (appState[gridKey]) {
            appState[gridKey].specialLayout = snapshot.specialLayout;
            if (snapshot.rows) appState[gridKey].rows = snapshot.rows;
            if (snapshot.cols) appState[gridKey].cols = snapshot.cols;
        }

        const currentClass = this._getCurrentClass();
        if (currentClass) {
            if (snapshot.classSpecialLayout) {
                currentClass[classSpecialKey] = Utils.deepClone(snapshot.classSpecialLayout);
            } else {
                delete currentClass[classSpecialKey];
            }
        }
        
        const rowSlider = document.getElementById('scRowsSlider');
        const colSlider = document.getElementById('scColsSlider');
        if (rowSlider && snapshot.rows) { 
            rowSlider.value = snapshot.rows; 
            document.getElementById('scRowsValue').textContent = snapshot.rows; 
        }
        if (colSlider && snapshot.cols) { 
            colSlider.value = snapshot.cols; 
            document.getElementById('scColsValue').textContent = snapshot.cols; 
        }

        this._savePositionsToState();
        this._render();
        this._applySmartFit(true);
        this._saveGridConfig();
        this._staggerCellEntrance();
    },

    _updateUndoRedoButtons() {
        const undoBtn = document.getElementById('scUndoBtn');
        const redoBtn = document.getElementById('scRedoBtn');
        const clearBtn = document.getElementById('scClearBtn');
        const autoPlaceBtn = document.getElementById('scAutoPlaceBtn');

        const placedCount = this._getPlacedIds().size;
        const totalCount = this._students.length;

        if (undoBtn) undoBtn.disabled = this._undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = this._redoStack.length === 0;
        if (clearBtn) clearBtn.disabled = placedCount === 0;
        if (autoPlaceBtn) {
            autoPlaceBtn.disabled = totalCount === 0;
            if (totalCount > 0) autoPlaceBtn.removeAttribute('disabled');
        }
    },

    // ========================================================================
    // PERSISTENCE
    // ========================================================================

    _loadPositionsFromState() {
        const rows = this._getRows();
        const cols = this._getCols();
        const posKey = this._getActivePositionKey();
        this._initGrid(rows, cols);

        const cellBuckets = new Map();
        this._students.forEach(s => {
            const pos = s[posKey];
            if (pos?.row != null && pos?.col != null &&
                pos.row >= 0 && pos.row < rows && pos.col >= 0 && pos.col < cols &&
                !this._isSpecialSpot(pos.row, pos.col)) {
                const key = `${pos.row},${pos.col}`;
                if (!cellBuckets.has(key)) cellBuckets.set(key, []);
                cellBuckets.get(key).push({ id: s.id, order: pos.order ?? 0 });
            }
        });

        const currentClass = this._getCurrentClass();
        const isVirtual = this._isVirtualClass(currentClass);
        const maxPerCell = (isVirtual || this._isActivityMode()) ? MAX_ACTIVITY_GROUP_SIZE : 1;

        for (const [key, items] of cellBuckets.entries()) {
            const [r, c] = key.split(',').map(Number);
            items.sort((a, b) => a.order - b.order);
            this._setCellStudentIds(r, c, items.slice(0, maxPerCell).map(item => item.id));
        }
    },

    _savePositionsToState(preserveOutOfBounds = false) {
        if (this._isVirtualClass()) return;
        const placed = this._getPlacedMap();
        const posKey = this._getActivePositionKey();
        const updatedKey = this._getActiveClassUpdatedKey();
        const lockKey = this._getActiveClassLockKey();
        let anyChanged = false;

        this._students.forEach(s => {
            const result = appState.generatedResults?.find(r => r.id === s.id);
            if (!result) return;

            const pos = placed[s.id];
            const oldPos = result[posKey];
            let newPos = null;
            if (pos) {
                const cellIds = this._getCellStudentIds(pos.row, pos.col);
                newPos = {
                    row: pos.row,
                    col: pos.col,
                    pinned: oldPos?.pinned || false,
                    ...(cellIds.length > 1 || pos.order > 0 ? { order: pos.order ?? 0 } : {})
                };
            } else if (preserveOutOfBounds && oldPos) {
                newPos = oldPos;
            }

            const changed = (!oldPos && newPos) ||
                (oldPos && !newPos) ||
                (oldPos && newPos && (
                    oldPos.row !== newPos.row ||
                    oldPos.col !== newPos.col ||
                    (oldPos.pinned || false) !== (newPos.pinned || false) ||
                    (oldPos.order ?? 0) !== (newPos.order ?? 0)
                ));

            if (changed) {
                anyChanged = true;
                result[posKey] = newPos;
                result._lastModified = Date.now();
                s[posKey] = newPos;
            }
        });

        if (anyChanged) {
            this._hasChangesSinceUnlock = true;
            const currentClass = this._getCurrentClass();
            if (currentClass) {
                currentClass[updatedKey] = Date.now();
                currentClass[lockKey] = false;
            }
            StorageManager.saveAppState();
        }
    },
    _getValidPlacedIdsForClass(cls, mode = 'course', classResults = null) {
        if (!cls) return new Set();

        const posKey = this._getActivePositionKey(mode);
        const gridKey = this._getActiveGridKey(mode);
        const classSpecialKey = this._getActiveClassSpecialKey(mode);
        const gridConfig = appState[gridKey];
        const isCurrentActive = this._isActive && cls.id === appState.currentClassId && mode === this._planMode;
        const rows = isCurrentActive
            ? this._getRows()
            : (gridConfig?.rows || this._getDefaultRows(mode));
        const cols = isCurrentActive
            ? this._getCols()
            : (gridConfig?.cols || this._getDefaultCols(mode));
        const globalSpecial = gridConfig?.specialLayout || {};
        const classSpecial = cls[classSpecialKey] || {};
        const isVirtual = this._isVirtualClass(cls);
        const maxPerCell = (isVirtual || mode === 'activity') ? MAX_ACTIVITY_GROUP_SIZE : 1;

        const results = classResults || ClassManager.getStudentsForClass(cls.id);
        const cellBuckets = new Map();

        results.forEach(r => {
            const pos = r?.[posKey];
            if (pos?.row != null && pos?.col != null &&
                pos.row >= 0 && pos.row < rows &&
                pos.col >= 0 && pos.col < cols) {
                const key = `${pos.row},${pos.col}`;
                if (!globalSpecial[key] && !classSpecial[key]) {
                    if (!cellBuckets.has(key)) cellBuckets.set(key, []);
                    cellBuckets.get(key).push({ id: r.id, order: pos.order ?? 0 });
                }
            }
        });

        const validIds = new Set();
        for (const items of cellBuckets.values()) {
            items.sort((a, b) => a.order - b.order);
            items.slice(0, maxPerCell).forEach(item => validIds.add(item.id));
        }
        return validIds;
    },

    getClassSeatingStatus(cls, mode = 'course') {
        if (!cls) return { status: 'empty', label: 'À faire', shortLabel: 'À faire', icon: 'solar:map-point-linear', unplaced: 0, placed: 0, total: 0 };

        const lockKey = this._getActiveClassLockKey(mode);
        const validatedKey = this._getActiveClassValidatedKey(mode);
        const updatedKey = this._getActiveClassUpdatedKey(mode);

        const classResults = ClassManager.getStudentsForClass(cls.id);
        const validPlacedIds = this._getValidPlacedIdsForClass(cls, mode, classResults);
        const activeResults = classResults.filter(r => !this._isStudentDeparted(r));
        const total = activeResults.length;
        const placedActive = activeResults.filter(r => validPlacedIds.has(r.id)).length;
        const totalPlaced = classResults.filter(r => validPlacedIds.has(r.id)).length;
        const unplaced = Math.max(0, total - placedActive);

        const isVirtual = this._isVirtualClass(cls);

        if (total === 0 || totalPlaced === 0) {
            return {
                status: 'empty',
                isVirtual,
                label: 'À faire',
                shortLabel: 'À faire',
                icon: 'solar:map-point-linear',
                placed: totalPlaced,
                total,
                unplaced
            };
        }

        if (isVirtual) {
            const sourceGroups = Array.isArray(cls.sourceGroupNames) && cls.sourceGroupNames.length > 0
                ? cls.sourceGroupNames.join(' & ')
                : '';
            const label = sourceGroups ? `Vue combinée (${sourceGroups})` : 'Vue combinée';
            return {
                status: 'virtual',
                isVirtual: true,
                label,
                shortLabel: 'Vue combinée',
                sourceGroups,
                icon: 'solar:layers-minimalistic-linear',
                placed: totalPlaced,
                total,
                unplaced
            };
        }

        if (cls[lockKey]) {
            const dateStr = this._formatShortDate(cls[validatedKey]);
            const label = dateStr ? `Validé (${dateStr})` : 'Validé';
            return {
                status: 'locked',
                label,
                shortLabel: 'Validé',
                dateStr,
                icon: 'solar:lock-bold',
                placed: totalPlaced,
                total,
                unplaced
            };
        }

        const dateStr = this._formatShortDate(cls[updatedKey]);
        const label = dateStr ? `En test (${dateStr})` : 'En test';
        return {
            status: 'testing',
            label,
            shortLabel: 'En test',
            dateStr,
            icon: 'solar:test-tube-linear',
            placed: totalPlaced,
            total,
            unplaced
        };
    },

    _updateStatusPill() {
        const pill = document.getElementById('scStatusPill');
        if (!pill) return;

        // In edit mode, the left sidebar already clearly indicates "Mode Édition actif"
        if (!this._isLocked) {
            pill.style.display = 'none';
            pill.innerHTML = '';
            return;
        }

        const currentClass = this._getCurrentClass();
        const info = this.getClassSeatingStatus(currentClass, this._planMode);

        if (info.status === 'empty') {
            pill.style.display = 'none';
            pill.innerHTML = '';
            return;
        }

        pill.className = `sc-status-pill sc-status-${info.status}`;
        pill.style.display = '';

        const dateText = info.dateStr ? ` · ${info.dateStr}` : '';
        const unplacedWarning = info.unplaced > 0
            ? `<span class="sc-status-pill-sep">·</span><span class="sc-status-pill-unplaced">${info.unplaced} non placé${info.unplaced > 1 ? 's' : ''}</span>`
            : '';

        if (info.status === 'virtual') {
            const sourceSuffix = info.sourceGroups ? ` · ${Utils.escapeHtml(info.sourceGroups)}` : '';
            const tooltipMsg = info.sourceGroups
                ? `Superposition en lecture seule des groupes ${info.sourceGroups}. Modifiez le plan dans chaque groupe.`
                : 'Classe reconstituée en lecture seule. Modifiez le plan dans chaque groupe.';
            pill.removeAttribute('role');
            pill.removeAttribute('tabindex');
            pill.innerHTML = `
                <div class="sc-status-pill-inner">
                    <div class="sc-status-pill-side sc-status-pill-rest">
                        <iconify-icon class="sc-status-pill-icon" icon="solar:layers-minimalistic-linear"></iconify-icon>
                        <span class="sc-status-pill-text">Vue combinée${sourceSuffix}</span>
                        ${unplacedWarning}
                    </div>
                </div>
            `;
            pill.removeAttribute('title');
            pill.setAttribute('data-tooltip', tooltipMsg);
            pill.setAttribute('aria-label', tooltipMsg);
            TooltipsUI?.updateTooltip?.(pill, tooltipMsg);
            return;
        }

        pill.setAttribute('role', 'button');
        pill.setAttribute('tabindex', '0');

        const isLocked = info.status === 'locked';
        const iconRest = isLocked ? 'solar:lock-bold' : 'solar:test-tube-linear';
        const labelRest = isLocked ? 'Validé' : 'En test';
        const actionLabel = 'Modifier';

        pill.innerHTML = `
            <div class="sc-status-pill-inner">
                <div class="sc-status-pill-side sc-status-pill-rest">
                    <iconify-icon class="sc-status-pill-icon" icon="${iconRest}"></iconify-icon>
                    <span class="sc-status-pill-text">${labelRest}</span>
                    ${unplacedWarning}
                </div>
                <div class="sc-status-pill-side sc-status-pill-hover" aria-hidden="true">
                    <iconify-icon class="sc-status-pill-icon" icon="solar:pen-linear"></iconify-icon>
                    <span class="sc-status-pill-text">${actionLabel}</span>
                    ${dateText ? `<span class="sc-status-pill-date">${dateText}</span>` : ''}
                </div>
            </div>
        `;

        pill.removeAttribute('title');
        pill.removeAttribute('data-tooltip');
        pill.setAttribute('aria-label', `${labelRest}${dateText}. Cliquer pour passer en mode édition`);
    },
    // ========================================================================
    // PIN
    // ========================================================================

    _updateCellPinDOM(row, col, isPinned) {
        if (isPinned && this._selectedChipIds?.length > 0) {
            const cellIds = this._getCellStudentIds(row, col);
            const beforeLen = this._selectedChipIds.length;
            this._selectedChipIds = this._selectedChipIds.filter(id => !cellIds.includes(id));
            if (this._selectedChipIds.length !== beforeLen) {
                this._applyChipSelectionUI();
                this._updateQuickGroupButton();
            }
        }
        const cell = document.querySelector(`#scGridContainer .sc-cell[data-row="${row}"][data-col="${col}"]`);
        if (!cell) {
            this._render();
            return;
        }
        cell.classList.toggle('pinned', Boolean(isPinned));
        this._setElementDraggable(cell, this._isNativeDraggableAllowed() && !isPinned);
        const pinBtn = cell.querySelector('.sc-cell-pin');
        if (pinBtn) {
            const label = isPinned ? 'Détacher' : 'Fixer';
            pinBtn.setAttribute('aria-label', label);
            pinBtn.setAttribute('data-tooltip', label);
            const icon = pinBtn.querySelector('iconify-icon');
            if (icon) {
                icon.setAttribute('icon', `solar:pin-${isPinned ? 'bold' : 'linear'}`);
            }
        }
        TooltipsUI.initTooltips(cell);
    },

    _togglePin(resultId) {
        if (this._isLocked) return;
        const posKey = this._getActivePositionKey();
        const lockKey = this._getActiveClassLockKey();
        const updatedKey = this._getActiveClassUpdatedKey();
        const result = appState.generatedResults?.find(r => r.id === resultId);
        if (!result?.[posKey]) return;

        const nextPinned = !result[posKey].pinned;
        result[posKey].pinned = nextPinned;
        result._lastModified = Date.now();

        const student = this._students.find(s => s.id === resultId);
        if (student) student[posKey] = { ...result[posKey] };

        this._hasChangesSinceUnlock = true;
        const currentClass = this._getCurrentClass();
        if (currentClass) {
            currentClass[updatedKey] = Date.now();
            currentClass[lockKey] = false;
        }
        StorageManager.saveAppState();
        this._updateCellPinDOM(result[posKey].row, result[posKey].col, nextPinned);
        this._haptic(10);
    },

    _toggleCellPin(row, col) {
        if (this._isLocked) return;
        const cellIds = this._getCellStudentIds(row, col);
        if (cellIds.length === 0) return;
        if (cellIds.length === 1) {
            this._togglePin(cellIds[0]);
            return;
        }

        const posKey = this._getActivePositionKey();
        const lockKey = this._getActiveClassLockKey();
        const updatedKey = this._getActiveClassUpdatedKey();
        const anyPinned = cellIds.some(id => {
            const r = appState.generatedResults?.find(x => x.id === id);
            return Boolean(r?.[posKey]?.pinned);
        });
        const nextPinned = !anyPinned;

        cellIds.forEach(id => {
            const result = appState.generatedResults?.find(r => r.id === id);
            if (result?.[posKey]) {
                result[posKey].pinned = nextPinned;
                result._lastModified = Date.now();
            }
            const student = this._students.find(s => s.id === id);
            if (student && result?.[posKey]) {
                student[posKey] = { ...result[posKey] };
            }
        });

        this._hasChangesSinceUnlock = true;
        const currentClass = this._getCurrentClass();
        if (currentClass) {
            currentClass[updatedKey] = Date.now();
            currentClass[lockKey] = false;
        }
        StorageManager.saveAppState();
        this._updateCellPinDOM(row, col, nextPinned);
        this._haptic(10);
    },

    _haptic(pattern = 15) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(pattern); } catch (_) {}
        }
    },
    _getCurrentClassStudents() {
        const classId = appState.currentClassId;
        return ClassManager.getStudentsForClass(classId)
            .map(r => ({
                id: r.id, nom: r.nom, prenom: r.prenom,
                classId: r.classId,
                classe: r.classe,
                originClass: r.originClass,
                studentPhoto: r.studentPhoto,
                seatingPosition: r.seatingPosition,
                seatingActivityPosition: r.seatingActivityPosition,
                evolution: r.evolution,
                studentData: r.studentData,
                isDeparted: this._isStudentDeparted(r),
                isNew: this._isStudentNew(r)
            }))
            .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));
    },

    _scrollToDesk() {
        if (this._isFitted) return;
        requestAnimationFrame(() => {
            setTimeout(() => {
                const gridArea = document.getElementById('scGridArea');
                if (gridArea) {
                    const topTarget = (this._isActivityMode() || this._isStudentOrientation()) ? 0 : (gridArea.scrollHeight || 0) + 500;
                    if (typeof gridArea.scrollTo === 'function') {
                        gridArea.scrollTo({
                            top: topTarget,
                            behavior: 'smooth'
                        });
                    } else {
                        gridArea.scrollTop = topTarget;
                    }
                }
            }, 100); // Slight delay to ensure DOM layout and animations have updated height
        });
    }
};
