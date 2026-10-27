/**
 * @fileoverview Seating Chart Events — Écouteurs DOM, raccourcis clavier, recherche et gestes tactiles
 * Extrait de SeatingChartManager.js (Lot 14 — Découpage God Object #3)
 * @module managers/seating/SeatingEvents
 */

import { appState } from '../../state/State.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { UI } from '../UIManager.js';
import { ClassUIManager } from '../ClassUIManager.js';
import { MAX_ACTIVITY_GROUP_SIZE } from './SeatingState.js';

export const SeatingEvents = {
    /**
     * Configure les event listeners du Plan de Classe
     * @param {Object} [manager=this] - Instance SeatingChartManager
     */
    setupEventListeners(manager = this) {
        return SeatingEvents._setupEventListeners.call(manager);
    },

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

            sidebar.addEventListener('dragenter', () => {
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
    }
};
