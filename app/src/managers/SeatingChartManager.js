/**
 * @fileoverview Seating Chart Manager — Plan de Classe (Integrated View Facade)
 * In-place view switching (List ↔ Plan) with premium motion design.
 * Features: D&D, pin, lock, evolution dots, config popover, FocusPanel.
 * @module managers/SeatingChartManager
 */

import { appState } from '../state/State.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { StorageManager } from './StorageManager.js';
import { UI } from './UIManager.js';
import { ClassManager } from './ClassManager.js';
import { CrossClassSearchManager } from './CrossClassSearchManager.js';
import { HistoryManager } from './HistoryManager.js';
import { SeatingEvents } from './seating/SeatingEvents.js';
import { SeatingAnimations } from './seating/SeatingAnimations.js';
import { SeatingZoom } from './seating/SeatingZoom.js';
import { SeatingAutoPlace } from './seating/SeatingAutoPlace.js';
import { SeatingSearch } from './seating/SeatingSearch.js';
import {
    SeatingState,
    DEFAULT_COLS,
    DEFAULT_ROWS
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

    ...SeatingEvents,
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
