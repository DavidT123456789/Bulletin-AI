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
import { EventHandlersManager } from './EventHandlersManager.js';
import { HistoryManager } from './HistoryManager.js';
import { GlobalListeners } from './listeners/GlobalListeners.js';
import { SeatingEvents } from './seating/SeatingEvents.js';
import { SeatingAnimations } from './seating/SeatingAnimations.js';
import { SeatingZoom } from './seating/SeatingZoom.js';
import { SeatingAutoPlace } from './seating/SeatingAutoPlace.js';
import { SeatingSearch } from './seating/SeatingSearch.js';
import { bus, EVENTS } from '../core/EventBus.js';
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
import { SeatingContextMenu } from './seating/SeatingContextMenu.js';
import { SeatingPrintExporter } from './seating/SeatingPrintExporter.js';
import { SeatingRandomPicker } from './seating/SeatingRandomPicker.js';

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
    _statusDotsPopoverOpen: false,
    _activityGroupSize: null,
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
    _modeCarouselBoard: null,
    _modeCarouselEndHandler: null,
    _listExitPrimaryEl: null,
    _listExitEndHandler: null,
    _listEnterPrimaryEl: null,
    _listEnterEndHandler: null,
    _viewEnterEl: null,
    _viewEnterEndHandler: null,
    _viewExitEl: null,
    _viewExitEndHandler: null,
    _foldTransitionTimer: null,
    _wasCompactLayout: null,
    _lastViewportW: 0,
    _lastViewportH: 0,
    _pendingFoldDirection: null,
    _pendingFoldTimestamp: 0,
    _activeMobileSheet: null,
    _activeContextMenu: null,
    _activeSearchTerm: '',
    _searchQueryAtPlanEnter: '',
    _searchMatchIndex: 0,
    _randomPickerState: null,
    _randomHistoryPopoverOpen: false,
    _randomSuspenseTimer: null,
    _randomRevealTimer: null,
    _randomRollAnimTimer: null,
    _isAislePaintMode: false,
    _aislePaintPointerId: null,
    _aislePaintAction: null,
    _aislePaintTouchedKeys: null,
    _aislePaintHasMutated: false,

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    init() {
        this._injectViewToggle();
        this._injectView();
        this._injectHeaderSearch();
        this._setupEventListeners();
    },

    // ========================================================================
    // HTML INJECTION
    // ========================================================================

    _injectHeaderSearch() {
        const existing = document.getElementById('scFloatingSearch');
        if (existing?.querySelector('#scFloatingSearchInput')) return;
        const parent = existing?.parentElement
            || document.querySelector('.header-actions')
            || document.getElementById('scFloatingActions');
        if (!parent) return;

        const searchEl = document.createElement('div');
        searchEl.className = 'sc-floating-search header-search';
        searchEl.id = 'scFloatingSearch';
        searchEl.innerHTML = `
            <button type="button" class="pill-segment sc-search-toggle-btn tooltip" id="scFloatingSearchBtn" aria-label="Rechercher un élève (/)" data-tooltip="Rechercher <kbd class='kbd-hint'>/</kbd>">
                <iconify-icon icon="solar:magnifer-linear"></iconify-icon>
            </button>
            <div class="sc-floating-search-input-box" id="scFloatingSearchBox">
                <button type="button" class="sc-search-close-btn" id="scFloatingSearchClose" aria-label="Fermer la recherche" data-tooltip="Fermer la recherche">
                    <iconify-icon class="sc-search-field-icon" icon="solar:magnifer-linear"></iconify-icon>
                </button>
                <input type="text" id="scFloatingSearchInput" class="custom-input" placeholder="Rechercher un élève..." autocomplete="off" spellcheck="false" aria-label="Rechercher un élève">
                <span class="sc-floating-search-count" id="scFloatingSearchCount" style="display: none;"></span>
                <button class="sc-floating-search-clear" id="scFloatingSearchClear" aria-label="Effacer la recherche" type="button">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="sc-floating-search-suggestions" id="scFloatingSearchSuggestions" style="display: none;"></div>
        `;

        if (existing) {
            existing.replaceWith(searchEl);
        } else {
            const genWrapper = parent.querySelector('#headerGenWrapper');
            if (genWrapper) {
                parent.insertBefore(searchEl, genWrapper);
            } else {
                parent.insertBefore(searchEl, parent.firstChild);
            }
        }
    },

    _injectViewToggle() {
        if (document.getElementById('viewToggle')) return;

        const target = document.querySelector('.header-center') || document.querySelector('.header-actions');
        if (!target) return;

        const toggle = document.createElement('div');
        toggle.className = 'ui-segmented-control header-style view-toggle';
        toggle.id = 'viewToggle';
        const activeView = appState.activeView || 'list';
        toggle.innerHTML = `
            <button type="button" class="ui-segment view-toggle-btn ${activeView === 'list' ? 'active' : ''}" data-view="list" aria-label="Vue liste">
                <iconify-icon icon="solar:list-linear"></iconify-icon>
                <span>Liste</span>
            </button>
            <button type="button" class="ui-segment view-toggle-btn ${activeView === 'plan' ? 'active' : ''}" data-view="plan" aria-label="Vue plan de classe">
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
        if (this._activeSearchTerm) {
            this._activeSearchTerm = '';
            appState.searchQuery = '';
        }

        const mainContent = document.querySelector('.main-content .output-section');
        if (!mainContent) return;

        const planMode = this._planMode || 'course';
        const isActivity = planMode === 'activity';
        const view = document.createElement('div');
        view.id = 'seatingChartView';
        view.dataset.planMode = planMode;
        view.style.display = 'none';
        view.innerHTML = `
            <div class="sc-body">
                <div class="sc-sidebar" id="scSidebar">
                    <div class="sc-sidebar-toolbar" id="scSidebarToolbar">
                        <div class="sc-sidebar-toolbar-header">
                            <span class="sc-toolbar-label">Mode Édition</span>
                            <button type="button" class="sc-validate-btn" id="scLockBtn" aria-label="Valider et figer le plan">
                                <iconify-icon icon="ph:check-bold" aria-hidden="true"></iconify-icon>
                                <span class="sc-validate-btn-label">Valider</span>
                            </button>
                        </div>
                        <div class="sc-sidebar-actions">
                            <div class="sc-edit-only sc-sidebar-actions-group">
                                <div class="sc-placement-wrapper">
                                    <button type="button" class="sc-action-btn sc-auto-place-btn" id="scAutoPlaceBtn" aria-label="Placer les élèves" data-tooltip="Placer les élèves">
                                        <iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>
                                    </button>
                                    <div class="sc-placement-popover" id="scPlacementPopover">
                                        ${this._getPlacementPopoverHTML()}
                                    </div>
                                </div>
                                <button type="button" class="sc-action-btn sc-undo-btn disabled" id="scUndoBtn" aria-label="Annuler" data-tooltip="Annuler <kbd class='kbd-hint'>Ctrl+Z</kbd>" aria-disabled="true">
                                    <iconify-icon icon="solar:undo-left-round-linear"></iconify-icon>
                                </button>
                                <button type="button" class="sc-action-btn sc-redo-btn disabled" id="scRedoBtn" aria-label="Rétablir" data-tooltip="Rétablir <kbd class='kbd-hint'>Ctrl+Y</kbd>" aria-disabled="true">
                                    <iconify-icon icon="solar:undo-right-round-linear"></iconify-icon>
                                </button>
                                <div class="sc-config-wrapper">
                                    <button type="button" class="sc-action-btn sc-config-trigger" id="scConfigBtn" aria-label="Agencement de la salle" data-tooltip="Agencement de la salle">
                                        <iconify-icon icon="solar:settings-linear"></iconify-icon>
                                    </button>
                                    <div class="sc-config-popover" id="scConfigPopover">
                                        <div class="sc-config-presets-section" id="scConfigPresetsSection">
                                            <div class="sc-config-section-header">
                                                <div class="sc-config-section-title">Disposition</div>
                                                <span class="sc-config-section-meta" aria-hidden="true">·</span>
                                                <span class="sc-config-section-meta">Commune aux classes</span>
                                            </div>
                                            <div class="sc-config-preset-pills" role="group" aria-label="Modèles de salle">
                                                <button type="button" class="sc-config-preset-pill" data-preset="compact" data-tooltip="Grille continue sans allée">
                                                    <span class="sc-mini-diagram is-compact" aria-hidden="true">
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                                                    </span>
                                                    <span class="sc-config-preset-title">Sans allée</span>
                                                    <span class="sc-config-preset-sub">6 col. continues</span>
                                                </button>
                                                <button type="button" class="sc-config-preset-pill" data-preset="center-aisle" data-tooltip="2 rangées de 3 tables (1 allée centrale)">
                                                    <span class="sc-mini-diagram is-center-aisle" aria-hidden="true">
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><b class="aisle"></b><i></i><i></i><i></i></span>
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><b class="aisle"></b><i></i><i></i><i></i></span>
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><b class="aisle"></b><i></i><i></i><i></i></span>
                                                    </span>
                                                    <span class="sc-config-preset-title">1 allée</span>
                                                    <span class="sc-config-preset-sub">2 rangées de 3</span>
                                                </button>
                                                <button type="button" class="sc-config-preset-pill" data-preset="double-aisles" data-tooltip="3 rangées doubles (2 allées)">
                                                    <span class="sc-mini-diagram is-double-aisles" aria-hidden="true">
                                                        <span class="sc-mini-row"><i></i><i></i><b class="aisle"></b><i></i><i></i><b class="aisle"></b><i></i><i></i></span>
                                                        <span class="sc-mini-row"><i></i><i></i><b class="aisle"></b><i></i><i></i><b class="aisle"></b><i></i><i></i></span>
                                                        <span class="sc-mini-row"><i></i><i></i><b class="aisle"></b><i></i><i></i><b class="aisle"></b><i></i><i></i></span>
                                                    </span>
                                                    <span class="sc-config-preset-title">2 allées</span>
                                                    <span class="sc-config-preset-sub">3 rangées doubles</span>
                                                </button>
                                                <button type="button" class="sc-config-preset-pill" data-preset="u-shape" data-tooltip="Disposition en U (fond + côtés face au centre)">
                                                    <span class="sc-mini-diagram is-u-shape" aria-hidden="true">
                                                        <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                                                        <span class="sc-mini-row"><i></i><b class="aisle-wide"></b><i></i></span>
                                                        <span class="sc-mini-row"><i></i><b class="aisle-wide"></b><i></i></span>
                                                    </span>
                                                    <span class="sc-config-preset-title">En U</span>
                                                    <span class="sc-config-preset-sub">Fond + côtés</span>
                                                </button>
                                            </div>
                                            <button type="button" class="sc-paint-aisles-trigger" id="scPaintAislesBtn">
                                                <iconify-icon icon="solar:ghost-linear" aria-hidden="true"></iconify-icon>
                                                <span>Tracer des allées sur mesure</span>
                                            </button>
                                        </div>
                                        <div class="sc-config-row">
                                            <label class="sc-config-label" for="scColsSlider">Colonnes</label>
                                            <button type="button" class="sc-config-step-btn" data-dim="cols" data-delta="-1" aria-label="Moins de colonnes">
                                                <iconify-icon icon="ph:minus-bold"></iconify-icon>
                                            </button>
                                            <input type="range" class="control-slider" id="scColsSlider" min="2" max="10" value="${DEFAULT_COLS}">
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
                                            <input type="range" class="control-slider" id="scRowsSlider" min="2" max="10" value="${DEFAULT_ROWS}">
                                            <button type="button" class="sc-config-step-btn" data-dim="rows" data-delta="1" aria-label="Plus de rangées">
                                                <iconify-icon icon="ph:plus-bold"></iconify-icon>
                                            </button>
                                            <span class="sc-config-value" id="scRowsValue">${DEFAULT_ROWS}</span>
                                        </div>
                                        <div class="sc-config-capacity" id="scConfigCapacity"></div>
                                    </div>
                                </div>
                                <button type="button" class="sc-action-btn sc-reset-btn" id="scClearBtn" aria-label="Réinitialiser" data-tooltip="Réinitialiser">
                                    <iconify-icon icon="solar:restart-linear"></iconify-icon>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="sc-sidebar-header">
                        <div class="sc-sidebar-title" id="scSidebarTitle"><span>Élèves non placés</span></div>
                        <button type="button" class="sc-quick-group-btn" id="scQuickGroupBtn" style="display: none;"></button>
                        <span id="scFooterInfo" style="display: none;" aria-hidden="true"></span>
                    </div>
                    <div class="sc-student-list" id="scStudentList"></div>
                </div>
                <div class="sc-grid-area" id="scGridArea">
                    <!-- Top-Left Bar: Plan Mode Switcher (Cours | Activité) + Status Pill (Desktop) -->
                    <div class="sc-top-left-bar" id="scTopLeftBar">
                        <div class="ui-segmented-control css-driven sc-plan-mode-switch" id="scPlanModeSwitch" data-active-index="${isActivity ? '1' : '0'}" role="tablist" aria-label="Mode du plan de classe">
                            <div class="ui-glider" aria-hidden="true"></div>
                            <button class="ui-segment sc-mode-tab${isActivity ? '' : ' active'}" data-plan-mode="course" role="tab" aria-selected="${isActivity ? 'false' : 'true'}" aria-label="Mode Cours"${isActivity ? ' data-tooltip="Passer en mode Cours"' : ''} type="button">
                                <iconify-icon icon="solar:chair-linear"></iconify-icon>
                                <span class="sc-mode-label">Cours</span>
                            </button>
                            <button class="ui-segment sc-mode-tab${isActivity ? ' active' : ''}" data-plan-mode="activity" role="tab" aria-selected="${isActivity ? 'true' : 'false'}" aria-label="Mode Activité"${isActivity ? '' : ' data-tooltip="Passer en mode Activité"'} type="button">
                                <iconify-icon icon="solar:users-group-two-rounded-linear"></iconify-icon>
                                <span class="sc-mode-label">Activité</span>
                            </button>
                        </div>
                        <div class="sc-status-pill" id="scStatusPill" role="button" tabindex="0"></div>
                    </div>

                    <div class="sc-aisle-paint-banner" id="scAislePaintBanner" role="status" aria-live="polite" hidden>
                        <iconify-icon icon="solar:ghost-linear" class="sc-aisle-paint-icon" aria-hidden="true"></iconify-icon>
                        <span class="sc-aisle-paint-text">Glissez sur les tables vides pour tracer des allées</span>
                        <button type="button" class="sc-aisle-paint-done-btn" id="scAislePaintDoneBtn">Terminer</button>
                    </div>

                    <div class="sc-classroom-board" id="scClassroomBoard" data-plan-mode="${planMode}" data-locked="${this._isLocked ? 'true' : 'false'}">
                        <div class="sc-grid-container" id="scGridContainer"></div>
                        <div class="sc-desk-row">
                            <div class="sc-desk" id="scDesk" role="button" tabindex="0" aria-label="Vue Prof active (cliquer pour inverser la vue)" data-tooltip="Vue Prof active<br><span class='kbd-hint'>Cliquer pour inverser</span>"><iconify-icon class="sc-desk-cap" icon="solar:square-academic-cap-linear"></iconify-icon><span>Tableau</span></div>
                        </div>
                    </div>
                </div>

                <!-- Floating Actions Capsule (Top-Right) -->
                <div class="sc-floating-actions ui-floating-capsule" id="scFloatingActions">
                    <button type="button" class="sc-random-readout is-static" id="scRandomReadout" aria-live="polite" aria-hidden="true" aria-haspopup="listbox" aria-expanded="false" aria-disabled="true" tabindex="-1">
                        <span class="sc-random-student-name" id="scRandomStudentName"></span>
                        <span class="sc-random-sep" aria-hidden="true">·</span>
                        <span class="sc-random-counter" id="scRandomCounter"></span>
                        <iconify-icon class="sc-random-chevron" icon="solar:alt-arrow-down-linear" aria-hidden="true"></iconify-icon>
                    </button>
                    <button type="button" class="sc-action-btn ui-floating-capsule-btn sc-zoom-btn" id="scFloatingZoomBtn" aria-label="Ajuster la vue" data-tooltip="Ajuster la vue">
                        <iconify-icon icon="solar:magnifer-zoom-in-linear"></iconify-icon>
                    </button>
                    <button type="button" class="sc-action-btn ui-floating-capsule-btn sc-dots-btn" id="scFloatingDotsBtn" aria-label="Pastilles de statut" data-tooltip="Pastilles de statut" aria-haspopup="dialog" aria-expanded="false" aria-controls="scStatusDotsPopover">
                        <iconify-icon icon="solar:layers-minimalistic-linear"></iconify-icon>
                    </button>
                    <button type="button" class="sc-action-btn ui-floating-capsule-btn sc-orientation-btn" id="scFloatingOrientationBtn" aria-label="Vue Prof active (cliquer pour inverser la vue)" data-tooltip="Vue Prof active<br><span class='kbd-hint'>Cliquer pour inverser</span>">
                        <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                    </button>
                    <button type="button" class="sc-action-btn ui-floating-capsule-btn sc-print-btn" id="scFloatingPrintBtn" aria-label="Imprimer le plan" data-tooltip="Imprimer le plan">
                        <iconify-icon icon="solar:printer-linear"></iconify-icon>
                    </button>
                    <button type="button" class="sc-action-btn ui-floating-capsule-btn sc-random-btn" id="scFloatingRandomBtn" aria-label="Tirer un élève au sort" data-tooltip="Tirer un élève au sort">
                        <iconify-icon icon="solar:dice-linear"></iconify-icon>
                    </button>
                    <button type="button" class="sc-action-btn ui-floating-capsule-btn sc-random-close-btn" id="scFloatingRandomCloseBtn" aria-label="Fermer le tirage au sort" data-tooltip="Fermer <kbd class='kbd-hint'>Échap</kbd>">
                        <iconify-icon icon="ph:x"></iconify-icon>
                    </button>
                </div>
                <div class="sc-random-history-popover" id="scRandomHistoryPopover" role="dialog" aria-label="Élèves tirés au sort" aria-hidden="true"></div>
                <div class="sc-status-dots-popover" id="scStatusDotsPopover" role="dialog" aria-label="Calques d'affichage" aria-hidden="true">
                    <div class="sc-config-section-title">Calques d'affichage</div>
                    <div class="seating-dots-selector" id="seatingStatusDotsSelector" role="group" aria-label="Calques sur le plan">
                        <label class="seating-dot-option" data-tooltip="Nouveau (bleu) · Départ (ambre)">
                            <input type="checkbox" data-dot-category="movements" checked>
                            <span class="seating-dot-preview seating-dot-preview--movements" aria-hidden="true"></span>
                            <span class="seating-dot-label">Parcours <small>Nouveau, Départ</small></span>
                            <iconify-icon icon="ph:check-bold" class="seating-dot-check" aria-hidden="true"></iconify-icon>
                        </label>
                        <label class="seating-dot-option" data-tooltip="ULIS, AESH (violet)<br>PAP, PPRE, PAI (rose)">
                            <input type="checkbox" data-dot-category="devices">
                            <span class="seating-dot-preview seating-dot-preview--devices" aria-hidden="true"></span>
                            <span class="seating-dot-label">Accompagnement <small>ULIS, PAP, PPRE</small></span>
                            <iconify-icon icon="ph:check-bold" class="seating-dot-check" aria-hidden="true"></iconify-icon>
                        </label>
                        <label class="seating-dot-option" data-tooltip="Délégué de classe (vert)">
                            <input type="checkbox" data-dot-category="delegates">
                            <span class="seating-dot-preview seating-dot-preview--delegates" aria-hidden="true"></span>
                            <span class="seating-dot-label">Rôle <small>Délégué</small></span>
                            <iconify-icon icon="ph:check-bold" class="seating-dot-check" aria-hidden="true"></iconify-icon>
                        </label>
                        <div class="seating-dots-divider" aria-hidden="true"></div>
                        <label class="seating-dot-option" data-tooltip="Nombre d'observations du journal sur la période">
                            <input type="checkbox" data-dot-category="journal">
                            <span class="seating-dot-preview seating-dot-preview--journal" aria-hidden="true"></span>
                            <span class="seating-dot-label">Journal <small>Observations période</small></span>
                            <iconify-icon icon="ph:check-bold" class="seating-dot-check" aria-hidden="true"></iconify-icon>
                        </label>
                    </div>
                </div>
            </div>
        `;

        mainContent.appendChild(view);
    },

    refreshStudents() {
        if (!this._isActive) {
            if (this._isSearchOpen()) {
                const activeQuery = (appState.searchQuery || this._activeSearchTerm || '').trim();
                if (activeQuery) {
                    this._updateSearchCountAndSuggestions(activeQuery);
                }
            }
            if (!FocusPanelManager.isOpen?.() && !UI.isAnyModalOpen() && (!document.activeElement || document.activeElement === document.body)) {
                this._focusListScrollContainer();
            }
            return;
        }
        this._closeContextMenu?.();
        this._students = this._getCurrentClassStudents();
        if (this._students.length === 0) {
            this.updateToggleVisibility(false);
            this._closeMobileSheet?.(true);
            this.switchToView('list', { silent: true, immediate: true });
            return;
        }
        this._studentMap = new Map(this._students.map(s => [s.id, s]));
        if (Array.isArray(this._gridState)) {
            for (let r = 0; r < this._gridState.length; r++) {
                const row = this._gridState[r];
                if (!Array.isArray(row)) continue;
                for (let c = 0; c < row.length; c++) {
                    const val = row[c];
                    if (Array.isArray(val)) {
                        const filtered = val.filter(id => id && this._studentMap.has(id));
                        row[c] = filtered.length === 0 ? null : (filtered.length === 1 ? filtered[0] : filtered);
                    } else if (val && !this._studentMap.has(val)) {
                        row[c] = null;
                    }
                }
            }
        }
        const prevSelectedLen = this._selectedChipIds.length;
        if (prevSelectedLen > 0) {
            this._selectedChipIds = this._selectedChipIds.filter(id => {
                const st = this._studentMap.get(id);
                return st && !this._isStudentDeparted(st);
            });
            if (this._selectedChipIds.length === 0) {
                this._lastSelectedGridPos = null;
                this._lastSelectedSidebarIndex = null;
            }
        }
        const selectionChanged = this._selectedChipIds.length !== prevSelectedLen;
        if (!this._isVirtualClass() && this._isLocked && this._getPlacedIds().size === 0) {
            const currentClass = this._getCurrentClass();
            const lockKey = this._getActiveClassLockKey();
            if (currentClass) {
                currentClass[lockKey] = false;
                StorageManager?.saveAppState?.();
            }
            this._applyLockState(false, { skipSmartFit: true });
        }
        this._render();
        if (selectionChanged) {
            this._updateSelectionAttribute();
        }
        bus.emit(EVENTS.SEATING_STATUS_CHANGED, {
            classId: appState.currentClassId,
            locked: this._isLocked,
            planMode: this._planMode
        });
    },

    // ========================================================================
    // VIEW SWITCHING — with entrance/exit animations
    // ========================================================================

    switchToView(view, options = {}) {
        const { silent = false, immediate = false } = typeof options === 'boolean' ? { silent: options } : options;
        const wrapper = document.querySelector('.main-content-wrapper');
        const viewEl = document.getElementById('seatingChartView');
        if (!wrapper || !viewEl) return;

        const isList = view === 'list';

        if (!immediate && !this._viewExitTimeout) {
            if (isList && !this._isActive && wrapper.dataset.view === 'list') return;
            if (!isList && this._isActive && wrapper.dataset.view === 'plan') return;
        }

        this._clearViewTransitionTimers();
        this._clearListViewTransitionClasses({ preserveSwipeOffset: !isList && !immediate });

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
            this._exitAislePaintMode?.();
            // [UX Mobile] History state cleanup for plan view and sub-modes
            if (HistoryManager.isOpen('viewPlan')) HistoryManager.handleManualClose('viewPlan');
            if (HistoryManager.isOpen('seatingChartEdit')) HistoryManager.handleManualClose('seatingChartEdit');
            if (HistoryManager.isOpen('scSelection')) HistoryManager.handleManualClose('scSelection');
            if (HistoryManager.isOpen('scMobileSheet')) HistoryManager.handleManualClose('scMobileSheet');
            if (HistoryManager.isOpen('scContextMenu')) HistoryManager.handleManualClose('scContextMenu');
            if (HistoryManager.isOpen('scConfigPopover')) HistoryManager.handleManualClose('scConfigPopover');
            if (HistoryManager.isOpen('scPlacementPopover')) HistoryManager.handleManualClose('scPlacementPopover');
            if (HistoryManager.isOpen('scRandomHistoryPopover')) HistoryManager.handleManualClose('scRandomHistoryPopover');
            if (HistoryManager.isOpen('scStatusDotsPopover')) HistoryManager.handleManualClose('scStatusDotsPopover');
            if (HistoryManager.isOpen('scRandomPicker')) HistoryManager.handleManualClose('scRandomPicker');

            const finishList = (animateEnter = false) => {
                const wasActive = this._isActive;
                this._closeRandomPicker?.({ fromHistory: true });
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
                GlobalListeners?.updateMainScrollAffordances?.();
                this._isActive = false;
                this._clearSelection();
                const activeQuery = (appState.searchQuery || this._activeSearchTerm || '').trim();
                const queryChangedInPlan = wasActive && activeQuery !== this._searchQueryAtPlanEnter;
                if (activeQuery) {
                    appState.searchQuery = activeQuery;
                    this._activeSearchTerm = activeQuery;
                    viewEl.classList.remove('sc-search-active');
                    this._updateSearchCountAndSuggestions(activeQuery);
                    if (queryChangedInPlan) {
                        EventHandlersManager?.handleSearchInput?.();
                    }
                } else {
                    this._closeSearch();
                    if (queryChangedInPlan) {
                        EventHandlersManager?.handleSearchInput?.();
                    }
                }
                if (wasActive) {
                    this._restoreUnmodifiedClassLock();
                    this._savePositionsToState(true);
                    this._saveGridConfig();
                }
                this._closeContextMenu?.();
                this._closeConfigPopover();
                this._closePlacementPopover();
                this._closeStatusDotsPopover();

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
                const preservedQuery = (appState.searchQuery || document.getElementById('scFloatingSearchInput')?.value || '').trim();
                this._searchQueryAtPlanEnter = preservedQuery;
                this._activeSearchTerm = preservedQuery;
                CrossClassSearchManager?.reset?.(true);
                if (preservedQuery) {
                    appState.searchQuery = preservedQuery;
                    const searchWrap = document.getElementById('scFloatingSearch');
                    const searchInput = document.getElementById('scFloatingSearchInput');
                    if (searchWrap) searchWrap.classList.add('open', 'has-value');
                    if (searchInput && searchInput.value !== preservedQuery) {
                        searchInput.value = preservedQuery;
                    }
                    document.getElementById('scFloatingSearchClear')?.classList.add('visible');
                } else if (this._isSearchOpen()) {
                    this._closeSearch();
                }
                // [UX Mobile] History integration for plan view (Back returns to list)
                if (!HistoryManager.isOpen('viewPlan')) {
                    HistoryManager.pushState('viewPlan', () => {
                        this.switchToView('list');
                    });
                }
                viewEl.style.display = '';
                GlobalListeners?.updateMainScrollAffordances?.();
                this._exitAislePaintMode?.();
                document.querySelector('.sc-onboarding-hint')?.remove();
                if (this._planMode === 'activity' && !this._hasClassActivityPlan()) {
                    this._planMode = 'course';
                } else if (this._planMode === 'course' && !this._hasClassCoursePlan() && this._hasClassActivityPlan()) {
                    this._planMode = 'activity';
                }
                this._isActive = true;
                this._loadGridConfig({ skipRender: true });
                this._loadPositionsFromState();
                const currentClass = this._getCurrentClass();
                const isVirtual = this._isVirtualClass(currentClass);
                const locked = isVirtual ? true : (this._getPlacedIds().size > 0);
                this._applyLockState(locked, { skipSmartFit: true, skipDraggabilityUpdate: true });
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
        this._isActive = false;
        this._hasChangesSinceUnlock = false;
        this._wasLockedBeforeEdit = false;

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
        this._exitAislePaintMode?.();
        this._closeContextMenu?.();
        this._closeMobileSheet(true);
        this._closeRandomPicker?.();
        this._closeSearch();
        this._closeConfigPopover();
        this._closePlacementPopover();
        this._closeStatusDotsPopover();

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

        this._activityGroupSize = null;
        document.querySelector('.sc-onboarding-hint')?.remove();
        this._prevPlacedCount = 0;
        this._students = this._getCurrentClassStudents();
        this._loadGridConfig({ skipRender: true });
        this._loadPositionsFromState();

        const isVirtual = this._isVirtualClass(currentClass);
        // En mode consultation par défaut dès qu'au moins un élève est placé (ou classe reconstituée)
        const locked = isVirtual ? true : (this._getPlacedIds().size > 0);
        this._applyLockState(locked, { skipSmartFit: true, skipDraggabilityUpdate: true });
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
    ...SeatingContextMenu,
    ...SeatingPrintExporter,
    ...SeatingRandomPicker
};
