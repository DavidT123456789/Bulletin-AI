/**
 * @fileoverview Seating Chart Manager — Plan de Classe (Integrated View Facade)
 * In-place view switching (List ↔ Plan) with premium motion design.
 * Features: D&D, pin, lock, evolution dots, config popover, FocusPanel.
 * @module managers/SeatingChartManager
 */

import { appState } from '../state/State.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { StorageManager } from './StorageManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { UI } from './UIManager.js';
import { ClassManager } from './ClassManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { CrossClassSearchManager } from './CrossClassSearchManager.js';
import { HistoryManager } from './HistoryManager.js';
import { SeatingAnimations } from './seating/SeatingAnimations.js';
import { SeatingZoom } from './seating/SeatingZoom.js';
import { SeatingAutoPlace } from './seating/SeatingAutoPlace.js';
import { SeatingSearch } from './seating/SeatingSearch.js';
import {
    SeatingState,
    DEFAULT_COLS,
    DEFAULT_ROWS,
    MAX_ACTIVITY_GROUP_SIZE
} from './seating/SeatingState.js';
import { SeatingRoomLayout } from './seating/SeatingRoomLayout.js';
import { SeatingRenderer } from './seating/SeatingRenderer.js';
import { SeatingSidebar } from './seating/SeatingSidebar.js';
import { SeatingDragDrop } from './seating/SeatingDragDrop.js';
import { SeatingMobileSheet } from './seating/SeatingMobileSheet.js';
import { SeatingPrintExporter } from './seating/SeatingPrintExporter.js';

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
    _hoveredDragCell: null,
    _mousePressedElement: null,
    _mouseDragClone: null,
    _activeMouseDragAbort: null,
    _touchDragEl: null,
    _touchSourceInfo: null,
    _touchPressedElement: null,
    _touchDraggedElement: null,
    _isTouchActive: false,
    _lastTouchTime: 0,
    _lastTouchDragEndTime: 0,
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
    _foldTransitionTimer: null,
    _wasCompactLayout: null,
    _lastViewportW: 0,
    _lastViewportH: 0,
    _pendingFoldDirection: null,
    _pendingFoldTimestamp: 0,
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
        const viewEl = document.getElementById('seatingChartView');
        viewEl?.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') {
                this._isTouchActive = false;
                this._isMousePointerActive = true;
                this._lastTouchTime = 0;
                if (e.button === 0 && !this._isLocked && !e.target.closest?.('.sc-chip-profile-btn, .sc-cell-remove, .sc-cell-pin, .sc-stacked-member-remove, button, input, textarea')) {
                    const dragTarget = e.target.closest?.('.sc-cell.occupied, .sc-student-chip');
                    if (dragTarget && !dragTarget.classList.contains('pinned')) {
                        this._startMousePointerDrag(e, dragTarget);
                    }
                }
            } else if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                this._isTouchActive = true;
                this._isMousePointerActive = false;
                this._lastTouchTime = Date.now();
                try { window.getSelection?.()?.removeAllRanges?.(); } catch (_) {}
                const dragTarget = e.target.closest?.('.sc-cell.occupied, .sc-student-chip');
                if (dragTarget && !this._isLocked) {
                    this._touchPressedElement = dragTarget;
                    this._setElementDraggable(dragTarget, false);
                }
            }
        }, { capture: true, passive: true });

        viewEl?.addEventListener('dragstart', (e) => {
            if (this._mousePressedElement || this._isTouchInteractionActive()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        viewEl?.addEventListener('selectstart', (e) => {
            if (!e.target?.closest?.('input, textarea')) {
                e.preventDefault();
            }
        });

        viewEl?.addEventListener('contextmenu', (e) => {
            if (!this._isLocked || e.target.closest?.('.sc-student-chip')) {
                e.preventDefault();
            }
        });

        viewEl?.addEventListener('dragover', (e) => {
            if (this._isLocked || !this._dragSource) return;
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
            if (this._hoveredDragCell && !this._hoveredDragCell.contains(e.target)) {
                this._hoveredDragCell.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
                this._hoveredDragCell = null;
            }
        });

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
        let tapStartX = 0;
        let tapStartY = 0;
        let tapMoved = false;
        gridArea?.addEventListener('touchstart', (e) => {
            if (e.touches?.length === 1) {
                tapStartX = e.touches[0].clientX;
                tapStartY = e.touches[0].clientY;
                tapMoved = false;
            } else {
                tapMoved = true;
            }
        }, { passive: true });
        gridArea?.addEventListener('touchmove', (e) => {
            if (!tapMoved && e.touches?.length === 1) {
                if (Math.hypot(e.touches[0].clientX - tapStartX, e.touches[0].clientY - tapStartY) > 12) {
                    tapMoved = true;
                }
            }
        }, { passive: true });
        gridArea?.addEventListener('touchend', (e) => {
            if (!e.changedTouches || e.changedTouches.length !== 1 || (e.touches && e.touches.length > 0)) return;
            if (tapMoved) {
                tapMoved = false;
                lastTapTime = 0;
                return;
            }
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
                    if (this._handleFormFactorCheck()) return;
                    const entry = entries[0];
                    const borderBox = Array.isArray(entry?.borderBoxSize) ? entry.borderBoxSize[0] : entry?.borderBoxSize;
                    const w = Math.round(borderBox?.inlineSize ?? gridArea.offsetWidth ?? entry?.contentRect?.width ?? gridArea.clientWidth ?? 0);
                    const h = Math.round(borderBox?.blockSize ?? gridArea.offsetHeight ?? entry?.contentRect?.height ?? gridArea.clientHeight ?? 0);
                    if (w <= 0 || h <= 0) return;
                    const prevGridW = this._lastObservedGridW || 0;
                    const prevGridH = this._lastObservedGridH || 0;
                    if (Math.abs(w - prevGridW) < 2 && Math.abs(h - prevGridH) < 2) return;
                    const orientationFlipped = prevGridW > 0 && prevGridH > 0 && Math.abs(w - prevGridW) >= 40 && ((prevGridW > prevGridH) !== (w > h));
                    if (orientationFlipped) this._pendingOrientationFlip = true;
                    this._lastObservedGridW = w;
                    this._lastObservedGridH = h;
                    clearTimeout(this._resizeDebounceTimer);
                    this._resizeDebounceTimer = setTimeout(() => {
                        if (this._isActive && !this._isPinching && !this._zoomAnimCleanup && !this._modeCarouselTimer) {
                            const forceFit = Boolean(this._pendingOrientationFlip);
                            this._pendingOrientationFlip = false;
                            this._applySmartFit(forceFit);
                        }
                    }, 80);
                });
                this._gridResizeObserver.observe(gridArea);
            }
        }

        this._wasCompactLayout = this._isCompactLayout();
        this._lastViewportW = window.innerWidth || 0;
        this._lastViewportH = window.innerHeight || 0;

        if (!this._resizeListenerInitialized) {
            this._resizeListenerInitialized = true;
            window.addEventListener('resize', () => {
                if (this._handleFormFactorCheck()) return;
                clearTimeout(this._resizeDebounceTimer);
                this._resizeDebounceTimer = setTimeout(() => {
                    if (this._isActive) {
                        const forceFit = Boolean(this._pendingOrientationFlip);
                        this._pendingOrientationFlip = false;
                        this._applySmartFit(forceFit);
                    }
                }, 100);
            });

            const foldMq = window.matchMedia?.('(max-width: 768px)');
            if (foldMq && typeof foldMq.addEventListener === 'function') {
                foldMq.addEventListener('change', () => {
                    this._handleFormFactorCheck();
                });
            }

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && typeof this._pendingFoldDirection === 'boolean') {
                    const dir = this._pendingFoldDirection;
                    const elapsed = Date.now() - (this._pendingFoldTimestamp || 0);
                    this._pendingFoldDirection = null;
                    if (elapsed < 2500) {
                        if (this._isActive) {
                            this._applySmartFit(true);
                        }
                        this._animateFoldContinuum(dir);
                    }
                }
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

        const outputSection = document.querySelector('.main-content .output-section');
        if (outputSection && !outputSection._hasListSwipeListener) {
            outputSection._hasListSwipeListener = true;
            let listTouchStartX = 0;
            let listTouchStartY = 0;
            let listTouchValid = false;
            let listSwipeAxis = null;
            let listCurrentOx = 0;
            let activeListContainers = [];
            let listReleaseTimer = null;

            const resolveListSwipeContainers = () => Array.from(
                document.querySelectorAll('.stats-container, .output-header, #outputList, #empty-state-card, #statsPagination')
            ).filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });

            const dampListSwipe = (delta, isNavigable) => {
                const abs = Math.abs(delta);
                const maxOvershoot = isNavigable ? 76 : 22;
                const resistance = isNavigable ? 0.54 : 0.22;
                const damped = (abs * resistance) / (1 + (abs * resistance) / maxOvershoot);
                return Math.round(Math.sign(delta) * damped * 10) / 10;
            };

            const releaseListSwipe = () => {
                if (listCurrentOx === 0) return;
                listCurrentOx = 0;
                const containers = activeListContainers.length > 0 ? activeListContainers : resolveListSwipeContainers();
                activeListContainers = [];
                containers.forEach(el => {
                    el.style.removeProperty('--swipe-offset-x');
                    el.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
                    el.style.transform = 'translate3d(0, 0, 0)';
                });
                if (listReleaseTimer) clearTimeout(listReleaseTimer);
                listReleaseTimer = setTimeout(() => {
                    listReleaseTimer = null;
                    containers.forEach(el => {
                        el.style.removeProperty('transform');
                        el.style.removeProperty('transition');
                    });
                }, 290);
            };

            outputSection.addEventListener('touchstart', (e) => {
                if (this._isActive || e.touches.length !== 1 || FocusPanelManager.isOpen?.() || UI.isAnyModalOpen()) {
                    listTouchValid = false;
                    return;
                }
                if (e.target?.closest?.('#statsPagination, input, textarea, select, button, a, .custom-dropdown')) {
                    listTouchValid = false;
                    return;
                }
                const statsEl = e.target?.closest?.('#statsContainer, .stats-container');
                if (statsEl && (statsEl.scrollWidth || 0) > (statsEl.clientWidth || 0) + 4) {
                    listTouchValid = false;
                    return;
                }
                const x = e.touches[0].clientX;
                const viewportW = window.innerWidth || document.documentElement?.clientWidth || 0;
                if (x < 24 || (viewportW > 0 && x > viewportW - 24)) {
                    listTouchValid = false;
                    return;
                }
                if (listReleaseTimer) {
                    clearTimeout(listReleaseTimer);
                    listReleaseTimer = null;
                }
                listTouchStartX = x;
                listTouchStartY = e.touches[0].clientY;
                listTouchValid = true;
                listSwipeAxis = null;
                listCurrentOx = 0;
                activeListContainers = [];
            }, { passive: true });

            outputSection.addEventListener('touchmove', (e) => {
                if (!listTouchValid || this._isActive || e.touches.length !== 1) return;
                const dx = e.touches[0].clientX - listTouchStartX;
                const dy = e.touches[0].clientY - listTouchStartY;

                if (!listSwipeAxis) {
                    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                    if (Math.abs(dx) > Math.abs(dy) * 1.3) {
                        listSwipeAxis = 'x';
                        activeListContainers = resolveListSwipeContainers();
                    } else if (Math.abs(dy) > Math.abs(dx) * 1.15) {
                        listSwipeAxis = 'scroll';
                        listTouchValid = false;
                        return;
                    } else {
                        return;
                    }
                }

                if (listSwipeAxis === 'x') {
                    const ox = dampListSwipe(dx, dx < 0 && this._getCurrentClassStudents().length > 0);
                    listCurrentOx = ox;
                    activeListContainers.forEach(el => {
                        el.style.transition = 'none';
                        el.style.setProperty('--swipe-offset-x', `${ox}px`);
                        el.style.transform = `translate3d(${ox}px, 0, 0)`;
                    });
                }
            }, { passive: true });

            outputSection.addEventListener('touchend', (e) => {
                if (!listTouchValid || this._isActive) {
                    releaseListSwipe();
                    return;
                }
                listTouchValid = false;
                const endTouch = e.changedTouches?.[0];
                if (!endTouch) {
                    releaseListSwipe();
                    return;
                }
                const dx = endTouch.clientX - listTouchStartX;
                const dy = endTouch.clientY - listTouchStartY;
                if (listSwipeAxis !== 'scroll' && dx <= -48 && Math.abs(dx) > Math.abs(dy) * 1.35 && this._getCurrentClassStudents().length > 0) {
                    listCurrentOx = 0;
                    activeListContainers = [];
                    if (this._hasClassCoursePlan() || !this._hasClassActivityPlan()) {
                        this._planMode = 'course';
                    }
                    this.switchToView('plan');
                    return;
                }
                releaseListSwipe();
            }, { passive: true });

            outputSection.addEventListener('touchcancel', () => {
                listTouchValid = false;
                listSwipeAxis = null;
                releaseListSwipe();
            }, { passive: true });
        }

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
                if (FocusPanelManager.isOpen?.() || UI.isAnyModalOpen()) return;

                const activeEl = document.activeElement;

                const isTyping = activeEl && (
                    activeEl.tagName === 'INPUT' ||
                    activeEl.tagName === 'TEXTAREA' ||
                    activeEl.tagName === 'SELECT' ||
                    activeEl.isContentEditable ||
                    activeEl.getAttribute('contenteditable') === 'true'
                );

                const hasNoModifier = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
                const hasCtrlOnly = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
                const isHorizontalArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
                const isVerticalArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown';
                const isArrowKey = isHorizontalArrow || isVerticalArrow;

                if (isArrowKey && (hasNoModifier || hasCtrlOnly) && !isTyping && !e.repeat) {
                    if (this._listViewAnimTimer && !this._isActive && appState.activeView === 'plan') {
                        this.switchToView('plan', { immediate: true });
                    } else if (this._viewExitTimeout && this._isActive && appState.activeView === 'list') {
                        this.switchToView('list', { immediate: true });
                    }
                }

                // En vue Liste (Tableau) : Flèche Droite (avec ou sans Ctrl) -> Plan (Cours), Ctrl + Flèches Haut/Bas -> Classe précédente/suivante
                if (!this._isActive) {
                    if (isArrowKey &&
                        !isTyping &&
                        !ClassUIManager?._isDropdownOpen &&
                        !document.querySelector('.custom-dropdown.open, #actionsDropdown.show, .action-dropdown-menu.open, .global-actions-dropdown-menu.open, #headerGenWrapper.open, #headerMenuDropdown.open')) {
                        if (e.key === 'ArrowRight' && !e.repeat && (hasNoModifier || hasCtrlOnly) && this._getCurrentClassStudents().length > 0) {
                            e.preventDefault();
                            if (activeEl?.closest?.('#viewToggle')) {
                                activeEl.blur?.();
                            }
                            if (this._hasClassCoursePlan() || !this._hasClassActivityPlan()) {
                                this._planMode = 'course';
                            }
                            this.switchToView('plan');
                        } else if (isVerticalArrow && !e.repeat && hasCtrlOnly) {
                            const delta = e.key === 'ArrowDown' ? 1 : -1;
                            if (this._canSwitchAdjacentClass(delta)) {
                                e.preventDefault();
                                this._focusListScrollContainer();
                                this._switchAdjacentClass(delta);
                            }
                        } else if (isVerticalArrow && hasNoModifier && !document.querySelector('#crossClassResults.visible, .appreciation-result')) {
                            const mainContent = document.querySelector('.main-content');
                            if (mainContent && activeEl !== mainContent) {
                                e.preventDefault();
                                this._focusListScrollContainer();
                                mainContent.scrollBy?.({ top: e.key === 'ArrowDown' ? 56 : -56, behavior: 'smooth' });
                            }
                        }
                    }
                    return;
                }

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

                const isInsideModeSwitch = Boolean(activeEl?.closest?.('#scPlanModeSwitch'));
                const canNavigateHorizontal = isHorizontalArrow && (hasCtrlOnly || (hasNoModifier && (isInsideModeSwitch || this._isFitted)));
                const canNavigateVertical = isVerticalArrow && hasCtrlOnly;
                if ((canNavigateHorizontal || canNavigateVertical) && !e.repeat && !isTyping) {
                    const hasBlockingOverlay = Boolean(
                        ClassUIManager?._isDropdownOpen ||
                        this._isSearchOpen() ||
                        this._activeMobileSheet ||
                        this._placementPopoverOpen ||
                        this._configPopoverOpen ||
                        document.querySelector('.custom-dropdown.open, #actionsDropdown.show, #headerGenWrapper.open, #headerMenuDropdown.open')
                    );

                    if (!hasBlockingOverlay) {
                        if (activeEl?.closest?.('#viewToggle, #headerClassChip')) {
                            activeEl.blur?.();
                        }
                        if (e.key === 'ArrowRight') {
                            if (this._planMode === 'course' && this._canSwitchPlanMode('activity')) {
                                e.preventDefault();
                                this.switchPlanMode('activity');
                                if (isInsideModeSwitch && hasNoModifier) {
                                    document.querySelector('#scPlanModeSwitch .sc-mode-tab[data-plan-mode="activity"]')?.focus();
                                }
                            }
                        } else if (e.key === 'ArrowLeft') {
                            if (this._planMode === 'activity' && (!this._isLocked || this._hasClassCoursePlan())) {
                                e.preventDefault();
                                this.switchPlanMode('course');
                                if (isInsideModeSwitch && hasNoModifier) {
                                    document.querySelector('#scPlanModeSwitch .sc-mode-tab[data-plan-mode="course"]')?.focus();
                                }
                            } else {
                                e.preventDefault();
                                if (isInsideModeSwitch) {
                                    activeEl.blur?.();
                                }
                                this.switchToView('list');
                            }
                        } else if (canNavigateVertical) {
                            const delta = e.key === 'ArrowDown' ? 1 : -1;
                            if (this._canSwitchAdjacentClass(delta)) {
                                e.preventDefault();
                                if (isInsideModeSwitch) {
                                    activeEl.blur?.();
                                }
                                this._switchAdjacentClass(delta);
                            }
                        }
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
            document.addEventListener('app-settings-changed', () => this.refreshStudents());
            document.addEventListener('periodChanged', () => this.refreshStudents());
        }
    },

    refreshStudents() {
        if (!this._isActive) {
            if (!FocusPanelManager.isOpen?.() && !UI.isAnyModalOpen() && (!document.activeElement || document.activeElement === document.body)) {
                this._focusListScrollContainer();
            }
            return;
        }
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
                this._cleanupFoldContinuum();
                if (this._staggerCellTimer) {
                    clearTimeout(this._staggerCellTimer);
                    this._staggerCellTimer = null;
                }
                if (this._staggerSidebarTimer) {
                    clearTimeout(this._staggerSidebarTimer);
                    this._staggerSidebarTimer = null;
                }
                viewEl.classList.remove('sc-exiting', 'sc-entering');
                const board = document.getElementById('scClassroomBoard');
                board?.style.removeProperty('transform');
                board?.style.removeProperty('transition');
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

                const activeEl = document.activeElement;
                if (!activeEl || activeEl === document.body || activeEl.closest?.('#viewToggle, #seatingChartView')) {
                    this._focusListScrollContainer();
                }

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
                const isVirtual = this._isVirtualClass(currentClass);
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

        this._cleanupModeCarousel();
        this._cleanupFoldContinuum();
        this._clearSelection();
        this._closeMobileSheet(true);
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

        const isVirtual = this._isVirtualClass(currentClass);
        // En mode consultation par défaut dès qu'au moins un élève est placé (ou classe reconstituée)
        const locked = isVirtual ? true : (this._getPlacedIds().size > 0);
        this._applyLockState(locked, { skipSmartFit: true });
        this._syncPlacementPopover();

        this._render();
        this._applySmartFit(true);
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

    ...SeatingAnimations,
    ...SeatingZoom,
    ...SeatingAutoPlace,
    ...SeatingSearch,
    ...SeatingState,
    ...SeatingRoomLayout,
    ...SeatingRenderer,
    ...SeatingSidebar,
    ...SeatingDragDrop,
    ...SeatingMobileSheet,
    ...SeatingPrintExporter
};
