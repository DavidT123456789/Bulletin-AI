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
import { Utils } from '../utils/Utils.js';
import { ClassManager } from './ClassManager.js';

const DEFAULT_COLS = 6;
const DEFAULT_ROWS = 5;
const MAX_UNDO_LEVELS = 5;

export const SeatingChartManager = {
    _isActive: false,
    _isLocked: false,
    _orientation: 'teacher',
    _gridState: [],
    _students: [],
    _dragSource: null,
    _touchDragEl: null,
    _touchSourceInfo: null,
    _configPopoverOpen: false,
    _placementPopoverOpen: false,
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
        toggle.className = 'ui-segmented-control view-toggle';
        toggle.id = 'viewToggle';
        const activeView = appState.activeView || 'list';
        toggle.innerHTML = `
            <button class="ui-segment view-toggle-btn ${activeView === 'list' ? 'active' : ''}" data-view="list" aria-label="Vue liste">
                <iconify-icon icon="solar:list-linear"></iconify-icon>
                <span>Liste</span>
            </button>
            <button class="ui-segment view-toggle-btn ${activeView === 'plan' ? 'active' : ''}" data-view="plan" aria-label="Vue plan de classe">
                <iconify-icon icon="solar:streets-map-point-linear"></iconify-icon>
                <span>Plan</span>
            </button>
        `;

        headerActions.prepend(toggle);
        if (window.UI && typeof window.UI.initGliders === 'function') {
            window.UI.initGliders();
        }
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
                            <div class="sc-toggle-switch" id="scLockBtn" role="switch" tabindex="0" aria-checked="true" aria-label="Mode Édition">
                                <div class="sc-toggle-knob"></div>
                            </div>
                        </div>
                        <div class="sc-sidebar-actions">
                            <div class="sc-edit-only sc-sidebar-actions-group">
                                <div class="sc-placement-wrapper">
                                    <button class="sc-action-btn sc-auto-place-btn" id="scAutoPlaceBtn" aria-label="Agencer la classe" data-tooltip="Agencer la classe">
                                        <iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>
                                    </button>
                                    <div class="sc-placement-popover" id="scPlacementPopover">
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
                                    </div>
                                </div>
                                <button class="sc-action-btn sc-undo-btn" id="scUndoBtn" aria-label="Annuler" data-tooltip="Annuler" disabled>
                                    <iconify-icon icon="solar:undo-left-round-linear"></iconify-icon>
                                </button>
                                <button class="sc-action-btn sc-redo-btn" id="scRedoBtn" aria-label="Rétablir" data-tooltip="Rétablir" disabled>
                                    <iconify-icon icon="solar:undo-right-round-linear"></iconify-icon>
                                </button>
                                <button class="sc-action-btn sc-orientation-btn" id="scOrientationBtn" aria-label="Vue Prof active (cliquer pour inverser la vue)" data-tooltip="Vue Prof active • Inverser">
                                    <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
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
                            <input type="text" id="scSearchInput" placeholder="Rechercher..." autocomplete="off">
                            <button class="sc-search-clear" id="scSearchClear" aria-label="Effacer" type="button">
                                <iconify-icon icon="ph:x"></iconify-icon>
                            </button>
                        </div>
                    </div>
                    <div class="sc-student-list" id="scStudentList"></div>
                </div>
                <div class="sc-grid-area" id="scGridArea">
                    <!-- Top Status Capsule (Unified: consultation status or edit capacity) -->
                    <div class="sc-floating-status" id="scFloatingStatus">
                        <div class="sc-toolbar-info" id="scFooterInfo"><span class="sc-edit-hint">Calcul des places…</span></div>
                        <div class="sc-status-pill" id="scStatusPill" role="status"></div>
                    </div>

                    <div class="sc-classroom-board" id="scClassroomBoard">
                        <div class="sc-grid-container" id="scGridContainer"></div>
                        <div class="sc-desk-row">
                            <div class="sc-desk" id="scDesk" role="button" tabindex="0" aria-label="Vue Prof active (cliquer pour inverser la vue)" data-tooltip="Vue Prof active • Inverser"><iconify-icon class="sc-desk-cap" icon="solar:square-academic-cap-linear"></iconify-icon><span>Tableau</span></div>
                        </div>
                    </div>
                </div>

                <!-- Floating Actions Capsule (Read-Only Mode) -->
                <div class="sc-floating-actions sc-floating-capsule sc-read-only-only" id="scFloatingActions">
                    <button class="sc-action-btn sc-orientation-btn" id="scFloatingOrientationBtn" aria-label="Vue Prof active (cliquer pour inverser la vue)" data-tooltip="Vue Prof active • Inverser">
                        <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                    </button>
                    <button class="sc-action-btn sc-print-btn" id="scFloatingPrintBtn" aria-label="Imprimer le plan" data-tooltip="Imprimer le plan">
                        <iconify-icon icon="solar:printer-linear"></iconify-icon>
                    </button>
                    <button class="sc-action-btn" id="scUnlockFloatingBtn" aria-label="Mode Édition" data-tooltip="Mode Édition">
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
        document.getElementById('scAutoPlaceBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePlacementPopover();
        });
        document.getElementById('scPlacementPopover')?.addEventListener('click', (e) => {
            const item = e.target.closest('.sc-popover-item');
            if (!item || item.classList.contains('sc-popover-item-disabled')) return;
            const mode = item.dataset.mode;
            if (mode) {
                this._closePlacementPopover();
                this._autoPlace(mode);
            }
        });
        document.getElementById('scShuffleBtn')?.addEventListener('click', () => this._shuffle());
        document.getElementById('scUndoBtn')?.addEventListener('click', () => this._undo());
        document.getElementById('scRedoBtn')?.addEventListener('click', () => this._redo());
        const lockBtn = document.getElementById('scLockBtn');
        lockBtn?.addEventListener('click', () => this._toggleLock());
        lockBtn?.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                this._toggleLock();
            }
        });
        document.getElementById('scUnlockFloatingBtn')?.addEventListener('click', () => this._toggleLock());
        document.getElementById('scOrientationBtn')?.addEventListener('click', () => this._toggleOrientation());
        document.getElementById('scFloatingOrientationBtn')?.addEventListener('click', () => this._toggleOrientation());

        const desk = document.getElementById('scDesk');
        desk?.addEventListener('click', () => this._toggleOrientation());
        desk?.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                this._toggleOrientation();
            }
        });

        document.getElementById('scConfigBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleConfigPopover();
        });

        let isSliding = false;
        const startSlide = () => {
            if (!isSliding) {
                this._snapshotGrid();
                isSliding = true;
            }
        };

        const colsSlider = document.getElementById('scColsSlider');
        colsSlider?.addEventListener('pointerdown', startSlide);
        colsSlider?.addEventListener('keydown', (e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                startSlide();
            }
        });
        colsSlider?.addEventListener('input', (e) => {
            const valEl = document.getElementById('scColsValue');
            if (valEl) valEl.textContent = e.target.value;
        });
        colsSlider?.addEventListener('change', () => {
            isSliding = false;
            this._onGridConfigChange();
        });

        const rowsSlider = document.getElementById('scRowsSlider');
        rowsSlider?.addEventListener('pointerdown', startSlide);
        rowsSlider?.addEventListener('keydown', (e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                startSlide();
            }
        });
        rowsSlider?.addEventListener('input', (e) => {
            const valEl = document.getElementById('scRowsValue');
            if (valEl) valEl.textContent = e.target.value;
        });
        rowsSlider?.addEventListener('change', () => {
            isSliding = false;
            this._onGridConfigChange();
        });

        window.addEventListener('pointerup', () => { isSliding = false; });

        document.getElementById('scSearchInput')?.addEventListener('input', (e) => {
            document.getElementById('scSearchClear')?.classList.toggle('visible', e.target.value.length > 0);
            this._renderSidebar();
        });

        document.getElementById('scSearchInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && e.target.value) {
                e.preventDefault();
                e.stopPropagation();
                e.target.value = '';
                document.getElementById('scSearchClear')?.classList.remove('visible');
                this._renderSidebar();
            }
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
            if (this._placementPopoverOpen && !e.target.closest('.sc-placement-wrapper')) {
                this._closePlacementPopover();
            }
            if (this._selectedChipIds.length > 0 && !e.target.closest('.sc-student-chip') && !e.target.closest('.sc-cell')) {
                this._clearSelection();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this._placementPopoverOpen) this._closePlacementPopover();
                if (this._configPopoverOpen) this._closeConfigPopover();
                if (this._selectedChipIds.length > 0) this._clearSelection();
            }
        });

        const sidebar = document.querySelector('.sc-sidebar');
        if (sidebar) {
            sidebar.addEventListener('dragover', (e) => {
                if (this._isLocked) return;
                if (this._dragSource && (this._dragSource.type === 'cell' || this._dragSource.type === 'multi-cell')) {
                    e.preventDefault();
                    sidebar.classList.add('drag-over');
                }
            });

            sidebar.addEventListener('dragleave', () => {
                sidebar.classList.remove('drag-over');
            });

            sidebar.addEventListener('drop', (e) => {
                if (this._isLocked) return;
                sidebar.classList.remove('drag-over');
                if (this._dragSource && (this._dragSource.type === 'cell' || this._dragSource.type === 'multi-cell')) {
                    e.preventDefault();
                    this._handleRemoveFromSidebarDrop();
                }
            });
        }
    },

    // ========================================================================
    // CONFIG & PLACEMENT POPOVERS
    // ========================================================================

    _togglePlacementPopover() {
        this._placementPopoverOpen ? this._closePlacementPopover() : this._openPlacementPopover();
    },

    _openPlacementPopover() {
        this._closeConfigPopover();
        const popover = document.getElementById('scPlacementPopover');
        if (!popover) return;
        popover.classList.add('open');
        document.getElementById('scAutoPlaceBtn')?.classList.add('active');
        this._placementPopoverOpen = true;
    },

    _closePlacementPopover() {
        const popover = document.getElementById('scPlacementPopover');
        if (!popover) return;
        popover.classList.remove('open');
        document.getElementById('scAutoPlaceBtn')?.classList.remove('active');
        this._placementPopoverOpen = false;
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
        popover.classList.add('open');
        document.getElementById('scConfigBtn')?.classList.add('active');
        this._configPopoverOpen = true;
    },

    _closeConfigPopover() {
        const popover = document.getElementById('scConfigPopover');
        if (!popover) return;
        popover.classList.remove('open');
        document.getElementById('scConfigBtn')?.classList.remove('active');
        this._configPopoverOpen = false;
    },

    // ========================================================================
    // VIEW SWITCHING — with entrance/exit animations
    // ========================================================================

    switchToView(view, options = {}) {
        const { silent = false, immediate = false } = typeof options === 'boolean' ? { silent: options } : options;
        const wrapper = document.querySelector('.main-content-wrapper');
        const viewEl = document.getElementById('seatingChartView');
        const fab = document.getElementById('addStudentFab');
        if (!wrapper || !viewEl) return;

        const isList = view === 'list';

        if (isList) {
            const finishList = () => {
                const wasActive = this._isActive;
                wrapper.dataset.view = 'list';
                viewEl.style.display = 'none';
                if (fab) fab.style.display = '';
                this._isActive = false;
                this._clearSelection();
                if (wasActive) {
                    this._savePositionsToState(true);
                    this._saveGridConfig();
                }
                this._closeConfigPopover();
                this._closePlacementPopover();
            };

            if (immediate) {
                finishList();
            } else {
                this._animateViewExit(viewEl, finishList);
            }
        } else {
            this._students = this._getCurrentClassStudents();
            if (this._students.length === 0) {
                if (!silent) {
                    UI.showNotification('Aucun élève dans cette classe.', 'warning');
                }
                wrapper.dataset.view = 'list';
                if (appState.activeView !== 'list') {
                    appState.activeView = 'list';
                    StorageManager?.saveAppState();
                }
                document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'list'));
                const toggleWrapper = document.getElementById('viewToggle');
                if (toggleWrapper && window.UI && typeof window.UI.updateGlider === 'function') {
                    window.UI.updateGlider(toggleWrapper, immediate);
                }
                return;
            }
            wrapper.dataset.view = 'plan';
            viewEl.style.display = '';
            if (fab) fab.style.display = 'none';
            this._isActive = true;
            this._loadGridConfig();
            this._loadPositionsFromState();
            const currentClass = this._getCurrentClass();
            const hasExplicitClassLock = currentClass && typeof currentClass.seatingLocked === 'boolean';
            const locked = this._getPlacedIds().size === 0
                ? false
                : (hasExplicitClassLock ? currentClass.seatingLocked : (appState.seatingGrid?.locked ?? false));
            this._applyLockState(locked);
            this._undoStack = [];
            this._redoStack = [];
            this._render();
            if (!immediate) {
                this._animateViewEnter(viewEl);
                this._scrollToDesk();
                this._maybeShowOnboardingHint();
            } else {
                this._scrollToDesk();
            }
        }

        if (appState.activeView !== view) {
            appState.activeView = view;
            StorageManager?.saveAppState();
        }

        document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
        
        const toggleWrapper = document.getElementById('viewToggle');
        if (toggleWrapper) {
            if (window.UI && typeof window.UI.updateGlider === 'function') {
                window.UI.updateGlider(toggleWrapper, immediate);
            }
        }
    },

    open() { this.switchToView('plan'); },
    close() { this.switchToView('list'); },

    /** Restaure la dernière vue active (plan ou liste) au chargement de l'application */
    restoreActiveView() {
        const targetView = appState.activeView || 'list';
        const hasResults = ClassManager.getStudentsForClass(appState.currentClassId).length > 0;
        this.updateToggleVisibility(hasResults);

        if (targetView === 'plan' && hasResults) {
            this.switchToView('plan', { silent: true, immediate: true });
        } else {
            if (targetView === 'plan' && !hasResults) {
                appState.activeView = 'list';
            }
            const wrapper = document.querySelector('.main-content-wrapper');
            if (wrapper) wrapper.dataset.view = 'list';
            const viewEl = document.getElementById('seatingChartView');
            if (viewEl) viewEl.style.display = 'none';
            this._isActive = false;
        }
    },

    /** Called when class changes — reload data or revert to list */
    onClassChange(hasResults) {
        this.updateToggleVisibility(hasResults);
        if (!this._isActive) return;

        this._closeConfigPopover();
        this._closePlacementPopover();

        if (!hasResults) {
            this.switchToView('list');
            return;
        }

        this._prevPlacedCount = 0;
        this._students = this._getCurrentClassStudents();
        this._loadGridConfig();
        this._loadPositionsFromState();

        const currentClass = this._getCurrentClass();
        const isVirtual = currentClass?.isVirtual || ClassManager.isVirtualClass(appState.currentClassId);
        
        // Les classes reconstituées sont verrouillées en mode consultation par défaut
        let locked = false;
        if (isVirtual) {
            locked = true;
        } else {
            const hasExplicitClassLock = currentClass && typeof currentClass.seatingLocked === 'boolean';
            locked = this._getPlacedIds().size === 0
                ? false
                : (hasExplicitClassLock ? currentClass.seatingLocked : (appState.seatingGrid?.locked ?? false));
        }
        this._applyLockState(locked);

        this._render();
        this._staggerCellEntrance();
        
        const desk = document.getElementById('scDesk');
        desk?.classList.add('sc-desk-entering');
        setTimeout(() => desk?.classList.remove('sc-desk-entering'), 500);

        this._scrollToDesk();
        this._maybeShowOnboardingHint();
    },

    updateToggleVisibility(hasResults) {
        const toggle = document.getElementById('viewToggle');
        if (toggle) toggle.classList.toggle('visible', hasResults);
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
    _staggerCellEntrance(baseDelay = 0) {
        const cells = document.querySelectorAll('#scGridContainer .sc-cell:not([class*="sc-cell-special-"])');
        cells.forEach((cell, i) => {
            cell.style.setProperty('--cell-i', i);
            if (baseDelay > 0) {
                cell.style.animationDelay = `calc(${baseDelay}ms + ${i * 20}ms)`;
            }
            cell.classList.add('sc-cell-stagger');
        });
        const duration = cells.length * 20 + 400 + baseDelay;
        setTimeout(() => {
            cells.forEach(c => {
                c.classList.remove('sc-cell-stagger');
                c.style.removeProperty('--cell-i');
                c.style.removeProperty('animation-delay');
            });
        }, duration);
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
                if (!this._gridState[currentRow][currentCol] && !this._isSpecialSpot(currentRow, currentCol)) {
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
        this._savePositionsToState();
        this._render();
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

    _applyLockState(locked) {
        this._isLocked = locked;
        const view = document.getElementById('seatingChartView');
        if (view) view.dataset.locked = locked;
        const btn = document.getElementById('scLockBtn');
        if (btn) {
            btn.classList.toggle('locked', locked);
            btn.setAttribute('aria-checked', (!locked).toString());
            btn.setAttribute('aria-label', locked ? 'Déverrouiller pour ajuster' : 'Valider et figer le plan');
            btn.setAttribute('data-tooltip', locked ? 'Déverrouiller pour ajuster' : 'Valider et figer le plan');
        }
        const floatingUnlockBtn = document.getElementById('scUnlockFloatingBtn');
        if (floatingUnlockBtn) {
            floatingUnlockBtn.setAttribute('aria-label', locked ? 'Déverrouiller pour ajuster' : 'Mode Édition');
            floatingUnlockBtn.setAttribute('data-tooltip', locked ? 'Déverrouiller pour ajuster' : 'Mode Édition');
        }
        this._updateCellsDraggability();
    },

    _toggleLock() {
        this._isLocked = !this._isLocked;
        const view = document.getElementById('seatingChartView');
        const btn = document.getElementById('scLockBtn');
        if (!view || !btn) return;

        btn.classList.toggle('locked', this._isLocked);
        btn.setAttribute('aria-checked', (!this._isLocked).toString());
        btn.setAttribute('aria-label', this._isLocked ? 'Déverrouiller pour ajuster' : 'Valider et figer le plan');
        btn.setAttribute('data-tooltip', this._isLocked ? 'Déverrouiller pour ajuster' : 'Valider et figer le plan');
        view.dataset.locked = this._isLocked;

        const floatingUnlockBtn = document.getElementById('scUnlockFloatingBtn');
        if (floatingUnlockBtn) {
            floatingUnlockBtn.setAttribute('aria-label', this._isLocked ? 'Déverrouiller pour ajuster' : 'Mode Édition');
            floatingUnlockBtn.setAttribute('data-tooltip', this._isLocked ? 'Déverrouiller pour ajuster' : 'Mode Édition');
        }

        this._clearSelection();
        if (this._isLocked) {
            this._closeConfigPopover();
            this._dismissOnboardingHint();
        } else {
            this._maybeShowOnboardingHint();
        }

        const currentClass = this._getCurrentClass();
        if (currentClass) {
            const placedCount = this._getPlacedIds().size;
            if (this._isLocked) {
                if (placedCount > 0) {
                    currentClass.seatingLocked = true;
                    currentClass.seatingValidatedAt = Date.now();
                    UI?.showNotification?.('Plan de classe validé et figé', 'success');
                } else {
                    currentClass.seatingLocked = false;
                    UI?.showNotification?.('Mode Consultation', 'info');
                }
            } else {
                currentClass.seatingLocked = false;
                currentClass.seatingUpdatedAt = Date.now();
                UI?.showNotification?.('Mode Édition actif', 'info');
            }
        }

        this._updateSidebarLockState();
        this._updateFooter();

        // Defer non-critical DOM updates to keep the animation at 60/120 FPS
        setTimeout(() => {
            this._saveGridConfig();
            if (!this._isLocked) {
                this._renderGrid();
                this._updateSidebarLockState();
            } else {
                this._updateCellsDraggability();
            }
            TooltipsUI?.initTooltips?.();
            window.dispatchEvent(new CustomEvent('seating-chart:status-changed', {
                detail: { classId: currentClass?.id, locked: this._isLocked }
            }));
        }, 50);
    },

    _updateCellsDraggability() {
        document.querySelectorAll('#scGridContainer .sc-cell.occupied').forEach(cell => {
            const isPinned = cell.classList.contains('pinned');
            cell.draggable = !this._isLocked && !isPinned;
            if (this._isLocked) {
                const student = this._studentMap?.get(cell.dataset.resultId);
                if (student) {
                    cell.setAttribute('data-tooltip', Utils.formatStudentName(student.nom, student.prenom));
                }
            } else {
                cell.removeAttribute('data-tooltip');
            }
        });
    },

    /** Track all-placed state for edit-mode sidebar collapse and auto-place disable */
    _updateSidebarLockState() {
        const view = document.getElementById('seatingChartView');
        if (!view) return;
        const allPlaced = this._getUnplacedStudents().length === 0;
        view.dataset.allPlaced = allPlaced;
    },

    // ========================================================================
    // VIEW ORIENTATION (Teacher ⇄ Student Projection)
    // ========================================================================

    _toggleOrientation() {
        const next = this._orientation === 'student' ? 'teacher' : 'student';
        this._applyOrientation(next, true);
        localStorage.setItem('bulletin_seating_orientation', next);
    },

    _applyOrientation(orientation, animate = false) {
        this._orientation = orientation;
        const view = document.getElementById('seatingChartView');
        if (view) {
            view.dataset.orientation = orientation;
        }

        const isStudent = orientation === 'student';

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
        TooltipsUI.initTooltips();

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

        this._scrollToDesk();
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

        const isStudent = this._orientation === 'student';
        const orientationLabel = isStudent ? ' — Vue Élèves (Projection)' : ' — Vue Enseignant';

        const header = document.createElement('div');
        header.className = 'sc-print-header';
        header.innerHTML = `
            <span class="sc-print-date">${dateStr}</span>
            <span class="sc-print-class">${className}${orientationLabel} <span class="sc-print-count">(${studentCount} élèves)</span></span>
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
        const sliderVal = parseInt(document.getElementById('scRowsSlider')?.value);
        return !isNaN(sliderVal) ? sliderVal : (appState.seatingGrid?.rows ?? DEFAULT_ROWS);
    },

    _getCols() {
        const sliderVal = parseInt(document.getElementById('scColsSlider')?.value);
        return !isNaN(sliderVal) ? sliderVal : (appState.seatingGrid?.cols ?? DEFAULT_COLS);
    },

    _loadGridConfig() {
        const config = appState.seatingGrid;
        const rows = config?.rows || DEFAULT_ROWS;
        const cols = config?.cols || DEFAULT_COLS;
        this._orientation = localStorage.getItem('bulletin_seating_orientation') || config?.orientation || 'teacher';
        this._applyOrientation(this._orientation);

        const rowSlider = document.getElementById('scRowsSlider');
        const colSlider = document.getElementById('scColsSlider');
        if (rowSlider) { rowSlider.value = rows; document.getElementById('scRowsValue').textContent = rows; }
        if (colSlider) { colSlider.value = cols; document.getElementById('scColsValue').textContent = cols; }
    },

    _saveGridConfig() {
        const rows = this._getRows();
        const cols = this._getCols();
        const locked = this._isLocked;
        const currentGrid = appState.seatingGrid;

        const isSame = currentGrid &&
            currentGrid.rows === rows &&
            currentGrid.cols === cols &&
            currentGrid.locked === locked;

        if (isSame) return;

        appState.seatingGrid = {
            rows,
            cols,
            locked,
            specialLayout: currentGrid?.specialLayout || {}
        };
        const currentClass = this._getCurrentClass();
        if (currentClass) {
            currentClass.seatingLocked = locked;
        }
        StorageManager.saveAppState();
    },

    _onGridConfigChange() {
        const newRows = this._getRows();
        const newCols = this._getCols();
        const oldRows = this._gridState ? this._gridState.length : newRows;
        
        // Récupère toutes les positions connues des étudiants (y compris ceux temporairement hors de la grille visible)
        const placed = {};
        this._students.forEach(s => {
            const pos = s.seatingPosition;
            if (pos?.row != null && pos?.col != null) {
                placed[s.id] = { row: pos.row, col: pos.col, pinned: pos.pinned || false };
            }
        });
        if (this._gridState) {
            for (let r = 0; r < this._gridState.length; r++) {
                for (let c = 0; c < this._gridState[r].length; c++) {
                    const id = this._gridState[r][c];
                    if (id) {
                        placed[id] = {
                            row: r,
                            col: c,
                            pinned: placed[id]?.pinned || false
                        };
                    }
                }
            }
        }

        this._initGrid(newRows, newCols);

        // Calcule le décalage pour ajouter/supprimer les rangées par le haut (éloigné du bureau)
        // car le bureau (bottom) est l'origine visuelle.
        const rowOffset = newRows - oldRows;

        // Repositionne les étudiants
        for (const [resultId, pos] of Object.entries(placed)) {
            const newR = pos.row + rowOffset;
            pos.row = newR;
            if (newR >= 0 && newR < newRows && pos.col < newCols) {
                this._gridState[newR][pos.col] = resultId;
            }
        }

        // Repositionne également la cartographie des places spéciales (allées, AESH...)
        // La condition de limites a été sciemment retirée : on conserve les attributs en mémoire
        // même s'ils "tombent" momentanément hors de la grille. S'ils reviennent, ils s'afficheront !
        if (rowOffset !== 0) {
            if (appState.seatingGrid?.specialLayout) {
                const newSpecialLayout = {};
                for (const [key, type] of Object.entries(appState.seatingGrid.specialLayout)) {
                    const [r, c] = key.split(',').map(Number);
                    const newR = r + rowOffset;
                    newSpecialLayout[`${newR},${c}`] = type;
                }
                appState.seatingGrid.specialLayout = newSpecialLayout;
            }

            const classes = appState.classes || [];
            classes.forEach(cls => {
                if (cls?.seatingSpecialLayout) {
                    const newClassSpecial = {};
                    for (const [key, type] of Object.entries(cls.seatingSpecialLayout)) {
                        const [r, c] = key.split(',').map(Number);
                        const newR = r + rowOffset;
                        newClassSpecial[`${newR},${c}`] = type;
                    }
                    cls.seatingSpecialLayout = newClassSpecial;
                }
            });
        }

        this._savePositionsToState(true); // Conserve les coordonnées des élèves temporairement hors-grille
        this._render();
        this._saveGridConfig();
        this._staggerCellEntrance();
    },

    _getCurrentClass() {
        const classId = appState.currentClassId;
        if (!classId) return null;
        return ClassManager.getClassById(classId) || (appState.classes || []).find(c => c.id === classId) || null;
    },

    _getCellSpecial(row, col) {
        const key = `${row},${col}`;
        // 1. Structure globale (salle entière : allée, place condamnée salle, legacy)
        const globalType = appState.seatingGrid?.specialLayout?.[key];
        if (globalType) return { type: globalType, scope: 'global' };

        // 2. Dispositif spécifique à la classe en cours (place AESH, place condamnée classe)
        const currentClass = this._getCurrentClass();
        const classType = currentClass?.seatingSpecialLayout?.[key];
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

        if (!type) {
            // Rétablir : libérer des deux niveaux (global et classe)
            if (appState.seatingGrid?.specialLayout) {
                delete appState.seatingGrid.specialLayout[key];
            }
            if (currentClass?.seatingSpecialLayout) {
                delete currentClass.seatingSpecialLayout[key];
            }
        } else if (type === 'aisle') {
            // Allée : structure physique de la salle (salle entière / global)
            if (!appState.seatingGrid) appState.seatingGrid = {};
            if (!appState.seatingGrid.specialLayout) appState.seatingGrid.specialLayout = {};
            appState.seatingGrid.specialLayout[key] = 'aisle';
            if (currentClass?.seatingSpecialLayout) {
                delete currentClass.seatingSpecialLayout[key];
            }
        } else if (type === 'aesh') {
            // AESH : spécifique à la classe en cours
            if (currentClass) {
                if (!currentClass.seatingSpecialLayout) currentClass.seatingSpecialLayout = {};
                currentClass.seatingSpecialLayout[key] = 'aesh';
                if (appState.seatingGrid?.specialLayout?.[key]) {
                    delete appState.seatingGrid.specialLayout[key];
                }
            } else {
                if (!appState.seatingGrid) appState.seatingGrid = {};
                if (!appState.seatingGrid.specialLayout) appState.seatingGrid.specialLayout = {};
                appState.seatingGrid.specialLayout[key] = 'aesh';
            }
        } else if (type === 'blocked') {
            // Condamné : spécifique à la classe en cours par défaut
            if (currentClass) {
                if (!currentClass.seatingSpecialLayout) currentClass.seatingSpecialLayout = {};
                currentClass.seatingSpecialLayout[key] = 'blocked';
                if (appState.seatingGrid?.specialLayout?.[key]) {
                    delete appState.seatingGrid.specialLayout[key];
                }
            } else {
                if (!appState.seatingGrid) appState.seatingGrid = {};
                if (!appState.seatingGrid.specialLayout) appState.seatingGrid.specialLayout = {};
                appState.seatingGrid.specialLayout[key] = 'blocked';
            }
        }

        this._saveGridConfig();
        this._render();
    },

    _toggleBlockedScope(row, col) {
        this._snapshotGrid();
        const key = `${row},${col}`;
        const currentClass = this._getCurrentClass();
        const className = currentClass?.name || 'la classe';

        const isGlobal = !!appState.seatingGrid?.specialLayout?.[key];
        const isClass = !!currentClass?.seatingSpecialLayout?.[key];

        if (isClass) {
            // Passer en portée globale (toutes les classes / salle)
            delete currentClass.seatingSpecialLayout[key];
            if (!appState.seatingGrid) appState.seatingGrid = {};
            if (!appState.seatingGrid.specialLayout) appState.seatingGrid.specialLayout = {};
            appState.seatingGrid.specialLayout[key] = 'blocked';
            UI.showNotification('Place condamnée pour toutes les classes (salle)', 'info');
        } else if (isGlobal) {
            // Restreindre à la classe en cours
            delete appState.seatingGrid.specialLayout[key];
            if (currentClass) {
                if (!currentClass.seatingSpecialLayout) currentClass.seatingSpecialLayout = {};
                currentClass.seatingSpecialLayout[key] = 'blocked';
                UI.showNotification(`Place condamnée pour ${className} uniquement`, 'info');
            } else {
                UI.showNotification('Aucune classe active sélectionnée', 'warning');
                return;
            }
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
            row.forEach((val, c) => {
                if (Array.isArray(val)) {
                    val.forEach(id => { if (id) map[id] = { row: r, col: c }; });
                } else if (val) {
                    map[val] = { row: r, col: c };
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

    _getUnplacedStudents() {
        const placedIds = this._getPlacedIds();
        return this._students.filter(s => !placedIds.has(s.id));
    },

    // ========================================================================
    // UNDO / REDO (Full-snapshot, two-stack)
    // ========================================================================

    _captureSnapshot() {
        const currentClass = this._getCurrentClass();
        return {
            gridState: this._gridState.map(row => [...row]),
            specialLayout: JSON.parse(JSON.stringify(appState.seatingGrid?.specialLayout || {})),
            classSpecialLayout: currentClass?.seatingSpecialLayout
                ? JSON.parse(JSON.stringify(currentClass.seatingSpecialLayout))
                : {},
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

        const currentClass = this._getCurrentClass();
        if (currentClass) {
            currentClass.seatingSpecialLayout = snapshot.classSpecialLayout
                ? JSON.parse(JSON.stringify(snapshot.classSpecialLayout))
                : {};
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
        this._initGrid(rows, cols);

        this._students.forEach(s => {
            const pos = s.seatingPosition;
            if (pos?.row != null && pos?.col != null &&
                pos.row < rows && pos.col < cols &&
                !this._isSpecialSpot(pos.row, pos.col)) {
                const existing = this._gridState[pos.row][pos.col];
                if (!existing) {
                    this._gridState[pos.row][pos.col] = s.id;
                } else if (Array.isArray(existing)) {
                    if (!existing.includes(s.id)) existing.push(s.id);
                } else if (existing !== s.id) {
                    this._gridState[pos.row][pos.col] = [existing, s.id];
                }
            }
        });
    },

    _savePositionsToState(preserveOutOfBounds = false) {
        const placed = this._getPlacedMap();
        let anyChanged = false;

        this._students.forEach(s => {
            const result = appState.generatedResults?.find(r => r.id === s.id);
            if (!result) return;

            const pos = placed[s.id];
            let newPos = null;
            if (pos) {
                newPos = {
                    row: pos.row,
                    col: pos.col,
                    pinned: result.seatingPosition?.pinned || false
                };
            } else if (preserveOutOfBounds && result.seatingPosition) {
                newPos = result.seatingPosition;
            }

            const oldPos = result.seatingPosition;
            const changed = (!oldPos && newPos) ||
                (oldPos && !newPos) ||
                (oldPos && newPos && (oldPos.row !== newPos.row || oldPos.col !== newPos.col || (oldPos.pinned || false) !== (newPos.pinned || false)));

            if (changed) {
                anyChanged = true;
                result.seatingPosition = newPos;
                result._lastModified = Date.now();
                s.seatingPosition = newPos;
            }
        });

        if (anyChanged) {
            const currentClass = this._getCurrentClass();
            if (currentClass) {
                currentClass.seatingUpdatedAt = Date.now();
            }
            StorageManager.saveAppState();
        }
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

        if (this._getPlacedIds().size > 0 || this._isLocked) {
            this._dismissOnboardingHint();
        } else {
            this._maybeShowOnboardingHint();
        }
    },

    _renderGrid() {
        const container = document.getElementById('scGridContainer');
        if (!container) return;

        const rows = this._getRows();
        const cols = this._getCols();
        this._studentMap = new Map(this._students.map(s => [s.id, s]));

        container.style.gridTemplateColumns = `repeat(${cols}, var(--sc-cell-w, 88px))`;
        container.style.gridTemplateRows = `repeat(${rows}, var(--sc-cell-h, 96px))`;
        container.innerHTML = '';

        const isStudent = this._orientation === 'student';
        for (let displayR = 0; displayR < rows; displayR++) {
            for (let displayC = 0; displayC < cols; displayC++) {
                const r = isStudent ? (rows - 1 - displayR) : displayR;
                const c = isStudent ? (cols - 1 - displayC) : displayC;
                container.appendChild(this._createCell(r, c));
            }
        }
    },

    _createCell(row, col) {
        const cell = document.createElement('div');
        cell.className = 'sc-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        const cellContent = this._gridState[row]?.[col];
        const studentIds = Array.isArray(cellContent) ? cellContent : (cellContent ? [cellContent] : []);
        const students = studentIds.map(id => this._studentMap?.get(id)).filter(Boolean);

        if (students.length === 1) {
            const student = students[0];
            cell.dataset.resultId = student.id;
            const isPinned = student.seatingPosition?.pinned || false;
            cell.classList.add('occupied');
            if (isPinned) cell.classList.add('pinned');
            cell.draggable = !this._isLocked && !isPinned;
            if (this._isLocked) {
                cell.setAttribute('data-tooltip', Utils.formatStudentName(student.nom, student.prenom));
            }

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
        } else if (students.length > 1) {
            // Empilement moderne pour plusieurs élèves sur la même place (ex: classe reconstituée)
            cell.classList.add('occupied', 'sc-cell-stacked');
            cell.dataset.resultId = students[0].id;

            const tooltipNames = students.map(s => Utils.formatStudentName(s.nom, s.prenom)).join(' • ');
            cell.setAttribute('data-tooltip', tooltipNames);

            const avatarsHtml = students.map((s, idx) => `
                <div class="sc-stacked-avatar" style="--stack-index: ${idx}; z-index: ${students.length - idx};" data-result-id="${s.id}" title="${Utils.formatStudentName(s.nom, s.prenom)}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                </div>
            `).join('');

            const namesHtml = students.map(s => `
                <span class="sc-stacked-name" data-result-id="${s.id}" title="${Utils.formatStudentName(s.nom, s.prenom)}">${s.prenom || ''} ${(s.nom || '')[0] || ''}.</span>
            `).join('');

            cell.innerHTML = `
                <div class="sc-stacked-avatar-cluster">
                    ${avatarsHtml}
                    <span class="sc-stacked-count-pill">${students.length}</span>
                </div>
                <div class="sc-stacked-names-list">
                    ${namesHtml}
                </div>
            `;

            // Clic sur la cellule ou un élève spécifique ouvre le FocusPanel
            cell.addEventListener('click', (e) => {
                const targetStudentEl = e.target.closest('[data-result-id]');
                const targetId = targetStudentEl?.dataset?.resultId || students[0].id;
                FocusPanelManager.open(targetId);
            });
        } else {
            cell.classList.add('empty');
            
            const special = this._getCellSpecial(row, col);
            if (special) {
                cell.classList.add(`sc-cell-special-${special.type}`);
                cell.classList.add(`sc-cell-scope-${special.scope}`);
                if (special.type === 'aesh') {
                    cell.innerHTML = `
                        <iconify-icon icon="solar:user-speak-rounded-linear" class="sc-special-icon"></iconify-icon>
                        <span class="sc-cell-name">AESH</span>
                    `;
                } else if (special.type === 'blocked') {
                    const isClassScope = special.scope === 'class';
                    const currentClass = this._getCurrentClass();
                    const className = currentClass?.name || 'Cette classe';
                    const scopeLabel = isClassScope ? 'Cette classe' : 'Toutes';
                    const scopeTooltip = isClassScope
                        ? `Condamnée pour ${className} uniquement`
                        : 'Condamnée pour toutes les classes';
                    cell.innerHTML = `
                        <iconify-icon icon="solar:forbidden-circle-linear" class="sc-special-icon"></iconify-icon>
                        <span class="sc-cell-name">Condamné</span>
                        <span class="sc-cell-scope-badge ${isClassScope ? 'scope-class' : 'scope-global'}" data-tooltip="${scopeTooltip}">${scopeLabel}</span>
                    `;
                }
            }

            const totalRows = this._getRows();
            const depthRatio = totalRows > 1
                ? (this._orientation === 'student' ? (totalRows - 1 - row) / (totalRows - 1) : row / (totalRows - 1))
                : 0.5;
            cell.style.setProperty('--row-depth', depthRatio);

            const tools = document.createElement('div');
            tools.className = 'sc-cell-special-tools';
            if (!special) {
                tools.innerHTML = `
                    <button class="sc-special-btn" data-type="aisle" data-tooltip="Allée" aria-label="Allée"><iconify-icon icon="solar:ghost-linear"></iconify-icon></button>
                    <button class="sc-special-btn" data-type="aesh" data-tooltip="Place AESH" aria-label="Place AESH"><iconify-icon icon="solar:user-speak-rounded-linear"></iconify-icon></button>
                    <button class="sc-special-btn" data-type="blocked" data-tooltip="Condamner" aria-label="Condamner"><iconify-icon icon="solar:forbidden-circle-linear"></iconify-icon></button>
                `;
            } else if (special.type === 'blocked') {
                const isClassScope = special.scope === 'class';
                tools.innerHTML = `
                    <button class="sc-special-btn" data-type="normal" data-tooltip="Rétablir la place" aria-label="Rétablir la place"><iconify-icon icon="solar:refresh-linear"></iconify-icon></button>
                    <button class="sc-special-btn sc-scope-toggle-btn" data-type="toggle-scope" data-tooltip="${isClassScope ? 'Appliquer à toutes les classes' : 'Restreindre à cette classe'}" aria-label="Basculer la portée"><iconify-icon icon="${isClassScope ? 'solar:buildings-linear' : 'solar:users-group-two-rounded-linear'}"></iconify-icon></button>
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
                if (type === 'toggle-scope') {
                    this._toggleBlockedScope(row, col);
                } else {
                    this._setCellSpecialType(row, col, type === 'normal' ? null : type);
                }
            });

            cell.addEventListener('click', () => {
                if (this._isLocked || this._selectedChipIds.length === 0 || special) return;
                this._placeSelectedAt(row, col);
            });
        }

        cell.addEventListener('dragover', (e) => {
            if (!this._isValidDropTarget(row, col)) return;
            
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

    _renderSidebar(returningId, isReset = false) {
        const list = document.getElementById('scStudentList');
        if (!list) return;

        const unplaced = this._getUnplacedStudents();
        const sorted = [...unplaced].sort((a, b) =>
            `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' })
        );

        const searchTerm = (document.getElementById('scSearchInput')?.value || '').toLowerCase();

        const filtered = searchTerm
            ? sorted.filter(s => `${s.prenom} ${s.nom}`.toLowerCase().includes(searchTerm))
            : sorted;

        list.innerHTML = filtered.length === 0
            ? `<div class="sc-empty-sidebar ${unplaced.length === 0 ? 'sc-empty-success' : ''}">
                 ${unplaced.length === 0 
                    ? `<div class="sc-empty-text"><strong>Bravo !</strong><br>Le plan est complet !</div>
                       <iconify-icon icon="solar:check-circle-bold-duotone" class="sc-empty-success-icon"></iconify-icon>`
                    : 'Aucun résultat'}
               </div>`
            : filtered.map((s, index) => `
                <div class="${isReset ? 'sc-student-chip sc-chip-stagger' : 'sc-student-chip'}" ${isReset ? `style="--chip-i: ${index}"` : ''} draggable="true" data-result-id="${s.id}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                    <span class="sc-student-chip-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                </div>
            `).join('');

        // Attach listeners regardless of lock state — sidebar is pointer-events: none when locked anyway
        list.querySelectorAll('.sc-student-chip').forEach((chip, index) => {
            const id = chip.dataset.resultId;

            chip.addEventListener('dragstart', (e) => {
                this._dismissOnboardingHint();
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
        let specialSpotsCount = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this._isSpecialSpot(r, c)) specialSpotsCount++;
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

        // --- Toolbar Pill Info (Mode Édition : capacité et statut de placement) ---
        const seatsLabel = `<span class="sc-footer-seats"><strong class="sc-dynamic-value">${availableSeats}</strong> place${availableSeats > 1 ? 's' : ''} libre${availableSeats > 1 ? 's' : ''}</span>`;
        if (total === 0) {
            info.innerHTML = seatsLabel;
        } else if (unplaced > 0) {
            info.innerHTML = `<span class="sc-unplaced-hint"><iconify-icon icon="solar:danger-triangle-linear"></iconify-icon><span class="sc-unplaced-text"><strong>${unplaced}</strong> non placé${unplaced > 1 ? 's' : ''}</span></span> <span class="sc-toolbar-dot" aria-hidden="true">·</span> ${seatsLabel}`;
        } else {
            info.innerHTML = `<span class="sc-footer-all-placed"><iconify-icon icon="solar:check-circle-linear"></iconify-icon><span>Tous placés</span></span> <span class="sc-toolbar-dot" aria-hidden="true">·</span> ${seatsLabel}`;
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

        this._updateStatusPill();
    },

    _formatShortDate(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date);
        } catch {
            return '';
        }
    },

    getClassSeatingStatus(cls) {
        if (!cls) return { status: 'empty', label: 'À faire', shortLabel: 'À faire', icon: 'solar:map-point-linear', unplaced: 0, placed: 0, total: 0 };

        const classResults = ClassManager.getStudentsForClass(cls.id);
        const total = classResults.length;
        const placed = classResults.filter(r => r.seatingPosition?.row != null && r.seatingPosition?.col != null).length;
        const unplaced = total - placed;

        if (total === 0 || placed === 0) {
            return {
                status: 'empty',
                label: 'À faire',
                shortLabel: 'À faire',
                icon: 'solar:map-point-linear',
                placed,
                total,
                unplaced
            };
        }

        if (cls.seatingLocked) {
            const dateStr = this._formatShortDate(cls.seatingValidatedAt);
            const label = dateStr ? `Validé (${dateStr})` : 'Validé';
            return {
                status: 'locked',
                label,
                shortLabel: 'Validé',
                dateStr,
                icon: 'solar:lock-bold',
                placed,
                total,
                unplaced
            };
        }

        const dateStr = this._formatShortDate(cls.seatingUpdatedAt);
        const label = dateStr ? `En test (${dateStr})` : 'En test';
        return {
            status: 'testing',
            label,
            shortLabel: 'En test',
            dateStr,
            icon: 'solar:test-tube-linear',
            placed,
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
        const info = this.getClassSeatingStatus(currentClass);

        pill.className = `sc-status-pill sc-status-${info.status}`;
        if (info.status === 'locked') {
            pill.style.display = '';
            const dateText = info.dateStr ? ` · ${info.dateStr}` : '';
            const unplacedWarning = info.unplaced > 0
                ? `<span class="sc-status-pill-sep">·</span><span class="sc-status-pill-unplaced"><iconify-icon icon="solar:danger-triangle-bold"></iconify-icon><span>${info.unplaced} non placé${info.unplaced > 1 ? 's' : ''}</span></span>`
                : '';
            pill.innerHTML = `<iconify-icon icon="solar:lock-bold"></iconify-icon><span>Validé${dateText}</span>${unplacedWarning}`;
            const tooltipText = info.unplaced > 0 
                ? `Plan validé et figé (${info.unplaced} non placé${info.unplaced > 1 ? 's' : ''})` 
                : 'Plan de classe validé et figé';
            pill.removeAttribute('title');
            pill.setAttribute('data-tooltip', tooltipText);
            TooltipsUI?.updateTooltip?.(pill, tooltipText);
        } else if (info.status === 'testing') {
            pill.style.display = '';
            const dateText = info.dateStr ? ` · ${info.dateStr}` : '';
            const unplacedWarning = info.unplaced > 0
                ? `<span class="sc-status-pill-sep">·</span><span class="sc-status-pill-unplaced"><iconify-icon icon="solar:danger-triangle-bold"></iconify-icon><span>${info.unplaced} non placé${info.unplaced > 1 ? 's' : ''}</span></span>`
                : '';
            pill.innerHTML = `<iconify-icon icon="solar:test-tube-linear"></iconify-icon><span>En test${dateText}</span>${unplacedWarning}`;
            const tooltipText = info.unplaced > 0
                ? `Plan en cours d'essai en classe (${info.unplaced} non placé${info.unplaced > 1 ? 's' : ''})`
                : 'Plan en cours d\'ajustement ou d\'essai en classe';
            pill.removeAttribute('title');
            pill.setAttribute('data-tooltip', tooltipText);
            TooltipsUI?.updateTooltip?.(pill, tooltipText);
        } else {
            // Empty plan in consultation mode: no pill needed
            pill.style.display = 'none';
            pill.innerHTML = '';
        }
    },

    // ========================================================================
    // DRAG & DROP — with animation hooks
    // ========================================================================

    _handleDrop(targetRow, targetCol) {
        if (!this._dragSource || !this._isValidDropTarget(targetRow, targetCol)) return;

        const { type, resultId, row: srcRow, col: srcCol, ids } = this._dragSource;

        if (type === 'multi-cell') {
            this._selectedChipIds = ids;
            this._placeSelectedAt(targetRow, targetCol);
            this._dragSource = null;
            return;
        }

        const targetId = this._gridState[targetRow]?.[targetCol];

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
        this._savePositionsToState();
        this._render();

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
            this._savePositionsToState();
            this._renderGrid();
            this._renderSidebar(removedId);
            this._updateFooter();
            this._updateSidebarLockState();
            this._onRemovalComplete();
        });
    },

    _onRemovalComplete() {
        this._updateUndoRedoButtons();
        if (this._getPlacedIds().size === 0) {
            this._maybeShowOnboardingHint();
        }
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
            this._dismissOnboardingHint();
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
            if (this._isTouchOverSidebar(touch.clientX, touch.clientY)) {
                if (this._touchSourceInfo.type === 'cell' || this._touchSourceInfo.type === 'multi-cell') {
                    this._dragSource = this._touchSourceInfo;
                    this._handleRemoveFromSidebarDrop();
                }
            } else {
                const targetCell = this._getCellUnderPoint(touch.clientX, touch.clientY);
                if (targetCell) {
                    const targetRow = parseInt(targetCell.dataset.row);
                    const targetCol = parseInt(targetCell.dataset.col);
                    if (this._isValidDropTarget(targetRow, targetCol)) {
                        this._dragSource = this._touchSourceInfo;
                        this._handleDrop(targetRow, targetCol);
                        this._dragSource = null;
                    }
                }
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
        document.querySelector('.sc-sidebar')?.classList.remove('drag-over');
    },

    _highlightCellUnderTouch(x, y) {
        document.querySelectorAll('.sc-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
        const sidebar = document.querySelector('.sc-sidebar');
        if (sidebar) sidebar.classList.remove('drag-over');

        if (this._isTouchOverSidebar(x, y)) {
            if (sidebar && !this._isLocked && this._touchSourceInfo && (this._touchSourceInfo.type === 'cell' || this._touchSourceInfo.type === 'multi-cell')) {
                sidebar.classList.add('drag-over');
            }
        } else {
            const cell = this._getCellUnderPoint(x, y);
            if (cell) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                if (this._isValidDropTarget(row, col)) {
                    cell.classList.add('drag-over');
                }
            }
        }
    },

    _getCellUnderPoint(x, y) {
        return (document.elementsFromPoint(x, y) || []).find(el => el.classList.contains('sc-cell')) || null;
    },

    // ========================================================================
    // ACTIONS — with animation orchestration
    // ========================================================================

    _autoPlace(mode = 'alpha-asc') {
        if (this._isLocked) return;

        const rows = this._getRows();
        const cols = this._getCols();

        if (!this._gridState || this._gridState.length !== rows) {
            this._initGrid(rows, cols);
        }

        const unplaced = this._getUnplacedStudents();
        const placedIds = this._getPlacedIds();
        const resultsMap = new Map((appState.generatedResults || []).map(x => [x.id, x]));

        // Cas : Dispersion aléatoire sur l'ensemble de la salle (idéal examen / devoir surveillé)
        if (mode === 'random-disperse') {
            // 1. Récupérer tous les élèves mobiles : ceux placés non épinglés + ceux non placés
            const movableStudents = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const id = this._gridState[r]?.[c];
                    if (id) {
                        const studentResult = resultsMap.get(id);
                        if (!studentResult?.seatingPosition?.pinned) {
                            const student = this._students.find(s => s.id === id) || studentResult;
                            movableStudents.push(student);
                        }
                    }
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

            // 2. Récupérer toutes les places candidates (non condamnées et non occupées par un élève épinglé)
            const candidateSpots = [];
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (this._isSpecialSpot(r, c)) continue;
                    const currentId = this._gridState[r]?.[c];
                    if (currentId && resultsMap.get(currentId)?.seatingPosition?.pinned) {
                        continue;
                    }
                    candidateSpots.push({ r, c });
                }
            }

            if (candidateSpots.length === 0) {
                UI.showNotification('Aucune place disponible dans la salle.', 'warning');
                return;
            }

            this._snapshotGrid();

            // 3. Vider les places mobiles actuelles
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const id = this._gridState[r]?.[c];
                    if (id && !resultsMap.get(id)?.seatingPosition?.pinned) {
                        this._gridState[r][c] = null;
                    }
                }
            }

            // 4. Mélanger les places candidates (Fisher-Yates)
            for (let i = candidateSpots.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidateSpots[i], candidateSpots[j]] = [candidateSpots[j], candidateSpots[i]];
            }

            // 5. Mélanger les élèves mobiles
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
                    const id = this._gridState[r]?.[c];
                    if (id) {
                        const studentResult = resultsMap.get(id);
                        if (!studentResult?.seatingPosition?.pinned) {
                            const student = this._students.find(s => s.id === id) || studentResult;
                            movable.push(student);
                            occupiedSpots.push({ r, c });
                        }
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

            // Trier selon le mode
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

            // Vider temporairement les places mobiles (les épinglés ne bougent absolument pas)
            occupiedSpots.forEach(spot => {
                this._gridState[spot.r][spot.c] = null;
            });

            // Réassigner dans l'ordre choisi
            const placedCells = [];
            ordered.forEach((student, i) => {
                const spot = occupiedSpots[i];
                this._gridState[spot.r][spot.c] = student.id;
                placedCells.push({ row: spot.r, col: spot.c, index: i });
            });

            this._savePositionsToState();
            this._render();

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

            return;
        }

        // Cas 2 : Il y a des élèves non placés -> les placer dans les places libres
        if (unplaced.length === 0) {
            UI.showNotification('Tous les élèves sont déjà placés.', 'info');
            return;
        }
        this._snapshotGrid();

        // Collecter toutes les places vides dans l'ordre de lecture classique (haut vers bas, gauche vers droite)
        const availableSpots = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!this._gridState[r]?.[c] && !this._isSpecialSpot(r, c)) {
                    availableSpots.push({ r, c });
                }
            }
        }

        const k = Math.min(availableSpots.length, unplaced.length);
        if (k === 0) return;

        // Tri des élèves selon le mode choisi
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

        // On prend les K dernières places (les plus proches du bureau au fond)
        const spotsToFill = availableSpots.slice(-k);
        let placed = 0;
        const placedCells = [];

        // On assigne les élèves dans l'ordre sélectionné à ces places
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

    /** Shuffles non-pinned students across valid seats */
    _shuffle() {
        this._autoPlace('random');
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

        UI.showCustomConfirm('Les élèves seront retirés du plan mais resteront dans la liste.', () => {
            this._snapshotGrid();
            const occupiedCells = document.querySelectorAll('#scGridContainer .sc-cell.occupied');

            occupiedCells.forEach((cell, index) => {
                cell.style.setProperty('--cell-i', index);
                cell.classList.add('sc-cell-removing');
            });

            const animDuration = (occupiedCells.length - 1) * 15 + 300;

            setTimeout(() => {
                this._initGrid(this._getRows(), this._getCols());
                this._applyLockState(false);
                this._savePositionsToState();
                this._renderGrid();
                this._renderSidebar(null, true);
                this._updateFooter();
                this._updateSidebarLockState();
                this._updateUndoRedoButtons();
                this._saveGridConfig();
                this._staggerCellEntrance();
                this._maybeShowOnboardingHint();
            }, animDuration);
        }, null, { title: `Vider le plan de classe (${placedCount}) ?`, isDanger: true });
    },

    // ========================================================================
    // HELPERS
    // ========================================================================

    _isValidDropTarget(row, col) {
        if (this._isLocked) return false;
        const r = Number(row);
        const c = Number(col);
        if (isNaN(r) || isNaN(c)) return false;

        // 1. Check if the cell is a special layout spot (aisle, blocked, aesh, etc.)
        const isSpecial = this._isSpecialSpot(r, c);
        if (isSpecial) return false;

        // 2. Check if there is a pinned student in this cell
        const targetId = this._gridState[r]?.[c];
        if (targetId) {
            const targetStudent = this._students.find(s => s.id === targetId);
            if (targetStudent?.seatingPosition?.pinned) return false;
        }

        // 3. Check if dragging cell onto itself
        const dragSource = this._dragSource || this._touchSourceInfo;
        if (dragSource) {
            if (dragSource.type === 'cell' && Number(dragSource.row) === r && Number(dragSource.col) === c) {
                return false;
            }
        }

        return true;
    },

    _isTouchOverSidebar(x, y) {
        return (document.elementsFromPoint(x, y) || []).some(el => el.classList.contains('sc-sidebar') || el.closest('.sc-sidebar'));
    },

    _handleRemoveFromSidebarDrop() {
        if (!this._dragSource || this._isLocked) return;

        const { type, resultId, row, col, ids } = this._dragSource;

        this._snapshotGrid();

        if (type === 'cell') {
            this._animateCellRemove(row, col, () => {
                this._gridState[row][col] = null;
                this._renderGrid();
                this._renderSidebar(resultId);
                this._updateFooter();
                this._updateSidebarLockState();
                this._savePositionsToState();
                this._onRemovalComplete();
            });
        } else if (type === 'multi-cell') {
            const rows = this._getRows();
            const cols = this._getCols();
            let delay = 0;
            const removedIds = [];

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const id = this._gridState[r][c];
                    if (id && ids.includes(id)) {
                        const cell = document.querySelector(`.sc-cell[data-row="${r}"][data-col="${c}"]`);
                        if (cell) {
                            cell.style.setProperty('--cell-i', delay);
                            cell.classList.add('sc-cell-removing');
                            delay++;
                        }
                        this._gridState[r][c] = null;
                        removedIds.push(id);
                    }
                }
            }

            setTimeout(() => {
                this._savePositionsToState();
                this._renderGrid();
                this._renderSidebar();
                this._updateFooter();
                this._updateSidebarLockState();
                this._onRemovalComplete();
            }, Math.min(delay * 30 + 300, 600));
        }

        this._dragSource = null;
    },

    _getCurrentClassStudents() {
        const classId = appState.currentClassId;
        return ClassManager.getStudentsForClass(classId)
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
                    if (this._orientation === 'student') {
                        gridArea.scrollTo({
                            top: 0,
                            behavior: 'smooth'
                        });
                    } else {
                        // Force absolute bottom scroll, bypassing element boundaries to ensure padding is visible
                        gridArea.scrollTo({
                            top: gridArea.scrollHeight + 500,
                            behavior: 'smooth'
                        });
                    }
                }
            }, 100); // Slight delay to ensure DOM layout and animations have updated height
        });
    },

    _maybeShowOnboardingHint() {
        if (this._getPlacedIds().size > 0 || this._isLocked) return;

        const gridArea = document.getElementById('scGridArea');
        if (!gridArea || gridArea.querySelector('.sc-onboarding-hint')) return;

        const hint = document.createElement('div');
        hint.className = 'sc-onboarding-hint';
        hint.innerHTML = `
            <div class="sc-onboarding-hint-text">
                <div class="sc-hint-title">Plan de classe vide</div>
                <div class="sc-hint-subtitle">Placez vos élèves pour commencer.</div>
            </div>
            <div class="sc-onboarding-actions">
                <button type="button" class="sc-onboarding-btn secondary" id="scHintAutoBtn">
                    <iconify-icon icon="solar:sort-by-alphabet-linear"></iconify-icon>
                    <span>Placer (A → Z)</span>
                </button>
                <button type="button" class="sc-onboarding-btn secondary" id="scHintRandomBtn">
                    <iconify-icon icon="solar:shuffle-linear"></iconify-icon>
                    <span>Mélanger (regroupé)</span>
                </button>
                <button type="button" class="sc-onboarding-btn secondary" id="scHintDisperseBtn">
                    <iconify-icon icon="solar:maximize-square-minimalistic-linear"></iconify-icon>
                    <span>Disperser (toute la salle)</span>
                </button>
                <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                    <span>Placer manuellement</span>
                </button>
            </div>
        `;

        gridArea.appendChild(hint);

        hint.querySelector('#scHintAutoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('alpha-asc');
        });
        hint.querySelector('#scHintRandomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('random');
        });
        hint.querySelector('#scHintDisperseBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('random-disperse');
        });
        hint.querySelector('#scHintManualBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismissOnboardingHint();
        });

        if (!appState.seatingGrid) {
            document.getElementById('scConfigBtn')?.classList.add('sc-has-pulse');
        }
    },

    _dismissOnboardingHint() {
        const hint = document.querySelector('.sc-onboarding-hint');
        if (!hint || hint.classList.contains('sc-hint-exiting')) return;

        hint.classList.add('sc-hint-exiting');

        const cleanup = () => hint.remove();
        hint.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, 400);
    }
};
