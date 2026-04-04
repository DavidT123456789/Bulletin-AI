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
import { UI } from './UIManager.js';

const DEFAULT_COLS = 6;
const DEFAULT_ROWS = 5;

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
        if (document.getElementById('seatingChartView')) return;

        const mainContent = document.querySelector('.main-content .output-section');
        if (!mainContent) return;

        const view = document.createElement('div');
        view.id = 'seatingChartView';
        view.style.display = 'none';
        view.innerHTML = `
            <div class="sc-toolbar">
                <div class="sc-toolbar-info" id="scFooterInfo"><strong>0</strong>/0 placés <span class="sc-edit-hint">— Glissez les élèves pour les placer</span></div>
                <div class="sc-toolbar-spacer"></div>
                <button class="sc-toolbar-btn sc-lock-btn" id="scLockBtn" aria-label="Verrouiller">
                    <iconify-icon icon="solar:lock-unlocked-linear"></iconify-icon>
                    <span>Édition</span>
                </button>
                <button class="sc-toolbar-btn sc-auto-place-btn" id="scAutoPlaceBtn" aria-label="Placement automatique">
                    <iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>
                    <span>Placer auto</span>
                </button>
                <div class="sc-config-wrapper">
                    <button class="sc-toolbar-btn sc-config-trigger" id="scConfigBtn" aria-label="Configuration grille">
                        <iconify-icon icon="solar:settings-linear"></iconify-icon>
                        <span>Grille</span>
                    </button>
                    <div class="sc-config-popover" id="scConfigPopover">
                        <div class="sc-config-row">
                            <label class="sc-config-label" for="scColsSlider">Colonnes</label>
                            <input type="range" id="scColsSlider" min="2" max="10" value="${DEFAULT_COLS}">
                            <span class="sc-config-value" id="scColsValue">${DEFAULT_COLS}</span>
                        </div>
                        <div class="sc-config-row">
                            <label class="sc-config-label" for="scRowsSlider">Rangées</label>
                            <input type="range" id="scRowsSlider" min="2" max="8" value="${DEFAULT_ROWS}">
                            <span class="sc-config-value" id="scRowsValue">${DEFAULT_ROWS}</span>
                        </div>
                    </div>
                </div>
                <button class="sc-toolbar-btn sc-reset-btn" id="scClearBtn" aria-label="Réinitialiser">
                    <iconify-icon icon="solar:restart-linear"></iconify-icon>
                    <span>Réinitialiser</span>
                </button>
                <button class="sc-toolbar-btn sc-print-btn" id="scPrintBtn" aria-label="Imprimer">
                    <iconify-icon icon="solar:printer-linear"></iconify-icon>
                    <span>Imprimer</span>
                </button>
            </div>
            <div class="sc-body">
                <div class="sc-sidebar" id="scSidebar">
                    <div class="sc-sidebar-header">
                        <div class="sc-sidebar-title">Élèves non placés</div>
                        <div class="sc-search-box">
                            <iconify-icon icon="solar:magnifer-linear"></iconify-icon>
                            <input type="text" id="scSearchInput" placeholder="Filtrer…" autocomplete="off">
                        </div>
                    </div>
                    <div class="sc-student-list" id="scStudentList"></div>
                </div>
                <div class="sc-grid-area" id="scGridArea">

                    <div class="sc-grid-container" id="scGridContainer"></div>
                    <div class="sc-desk-row">
                        <div class="sc-desk" id="scDesk">
                            <iconify-icon icon="solar:square-academic-cap-linear"></iconify-icon>
                            Bureau
                        </div>
                    </div>
                </div>
            </div>
        `;

        mainContent.appendChild(view);
    },

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    _setupEventListeners() {
        document.getElementById('scPrintBtn')?.addEventListener('click', () => window.print());
        document.getElementById('scClearBtn')?.addEventListener('click', () => this._clearAll());
        document.getElementById('scAutoPlaceBtn')?.addEventListener('click', () => this._autoPlace());
        document.getElementById('scLockBtn')?.addEventListener('click', () => this._toggleLock());

        document.getElementById('scConfigBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleConfigPopover();
        });

        document.getElementById('scColsSlider')?.addEventListener('input', (e) => {
            document.getElementById('scColsValue').textContent = e.target.value;
            this._onGridConfigChange();
        });

        document.getElementById('scRowsSlider')?.addEventListener('input', (e) => {
            document.getElementById('scRowsValue').textContent = e.target.value;
            this._onGridConfigChange();
        });

        document.getElementById('scSearchInput')?.addEventListener('input', () => this._renderSidebar());

        document.getElementById('viewToggle')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-toggle-btn');
            if (!btn) return;
            this.switchToView(btn.dataset.view === 'plan' ? 'plan' : 'list');
        });

        document.addEventListener('click', (e) => {
            if (this._configPopoverOpen && !e.target.closest('.sc-config-wrapper')) {
                this._closeConfigPopover();
            }
        });
    },

    // ========================================================================
    // CONFIG POPOVER
    // ========================================================================

    _toggleConfigPopover() {
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
            viewEl.dataset.locked = this._isLocked;
            this._loadGridConfig();
            this._loadPositionsFromState();
            this._render();
            this._animateViewEnter(viewEl);
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

        // Data updating synchronously — ClassUIManager handles the blur animation timing
        this._students = this._getCurrentClassStudents();
        this._loadGridConfig();
        this._loadPositionsFromState();
        this._render();
        this._staggerCellEntrance();
        
        const desk = document.getElementById('scDesk');
        desk?.classList.add('sc-desk-entering');
        setTimeout(() => desk?.classList.remove('sc-desk-entering'), 500);
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

        const done = () => {
            viewEl.classList.remove('sc-exiting');
            onComplete();
        };
        viewEl.addEventListener('animationend', done, { once: true });
        setTimeout(done, 350);
    },

    /** Class switch — grid crossfade with blur */
    _animateClassSwitch(onMidpoint) {
        const gridArea = document.getElementById('scGridArea');
        if (!gridArea) { onMidpoint(); return; }

        gridArea.classList.add('sc-class-switching');

        setTimeout(() => {
            onMidpoint();

            const desk = document.getElementById('scDesk');
            desk?.classList.add('sc-desk-entering');
            setTimeout(() => desk?.classList.remove('sc-desk-entering'), 500);
        }, 200);

        const cleanup = () => gridArea.classList.remove('sc-class-switching');
        gridArea.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, 600);
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
        const done = () => {
            cell.classList.remove('sc-cell-removing');
            onComplete();
        };
        cell.addEventListener('animationend', done, { once: true });
        setTimeout(done, 350);
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

    /** Counter bump when placed count changes */
    _animateCounterBump() {
        const info = document.getElementById('scFooterInfo');
        if (!info) return;
        info.classList.remove('sc-counter-bump');
        void info.offsetWidth;
        info.classList.add('sc-counter-bump');
        info.addEventListener('animationend', () => info.classList.remove('sc-counter-bump'), { once: true });
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

        view.dataset.locked = this._isLocked;
        btn.classList.toggle('locked', this._isLocked);
        btn.innerHTML = this._isLocked
            ? '<iconify-icon icon="solar:lock-linear"></iconify-icon><span>Verrouillé</span>'
            : '<iconify-icon icon="solar:lock-unlocked-linear"></iconify-icon><span>Édition</span>';

        if (this._isLocked) this._closeConfigPopover();
        this._render();
        this._updateSidebarLockState();
        this._animateLockMorph();
    },

    /** Smart sidebar collapse: only full-collapse when ALL students placed */
    _updateSidebarLockState() {
        const view = document.getElementById('seatingChartView');
        if (!view) return;
        const allPlaced = this._getUnplacedStudents().length === 0;
        view.dataset.allPlaced = allPlaced;
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
            cols: this._getCols()
        };
        StorageManager.saveAppState();
    },

    _onGridConfigChange() {
        const rows = this._getRows();
        const cols = this._getCols();
        const placed = this._getPlacedMap();
        this._initGrid(rows, cols);

        for (const [resultId, pos] of Object.entries(placed)) {
            if (pos.row < rows && pos.col < cols) {
                this._gridState[pos.row][pos.col] = resultId;
            }
        }

        this._render();
        this._staggerCellEntrance();
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
    },

    _renderGrid() {
        const container = document.getElementById('scGridContainer');
        if (!container) return;

        const rows = this._getRows();
        const cols = this._getCols();

        container.style.gridTemplateColumns = `repeat(${cols}, 80px)`;
        container.style.gridTemplateRows = `repeat(${rows}, 88px)`;
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
        const student = resultId ? this._students.find(s => s.id === resultId) : null;

        if (student) {
            const isPinned = student.seatingPosition?.pinned || false;
            cell.classList.add('occupied');
            if (isPinned) cell.classList.add('pinned');
            cell.draggable = !this._isLocked && !isPinned;

            cell.innerHTML = `
                ${StudentPhotoManager.getAvatarHTML(student, 'sm')}
                <span class="sc-cell-name">${student.prenom || ''} ${(student.nom || '')[0] || ''}.</span>
                <button class="sc-cell-remove" data-result-id="${student.id}" aria-label="Retirer">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
                <button class="sc-cell-pin" data-result-id="${student.id}" aria-label="${isPinned ? 'Détacher' : 'Fixer'}">
                    <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon>
                </button>
                ${this._getEvolutionDotHTML(student)}
            `;

            cell.addEventListener('click', (e) => {
                if (e.target.closest('.sc-cell-remove') || e.target.closest('.sc-cell-pin')) return;
                FocusPanelManager.open(student.id);
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
                    this._dragSource = { type: 'cell', resultId: student.id, row, col };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', student.id);
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
        }

        cell.addEventListener('dragover', (e) => {
            if (this._isLocked) return;
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
        const result = appState.generatedResults?.find(r => r.id === student.id);
        const evo = result?.evolution;
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
            ? `<div class="sc-empty-sidebar">
                 ${unplaced.length === 0 ? 'Tous les élèves sont placés ✓' : 'Aucun résultat'}
               </div>`
            : filtered.map(s => `
                <div class="sc-student-chip" draggable="true" data-result-id="${s.id}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                    <span class="sc-student-chip-name">${s.prenom || ''} ${s.nom || ''}</span>
                </div>
            `).join('');

        if (this._isLocked) return;

        list.querySelectorAll('.sc-student-chip').forEach(chip => {
            const id = chip.dataset.resultId;

            chip.addEventListener('dragstart', (e) => {
                this._dragSource = { type: 'sidebar', resultId: id };
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
                requestAnimationFrame(() => chip.classList.add('dragging'));
            });

            chip.addEventListener('dragend', () => {
                chip.classList.remove('dragging');
                this._dragSource = null;
            });

            this._addTouchDrag(chip, { type: 'sidebar', resultId: id });
        });

        if (returningId) this._animateSidebarChipReturn(returningId);
    },

    _updateFooter() {
        const total = this._students.length;
        const placed = this._getPlacedIds().size;
        const info = document.getElementById('scFooterInfo');
        if (!info) return;

        const prev = this._prevPlacedCount;
        info.innerHTML = `<strong>${placed}</strong>/${total} placés <span class="sc-edit-hint">— Glissez les élèves pour les placer</span>`;

        if (prev !== placed && prev !== 0) this._animateCounterBump();
        this._prevPlacedCount = placed;
    },

    // ========================================================================
    // DRAG & DROP — with animation hooks
    // ========================================================================

    _handleDrop(targetRow, targetCol) {
        if (!this._dragSource || this._isLocked) return;

        const { type, resultId, row: srcRow, col: srcCol } = this._dragSource;

        const targetId = this._gridState[targetRow]?.[targetCol];
        if (targetId) {
            const targetStudent = this._students.find(s => s.id === targetId);
            if (targetStudent?.seatingPosition?.pinned) return;
        }

        const isSwap = type === 'cell' && targetId;

        if (type === 'sidebar') {
            this._gridState[targetRow][targetCol] = resultId;
        } else if (type === 'cell') {
            if (targetRow === srcRow && targetCol === srcCol) return;
            if (targetId) {
                this._gridState[srcRow][srcCol] = targetId;
                this._gridState[targetRow][targetCol] = resultId;
            } else {
                this._gridState[srcRow][srcCol] = null;
                this._gridState[targetRow][targetCol] = resultId;
            }
        }

        this._dragSource = null;
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

        const removedId = this._gridState[row][col];

        this._animateCellRemove(row, col, () => {
            this._gridState[row][col] = null;
            this._renderGrid();
            this._renderSidebar(removedId);
            this._updateFooter();
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
            this._touchSourceInfo = sourceInfo;
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
        Object.assign(ghost.style, {
            position: 'fixed',
            left: `${touch.clientX - 30}px`,
            top: `${touch.clientY - 30}px`,
            width: '60px', height: '60px',
            opacity: '0.85', pointerEvents: 'none', zIndex: '9999',
            borderRadius: 'var(--radius-md)', background: 'var(--surface-color)',
            boxShadow: 'var(--shadow-lg)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            transform: 'scale(1.1)', transition: 'transform 0.15s'
        });
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

        const rows = this._getRows();
        const cols = this._getCols();
        let placed = 0;
        const placedCells = [];

        for (const student of unplaced) {
            let done = false;
            for (let r = 0; r < rows && !done; r++) {
                for (let c = 0; c < cols && !done; c++) {
                    if (!this._gridState[r][c]) {
                        this._gridState[r][c] = student.id;
                        placedCells.push({ row: r, col: c, index: placed });
                        done = true;
                        placed++;
                    }
                }
            }
            if (!done) break;
        }

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

        const remaining = unplaced.length - placed;
        if (remaining > 0) {
            UI.showNotification(`${placed} élèves placés. ${remaining} ne rentrent pas — augmentez la grille.`, 'warning');
        }
    },

    _clearAll() {
        if (this._isLocked) return;
        const placedCount = this._getPlacedIds().size;
        if (placedCount === 0) return;

        UI.showCustomConfirm(`Retirer les ${placedCount} élèves de la grille ?`, () => {
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
    }
};
