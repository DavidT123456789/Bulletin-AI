/**
 * @fileoverview Seating Chart Manager — Plan de Classe (Integrated View)
 * In-place view switching (List ↔ Plan) with premium motion design.
 * Features: D&D, pin, lock, evolution dots, config popover, FocusPanel.
 * @module managers/SeatingChartManager
 */

import { appState } from '../state/State.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { StorageManager } from './StorageManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { UI } from './UIManager.js';

const DEFAULT_COLS = 6;
const DEFAULT_ROWS = 5;
const MAX_UNDO_LEVELS = 5;

export const SeatingChartManager = {
    _isActive: false,
    _isLocked: false,
    _gridState: [],
    _students: [],
    _dragSource: null,
    _touchDragEl: null,
    _touchSourceInfo: null,
    _configPopoverOpen: false,
    _prevPlacedCount: 0,
    _selectedChipIds: [],
    _lastSelectedGridPos: null,
    _lastSelectedSidebarIndex: null,
    _undoStack: [],
    _redoStack: [],

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    init() {
        this._injectViewToggle();
        this._injectView();
        this._setupEventListeners();
    },

    // ========================================================================
    // HTML INJECTION
    // ========================================================================

    _injectViewToggle() {
        const headerActions = document.querySelector('.header-actions');
        if (!headerActions || document.getElementById('viewToggle')) return;

        const toggle = document.createElement('div');
        toggle.className = 'view-toggle';
        toggle.id = 'viewToggle';
        toggle.innerHTML = `
            <button class="view-toggle-btn active" data-view="list" aria-label="Vue liste">
                <iconify-icon icon="solar:list-linear"></iconify-icon>
                <span>Liste</span>
            </button>
            <button class="view-toggle-btn" data-view="plan" aria-label="Vue plan de classe">
                <iconify-icon icon="solar:streets-map-point-linear"></iconify-icon>
                <span>Plan</span>
            </button>
        `;

        headerActions.prepend(toggle);
    },

    _injectView() {
        const existing = document.getElementById('seatingChartView');
        if (existing) existing.remove();

        const mainContent = document.querySelector('.main-content .output-section');
        if (!mainContent) return;

        const view = document.createElement('div');
        view.id = 'seatingChartView';
        view.style.display = 'none';
        view.innerHTML = `
            <div class="sc-progress-track"><div class="sc-progress-fill" id="scProgressFill"></div></div>
            <div class="sc-body">
                <div class="sc-sidebar" id="scSidebar">
                    <div class="sc-sidebar-toolbar" id="scSidebarToolbar">
                        <div class="sc-sidebar-toolbar-header">
                            <span class="sc-toolbar-label">Mode Édition</span>
                            <div class="sc-toggle-switch" id="scLockBtn" role="switch" aria-checked="true" aria-label="Mode Édition">
                                <div class="sc-toggle-knob"></div>
                            </div>
                        </div>
                        <div class="sc-sidebar-actions">
                            <div class="sc-edit-only sc-sidebar-actions-group">
                                <button class="sc-action-btn sc-auto-place-btn" id="scAutoPlaceBtn" aria-label="Placement automatique" data-tooltip="Placer auto">
                                    <iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>
                                </button>
                                <button class="sc-action-btn" id="scShuffleBtn" aria-label="Mélanger" data-tooltip="Mélanger">
                                    <iconify-icon icon="solar:shuffle-linear"></iconify-icon>
                                </button>
                                <button class="sc-action-btn sc-undo-btn" id="scUndoBtn" aria-label="Annuler" data-tooltip="Annuler" disabled>
                                    <iconify-icon icon="solar:undo-left-round-linear"></iconify-icon>
                                </button>
                                <button class="sc-action-btn sc-redo-btn" id="scRedoBtn" aria-label="Rétablir" data-tooltip="Rétablir" disabled>
                                    <iconify-icon icon="solar:undo-right-round-linear"></iconify-icon>
                                </button>
                                <div class="sc-config-wrapper">
                                    <button class="sc-action-btn sc-config-trigger" id="scConfigBtn" aria-label="Configuration grille" data-tooltip="Grille">
                                        <iconify-icon icon="solar:settings-linear"></iconify-icon>
                                    </button>
                                    <div class="sc-config-popover" id="scConfigPopover">
                                        <div class="sc-config-row">
                                            <label class="sc-config-label" for="scColsSlider">Colonnes</label>
                                            <input type="range" id="scColsSlider" min="2" max="10" value="${DEFAULT_COLS}">
                                            <span class="sc-config-value" id="scColsValue">${DEFAULT_COLS}</span>
                                        </div>
                                        <div class="sc-config-row">
                                            <label class="sc-config-label" for="scRowsSlider">Rangées</label>
                                            <input type="range" id="scRowsSlider" min="2" max="10" value="${DEFAULT_ROWS}">
                                            <span class="sc-config-value" id="scRowsValue">${DEFAULT_ROWS}</span>
                                        </div>
                                    </div>
                                </div>
                                <button class="sc-action-btn sc-reset-btn" id="scClearBtn" aria-label="Réinitialiser" data-tooltip="Réinitialiser">
                                    <iconify-icon icon="solar:restart-linear"></iconify-icon>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="sc-sidebar-header">
                        <div class="sc-sidebar-title" id="scSidebarTitle"><span>Élèves non placés</span></div>
                        <div class="sc-search-box">
                            <iconify-icon icon="solar:magnifer-linear"></iconify-icon>
                            <input type="text" id="scSearchInput" placeholder="Rechercher..." autocomplete="off">
                            <button class="sc-search-clear" id="scSearchClear" aria-label="Effacer" data-tooltip="Effacer" type="button">
                                <iconify-icon icon="ph:x"></iconify-icon>
                            </button>
                        </div>
                    </div>
                    <div class="sc-student-list" id="scStudentList"></div>
                </div>
                <div class="sc-grid-area" id="scGridArea">
                    <!-- Top Status Pill -->
                    <div class="sc-floating-status">
                        <div class="sc-toolbar-info" id="scFooterInfo"><span class="sc-edit-hint">Calcul des places…</span></div>
                    </div>

                    <div class="sc-grid-container" id="scGridContainer"></div>
                    <div class="sc-desk-row">
                        <div class="sc-desk" id="scDesk">
                            <iconify-icon icon="solar:square-academic-cap-linear"></iconify-icon>
                            Bureau
                        </div>
                    </div>
                </div>

                <!-- Floating Actions (Read-Only Mode) -->
                <div class="sc-floating-actions sc-read-only-only">
                    <button class="sc-action-btn sc-print-btn" id="scFloatingPrintBtn" aria-label="Imprimer" data-tooltip="Imprimer le plan">
                        <iconify-icon icon="solar:printer-linear"></iconify-icon>
                    </button>
                    <button class="sc-action-btn" id="scUnlockFloatingBtn" aria-label="Déverrouiller" data-tooltip="Mode Édition">
                        <iconify-icon icon="solar:lock-linear"></iconify-icon>
                    </button>
                </div>
            </div>
        `;

        mainContent.appendChild(view);
    },

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    _setupEventListeners() {
        document.getElementById('scFloatingPrintBtn')?.addEventListener('click', () => this._printChart());
        document.getElementById('scClearBtn')?.addEventListener('click', () => this._clearAll());
        document.getElementById('scAutoPlaceBtn')?.addEventListener('click', () => this._autoPlace());
        document.getElementById('scShuffleBtn')?.addEventListener('click', () => this._shuffle());
        document.getElementById('scUndoBtn')?.addEventListener('click', () => this._undo());
        document.getElementById('scRedoBtn')?.addEventListener('click', () => this._redo());
        document.getElementById('scLockBtn')?.addEventListener('click', () => this._toggleLock());
        document.getElementById('scUnlockFloatingBtn')?.addEventListener('click', () => this._toggleLock());

        document.getElementById('scConfigBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleConfigPopover();
        });

        const captureBeforeSlide = () => this._snapshotGrid();
        
        const colsSlider = document.getElementById('scColsSlider');
        colsSlider?.addEventListener('pointerdown', captureBeforeSlide);
        colsSlider?.addEventListener('input', (e) => {
            document.getElementById('scColsValue').textContent = e.target.value;
            this._onGridConfigChange();
        });

        const rowsSlider = document.getElementById('scRowsSlider');
        rowsSlider?.addEventListener('pointerdown', captureBeforeSlide);
        rowsSlider?.addEventListener('input', (e) => {
            document.getElementById('scRowsValue').textContent = e.target.value;
            this._onGridConfigChange();
        });

        document.getElementById('scSearchInput')?.addEventListener('input', (e) => {
            document.getElementById('scSearchClear')?.classList.toggle('visible', e.target.value.length > 0);
            this._renderSidebar();
        });

        document.getElementById('scSearchClear')?.addEventListener('click', () => {
            const input = document.getElementById('scSearchInput');
            if (input) { input.value = ''; input.focus(); }
            document.getElementById('scSearchClear')?.classList.remove('visible');
            this._renderSidebar();
        });

        document.querySelector('.sc-search-box')?.addEventListener('click', (e) => {
            if (!e.target.closest('input') && !e.target.closest('.sc-search-clear')) {
                document.getElementById('scSearchInput')?.focus();
            }
        });

        document.getElementById('viewToggle')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-toggle-btn');
            if (!btn) return;
            this.switchToView(btn.dataset.view === 'plan' ? 'plan' : 'list');
        });

        document.addEventListener('click', (e) => {
            if (this._configPopoverOpen && !e.target.closest('.sc-config-wrapper')) {
                this._closeConfigPopover();
            }
            if (this._selectedChipIds.length > 0 && !e.target.closest('.sc-student-chip') && !e.target.closest('.sc-cell')) {
                this._clearSelection();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._selectedChipIds.length > 0) {
                this._clearSelection();
            }
        });
    },

    // ========================================================================
    // CONFIG POPOVER
    // ========================================================================

    _toggleConfigPopover() {
        if (!this._configPopoverOpen) {
            document.getElementById('scConfigBtn')?.classList.remove('sc-has-pulse');
        }
        this._configPopoverOpen ? this._closeConfigPopover() : this._openConfigPopover();
    },

    _openConfigPopover() {
        const popover = document.getElementById('scConfigPopover');
        if (!popover) return;
        popover.classList.add('open');
        this._configPopoverOpen = true;
    },

    _closeConfigPopover() {
        const popover = document.getElementById('scConfigPopover');
        if (!popover) return;
        popover.classList.remove('open');
        this._configPopoverOpen = false;
    },

    // ========================================================================
    // VIEW SWITCHING — with entrance/exit animations
    // ========================================================================

    switchToView(view) {
        const wrapper = document.querySelector('.main-content-wrapper');
        const viewEl = document.getElementById('seatingChartView');
        const fab = document.getElementById('addStudentFab');
        if (!wrapper || !viewEl) return;

        const isList = view === 'list';

        if (isList) {
            this._animateViewExit(viewEl, () => {
                wrapper.dataset.view = 'list';
                viewEl.style.display = 'none';
                if (fab) fab.style.display = '';
                this._isActive = false;
                this._clearSelection();
                this._savePositionsToState();
                this._saveGridConfig();
                this._closeConfigPopover();
            });
        } else {
            this._students = this._getCurrentClassStudents();
            if (this._students.length === 0) {
                UI.showNotification('Aucun élève dans cette classe.', 'warning');
                wrapper.dataset.view = 'list';
                return;
            }
            wrapper.dataset.view = 'plan';
            viewEl.style.display = '';
            if (fab) fab.style.display = 'none';
            this._isActive = true;
            this._isLocked = appState.seatingGrid?.locked ?? false;
            viewEl.dataset.locked = this._isLocked;
            const lockBtn = document.getElementById('scLockBtn');
            if (lockBtn) {
                lockBtn.classList.toggle('locked', this._isLocked);
                lockBtn.setAttribute('aria-checked', (!this._isLocked).toString());
            }
            this._loadGridConfig();
            this._loadPositionsFromState();
            this._undoStack = [];
            this._redoStack = [];
            this._render();
            this._animateViewEnter(viewEl);
            this._scrollToDesk();
            this._maybeShowOnboardingHint();
        }

        document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
        
        const toggleWrapper = document.getElementById('viewToggle');
        if (toggleWrapper) {
            toggleWrapper.classList.toggle('plan-active', view === 'plan');
        }
    },

    open() { this.switchToView('plan'); },
    close() { this.switchToView('list'); },

    /** Called when class changes — reload data or revert to list */
    onClassChange(hasResults) {
        this.updateToggleVisibility(hasResults);
        if (!this._isActive) return;

        if (!hasResults) {
            this.switchToView('list');
            return;
        }

        this._prevPlacedCount = 0;
        this._students = this._getCurrentClassStudents();
        this._loadGridConfig();
        this._loadPositionsFromState();
        this._render();
        this._staggerCellEntrance();
        
        const desk = document.getElementById('scDesk');
        desk?.classList.add('sc-desk-entering');
        setTimeout(() => desk?.classList.remove('sc-desk-entering'), 500);

        this._scrollToDesk();
    },

    updateToggleVisibility(hasResults) {
        const toggle = document.getElementById('viewToggle');
        if (toggle) toggle.classList.toggle('visible', hasResults);
        if (!hasResults && this._isActive) this.switchToView('list');
    },

    // ========================================================================
    // ANIMATION ORCHESTRATORS
    // ========================================================================

    /** View entrance — toolbar slides down, body fades up, cells stagger */
    _animateViewEnter(viewEl) {
        viewEl.classList.remove('sc-exiting');
        viewEl.classList.add('sc-entering');
        this._staggerCellEntrance();

        const desk = document.getElementById('scDesk');
        desk?.classList.add('sc-desk-entering');

        const cleanup = () => {
            viewEl.classList.remove('sc-entering');
            desk?.classList.remove('sc-desk-entering');
        };
        viewEl.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, 600);
    },

    /** View exit — dissolve then callback */
    _animateViewExit(viewEl, onComplete) {
        viewEl.classList.remove('sc-entering');
        viewEl.classList.add('sc-exiting');

        let called = false;
        const done = () => {
            if (called) return;
            called = true;
            viewEl.classList.remove('sc-exiting');
            onComplete();
        };
        viewEl.addEventListener('animationend', done, { once: true });
        setTimeout(done, 350);
    },

    /** Stagger cell entrance (used after render) */
    _staggerCellEntrance() {
        const cells = document.querySelectorAll('#scGridContainer .sc-cell');
        cells.forEach((cell, i) => {
            cell.style.setProperty('--cell-i', i);
            cell.classList.add('sc-cell-stagger');
        });
        setTimeout(() => {
            cells.forEach(c => {
                c.classList.remove('sc-cell-stagger');
                c.style.removeProperty('--cell-i');
            });
        }, cells.length * 25 + 400);
    },

    /** Animate a single cell as "placed" (from sidebar) */
    _animateCellPlaced(row, col) {
        const cell = document.querySelector(`.sc-cell[data-row="${row}"][data-col="${col}"]`);
        if (!cell) return;
        cell.classList.add('sc-cell-placed');
        cell.addEventListener('animationend', () => cell.classList.remove('sc-cell-placed'), { once: true });
    },

    /** Animate swap glow on both cells */
    _animateCellSwap(row1, col1, row2, col2) {
        [
            document.querySelector(`.sc-cell[data-row="${row1}"][data-col="${col1}"]`),
            document.querySelector(`.sc-cell[data-row="${row2}"][data-col="${col2}"]`)
        ].forEach(cell => {
            if (!cell) return;
            cell.classList.add('sc-cell-swapped');
            cell.addEventListener('animationend', () => cell.classList.remove('sc-cell-swapped'), { once: true });
        });
    },

    /** Animate cell removal → shrink out, then callback to render */
    _animateCellRemove(row, col, onComplete) {
        const cell = document.querySelector(`.sc-cell[data-row="${row}"][data-col="${col}"]`);
        if (!cell) { onComplete(); return; }

        cell.classList.add('sc-cell-removing');
        let called = false;
        const done = () => {
            if (called) return;
            called = true;
            cell.classList.remove('sc-cell-removing');
            onComplete();
        };
        cell.addEventListener('animationend', done, { once: true });
        setTimeout(done, 350);
    },

    // ========================================================================
    // SELECTION — Click-to-select + Click-to-place
    // ========================================================================

    _toggleChipSelection(id) {
        const idx = this._selectedChipIds.indexOf(id);
        if (idx >= 0) {
            this._selectedChipIds.splice(idx, 1);
        } else {
            this._selectedChipIds.push(id);
        }
        this._applyChipSelectionUI();
        this._updateSelectionAttribute();
    },

    _selectGridRange(r1, c1, r2, c2) {
        const minR = Math.min(r1, r2);
        const maxR = Math.max(r1, r2);
        const minC = Math.min(c1, c2);
        const maxC = Math.max(c1, c2);

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const id = this._gridState[r][c];
                if (id && !this._selectedChipIds.includes(id)) {
                    const student = this._studentMap?.get(id);
                    if (student && !student.seatingPosition?.pinned) {
                        this._selectedChipIds.push(id);
                    }
                }
            }
        }
        this._applyChipSelectionUI();
        this._updateSelectionAttribute();
    },

    _selectSidebarRange(idx1, idx2, filteredList) {
        const min = Math.min(idx1, idx2);
        const max = Math.max(idx1, idx2);
        
        for (let i = min; i <= max; i++) {
            const id = filteredList[i].id;
            if (id && !this._selectedChipIds.includes(id)) {
                this._selectedChipIds.push(id);
            }
        }
        this._applyChipSelectionUI();
        this._updateSelectionAttribute();
    },

    _clearSelection() {
        if (this._selectedChipIds.length === 0) return;
        this._selectedChipIds = [];
        this._lastSelectedGridPos = null;
        this._lastSelectedSidebarIndex = null;
        this._applyChipSelectionUI();
        this._updateSelectionAttribute();
    },

    _applyChipSelectionUI() {
        document.querySelectorAll('.sc-student-chip, .sc-cell.occupied').forEach(el => {
            const id = el.dataset.resultId;
            if (id) el.classList.toggle('sc-chip-selected', this._selectedChipIds.includes(id));
        });
    },

    _updateSelectionAttribute() {
        const view = document.getElementById('seatingChartView');
        if (view) view.dataset.hasSelection = this._selectedChipIds.length > 0;
    },

    _placeSelectedAt(startRow, startCol) {
        const ids = [...this._selectedChipIds];
        if (ids.length === 0) return;
        this._snapshotGrid();

        const cols = this._getCols();
        const rows = this._getRows();
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (ids.includes(this._gridState[r][c])) {
                    this._gridState[r][c] = null;
                }
            }
        }

        let currentRow = startRow;
        let currentCol = startCol;
        const placedCells = [];

        for (const id of ids) {
            let found = false;
            while (currentRow < rows && !found) {
                if (!this._gridState[currentRow][currentCol]) {
                    this._gridState[currentRow][currentCol] = id;
                    placedCells.push({ row: currentRow, col: currentCol, index: placedCells.length });
                    found = true;
                }
                currentCol++;
                if (currentCol >= cols) {
                    currentCol = 0;
                    currentRow++;
                }
            }
        }

        this._selectedChipIds = [];
        this._dismissOnboardingHint();
        this._render();
        this._updateSidebarLockState();
        this._savePositionsToState();
        this._updateSelectionAttribute();

        requestAnimationFrame(() => {
            placedCells.forEach(({ row, col, index }) => {
                this._animateCellPlaced(row, col);
            });
        });
    },

    /** Mark new sidebar chips as "returning" for entrance animation */
    _animateSidebarChipReturn(resultId) {
        requestAnimationFrame(() => {
            const chip = document.querySelector(`.sc-student-chip[data-result-id="${resultId}"]`);
            if (!chip) return;
            chip.classList.add('sc-chip-returning');
            chip.addEventListener('animationend', () => chip.classList.remove('sc-chip-returning'), { once: true });
        });
    },

    _animateCounterBump() {
        ['scFooterInfo', 'scSidebarTitle'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('sc-counter-bump');
            void el.offsetWidth;
            el.classList.add('sc-counter-bump');
            el.addEventListener('animationend', () => el.classList.remove('sc-counter-bump'), { once: true });
        });
    },

    /** Lock/Unlock morph animation */
    _animateLockMorph() {
        const gridArea = document.getElementById('scGridArea');
        if (!gridArea) return;
        gridArea.classList.add('sc-lock-morph');
        gridArea.addEventListener('animationend', () => gridArea.classList.remove('sc-lock-morph'), { once: true });
        setTimeout(() => gridArea.classList.remove('sc-lock-morph'), 400);
    },

    // ========================================================================
    // LOCK
    // ========================================================================

    _toggleLock() {
        this._isLocked = !this._isLocked;
        const view = document.getElementById('seatingChartView');
        const btn = document.getElementById('scLockBtn');
        if (!view || !btn) return;

        btn.classList.toggle('locked', this._isLocked);
        btn.setAttribute('aria-checked', (!this._isLocked).toString());

        this._clearSelection();
        if (this._isLocked) this._closeConfigPopover();
        
        // Defer intensive serialization to allow CSS transition to start instantly
        setTimeout(() => this._saveGridConfig(), 100);

        this._updateSidebarLockState();
        this._updateFooter();

        // Update grid draggability without rebuilding DOM
        document.querySelectorAll('#scGridContainer .sc-cell.occupied').forEach(cell => {
            const isPinned = cell.classList.contains('pinned');
            cell.draggable = !this._isLocked && !isPinned;
        });

        if (this._isLocked) {
            view.dataset.locked = this._isLocked;
        } else {
            // Defer unlocking view datatset to let the sidebar populate first
            requestAnimationFrame(() => {
                view.dataset.locked = this._isLocked;
            });
        }
    },

    /** Track all-placed state for edit-mode sidebar collapse and auto-place disable */
    _updateSidebarLockState() {
        const view = document.getElementById('seatingChartView');
        if (!view) return;
        const allPlaced = this._getUnplacedStudents().length === 0;
        view.dataset.allPlaced = allPlaced;
    },

    // ========================================================================
    // PRINT
    // ========================================================================

    _printChart() {
        const classData = appState.classes?.find(c => c.id === appState.currentClassId);
        const className = classData?.name || 'Plan de classe';
        const studentCount = this._students?.length || 0;
        const dateStr = new Date().toLocaleDateString('fr-FR');

        const originalTitle = document.title;
        const safeName = className.replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').trim().replace(/\s+/g, '-');
        document.title = `Plan-de-classe_${safeName}_${new Date().toISOString().slice(0, 10)}`;

        const placed = this._getPlacedIds().size;
        const unplaced = studentCount - placed;
        const unplacedHtml = unplaced > 0
            ? `<div class="sc-print-warning">⚠ ${unplaced} élève${unplaced > 1 ? 's' : ''} non placé${unplaced > 1 ? 's' : ''}</div>`
            : '';

        const header = document.createElement('div');
        header.className = 'sc-print-header';
        header.innerHTML = `
            <span class="sc-print-date">${dateStr}</span>
            <span class="sc-print-class">${className} <span class="sc-print-count">(${studentCount} élèves)</span></span>
            <span class="sc-print-brand">Bulletin AI</span>
            ${unplacedHtml}
        `;

        const pageStyle = document.createElement('style');
        pageStyle.textContent = '@page { margin: 0 !important; }';
        document.head.appendChild(pageStyle);

        const view = document.getElementById('seatingChartView');
        view?.insertBefore(header, view.firstChild);

        const cleanup = () => {
            document.title = originalTitle;
            header.remove();
            pageStyle.remove();
            window.onafterprint = null;
        };

        window.onafterprint = cleanup;
        window.print();
    },

    // ========================================================================
    // GRID CONFIGURATION
    // ========================================================================

    _getRows() {
        return parseInt(document.getElementById('scRowsSlider')?.value) || DEFAULT_ROWS;
    },

    _getCols() {
        return parseInt(document.getElementById('scColsSlider')?.value) || DEFAULT_COLS;
    },

    _loadGridConfig() {
        const config = appState.seatingGrid;
        const rows = config?.rows || DEFAULT_ROWS;
        const cols = config?.cols || DEFAULT_COLS;

        const rowSlider = document.getElementById('scRowsSlider');
        const colSlider = document.getElementById('scColsSlider');
        if (rowSlider) { rowSlider.value = rows; document.getElementById('scRowsValue').textContent = rows; }
        if (colSlider) { colSlider.value = cols; document.getElementById('scColsValue').textContent = cols; }
    },

    _saveGridConfig() {
        appState.seatingGrid = {
            rows: this._getRows(),
            cols: this._getCols(),
            locked: this._isLocked,
            specialLayout: appState.seatingGrid?.specialLayout || {}
        };
        StorageManager.saveAppState();
    },

    _onGridConfigChange() {
        const newRows = this._getRows();
        const newCols = this._getCols();
        const oldRows = this._gridState ? this._gridState.length : newRows;
        
        const placed = this._getPlacedMap();
        this._initGrid(newRows, newCols);

        // Calcule le décalage pour ajouter/supprimer les rangées par le haut (éloigné du bureau)
        // car le bureau (bottom) est l'origine visuelle.
        const rowOffset = newRows - oldRows;

        // Repositionne les étudiants
        for (const [resultId, pos] of Object.entries(placed)) {
            const newR = pos.row + rowOffset;
            if (newR >= 0 && newR < newRows && pos.col < newCols) {
                this._gridState[newR][pos.col] = resultId;
            }
        }

        // Repositionne également la cartographie des places spéciales (allées, AESH...)
        // La condition de limites a été sciemment retirée : on conserve les attributs en mémoire
        // même s'ils "tombent" momentanément hors de la grille. S'ils reviennent, ils s'afficheront !
        if (appState.seatingGrid?.specialLayout && rowOffset !== 0) {
            const newSpecialLayout = {};
            for (const [key, type] of Object.entries(appState.seatingGrid.specialLayout)) {
                const [r, c] = key.split(',').map(Number);
                const newR = r + rowOffset;
                newSpecialLayout[`${newR},${c}`] = type;
            }
            appState.seatingGrid.specialLayout = newSpecialLayout;
        }

        this._savePositionsToState(); // Persiste immédiatement les nouvelles coordonnées
        this._render();
        this._saveGridConfig();
        this._staggerCellEntrance();
    },

    _setCellSpecialType(row, col, type) {
        if (!appState.seatingGrid) appState.seatingGrid = {};
        if (!appState.seatingGrid.specialLayout) appState.seatingGrid.specialLayout = {};
        
        const key = `${row},${col}`;
        if (type) {
            appState.seatingGrid.specialLayout[key] = type;
        } else {
            delete appState.seatingGrid.specialLayout[key];
        }
        
        this._saveGridConfig();
        this._render();
    },

    // ========================================================================
    // GRID STATE
    // ========================================================================

    _initGrid(rows, cols) {
        this._gridState = Array.from({ length: rows }, () => Array(cols).fill(null));
    },

    _getPlacedMap() {
        const map = {};
        this._gridState.forEach((row, r) => {
            row.forEach((id, c) => { if (id) map[id] = { row: r, col: c }; });
        });
        return map;
    },

    _getPlacedIds() {
        const ids = new Set();
        this._gridState.forEach(row => row.forEach(id => { if (id) ids.add(id); }));
        return ids;
    },

    _getUnplacedStudents() {
        const placedIds = this._getPlacedIds();
        return this._students.filter(s => !placedIds.has(s.id));
    },

    // ========================================================================
    // UNDO / REDO (Full-snapshot, two-stack)
    // ========================================================================

    _captureSnapshot() {
        return {
            gridState: this._gridState.map(row => [...row]),
            specialLayout: JSON.parse(JSON.stringify(appState.seatingGrid?.specialLayout || {})),
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
        this._restoreSnapshot(snapshot);
    },

    _redo() {
        if (this._redoStack.length === 0 || this._isLocked) return;
        this._undoStack.push(this._captureSnapshot());
        const snapshot = this._redoStack.pop();
        this._restoreSnapshot(snapshot);
    },

    _restoreSnapshot(snapshot) {
        this._gridState = snapshot.gridState;
        if (appState.seatingGrid) {
            appState.seatingGrid.specialLayout = snapshot.specialLayout;
            if (snapshot.rows) appState.seatingGrid.rows = snapshot.rows;
            if (snapshot.cols) appState.seatingGrid.cols = snapshot.cols;
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

        this._render();
        this._savePositionsToState();
        this._saveGridConfig();
        this._staggerCellEntrance();
    },

    _updateUndoRedoButtons() {
        const undoBtn = document.getElementById('scUndoBtn');
        const redoBtn = document.getElementById('scRedoBtn');
        if (undoBtn) undoBtn.disabled = this._undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = this._redoStack.length === 0;
    },

    // ========================================================================
    // PERSISTENCE
    // ========================================================================

    _loadPositionsFromState() {
        const rows = this._getRows();
        const cols = this._getCols();
        this._initGrid(rows, cols);

        this._students.forEach(s => {
            const pos = s.seatingPosition;
            if (pos?.row != null && pos?.col != null &&
                pos.row < rows && pos.col < cols && !this._gridState[pos.row][pos.col]) {
                this._gridState[pos.row][pos.col] = s.id;
            }
        });
    },

    _savePositionsToState() {
        const placed = this._getPlacedMap();

        this._students.forEach(s => {
            const result = appState.generatedResults?.find(r => r.id === s.id);
            if (!result) return;

            const pos = placed[s.id];
            result.seatingPosition = pos
                ? { row: pos.row, col: pos.col, pinned: result.seatingPosition?.pinned || false }
                : null;
            result._lastModified = Date.now();
        });

        StorageManager.saveAppState();
    },

    // ========================================================================
    // RENDERING
    // ========================================================================

    _render() {
        this._renderGrid();
        this._renderSidebar();
        this._updateFooter();
        this._updateSidebarLockState();
        this._updateUndoRedoButtons();
        TooltipsUI.initTooltips();
    },

    _renderGrid() {
        const container = document.getElementById('scGridContainer');
        if (!container) return;

        const rows = this._getRows();
        const cols = this._getCols();
        this._studentMap = new Map(this._students.map(s => [s.id, s]));

        container.style.gridTemplateColumns = `repeat(${cols}, var(--sc-cell-w, 80px))`;
        container.style.gridTemplateRows = `repeat(${rows}, var(--sc-cell-h, 88px))`;
        container.innerHTML = '';

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                container.appendChild(this._createCell(r, c));
            }
        }
    },

    _createCell(row, col) {
        const cell = document.createElement('div');
        cell.className = 'sc-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        const resultId = this._gridState[row]?.[col];
        const student = resultId ? this._studentMap?.get(resultId) ?? null : null;

        if (student) {
            cell.dataset.resultId = student.id;
            const isPinned = student.seatingPosition?.pinned || false;
            cell.classList.add('occupied');
            if (isPinned) cell.classList.add('pinned');
            cell.draggable = !this._isLocked && !isPinned;

            cell.innerHTML = `
                ${StudentPhotoManager.getAvatarHTML(student, 'sm')}
                <span class="sc-cell-name">${student.prenom || ''} ${(student.nom || '')[0] || ''}.</span>
                <button class="sc-cell-remove" data-result-id="${student.id}" aria-label="Retirer" data-tooltip="Retirer">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
                <button class="sc-cell-pin" data-result-id="${student.id}" aria-label="${isPinned ? 'Détacher' : 'Fixer'}" data-tooltip="${isPinned ? 'Détacher' : 'Fixer'}">
                    <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon>
                </button>
                ${this._getEvolutionDotHTML(student)}
            `;

            cell.addEventListener('click', (e) => {
                if (e.target.closest('.sc-cell-remove') || e.target.closest('.sc-cell-pin')) return;
                if (this._isLocked) {
                    FocusPanelManager.open(student.id);
                } else if (!isPinned) {
                    if (e.shiftKey && this._lastSelectedGridPos) {
                        this._selectGridRange(this._lastSelectedGridPos.row, this._lastSelectedGridPos.col, row, col);
                    } else {
                        this._toggleChipSelection(student.id);
                        this._lastSelectedGridPos = { row, col };
                    }
                }
            });

            cell.querySelector('.sc-cell-remove')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeFromCell(row, col);
            });

            cell.querySelector('.sc-cell-pin')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._togglePin(student.id);
            });

            if (!this._isLocked && !isPinned) {
                cell.addEventListener('dragstart', (e) => {
                    const isSelected = this._selectedChipIds.includes(student.id);
                    if (!isSelected) {
                        this._clearSelection();
                        this._dragSource = { type: 'cell', resultId: student.id, row, col };
                        e.dataTransfer.setData('text/plain', student.id);
                    } else {
                        this._dragSource = { type: 'multi-cell', ids: [...this._selectedChipIds] };
                        e.dataTransfer.setData('text/plain', 'multi');
                    }
                    e.dataTransfer.effectAllowed = 'move';
                    this._setCleanDragImage(e, cell, isSelected ? this._selectedChipIds.length : 1);
                    requestAnimationFrame(() => cell.classList.add('dragging'));
                });

                cell.addEventListener('dragend', () => {
                    cell.classList.remove('dragging');
                    this._dragSource = null;
                });

                this._addTouchDrag(cell, { type: 'cell', resultId: student.id, row, col });
            }
        } else {
            cell.classList.add('empty');
            
            const isSpecial = appState.seatingGrid?.specialLayout?.[`${row},${col}`];
            if (isSpecial) {
                cell.classList.add(`sc-cell-special-${isSpecial}`);
                if (isSpecial === 'aesh') {
                    cell.innerHTML = `
                        <iconify-icon icon="solar:user-speak-rounded-linear" class="sc-special-icon"></iconify-icon>
                        <span class="sc-cell-name">AESH</span>
                    `;
                } else if (isSpecial === 'blocked') {
                    cell.innerHTML = `
                        <iconify-icon icon="solar:forbidden-circle-linear" class="sc-special-icon"></iconify-icon>
                        <span class="sc-cell-name">Condamné</span>
                    `;
                }
            }

            const totalRows = this._getRows();
            cell.style.setProperty('--row-depth', totalRows > 1 ? row / (totalRows - 1) : 0.5);

            const tools = document.createElement('div');
            tools.className = 'sc-cell-special-tools';
            if (!isSpecial) {
                tools.innerHTML = `
                    <button class="sc-special-btn" data-type="aisle" data-tooltip="Allée (Vide)" aria-label="Allée (Vide)"><iconify-icon icon="solar:ghost-linear"></iconify-icon></button>
                    <button class="sc-special-btn" data-type="aesh" data-tooltip="Place AESH" aria-label="Place AESH"><iconify-icon icon="solar:user-speak-rounded-linear"></iconify-icon></button>
                    <button class="sc-special-btn" data-type="blocked" data-tooltip="Condamné" aria-label="Condamné"><iconify-icon icon="solar:forbidden-circle-linear"></iconify-icon></button>
                `;
            } else {
                tools.innerHTML = `
                    <button class="sc-special-btn" data-type="normal" data-tooltip="Rétablir" aria-label="Rétablir"><iconify-icon icon="solar:refresh-linear"></iconify-icon></button>
                `;
            }
            cell.appendChild(tools);

            tools.addEventListener('click', (e) => {
                e.stopPropagation();
                const btn = e.target.closest('.sc-special-btn');
                if (!btn) return;
                const type = btn.dataset.type;
                this._setCellSpecialType(row, col, type === 'normal' ? null : type);
            });

            cell.addEventListener('click', () => {
                if (this._isLocked || this._selectedChipIds.length === 0 || isSpecial) return;
                this._placeSelectedAt(row, col);
            });
        }

        cell.addEventListener('dragover', (e) => {
            if (this._isLocked) return;
            const isSpecial = !student && appState.seatingGrid?.specialLayout?.[`${row},${col}`];
            if (isSpecial) return;
            
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cell.classList.add('drag-over');
        });

        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));

        cell.addEventListener('drop', (e) => {
            if (this._isLocked) return;
            e.preventDefault();
            cell.classList.remove('drag-over');
            this._handleDrop(row, col);
        });

        return cell;
    },

    _getEvolutionDotHTML(student) {
        const evo = student.evolution;
        if (!evo) return '';

        const cls = evo === 'up' ? 'progress'
            : (evo === 'stable' || evo === 'equal') ? 'stable'
            : evo === 'down' ? 'regression'
            : '';

        return cls ? `<div class="sc-evolution-dot ${cls}"></div>` : '';
    },

    _renderSidebar(returningId) {
        const list = document.getElementById('scStudentList');
        if (!list) return;

        const unplaced = this._getUnplacedStudents();
        const searchTerm = (document.getElementById('scSearchInput')?.value || '').toLowerCase();

        const filtered = searchTerm
            ? unplaced.filter(s => `${s.prenom} ${s.nom}`.toLowerCase().includes(searchTerm))
            : unplaced;

        list.innerHTML = filtered.length === 0
            ? `<div class="sc-empty-sidebar ${unplaced.length === 0 ? 'sc-empty-success' : ''}">
                 ${unplaced.length === 0 
                    ? `<div class="sc-empty-text"><strong>Bravo !</strong> Votre plan de classe est complet !</div>`
                    : 'Aucun résultat'}
               </div>`
            : filtered.map(s => `
                <div class="sc-student-chip" draggable="true" data-result-id="${s.id}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                    <span class="sc-student-chip-name">${s.prenom || ''} ${s.nom || ''}</span>
                </div>
            `).join('');

        // Attach listeners regardless of lock state — sidebar is pointer-events: none when locked anyway
        list.querySelectorAll('.sc-student-chip').forEach((chip, index) => {
            const id = chip.dataset.resultId;

            chip.addEventListener('dragstart', (e) => {
                const isSelected = this._selectedChipIds.includes(id);
                if (!isSelected) {
                    this._clearSelection();
                    this._dragSource = { type: 'sidebar', resultId: id };
                    e.dataTransfer.setData('text/plain', id);
                } else {
                    this._dragSource = { type: 'multi-cell', ids: [...this._selectedChipIds] };
                    e.dataTransfer.setData('text/plain', 'multi');
                }
                e.dataTransfer.effectAllowed = 'move';
                this._setCleanDragImage(e, chip, isSelected ? this._selectedChipIds.length : 1);
                requestAnimationFrame(() => chip.classList.add('dragging'));
            });

            chip.addEventListener('dragend', () => {
                chip.classList.remove('dragging');
                this._dragSource = null;
            });

            chip.addEventListener('click', (e) => {
                if (e.defaultPrevented) return;
                if (e.shiftKey && this._lastSelectedSidebarIndex !== null) {
                    this._selectSidebarRange(this._lastSelectedSidebarIndex, index, filtered);
                } else {
                    this._toggleChipSelection(id);
                    this._lastSelectedSidebarIndex = index;
                }
            });

            this._addTouchDrag(chip, { type: 'sidebar', resultId: id });
        });

        this._applyChipSelectionUI();

        if (returningId) this._animateSidebarChipReturn(returningId);
    },

    _updateFooter() {
        const total = this._students.length;
        const placed = this._getPlacedIds().size;
        const info = document.getElementById('scFooterInfo');
        if (!info) return;

        const view = document.getElementById('seatingChartView');
        if (view) view.dataset.placedCount = placed;

        const rows = this._getRows();
        const cols = this._getCols();
        const specialLayout = appState.seatingGrid?.specialLayout || {};
        let specialSpotsCount = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (specialLayout[`${r},${c}`]) specialSpotsCount++;
            }
        }
        const availableSeats = Math.max(0, (rows * cols) - specialSpotsCount - placed);

        const prev = this._prevPlacedCount;
        const unplaced = total - placed;

        // --- Sidebar Title Dynamic Progress ---
        const sidebarTitle = document.getElementById('scSidebarTitle');
        if (sidebarTitle) {
            if (total === 0) {
                sidebarTitle.innerHTML = '<span>Élèves non placés</span>';
            } else if (unplaced === 0) {
                sidebarTitle.innerHTML = '<span>Tous les élèves sont placés</span>';
            } else {
                sidebarTitle.innerHTML = `<span>Élèves non placés</span><span class="sc-dynamic-value">${unplaced}</span>`;
            }
        }

        // --- Toolbar Pill Info ---
        if (this._isLocked) {
            info.innerHTML = unplaced > 0
                ? `<span class="sc-unplaced-hint"><iconify-icon icon="solar:danger-triangle-linear"></iconify-icon> <strong>${unplaced}</strong> non placé${unplaced > 1 ? 's' : ''}</span>`
                : `<strong class="sc-dynamic-value">${total}</strong> élève${total > 1 ? 's' : ''}`;
        } else {
            info.innerHTML = `<span class="sc-footer-seats">Places libres : <strong class="sc-dynamic-value">${availableSeats}</strong></span>`;
        }

        if (prev !== placed && prev !== 0) this._animateCounterBump();
        this._prevPlacedCount = placed;

        const fill = document.getElementById('scProgressFill');
        if (fill) {
            const ratio = total > 0 ? (placed / total) * 100 : 0;
            fill.style.width = `${ratio}%`;
            const isFull = placed === total && total > 0;
            fill.dataset.ratio = isFull ? 'full' : '';
            const track = fill.closest('.sc-progress-track');
            if (track) {
                if (isFull) {
                    clearTimeout(this._progressFadeTimer);
                    this._progressFadeTimer = setTimeout(() => track.classList.add('sc-progress-complete'), 2000);
                } else {
                    clearTimeout(this._progressFadeTimer);
                    track.classList.remove('sc-progress-complete');
                }
            }
        }

    },

    // ========================================================================
    // DRAG & DROP — with animation hooks
    // ========================================================================

    _handleDrop(targetRow, targetCol) {
        if (!this._dragSource || this._isLocked) return;

        const { type, resultId, row: srcRow, col: srcCol, ids } = this._dragSource;

        const isTargetSpecial = appState.seatingGrid?.specialLayout?.[`${targetRow},${targetCol}`];
        if (isTargetSpecial) return;

        if (type === 'multi-cell') {
            this._selectedChipIds = ids;
            this._placeSelectedAt(targetRow, targetCol);
            this._dragSource = null;
            return;
        }

        const targetId = this._gridState[targetRow]?.[targetCol];
        if (targetId) {
            const targetStudent = this._students.find(s => s.id === targetId);
            if (targetStudent?.seatingPosition?.pinned) return;
        }

        if (type === 'cell' && targetRow === srcRow && targetCol === srcCol) return;

        this._snapshotGrid();

        const isSwap = type === 'cell' && targetId;

        if (type === 'sidebar') {
            this._gridState[targetRow][targetCol] = resultId;
        } else if (type === 'cell') {
            if (targetId) {
                this._gridState[srcRow][srcCol] = targetId;
                this._gridState[targetRow][targetCol] = resultId;
            } else {
                this._gridState[srcRow][srcCol] = null;
                this._gridState[targetRow][targetCol] = resultId;
            }
        }

        this._dragSource = null;
        this._dismissOnboardingHint();
        this._render();
        this._savePositionsToState();

        if (type === 'sidebar') {
            this._animateCellPlaced(targetRow, targetCol);
        } else if (isSwap) {
            this._animateCellSwap(srcRow, srcCol, targetRow, targetCol);
        } else {
            this._animateCellPlaced(targetRow, targetCol);
        }
    },

    _removeFromCell(row, col) {
        if (this._isLocked) return;
        this._snapshotGrid();

        const removedId = this._gridState[row][col];

        this._animateCellRemove(row, col, () => {
            this._gridState[row][col] = null;
            this._renderGrid();
            this._renderSidebar(removedId);
            this._updateFooter();
            this._updateSidebarLockState();
            this._savePositionsToState();
        });
    },

    // ========================================================================
    // PIN
    // ========================================================================

    _togglePin(resultId) {
        if (this._isLocked) return;
        const result = appState.generatedResults?.find(r => r.id === resultId);
        if (!result?.seatingPosition) return;

        result.seatingPosition.pinned = !result.seatingPosition.pinned;
        result._lastModified = Date.now();

        const student = this._students.find(s => s.id === resultId);
        if (student) student.seatingPosition = { ...result.seatingPosition };

        StorageManager.saveAppState();
        this._render();
    },

    // ========================================================================
    // TOUCH DRAG & DROP
    // ========================================================================

    _addTouchDrag(element, sourceInfo) {
        let startX, startY, hasMoved = false;

        element.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || this._isLocked) return;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            hasMoved = false;
            
            let activeSourceInfo = { ...sourceInfo };
            if (sourceInfo.resultId && this._selectedChipIds.includes(sourceInfo.resultId)) {
                activeSourceInfo = { type: 'multi-cell', ids: [...this._selectedChipIds] };
            } else if (sourceInfo.resultId) {
                this._clearSelection();
            }
            this._touchSourceInfo = activeSourceInfo;
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (!this._touchSourceInfo || this._isLocked) return;
            const touch = e.touches[0];

            if (!hasMoved && (Math.abs(touch.clientX - startX) > 8 || Math.abs(touch.clientY - startY) > 8)) {
                hasMoved = true;
                this._createTouchGhost(element, touch);
            }

            if (hasMoved && this._touchDragEl) {
                e.preventDefault();
                this._touchDragEl.style.left = `${touch.clientX - 30}px`;
                this._touchDragEl.style.top = `${touch.clientY - 30}px`;
                this._highlightCellUnderTouch(touch.clientX, touch.clientY);
            }
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            if (!hasMoved || !this._touchSourceInfo) {
                this._cleanupTouch();
                return;
            }
            const touch = e.changedTouches[0];
            const targetCell = this._getCellUnderPoint(touch.clientX, touch.clientY);
            if (targetCell) {
                this._dragSource = this._touchSourceInfo;
                this._handleDrop(parseInt(targetCell.dataset.row), parseInt(targetCell.dataset.col));
            }
            this._cleanupTouch();
        });
    },

    _createTouchGhost(element, touch) {
        this._removeTouchGhost();
        const ghost = element.cloneNode(true);
        ghost.className = 'sc-touch-ghost';
        ghost.classList.remove('sc-chip-selected');
        ghost.querySelectorAll('.sc-cell-remove, .sc-cell-pin').forEach(el => el.remove());

        if (this._touchSourceInfo?.type === 'multi-cell' && this._touchSourceInfo.ids.length > 1) {
            const badge = document.createElement('div');
            badge.className = 'sc-drag-badge';
            badge.textContent = `+${this._touchSourceInfo.ids.length - 1}`;
            ghost.appendChild(badge);
            ghost.classList.add('sc-drag-multi');
        }

        ghost.style.left = `${touch.clientX - 30}px`;
        ghost.style.top = `${touch.clientY - 30}px`;
        document.body.appendChild(ghost);
        this._touchDragEl = ghost;
    },

    _removeTouchGhost() {
        this._touchDragEl?.remove();
        this._touchDragEl = null;
    },

    _cleanupTouch() {
        this._removeTouchGhost();
        this._touchSourceInfo = null;
        document.querySelectorAll('.sc-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
    },

    _highlightCellUnderTouch(x, y) {
        document.querySelectorAll('.sc-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
        this._getCellUnderPoint(x, y)?.classList.add('drag-over');
    },

    _getCellUnderPoint(x, y) {
        return document.elementsFromPoint(x, y).find(el => el.classList.contains('sc-cell')) || null;
    },

    // ========================================================================
    // ACTIONS — with animation orchestration
    // ========================================================================

    _autoPlace() {
        if (this._isLocked) return;

        const unplaced = this._getUnplacedStudents();
        if (unplaced.length === 0) {
            UI.showNotification('Tous les élèves sont déjà placés.', 'info');
            return;
        }
        this._snapshotGrid();

        const rows = this._getRows();
        const cols = this._getCols();

        // Collecter toutes les places vides dans l'ordre de lecture classique (haut vers bas, gauche vers droite)
        const availableSpots = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!this._gridState[r][c] && !appState.seatingGrid?.specialLayout?.[`${r},${c}`]) {
                    availableSpots.push({ r, c });
                }
            }
        }

        const k = Math.min(availableSpots.length, unplaced.length);
        if (k === 0) return;

        // On prend les K dernières places (les plus proches du bureau au fond)
        const spotsToFill = availableSpots.slice(-k);
        let placed = 0;
        const placedCells = [];

        // On assigne les élèves non placés dans l'ordre alphabétique à ces places
        for (let i = 0; i < k; i++) {
            const spot = spotsToFill[i];
            const student = unplaced[i];
            
            this._gridState[spot.r][spot.c] = student.id;
            placedCells.push({ row: spot.r, col: spot.c, index: placed });
            placed++;
        }

        this._dismissOnboardingHint();
        this._render();
        this._savePositionsToState();

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

        this._scrollToDesk();

        const remaining = unplaced.length - placed;
        if (remaining > 0) {
            UI.showNotification(`${placed} élèves placés. ${remaining} ne rentrent pas — augmentez la grille.`, 'warning');
        }
    },

    /** Shuffles non-pinned students across ALL valid available seats */
    _shuffle() {
        if (this._isLocked) return;
        this._snapshotGrid();

        const rows = this._getRows();
        const cols = this._getCols();
        const movableIds = [];
        const validCells = [];
        const resultsMap = new Map((appState.generatedResults || []).map(x => [x.id, x]));

        // Gather all movable students and all valid places
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const id = this._gridState[r][c];
                const isSpecial = appState.seatingGrid?.specialLayout?.[`${r},${c}`];
                
                if (id) {
                    if (!resultsMap.get(id)?.seatingPosition?.pinned) {
                        movableIds.push(id);
                        validCells.push({ row: r, col: c });
                    }
                } else if (!isSpecial) {
                    validCells.push({ row: r, col: c });
                }
            }
        }

        if (movableIds.length < 2) {
            UI.showNotification('Pas assez d\'élèves à mélanger.', 'info');
            return;
        }

        // Clear the grid cells where movable students currently are
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const id = this._gridState[r][c];
                if (id && !resultsMap.get(id)?.seatingPosition?.pinned) {
                    this._gridState[r][c] = null;
                }
            }
        }

        // Shuffle all valid cells to randomly distribute the students
        for (let i = validCells.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validCells[i], validCells[j]] = [validCells[j], validCells[i]];
        }

        // Assign each movable student a randomly selected cell
        const selectedCells = validCells.slice(0, movableIds.length);
        movableIds.forEach((id, i) => {
            const cell = selectedCells[i];
            this._gridState[cell.row][cell.col] = id;
        });

        this._render();
        this._savePositionsToState();

        requestAnimationFrame(() => {
            selectedCells.forEach(({ row, col }, index) => {
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
    },

    /** Hides native ghost and creates a floating clone that follows the cursor */
    _setCleanDragImage(e, sourceEl, count = 1) {
        const blank = new Image();
        blank.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(blank, 0, 0);

        const clone = sourceEl.cloneNode(true);
        clone.className = 'sc-drag-clone';
        clone.classList.remove('sc-chip-selected');
        clone.querySelectorAll('.sc-cell-remove, .sc-cell-pin').forEach(el => el.remove());

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

        UI.showCustomConfirm(`Retirer les ${placedCount} élèves de la grille ?`, () => {
            this._snapshotGrid();
            const occupiedCells = document.querySelectorAll('#scGridContainer .sc-cell.occupied');
            let delay = 0;

            occupiedCells.forEach(cell => {
                cell.style.setProperty('--cell-i', delay);
                cell.classList.add('sc-cell-removing');
                delay++;
            });

            setTimeout(() => {
                this._initGrid(this._getRows(), this._getCols());
                this._render();
                this._savePositionsToState();
                this._staggerCellEntrance();
            }, Math.min(delay * 30 + 300, 600));
        });
    },

    // ========================================================================
    // HELPERS
    // ========================================================================

    _getCurrentClassStudents() {
        const classId = appState.currentClassId;
        return (appState.generatedResults || [])
            .filter(r => r.classId === classId)
            .map(r => ({
                id: r.id, nom: r.nom, prenom: r.prenom,
                studentPhoto: r.studentPhoto,
                seatingPosition: r.seatingPosition,
                evolution: r.evolution
            }))
            .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`));
    },

    _scrollToDesk() {
        requestAnimationFrame(() => {
            setTimeout(() => {
                const gridArea = document.getElementById('scGridArea');
                if (gridArea) {
                    // Force absolute bottom scroll, bypassing element boundaries to ensure padding is visible
                    gridArea.scrollTo({
                        top: gridArea.scrollHeight + 500,
                        behavior: 'smooth'
                    });
                }
            }, 100); // Slight delay to ensure DOM layout and animations have updated height
        });
    },

    // ========================================================================
    // ONBOARDING — Contextual Ghost Hint (first visit only)
    // ========================================================================

    _maybeShowOnboardingHint() {
        const LS_KEY = 'bulletin_sc_onboarding_seen';
        if (localStorage.getItem(LS_KEY)) return;
        if (this._getPlacedIds().size > 0) return;

        const gridArea = document.getElementById('scGridArea');
        if (!gridArea || gridArea.querySelector('.sc-onboarding-hint')) return;

        const hasConfiguredGrid = !!appState.seatingGrid;

        const hint = document.createElement('div');
        hint.className = 'sc-onboarding-hint';
        hint.innerHTML = `
            <div class="sc-onboarding-hint-text">
                ${!hasConfiguredGrid ? `<div class="sc-hint-settings">Ajustez le plan de la salle <iconify-icon icon="solar:settings-linear"></iconify-icon></div>` : ''}
                <div class="sc-hint-main"><strong>${!hasConfiguredGrid ? 'Puis glissez' : 'Glissez'} un élève</strong> sur un bureau</div>
            </div>
            <div class="sc-onboarding-hint-icon">
                <iconify-icon icon="solar:hand-shake-linear" class="sc-hint-hand"></iconify-icon>
            </div>
        `;

        hint.addEventListener('click', () => this._dismissOnboardingHint());
        gridArea.appendChild(hint);

        if (!hasConfiguredGrid) {
            document.getElementById('scConfigBtn')?.classList.add('sc-has-pulse');
        }
    },

    _dismissOnboardingHint() {
        const hint = document.querySelector('.sc-onboarding-hint');
        if (!hint || hint.classList.contains('sc-hint-exiting')) return;

        localStorage.setItem('bulletin_sc_onboarding_seen', '1');
        hint.classList.add('sc-hint-exiting');

        const cleanup = () => hint.remove();
        hint.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, 400);
    }
};
