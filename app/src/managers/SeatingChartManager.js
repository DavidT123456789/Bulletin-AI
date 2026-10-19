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
import { CrossClassSearchManager } from './CrossClassSearchManager.js';
import { HistoryManager } from './HistoryManager.js';
import { SeatingAnimations } from './seating/SeatingAnimations.js';
import { SeatingZoom } from './seating/SeatingZoom.js';
import { SeatingAutoPlace } from './seating/SeatingAutoPlace.js';
import { SeatingSearch } from './seating/SeatingSearch.js';

const DEFAULT_COLS = 6;
const DEFAULT_ROWS = 5;
const MIN_COLS = 2;
const MAX_COLS = 10;
const MIN_ROWS = 2;
const MAX_ROWS = 10;
const DEFAULT_ACTIVITY_COLS = 5;
const DEFAULT_ACTIVITY_ROWS = 3;
const MAX_ACTIVITY_GROUP_SIZE = 4;
const MAX_UNDO_LEVELS = 5;

export const SeatingChartManager = {
    _isActive: false,
    _isLocked: false,
    _wasLockedBeforeEdit: false,
    _hasChangesSinceUnlock: false,
    _planMode: 'course',
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
    _modeCarouselTimer: null,
    _activeMobileSheet: null,
    _activeSearchTerm: '',
    _searchMatchIndex: 0,
    _onboardingStep: null,

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
        view.dataset.planMode = this._planMode || 'course';
        view.style.display = 'none';
        view.innerHTML = `
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
                                        ${this._getPlacementPopoverHTML()}
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
                                        <div class="sc-config-presets-section" id="scConfigPresetsSection">
                                            <div class="sc-config-section-title">Disposition de la salle</div>
                                            <div class="sc-config-preset-pills" role="group" aria-label="Modèles de salle">
                                                <button type="button" class="sc-config-preset-pill" data-preset="compact" data-tooltip="Grille continue sans allée">
                                                    <span class="sc-mini-diagram is-compact" aria-hidden="true">
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                                                    </span>
                                                    <span>Sans allée</span>
                                                </button>
                                                <button type="button" class="sc-config-preset-pill" data-preset="center-aisle" data-tooltip="2 îlots de 3 tables (1 allée centrale)">
                                                    <span class="sc-mini-diagram is-center-aisle" aria-hidden="true">
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><b class="aisle"></b><i></i><i></i><i></i></span>
                                                    </span>
                                                    <span>1 allée</span>
                                                </button>
                                                <button type="button" class="sc-config-preset-pill" data-preset="double-aisles" data-tooltip="3 rangées doubles (2 allées)">
                                                    <span class="sc-mini-diagram is-double-aisles" aria-hidden="true">
                                                        <span class="sc-mini-row"><i></i><i></i><b class="aisle"></b><i></i><i></i><b class="aisle"></b><i></i><i></i></span>
                                                    </span>
                                                    <span>2 allées</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div class="sc-config-row">
                                            <label class="sc-config-label" for="scColsSlider">Colonnes</label>
                                            <button type="button" class="sc-config-step-btn" data-dim="cols" data-delta="-1" aria-label="Moins de colonnes">
                                                <iconify-icon icon="ph:minus-bold"></iconify-icon>
                                            </button>
                                            <input type="range" id="scColsSlider" min="2" max="10" value="${DEFAULT_COLS}">
                                            <button type="button" class="sc-config-step-btn" data-dim="cols" data-delta="1" aria-label="Plus de colonnes">
                                                <iconify-icon icon="ph:plus-bold"></iconify-icon>
                                            </button>
                                            <span class="sc-config-value" id="scColsValue">${DEFAULT_COLS}</span>
                                        </div>
                                        <div class="sc-config-row">
                                            <label class="sc-config-label" for="scRowsSlider">Rangées</label>
                                            <button type="button" class="sc-config-step-btn" data-dim="rows" data-delta="-1" aria-label="Moins de rangées">
                                                <iconify-icon icon="ph:minus-bold"></iconify-icon>
                                            </button>
                                            <input type="range" id="scRowsSlider" min="2" max="10" value="${DEFAULT_ROWS}">
                                            <button type="button" class="sc-config-step-btn" data-dim="rows" data-delta="1" aria-label="Plus de rangées">
                                                <iconify-icon icon="ph:plus-bold"></iconify-icon>
                                            </button>
                                            <span class="sc-config-value" id="scRowsValue">${DEFAULT_ROWS}</span>
                                        </div>
                                        <div class="sc-config-capacity" id="scConfigCapacity"></div>
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
                        <button type="button" class="sc-quick-group-btn" id="scQuickGroupBtn" style="display: none;"></button>
                        <span id="scFooterInfo" style="display: none;" aria-hidden="true"></span>
                        <div class="sc-search-box">
                            <iconify-icon class="sc-search-field-icon" icon="solar:magnifer-linear"></iconify-icon>
                            <input type="text" id="scSearchInput" class="custom-input" placeholder="Rechercher..." autocomplete="off">
                            <button class="sc-search-clear" id="scSearchClear" aria-label="Effacer" type="button">
                                <iconify-icon icon="ph:x"></iconify-icon>
                            </button>
                        </div>
                    </div>
                    <div class="sc-student-list" id="scStudentList"></div>
                </div>
                <div class="sc-grid-area" id="scGridArea">
                    <!-- Top-Left Bar: Plan Mode Switcher (Cours | Activité) -->
                    <div class="sc-top-left-bar" id="scTopLeftBar">
                        <div class="sc-plan-mode-switch" id="scPlanModeSwitch" role="tablist" aria-label="Mode du plan de classe">
                            <div class="sc-mode-glider" aria-hidden="true"></div>
                            <button class="sc-mode-tab active" data-plan-mode="course" data-full-label="Cours" role="tab" aria-selected="true" aria-label="Mode Cours" type="button">
                                <iconify-icon icon="solar:chair-linear"></iconify-icon>
                                <span class="sc-mode-label period-label-text is-expanded">Cours</span>
                            </button>
                            <button class="sc-mode-tab" data-plan-mode="activity" data-full-label="Activité" role="tab" aria-selected="false" aria-label="Mode Activité" data-tooltip="Passer en mode Activité" type="button">
                                <iconify-icon icon="solar:monitor-linear"></iconify-icon>
                                <span class="sc-mode-label period-label-text is-collapsed">Activité</span>
                            </button>
                        </div>
                    </div>

                    <!-- Bottom-Left Status Pill (Consultation mode) -->
                    <div class="sc-status-pill" id="scStatusPill" role="button" tabindex="0"></div>

                    <div class="sc-classroom-board" id="scClassroomBoard" data-plan-mode="${this._planMode || 'course'}" data-locked="${this._isLocked ? 'true' : 'false'}">
                        <div class="sc-grid-container" id="scGridContainer"></div>
                        <div class="sc-desk-row">
                            <div class="sc-desk" id="scDesk" role="button" tabindex="0" aria-label="Vue Prof active (cliquer pour inverser la vue)" data-tooltip="Vue Prof active • Inverser"><iconify-icon class="sc-desk-cap" icon="solar:square-academic-cap-linear"></iconify-icon><span>Tableau</span></div>
                        </div>
                    </div>
                </div>

                <!-- Floating Actions Capsule (Top-Right) -->
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
        `;

        mainContent.appendChild(view);
    },

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    _setupEventListeners() {
        document.getElementById('scPlanModeSwitch')?.addEventListener('click', (e) => {
            const tab = e.target.closest('.sc-mode-tab');
            if (!tab) return;
            const targetMode = tab.dataset.planMode;
            if (targetMode && targetMode !== this._planMode) {
                this.switchPlanMode(targetMode);
            }
        });

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

        const sidebar = document.getElementById('scSidebar');
        if (sidebar && !sidebar._hasDragDropListeners) {
            sidebar._hasDragDropListeners = true;
            let sidebarDragDepth = 0;

            const isRemovableDrag = () => {
                const t = this._dragSource?.type;
                return t === 'cell' || t === 'multi-cell' || t === 'group-member';
            };

            sidebar.addEventListener('dragenter', (e) => {
                if (this._isLocked || !isRemovableDrag()) return;
                sidebarDragDepth++;
                sidebar.classList.add('drag-over');
                document.body.classList.add('sc-drag-over-sidebar');
            });

            sidebar.addEventListener('dragover', (e) => {
                if (this._isLocked || !isRemovableDrag()) return;
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'move';
                }
                if (!sidebar.classList.contains('drag-over')) {
                    sidebar.classList.add('drag-over');
                    document.body.classList.add('sc-drag-over-sidebar');
                }
            });

            sidebar.addEventListener('dragleave', (e) => {
                if (this._isLocked) return;
                sidebarDragDepth = Math.max(0, sidebarDragDepth - 1);
                if (sidebarDragDepth === 0 || !sidebar.contains(e.relatedTarget)) {
                    sidebarDragDepth = 0;
                    sidebar.classList.remove('drag-over');
                    document.body.classList.remove('sc-drag-over-sidebar');
                }
            });

            sidebar.addEventListener('drop', (e) => {
                sidebarDragDepth = 0;
                sidebar.classList.remove('drag-over');
                document.body.classList.remove('sc-drag-over-sidebar');
                if (this._isLocked || !isRemovableDrag()) return;
                e.preventDefault();
                this._handleRemoveFromSidebarDrop();
            });
        }

        const gridArea = document.getElementById('scGridArea');
        gridArea?.addEventListener('dblclick', (e) => {
            if (!e.target.closest('.sc-cell') && !e.target.closest('.sc-desk')) {
                this._toggleZoom({ clientX: e.clientX, clientY: e.clientY });
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
                this._toggleZoom({ clientX: touch.clientX, clientY: touch.clientY });
            } else {
                lastTapTime = now;
                lastTapX = touch.clientX;
                lastTapY = touch.clientY;
            }
        }, { passive: false });

        if (gridArea) {
            this._setupPinchAndWheelZoom(gridArea);
            this._setupOverscrollBounce(gridArea);

            if (typeof ResizeObserver !== 'undefined') {
                if (this._gridResizeObserver) {
                    this._gridResizeObserver.disconnect();
                }
                this._lastObservedGridW = Math.round(gridArea.offsetWidth || gridArea.clientWidth || 0);
                this._lastObservedGridH = Math.round(gridArea.offsetHeight || gridArea.clientHeight || 0);
                this._gridResizeObserver = new ResizeObserver((entries) => {
                    if (!this._isActive || this._isPinching || this._zoomAnimCleanup || this._modeCarouselTimer) return;
                    const entry = entries[0];
                    const borderBox = Array.isArray(entry?.borderBoxSize) ? entry.borderBoxSize[0] : entry?.borderBoxSize;
                    const w = Math.round(borderBox?.inlineSize ?? gridArea.offsetWidth ?? entry?.contentRect?.width ?? gridArea.clientWidth ?? 0);
                    const h = Math.round(borderBox?.blockSize ?? gridArea.offsetHeight ?? entry?.contentRect?.height ?? gridArea.clientHeight ?? 0);
                    if (w <= 0 || h <= 0) return;
                    if (Math.abs(w - (this._lastObservedGridW || 0)) < 2 && Math.abs(h - (this._lastObservedGridH || 0)) < 2) return;
                    this._lastObservedGridW = w;
                    this._lastObservedGridH = h;
                    clearTimeout(this._resizeDebounceTimer);
                    this._resizeDebounceTimer = setTimeout(() => {
                        if (this._isActive && !this._isPinching && !this._zoomAnimCleanup && !this._modeCarouselTimer) {
                            this._applySmartFit();
                        }
                    }, 80);
                });
                this._gridResizeObserver.observe(gridArea);
            }
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

        document.getElementById('scConfigPopover')?.addEventListener('click', (e) => {
            const presetBtn = e.target.closest('.sc-config-preset-pill');
            if (presetBtn && presetBtn.dataset.preset) {
                e.stopPropagation();
                this._applyRoomPreset(presetBtn.dataset.preset);
                return;
            }
            const stepBtn = e.target.closest('.sc-config-step-btn');
            if (stepBtn && stepBtn.dataset.dim && stepBtn.dataset.delta) {
                e.stopPropagation();
                this._stepGridDimension(stepBtn.dataset.dim, parseInt(stepBtn.dataset.delta, 10));
            }
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
            this._syncConfigPopoverUI();
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
            this._syncConfigPopoverUI();
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

        document.getElementById('scQuickGroupBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._placeSelectedAsGroupInFirstFreeStation();
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
                    !e.target.closest('#scQuickGroupBtn') &&
                    !e.target.closest('.sc-mobile-sheet') && 
                    !e.target.closest('.sc-mobile-sheet-backdrop')) {
                    this._clearSelection();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (!this._isActive || FocusPanelManager.isOpen?.()) return;

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

                if (e.key === 'Enter' && !isTyping && this._isActivityMode() && !this._isLocked &&
                    this._selectedChipIds.length >= 2 && this._selectedChipIds.length <= MAX_ACTIVITY_GROUP_SIZE) {
                    e.preventDefault();
                    this._placeSelectedAsGroupInFirstFreeStation();
                    return;
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
        if (this._selectedChipIds.length > 0) {
            this._selectedChipIds = this._selectedChipIds.filter(id => {
                const st = this._studentMap.get(id);
                return st && !this._isStudentDeparted(st);
            });
        }
        this._render();
        window.dispatchEvent(new CustomEvent('seating-chart:status-changed', {
            detail: { classId: appState.currentClassId, locked: this._isLocked, planMode: this._planMode }
        }));
    },

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
                const val = row[c];
                if (val === studentId || (Array.isArray(val) && val.includes(studentId))) {
                    return { row: r, col: c };
                }
            }
        }
        return null;
    },

    _swapGridPositions(r1, c1, r2, c2) {
        if (this._isLocked) return;
        this._snapshotGrid();
        const val1 = this._gridState[r1]?.[c1];
        const val2 = this._gridState[r2]?.[c2];
        if (!val1 || !val2) return;

        this._gridState[r1][c1] = Array.isArray(val2) ? [...val2] : val2;
        this._gridState[r2][c2] = Array.isArray(val1) ? [...val1] : val1;
        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        this._animateCellSwap(r1, c1, r2, c2);
        this._haptic([12, 40, 12]);

        const ids1 = Array.isArray(val1) ? val1 : [val1];
        const ids2 = Array.isArray(val2) ? val2 : [val2];
        const label1 = ids1.map(id => {
            const s = this._studentMap?.get(id) || this._students.find(st => st.id === id);
            return s ? (s.prenom || s.nom) : '';
        }).filter(Boolean).join(' & ');
        const label2 = ids2.map(id => {
            const s = this._studentMap?.get(id) || this._students.find(st => st.id === id);
            return s ? (s.prenom || s.nom) : '';
        }).filter(Boolean).join(' & ');

        if (label1 && label2) {
            UI?.showNotification?.(`Échange : ${label1} ↔ ${label2}`, 'success', 4000, {
                action: {
                    label: 'Annuler',
                    onClick: () => this._undo()
                }
            });
        }
    },

    _notifyGroupFull(row, col) {
        this._haptic([20, 40, 20]);
        const cell = document.querySelector(`#scGridContainer .sc-cell[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.remove('sc-cell-shake');
            void cell.offsetWidth;
            cell.classList.add('sc-cell-shake');
            cell.addEventListener('animationend', () => cell.classList.remove('sc-cell-shake'), { once: true });
        }
        UI?.showNotification?.(`Groupe complet (${MAX_ACTIVITY_GROUP_SIZE} élèves maximum par poste).`, 'warning');
    },

    _replaceOccupantWithUnplaced(row, col, unplacedId) {
        if (this._isLocked) return;
        if (this._isActivityMode()) {
            const existingIds = this._getCellStudentIds(row, col);
            if (existingIds.length >= MAX_ACTIVITY_GROUP_SIZE) {
                this._notifyGroupFull(row, col);
                return;
            }
            if (existingIds.length > 0) {
                this._joinStudentsToCell(row, col, [unplacedId]);
                return;
            }
        }
        this._snapshotGrid();
        const prevIds = this._getCellStudentIds(row, col);
        this._gridState[row][col] = unplacedId;
        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        this._animateCellPlaced(row, col);

        const sNew = this._studentMap?.get(unplacedId) || this._students.find(s => s.id === unplacedId);
        const sOld = prevIds[0] ? (this._studentMap?.get(prevIds[0]) || this._students.find(s => s.id === prevIds[0])) : null;
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

    _joinStudentsToCell(row, col, studentIdsToJoin) {
        if (this._isLocked) return false;
        const incoming = (Array.isArray(studentIdsToJoin) ? studentIdsToJoin : [studentIdsToJoin]).filter(Boolean);
        if (incoming.length === 0) return false;

        const targetIds = this._getCellStudentIds(row, col);
        const newIds = incoming.filter(id => !targetIds.includes(id));
        if (newIds.length === 0 || targetIds.length + newIds.length > MAX_ACTIVITY_GROUP_SIZE) {
            return false;
        }

        this._snapshotGrid();

        const rows = this._getRows();
        const cols = this._getCols();
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (r === row && c === col) continue;
                const cellIds = this._getCellStudentIds(r, c);
                if (cellIds.some(id => newIds.includes(id))) {
                    this._setCellStudentIds(r, c, cellIds.filter(id => !newIds.includes(id)));
                }
            }
        }

        const combined = [...targetIds, ...newIds];
        this._setCellStudentIds(row, col, combined);
        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        this._animateCellPlaced(row, col);
        this._haptic(15);

        const names = combined.map(id => {
            const s = this._studentMap?.get(id) || this._students.find(st => st.id === id);
            return s ? (s.prenom || s.nom) : '';
        }).filter(Boolean).join(' + ');

        if (names) {
            const groupLabel = combined.length === 2 ? 'Binôme' : `Groupe (${combined.length})`;
            UI?.showNotification?.(`${groupLabel} : ${names}`, 'success', 4000, {
                action: {
                    label: 'Annuler',
                    onClick: () => this._undo()
                }
            });
        }
        return true;
    },

    _openOccupiedCellSheet(row, col, student, cellStudents = null) {
        this._closeMobileSheet(true);
        if (!HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.pushState('scMobileSheet', () => this._closeMobileSheet(true));
        }

        const students = Array.isArray(cellStudents) && cellStudents.length > 0
            ? cellStudents
            : (this._getCellStudentIds(row, col).map(id => this._studentMap?.get(id)).filter(Boolean));
        const primary = students[0] || student;
        if (!primary) return;

        const isMulti = students.length > 1;
        const posKey = this._getActivePositionKey();
        const isPinned = students.some(s => !!s?.[posKey]?.pinned);
        const isActivity = this._isActivityMode();
        const stationNum = isActivity ? this._getStationNumber(row, col) : null;
        const unplaced = (isActivity && students.length < MAX_ACTIVITY_GROUP_SIZE)
            ? [...this._getUnplacedStudents()].sort((a, b) =>
                `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' })
            )
            : [];

        const backdrop = document.createElement('div');
        backdrop.className = 'sc-mobile-sheet-backdrop';
        backdrop.id = 'scMobileSheetBackdrop';

        const sheet = document.createElement('div');
        sheet.className = 'sc-mobile-sheet';
        sheet.id = 'scMobileSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const locationLabel = stationNum
            ? `Poste #${stationNum} • Rangée ${row + 1}, Col ${col + 1}`
            : `Rangée ${row + 1} • Table ${col + 1}`;

        const headerTitle = isMulti
            ? (students.length === 2 ? `Binôme (${students.length} élèves)` : `Groupe (${students.length} élèves)`)
            : `${primary.prenom || ''} ${primary.nom || ''}`;

        const headerAvatarHTML = isMulti
            ? `<div class="sc-sheet-desk-icon"><iconify-icon icon="solar:users-group-two-rounded-linear"></iconify-icon></div>`
            : StudentPhotoManager.getAvatarHTML(primary, 'md');

        const membersSectionHTML = isMulti ? `
            <div class="sc-sheet-section-title">Membres du poste (${students.length}/${MAX_ACTIVITY_GROUP_SIZE})</div>
            <div class="sc-sheet-picker-list sc-sheet-members-list">
                ${students.map(s => `
                    <div class="sc-sheet-picker-item sc-sheet-member-row" data-member-id="${s.id}">
                        <button class="sc-sheet-picker-user sc-sheet-member-profile-btn" data-profile-id="${s.id}" type="button">
                            ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                            <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                        </button>
                        <button class="sc-sheet-member-remove-btn" data-remove-member-id="${s.id}" type="button" aria-label="Retirer ${s.prenom || s.nom}">
                            <iconify-icon icon="ph:x"></iconify-icon> Retirer
                        </button>
                    </div>
                `).join('')}
            </div>
        ` : '';

        const addTeammateSectionHTML = (isActivity && students.length < MAX_ACTIVITY_GROUP_SIZE && unplaced.length > 0) ? `
            <div class="sc-sheet-section-title">Associer un élève sur ce poste (${students.length}/${MAX_ACTIVITY_GROUP_SIZE})</div>
            <div class="sc-sheet-picker-list sc-sheet-compact-picker" id="scSheetJoinList">
                ${unplaced.map(s => `
                    <button class="sc-sheet-picker-item" data-join-student-id="${s.id}" type="button">
                        <div class="sc-sheet-picker-user">
                            ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                            <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                        </div>
                        <span class="sc-sheet-picker-badge"><iconify-icon icon="solar:user-plus-linear"></iconify-icon> Associer</span>
                    </button>
                `).join('')}
            </div>
        ` : '';

        sheet.innerHTML = `
            <div class="sc-sheet-handle"></div>
            <div class="sc-sheet-header">
                <div class="sc-sheet-entity-info">
                    ${headerAvatarHTML}
                    <div class="sc-sheet-entity-text">
                        <h3 class="sc-sheet-entity-name">${headerTitle}</h3>
                        <p class="sc-sheet-entity-meta">${locationLabel}${isPinned ? ' • 📌 Place fixée' : ''}</p>
                    </div>
                </div>
                <button class="sc-sheet-close-btn" id="scSheetCloseBtn" aria-label="Fermer" type="button">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="sc-sheet-content">
                ${membersSectionHTML}
                ${addTeammateSectionHTML}
                <div class="sc-sheet-actions">
                    <button class="sc-sheet-action-btn" data-action="move" type="button">
                        <div class="sc-sheet-action-icon sc-icon-primary">
                            <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isMulti ? 'Déplacer ou permuter le groupe' : 'Déplacer ou permuter'}</span>
                            <span class="sc-sheet-action-hint">Touchez ensuite le poste de destination</span>
                        </div>
                    </button>
                    <button class="sc-sheet-action-btn" data-action="pin" type="button">
                        <div class="sc-sheet-action-icon ${isPinned ? 'sc-icon-warning' : 'sc-icon-secondary'}">
                            <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isPinned ? 'Détacher la place' : 'Épingler à ce poste'}</span>
                            <span class="sc-sheet-action-hint">${isPinned ? 'Le poste redeviendra mobile' : 'Fige ce poste lors des réagencements'}</span>
                        </div>
                    </button>
                    <button class="sc-sheet-action-btn sc-action-danger" data-action="remove" type="button">
                        <div class="sc-sheet-action-icon sc-icon-danger">
                            <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isMulti ? 'Libérer tout le poste' : 'Retirer du plan'}</span>
                            <span class="sc-sheet-action-hint">Renvoie ${isMulti ? 'les élèves' : "l'élève"} dans les non placés</span>
                        </div>
                    </button>
                    ${!isMulti ? `
                        <button class="sc-sheet-action-btn" data-action="profile" type="button">
                            <div class="sc-sheet-action-icon sc-icon-secondary">
                                <iconify-icon icon="solar:user-id-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Voir la fiche élève</span>
                                <span class="sc-sheet-action-hint">Notes, observations et historique</span>
                            </div>
                        </button>
                    ` : ''}
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

        sheet.querySelectorAll('[data-profile-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pid = btn.dataset.profileId;
                close();
                if (pid) FocusPanelManager.open(pid);
            });
        });

        sheet.querySelectorAll('[data-remove-member-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const mid = btn.dataset.removeMemberId;
                close();
                if (mid) this._removeStudentFromCell(row, col, mid);
            });
        });

        sheet.querySelectorAll('[data-join-student-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const jid = btn.dataset.joinStudentId;
                close();
                if (jid) this._joinStudentsToCell(row, col, [jid]);
            });
        });

        sheet.querySelector('[data-action="move"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeMobileSheet(true);
            this._clearSelection();
            this._toggleChipSelection(primary.id);
            this._lastSelectedGridPos = { row, col };
            UI?.showNotification?.(`Touchez un poste libre pour déplacer, ou occupé pour permuter.`, 'info');
        });

        sheet.querySelector('[data-action="pin"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            this._toggleCellPin(row, col);
        });

        sheet.querySelector('[data-action="remove"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            this._removeFromCell(row, col);
        });

        sheet.querySelector('[data-action="profile"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            FocusPanelManager.open(primary.id);
        });
    },

    _openEmptyCellSheet(row, col, special) {
        this._closeMobileSheet(true);
        if (!HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.pushState('scMobileSheet', () => this._closeMobileSheet(true));
        }
        const unplaced = [...this._getUnplacedStudents()].sort((a, b) =>
            `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' })
        );
        const isClassScope = special?.scope === 'class';
        const backdrop = document.createElement('div');
        backdrop.className = 'sc-mobile-sheet-backdrop';
        backdrop.id = 'scMobileSheetBackdrop';

        const sheet = document.createElement('div');
        sheet.className = 'sc-mobile-sheet';
        sheet.id = 'scMobileSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const isActivity = this._isActivityMode();
        const stationNum = (isActivity && !special) ? this._getStationNumber(row, col) : null;
        let statusLabel = isActivity ? 'Poste libre' : 'Place libre';
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

        const headerEntityName = stationNum
            ? `Poste #${stationNum} • Rangée ${row + 1}, Col ${col + 1}`
            : `Rangée ${row + 1} • Table ${col + 1}`;

        sheet.innerHTML = `
            <div class="sc-sheet-handle"></div>
            <div class="sc-sheet-header">
                <div class="sc-sheet-entity-info">
                    <div class="sc-sheet-desk-icon">
                        <iconify-icon icon="${deskIcon}"></iconify-icon>
                    </div>
                    <div class="sc-sheet-entity-text">
                        <h3 class="sc-sheet-entity-name">${headerEntityName}</h3>
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
                                    <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
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
        const isVirtual = currentClass?.isVirtual || ClassManager.isVirtualClass(appState.currentClassId);
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
    // VIEW SWITCHING — with entrance/exit animations
    // ========================================================================

    switchToView(view, options = {}) {
        const { silent = false, immediate = false } = typeof options === 'boolean' ? { silent: options } : options;
        const wrapper = document.querySelector('.main-content-wrapper');
        const viewEl = document.getElementById('seatingChartView');
        const fab = document.getElementById('addStudentFab');
        if (!wrapper || !viewEl) return;

        const isList = view === 'list';

        if (!immediate && !this._viewExitTimeout) {
            if (isList && !this._isActive && wrapper.dataset.view === 'list') return;
            if (!isList && this._isActive && wrapper.dataset.view === 'plan') return;
        }

        if (this._viewExitTimeout) {
            clearTimeout(this._viewExitTimeout);
            this._viewExitTimeout = null;
        }
        if (this._viewEnterTimeout) {
            clearTimeout(this._viewEnterTimeout);
            this._viewEnterTimeout = null;
        }
        this._clearListViewTransitionClasses();

        if (!isList) {
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
        }

        if (appState.activeView !== view) {
            appState.activeView = view;
            StorageManager?.saveAppState();
        }

        document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));

        const toggleWrapper = document.getElementById('viewToggle');
        if (toggleWrapper && window.UI && typeof window.UI.updateGlider === 'function') {
            window.UI.updateGlider(toggleWrapper, immediate);
        }

        if (isList) {
            // [UX Mobile] History state cleanup for plan view and sub-modes
            if (HistoryManager.isOpen('viewPlan')) HistoryManager.handleManualClose('viewPlan');
            if (HistoryManager.isOpen('seatingChartEdit')) HistoryManager.handleManualClose('seatingChartEdit');
            if (HistoryManager.isOpen('scMobileSheet')) HistoryManager.handleManualClose('scMobileSheet');
            if (HistoryManager.isOpen('scConfigPopover')) HistoryManager.handleManualClose('scConfigPopover');
            if (HistoryManager.isOpen('scPlacementPopover')) HistoryManager.handleManualClose('scPlacementPopover');

            const finishList = (animateEnter = false) => {
                const wasActive = this._isActive;
                this._cleanupModeCarousel();
                if (this._staggerCellTimer) {
                    clearTimeout(this._staggerCellTimer);
                    this._staggerCellTimer = null;
                }
                if (this._staggerSidebarTimer) {
                    clearTimeout(this._staggerSidebarTimer);
                    this._staggerSidebarTimer = null;
                }
                viewEl.classList.remove('sc-exiting', 'sc-entering');
                wrapper.dataset.view = 'list';
                viewEl.style.display = 'none';
                if (fab) fab.style.display = '';
                this._isActive = false;
                this._onboardingStep = null;
                this._clearSelection();
                this._closeSearch();
                if (wasActive) {
                    this._restoreUnmodifiedClassLock();
                    this._savePositionsToState(true);
                    this._saveGridConfig();
                }
                this._closeConfigPopover();
                this._closePlacementPopover();

                if (animateEnter) {
                    this._animateListViewEnter();
                }
            };

            if (immediate || wrapper.dataset.view === 'list') {
                finishList(false);
            } else {
                this._animateViewExit(viewEl, () => finishList(true));
            }
        } else {
            const finishPlan = (animateEnter = false) => {
                this._clearListViewTransitionClasses();
                wrapper.dataset.view = 'plan';
                CrossClassSearchManager?.clearListSearch?.({ renderList: true, immediate: true });
                // [UX Mobile] History integration for plan view (Back returns to list)
                if (!HistoryManager.isOpen('viewPlan')) {
                    HistoryManager.pushState('viewPlan', () => {
                        this.switchToView('list');
                    });
                }
                viewEl.style.display = '';
                if (fab) fab.style.display = 'none';
                this._isActive = true;
                this._onboardingStep = null;
                document.querySelector('.sc-onboarding-hint')?.remove();
                if (this._planMode === 'activity' && !this._hasClassActivityPlan()) {
                    this._planMode = 'course';
                } else if (this._planMode === 'course' && !this._hasClassCoursePlan() && this._hasClassActivityPlan()) {
                    this._planMode = 'activity';
                }
                this._loadGridConfig();
                this._loadPositionsFromState();
                const currentClass = this._getCurrentClass();
                const isVirtual = currentClass?.isVirtual || ClassManager.isVirtualClass(appState.currentClassId);
                const locked = isVirtual ? true : (this._getPlacedIds().size > 0);
                this._applyLockState(locked, { skipSmartFit: true });
                this._updateSidebarLockState();
                this._undoStack = [];
                this._redoStack = [];
                this._syncPlacementPopover();
                this._render();
                this._applySmartFit(true);
                if (animateEnter) {
                    this._animateViewEnter(viewEl);
                    this._scrollToDesk();
                    this._maybeShowOnboardingHint();
                } else {
                    viewEl.classList.remove('sc-exiting', 'sc-entering');
                    this._scrollToDesk();
                }
            };

            if (immediate || wrapper.dataset.view === 'plan') {
                finishPlan(false);
            } else {
                this._animateListViewExit(() => finishPlan(true));
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

        this._closeSearch();
        this._closeConfigPopover();
        this._closePlacementPopover();

        if (!hasResults) {
            this.switchToView('list', { immediate });
            return;
        }

        const currentClass = this._getCurrentClass();
        if (this._planMode === 'activity' && !this._hasClassActivityPlan(currentClass)) {
            this._planMode = 'course';
        } else if (this._planMode === 'course' && !this._hasClassCoursePlan(currentClass) && this._hasClassActivityPlan(currentClass)) {
            this._planMode = 'activity';
        }

        this._onboardingStep = null;
        document.querySelector('.sc-onboarding-hint')?.remove();
        this._prevPlacedCount = 0;
        this._students = this._getCurrentClassStudents();
        this._loadGridConfig();
        this._loadPositionsFromState();

        const isVirtual = currentClass?.isVirtual || ClassManager.isVirtualClass(appState.currentClassId);
        // En mode consultation par défaut dès qu'au moins un élève est placé (ou classe reconstituée)
        const locked = isVirtual ? true : (this._getPlacedIds().size > 0);
        this._applyLockState(locked, { skipSmartFit: true });
        this._syncPlacementPopover();

        this._render();
        this._applySmartFit(true);
        if (!immediate) {
            this._staggerCellEntrance(40);
            this._staggerSidebarEntrance(40);
        }

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
    // ANIMATION ORCHESTRATORS (see ./seating/SeatingAnimations.js)
    // ========================================================================
    ...SeatingAnimations,

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
        const posKey = this._getActivePositionKey();

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                const cellIds = this._getCellStudentIds(r, c);
                cellIds.forEach(id => {
                    if (id && !this._selectedChipIds.includes(id)) {
                        const student = this._studentMap?.get(id);
                        if (student && !student[posKey]?.pinned) {
                            this._selectedChipIds.push(id);
                        }
                    }
                });
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
        this._updateQuickGroupButton();
    },

    _updateQuickGroupButton() {
        const btn = document.getElementById('scQuickGroupBtn');
        const labelEl = document.getElementById('scQuickGroupBtnLabel');
        if (!btn || !labelEl) return;

        const count = this._selectedChipIds.length;
        const canQuickGroup = this._isActivityMode() && !this._isLocked && count >= 2 && count <= MAX_ACTIVITY_GROUP_SIZE;

        if (!canQuickGroup) {
            btn.style.display = 'none';
            return;
        }

        const label = count === 2
            ? 'Former le binôme (2)'
            : `Former le groupe (${count})`;
        labelEl.textContent = label;
        btn.style.display = 'flex';
    },

    _placeSelectedAsGroupInFirstFreeStation() {
        const ids = [...this._selectedChipIds];
        if (!this._isActivityMode() || this._isLocked || ids.length < 2 || ids.length > MAX_ACTIVITY_GROUP_SIZE) return;

        let rows = this._getRows();
        let cols = this._getCols();
        let targetRow = -1;
        let targetCol = -1;

        for (let r = 0; r < rows && targetRow === -1; r++) {
            for (let c = 0; c < cols; c++) {
                if (!this._isSpecialSpot(r, c) && this._getCellStudentIds(r, c).length === 0) {
                    targetRow = r;
                    targetCol = c;
                    break;
                }
            }
        }

        // Auto-expand by one row if all current stations are full
        if (targetRow === -1 && rows < 10) {
            const rowSlider = document.getElementById('scRowsSlider');
            rows += 1;
            if (rowSlider) {
                rowSlider.value = rows;
                const valEl = document.getElementById('scRowsValue');
                if (valEl) valEl.textContent = rows;
            }
            this._onGridConfigChange();
            targetRow = rows - 1;
            targetCol = 0;
        }

        if (targetRow !== -1 && targetCol !== -1) {
            this._placeSelectedAt(targetRow, targetCol);
        } else {
            UI.showNotification('Aucun poste libre disponible.', 'warning');
        }
    },

    _placeSelectedAt(startRow, startCol) {
        const ids = [...this._selectedChipIds];
        if (ids.length === 0) return;
        this._snapshotGrid();

        const cols = this._getCols();
        const rows = this._getRows();
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellIds = this._getCellStudentIds(r, c);
                if (cellIds.some(id => ids.includes(id))) {
                    this._setCellStudentIds(r, c, cellIds.filter(id => !ids.includes(id)));
                }
            }
        }

        const placedCells = [];

        // In Activity mode, if 2..4 students are selected and target station is empty, group them together on that station
        if (this._isActivityMode() &&
            ids.length >= 2 &&
            ids.length <= MAX_ACTIVITY_GROUP_SIZE &&
            this._getCellStudentIds(startRow, startCol).length === 0 &&
            !this._isSpecialSpot(startRow, startCol)) {
            this._setCellStudentIds(startRow, startCol, ids);
            placedCells.push({ row: startRow, col: startCol, index: 0 });
        } else {
            let currentRow = startRow;
            let currentCol = startCol;

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
        }

        this._selectedChipIds = [];
        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        this._haptic(15);
        this._updateSelectionAttribute();

        requestAnimationFrame(() => {
            placedCells.forEach(({ row, col }) => {
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
            chip.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            chip.addEventListener('animationend', () => chip.classList.remove('sc-chip-returning'), { once: true });
        });
    },

    /** Brief welcoming pulse on sidebar when student is unassigned */
    _pulseSidebarReceiving() {
        const sidebar = document.getElementById('scSidebar');
        if (!sidebar) return;
        sidebar.classList.remove('sc-sidebar-receiving');
        void sidebar.offsetWidth;
        sidebar.classList.add('sc-sidebar-receiving');
        sidebar.addEventListener('animationend', () => sidebar.classList.remove('sc-sidebar-receiving'), { once: true });
    },

    _animateCounterBump() {
        const badge = document.querySelector('#scSidebarTitle .sc-dynamic-value');
        if (!badge) return;
        badge.classList.remove('sc-counter-bump');
        void badge.offsetWidth;
        badge.classList.add('sc-counter-bump');
        badge.addEventListener('animationend', () => badge.classList.remove('sc-counter-bump'), { once: true });
    },

    // ========================================================================
    // LOCK
    // ========================================================================

    _syncLockControlsUI(locked) {
        const view = document.getElementById('seatingChartView');
        if (view) view.dataset.locked = locked;

        const sidebar = document.getElementById('scSidebar');
        if (sidebar) sidebar.inert = Boolean(locked);

        const btn = document.getElementById('scLockBtn');
        if (btn) {
            const btnLabel = locked ? 'Déverrouiller pour ajuster' : 'Valider et figer le plan';
            btn.classList.toggle('locked', locked);
            btn.setAttribute('aria-checked', (!locked).toString());
            btn.setAttribute('aria-label', btnLabel);
            btn.setAttribute('data-tooltip', btnLabel);
            TooltipsUI?.updateTooltip?.(btn, btnLabel);
        }

        const floatingUnlockBtn = document.getElementById('scUnlockFloatingBtn');
        if (floatingUnlockBtn) {
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
        if (this._zoomAnimCleanup) {
            this._zoomAnimCleanup();
            this._zoomAnimCleanup = null;
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

        // Freeze child cell transitions before flipping data-locked so the GPU slides a static texture at 120Hz
        board?.classList.add('sc-lock-sliding');

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
                        const planLabel = this._isActivityMode() ? "Plan d'activité" : 'Plan de classe';
                        UI?.showNotification?.(`${planLabel} validé et figé`, 'success');
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

        const gridContainer = document.getElementById('scGridContainer');
        const expectedCells = this._getEffectiveRowCount() * this._getCols();
        const didRebuildGrid = this._isActivityMode() && gridContainer?.children.length !== expectedCells;
        const isNativeDesktopSlide = !this._isMobileView()
            && Boolean(this._isFitted && board?.style.getPropertyValue('--sc-scale'))
            && !didRebuildGrid;
        const rBefore = isNativeDesktopSlide ? null : (board?.getBoundingClientRect?.() || null);

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
            const r = isNaN(currentRow) ? row : currentRow;
            const c = isNaN(currentCol) ? col : currentCol;
            const cellIds = this._getCellStudentIds(r, c);
            const primaryId = cellIds[0] || student.id;
            const isSelected = this._selectedChipIds.includes(primaryId);
            if (!isSelected) {
                this._clearSelection();
                this._dragSource = {
                    type: 'cell',
                    resultId: primaryId,
                    row: r,
                    col: c
                };
                e.dataTransfer.setData('text/plain', primaryId);
            } else {
                this._dragSource = { type: 'multi-cell', ids: [...this._selectedChipIds] };
                e.dataTransfer.setData('text/plain', 'multi');
            }
            e.dataTransfer.effectAllowed = 'move';
            TooltipsUI?.hideAll?.();
            this._setCleanDragImage(e, cell, isSelected ? this._selectedChipIds.length : 1);
            requestAnimationFrame(() => cell.classList.add('dragging'));
        });

        cell.addEventListener('dragend', () => {
            cell.classList.remove('dragging');
            this._dragSource = null;
            document.getElementById('scSidebar')?.classList.remove('drag-over');
            document.body.classList.remove('sc-drag-over-sidebar');
        });

        this._addTouchDrag(cell, { type: 'cell', resultId: student.id, row, col });
    },

    _attachMemberAvatarDragListeners(cell, students, row, col) {
        if (!cell || !Array.isArray(students) || students.length <= 1) return;
        cell.querySelectorAll('.sc-stacked-avatar, .sc-stacked-member').forEach(memberEl => {
            if (memberEl._hasMemberDragListeners) return;
            memberEl._hasMemberDragListeners = true;

            memberEl.addEventListener('dragstart', (e) => {
                if (this._isLocked || cell.classList.contains('pinned') || e.target.closest?.('.sc-stacked-member-remove')) {
                    e.preventDefault();
                    return;
                }
                e.stopPropagation();
                TooltipsUI?.hideAll?.();
                cell.querySelectorAll('.is-member-hovered').forEach(el => el.classList.remove('is-member-hovered'));
                this._dismissOnboardingHint();
                this._clearSelection();

                const memberId = memberEl.dataset.resultId;
                const memberStudent = students.find(st => st.id === memberId) || this._studentMap?.get(memberId);
                const currentRow = parseInt(cell.dataset.row, 10);
                const currentCol = parseInt(cell.dataset.col, 10);
                const r = isNaN(currentRow) ? row : currentRow;
                const c = isNaN(currentCol) ? col : currentCol;

                this._dragSource = {
                    type: 'group-member',
                    resultId: memberId,
                    row: r,
                    col: c
                };
                e.dataTransfer?.setData?.('text/plain', memberId);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                this._setCleanMemberDragImage(e, memberStudent, memberEl);
                requestAnimationFrame(() => {
                    cell.querySelectorAll(`.sc-stacked-avatar[data-result-id="${memberId}"], .sc-stacked-member[data-result-id="${memberId}"]`).forEach(el => {
                        el.classList.add('dragging-member');
                    });
                });
            });

            memberEl.addEventListener('dragend', (e) => {
                e.stopPropagation();
                cell.querySelectorAll('.dragging-member').forEach(el => el.classList.remove('dragging-member'));
                this._dragSource = null;
                document.getElementById('scSidebar')?.classList.remove('drag-over');
                document.body.classList.remove('sc-drag-over-sidebar');
            });
        });
    },

    _attachMemberHoverEcho(cell) {
        if (!cell || cell._hasMemberHoverEcho) return;
        cell._hasMemberHoverEcho = true;

        const setHighlight = (memberId, active) => {
            if (!memberId) return;
            cell.querySelectorAll(`.sc-stacked-avatar[data-result-id="${memberId}"], .sc-stacked-member[data-result-id="${memberId}"]`).forEach(el => {
                el.classList.toggle('is-member-hovered', active);
            });
        };

        cell.querySelectorAll('.sc-stacked-avatar, .sc-stacked-member').forEach(el => {
            const memberId = el.dataset.resultId;
            el.addEventListener('mouseenter', () => setHighlight(memberId, true));
            el.addEventListener('mouseleave', () => setHighlight(memberId, false));
        });
    },

    _updateCellsDraggability() {
        document.querySelectorAll('#scGridContainer .sc-cell.occupied').forEach(cell => {
            const isPinned = cell.classList.contains('pinned');
            const canDrag = !this._isLocked && !isPinned;
            cell.draggable = canDrag;
            cell.querySelectorAll('.sc-stacked-avatar, .sc-stacked-member').forEach(el => {
                el.draggable = canDrag;
            });
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);
            const cellIds = (!isNaN(row) && !isNaN(col)) ? this._getCellStudentIds(row, col) : [cell.dataset.resultId].filter(Boolean);
            const students = cellIds.map(id => this._studentMap?.get(id)).filter(Boolean);

            if (students.length === 1) {
                const student = students[0];
                let tooltipText = Utils.formatStudentFirstLastName(student.nom, student.prenom);
                if (student.isNew) tooltipText += ' • Nouveau';
                if (student.isDeparted) tooltipText += ' • Départ';
                cell.setAttribute('data-tooltip', tooltipText);
                if (this._isLocked) {
                    cell.removeAttribute('data-tooltip-anchor');
                } else {
                    cell.setAttribute('data-tooltip-anchor', '.student-avatar');
                }
                TooltipsUI?.updateTooltip?.(cell, tooltipText);
                const nameEl = cell.querySelector('.sc-cell-name');
                if (nameEl) {
                    nameEl.removeAttribute('data-tooltip');
                    nameEl.removeAttribute('data-tooltip-anchor');
                    if (nameEl._tippy) nameEl._tippy.destroy();
                }
            } else {
                cell.removeAttribute('data-tooltip');
                cell.removeAttribute('data-tooltip-anchor');
                if (cell._tippy) cell._tippy.destroy();
            }

            if (!this._isLocked) {
                const primary = students[0];
                if (primary && !isNaN(row) && !isNaN(col)) {
                    this._attachCellDragListeners(cell, primary, row, col);
                    if (students.length > 1) {
                        this._attachMemberAvatarDragListeners(cell, students, row, col);
                    }
                }
            }

            if (students.length > 1) {
                this._attachMemberHoverEcho(cell);
                cell.querySelectorAll('.sc-stacked-member').forEach(memberEl => {
                    const memberId = memberEl.dataset.resultId;
                    const s = this._studentMap?.get(memberId);
                    if (!s) return;
                    const tooltipText = Utils.formatStudentFirstLastName(s.nom, s.prenom);
                    memberEl.setAttribute('data-tooltip', tooltipText);
                    memberEl.setAttribute('data-tooltip-anchor', `.sc-stacked-avatar[data-result-id='${memberId}']`);
                    TooltipsUI?.updateTooltip?.(memberEl, tooltipText);
                });
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
    // SMART-FIT, GESTURE ZOOM & OVERSCROLL (see ./seating/SeatingZoom.js)
    // ========================================================================
    ...SeatingZoom,


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
        const filePrefix = this._isActivityMode() ? 'Plan-activite' : 'Plan-de-classe';
        document.title = `${filePrefix}_${safeName}_${new Date().toISOString().slice(0, 10)}`;

        const placed = activeStudents.filter(s => this._getPlacedIds().has(s.id)).length;
        const unplaced = Math.max(0, studentCount - placed);
        const unplacedHtml = unplaced > 0
            ? `<div class="sc-print-warning">⚠ ${unplaced} élève${unplaced > 1 ? 's' : ''} non placé${unplaced > 1 ? 's' : ''}</div>`
            : '';

        const isActivity = this._isActivityMode();
        const isStudent = this._isStudentOrientation();
        const modeLabel = isActivity ? ' — Mode Activité' : '';
        const orientationLabel = isActivity ? '' : (isStudent ? ' — Vue Élèves (Projection)' : ' — Vue Enseignant');
        let occupiedStations = 0;
        if (isActivity && this._gridState) {
            for (let r = 0; r < this._gridState.length; r++) {
                for (let c = 0; c < (this._gridState[r]?.length || 0); c++) {
                    if (this._getCellStudentIds(r, c).length > 0) occupiedStations++;
                }
            }
        }
        const countLabel = isActivity && occupiedStations > 0
            ? `(${studentCount} élèves · ${occupiedStations} poste${occupiedStations > 1 ? 's' : ''})`
            : `(${studentCount} élèves)`;

        const header = document.createElement('div');
        header.className = 'sc-print-header';
        header.innerHTML = `
            <span class="sc-print-date">${dateStr}</span>
            <span class="sc-print-class">${className}${modeLabel}${orientationLabel} <span class="sc-print-count">${countLabel}</span></span>
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
        const isVirtual = currentClass?.isVirtual || ClassManager.isVirtualClass(appState.currentClassId);
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

    _getCurrentClass() {
        const classId = appState.currentClassId;
        if (!classId) return null;
        return ClassManager.getClassById(classId) || (appState.classes || []).find(c => c.id === classId) || null;
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
        const isVirtual = currentClass?.isVirtual || ClassManager.isVirtualClass(appState.currentClassId);
        const maxPerCell = (isVirtual || this._isActivityMode()) ? MAX_ACTIVITY_GROUP_SIZE : 1;

        for (const [key, items] of cellBuckets.entries()) {
            const [r, c] = key.split(',').map(Number);
            items.sort((a, b) => a.order - b.order);
            this._setCellStudentIds(r, c, items.slice(0, maxPerCell).map(item => item.id));
        }
    },

    _savePositionsToState(preserveOutOfBounds = false) {
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

    // ========================================================================
    // RENDERING
    // ========================================================================

    _render() {
        this._updatePlanModeSwitchUI();
        this._renderGrid();
        this._renderSidebar();
        this._updateFooter();
        this._updateSidebarLockState();
        this._updateUndoRedoButtons();
        this._updateQuickGroupButton();
        this._syncConfigPopoverUI();
        TooltipsUI.initTooltips(document.getElementById('seatingChartView'));

        if (this._activeSearchTerm) {
            this._applySearchHighlight(this._activeSearchTerm);
        }

        if (this._getPlacedIds().size > 0 || this._isLocked) {
            this._dismissOnboardingHint();
        } else {
            this._maybeShowOnboardingHint();
        }
    },

    _getEffectiveRowCount(rows = this._getRows(), cols = this._getCols()) {
        if (!this._isActivityMode() || !this._isLocked || rows <= 1) return rows;
        let maxActiveRow = -1;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const hasStudents = this._getCellStudentIds(r, c).length > 0;
                const special = this._getCellSpecial(r, c);
                if (hasStudents || (special && special !== 'aisle')) {
                    maxActiveRow = r;
                    break;
                }
            }
        }
        return maxActiveRow >= 0 ? maxActiveRow + 1 : rows;
    },

    _renderGrid() {
        const container = document.getElementById('scGridContainer');
        if (!container) return;

        const rows = this._getRows();
        const cols = this._getCols();
        this._studentMap = new Map(this._students.map(s => [s.id, s]));
        const effectiveRows = this._getEffectiveRowCount(rows, cols);

        container.style.gridTemplateColumns = `repeat(${cols}, var(--sc-cell-w, 88px))`;
        container.style.gridTemplateRows = `repeat(${effectiveRows}, var(--sc-cell-h, 96px))`;
        container.innerHTML = '';

        const isStudent = this._isStudentOrientation();
        for (let displayR = 0; displayR < effectiveRows; displayR++) {
            for (let displayC = 0; displayC < cols; displayC++) {
                const r = isStudent ? (effectiveRows - 1 - displayR) : displayR;
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

        const posKey = this._getActivePositionKey();
        const isActivity = this._isActivityMode();
        const special = this._getCellSpecial(row, col);
        const stationNum = (isActivity && !special) ? this._getStationNumber(row, col) : null;
        const stationBadgeHTML = stationNum ? `<span class="sc-station-badge" aria-hidden="true">#${stationNum}</span>` : '';

        const studentIds = this._getCellStudentIds(row, col);
        const students = studentIds.map(id => this._studentMap?.get(id)).filter(Boolean);

        if (students.length === 1) {
            const student = students[0];
            cell.dataset.resultId = student.id;
            const isPinned = student[posKey]?.pinned || false;
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

            cell.setAttribute('data-tooltip', tooltipText);
            if (!this._isLocked) {
                cell.setAttribute('data-tooltip-anchor', '.student-avatar');
            }

            const statusBadgeHTML = isDeparted
                ? `<span class="sc-cell-status-badge sc-badge-depart">Départ</span>`
                : (isNew ? `<span class="sc-cell-status-badge sc-badge-new">Nouveau</span>` : '');

            cell.innerHTML = `
                ${StudentPhotoManager.getAvatarHTML(student, 'sm')}
                <span class="sc-cell-name">${Utils.formatStudentInitialLabel(student.nom, student.prenom, true)}</span>
                ${statusBadgeHTML}
                ${stationBadgeHTML}
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
                const currentlyPinned = cell.classList.contains('pinned');
                if (this._isLocked) {
                    FocusPanelManager.open(student.id);
                } else if (this._selectedChipIds.length > 0 && !this._selectedChipIds.includes(student.id)) {
                    if (isActivity && !currentlyPinned && !this._lastSelectedGridPos) {
                        if (1 + this._selectedChipIds.length <= MAX_ACTIVITY_GROUP_SIZE) {
                            this._joinStudentsToCell(row, col, this._selectedChipIds);
                            this._clearSelection();
                        } else {
                            this._notifyGroupFull(row, col);
                        }
                    } else if (this._selectedChipIds.length === 1) {
                        const selectedId = this._selectedChipIds[0];
                        const srcPos = this._findStudentGridPos(selectedId);
                        if (srcPos) {
                            this._swapGridPositions(srcPos.row, srcPos.col, row, col);
                        } else {
                            this._replaceOccupantWithUnplaced(row, col, selectedId);
                        }
                        this._clearSelection();
                    }
                } else if (this._selectedChipIds.length === 1 && this._selectedChipIds[0] === student.id) {
                    this._clearSelection();
                } else if (this._isMobileView() && this._selectedChipIds.length === 0) {
                    this._openOccupiedCellSheet(row, col, student, students);
                } else if (!currentlyPinned) {
                    if (e.shiftKey && this._lastSelectedGridPos) {
                        this._selectGridRange(this._lastSelectedGridPos.row, this._lastSelectedGridPos.col, row, col);
                    } else {
                        this._toggleChipSelection(student.id);
                        this._lastSelectedGridPos = { row, col };
                    }
                } else if (currentlyPinned && this._isMobileView()) {
                    this._openOccupiedCellSheet(row, col, student, students);
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
            // Binôme / Groupe / Classe reconstituée (2 à 4 élèves sur un même poste)
            const isPinned = students.some(s => s[posKey]?.pinned);
            cell.classList.add('occupied', 'sc-cell-stacked');
            if (isPinned) cell.classList.add('pinned');
            cell.draggable = !this._isLocked && !isPinned;
            cell.dataset.resultId = students[0].id;
            cell.dataset.groupSize = String(students.length);

            const canExtractMember = !this._isLocked && !isPinned;
            const avatarsHtml = students.map((s, idx) => `
                <div class="sc-stacked-avatar" style="--stack-index: ${idx}; z-index: ${students.length - idx};" data-result-id="${s.id}" draggable="${canExtractMember}" data-tooltip="${Utils.formatStudentFirstLastName(s.nom, s.prenom)}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                </div>
            `).join('');

            const namesHtml = students.map(s => {
                const memberTooltipAttr = ` data-tooltip="${Utils.escapeHtml(Utils.formatStudentFirstLastName(s.nom, s.prenom))}" data-tooltip-anchor=".sc-stacked-avatar[data-result-id='${Utils.escapeHtml(String(s.id))}']"`;
                return `
                <span class="sc-stacked-member sc-stacked-name" data-result-id="${s.id}" draggable="${canExtractMember}"${memberTooltipAttr}>
                    <span class="sc-stacked-name-text">${Utils.formatStudentInitialLabel(s.nom, s.prenom, true)}</span>
                    <button type="button" class="sc-stacked-member-remove" data-member-id="${s.id}" aria-label="Retirer ${Utils.escapeHtml(s.prenom || s.nom)} du groupe">
                        <iconify-icon icon="ph:x-bold"></iconify-icon>
                    </button>
                </span>
            `;
            }).join('');

            cell.innerHTML = `
                <div class="sc-stacked-avatar-cluster">
                    ${avatarsHtml}
                    <span class="sc-stacked-count-pill">${students.length}</span>
                </div>
                <div class="sc-stacked-names-list">
                    ${namesHtml}
                </div>
                ${stationBadgeHTML}
                <button class="sc-cell-remove" data-result-id="${students[0].id}" aria-label="Libérer le poste" data-tooltip="Libérer le poste">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
                <button class="sc-cell-pin" data-result-id="${students[0].id}" aria-label="${isPinned ? 'Détacher' : 'Fixer'}" data-tooltip="${isPinned ? 'Détacher' : 'Fixer'}">
                    <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon>
                </button>
            `;

            cell.querySelectorAll('.sc-stacked-member-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const memberId = btn.dataset.memberId;
                    if (memberId) this._removeStudentFromCell(row, col, memberId);
                });
            });

            cell.querySelector('.sc-cell-remove')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeFromCell(row, col);
            });

            cell.querySelector('.sc-cell-pin')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleCellPin(row, col);
            });

            cell.addEventListener('click', (e) => {
                if (e.target.closest('.sc-cell-remove') || e.target.closest('.sc-cell-pin') || e.target.closest('.sc-stacked-member-remove')) return;
                const currentlyPinned = cell.classList.contains('pinned');
                if (this._isLocked) {
                    const targetStudentEl = e.target.closest('[data-result-id]');
                    const targetId = targetStudentEl?.dataset?.resultId || students[0].id;
                    FocusPanelManager.open(targetId);
                } else if (this._selectedChipIds.length > 0 && !this._selectedChipIds.some(id => studentIds.includes(id))) {
                    if (isActivity && !currentlyPinned && !this._lastSelectedGridPos) {
                        if (students.length + this._selectedChipIds.length <= MAX_ACTIVITY_GROUP_SIZE) {
                            this._joinStudentsToCell(row, col, this._selectedChipIds);
                            this._clearSelection();
                        } else {
                            this._notifyGroupFull(row, col);
                        }
                    } else if (this._selectedChipIds.length === 1) {
                        const selectedId = this._selectedChipIds[0];
                        const srcPos = this._findStudentGridPos(selectedId);
                        if (srcPos && (srcPos.row !== row || srcPos.col !== col)) {
                            this._swapGridPositions(srcPos.row, srcPos.col, row, col);
                        }
                        this._clearSelection();
                    }
                } else if (this._selectedChipIds.length === 1 && studentIds.includes(this._selectedChipIds[0])) {
                    this._clearSelection();
                } else if (this._isMobileView() && this._selectedChipIds.length === 0) {
                    this._openOccupiedCellSheet(row, col, students[0], students);
                } else if (!currentlyPinned) {
                    this._toggleChipSelection(students[0].id);
                    this._lastSelectedGridPos = { row, col };
                } else if (currentlyPinned && this._isMobileView()) {
                    this._openOccupiedCellSheet(row, col, students[0], students);
                }
            });

            this._attachCellDragListeners(cell, students[0], row, col);
            this._attachMemberAvatarDragListeners(cell, students, row, col);
            this._attachMemberHoverEcho(cell);
        } else {
            cell.classList.add('empty');
            
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
            } else if (stationBadgeHTML) {
                cell.innerHTML = stationBadgeHTML;
            }

            const totalRows = this._getRows();
            const depthRatio = totalRows > 1
                ? (this._isStudentOrientation() ? (totalRows - 1 - row) / (totalRows - 1) : row / (totalRows - 1))
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
                        const srcVal = this._gridState[srcPos.row][srcPos.col];
                        this._gridState[srcPos.row][srcPos.col] = null;
                        this._gridState[row][col] = Array.isArray(srcVal) ? [...srcVal] : srcVal;
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
            cell.classList.toggle('drag-over-join', this._willDropJoinGroup(row, col));
            cell.classList.toggle('drag-over-full', this._willDropOverflowGroup(row, col));
        });

        cell.addEventListener('dragleave', () => {
            cell.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
        });

        cell.addEventListener('drop', (e) => {
            if (this._isLocked) return;
            e.preventDefault();
            cell.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
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
        const departedUnplaced = this._getUnplacedStudents(true)
            .filter(s => this._isStudentDeparted(s))
            .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' }));

        const sorted = [...unplaced].sort((a, b) =>
            `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' })
        );

        const searchInput = document.getElementById('scSearchInput');
        let searchTerm = (searchInput?.value || '').trim();
        const currentClassName = this._getCurrentClass()?.name || '';

        if (returningId && searchTerm) {
            const returnedStudent = this._students.find(s => s.id === returningId);
            if (returnedStudent && !Utils.matchesStudent(returnedStudent, searchTerm, { currentClassName })) {
                if (searchInput) searchInput.value = '';
                document.getElementById('scSearchClear')?.classList.remove('visible');
                searchTerm = '';
            }
        }

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
                       <div class="sc-empty-success-badge sc-empty-engraved">
                           <svg class="sc-empty-engraved-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                               <defs>
                                   <filter id="scEngravedCheckLight" x="-20%" y="-20%" width="140%" height="140%">
                                       <feOffset in="SourceAlpha" dx="1" dy="1.5" result="rimOff"/>
                                       <feComposite in="rimOff" in2="SourceAlpha" operator="out" result="rimMask"/>
                                       <feGaussianBlur in="rimMask" stdDeviation="0.4" result="rimBlur"/>
                                       <feFlood flood-color="#ffffff" flood-opacity="1" result="rimCol"/>
                                       <feComposite in="rimCol" in2="rimBlur" operator="in" result="rimLight"/>
                                       <feOffset in="SourceAlpha" dx="-1.5" dy="-1.5" result="offLight"/>
                                       <feGaussianBlur in="offLight" stdDeviation="1.5" result="blurLight"/>
                                       <feComposite in="SourceAlpha" in2="blurLight" operator="out" result="innerLightMask"/>
                                       <feFlood flood-color="#ffffff" flood-opacity="0.9" result="innerLightCol"/>
                                       <feComposite in="innerLightCol" in2="innerLightMask" operator="in" result="innerLight"/>
                                       <feOffset in="SourceAlpha" dx="1.5" dy="2" result="off"/>
                                       <feGaussianBlur in="off" stdDeviation="1.5" result="blur"/>
                                       <feComposite in="SourceAlpha" in2="blur" operator="out" result="innerMask"/>
                                       <feFlood flood-color="#000000" flood-opacity="0.16" result="shadowCol"/>
                                       <feComposite in="shadowCol" in2="innerMask" operator="in" result="innerShadow"/>
                                       <feMerge>
                                           <feMergeNode in="rimLight"/>
                                           <feMergeNode in="SourceGraphic"/>
                                           <feMergeNode in="innerLight"/>
                                           <feMergeNode in="innerShadow"/>
                                       </feMerge>
                                   </filter>
                                   <filter id="scEngravedCheckDark" x="-20%" y="-20%" width="140%" height="140%">
                                       <feOffset in="SourceAlpha" dx="1" dy="1.5" result="rimOff"/>
                                       <feComposite in="rimOff" in2="SourceAlpha" operator="out" result="rimMask"/>
                                       <feGaussianBlur in="rimMask" stdDeviation="0.4" result="rimBlur"/>
                                       <feFlood flood-color="#ffffff" flood-opacity="0.07" result="rimCol"/>
                                       <feComposite in="rimCol" in2="rimBlur" operator="in" result="rimLight"/>
                                       <feOffset in="SourceAlpha" dx="-1" dy="-1.5" result="offLight"/>
                                       <feGaussianBlur in="offLight" stdDeviation="1.2" result="blurLight"/>
                                       <feComposite in="SourceAlpha" in2="blurLight" operator="out" result="innerLightMask"/>
                                       <feFlood flood-color="#ffffff" flood-opacity="0.035" result="innerLightCol"/>
                                       <feComposite in="innerLightCol" in2="innerLightMask" operator="in" result="innerLight"/>
                                       <feOffset in="SourceAlpha" dx="1.8" dy="2.2" result="off"/>
                                       <feGaussianBlur in="off" stdDeviation="1.6" result="blur"/>
                                       <feComposite in="SourceAlpha" in2="blur" operator="out" result="innerMask"/>
                                       <feFlood flood-color="#000000" flood-opacity="0.85" result="shadowCol"/>
                                       <feComposite in="shadowCol" in2="innerMask" operator="in" result="innerShadow"/>
                                       <feMerge>
                                           <feMergeNode in="rimLight"/>
                                           <feMergeNode in="SourceGraphic"/>
                                           <feMergeNode in="innerLight"/>
                                           <feMergeNode in="innerShadow"/>
                                       </feMerge>
                                   </filter>
                               </defs>
                               <path class="sc-empty-engraved-path" d="M15 33.5L26.5 45L49 20.5" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
                           </svg>
                       </div>`
                    : 'Aucun résultat'}
               </div>`
            : filtered.map((s, index) => `
                <div class="${isReset ? 'sc-student-chip sc-chip-stagger' : 'sc-student-chip'}${s.isNew ? ' sc-chip-new' : ''}" ${isReset ? `style="--chip-i: ${index}"` : ''} draggable="true" data-result-id="${s.id}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                    <span class="sc-student-chip-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                    ${s.isNew ? '<span class="sc-chip-badge sc-chip-badge-new">Nouveau</span>' : ''}
                    <button type="button" class="sc-chip-profile-btn" data-profile-id="${s.id}" aria-label="Voir la fiche de ${Utils.escapeHtml(s.prenom || s.nom)}" data-tooltip="Voir la fiche élève">
                        <iconify-icon icon="solar:user-id-linear"></iconify-icon>
                    </button>
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
                            <button type="button" class="sc-chip-profile-btn" data-profile-id="${s.id}" aria-label="Voir la fiche de ${Utils.escapeHtml(s.prenom || s.nom)}" data-tooltip="Voir la fiche élève">
                                <iconify-icon icon="solar:user-id-linear"></iconify-icon>
                            </button>
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

            const profileBtn = chip.querySelector('.sc-chip-profile-btn');
            profileBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._isLocked) return;
                TooltipsUI?.hideAll?.();
                this._clearSelection();
                FocusPanelManager.open(id);
            });

            chip.addEventListener('dragstart', (e) => {
                if (this._isLocked || e.target.closest?.('.sc-chip-profile-btn')) {
                    e.preventDefault();
                    return;
                }
                TooltipsUI?.hideAll?.();
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
                document.body.classList.remove('sc-drag-over-sidebar');
            });

            chip.addEventListener('click', (e) => {
                if (e.defaultPrevented || this._isLocked || e.target.closest?.('.sc-chip-profile-btn')) return;
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
        TooltipsUI?.initTooltips?.(list);

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
        let occupiedStations = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this._isSpecialSpot(r, c)) {
                    specialSpotsCount++;
                } else if (this._getCellStudentIds(r, c).length > 0) {
                    occupiedStations++;
                }
            }
        }
        const availableSeats = Math.max(0, (rows * cols) - specialSpotsCount - occupiedStations);

        const prev = this._prevPlacedCount;
        const unplaced = Math.max(0, total - placedActive);

        // --- Sidebar Title Dynamic Progress ---
        const sidebarTitle = document.getElementById('scSidebarTitle');
        if (sidebarTitle) {
            if (total === 0) {
                sidebarTitle.innerHTML = '<span>Élèves non placés</span>';
            } else if (unplaced === 0) {
                sidebarTitle.innerHTML = '<span class="sc-all-placed-title"><iconify-icon icon="solar:check-circle-bold"></iconify-icon><span>Tous les élèves sont placés</span></span>';
            } else {
                const existingVal = sidebarTitle.querySelector('.sc-dynamic-value');
                if (existingVal) {
                    existingVal.textContent = unplaced;
                } else {
                    sidebarTitle.innerHTML = `<span>Élèves non placés</span><span class="sc-dynamic-value">${unplaced}</span>`;
                }
            }
        }

        if (info) {
            const unitLabel = this._isActivityMode() ? 'poste' : 'place';
            info.textContent = availableSeats > 0
                ? `${availableSeats} ${unitLabel}${availableSeats > 1 ? 's' : ''} libre${availableSeats > 1 ? 's' : ''}`
                : 'Complet';
        }

        if (prev !== placed && prev !== 0) this._animateCounterBump();
        this._prevPlacedCount = placed;

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
        const isVirtual = cls.isVirtual || ClassManager.isVirtualClass(cls.id);
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
    // DRAG & DROP — with animation hooks
    // ========================================================================

    _willDropJoinGroup(targetRow, targetCol, customSource = null) {
        if (!this._isActivityMode() || this._isLocked) return false;
        const dragSource = customSource || this._dragSource || this._touchSourceInfo;
        if (!dragSource) return false;

        const targetIds = this._getCellStudentIds(targetRow, targetCol);
        if (targetIds.length === 0 || targetIds.length >= MAX_ACTIVITY_GROUP_SIZE) return false;

        const posKey = this._getActivePositionKey();
        if (targetIds.some(id => this._studentMap?.get(id)?.[posKey]?.pinned)) return false;

        if (dragSource.type === 'sidebar') {
            return !targetIds.includes(dragSource.resultId) && (targetIds.length + 1 <= MAX_ACTIVITY_GROUP_SIZE);
        }
        if (dragSource.type === 'group-member') {
            if (Number(dragSource.row) === Number(targetRow) && Number(dragSource.col) === Number(targetCol)) return false;
            return !targetIds.includes(dragSource.resultId) && (targetIds.length + 1 <= MAX_ACTIVITY_GROUP_SIZE);
        }
        if (dragSource.type === 'multi-cell') {
            const incoming = (dragSource.ids || []).filter(id => !targetIds.includes(id));
            return incoming.length > 0 && (targetIds.length + incoming.length <= MAX_ACTIVITY_GROUP_SIZE);
        }
        if (dragSource.type === 'cell') {
            if (Number(dragSource.row) === Number(targetRow) && Number(dragSource.col) === Number(targetCol)) return false;
            const srcIds = this._getCellStudentIds(dragSource.row, dragSource.col);
            return srcIds.length === 1 && (targetIds.length + 1 <= MAX_ACTIVITY_GROUP_SIZE);
        }
        return false;
    },

    _willDropOverflowGroup(targetRow, targetCol, customSource = null) {
        if (!this._isActivityMode() || this._isLocked) return false;
        const dragSource = customSource || this._dragSource || this._touchSourceInfo;
        if (!dragSource) return false;

        const targetIds = this._getCellStudentIds(targetRow, targetCol);
        if (targetIds.length === 0) return false;

        const posKey = this._getActivePositionKey();
        if (targetIds.some(id => this._studentMap?.get(id)?.[posKey]?.pinned)) return false;

        if (dragSource.type === 'sidebar') {
            return !targetIds.includes(dragSource.resultId) && (targetIds.length + 1 > MAX_ACTIVITY_GROUP_SIZE);
        }
        if (dragSource.type === 'group-member') {
            if (Number(dragSource.row) === Number(targetRow) && Number(dragSource.col) === Number(targetCol)) return false;
            return !targetIds.includes(dragSource.resultId) && (targetIds.length + 1 > MAX_ACTIVITY_GROUP_SIZE);
        }
        if (dragSource.type === 'multi-cell') {
            const incoming = (dragSource.ids || []).filter(id => !targetIds.includes(id));
            return incoming.length > 0 && (targetIds.length + incoming.length > MAX_ACTIVITY_GROUP_SIZE);
        }
        if (dragSource.type === 'cell') {
            if (Number(dragSource.row) === Number(targetRow) && Number(dragSource.col) === Number(targetCol)) return false;
            const srcIds = this._getCellStudentIds(dragSource.row, dragSource.col);
            return srcIds.length === 1 && (targetIds.length + 1 > MAX_ACTIVITY_GROUP_SIZE);
        }
        return false;
    },

    _handleDrop(targetRow, targetCol) {
        if (!this._dragSource || !this._isValidDropTarget(targetRow, targetCol)) return;
        this._removeDragClones?.();

        const { type, resultId, row: srcRow, col: srcCol, ids } = this._dragSource;

        // Activity mode: dropping onto an occupied station with available capacity joins the group/binôme
        if (this._willDropJoinGroup(targetRow, targetCol)) {
            const incomingIds = type === 'multi-cell' ? ids : [resultId];
            this._dragSource = null;
            this._selectedChipIds = [];
            this._updateSelectionAttribute();
            this._joinStudentsToCell(targetRow, targetCol, incomingIds);
            return;
        }

        // Activity mode: protect full group (4 max) from being overwritten on overflow drop
        if (this._willDropOverflowGroup(targetRow, targetCol)) {
            this._dragSource = null;
            this._notifyGroupFull(targetRow, targetCol);
            return;
        }

        if (type === 'multi-cell') {
            this._selectedChipIds = ids;
            this._placeSelectedAt(targetRow, targetCol);
            this._dragSource = null;
            return;
        }

        const targetVal = this._gridState[targetRow]?.[targetCol];

        if ((type === 'cell' || type === 'group-member') && targetRow === srcRow && targetCol === srcCol) return;

        this._snapshotGrid();

        const isSwap = type === 'cell' && Boolean(targetVal);

        if (type === 'sidebar') {
            this._gridState[targetRow][targetCol] = resultId;
        } else if (type === 'group-member') {
            const srcIds = this._getCellStudentIds(srcRow, srcCol).filter(id => id !== resultId);
            this._setCellStudentIds(srcRow, srcCol, srcIds);
            this._gridState[targetRow][targetCol] = resultId;
        } else if (type === 'cell') {
            const srcVal = this._gridState[srcRow]?.[srcCol] ?? resultId;
            if (targetVal) {
                this._gridState[srcRow][srcCol] = Array.isArray(targetVal) ? [...targetVal] : targetVal;
                this._gridState[targetRow][targetCol] = Array.isArray(srcVal) ? [...srcVal] : srcVal;
            } else {
                this._gridState[srcRow][srcCol] = null;
                this._gridState[targetRow][targetCol] = Array.isArray(srcVal) ? [...srcVal] : srcVal;
            }
        }

        this._dragSource = null;
        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        this._haptic(isSwap ? [12, 40, 12] : 15);

        if (type === 'sidebar' || type === 'group-member') {
            this._animateCellPlaced(targetRow, targetCol);
        } else if (isSwap) {
            this._animateCellSwap(srcRow, srcCol, targetRow, targetCol, { fromDrag: true });
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

    _removeStudentFromCell(row, col, studentId) {
        if (this._isLocked || !studentId) return;
        const currentIds = this._getCellStudentIds(row, col);
        if (!currentIds.includes(studentId)) return;

        if (currentIds.length <= 1) {
            this._removeFromCell(row, col);
            return;
        }

        this._snapshotGrid();
        const remainingIds = currentIds.filter(id => id !== studentId);
        this._setCellStudentIds(row, col, remainingIds);
        this._savePositionsToState();
        this._renderGrid();
        this._haptic(12);
        this._renderSidebar(studentId);
        this._updateFooter();
        this._updateSidebarLockState();
        this._onRemovalComplete();
    },

    _removeFromCell(row, col) {
        if (this._isLocked) return;
        this._snapshotGrid();

        const removedIds = this._getCellStudentIds(row, col);
        const primaryRemovedId = removedIds[0] || null;
        const cell = document.querySelector(`.sc-cell[data-row="${row}"][data-col="${col}"]`);

        this._flyStudentToSidebar(cell, () => {
            this._gridState[row][col] = null;
            this._savePositionsToState();
            this._renderGrid();
            this._haptic(12);
            this._renderSidebar(primaryRemovedId);
            this._updateFooter();
            this._updateSidebarLockState();
            this._onRemovalComplete();

            if (this._isMobileView() && window.UI?.showNotification) {
                const msg = removedIds.length > 1 ? 'Poste libéré' : 'Élève retiré du plan';
                window.UI.showNotification(msg, 'info', 4000, {
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
        const canDrag = !this._isLocked && !isPinned;
        cell.draggable = canDrag;
        cell.querySelectorAll('.sc-stacked-avatar, .sc-stacked-member').forEach(el => {
            el.draggable = canDrag;
        });
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
        const result = appState.generatedResults?.find(r => r.id === resultId);
        if (!result?.[posKey]) return;

        const nextPinned = !result[posKey].pinned;
        result[posKey].pinned = nextPinned;
        result._lastModified = Date.now();

        const student = this._students.find(s => s.id === resultId);
        if (student) student[posKey] = { ...result[posKey] };

        this._hasChangesSinceUnlock = true;
        const currentClass = this._getCurrentClass();
        if (currentClass) currentClass[lockKey] = false;
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
        if (currentClass) currentClass[lockKey] = false;
        StorageManager.saveAppState();
        this._updateCellPinDOM(row, col, nextPinned);
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
        let pendingSourceInfo = null;

        element.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || this._isPinching || this._isLocked || element.classList.contains('pinned') || e.target.closest?.('.sc-chip-profile-btn')) {
                clearTimeout(longPressTimer);
                if (this._longPressTimer) {
                    clearTimeout(this._longPressTimer);
                    this._longPressTimer = null;
                }
                pendingSourceInfo = null;
                return;
            }
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
            pendingSourceInfo = activeSourceInfo;

            // Long-press affordance on touch (280ms hold triggers drag in any direction with subtle haptic):
            // - Sidebar chips: hold unlocks free omnidirectional drag
            // - Board cells: hold lifts the desk to drag, leaving quick swipes to pan/scroll the board!
            clearTimeout(longPressTimer);
            if (this._longPressTimer) clearTimeout(this._longPressTimer);
            longPressTimer = setTimeout(() => {
                this._longPressTimer = null;
                if (!hasMoved && !isScrolling && !this._isPinching && pendingSourceInfo) {
                    hasMoved = true;
                    this._touchSourceInfo = pendingSourceInfo;
                    this._suppressTouchTooltips(0);
                    this._haptic(18);
                    if (sourceInfo.resultId && !this._selectedChipIds.includes(sourceInfo.resultId)) {
                        this._clearSelection();
                    }
                    this._createTouchGhost(element, touch);
                }
            }, 280);
            this._longPressTimer = longPressTimer;
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (this._isPinching || (e.touches && e.touches.length > 1)) {
                clearTimeout(longPressTimer);
                isScrolling = true;
                pendingSourceInfo = null;
                this._cleanupTouch();
                return;
            }
            if ((!pendingSourceInfo && !this._touchSourceInfo) || this._isLocked || isScrolling || element.classList.contains('pinned')) return;
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;

            // Touch gestures disambiguation
            if (!hasMoved) {
                if (sourceInfo.type === 'sidebar') {
                    if (this._isMobileView()) {
                        // Horizontal motion in bottom tray: prioritize native horizontal list scrolling
                        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
                            isScrolling = true;
                            clearTimeout(longPressTimer);
                            pendingSourceInfo = null;
                            this._touchSourceInfo = null;
                            return;
                        }

                        // Vertical motion pulling upward toward the board: engage drag immediately
                        if (dy < -12 && Math.abs(dy) > Math.abs(dx) * 1.1) {
                            clearTimeout(longPressTimer);
                            hasMoved = true;
                            this._touchSourceInfo = pendingSourceInfo;
                            this._suppressTouchTooltips(0);
                            if (sourceInfo.resultId && !this._selectedChipIds.includes(sourceInfo.resultId)) {
                                this._clearSelection();
                            }
                            this._createTouchGhost(element, touch);
                        }
                    } else if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                        clearTimeout(longPressTimer);
                        hasMoved = true;
                        this._touchSourceInfo = pendingSourceInfo;
                        this._suppressTouchTooltips(0);
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
                        pendingSourceInfo = null;
                        this._touchSourceInfo = null;
                        return;
                    }
                }
            }

            if (hasMoved && this._touchDragEl) {
                if (e.cancelable) e.preventDefault();
                this._touchDragEl.style.left = `${touch.clientX}px`;
                this._touchDragEl.style.top = `${touch.clientY}px`;
                this._highlightCellUnderTouch(touch.clientX, touch.clientY);
                this._updateTouchAutoScroll(touch.clientX, touch.clientY);
            }
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            clearTimeout(longPressTimer);
            if (this._isPinching || !hasMoved || !this._touchSourceInfo) {
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
        if (element.classList.contains('sc-cell-stacked')) {
            ghost.classList.add('sc-cell', 'sc-cell-stacked');
        }
        if (element.offsetWidth > 0 && element.offsetHeight > 0 && element.classList.contains('sc-cell')) {
            ghost.style.setProperty('--sc-cell-w', `${element.offsetWidth}px`);
            ghost.style.setProperty('--sc-cell-h', `${element.offsetHeight}px`);
        }
        ghost.classList.remove('sc-chip-selected');
        ghost.querySelectorAll('.sc-cell-remove, .sc-cell-pin, .sc-stacked-member-remove, .sc-station-badge, .sc-stacked-count-pill, .sc-chip-badge, .sc-chip-profile-btn').forEach(el => el.remove());

        if (element.classList.contains('sc-student-chip')) {
            const chipNameEl = ghost.querySelector('.sc-student-chip-name');
            if (chipNameEl) {
                chipNameEl.className = 'sc-cell-name';
                const studentId = element.dataset?.resultId;
                const student = studentId ? (this._studentMap?.get(studentId) || this._students?.find(s => s.id === studentId)) : null;
                if (student) {
                    chipNameEl.innerHTML = Utils.formatStudentInitialLabel(student.nom, student.prenom, true);
                }
            }
        }

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

    _updateTouchAutoScroll(x, y) {
        this._lastTouchDragX = x;
        this._lastTouchDragY = y;

        if (this._isFitted || !this._touchDragEl || this._isTouchOverSidebar(x, y)) {
            this._stopTouchAutoScroll();
            return;
        }

        const gridArea = document.getElementById('scGridArea');
        if (!gridArea) return;

        const rect = gridArea.getBoundingClientRect?.();
        if (!rect || rect.width <= 0 || rect.height <= 0) return;

        const edgeThreshold = 48;
        const maxSpeed = 9;
        let vx = 0;
        let vy = 0;

        if (x - rect.left < edgeThreshold && x >= rect.left) {
            vx = -Math.round(((edgeThreshold - (x - rect.left)) / edgeThreshold) * maxSpeed);
        } else if (rect.right - x < edgeThreshold && x <= rect.right) {
            vx = Math.round(((edgeThreshold - (rect.right - x)) / edgeThreshold) * maxSpeed);
        }

        const topBoundary = rect.top + 56;
        if (y - topBoundary < edgeThreshold && y >= rect.top) {
            vy = -Math.round(((edgeThreshold - Math.max(0, y - topBoundary)) / edgeThreshold) * maxSpeed);
        } else if (rect.bottom - y < edgeThreshold && y <= rect.bottom) {
            vy = Math.round(((edgeThreshold - (rect.bottom - y)) / edgeThreshold) * maxSpeed);
        }

        this._touchAutoScrollVx = vx;
        this._touchAutoScrollVy = vy;

        if (vx === 0 && vy === 0) {
            this._stopTouchAutoScroll();
            return;
        }

        if (!this._touchAutoScrollRaf) {
            const step = () => {
                if (!this._touchDragEl || this._isFitted || (this._touchAutoScrollVx === 0 && this._touchAutoScrollVy === 0)) {
                    this._touchAutoScrollRaf = null;
                    return;
                }
                const ga = document.getElementById('scGridArea');
                if (ga) {
                    const maxScrollX = Math.max(0, (ga.scrollWidth || 0) - (ga.clientWidth || 0));
                    const maxScrollY = Math.max(0, (ga.scrollHeight || 0) - (ga.clientHeight || 0));
                    if (maxScrollX > 0 && this._touchAutoScrollVx !== 0) {
                        ga.scrollLeft = Math.max(0, Math.min(maxScrollX, ga.scrollLeft + this._touchAutoScrollVx));
                    }
                    if (maxScrollY > 0 && this._touchAutoScrollVy !== 0) {
                        ga.scrollTop = Math.max(0, Math.min(maxScrollY, ga.scrollTop + this._touchAutoScrollVy));
                    }
                    this._highlightCellUnderTouch(this._lastTouchDragX, this._lastTouchDragY);
                }
                this._touchAutoScrollRaf = requestAnimationFrame(step);
            };
            this._touchAutoScrollRaf = requestAnimationFrame(step);
        }
    },

    _stopTouchAutoScroll() {
        this._touchAutoScrollVx = 0;
        this._touchAutoScrollVy = 0;
        if (this._touchAutoScrollRaf) {
            cancelAnimationFrame(this._touchAutoScrollRaf);
            this._touchAutoScrollRaf = null;
        }
    },

    _cleanupTouch() {
        const hadActiveDrag = Boolean(this._touchDragEl || this._touchSourceInfo);
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        this._stopTouchAutoScroll();
        this._removeTouchGhost();
        this._touchSourceInfo = null;
        if (hadActiveDrag && !this._isPinching) {
            this._suppressTouchTooltips(400);
        }
        document.body.classList.remove('sc-drag-over-sidebar');
        document.querySelectorAll('.sc-cell.drag-over, .sc-cell.drag-over-join, .sc-cell.drag-over-full').forEach(c => {
            c.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
        });
        document.querySelector('.sc-sidebar')?.classList.remove('drag-over');
    },

    _highlightCellUnderTouch(x, y) {
        document.querySelectorAll('.sc-cell.drag-over, .sc-cell.drag-over-join, .sc-cell.drag-over-full').forEach(c => {
            c.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
        });
        const sidebar = document.querySelector('.sc-sidebar');
        if (sidebar) sidebar.classList.remove('drag-over');
        document.body.classList.remove('sc-drag-over-sidebar');

        if (this._isTouchOverSidebar(x, y)) {
            if (sidebar && !this._isLocked && this._touchSourceInfo && (this._touchSourceInfo.type === 'cell' || this._touchSourceInfo.type === 'multi-cell' || this._touchSourceInfo.type === 'group-member')) {
                sidebar.classList.add('drag-over');
                document.body.classList.add('sc-drag-over-sidebar');
            }
        } else {
            const cell = this._getCellUnderPoint(x, y);
            if (cell) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                if (this._isValidDropTarget(row, col)) {
                    cell.classList.add('drag-over');
                    if (this._willDropJoinGroup(row, col, this._touchSourceInfo)) {
                        cell.classList.add('drag-over-join');
                    } else if (this._willDropOverflowGroup(row, col, this._touchSourceInfo)) {
                        cell.classList.add('drag-over-full');
                    }
                }
            }
        }
    },

    _getCellUnderPoint(x, y) {
        return (document.elementsFromPoint(x, y) || []).find(el => el.classList.contains('sc-cell')) || null;
    },

    // ========================================================================
    // ACTIONS — with animation orchestration (see ./seating/SeatingAutoPlace.js)
    // ========================================================================
    ...SeatingAutoPlace,

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
        const posKey = this._getActivePositionKey();
        const targetIds = this._getCellStudentIds(r, c);
        if (targetIds.length > 0) {
            const anyPinned = targetIds.some(id => {
                const targetStudent = this._students.find(s => s.id === id);
                return Boolean(targetStudent?.[posKey]?.pinned);
            });
            if (anyPinned) return false;
        }

        // 3. Check if dragging cell onto itself
        const dragSource = this._dragSource || this._touchSourceInfo;
        if (dragSource) {
            if ((dragSource.type === 'cell' || dragSource.type === 'group-member') && Number(dragSource.row) === r && Number(dragSource.col) === c) {
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
        this._removeDragClones?.();

        const { type, resultId, row, col, ids } = this._dragSource;

        if (type === 'group-member') {
            this._removeStudentFromCell(row, col, resultId);
            this._dragSource = null;
            return;
        }

        this._snapshotGrid();

        if (type === 'cell') {
            const removedIds = this._getCellStudentIds(row, col);
            this._animateCellRemove(row, col, () => {
                this._gridState[row][col] = null;
                this._savePositionsToState();
                this._renderGrid();
                this._haptic(12);
                this._renderSidebar(resultId || removedIds[0]);
                this._updateFooter();
                this._updateSidebarLockState();
                this._onRemovalComplete();

                if (this._isMobileView() && window.UI?.showNotification) {
                    const msg = removedIds.length > 1 ? 'Poste libéré' : 'Élève retiré du plan';
                    window.UI.showNotification(msg, 'info', 4000, {
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
        } else if (type === 'multi-cell') {
            const rows = this._getRows();
            const cols = this._getCols();
            let delay = 0;
            const removedIds = [];

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cellIds = this._getCellStudentIds(r, c);
                    const matching = cellIds.filter(id => ids.includes(id));
                    if (matching.length > 0) {
                        const remaining = cellIds.filter(id => !ids.includes(id));
                        if (remaining.length === 0) {
                            const cell = document.querySelector(`.sc-cell[data-row="${r}"][data-col="${c}"]`);
                            if (cell) {
                                cell.style.setProperty('--cell-i', delay);
                                cell.classList.add('sc-cell-removing');
                                delay++;
                            }
                        }
                        this._setCellStudentIds(r, c, remaining);
                        removedIds.push(...matching);
                    }
                }
            }

            setTimeout(() => {
                this._savePositionsToState();
                this._renderGrid();
                this._haptic(15);
                this._renderSidebar();
                this._updateFooter();
                this._updateSidebarLockState();
                this._onRemovalComplete();
                this._clearSelection();

                if (this._isMobileView() && window.UI?.showNotification) {
                    const count = removedIds.length;
                    window.UI.showNotification(`${count} élève${count > 1 ? 's' : ''} retiré${count > 1 ? 's' : ''} du plan`, 'info', 4000, {
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
    },

    _getEffectiveOnboardingStep() {
        if (this._isActivityMode()) return 'activity';
        if (this._onboardingStep === 'room' || this._onboardingStep === 'placement') {
            return this._onboardingStep;
        }
        const isConfigured = this._isRoomConfigured('course');
        this._onboardingStep = isConfigured ? 'placement' : 'room';
        return this._onboardingStep;
    },

    _transitionOnboardingStep(hint, nextStep) {
        if (!hint) return;
        const startW = hint.offsetWidth;
        const startH = hint.offsetHeight;

        hint.dataset.step = nextStep;
        this._renderOnboardingHintContent(hint, nextStep);

        const endW = hint.offsetWidth;
        const endH = hint.offsetHeight;

        if (typeof hint.animate === 'function' && startW > 0 && startH > 0 && (startW !== endW || startH !== endH)) {
            hint.style.overflow = 'hidden';
            const anim = hint.animate([
                { width: `${startW}px`, height: `${startH}px` },
                { width: `${endW}px`, height: `${endH}px` }
            ], {
                duration: 240,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
            });
            const cleanup = () => {
                hint.style.overflow = '';
            };
            anim.onfinish = cleanup;
            anim.oncancel = cleanup;
        }
    },

    _confirmRoomSetup() {
        const gridKey = this._getActiveGridKey();
        appState[gridKey] = {
            rows: this._getRows(),
            cols: this._getCols(),
            locked: this._isLocked,
            roomConfigured: true,
            specialLayout: appState[gridKey]?.specialLayout || {}
        };
        document.getElementById('scConfigBtn')?.classList.remove('sc-has-pulse');
        StorageManager.saveAppState();

        this._roomSetupFromPlacement = false;
        this._roomSetupSnapshot = null;
        this._onboardingStep = 'placement';
        const hint = document.querySelector('#scGridArea .sc-onboarding-hint');
        if (hint) {
            this._transitionOnboardingStep(hint, 'placement');
        }
    },

    _cancelRoomSetup() {
        const snap = this._roomSetupSnapshot;
        const gridKey = this._getActiveGridKey();
        let hasGridChanged = false;

        if (snap) {
            const currentSpecialJson = JSON.stringify(appState[gridKey]?.specialLayout || {});
            const snapSpecialJson = JSON.stringify(snap.gridClone?.specialLayout || {});
            hasGridChanged = this._getRows() !== snap.rows
                || this._getCols() !== snap.cols
                || currentSpecialJson !== snapSpecialJson;

            appState[gridKey] = snap.gridClone ? JSON.parse(JSON.stringify(snap.gridClone)) : null;
            if (hasGridChanged) {
                const rowSlider = document.getElementById('scRowsSlider');
                const colSlider = document.getElementById('scColsSlider');
                const rowValEl = document.getElementById('scRowsValue');
                const colValEl = document.getElementById('scColsValue');
                if (rowSlider) rowSlider.value = String(snap.rows);
                if (rowValEl) rowValEl.textContent = String(snap.rows);
                if (colSlider) colSlider.value = String(snap.cols);
                if (colValEl) colValEl.textContent = String(snap.cols);
                this._initGrid(snap.rows, snap.cols);
                this._loadPositionsFromState();
                StorageManager.saveAppState();
            }
        }

        this._roomSetupFromPlacement = false;
        this._roomSetupSnapshot = null;
        this._onboardingStep = 'placement';

        if (hasGridChanged) {
            this._render();
            this._applySmartFit(true);
        } else {
            const hint = document.querySelector('#scGridArea .sc-onboarding-hint');
            if (hint) {
                this._transitionOnboardingStep(hint, 'placement');
            }
        }
    },

    _maybeShowOnboardingHint() {
        if (this._getPlacedIds().size > 0 || this._isLocked) return;

        const gridArea = document.getElementById('scGridArea');
        if (!gridArea) return;

        const step = this._getEffectiveOnboardingStep();
        let hint = gridArea.querySelector('.sc-onboarding-hint');

        if (hint && !hint.classList.contains('sc-hint-exiting')) {
            if (hint.dataset.step === step) {
                this._syncOnboardingHintUI(hint);
                return;
            }
            this._transitionOnboardingStep(hint, step);
            return;
        }

        if (hint) hint.remove();

        hint = document.createElement('div');
        hint.className = 'sc-onboarding-hint';
        hint.dataset.step = step;
        this._renderOnboardingHintContent(hint, step);
        gridArea.appendChild(hint);

        const gridKey = this._getActiveGridKey();
        if (!appState[gridKey] && step !== 'room') {
            document.getElementById('scConfigBtn')?.classList.add('sc-has-pulse');
        }
    },

    _renderOnboardingHintContent(hint, step) {
        if (step === 'activity') {
            hint.innerHTML = `
                <div class="sc-onboarding-hint-text">
                    <div class="sc-hint-title">Plan d'activité vide</div>
                    <div class="sc-hint-subtitle">Créez des binômes, groupes ou postes de travail.</div>
                </div>
                <div class="sc-onboarding-actions">
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintPairsRandomBtn">
                        <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                        <span>Binômes aléatoires</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintPairsNeighborsBtn">
                        <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon>
                        <span>Binômes voisins du cours</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintGroups4Btn">
                        <iconify-icon icon="solar:widget-4-linear"></iconify-icon>
                        <span>Groupes de 4 / Terrains</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                        <span>Placer manuellement</span>
                    </button>
                </div>
            `;
        } else if (step === 'room') {
            const rows = this._getRows();
            const cols = this._getCols();
            const activePreset = this._detectCurrentRoomPreset();
            const capInfo = this._getRoomCapacityInfo();
            const isWarning = capInfo.isShortForCurrent || capInfo.isShortForMax;
            const isEditMode = Boolean(this._roomSetupFromPlacement);

            hint.innerHTML = `
                <div class="sc-onboarding-hint-text">
                    ${isEditMode ? '' : '<span class="sc-hint-step-badge">Étape 1 / 2 · Configuration unique</span>'}
                    <div class="sc-hint-title">${isEditMode ? 'Régler la salle de cours' : 'Configurez votre salle de cours'}</div>
                    <div class="sc-hint-subtitle">Ce plan de salle s'appliquera à toutes vos classes (modifiable à tout moment).</div>
                </div>

                <div class="sc-room-preset-grid" role="radiogroup" aria-label="Disposition des tables">
                    <button type="button" class="sc-room-preset-card ${activePreset === 'compact' ? 'active' : ''}" data-room-preset="compact" role="radio" aria-checked="${activePreset === 'compact'}">
                        <span class="sc-preset-diagram" aria-hidden="true">
                            <span class="sc-mini-diagram is-compact">
                                <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                                <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                            </span>
                        </span>
                        <span class="sc-preset-card-title">Sans allée</span>
                        <span class="sc-preset-card-sub">6 col. continues</span>
                    </button>
                    <button type="button" class="sc-room-preset-card ${activePreset === 'center-aisle' ? 'active' : ''}" data-room-preset="center-aisle" role="radio" aria-checked="${activePreset === 'center-aisle'}">
                        <span class="sc-preset-diagram" aria-hidden="true">
                            <span class="sc-mini-diagram is-center-aisle">
                                <span class="sc-mini-row"><i></i><i></i><i></i><b class="aisle"></b><i></i><i></i><i></i></span>
                                <span class="sc-mini-row"><i></i><i></i><i></i><b class="aisle"></b><i></i><i></i><i></i></span>
                            </span>
                        </span>
                        <span class="sc-preset-card-title">1 allée centrale</span>
                        <span class="sc-preset-card-sub">2 îlots de 3</span>
                    </button>
                    <button type="button" class="sc-room-preset-card ${activePreset === 'double-aisles' ? 'active' : ''}" data-room-preset="double-aisles" role="radio" aria-checked="${activePreset === 'double-aisles'}">
                        <span class="sc-preset-diagram" aria-hidden="true">
                            <span class="sc-mini-diagram is-double-aisles">
                                <span class="sc-mini-row"><i></i><i></i><b class="aisle"></b><i></i><i></i><b class="aisle"></b><i></i><i></i></span>
                                <span class="sc-mini-row"><i></i><i></i><b class="aisle"></b><i></i><i></i><b class="aisle"></b><i></i><i></i></span>
                            </span>
                        </span>
                        <span class="sc-preset-card-title">2 allées</span>
                        <span class="sc-preset-card-sub">3 rangées doubles</span>
                    </button>
                </div>

                <div class="sc-onboarding-dims-bar">
                    <div class="sc-onboarding-dims-controls">
                        <div class="sc-onboarding-dim-group">
                            <span class="sc-onboarding-dim-label">Colonnes</span>
                            <div class="sc-onboarding-stepper">
                                <button type="button" class="sc-hint-step-btn" data-dim="cols" data-delta="-1" aria-label="Moins de colonnes" ${cols <= MIN_COLS ? 'disabled' : ''}>−</button>
                                <span class="sc-hint-dim-val" id="scHintColsVal">${cols}</span>
                                <button type="button" class="sc-hint-step-btn" data-dim="cols" data-delta="1" aria-label="Plus de colonnes" ${cols >= MAX_COLS ? 'disabled' : ''}>+</button>
                            </div>
                        </div>
                        <span class="sc-onboarding-dim-sep" aria-hidden="true">×</span>
                        <div class="sc-onboarding-dim-group">
                            <span class="sc-onboarding-dim-label">Rangées</span>
                            <div class="sc-onboarding-stepper">
                                <button type="button" class="sc-hint-step-btn" data-dim="rows" data-delta="-1" aria-label="Moins de rangées" ${rows <= MIN_ROWS ? 'disabled' : ''}>−</button>
                                <span class="sc-hint-dim-val" id="scHintRowsVal">${rows}</span>
                                <button type="button" class="sc-hint-step-btn" data-dim="rows" data-delta="1" aria-label="Plus de rangées" ${rows >= MAX_ROWS ? 'disabled' : ''}>+</button>
                            </div>
                        </div>
                    </div>
                    <div class="sc-hint-capacity-pill ${isWarning ? 'is-warning' : 'is-ok'}" id="scHintCapacityBadge" role="status">
                        ${this._getCapacityBadgeInnerHTML(capInfo)}
                    </div>
                </div>

                <div class="sc-onboarding-actions">
                    <button type="button" class="sc-onboarding-btn secondary sc-onboarding-confirm-btn" id="scHintConfirmRoomBtn">
                        <iconify-icon icon="${isEditMode ? 'solar:check-read-linear' : 'solar:arrow-right-linear'}"></iconify-icon>
                        <span>${isEditMode ? 'Valider la salle' : 'Continuer vers le placement'}</span>
                    </button>
                    <div class="sc-onboarding-footer-links">
                        ${isEditMode ? `
                            <button type="button" class="sc-onboarding-btn text-only" id="scHintCancelRoomBtn">
                                <iconify-icon icon="solar:arrow-left-linear"></iconify-icon>
                                <span>Retour sans modifier</span>
                            </button>
                        ` : `
                            <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                                <span>Passer et placer manuellement</span>
                            </button>
                        `}
                    </div>
                </div>
            `;
        } else {
            const capInfo = this._getRoomCapacityInfo();
            const rows = this._getRows();
            let capacityWarningHTML = '';
            if (capInfo.isShortForCurrent && rows < MAX_ROWS) {
                const desksPerRow = Math.max(1, Math.round(capInfo.totalSeats / Math.max(1, rows)));
                const missingSeats = capInfo.activeClassStudents - capInfo.totalSeats;
                const extraRowsNeeded = Math.min(MAX_ROWS - rows, Math.max(1, Math.ceil(missingSeats / desksPerRow)));
                capacityWarningHTML = `
                    <div class="sc-onboarding-capacity-alert">
                        <span><iconify-icon icon="solar:danger-triangle-bold"></iconify-icon> ${capInfo.totalSeats} places pour ${capInfo.activeClassStudents} élèves</span>
                        <button type="button" class="sc-onboarding-adapt-btn" id="scHintAutoExpandRowsBtn" data-extra-rows="${extraRowsNeeded}">
                            Adapter (+${extraRowsNeeded} rangée${extraRowsNeeded > 1 ? 's' : ''})
                        </button>
                    </div>
                `;
            }

            hint.innerHTML = `
                <div class="sc-onboarding-hint-text">
                    <div class="sc-hint-title">Plan de classe vide</div>
                    <div class="sc-hint-subtitle">Placez vos élèves pour commencer.</div>
                </div>
                ${capacityWarningHTML}
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
                    <div class="sc-onboarding-footer-links">
                        <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                            <span>Placer manuellement</span>
                        </button>
                        <span class="sc-onboarding-footer-dot" aria-hidden="true">·</span>
                        <button type="button" class="sc-onboarding-btn text-only" id="scHintEditRoomBtn">
                            <iconify-icon icon="solar:settings-minimalistic-linear"></iconify-icon>
                            <span>Régler la salle</span>
                        </button>
                    </div>
                </div>
            `;
        }

        this._bindOnboardingHintEvents(hint);
    },

    _bindOnboardingHintEvents(hint) {
        hint.querySelectorAll('.sc-room-preset-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const preset = btn.dataset.roomPreset;
                if (preset) {
                    this._applyRoomPreset(preset);
                }
            });
        });

        hint.querySelectorAll('.sc-hint-step-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dim = btn.dataset.dim;
                const delta = parseInt(btn.dataset.delta, 10);
                if (dim && !Number.isNaN(delta)) {
                    this._stepGridDimension(dim, delta);
                }
            });
        });

        hint.querySelector('#scHintConfirmRoomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._confirmRoomSetup();
        });

        hint.querySelector('#scHintCancelRoomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._cancelRoomSetup();
        });

        hint.querySelector('#scHintEditRoomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const gridKey = this._getActiveGridKey();
            this._roomSetupFromPlacement = true;
            this._roomSetupSnapshot = {
                rows: this._getRows(),
                cols: this._getCols(),
                gridClone: appState[gridKey] ? JSON.parse(JSON.stringify(appState[gridKey])) : null
            };
            this._onboardingStep = 'room';
            this._transitionOnboardingStep(hint, 'room');
        });

        hint.querySelector('#scHintAutoExpandRowsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const extra = parseInt(e.currentTarget.dataset.extraRows, 10) || 1;
            this._stepGridDimension('rows', extra);
            this._renderOnboardingHintContent(hint, 'placement');
        });

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
        hint.querySelector('#scHintPairsRandomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('pairs-random');
        });
        hint.querySelector('#scHintPairsNeighborsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('pairs-neighbors');
        });
        hint.querySelector('#scHintGroups4Btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('groups-4');
        });
        hint.querySelector('#scHintManualBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismissOnboardingHint();
        });
    },

    _syncOnboardingHintUI(hint) {
        if (!hint || hint.dataset.step !== 'room') return;

        const rows = this._getRows();
        const cols = this._getCols();
        const activePreset = this._detectCurrentRoomPreset();
        const capInfo = this._getRoomCapacityInfo();
        const isWarning = capInfo.isShortForCurrent || capInfo.isShortForMax;

        const colsVal = hint.querySelector('#scHintColsVal');
        const rowsVal = hint.querySelector('#scHintRowsVal');
        if (colsVal) colsVal.textContent = cols;
        if (rowsVal) rowsVal.textContent = rows;

        hint.querySelectorAll('.sc-hint-step-btn').forEach(btn => {
            const dim = btn.dataset.dim;
            const delta = parseInt(btn.dataset.delta, 10);
            if (dim === 'cols') {
                btn.disabled = (delta < 0 && cols <= MIN_COLS) || (delta > 0 && cols >= MAX_COLS);
            } else if (dim === 'rows') {
                btn.disabled = (delta < 0 && rows <= MIN_ROWS) || (delta > 0 && rows >= MAX_ROWS);
            }
        });

        hint.querySelectorAll('.sc-room-preset-card').forEach(card => {
            const isMatch = card.dataset.roomPreset === activePreset;
            card.classList.toggle('active', isMatch);
            card.setAttribute('aria-checked', isMatch ? 'true' : 'false');
        });

        const capBadge = hint.querySelector('#scHintCapacityBadge');
        if (capBadge) {
            capBadge.innerHTML = this._getCapacityBadgeInnerHTML(capInfo);
            capBadge.classList.toggle('is-warning', isWarning);
            capBadge.classList.toggle('is-ok', !isWarning);
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
    // SEARCH & SPOTLIGHT (see ./seating/SeatingSearch.js)
    // ========================================================================
    ...SeatingSearch
};
