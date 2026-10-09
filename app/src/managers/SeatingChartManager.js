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
import { HistoryManager } from './HistoryManager.js';
import { CrossClassSearchManager } from './CrossClassSearchManager.js';
import { ClassUIManager } from './ClassUIManager.js';

const DEFAULT_COLS = 6;
const DEFAULT_ROWS = 5;
const MAX_UNDO_LEVELS = 5;

export const SeatingChartManager = {
    _isActive: false,
    _isLocked: false,
    _wasLockedBeforeEdit: false,
    _hasChangesSinceUnlock: false,
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
    _isFitted: true,
    _zoomScale: 1,
    _fitScale: 1,
    _resizeDebounceTimer: null,
    _activeMobileSheet: null,
    _activeSearchTerm: '',
    _searchMatchIndex: 0,

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
        if (document.getElementById('viewToggle')) return;

        const target = document.querySelector('.header-center') || document.querySelector('.header-actions');
        if (!target) return;

        const toggle = document.createElement('div');
        toggle.className = 'ui-segmented-control header-style view-toggle';
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

        target.appendChild(toggle);
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
                            <input type="text" id="scSearchInput" class="custom-input" placeholder="Rechercher..." autocomplete="off">
                            <button class="sc-search-clear" id="scSearchClear" aria-label="Effacer" type="button">
                                <iconify-icon icon="ph:x"></iconify-icon>
                            </button>
                        </div>
                    </div>
                    <div class="sc-student-list" id="scStudentList"></div>
                </div>
                <div class="sc-grid-area" id="scGridArea">
                    <!-- Top Status Capsule (Consultation Mode: on the left next to sidebar origin) -->
                    <div class="sc-status-pill" id="scStatusPill" role="button" tabindex="0"></div>

                    <div class="sc-classroom-board" id="scClassroomBoard">
                        <div class="sc-grid-container" id="scGridContainer"></div>
                        <div class="sc-desk-row">
                            <div class="sc-desk" id="scDesk" role="button" tabindex="0" aria-label="Vue Prof active (cliquer pour inverser la vue)" data-tooltip="Vue Prof active • Inverser"><iconify-icon class="sc-desk-cap" icon="solar:square-academic-cap-linear"></iconify-icon><span>Tableau</span></div>
                        </div>
                    </div>
                </div>

                <!-- Floating Top Controls: Status pill (edit mode) + Actions capsule -->
                <div class="sc-floating-controls" id="scFloatingControls">
                    <!-- Top Capacity Capsule (Edit Mode: on the right above grid) -->
                    <div class="sc-floating-status" id="scFloatingStatus">
                        <div class="sc-toolbar-info" id="scFooterInfo"><span class="sc-edit-hint">Calcul des places…</span></div>
                    </div>

                    <!-- Floating Actions Capsule -->
                    <div class="sc-floating-actions sc-floating-capsule" id="scFloatingActions">
                        <div class="sc-floating-search" id="scFloatingSearch">
                            <button class="sc-action-btn sc-search-toggle-btn" id="scFloatingSearchBtn" aria-label="Rechercher un élève (/) " data-tooltip="Rechercher (/)">
                                <iconify-icon icon="solar:magnifer-linear"></iconify-icon>
                            </button>
                            <div class="sc-floating-search-input-box" id="scFloatingSearchBox">
                                <iconify-icon class="sc-search-field-icon" icon="solar:magnifer-linear"></iconify-icon>
                                <input type="text" id="scFloatingSearchInput" class="custom-input" placeholder="Rechercher un élève..." autocomplete="off" spellcheck="false" aria-label="Rechercher un élève">
                                <span class="sc-floating-search-count" id="scFloatingSearchCount" style="display: none;"></span>
                                <button class="sc-floating-search-clear" id="scFloatingSearchClear" aria-label="Effacer la recherche" type="button">
                                    <iconify-icon icon="ph:x"></iconify-icon>
                                </button>
                            </div>
                            <div class="sc-floating-search-suggestions" id="scFloatingSearchSuggestions" style="display: none;"></div>
                        </div>
                        <button class="sc-action-btn sc-zoom-btn" id="scFloatingZoomBtn" aria-label="Ajuster la vue" data-tooltip="Ajuster la vue">
                            <iconify-icon icon="solar:magnifer-zoom-in-linear"></iconify-icon>
                        </button>
                        <button class="sc-action-btn sc-orientation-btn" id="scFloatingOrientationBtn" aria-label="Vue Prof active (cliquer pour inverser la vue)" data-tooltip="Vue Prof active • Inverser">
                            <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                        </button>
                        <button class="sc-action-btn sc-print-btn" id="scFloatingPrintBtn" aria-label="Imprimer le plan" data-tooltip="Imprimer le plan">
                            <iconify-icon icon="solar:printer-linear"></iconify-icon>
                        </button>
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
        document.getElementById('scFloatingSearchBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openSearch();
        });

        const floatingSearchInput = document.getElementById('scFloatingSearchInput');
        floatingSearchInput?.addEventListener('input', (e) => {
            this._applySearchHighlight(e.target.value);
        });

        floatingSearchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this._handleSearchEscape();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this._handleSearchEnter(e.target.value);
            }
        });

        document.getElementById('scFloatingSearchClear')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._handleSearchEscape();
        });

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
        const statusPill = document.getElementById('scStatusPill');
        statusPill?.addEventListener('click', () => {
            if (this._isLocked) {
                this._toggleLock();
            }
        });
        statusPill?.addEventListener('keydown', (e) => {
            if (this._isLocked && (e.key === ' ' || e.key === 'Enter')) {
                e.preventDefault();
                this._toggleLock();
            }
        });
        document.getElementById('scUnlockFloatingBtn')?.addEventListener('click', () => this._toggleLock());
        document.getElementById('scOrientationBtn')?.addEventListener('click', () => this._toggleOrientation());
        document.getElementById('scFloatingOrientationBtn')?.addEventListener('click', () => this._toggleOrientation());
        document.getElementById('scFloatingZoomBtn')?.addEventListener('click', () => this._toggleZoom());

        const gridArea = document.getElementById('scGridArea');
        gridArea?.addEventListener('dblclick', (e) => {
            if (!e.target.closest('.sc-cell') && !e.target.closest('.sc-desk')) {
                this._toggleZoom();
            }
        });

        // Mobile touch double-tap support (since dblclick is unreliable on mobile browsers with touch-action)
        let lastTapTime = 0;
        let lastTapX = 0;
        let lastTapY = 0;
        gridArea?.addEventListener('touchend', (e) => {
            if (!e.changedTouches || e.changedTouches.length !== 1 || (e.touches && e.touches.length > 0)) return;
            if (this._isPinching || this._dragSource || this._touchSourceInfo) return;
            if (e.target.closest('.sc-cell') || e.target.closest('.sc-desk') || e.target.closest('button')) return;

            const touch = e.changedTouches[0];
            if (!touch) return;
            const now = Date.now();
            const dt = now - lastTapTime;
            const dist = Math.hypot(touch.clientX - lastTapX, touch.clientY - lastTapY);
            if (dt > 40 && dt < 320 && dist < 24) {
                lastTapTime = 0;
                if (e.cancelable) e.preventDefault();
                this._toggleZoom();
            } else {
                lastTapTime = now;
                lastTapX = touch.clientX;
                lastTapY = touch.clientY;
            }
        }, { passive: false });

        if (gridArea) {
            this._setupPinchAndWheelZoom(gridArea);
            this._setupOverscrollBounce(gridArea);
        }

        if (!this._resizeListenerInitialized) {
            this._resizeListenerInitialized = true;
            window.addEventListener('resize', () => {
                clearTimeout(this._resizeDebounceTimer);
                this._resizeDebounceTimer = setTimeout(() => {
                    if (this._isActive) {
                        this._applySmartFit();
                    }
                }, 100);
            });
        }

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
            this._applySearchHighlight(e.target.value);
        });

        document.getElementById('scSearchInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && e.target.value) {
                e.preventDefault();
                e.stopPropagation();
                e.target.value = '';
                document.getElementById('scSearchClear')?.classList.remove('visible');
                this._renderSidebar();
                this._applySearchHighlight('');
            }
        });

        document.getElementById('scSearchClear')?.addEventListener('click', () => {
            const input = document.getElementById('scSearchInput');
            if (input) { input.value = ''; input.focus(); }
            document.getElementById('scSearchClear')?.classList.remove('visible');
            this._renderSidebar();
            this._applySearchHighlight('');
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

        if (!this._globalListenersInitialized) {
            this._globalListenersInitialized = true;

            document.addEventListener('click', (e) => {
                if (this._isSearchOpen()) {
                    const searchWrap = document.getElementById('scFloatingSearch');
                    if (searchWrap && !searchWrap.contains(e.target)) {
                        const input = document.getElementById('scFloatingSearchInput');
                        if (!input || !input.value.trim()) {
                            this._closeSearch();
                        } else {
                            const sug = document.getElementById('scFloatingSearchSuggestions');
                            if (sug) sug.style.display = 'none';
                        }
                    }
                }
                if (this._configPopoverOpen && !e.target.closest('.sc-config-wrapper')) {
                    this._closeConfigPopover();
                }
                if (this._placementPopoverOpen && !e.target.closest('.sc-placement-wrapper')) {
                    this._closePlacementPopover();
                }
                if (this._selectedChipIds.length > 0 && 
                    !e.target.closest('.sc-student-chip') && 
                    !e.target.closest('.sc-cell') && 
                    !e.target.closest('.sc-mobile-sheet') && 
                    !e.target.closest('.sc-mobile-sheet-backdrop')) {
                    this._clearSelection();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (!this._isActive) return;

                const activeEl = document.activeElement;
                const isTyping = activeEl && (
                    activeEl.tagName === 'INPUT' ||
                    activeEl.tagName === 'TEXTAREA' ||
                    activeEl.isContentEditable ||
                    activeEl.getAttribute('contenteditable') === 'true'
                );

                // Open search on '/' (when not already typing) or Ctrl+F / Cmd+F
                if ((e.key === '/' && !isTyping) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
                    e.preventDefault();
                    this._openSearch();
                    return;
                }

                // Undo / Redo shortcuts (when not typing in an input/search)
                if ((e.ctrlKey || e.metaKey) && !isTyping) {
                    const key = e.key.toLowerCase();
                    if (key === 'z') {
                        e.preventDefault();
                        if (e.shiftKey) {
                            this._redo();
                        } else {
                            this._undo();
                        }
                        return;
                    } else if (key === 'y') {
                        e.preventDefault();
                        this._redo();
                        return;
                    }
                }

                if (e.key === 'Escape') {
                    if (this._isSearchOpen()) {
                        e.preventDefault();
                        this._handleSearchEscape();
                        return;
                    }
                    if (this._activeMobileSheet) this._closeMobileSheet();
                    if (this._placementPopoverOpen) this._closePlacementPopover();
                    if (this._configPopoverOpen) this._closeConfigPopover();
                    if (this._selectedChipIds.length > 0) this._clearSelection();
                }
            });

            window.addEventListener('student-updated', () => this.refreshStudents());
            window.addEventListener('studentsUpdated', () => this.refreshStudents());
        }
    },

    refreshStudents() {
        if (!this._isActive) return;
        this._students = this._getCurrentClassStudents();
        this._studentMap = new Map(this._students.map(s => [s.id, s]));
        this._render();
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
    // MOBILE ACTION SHEETS & TAP-TO-PLACE (iOS / Material 2026 Gold Standard)
    // ========================================================================

    _isMobileView() {
        return Boolean(window.innerWidth <= 768 || window.matchMedia?.('(pointer: coarse)')?.matches);
    },

    _findStudentGridPos(studentId) {
        if (!studentId || !Array.isArray(this._gridState)) return null;
        for (let r = 0; r < this._gridState.length; r++) {
            const row = this._gridState[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
                if (row[c] === studentId) return { row: r, col: c };
            }
        }
        return null;
    },

    _swapGridPositions(r1, c1, r2, c2) {
        if (this._isLocked) return;
        this._snapshotGrid();
        const id1 = this._gridState[r1]?.[c1];
        const id2 = this._gridState[r2]?.[c2];
        if (!id1 || !id2) return;

        this._gridState[r1][c1] = id2;
        this._gridState[r2][c2] = id1;
        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        this._animateCellSwap(r1, c1, r2, c2);
        this._haptic([12, 40, 12]);

        const s1 = this._studentMap?.get(id1) || this._students.find(s => s.id === id1);
        const s2 = this._studentMap?.get(id2) || this._students.find(s => s.id === id2);
        if (s1 && s2) {
            UI?.showNotification?.(`Échange : ${s1.prenom || s1.nom} ↔ ${s2.prenom || s2.nom}`, 'success', 4000, {
                action: {
                    label: 'Annuler',
                    onClick: () => this._undo()
                }
            });
        }
    },

    _replaceOccupantWithUnplaced(row, col, unplacedId) {
        if (this._isLocked) return;
        this._snapshotGrid();
        const prevOccupantId = this._gridState[row]?.[col];
        this._gridState[row][col] = unplacedId;
        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        this._animateCellPlaced(row, col);

        const sNew = this._studentMap?.get(unplacedId) || this._students.find(s => s.id === unplacedId);
        const sOld = this._studentMap?.get(prevOccupantId) || this._students.find(s => s.id === prevOccupantId);
        if (sNew) {
            const msg = sOld 
                ? `${sNew.prenom || sNew.nom} remplace ${sOld.prenom || sOld.nom}` 
                : `${sNew.prenom || sNew.nom} placé à cette table`;
            UI?.showNotification?.(msg, 'success', 4000, {
                action: {
                    label: 'Annuler',
                    onClick: () => this._undo()
                }
            });
        }
    },

    _openOccupiedCellSheet(row, col, student) {
        this._closeMobileSheet(true);
        if (!HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.pushState('scMobileSheet', () => this._closeMobileSheet(true));
        }
        const isPinned = !!student?.seatingPosition?.pinned;
        const backdrop = document.createElement('div');
        backdrop.className = 'sc-mobile-sheet-backdrop';
        backdrop.id = 'scMobileSheetBackdrop';

        const sheet = document.createElement('div');
        sheet.className = 'sc-mobile-sheet';
        sheet.id = 'scMobileSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        sheet.innerHTML = `
            <div class="sc-sheet-handle"></div>
            <div class="sc-sheet-header">
                <div class="sc-sheet-entity-info">
                    ${StudentPhotoManager.getAvatarHTML(student, 'md')}
                    <div class="sc-sheet-entity-text">
                        <h3 class="sc-sheet-entity-name">${student.prenom || ''} ${student.nom || ''}</h3>
                        <p class="sc-sheet-entity-meta">Rangée ${row + 1} • Table ${col + 1}${isPinned ? ' • 📌 Place fixée' : ''}</p>
                    </div>
                </div>
                <button class="sc-sheet-close-btn" id="scSheetCloseBtn" aria-label="Fermer" type="button">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="sc-sheet-content">
                <div class="sc-sheet-actions">
                    <button class="sc-sheet-action-btn" data-action="move" type="button">
                        <div class="sc-sheet-action-icon sc-icon-primary">
                            <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">Déplacer ou permuter</span>
                            <span class="sc-sheet-action-hint">Touchez ensuite la table de destination</span>
                        </div>
                    </button>
                    <button class="sc-sheet-action-btn" data-action="pin" type="button">
                        <div class="sc-sheet-action-icon ${isPinned ? 'sc-icon-warning' : 'sc-icon-secondary'}">
                            <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isPinned ? 'Détacher la place' : 'Épingler à cette place'}</span>
                            <span class="sc-sheet-action-hint">${isPinned ? 'La place redeviendra mobile' : 'Fige la place lors des réagencements'}</span>
                        </div>
                    </button>
                    <button class="sc-sheet-action-btn sc-action-danger" data-action="remove" type="button">
                        <div class="sc-sheet-action-icon sc-icon-danger">
                            <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">Retirer du plan</span>
                            <span class="sc-sheet-action-hint">Renvoie l'élève dans les non placés</span>
                        </div>
                    </button>
                    <button class="sc-sheet-action-btn" data-action="profile" type="button">
                        <div class="sc-sheet-action-icon sc-icon-secondary">
                            <iconify-icon icon="solar:user-id-linear"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">Voir la fiche élève</span>
                            <span class="sc-sheet-action-hint">Notes, observations et historique</span>
                        </div>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        this._activeMobileSheet = { backdrop, sheet };

        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            sheet.classList.add('active');
        });

        const close = () => this._closeMobileSheet();
        backdrop.addEventListener('click', close);
        sheet.querySelector('#scSheetCloseBtn')?.addEventListener('click', close);

        sheet.querySelector('[data-action="move"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeMobileSheet(true);
            this._clearSelection();
            this._toggleChipSelection(student.id);
            this._lastSelectedGridPos = { row, col };
            UI?.showNotification?.(`Touchez une table libre pour déplacer ${student.prenom || 'l’élève'}, ou occupée pour permuter.`, 'info');
        });

        sheet.querySelector('[data-action="pin"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            this._togglePin(student.id);
        });

        sheet.querySelector('[data-action="remove"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            this._removeFromCell(row, col);
        });

        sheet.querySelector('[data-action="profile"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            FocusPanelManager.open(student.id);
        });
    },

    _openEmptyCellSheet(row, col, special) {
        this._closeMobileSheet(true);
        if (!HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.pushState('scMobileSheet', () => this._closeMobileSheet(true));
        }
        const unplaced = this._getUnplacedStudents();
        const isClassScope = special?.scope === 'class';
        const backdrop = document.createElement('div');
        backdrop.className = 'sc-mobile-sheet-backdrop';
        backdrop.id = 'scMobileSheetBackdrop';

        const sheet = document.createElement('div');
        sheet.className = 'sc-mobile-sheet';
        sheet.id = 'scMobileSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        let statusLabel = 'Place libre';
        let deskIcon = 'solar:chair-linear';
        if (special?.type === 'aisle') {
            statusLabel = 'Allée (Espace vide)';
            deskIcon = 'solar:ghost-linear';
        } else if (special?.type === 'aesh') {
            statusLabel = 'Place réservée AESH';
            deskIcon = 'solar:user-speak-rounded-linear';
        } else if (special?.type === 'blocked') {
            statusLabel = 'Table condamnée';
            deskIcon = 'solar:forbidden-circle-linear';
        }

        sheet.innerHTML = `
            <div class="sc-sheet-handle"></div>
            <div class="sc-sheet-header">
                <div class="sc-sheet-entity-info">
                    <div class="sc-sheet-desk-icon">
                        <iconify-icon icon="${deskIcon}"></iconify-icon>
                    </div>
                    <div class="sc-sheet-entity-text">
                        <h3 class="sc-sheet-entity-name">Rangée ${row + 1} • Table ${col + 1}</h3>
                        <p class="sc-sheet-entity-meta">${statusLabel}</p>
                    </div>
                </div>
                <button class="sc-sheet-close-btn" id="scSheetCloseBtn" aria-label="Fermer" type="button">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="sc-sheet-content">
                ${unplaced.length > 0 && !special ? `
                    <div class="sc-sheet-section-title">Attribuer à un élève non placé (${unplaced.length})</div>
                    <div class="sc-sheet-search-wrap">
                        <input type="text" class="sc-sheet-search" id="scSheetSearchInput" placeholder="Rechercher un élève..." autocomplete="off">
                    </div>
                    <div class="sc-sheet-picker-list" id="scSheetPickerList">
                        ${unplaced.map(s => `
                            <button class="sc-sheet-picker-item" data-student-id="${s.id}" type="button">
                                <div class="sc-sheet-picker-user">
                                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                                    <span class="sc-sheet-picker-name">${s.prenom || ''} ${s.nom || ''}</span>
                                </div>
                                <span class="sc-sheet-picker-badge"><iconify-icon icon="solar:add-circle-linear"></iconify-icon> Placer</span>
                            </button>
                        `).join('')}
                    </div>
                ` : (unplaced.length === 0 && !special ? `
                    <div class="sc-sheet-empty-unplaced">
                        <iconify-icon icon="solar:check-circle-bold"></iconify-icon>
                        <span>Tous les élèves sont déjà placés</span>
                    </div>
                ` : '')}
                <div class="sc-sheet-section-title">Configuration de la table</div>
                <div class="sc-sheet-actions">
                    ${!special ? `
                        <button class="sc-sheet-action-btn" data-special-type="aisle" type="button">
                            <div class="sc-sheet-action-icon sc-icon-secondary">
                                <iconify-icon icon="solar:ghost-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Transformer en allée</span>
                                <span class="sc-sheet-action-hint">Espace de passage (aucune table)</span>
                            </div>
                        </button>
                        <button class="sc-sheet-action-btn" data-special-type="aesh" type="button">
                            <div class="sc-sheet-action-icon sc-icon-secondary">
                                <iconify-icon icon="solar:user-speak-rounded-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Place AESH</span>
                                <span class="sc-sheet-action-hint">Réservée pour accompagnant</span>
                            </div>
                        </button>
                        <button class="sc-sheet-action-btn" data-special-type="blocked" type="button">
                            <div class="sc-sheet-action-icon sc-icon-secondary">
                                <iconify-icon icon="solar:forbidden-circle-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Condamner la table</span>
                                <span class="sc-sheet-action-hint">Table hors service ou indisponible</span>
                            </div>
                        </button>
                    ` : `
                        <button class="sc-sheet-action-btn" data-special-type="normal" type="button">
                            <div class="sc-sheet-action-icon sc-icon-primary">
                                <iconify-icon icon="solar:refresh-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Rétablir en table normale</span>
                                <span class="sc-sheet-action-hint">Permet d'asseoir à nouveau un élève</span>
                            </div>
                        </button>
                        ${special.type === 'blocked' ? `
                            <button class="sc-sheet-action-btn" data-special-type="toggle-scope" type="button">
                                <div class="sc-sheet-action-icon sc-icon-secondary">
                                    <iconify-icon icon="${isClassScope ? 'solar:buildings-linear' : 'solar:users-group-two-rounded-linear'}"></iconify-icon>
                                </div>
                                <div class="sc-sheet-action-text">
                                    <span class="sc-sheet-action-label">${isClassScope ? 'Appliquer à toute la salle' : 'Restreindre à cette classe'}</span>
                                    <span class="sc-sheet-action-hint">Portée : ${isClassScope ? 'Cette classe uniquement' : 'Toutes les classes'}</span>
                                </div>
                            </button>
                        ` : ''}
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        this._activeMobileSheet = { backdrop, sheet };

        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            sheet.classList.add('active');
        });

        const close = () => this._closeMobileSheet();
        backdrop.addEventListener('click', close);
        sheet.querySelector('#scSheetCloseBtn')?.addEventListener('click', close);

        // Unplaced student search filter
        const searchInput = sheet.querySelector('#scSheetSearchInput');
        const pickerList = sheet.querySelector('#scSheetPickerList');
        if (searchInput && pickerList) {
            searchInput.addEventListener('input', (e) => {
                const q = (e.target.value || '').trim().toLowerCase();
                pickerList.querySelectorAll('.sc-sheet-picker-item').forEach(item => {
                    const name = item.querySelector('.sc-sheet-picker-name')?.textContent?.toLowerCase() || '';
                    item.style.display = name.includes(q) ? 'flex' : 'none';
                });
            });
        }

        // Unplaced student placement click
        pickerList?.querySelectorAll('.sc-sheet-picker-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const studentId = item.dataset.studentId;
                if (!studentId) return;
                close();
                this._snapshotGrid();
                this._gridState[row][col] = studentId;
                this._dismissOnboardingHint();
                this._savePositionsToState();
                this._render();
                this._animateCellPlaced(row, col);
                const s = this._studentMap?.get(studentId) || this._students.find(st => st.id === studentId);
                if (s) {
                    UI?.showNotification?.(`${s.prenom || s.nom} placé à la table (${row + 1}, ${col + 1})`, 'success', 4000, {
                        action: {
                            label: 'Annuler',
                            onClick: () => this._undo()
                        }
                    });
                }
            });
        });

        // Special type actions
        sheet.querySelectorAll('[data-special-type]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.dataset.specialType;
                close();
                if (type === 'toggle-scope') {
                    this._toggleBlockedScope(row, col);
                } else {
                    this._setCellSpecialType(row, col, type === 'normal' ? null : type);
                }
            });
        });
    },

    _closeMobileSheet(immediate = false) {
        if (HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.handleManualClose('scMobileSheet');
        }

        const existingSheets = document.querySelectorAll('.sc-mobile-sheet, .sc-mobile-sheet-backdrop');
        if (immediate) {
            existingSheets.forEach(el => el.remove());
            this._activeMobileSheet = null;
            return;
        }
        if (!this._activeMobileSheet) {
            existingSheets.forEach(el => el.remove());
            return;
        }
        const { backdrop, sheet } = this._activeMobileSheet;
        this._activeMobileSheet = null;
        if (backdrop) backdrop.style.pointerEvents = 'none';
        if (sheet) sheet.style.pointerEvents = 'none';
        backdrop?.classList.remove('active');
        sheet?.classList.remove('active');
        setTimeout(() => {
            backdrop?.remove();
            sheet?.remove();
        }, 300);
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

        if (this._viewExitTimeout) {
            clearTimeout(this._viewExitTimeout);
            this._viewExitTimeout = null;
        }

        const isList = view === 'list';

        if (isList) {
            // [UX Mobile] History state cleanup for plan view and sub-modes
            if (HistoryManager.isOpen('viewPlan')) HistoryManager.handleManualClose('viewPlan');
            if (HistoryManager.isOpen('seatingChartEdit')) HistoryManager.handleManualClose('seatingChartEdit');
            if (HistoryManager.isOpen('scMobileSheet')) HistoryManager.handleManualClose('scMobileSheet');
            if (HistoryManager.isOpen('scConfigPopover')) HistoryManager.handleManualClose('scConfigPopover');
            if (HistoryManager.isOpen('scPlacementPopover')) HistoryManager.handleManualClose('scPlacementPopover');

            const finishList = () => {
                const wasActive = this._isActive;
                viewEl.classList.remove('sc-exiting', 'sc-entering');
                wrapper.dataset.view = 'list';
                viewEl.style.display = 'none';
                if (fab) fab.style.display = '';
                this._isActive = false;
                this._clearSelection();
                this._closeSearch();
                if (wasActive) {
                    if (!this._hasChangesSinceUnlock && this._wasLockedBeforeEdit && !this._isLocked) {
                        const currentClass = this._getCurrentClass();
                        if (currentClass) currentClass.seatingLocked = true;
                        this._isLocked = true;
                        if (appState.seatingGrid) appState.seatingGrid.locked = true;
                    }
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
            // [UX Mobile] History integration for plan view (Back returns to list)
            if (!HistoryManager.isOpen('viewPlan')) {
                HistoryManager.pushState('viewPlan', () => {
                    this.switchToView('list');
                });
            }
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
            this._updateSidebarLockState();
            this._undoStack = [];
            this._redoStack = [];
            this._render();
            this._applySmartFit(true);
            if (!immediate) {
                this._animateViewEnter(viewEl);
                this._scrollToDesk();
                this._maybeShowOnboardingHint();
            } else {
                viewEl.classList.remove('sc-exiting', 'sc-entering');
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
            this.switchToView('list', { silent: true, immediate: true });
        }
    },

    /** Called when class changes — reload data or revert to list */
    onClassChange(hasResults, options = {}) {
        const { immediate = false } = typeof options === 'boolean' ? { immediate: options } : options;
        this.updateToggleVisibility(hasResults);
        if (!this._isActive) return;

        this._closeConfigPopover();
        this._closePlacementPopover();

        if (!hasResults) {
            this.switchToView('list', { immediate });
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
        this._applySmartFit(true);
        this._staggerCellEntrance();
        
        const desk = document.getElementById('scDesk');
        desk?.classList.add('sc-desk-entering');
        setTimeout(() => desk?.classList.remove('sc-desk-entering'), 500);

        this._scrollToDesk();
        this._maybeShowOnboardingHint();
    },

    updateToggleVisibility(hasResults) {
        const toggle = document.getElementById('viewToggle');
        if (toggle) {
            const wasVisible = toggle.classList.contains('visible');
            toggle.classList.toggle('visible', hasResults);
            if (!wasVisible && hasResults && window.UI && typeof window.UI.updateGlider === 'function') {
                requestAnimationFrame(() => window.UI.updateGlider(toggle, true));
            }
        }
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
        if (this._viewExitTimeout) {
            clearTimeout(this._viewExitTimeout);
            this._viewExitTimeout = null;
        }
        viewEl.classList.remove('sc-entering');
        viewEl.classList.add('sc-exiting');

        let called = false;
        const done = () => {
            if (called) return;
            called = true;
            this._viewExitTimeout = null;
            viewEl.classList.remove('sc-exiting');
            onComplete();
        };
        viewEl.addEventListener('animationend', done, { once: true });
        this._viewExitTimeout = setTimeout(done, 350);
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
        if (!Array.isArray(filteredList)) return;
        const min = Math.min(idx1, idx2);
        const max = Math.max(idx1, idx2);
        
        for (let i = min; i <= max; i++) {
            const id = filteredList[i]?.id;
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
        this._haptic(15);
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
        this._wasLockedBeforeEdit = locked;
        this._hasChangesSinceUnlock = false;
        this._dragSource = null;
        this._touchSourceInfo = null;
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
        this._applySmartFit(true);

        // [UX Mobile] History integration for Edit Mode
        if (!locked) {
            if (!HistoryManager.isOpen('seatingChartEdit')) {
                HistoryManager.pushState('seatingChartEdit', () => {
                    if (!this._isLocked) {
                        this._toggleLock();
                    }
                });
            }
        } else {
            if (HistoryManager.isOpen('seatingChartEdit')) {
                HistoryManager.handleManualClose('seatingChartEdit');
            }
        }
    },

    _toggleLock() {
        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }
        const board = document.getElementById('scClassroomBoard');
        const rBefore = board?.getBoundingClientRect?.() || null;

        const wasLocked = this._isLocked;
        this._isLocked = !this._isLocked;
        this._dragSource = null;
        this._touchSourceInfo = null;
        const view = document.getElementById('seatingChartView');
        const btn = document.getElementById('scLockBtn');
        if (!view || !btn) return;

        // [UX Mobile] History integration for Edit Mode
        if (!this._isLocked) {
            this._wasLockedBeforeEdit = wasLocked;
            this._hasChangesSinceUnlock = false;
            this._undoStack = [];
            this._redoStack = [];
            this._updateUndoRedoButtons();
            if (!HistoryManager.isOpen('seatingChartEdit')) {
                HistoryManager.pushState('seatingChartEdit', () => {
                    if (!this._isLocked) {
                        this._toggleLock();
                    }
                });
            }
        } else {
            this._undoStack = [];
            this._redoStack = [];
            this._updateUndoRedoButtons();
            if (HistoryManager.isOpen('seatingChartEdit')) {
                HistoryManager.handleManualClose('seatingChartEdit');
            }
        }

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
        this._closeMobileSheet();
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
                    if (this._hasChangesSinceUnlock || !currentClass.seatingValidatedAt) {
                        currentClass.seatingValidatedAt = Date.now();
                        UI?.showNotification?.('Plan de classe validé et figé', 'success');
                    }
                    this._hasChangesSinceUnlock = false;
                } else {
                    currentClass.seatingLocked = false;
                }
            } else {
                if (!this._wasLockedBeforeEdit) {
                    currentClass.seatingLocked = false;
                }
            }
        }

        this._updateCellsDraggability();
        this._updateSidebarLockState();
        this._updateFooter();
        this._saveGridConfig();

        this._applySmartFit(true);

        if (rBefore && rBefore.width > 0) {
            this._animateFLIPTransition(rBefore, { lockToggle: true });
        }

        TooltipsUI?.initTooltips?.();
        window.dispatchEvent(new CustomEvent('seating-chart:status-changed', {
            detail: { classId: currentClass?.id, locked: this._isLocked }
        }));
    },

    _attachCellDragListeners(cell, student, row, col) {
        if (!cell || !student || cell._hasDragListeners) return;
        cell._hasDragListeners = true;

        cell.addEventListener('dragstart', (e) => {
            if (this._isLocked || cell.classList.contains('pinned')) {
                e.preventDefault();
                return;
            }
            const currentRow = parseInt(cell.dataset.row, 10);
            const currentCol = parseInt(cell.dataset.col, 10);
            const isSelected = this._selectedChipIds.includes(student.id);
            if (!isSelected) {
                this._clearSelection();
                this._dragSource = {
                    type: 'cell',
                    resultId: student.id,
                    row: isNaN(currentRow) ? row : currentRow,
                    col: isNaN(currentCol) ? col : currentCol
                };
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
    },

    _updateCellsDraggability() {
        document.querySelectorAll('#scGridContainer .sc-cell.occupied').forEach(cell => {
            const isPinned = cell.classList.contains('pinned');
            cell.draggable = !this._isLocked && !isPinned;
            if (this._isLocked) {
                const student = this._studentMap?.get(cell.dataset.resultId);
                if (student) {
                    let tooltipText = Utils.formatStudentFirstLastName(student.nom, student.prenom);
                    if (student.isNew) tooltipText += ' • Nouveau';
                    if (student.isDeparted) tooltipText += ' • Départ';
                    cell.setAttribute('data-tooltip', tooltipText);
                }
            } else {
                cell.removeAttribute('data-tooltip');
                const row = parseInt(cell.dataset.row, 10);
                const col = parseInt(cell.dataset.col, 10);
                const student = this._studentMap?.get(cell.dataset.resultId);
                if (student && !isNaN(row) && !isNaN(col)) {
                    this._attachCellDragListeners(cell, student, row, col);
                }
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
    // SMART-FIT & MINIMALIST ZOOM
    // ========================================================================

    _applySmartFit(forceFit = false) {
        const view = document.getElementById('seatingChartView');
        const gridArea = document.getElementById('scGridArea');
        const board = document.getElementById('scClassroomBoard');
        if (!view || !gridArea || !board) return;

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        if (forceFit) {
            this._isFitted = true;
        }

        if (!this._isFitted) {
            const zoomScale = this._zoomScale || (this._fitScale < 0.95 ? 1.0 : 1.25);
            board.style.setProperty('--sc-scale', zoomScale.toString());
            board.style.zoom = zoomScale.toString();
            gridArea.setAttribute('data-fitted', 'false');
            this._updateZoomButtonUI(false, zoomScale);
            return;
        }

        // Reset scroll when in fitted view so board is never clipped or stuck off-screen
        gridArea.style.scrollBehavior = 'auto';
        gridArea.scrollLeft = 0;
        gridArea.scrollTop = 0;
        gridArea.style.removeProperty('scroll-behavior');

        const areaWidth = gridArea.clientWidth || 0;
        const areaHeight = gridArea.clientHeight || 0;
        if (areaWidth <= 0 || areaHeight <= 0) return;

        const isMobile = window.innerWidth <= 768;
        const reservedTop = isMobile ? (56 + 48) : (56 + 24);
        const reservedBottom = isMobile ? 20 : 24;
        const reservedHoriz = isMobile ? 24 : 48;

        // When locked on desktop, account for the sidebar so fit scale is perfectly stable between modes
        const effectiveAreaW = (!isMobile && this._isLocked && areaWidth >= 600) ? (areaWidth - 260) : areaWidth;
        const availW = Math.max(80, effectiveAreaW - reservedHoriz);
        const availH = Math.max(80, areaHeight - reservedTop - reservedBottom);

        board.style.removeProperty('transform');
        board.style.removeProperty('transform-origin');
        board.style.removeProperty('transition');

        const activeZoom = parseFloat(board.style.zoom) || parseFloat(board.style.getPropertyValue('--sc-scale')) || 1;
        const rect = board.getBoundingClientRect?.();
        const boardW = (board.offsetWidth > 0 ? board.offsetWidth : (rect?.width && activeZoom > 0 ? rect.width / activeZoom : 0)) || board.scrollWidth;
        const boardH = (board.offsetHeight > 0 ? board.offsetHeight : (rect?.height && activeZoom > 0 ? rect.height / activeZoom : 0)) || board.scrollHeight;

        if (!boardW || !boardH) return;

        const scaleW = availW / boardW;
        const scaleH = availH / boardH;
        let scale = Math.min(scaleW, scaleH);

        scale = Math.min(1.0, Math.max(0.35, Math.round(scale * 100) / 100));

        this._fitScale = scale;
        this._zoomScale = scale;
        this._isFitted = true;

        board.style.setProperty('--sc-scale', scale.toString());
        board.style.zoom = scale.toString();
        gridArea.setAttribute('data-fitted', 'true');
        this._updateZoomButtonUI(true, scale);
    },

    _toggleZoom() {
        const gridArea = document.getElementById('scGridArea');
        const board = document.getElementById('scClassroomBoard');
        if (!gridArea || !board) return;

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        const rBefore = board.getBoundingClientRect?.() || null;

        if (this._isFitted) {
            // Zoom IN: 1.0 (100%) on mobile, 1.25 (125%) on PC/desktop
            this._isFitted = false;
            const targetScale = this._fitScale < 0.95 ? 1.0 : 1.25;
            this._zoomScale = targetScale;
            board.style.setProperty('--sc-scale', targetScale.toString());
            board.style.zoom = targetScale.toString();
            gridArea.setAttribute('data-fitted', 'false');
            this._updateZoomButtonUI(false, targetScale);

            const maxScrollX = (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0);
            const maxScrollY = (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0);
            if (maxScrollX > 0) gridArea.scrollLeft = Math.round(maxScrollX / 2);
            if (maxScrollY > 0) gridArea.scrollTop = Math.round(maxScrollY / 2);
        } else {
            this._applySmartFit(true);
        }

        if (rBefore && rBefore.width > 0) {
            this._animateFLIPTransition(rBefore);
        }
    },

    _animateFLIPTransition(rBefore, options = {}) {
        const board = document.getElementById('scClassroomBoard');
        if (!board || !rBefore || rBefore.width <= 0) return;

        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (prefersReducedMotion) return;

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        let rAfter = board.getBoundingClientRect?.();
        if (!rAfter || rAfter.width <= 0) {
            board.style.transition = 'transform 0.42s cubic-bezier(0.25, 1, 0.3, 1)';
            board.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            const cleanup = () => {
                board.style.removeProperty('transform');
                board.style.removeProperty('transform-origin');
                board.style.removeProperty('transition');
                this._zoomAnimCleanup = null;
            };
            this._zoomAnimCleanup = cleanup;
            board.addEventListener('transitionend', (e) => {
                if (e.target === board && (!e.propertyName || e.propertyName === 'transform')) {
                    cleanup();
                }
            }, { once: true });
            return;
        }

        const supportsZoom = (typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '1'));
        const zAfter = supportsZoom ? (parseFloat(board.style.getPropertyValue('--sc-scale')) || parseFloat(board.style.zoom) || 1) : 1;
        if (zAfter <= 0) return;

        const isLockToggle = Boolean(options.lockToggle);

        const centerBeforeX = rBefore.left + rBefore.width / 2;
        const centerBeforeY = rBefore.top + rBefore.height / 2;
        const centerAfterX = rAfter.left + rAfter.width / 2;
        const centerAfterY = rAfter.top + rAfter.height / 2;

        const deltaCenterX = Math.round((centerBeforeX - centerAfterX) * 100) / 100;
        // Lock toggle is strictly 1D (horizontal drawer opening/closing). deltaCenterY must be zero to eliminate any vertical jump or wobbling.
        const deltaCenterY = isLockToggle ? 0 : (Math.round((centerBeforeY - centerAfterY) * 100) / 100);
        const scaleX = isLockToggle ? 1 : (Math.round((rBefore.width / rAfter.width) * 1000) / 1000);
        const scaleY = isLockToggle ? 1 : (Math.round((rBefore.height / rAfter.height) * 1000) / 1000);

        if (Math.abs(deltaCenterX) < 1 && Math.abs(deltaCenterY) < 1 && Math.abs(scaleX - 1) < 0.01) {
            return;
        }

        const tx = Math.round((deltaCenterX / zAfter) * 100) / 100;
        const ty = Math.round((deltaCenterY / zAfter) * 100) / 100;

        board.style.transformOrigin = '50% 50%';
        board.style.transition = 'none';
        board.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scaleX}, ${scaleY})`;

        void board.offsetWidth;

        board.style.transition = 'transform 0.42s cubic-bezier(0.25, 1, 0.3, 1)';
        board.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';

        let timer = null;
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (timer) clearTimeout(timer);
            board.style.removeProperty('transform');
            board.style.removeProperty('transform-origin');
            board.style.removeProperty('transition');
            this._zoomAnimCleanup = null;
        };
        this._zoomAnimCleanup = cleanup;

        timer = setTimeout(cleanup, 450);
        board.addEventListener('transitionend', (e) => {
            if (e.target === board && (!e.propertyName || e.propertyName === 'transform')) {
                cleanup();
            }
        }, { once: true });
    },

    _updateZoomButtonUI(isFitted, scale) {
        const zoomBtn = document.getElementById('scFloatingZoomBtn');
        if (!zoomBtn) return;
        const icon = zoomBtn.querySelector('iconify-icon');

        if (isFitted) {
            const nextLabel = (this._fitScale < 0.95) ? 'Agrandir (100%)' : 'Agrandir (125%)';
            if (icon) icon.setAttribute('icon', 'solar:magnifer-zoom-in-linear');
            zoomBtn.setAttribute('aria-label', nextLabel);
            zoomBtn.setAttribute('data-tooltip', nextLabel);
        } else {
            if (icon) icon.setAttribute('icon', 'solar:minimize-square-linear');
            zoomBtn.setAttribute('aria-label', 'Ajuster à l’écran');
            zoomBtn.setAttribute('data-tooltip', 'Ajuster à l’écran');
        }
        TooltipsUI?.initTooltips?.();
    },

    _getMaxZoomScale(minScale = this._fitScale || 0.45) {
        return Math.min(2.5, Math.max(1.8, Math.round(minScale * 2.8 * 100) / 100));
    },

    // ========================================================================
    // PINCH & WHEEL GESTURE ZOOM
    // ========================================================================

    _setupPinchAndWheelZoom(gridArea) {
        if (!gridArea) return;

        let pinchState = null;
        let rafPending = false;

        const onTouchStart = (e) => {
            if (e.touches.length !== 2) {
                if (pinchState) {
                    const stateToFinish = pinchState;
                    pinchState = null;
                    this._endPinch(stateToFinish, gridArea);
                    this._isPinching = false;
                }
                return;
            }

            if (e.cancelable) e.preventDefault();
            this._isPinching = true;

            const board = document.getElementById('scClassroomBoard');
            if (!board) return;

            if (this._zoomAnimCleanup) {
                this._zoomAnimCleanup();
                this._zoomAnimCleanup = null;
            }

            board.style.removeProperty('transform');
            board.style.removeProperty('transition');

            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            if (dist < 10) return;

            const midX = (t1.clientX + t2.clientX) / 2;
            const midY = (t1.clientY + t2.clientY) / 2;

            const minScale = this._fitScale || 0.45;
            const maxScale = this._getMaxZoomScale(minScale);
            const startScale = this._zoomScale || this._fitScale || 1;

            const boardRect = board.getBoundingClientRect?.() || { left: midX, top: midY, width: 300, height: 300 };
            const bw = boardRect.width > 0 ? boardRect.width : 300;
            const bh = boardRect.height > 0 ? boardRect.height : 300;
            const originPercentX = Math.round(((midX - boardRect.left) / bw) * 10000) / 100;
            const originPercentY = Math.round(((midY - boardRect.top) / bh) * 10000) / 100;

            const maxScrollXBefore = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
            const maxScrollYBefore = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));
            const scrollRatioX = maxScrollXBefore > 0 ? (gridArea.scrollLeft / maxScrollXBefore) : 0.5;
            const scrollRatioY = maxScrollYBefore > 0 ? (gridArea.scrollTop / maxScrollYBefore) : 0.5;

            pinchState = {
                startDist: dist,
                startScale,
                minScale,
                maxScale,
                initialMidX: midX,
                initialMidY: midY,
                originPercentX,
                originPercentY,
                boardRect,
                scrollRatioX,
                scrollRatioY,
                currentScale: startScale,
                currentMidX: midX,
                currentMidY: midY
            };

            board.style.transformOrigin = `${originPercentX.toFixed(2)}% ${originPercentY.toFixed(2)}%`;
            board.style.transition = 'none';
        };

        const renderPinch = () => {
            if (!pinchState) return;
            const board = document.getElementById('scClassroomBoard');
            if (!board) return;

            const { currentScale, startScale, initialMidX, initialMidY, currentMidX, currentMidY, minScale } = pinchState;
            const visualScale = currentScale / startScale;

            const panX = (currentMidX - initialMidX) / startScale;
            const panY = (currentMidY - initialMidY) / startScale;

            board.style.transform = (Math.abs(panX) > 0.1 || Math.abs(panY) > 0.1)
                ? `translate3d(${panX.toFixed(2)}px, ${panY.toFixed(2)}px, 0) scale(${visualScale.toFixed(4)})`
                : `scale(${visualScale.toFixed(4)})`;

            const isFittedNow = (currentScale <= minScale + 0.04);
            const zoomBtn = document.getElementById('scFloatingZoomBtn');
            const icon = zoomBtn?.querySelector('iconify-icon');
            if (icon) {
                const targetIcon = isFittedNow ? 'solar:magnifer-zoom-in-linear' : 'solar:minimize-square-linear';
                if (icon.getAttribute('icon') !== targetIcon) {
                    icon.setAttribute('icon', targetIcon);
                }
            }
        };

        const onTouchMove = (e) => {
            if (!pinchState || e.touches.length !== 2) return;
            if (e.cancelable) e.preventDefault();

            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const ratio = dist / pinchState.startDist;
            const rawScale = pinchState.startScale * ratio;

            let effectiveScale = rawScale;

            if (rawScale < pinchState.minScale) {
                const overshoot = pinchState.minScale - rawScale;
                const damped = (overshoot * 0.20) / (1 + (overshoot / (pinchState.minScale * 0.5)));
                effectiveScale = Math.max(pinchState.minScale * 0.85, pinchState.minScale - damped);
            } else if (rawScale > pinchState.maxScale) {
                const overshoot = rawScale - pinchState.maxScale;
                const damped = (overshoot * 0.20) / (1 + (overshoot / (pinchState.maxScale * 0.5)));
                effectiveScale = Math.min(pinchState.maxScale * 1.15, pinchState.maxScale + damped);
            }

            pinchState.currentScale = effectiveScale;
            pinchState.currentMidX = (t1.clientX + t2.clientX) / 2;
            pinchState.currentMidY = (t1.clientY + t2.clientY) / 2;

            if (!rafPending) {
                rafPending = true;
                requestAnimationFrame(() => {
                    rafPending = false;
                    renderPinch();
                });
            }
        };

        const onTouchEnd = (e) => {
            if (!pinchState) return;
            if (e.touches.length < 2) {
                const stateToFinish = pinchState;
                pinchState = null;
                this._endPinch(stateToFinish, gridArea);
                if (e.touches.length === 0) {
                    this._isPinching = false;
                } else {
                    setTimeout(() => { this._isPinching = false; }, 200);
                }
            }
        };

        gridArea.addEventListener('touchstart', onTouchStart, { passive: false });
        gridArea.addEventListener('touchmove', onTouchMove, { passive: false });
        gridArea.addEventListener('touchend', onTouchEnd, { passive: true });
        gridArea.addEventListener('touchcancel', onTouchEnd, { passive: true });

        let wheelDebounceTimer = null;

        gridArea.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();

            const board = document.getElementById('scClassroomBoard');
            if (!board) return;

            if (this._zoomAnimCleanup) {
                this._zoomAnimCleanup();
                this._zoomAnimCleanup = null;
            }

            const minScale = this._fitScale || 0.45;
            const maxScale = this._getMaxZoomScale(minScale);
            const currentScale = this._zoomScale || this._fitScale || 1;

            let dy = e.deltaY;
            if (e.deltaMode === 1) dy *= 16;
            else if (e.deltaMode === 2) dy *= 400;
            dy = Math.max(-100, Math.min(100, dy));

            // Responsive exponential scaling (smooth and natural on trackpads)
            const factor = Math.exp(-dy * 0.006);
            let nextScale = currentScale * factor;

            // Strict desktop boundaries: stops cleanly at min and max zoom without drift or bounce
            nextScale = Math.min(maxScale, Math.max(minScale, Math.round(nextScale * 1000) / 1000));

            if (Math.abs(nextScale - currentScale) < 0.001) return;

            // Cursor-anchored zoom
            const gridRect = gridArea.getBoundingClientRect?.() || { left: 0, top: 0 };
            const mouseX = e.clientX - gridRect.left;
            const mouseY = e.clientY - gridRect.top;
            const prevScrollLeft = gridArea.scrollLeft || 0;
            const prevScrollTop = gridArea.scrollTop || 0;
            const scaleRatio = nextScale / currentScale;

            this._zoomScale = nextScale;
            this._isFitted = (Math.abs(nextScale - minScale) < 0.02);

            board.style.setProperty('--sc-scale', nextScale.toString());
            board.style.zoom = nextScale.toString();
            gridArea.setAttribute('data-fitted', this._isFitted ? 'true' : 'false');
            this._updateZoomButtonUI(this._isFitted, nextScale);

            const newScrollLeft = (prevScrollLeft + mouseX) * scaleRatio - mouseX;
            const newScrollTop = (prevScrollTop + mouseY) * scaleRatio - mouseY;
            const maxScrollX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
            const maxScrollY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));

            if (maxScrollX > 0) {
                gridArea.scrollLeft = Math.max(0, Math.min(maxScrollX, Math.round(newScrollLeft)));
            }
            if (maxScrollY > 0) {
                gridArea.scrollTop = Math.max(0, Math.min(maxScrollY, Math.round(newScrollTop)));
            }

            clearTimeout(wheelDebounceTimer);
            wheelDebounceTimer = setTimeout(() => {
                if (this._isFitted) {
                    this._applySmartFit(true);
                }
            }, 120);
        }, { passive: false });
    },

    _endPinch(pinchState, gridArea) {
        const board = document.getElementById('scClassroomBoard');
        if (!board) return;

        const { currentScale, minScale, maxScale, startScale } = pinchState;
        let targetScale = currentScale;

        if (currentScale < minScale) {
            targetScale = minScale;
        } else if (currentScale > maxScale) {
            targetScale = maxScale;
        } else if (Math.abs(currentScale - minScale) / minScale < 0.08) {
            targetScale = minScale;
        } else {
            targetScale = Math.round(currentScale * 100) / 100;
        }

        const isFitted = (Math.abs(targetScale - minScale) < 0.02);

        // Capture visual bounding box before layout changes
        let rBefore = board.getBoundingClientRect?.() || null;
        if ((!rBefore || rBefore.width <= 0) && pinchState?.boardRect?.width > 0) {
            const visualRatio = currentScale / startScale;
            const b = pinchState.boardRect;
            rBefore = {
                left: b.left + (pinchState.currentMidX - pinchState.initialMidX),
                top: b.top + (pinchState.currentMidY - pinchState.initialMidY),
                width: b.width * visualRatio,
                height: b.height * visualRatio
            };
        }

        // Clear gesture transform so DOM layout box is immediately applied
        board.style.removeProperty('transform');
        board.style.removeProperty('transform-origin');
        board.style.removeProperty('transition');

        if (isFitted) {
            this._zoomScale = minScale;
            this._isFitted = true;
            board.style.setProperty('--sc-scale', minScale.toString());
            board.style.zoom = minScale.toString();
            gridArea.setAttribute('data-fitted', 'true');
            this._updateZoomButtonUI(true, minScale);
            this._applySmartFit(true);
        } else {
            this._zoomScale = targetScale;
            this._isFitted = false;
            board.style.setProperty('--sc-scale', targetScale.toString());
            board.style.zoom = targetScale.toString();
            gridArea.setAttribute('data-fitted', 'false');
            this._updateZoomButtonUI(false, targetScale);

            if (rBefore && rBefore.width > 0) {
                const rMeasured = board.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
                const bw = rMeasured.width > 0 ? rMeasured.width : rBefore.width;
                const bh = rMeasured.height > 0 ? rMeasured.height : rBefore.height;

                const originPctX = pinchState.originPercentX ?? 50;
                const originPctY = pinchState.originPercentY ?? 50;
                const currentMidX = pinchState.currentMidX ?? (rBefore.left + rBefore.width / 2);
                const currentMidY = pinchState.currentMidY ?? (rBefore.top + rBefore.height / 2);

                const targetScrollLeft = (gridArea.scrollLeft || 0) + (rMeasured.left + (originPctX / 100) * bw) - currentMidX;
                const targetScrollTop = (gridArea.scrollTop || 0) + (rMeasured.top + (originPctY / 100) * bh) - currentMidY;

                const maxScrollX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
                const maxScrollY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));

                if (maxScrollX > 0) {
                    gridArea.scrollLeft = Math.max(0, Math.min(maxScrollX, Math.round(targetScrollLeft)));
                }
                if (maxScrollY > 0) {
                    gridArea.scrollTop = Math.max(0, Math.min(maxScrollY, Math.round(targetScrollTop)));
                }
            }
        }

        if (rBefore && rBefore.width > 0) {
            this._animateFLIPTransition(rBefore);
        }
    },

    // ========================================================================
    // OVERSCROLL EDGE REBOUND (iOS/Android Photo-style elastic bounce)
    // ========================================================================

    _setupOverscrollBounce(gridArea) {
        if (!gridArea) return;

        let touchStartX = 0;
        let touchStartY = 0;
        let startScrollLeft = 0;
        let startScrollTop = 0;
        let isTouching = false;
        let isOverscrolling = false;
        let currentOverscrollX = 0;
        let currentOverscrollY = 0;

        let touchSamples = [];
        const recordTouchSample = (x, y) => {
            const now = performance.now();
            touchSamples.push({ t: now, x, y });
            if (touchSamples.length > 6) touchSamples.shift();
            while (touchSamples.length > 2 && (now - touchSamples[0].t) > 120) {
                touchSamples.shift();
            }
        };

        const getReleaseVelocity = () => {
            if (touchSamples.length < 2) return { vx: 0, vy: 0 };
            const first = touchSamples[0];
            const last = touchSamples[touchSamples.length - 1];
            const dt = last.t - first.t;
            if (dt <= 5) return { vx: 0, vy: 0 };
            return {
                vx: (last.x - first.x) / dt,
                vy: (last.y - first.y) / dt
            };
        };

        const clampOverscroll = (excess, maxOvershoot = 64, resistance = 0.35) => {
            if (Math.abs(excess) < 1) return 0;
            const sign = Math.sign(excess);
            const abs = Math.abs(excess);
            const damped = (abs * resistance) / (1 + (abs * resistance) / maxOvershoot);
            return Math.round(sign * damped * 10) / 10;
        };

        const onTouchStart = (e) => {
            if (this._isPinching || e.touches.length !== 1 || this._dragSource || this._touchSourceInfo) {
                if (isOverscrolling) {
                    this._releaseOverscrollBounce();
                    isOverscrolling = false;
                }
                isTouching = false;
                return;
            }

            const board = document.getElementById('scClassroomBoard');
            if (!board) return;

            if (this._zoomAnimCleanup) {
                this._zoomAnimCleanup();
                this._zoomAnimCleanup = null;
            }

            isTouching = true;
            isOverscrolling = false;
            currentOverscrollX = 0;
            currentOverscrollY = 0;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            startScrollLeft = gridArea.scrollLeft;
            startScrollTop = gridArea.scrollTop;
            touchSamples = [{ t: performance.now(), x: touchStartX, y: touchStartY }];
        };

        const onTouchMove = (e) => {
            if (!isTouching || e.touches.length !== 1 || this._dragSource || this._touchSourceInfo) return;

            const board = document.getElementById('scClassroomBoard');
            if (!board) return;

            const touch = e.touches[0];
            recordTouchSample(touch.clientX, touch.clientY);

            const deltaX = touch.clientX - touchStartX;
            const deltaY = touch.clientY - touchStartY;

            const maxScrollX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
            const maxScrollY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));

            let excessX = 0;
            let excessY = 0;

            if (maxScrollX > 0) {
                if (gridArea.scrollLeft <= 1 && deltaX > 0) {
                    excessX = deltaX - (startScrollLeft - gridArea.scrollLeft);
                } else if (gridArea.scrollLeft >= maxScrollX - 2.5 && deltaX < 0) {
                    excessX = deltaX + (gridArea.scrollLeft - startScrollLeft);
                }
            } else {
                excessX = deltaX;
            }

            if (maxScrollY > 0) {
                if (gridArea.scrollTop <= 1 && deltaY > 0) {
                    excessY = deltaY - (startScrollTop - gridArea.scrollTop);
                } else if (gridArea.scrollTop >= maxScrollY - 2.5 && deltaY < 0) {
                    excessY = deltaY + (gridArea.scrollTop - startScrollTop);
                }
            } else {
                excessY = deltaY;
            }

            if (Math.abs(excessX) > 4 || Math.abs(excessY) > 4) {
                const ox = clampOverscroll(excessX);
                const oy = clampOverscroll(excessY);

                if (Math.abs(ox) > 0 || Math.abs(oy) > 0) {
                    isOverscrolling = true;
                    currentOverscrollX = ox;
                    currentOverscrollY = oy;

                    board.style.transition = 'none';
                    board.style.transform = `translate3d(${ox}px, ${oy}px, 0)`;
                }
            } else if (isOverscrolling) {
                board.style.transform = 'translate3d(0, 0, 0)';
                currentOverscrollX = 0;
                currentOverscrollY = 0;
            }
        };

        const onTouchEnd = () => {
            if (!isTouching) return;
            isTouching = false;

            const { vx, vy } = getReleaseVelocity();

            if (isOverscrolling && (currentOverscrollX !== 0 || currentOverscrollY !== 0)) {
                this._releaseOverscrollBounce(currentOverscrollX, currentOverscrollY, vx, vy);
            }
            isOverscrolling = false;
        };

        gridArea.addEventListener('touchstart', onTouchStart, { passive: true });
        gridArea.addEventListener('touchmove', onTouchMove, { passive: true });
        gridArea.addEventListener('touchend', onTouchEnd, { passive: true });
        gridArea.addEventListener('touchcancel', onTouchEnd, { passive: true });

        // Inertial fling edge collision listener (iOS Photos / Android Photo style)
        let lastScrollX = gridArea.scrollLeft;
        let lastScrollY = gridArea.scrollTop;
        let lastScrollTime = performance.now();
        let lastVelocityX = 0;
        let lastVelocityY = 0;
        let lastBounceTime = 0;

        const onScroll = () => {
            if (this._isPinching || isTouching || this._dragSource || this._touchSourceInfo) {
                lastScrollX = gridArea.scrollLeft;
                lastScrollY = gridArea.scrollTop;
                lastScrollTime = performance.now();
                return;
            }

            const now = performance.now();
            const dt = Math.max(1, now - lastScrollTime);
            const currentX = gridArea.scrollLeft;
            const currentY = gridArea.scrollTop;

            const vx = (currentX - lastScrollX) / dt;
            const vy = (currentY - lastScrollY) / dt;

            const maxScrollX = Math.max(0, (gridArea.scrollWidth || 0) - (gridArea.clientWidth || 0));
            const maxScrollY = Math.max(0, (gridArea.scrollHeight || 0) - (gridArea.clientHeight || 0));

            const cooldownElapsed = (now - lastBounceTime) > 350;

            if (cooldownElapsed) {
                let hitEdgeX = 0;
                let hitEdgeY = 0;

                const speedX = currentX < lastScrollX ? Math.min(vx, lastVelocityX) : Math.max(vx, lastVelocityX);
                const speedY = currentY < lastScrollY ? Math.min(vy, lastVelocityY) : Math.max(vy, lastVelocityY);

                // Left boundary collision: moving left into 0
                if (currentX <= 2 && currentX < lastScrollX && lastScrollX > 0.5 && speedX < -0.12) {
                    hitEdgeX = Math.min(36, Math.max(12, Math.round(Math.abs(speedX) * 24)));
                // Right boundary collision: moving right into maxScrollX (with subpixel tolerance)
                } else if (maxScrollX > 0 && currentX >= maxScrollX - 3 && currentX > lastScrollX && lastScrollX < maxScrollX - 0.5 && speedX > 0.12) {
                    hitEdgeX = -Math.min(36, Math.max(12, Math.round(Math.abs(speedX) * 24)));
                }

                // Top boundary collision: moving up into 0
                if (currentY <= 2 && currentY < lastScrollY && lastScrollY > 0.5 && speedY < -0.12) {
                    hitEdgeY = Math.min(36, Math.max(12, Math.round(Math.abs(speedY) * 24)));
                // Bottom boundary collision: moving down into maxScrollY (with subpixel tolerance)
                } else if (maxScrollY > 0 && currentY >= maxScrollY - 3 && currentY > lastScrollY && lastScrollY < maxScrollY - 0.5 && speedY > 0.12) {
                    hitEdgeY = -Math.min(36, Math.max(12, Math.round(Math.abs(speedY) * 24)));
                }

                if (hitEdgeX !== 0 || hitEdgeY !== 0) {
                    lastBounceTime = now;
                    this._triggerEdgeImpactBounce(hitEdgeX, hitEdgeY);
                }
            }

            lastScrollX = currentX;
            lastScrollY = currentY;
            lastScrollTime = now;
            lastVelocityX = vx;
            lastVelocityY = vy;
        };

        gridArea.addEventListener('scroll', onScroll, { passive: true });
    },

    _releaseOverscrollBounce(ox = 0, oy = 0, vx = 0, vy = 0) {
        const board = document.getElementById('scClassroomBoard');
        if (!board) return;

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        let cleaned = false;
        let onTransEnd = null;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (onTransEnd) {
                board.removeEventListener('transitionend', onTransEnd);
                onTransEnd = null;
            }
            board.style.removeProperty('transform');
            board.style.removeProperty('transition');
            if (this._zoomAnimCleanup === cleanup) {
                this._zoomAnimCleanup = null;
            }
        };
        this._zoomAnimCleanup = cleanup;

        const impulseX = (Math.sign(vx) === Math.sign(ox) && Math.abs(vx) > 0.2)
            ? Math.min(32, Math.round(Math.abs(vx) * 28)) * Math.sign(vx)
            : 0;
        const impulseY = (Math.sign(vy) === Math.sign(oy) && Math.abs(vy) > 0.2)
            ? Math.min(32, Math.round(Math.abs(vy) * 28)) * Math.sign(vy)
            : 0;

        if (Math.abs(impulseX) > 4 || Math.abs(impulseY) > 4) {
            const apexX = ox + impulseX;
            const apexY = oy + impulseY;

            board.style.transition = 'transform 0.09s cubic-bezier(0.1, 0.9, 0.2, 1)';
            board.style.transform = `translate3d(${apexX}px, ${apexY}px, 0)`;

            setTimeout(() => {
                if (cleaned) return;
                board.style.transition = 'transform 0.42s cubic-bezier(0.25, 1, 0.3, 1)';
                board.style.transform = 'translate3d(0, 0, 0)';
            }, 85);
        } else {
            board.style.transition = 'transform 0.42s cubic-bezier(0.25, 1, 0.3, 1)';
            board.style.transform = 'translate3d(0, 0, 0)';
        }

        const timer = setTimeout(cleanup, 520);
        onTransEnd = (e) => {
            if (e.target === board && (!e.propertyName || e.propertyName === 'transform')) {
                if (board.style.transform.includes('0px, 0px, 0') || board.style.transform === 'translate3d(0, 0, 0)') {
                    clearTimeout(timer);
                    cleanup();
                }
            }
        };
        board.addEventListener('transitionend', onTransEnd);
    },

    _triggerEdgeImpactBounce(bounceX, bounceY) {
        const board = document.getElementById('scClassroomBoard');
        if (!board) return;

        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
        }

        board.style.transition = 'transform 0.09s cubic-bezier(0.1, 0.9, 0.2, 1)';
        board.style.transform = `translate3d(${bounceX}px, ${bounceY}px, 0)`;

        let cleaned = false;
        let onTransEnd = null;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (onTransEnd) {
                board.removeEventListener('transitionend', onTransEnd);
                onTransEnd = null;
            }
            board.style.removeProperty('transform');
            board.style.removeProperty('transition');
            if (this._zoomAnimCleanup === cleanup) {
                this._zoomAnimCleanup = null;
            }
        };
        this._zoomAnimCleanup = cleanup;

        setTimeout(() => {
            if (cleaned) return;
            board.style.transition = 'transform 0.38s cubic-bezier(0.25, 1, 0.3, 1)';
            board.style.transform = 'translate3d(0, 0, 0)';
        }, 85);

        const timer = setTimeout(cleanup, 500);
        onTransEnd = (e) => {
            if (e.target === board && (!e.propertyName || e.propertyName === 'transform')) {
                if (board.style.transform.includes('0px, 0px, 0') || board.style.transform === 'translate3d(0, 0, 0)') {
                    clearTimeout(timer);
                    cleanup();
                }
            }
        };
        board.addEventListener('transitionend', onTransEnd);
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

        if (this._isFitted) {
            setTimeout(() => this._applySmartFit(), animate ? 560 : 0);
        }

        this._scrollToDesk();
    },

    // ========================================================================
    // PRINT
    // ========================================================================

    _printChart() {
        const classData = appState.classes?.find(c => c.id === appState.currentClassId);
        const className = classData?.name || 'Plan de classe';
        const activeStudents = (this._students || []).filter(s => !this._isStudentDeparted(s));
        const studentCount = activeStudents.length;
        const dateStr = new Date().toLocaleDateString('fr-FR');

        const originalTitle = document.title;
        const safeName = className.replace(/[^a-zA-Z0-9À-ÿ\-_ ]/g, '').trim().replace(/\s+/g, '-');
        document.title = `Plan-de-classe_${safeName}_${new Date().toISOString().slice(0, 10)}`;

        const placed = activeStudents.filter(s => this._getPlacedIds().has(s.id)).length;
        const unplaced = Math.max(0, studentCount - placed);
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
            if (this._hasChangesSinceUnlock || !this._wasLockedBeforeEdit || locked) {
                currentClass.seatingLocked = locked;
            }
        }
        if (this._hasChangesSinceUnlock || locked || !this._wasLockedBeforeEdit) {
            StorageManager.saveAppState();
        }
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

        this._hasChangesSinceUnlock = true;
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

        this._hasChangesSinceUnlock = true;
        if (currentClass) currentClass.seatingLocked = false;
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

        this._hasChangesSinceUnlock = true;
        if (currentClass) currentClass.seatingLocked = false;
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

    _getUnplacedStudents(includeDeparted = false) {
        const placedIds = this._getPlacedIds();
        return this._students.filter(s => !placedIds.has(s.id) && (includeDeparted || !this._isStudentDeparted(s)));
    },

    // ========================================================================
    // UNDO / REDO (Full-snapshot, two-stack)
    // ========================================================================

    _captureSnapshot() {
        const currentClass = this._getCurrentClass();
        return {
            gridState: this._gridState.map(row => [...row]),
            specialLayout: Utils.deepClone(appState.seatingGrid?.specialLayout || {}),
            classSpecialLayout: currentClass?.seatingSpecialLayout
                ? Utils.deepClone(currentClass.seatingSpecialLayout)
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
        this._restoreSnapshot(snapshot);
        if (this._undoStack.length === 0 && this._wasLockedBeforeEdit) {
            this._hasChangesSinceUnlock = false;
            const currentClass = this._getCurrentClass();
            if (currentClass) currentClass.seatingLocked = true;
        }
    },

    _redo() {
        if (this._redoStack.length === 0 || this._isLocked) return;
        this._undoStack.push(this._captureSnapshot());
        const snapshot = this._redoStack.pop();
        this._restoreSnapshot(snapshot);
        this._hasChangesSinceUnlock = true;
        const currentClass = this._getCurrentClass();
        if (currentClass) currentClass.seatingLocked = false;
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
            if (snapshot.classSpecialLayout) {
                currentClass.seatingSpecialLayout = Utils.deepClone(snapshot.classSpecialLayout);
            } else {
                delete currentClass.seatingSpecialLayout;
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
            this._hasChangesSinceUnlock = true;
            const currentClass = this._getCurrentClass();
            if (currentClass) {
                currentClass.seatingUpdatedAt = Date.now();
                currentClass.seatingLocked = false;
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

        if (this._activeSearchTerm) {
            this._applySearchHighlight(this._activeSearchTerm);
        }

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
            const isDeparted = this._isStudentDeparted(student);
            const isNew = this._isStudentNew(student);

            cell.classList.add('occupied');
            if (isDeparted) cell.classList.add('sc-cell-departed');
            if (isNew) cell.classList.add('sc-cell-new');
            if (isDeparted || isNew) cell.classList.add('has-status-badge');
            if (isPinned) cell.classList.add('pinned');
            cell.draggable = !this._isLocked && !isPinned;

            let tooltipText = Utils.formatStudentFirstLastName(student.nom, student.prenom);
            if (isNew) tooltipText += ' • Nouveau';
            if (isDeparted) tooltipText += ' • Départ';

            if (this._isLocked) {
                cell.setAttribute('data-tooltip', tooltipText);
            }

            const statusBadgeHTML = isDeparted
                ? `<span class="sc-cell-status-badge sc-badge-depart">Départ</span>`
                : (isNew ? `<span class="sc-cell-status-badge sc-badge-new">Nouveau</span>` : '');

            cell.innerHTML = `
                ${StudentPhotoManager.getAvatarHTML(student, 'sm')}
                <span class="sc-cell-name">${Utils.formatStudentInitialLabel(student.nom, student.prenom, true)}</span>
                ${statusBadgeHTML}
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
                } else if (this._selectedChipIds.length === 1 && this._selectedChipIds[0] !== student.id) {
                    // Tap-to-Place / Swap: 1 student was selected, user tapped another desk -> Swap or Replace!
                    const selectedId = this._selectedChipIds[0];
                    const srcPos = this._findStudentGridPos(selectedId);
                    if (srcPos) {
                        this._swapGridPositions(srcPos.row, srcPos.col, row, col);
                    } else {
                        this._replaceOccupantWithUnplaced(row, col, selectedId);
                    }
                    this._clearSelection();
                } else if (this._selectedChipIds.length === 1 && this._selectedChipIds[0] === student.id) {
                    this._clearSelection();
                } else if (this._isMobileView() && this._selectedChipIds.length === 0) {
                    // Mobile: Tap on occupied desk opens modern bottom action sheet
                    this._openOccupiedCellSheet(row, col, student);
                } else if (!isPinned) {
                    if (e.shiftKey && this._lastSelectedGridPos) {
                        this._selectGridRange(this._lastSelectedGridPos.row, this._lastSelectedGridPos.col, row, col);
                    } else {
                        this._toggleChipSelection(student.id);
                        this._lastSelectedGridPos = { row, col };
                    }
                } else if (isPinned && this._isMobileView()) {
                    this._openOccupiedCellSheet(row, col, student);
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

            this._attachCellDragListeners(cell, student, row, col);
        } else if (students.length > 1) {
            // Empilement moderne pour plusieurs élèves sur la même place (ex: classe reconstituée)
            cell.classList.add('occupied', 'sc-cell-stacked');
            cell.dataset.resultId = students[0].id;

            const tooltipNames = students.map(s => Utils.formatStudentFirstLastName(s.nom, s.prenom)).join(' • ');
            cell.setAttribute('data-tooltip', tooltipNames);

            const avatarsHtml = students.map((s, idx) => `
                <div class="sc-stacked-avatar" style="--stack-index: ${idx}; z-index: ${students.length - idx};" data-result-id="${s.id}" title="${Utils.formatStudentFirstLastName(s.nom, s.prenom)}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                </div>
            `).join('');

            const namesHtml = students.map(s => `
                <span class="sc-stacked-name" data-result-id="${s.id}" title="${Utils.formatStudentFirstLastName(s.nom, s.prenom)}">${Utils.formatStudentInitialLabel(s.nom, s.prenom, true)}</span>
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
                if (this._isLocked) return;
                if (this._selectedChipIds.length > 0 && !special) {
                    const selectedId = this._selectedChipIds[0];
                    const srcPos = this._selectedChipIds.length === 1 ? this._findStudentGridPos(selectedId) : null;
                    if (srcPos) {
                        this._snapshotGrid();
                        this._gridState[srcPos.row][srcPos.col] = null;
                        this._gridState[row][col] = selectedId;
                        this._clearSelection();
                        this._savePositionsToState();
                        this._render();
                        this._animateCellPlaced(row, col);
                        const s = this._studentMap?.get(selectedId) || this._students.find(st => st.id === selectedId);
                        if (s) UI?.showNotification?.(`${s.prenom || s.nom} déplacé`, 'info');
                    } else {
                        this._placeSelectedAt(row, col);
                    }
                } else if (this._selectedChipIds.length === 0) {
                    if (this._isMobileView()) {
                        this._openEmptyCellSheet(row, col, special);
                    }
                }
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

        const unplaced = this._getUnplacedStudents(false);
        const departedUnplaced = this._getUnplacedStudents(true).filter(s => this._isStudentDeparted(s));

        const sorted = [...unplaced].sort((a, b) =>
            `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' })
        );

        const searchTerm = (document.getElementById('scSearchInput')?.value || '').trim();
        const currentClassName = this._getCurrentClass()?.name || '';

        const filtered = searchTerm
            ? sorted.filter(s => Utils.matchesStudent(s, searchTerm, { currentClassName }))
            : sorted;

        const filteredDeparted = searchTerm
            ? departedUnplaced.filter(s => Utils.matchesStudent(s, searchTerm, { currentClassName }))
            : departedUnplaced;

        const activeListHtml = filtered.length === 0
            ? `<div class="sc-empty-sidebar ${unplaced.length === 0 ? 'sc-empty-success' : ''}">
                 ${unplaced.length === 0 
                    ? `<div class="sc-empty-text"><strong>Bravo&nbsp;!</strong><br>Tous les élèves sont placés&nbsp;!</div>
                       <iconify-icon icon="solar:check-circle-bold-duotone" class="sc-empty-success-icon"></iconify-icon>`
                    : 'Aucun résultat'}
               </div>`
            : filtered.map((s, index) => `
                <div class="${isReset ? 'sc-student-chip sc-chip-stagger' : 'sc-student-chip'}${s.isNew ? ' sc-chip-new' : ''}" ${isReset ? `style="--chip-i: ${index}"` : ''} draggable="true" data-result-id="${s.id}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                    <span class="sc-student-chip-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                    ${s.isNew ? '<span class="sc-chip-badge sc-chip-badge-new">Nouveau</span>' : ''}
                </div>
            `).join('');

        const departedHtml = filteredDeparted.length > 0
            ? `<div class="sc-sidebar-departed-section">
                <div class="sc-sidebar-departed-header">
                    <iconify-icon icon="solar:user-cross-linear"></iconify-icon>
                    <span>Élève${filteredDeparted.length > 1 ? 's' : ''} parti${filteredDeparted.length > 1 ? 's' : ''} (${filteredDeparted.length})</span>
                </div>
                <div class="sc-sidebar-departed-list">
                    ${filteredDeparted.map(s => `
                        <div class="sc-student-chip sc-chip-departed" draggable="true" data-result-id="${s.id}">
                            ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                            <span class="sc-student-chip-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                            <span class="sc-chip-badge sc-chip-badge-depart">Départ</span>
                        </div>
                    `).join('')}
                </div>
            </div>`
            : '';

        list.innerHTML = activeListHtml + departedHtml;

        const allVisible = [...filtered, ...filteredDeparted];

        // Attach listeners regardless of lock state — sidebar is pointer-events: none when locked anyway
        list.querySelectorAll('.sc-student-chip').forEach((chip, index) => {
            const id = chip.dataset.resultId;

            chip.addEventListener('dragstart', (e) => {
                if (this._isLocked) {
                    e.preventDefault();
                    return;
                }
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
                if (e.defaultPrevented || this._isLocked) return;
                if (e.shiftKey && this._lastSelectedSidebarIndex !== null) {
                    this._selectSidebarRange(this._lastSelectedSidebarIndex, index, allVisible);
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
        const activeStudents = this._students.filter(s => !this._isStudentDeparted(s));
        const total = activeStudents.length;
        const placed = this._getPlacedIds().size;
        const placedActive = activeStudents.filter(s => this._getPlacedIds().has(s.id)).length;
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
        const unplaced = Math.max(0, total - placedActive);

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
            const ratio = total > 0 ? Math.min(100, (placedActive / total) * 100) : 0;
            fill.style.width = `${ratio}%`;
            const isFull = placedActive >= total && total > 0;
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

    _isStudentDeparted(studentResult, activePeriod = appState.currentPeriod || 'T1') {
        if (!studentResult) return false;
        const statuses = studentResult.studentData?.statuses || studentResult.statuses || [];
        if (Array.isArray(statuses) && statuses.length > 0) {
            const departStatus = statuses.find(s => {
                const lower = (s || '').toLowerCase();
                return lower.includes('départ') || lower.includes('depart');
            });
            if (departStatus) {
                const parts = departStatus.trim().split(/\s+/);
                if (parts.length === 1) return true;

                const departPeriodKey = parts[1];
                const periods = typeof Utils.getPeriods === 'function' ? Utils.getPeriods() : ['T1', 'T2', 'T3'];
                const departPeriodIndex = periods.indexOf(departPeriodKey);
                const activePeriodIndex = periods.indexOf(activePeriod);

                if (departPeriodIndex === -1 || activePeriodIndex === -1) return true;
                return activePeriodIndex >= departPeriodIndex;
            }
            return false;
        }
        if (studentResult.isDeparted !== undefined) return Boolean(studentResult.isDeparted);
        return false;
    },

    _isStudentNew(studentResult, activePeriod = appState.currentPeriod || 'T1') {
        if (!studentResult) return false;
        const statuses = studentResult.studentData?.statuses || studentResult.statuses || [];
        if (Array.isArray(statuses) && statuses.length > 0) {
            const newStatus = statuses.find(s => {
                const lower = (s || '').toLowerCase();
                return lower.includes('nouveau');
            });
            if (newStatus) {
                const parts = newStatus.trim().split(/\s+/);
                if (parts.length === 1) return true;

                const newPeriodKey = parts[1];
                return newPeriodKey === activePeriod;
            }
            return false;
        }
        if (studentResult.isNew !== undefined) return Boolean(studentResult.isNew);
        return false;
    },

    getClassSeatingStatus(cls) {
        if (!cls) return { status: 'empty', label: 'À faire', shortLabel: 'À faire', icon: 'solar:map-point-linear', unplaced: 0, placed: 0, total: 0 };

        const classResults = ClassManager.getStudentsForClass(cls.id);
        const activeResults = classResults.filter(r => !this._isStudentDeparted(r));
        const total = activeResults.length;
        const placedActive = activeResults.filter(r => r.seatingPosition?.row != null && r.seatingPosition?.col != null).length;
        const totalPlaced = classResults.filter(r => r.seatingPosition?.row != null && r.seatingPosition?.col != null).length;
        const unplaced = Math.max(0, total - placedActive);

        if (total === 0 || totalPlaced === 0) {
            return {
                status: 'empty',
                label: 'À faire',
                shortLabel: 'À faire',
                icon: 'solar:map-point-linear',
                placed: totalPlaced,
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
                placed: totalPlaced,
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
        const info = this.getClassSeatingStatus(currentClass);

        if (info.status === 'empty') {
            pill.style.display = 'none';
            pill.innerHTML = '';
            return;
        }

        pill.className = `sc-status-pill sc-status-${info.status}`;
        pill.style.display = '';
        pill.setAttribute('role', 'button');
        pill.setAttribute('tabindex', '0');

        const dateText = info.dateStr ? ` · ${info.dateStr}` : '';
        const unplacedWarning = info.unplaced > 0
            ? `<span class="sc-status-pill-sep">·</span><span class="sc-status-pill-unplaced"><iconify-icon icon="solar:danger-triangle-bold"></iconify-icon><span>${info.unplaced} non placé${info.unplaced > 1 ? 's' : ''}</span></span>`
            : '';

        const isLocked = info.status === 'locked';
        const iconRest = isLocked ? 'solar:lock-bold' : 'solar:test-tube-linear';
        const labelRest = isLocked ? 'Validé' : 'En test';
        const actionLabel = 'Modifier';
        const tooltipText = info.unplaced > 0 
            ? `Plan ${isLocked ? 'validé' : 'en test'}${dateText} (${info.unplaced} non placé${info.unplaced > 1 ? 's' : ''}) • Cliquer pour modifier` 
            : `Plan ${isLocked ? 'validé' : 'en test'}${dateText} • Cliquer pour modifier`;

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
                    ${unplacedWarning}
                </div>
            </div>
        `;

        pill.removeAttribute('title');
        pill.removeAttribute('data-tooltip');
        pill.setAttribute('aria-label', `${labelRest}${dateText}. Cliquer pour passer en mode édition`);
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
        this._haptic(isSwap ? [12, 40, 12] : 15);

        if (type === 'sidebar') {
            this._animateCellPlaced(targetRow, targetCol);
        } else if (isSwap) {
            this._animateCellSwap(srcRow, srcCol, targetRow, targetCol);
        } else {
            this._animateCellPlaced(targetRow, targetCol);
        }

        if (this._isMobileView() && window.UI?.showNotification) {
            const student = this._studentMap?.get(resultId);
            const sName = student ? `${student.prenom || ''} ${student.nom || ''}`.trim() : 'Élève';
            const actionMsg = isSwap ? 'Places permutées' : `${sName} placé`;
            window.UI.showNotification(actionMsg, 'info', 4000, {
                group: 'sc-undo-toast',
                replaceExisting: true,
                bypassCoalescing: true,
                icon: 'solar:undo-left-round-linear',
                action: {
                    label: 'Annuler',
                    onClick: () => {
                        this._undo();
                        if (typeof navigator !== 'undefined' && navigator.vibrate) {
                            try { navigator.vibrate(15); } catch (_) {}
                        }
                    }
                }
            });
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
            this._haptic(12);
            this._renderSidebar(removedId);
            this._updateFooter();
            this._updateSidebarLockState();
            this._onRemovalComplete();

            if (this._isMobileView() && window.UI?.showNotification) {
                window.UI.showNotification('Élève retiré du plan', 'info', 4000, {
                    group: 'sc-undo-toast',
                    replaceExisting: true,
                    bypassCoalescing: true,
                    icon: 'solar:undo-left-round-linear',
                    action: {
                        label: 'Annuler',
                        onClick: () => {
                            this._undo();
                            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                                try { navigator.vibrate(15); } catch (_) {}
                            }
                        }
                    }
                });
            }
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

        this._hasChangesSinceUnlock = true;
        const currentClass = this._getCurrentClass();
        if (currentClass) currentClass.seatingLocked = false;
        StorageManager.saveAppState();
        this._render();
        this._haptic(10);
    },

    _haptic(pattern = 15) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(pattern); } catch (_) {}
        }
    },

    // ========================================================================
    // TOUCH DRAG & DROP
    // ========================================================================

    _addTouchDrag(element, sourceInfo) {
        let startX, startY, hasMoved = false;
        let isScrolling = false;
        let longPressTimer = null;

        element.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || this._isLocked || element.classList.contains('pinned')) return;
            this._dismissOnboardingHint();
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            hasMoved = false;
            isScrolling = false;
            
            let activeSourceInfo = { ...sourceInfo };
            if (element.dataset.row !== undefined && element.dataset.col !== undefined) {
                const r = parseInt(element.dataset.row, 10);
                const c = parseInt(element.dataset.col, 10);
                if (!isNaN(r) && !isNaN(c)) {
                    activeSourceInfo.row = r;
                    activeSourceInfo.col = c;
                }
            }
            if (sourceInfo.resultId && this._selectedChipIds.includes(sourceInfo.resultId)) {
                activeSourceInfo = { type: 'multi-cell', ids: [...this._selectedChipIds] };
            }
            this._touchSourceInfo = activeSourceInfo;

            // Long-press affordance on mobile (280ms hold triggers drag in any direction with subtle haptic):
            // - Sidebar chips: hold unlocks free omnidirectional drag
            // - Board cells: hold lifts the desk to drag, leaving quick swipes to pan/scroll the board!
            if (this._isMobileView()) {
                clearTimeout(longPressTimer);
                longPressTimer = setTimeout(() => {
                    if (!hasMoved && !isScrolling && this._touchSourceInfo) {
                        hasMoved = true;
                        this._haptic(18);
                        if (sourceInfo.resultId && !this._selectedChipIds.includes(sourceInfo.resultId)) {
                            this._clearSelection();
                        }
                        this._createTouchGhost(element, touch);
                    }
                }, 280);
            }
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (!this._touchSourceInfo || this._isLocked || isScrolling || element.classList.contains('pinned')) return;
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;

            // Mobile gestures disambiguation
            if (!hasMoved && this._isMobileView()) {
                if (sourceInfo.type === 'sidebar') {
                    // Horizontal motion in bottom tray: prioritize native horizontal list scrolling
                    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
                        isScrolling = true;
                        clearTimeout(longPressTimer);
                        this._touchSourceInfo = null;
                        return;
                    }

                    // Vertical motion pulling upward toward the board: engage drag immediately
                    if (dy < -12 && Math.abs(dy) > Math.abs(dx) * 1.1) {
                        clearTimeout(longPressTimer);
                        hasMoved = true;
                        if (sourceInfo.resultId && !this._selectedChipIds.includes(sourceInfo.resultId)) {
                            this._clearSelection();
                        }
                        this._createTouchGhost(element, touch);
                    }
                } else if (sourceInfo.type === 'cell' || sourceInfo.type === 'multi-cell') {
                    // On board: any quick motion before long-press is board panning/scrolling
                    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
                        isScrolling = true;
                        clearTimeout(longPressTimer);
                        this._touchSourceInfo = null;
                        return;
                    }
                }
            } else if (!hasMoved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                clearTimeout(longPressTimer);
                hasMoved = true;
                if (sourceInfo.resultId && !this._selectedChipIds.includes(sourceInfo.resultId)) {
                    this._clearSelection();
                }
                this._createTouchGhost(element, touch);
            }

            if (hasMoved && this._touchDragEl) {
                if (e.cancelable) e.preventDefault();
                this._touchDragEl.style.left = `${touch.clientX}px`;
                this._touchDragEl.style.top = `${touch.clientY}px`;
                this._highlightCellUnderTouch(touch.clientX, touch.clientY);
            }
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            clearTimeout(longPressTimer);
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

        element.addEventListener('touchcancel', () => {
            clearTimeout(longPressTimer);
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

        ghost.style.left = `${touch.clientX}px`;
        ghost.style.top = `${touch.clientY}px`;
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
        if (sourceEl.classList.contains('has-status-badge')) {
            clone.classList.add('has-status-badge');
        }
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
                    const topTarget = this._orientation === 'student' ? 0 : (gridArea.scrollHeight || 0) + 500;
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
    },

    // ========================================================================
    // SEARCH & SPOTLIGHT
    // ========================================================================

    _openSearch() {
        const wrap = document.getElementById('scFloatingSearch');
        const input = document.getElementById('scFloatingSearchInput');
        if (!wrap || !input) return;
        wrap.classList.add('open');
        requestAnimationFrame(() => {
            input.focus({ preventScroll: true });
            input.select();
        });
    },

    _closeSearch() {
        const wrap = document.getElementById('scFloatingSearch');
        const input = document.getElementById('scFloatingSearchInput');
        if (!wrap) return;
        wrap.classList.remove('open');
        if (input) input.value = '';
        this._applySearchHighlight('');
        const sug = document.getElementById('scFloatingSearchSuggestions');
        if (sug) {
            sug.style.display = 'none';
            sug.innerHTML = '';
        }
    },

    _isSearchOpen() {
        return document.getElementById('scFloatingSearch')?.classList.contains('open') || false;
    },

    _handleSearchEscape() {
        const input = document.getElementById('scFloatingSearchInput');
        if (input && input.value) {
            input.value = '';
            this._applySearchHighlight('');
            input.focus();
        } else {
            this._closeSearch();
        }
    },

    async _handleSearchEnter(value) {
        const cleaned = (value || '').trim();
        if (!cleaned) return;

        const currentClassName = this._getCurrentClass()?.name || '';
        const matchedStudents = (this._students || []).filter(student =>
            Utils.matchesStudent(student, cleaned, { currentClassName })
        );

        if (matchedStudents.length > 0) {
            const index = this._searchMatchIndex % matchedStudents.length;
            const targetStudent = matchedStudents[index];
            this._searchMatchIndex = (index + 1) % matchedStudents.length;

            const targetCell = document.querySelector(`#scGridContainer .sc-cell[data-result-id="${targetStudent.id}"]`);
            if (targetCell && typeof targetCell.scrollIntoView === 'function') {
                targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }

            const countBadge = document.getElementById('scFloatingSearchCount');
            if (countBadge && matchedStudents.length > 1) {
                countBadge.textContent = `${index + 1}/${matchedStudents.length}`;
            }

            if (this._isLocked) {
                FocusPanelManager.open(targetStudent.id);
            } else {
                this._toggleChipSelection(targetStudent.id);
            }
        } else {
            const crossData = CrossClassSearchManager.searchAcrossClasses(cleaned);
            if (crossData.groups && crossData.groups.length > 0) {
                const firstGroup = crossData.groups[0];
                const targetClassId = firstGroup.classId;
                const targetStudentId = firstGroup.students?.[0]?.id;
                const sug = document.getElementById('scFloatingSearchSuggestions');
                if (sug) {
                    sug.style.display = 'none';
                    sug.innerHTML = '';
                }
                await this._switchClassFromSearch(targetClassId, targetStudentId, cleaned);
            }
        }
    },

    _applySearchHighlight(term) {
        const cleaned = (term || '').trim();
        this._activeSearchTerm = cleaned;
        this._searchMatchIndex = 0;

        const view = document.getElementById('seatingChartView');
        const countBadge = document.getElementById('scFloatingSearchCount');
        const clearBtn = document.getElementById('scFloatingSearchClear');
        const suggestionsEl = document.getElementById('scFloatingSearchSuggestions');

        if (clearBtn) {
            clearBtn.classList.toggle('visible', cleaned.length > 0);
        }

        if (!cleaned) {
            if (view) view.classList.remove('sc-search-active');
            if (countBadge) {
                countBadge.textContent = '';
                countBadge.style.display = 'none';
            }
            if (suggestionsEl) {
                suggestionsEl.style.display = 'none';
                suggestionsEl.innerHTML = '';
            }
            document.querySelectorAll('#scGridContainer .sc-cell').forEach(cell => {
                cell.classList.remove('sc-spotlight-match', 'sc-spotlight-dimmed', 'sc-spotlight-single');
            });
            document.querySelectorAll('#scStudentList .sc-student-chip').forEach(chip => {
                chip.classList.remove('sc-spotlight-match', 'sc-spotlight-dimmed');
            });
            return;
        }

        if (view) view.classList.add('sc-search-active');

        // 1. Matched students in current class
        const matchedStudentIds = new Set();
        const currentClassName = this._getCurrentClass()?.name || '';
        (this._students || []).forEach(student => {
            if (Utils.matchesStudent(student, cleaned, { currentClassName })) {
                matchedStudentIds.add(student.id);
            }
        });

        const matchCount = matchedStudentIds.size;
        if (countBadge) {
            countBadge.style.display = 'inline-flex';
            countBadge.textContent = String(matchCount);
            countBadge.classList.toggle('sc-count-zero', matchCount === 0);
        }

        // 2. Grid cells
        const cells = document.querySelectorAll('#scGridContainer .sc-cell');
        cells.forEach(cell => {
            const r = Number(cell.dataset.row);
            const c = Number(cell.dataset.col);
            const cellContent = this._gridState[r]?.[c];
            const studentIds = Array.isArray(cellContent) ? cellContent : (cellContent ? [cellContent] : []);

            const isMatch = studentIds.some(id => matchedStudentIds.has(id));
            if (isMatch) {
                cell.classList.remove('sc-spotlight-dimmed');
                cell.classList.add('sc-spotlight-match');
                cell.classList.toggle('sc-spotlight-single', matchCount === 1);
            } else {
                cell.classList.remove('sc-spotlight-match', 'sc-spotlight-single');
                cell.classList.add('sc-spotlight-dimmed');
            }
        });

        // Auto-scroll to single match if out of view
        if (matchCount === 1) {
            const singleCell = document.querySelector('#scGridContainer .sc-cell.sc-spotlight-match');
            if (singleCell && typeof singleCell.scrollIntoView === 'function') {
                singleCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        }

        // 3. Sidebar chips
        document.querySelectorAll('#scStudentList .sc-student-chip').forEach(chip => {
            const chipId = chip.dataset.resultId;
            if (matchedStudentIds.has(chipId)) {
                chip.classList.remove('sc-spotlight-dimmed');
                chip.classList.add('sc-spotlight-match');
            } else {
                chip.classList.remove('sc-spotlight-match');
                chip.classList.add('sc-spotlight-dimmed');
            }
        });

        // 4. Cross-class suggestions if 0 matches and term >= 2
        if (matchCount === 0 && cleaned.length >= 2 && suggestionsEl) {
            const crossData = CrossClassSearchManager.searchAcrossClasses(cleaned);
            if (crossData.groups && crossData.groups.length > 0) {
                const firstGroup = crossData.groups[0];
                const firstStudent = firstGroup.students?.[0];
                const studentNames = firstGroup.students.map(s => `${s.prenom} ${s.nom}`).slice(0, 2).join(', ');
                suggestionsEl.innerHTML = `
                    <div class="sc-cross-suggestion-pill">
                        <span class="sc-cross-hint">Non trouvé dans cette classe</span>
                        <button class="sc-cross-action" type="button" data-class-id="${firstGroup.classId}" data-student-id="${firstStudent?.id || ''}">
                            <iconify-icon icon="solar:square-academic-cap-linear"></iconify-icon>
                            <span>Trouvé en <strong>${Utils.escapeHtml(firstGroup.className)}</strong> (${Utils.escapeHtml(studentNames)})</span>
                            <iconify-icon icon="solar:alt-arrow-right-linear" class="sc-cross-arrow"></iconify-icon>
                        </button>
                    </div>
                `;
                suggestionsEl.style.display = 'block';

                const actionBtn = suggestionsEl.querySelector('.sc-cross-action');
                if (actionBtn) {
                    actionBtn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                    });
                    actionBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const targetClassId = actionBtn.dataset.classId;
                        const targetStudentId = actionBtn.dataset.studentId;
                        if (targetClassId) {
                            const sug = document.getElementById('scFloatingSearchSuggestions');
                            if (sug) {
                                sug.style.display = 'none';
                                sug.innerHTML = '';
                            }
                            await this._switchClassFromSearch(targetClassId, targetStudentId, this._activeSearchTerm || cleaned);
                        }
                    });
                }
            } else {
                suggestionsEl.style.display = 'none';
                suggestionsEl.innerHTML = '';
            }
        } else if (suggestionsEl) {
            suggestionsEl.style.display = 'none';
            suggestionsEl.innerHTML = '';
        }
    },

    async _switchClassFromSearch(classId, studentId = null, term = '') {
        const classInfo = ClassManager.getClassById(classId);
        const className = classInfo?.name || 'Classe';

        if (typeof ClassUIManager?.handleClassSwitch === 'function') {
            await ClassUIManager.handleClassSwitch(classId, studentId);
        } else {
            await ClassManager.switchClass(classId);
        }

        UI?.showNotification?.(`Basculé vers ${className}`, 'info');

        // Maintenir la barre de recherche ouverte avec le terme actif
        const searchWrap = document.getElementById('scFloatingSearch');
        const searchInput = document.getElementById('scFloatingSearchInput');
        if (searchWrap) searchWrap.classList.add('open');
        if (searchInput && term) searchInput.value = term;

        // Ré-appliquer le spotlight dans la nouvelle classe (compteur à 1, halo actif)
        if (term) {
            this._applySearchHighlight(term);
        }

        // Focaliser l'élève ciblé (centrage écran + FocusPanel en consultation ou sélection en édition)
        if (studentId) {
            this._focusStudentAfterSwitch(studentId);
        }
    },

    _focusStudentAfterSwitch(studentId) {
        setTimeout(() => {
            // A. Si l'élève est placé sur une table
            const cells = document.querySelectorAll('#scGridContainer .sc-cell');
            for (const cell of cells) {
                const r = Number(cell.dataset.row);
                const c = Number(cell.dataset.col);
                const content = this._gridState[r]?.[c];
                const ids = Array.isArray(content) ? content : (content ? [content] : []);
                if (ids.includes(studentId)) {
                    cell.classList.add('sc-spotlight-match', 'sc-spotlight-single');
                    if (typeof cell.scrollIntoView === 'function') {
                        cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    }

                    if (!this._isLocked && !this._selectedChipIds.includes(studentId)) {
                        this._toggleChipSelection(studentId);
                    }
                    return;
                }
            }

            // B. Si l'élève est dans la liste latérale
            const chip = document.querySelector(`#scStudentList .sc-student-chip[data-result-id="${studentId}"]`);
            if (chip) {
                chip.classList.add('sc-spotlight-match');
                if (typeof chip.scrollIntoView === 'function') {
                    chip.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                if (!this._isLocked && !this._selectedChipIds.includes(studentId)) {
                    this._toggleChipSelection(studentId);
                }
            }
        }, 220);
    }
};
