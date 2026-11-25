/**
 * @fileoverview Seating Chart Animations — View transitions, mode carousel, stagger & flight animations
 * Extracted from SeatingChartManager for modularity (facade pattern via object spread).
 * @module managers/seating/SeatingAnimations
 */

export const SeatingAnimations = {
    _prefersReducedMotion() {
        return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    },

    _getVisibleListContainers() {
        return Array.from(
            document.querySelectorAll('.stats-container, #outputList, #empty-state-card, #statsPagination')
        ).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
    },

    _clearNavigationBoundaryBounce() {
        if (this._navBounceTimer) {
            clearTimeout(this._navBounceTimer);
            this._navBounceTimer = null;
        }
        if (this._navBouncePrimaryEl && this._navBounceEndHandler) {
            this._navBouncePrimaryEl.removeEventListener('animationend', this._navBounceEndHandler);
        }
        this._navBouncePrimaryEl = null;
        this._navBounceEndHandler = null;
        document.querySelectorAll('.nav-boundary-bounce').forEach(el => {
            el.classList.remove('nav-boundary-bounce');
            el.style.removeProperty('--nav-bounce-x');
            el.style.removeProperty('--nav-bounce-y');
        });
    },

    _hasActiveClassSwitchAnimation(el) {
        return Boolean(el && (
            el.classList.contains('class-switch-out-down') ||
            el.classList.contains('class-switch-in-down') ||
            el.classList.contains('class-switch-out-up') ||
            el.classList.contains('class-switch-in-up')
        ));
    },

    /**
     * Play a subtle directional boundary bounce when keyboard navigation reaches a dead end.
     * @param {'left'|'right'|'up'|'down'} direction - Attempted navigation direction
     */
    _animateNavigationBoundaryBounce(direction) {
        const vectors = {
            left: { x: 10, y: 0 },
            right: { x: -10, y: 0 },
            up: { x: 0, y: 8 },
            down: { x: 0, y: -8 }
        };
        const vector = vectors[direction];
        if (!vector || this._prefersReducedMotion()) return;

        const isVertical = direction === 'up' || direction === 'down';
        const headerClassName = isVertical ? document.getElementById('headerClassName') : null;
        const targets = [];

        if (this._isActive) {
            const viewEl = document.getElementById('seatingChartView');
            const board = document.getElementById('scClassroomBoard');
            if (!board ||
                this._zoomAnimCleanup ||
                board.style.transform ||
                this._hasActiveClassSwitchAnimation(viewEl) ||
                viewEl?.classList.contains('sc-entering') ||
                viewEl?.classList.contains('sc-exiting') ||
                board.classList.contains('sc-mode-carousel-in-right') ||
                board.classList.contains('sc-mode-carousel-in-left') ||
                board.classList.contains('sc-orienting')) {
                return;
            }
            targets.push({ el: board, x: vector.x, y: vector.y });
        } else {
            const containers = this._getVisibleListContainers();
            const hasActiveTransition = containers.some(el =>
                el.classList.contains('view-slide-out-left') ||
                el.classList.contains('view-slide-in-left') ||
                this._hasActiveClassSwitchAnimation(el)
            );
            if (containers.length === 0 || hasActiveTransition) return;
            containers.forEach(el => targets.push({ el, x: vector.x, y: vector.y }));
        }

        if (headerClassName &&
            !headerClassName.classList.contains('header-class-out-down') &&
            !headerClassName.classList.contains('header-class-in-down') &&
            !headerClassName.classList.contains('header-class-out-up') &&
            !headerClassName.classList.contains('header-class-in-up')) {
            targets.push({ el: headerClassName, x: 0, y: Math.round(vector.y * 0.6) });
        }

        const wasAlreadyBouncing = targets.some(({ el }) => el.classList.contains('nav-boundary-bounce'));
        this._clearNavigationBoundaryBounce();
        if (wasAlreadyBouncing) {
            void targets[0]?.el.offsetWidth;
        }

        targets.forEach(({ el, x, y }) => {
            el.style.setProperty('--nav-bounce-x', `${x}px`);
            el.style.setProperty('--nav-bounce-y', `${y}px`);
            el.classList.add('nav-boundary-bounce');
        });

        const primaryEl = targets[0]?.el || null;
        if (!primaryEl) return;

        const onAnimEnd = (e) => {
            if (e && e.target !== primaryEl) return;
            this._clearNavigationBoundaryBounce();
        };
        this._navBouncePrimaryEl = primaryEl;
        this._navBounceEndHandler = onAnimEnd;
        primaryEl.addEventListener('animationend', onAnimEnd);
        this._navBounceTimer = setTimeout(() => {
            this._clearNavigationBoundaryBounce();
        }, 260);
    },

    _clearListViewTransitionClasses({ preserveSwipeOffset = false } = {}) {
        this._clearNavigationBoundaryBounce();
        if (this._listEnterCleanupTimer) {
            clearTimeout(this._listEnterCleanupTimer);
            this._listEnterCleanupTimer = null;
        }
        if (this._listEnterPrimaryEl && this._listEnterEndHandler) {
            this._listEnterPrimaryEl.removeEventListener('animationend', this._listEnterEndHandler);
        }
        this._listEnterPrimaryEl = null;
        this._listEnterEndHandler = null;
        if (this._listStaggerCleanupTimer) {
            clearTimeout(this._listStaggerCleanupTimer);
            this._listStaggerCleanupTimer = null;
        }
        if (this._listExitPrimaryEl && this._listExitEndHandler) {
            this._listExitPrimaryEl.removeEventListener('animationend', this._listExitEndHandler);
        }
        this._listExitPrimaryEl = null;
        this._listExitEndHandler = null;
        document.querySelectorAll('.stats-container, #outputList, #empty-state-card, #statsPagination').forEach(el => {
            el.classList.remove('view-slide-out-left', 'view-slide-in-left');
            if (!preserveSwipeOffset) {
                el.style.removeProperty('--swipe-offset-x');
                el.style.removeProperty('transform');
                el.style.removeProperty('transition');
            }
        });
        document.querySelectorAll('#outputList .student-list-view.table-fade-in').forEach(view => {
            view.classList.remove('table-fade-in');
        });
        document.querySelectorAll('.stat-card.stat-card-stagger, .empty-state-hub-card.stat-card-stagger').forEach(card => {
            card.classList.remove('stat-card-stagger');
            card.style.removeProperty('--card-i');
        });
        document.querySelectorAll('#outputList .student-row.row-stagger-enter').forEach(row => {
            row.classList.remove('row-stagger-enter');
            row.style.removeProperty('--row-i');
        });
    },

    /** List view exit — horizontal micro-slide to left before Plan enters from right */
    _animateListViewExit(onComplete) {
        const containers = this._getVisibleListContainers();

        if (containers.length === 0 || this._prefersReducedMotion()) {
            onComplete();
            return;
        }

        let needsReflow = false;
        containers.forEach(el => {
            if (el.classList.contains('view-slide-in-left') || el.classList.contains('view-slide-out-left')) {
                needsReflow = true;
            }
            el.classList.remove('view-slide-in-left', 'view-slide-out-left');
        });
        if (needsReflow) {
            void containers[0]?.offsetWidth;
        }
        containers.forEach(el => {
            el.classList.add('view-slide-out-left');
            el.style.removeProperty('transform');
            el.style.removeProperty('transition');
        });

        const primaryEl = containers[0];
        let called = false;
        const done = (e) => {
            if (e && e.target !== primaryEl) return;
            if (called) return;
            called = true;
            if (this._viewExitTimeout) {
                clearTimeout(this._viewExitTimeout);
                this._viewExitTimeout = null;
            }
            if (primaryEl && this._listExitEndHandler) {
                primaryEl.removeEventListener('animationend', this._listExitEndHandler);
            }
            this._listExitPrimaryEl = null;
            this._listExitEndHandler = null;
            containers.forEach(el => {
                el.classList.remove('view-slide-out-left');
                el.style.removeProperty('--swipe-offset-x');
            });
            onComplete();
        };
        this._listExitPrimaryEl = primaryEl;
        this._listExitEndHandler = done;
        primaryEl?.addEventListener('animationend', done);
        this._viewExitTimeout = setTimeout(() => done(), 95);
    },

    /** List view entrance — horizontal micro-slide from left + progressive card/row reveal after Plan exits to right */
    _animateListViewEnter() {
        if (this._prefersReducedMotion()) return;

        const containers = this._getVisibleListContainers();
        if (containers.length === 0) return;

        let needsReflow = false;
        containers.forEach(el => {
            if (el.classList.contains('view-slide-out-left') || el.classList.contains('view-slide-in-left')) {
                needsReflow = true;
            }
            el.classList.remove('view-slide-out-left', 'view-slide-in-left');
        });
        if (needsReflow) {
            void containers[0]?.offsetWidth;
        }
        containers.forEach(el => el.classList.add('view-slide-in-left'));

        this._staggerListViewEntrance();

        if (this._listEnterCleanupTimer) {
            clearTimeout(this._listEnterCleanupTimer);
            this._listEnterCleanupTimer = null;
        }
        if (this._listEnterPrimaryEl && this._listEnterEndHandler) {
            this._listEnterPrimaryEl.removeEventListener('animationend', this._listEnterEndHandler);
        }
        this._listEnterPrimaryEl = null;
        this._listEnterEndHandler = null;

        const primaryEl = containers[0];
        const cleanup = (e) => {
            if (e && e.target !== primaryEl) return;
            if (this._listEnterCleanupTimer) {
                clearTimeout(this._listEnterCleanupTimer);
                this._listEnterCleanupTimer = null;
            }
            if (primaryEl && this._listEnterEndHandler === cleanup) {
                primaryEl.removeEventListener('animationend', cleanup);
                this._listEnterPrimaryEl = null;
                this._listEnterEndHandler = null;
            } else {
                primaryEl?.removeEventListener('animationend', cleanup);
            }
            containers.forEach(el => el.classList.remove('view-slide-in-left'));
        };
        this._listEnterPrimaryEl = primaryEl;
        this._listEnterEndHandler = cleanup;
        primaryEl?.addEventListener('animationend', cleanup);
        this._listEnterCleanupTimer = setTimeout(() => cleanup(), 260);
    },

    /** Stagger stat cards and student rows entrance when returning to List view (Plan -> Liste) */
    _staggerListViewEntrance() {
        if (this._listStaggerCleanupTimer) {
            clearTimeout(this._listStaggerCleanupTimer);
            this._listStaggerCleanupTimer = null;
        }

        document.querySelectorAll('#outputList .student-list-view.table-fade-in').forEach(view => {
            view.classList.remove('table-fade-in');
        });

        if (this._prefersReducedMotion()) return;

        const cards = document.querySelectorAll('.stats-container .stat-card, #empty-state-card .empty-state-hub-card');
        const rows = document.querySelectorAll('#outputList .student-list-table tbody tr.student-row');
        if (cards.length === 0 && rows.length === 0) return;

        const maxStaggerRows = 18;
        let needsCardReflow = false;
        let needsRowReflow = false;
        cards.forEach((card, i) => {
            if (card.classList.contains('stat-card-stagger')) needsCardReflow = true;
            card.classList.remove('stat-card-stagger', 'stat-card-animate-in');
            card.style.setProperty('--card-i', i);
        });
        rows.forEach((row, i) => {
            if (row.classList.contains('row-stagger-enter')) needsRowReflow = true;
            row.classList.remove(
                'row-stagger-enter',
                'row-animate-in',
                'row-filter-enter',
                'row-import-refresh',
                'row-exit',
                'focus-closed-flash',
                'highlight-new'
            );
            row.style.setProperty('--row-i', Math.min(i, maxStaggerRows));
        });

        if (needsCardReflow) void cards[0]?.offsetWidth;
        if (needsRowReflow) void rows[0]?.offsetWidth;

        cards.forEach(card => card.classList.add('stat-card-stagger'));
        rows.forEach(row => row.classList.add('row-stagger-enter'));

        const maxRowDelay = Math.min(rows.length, maxStaggerRows) * 5;
        const maxCardDelay = cards.length * 8;
        const duration = Math.max(maxRowDelay, maxCardDelay) + 260;

        this._listStaggerCleanupTimer = setTimeout(() => {
            this._listStaggerCleanupTimer = null;
            cards.forEach(card => {
                card.classList.remove('stat-card-stagger');
                card.style.removeProperty('--card-i');
            });
            rows.forEach(row => {
                row.classList.remove('row-stagger-enter');
                row.style.removeProperty('--row-i');
            });
        }, duration);
    },

    _clearViewEnterTransition() {
        if (this._viewEnterTimeout) {
            clearTimeout(this._viewEnterTimeout);
            this._viewEnterTimeout = null;
        }
        if (this._viewEnterEl && this._viewEnterEndHandler) {
            this._viewEnterEl.removeEventListener('animationend', this._viewEnterEndHandler);
        }
        this._viewEnterEl = null;
        this._viewEnterEndHandler = null;
    },

    _clearViewExitTransition() {
        if (this._viewExitTimeout) {
            clearTimeout(this._viewExitTimeout);
            this._viewExitTimeout = null;
        }
        if (this._viewExitEl && this._viewExitEndHandler) {
            this._viewExitEl.removeEventListener('animationend', this._viewExitEndHandler);
        }
        this._viewExitEl = null;
        this._viewExitEndHandler = null;
    },

    _clearViewTransitionTimers() {
        this._clearViewExitTransition();
        this._clearViewEnterTransition();
    },

    /** View entrance — horizontal micro-slide from right (Liste -> Plan) */
    _animateViewEnter(viewEl) {
        this._clearViewEnterTransition();
        if (this._prefersReducedMotion()) {
            viewEl.classList.remove('sc-exiting', 'sc-entering');
            return;
        }
        const needsReflow = viewEl.classList.contains('sc-entering') || viewEl.classList.contains('sc-exiting');
        viewEl.classList.remove('sc-exiting', 'sc-entering');
        if (needsReflow) {
            void viewEl.offsetWidth;
        }
        viewEl.classList.add('sc-entering');

        const cleanup = (e) => {
            if (e && e.target !== viewEl) return;
            this._clearViewEnterTransition();
            viewEl.classList.remove('sc-entering');
        };
        this._viewEnterEl = viewEl;
        this._viewEnterEndHandler = cleanup;
        viewEl.addEventListener('animationend', cleanup);
        this._viewEnterTimeout = setTimeout(() => cleanup(), 260);
    },

    /** View exit — horizontal micro-slide to right (Plan -> Liste) */
    _animateViewExit(viewEl, onComplete) {
        this._clearViewTransitionTimers();
        if (this._prefersReducedMotion()) {
            viewEl.classList.remove('sc-entering', 'sc-exiting');
            onComplete();
            return;
        }
        const needsReflow = viewEl.classList.contains('sc-entering') || viewEl.classList.contains('sc-exiting');
        viewEl.classList.remove('sc-entering', 'sc-exiting');
        if (needsReflow) {
            void viewEl.offsetWidth;
        }
        viewEl.classList.add('sc-exiting');

        let called = false;
        const done = (e) => {
            if (e && e.target !== viewEl) return;
            if (called) return;
            called = true;
            this._clearViewExitTransition();
            viewEl.classList.remove('sc-exiting');
            onComplete();
        };
        this._viewExitEl = viewEl;
        this._viewExitEndHandler = done;
        viewEl.addEventListener('animationend', done);
        this._viewExitTimeout = setTimeout(() => done(), 95);
    },

    /** Clean up any active Cours <-> Activité carousel ghost & animation classes */
    _cleanupModeCarousel() {
        this._clearNavigationBoundaryBounce();
        if (this._modeCarouselTimer) {
            clearTimeout(this._modeCarouselTimer);
            this._modeCarouselTimer = null;
        }
        if (this._modeCarouselBoard && this._modeCarouselEndHandler) {
            this._modeCarouselBoard.removeEventListener('animationend', this._modeCarouselEndHandler);
        }
        this._modeCarouselBoard = null;
        this._modeCarouselEndHandler = null;
        document.querySelectorAll('#seatingChartView .sc-board-carousel-ghost').forEach(el => el.remove());
        const board = document.getElementById('scClassroomBoard');
        if (board) {
            board.classList.remove('sc-mode-carousel-in-right', 'sc-mode-carousel-in-left');
            board.querySelectorAll('.sc-cell').forEach(cell => {
                cell.style.removeProperty('--carousel-col-i');
            });
        }
    },

    /** Clean up any active Fold / Unfold Continuum transition classes & custom properties */
    _cleanupFoldContinuum() {
        if (this._foldTransitionTimer) {
            clearTimeout(this._foldTransitionTimer);
            this._foldTransitionTimer = null;
        }
        const view = document.getElementById('seatingChartView');
        if (view) {
            view.classList.remove('sc-fold-transitioning', 'sc-unfolding-to-tablet', 'sc-folding-to-mobile');
            view.querySelectorAll('.sc-cell.sc-fold-cell-wave').forEach(cell => {
                cell.classList.remove('sc-fold-cell-wave');
                cell.style.removeProperty('--fold-hinge-dx');
                cell.style.removeProperty('--fold-cell-i');
            });
            view.querySelector('.sc-desk.sc-desk-entering')?.classList.remove('sc-desk-entering');
        }
    },

    /**
     * Play Galaxy Z Fold / Foldable Continuum animation when crossing the smartphone ↔ tablet form factor.
     * - In Plan view: orchestrates a center-hinge spring bloom on the classroom board, a radial outward/inward wave on desks,
     *   a directional dock/tray morph on the unplaced sidebar, and a soft settle on floating capsules.
     * - In List view: triggers a staggered cascade on stat cards and student rows/cards as the layout morphs.
     * @param {boolean} [isUnfolding=true] - true when opening from smartphone to tablet, false when folding back
     */
    _animateFoldContinuum(isUnfolding = true) {
        const wasAlreadyTransitioning = Boolean(this._foldTransitionTimer);
        this._cleanupFoldContinuum();

        if (this._prefersReducedMotion()) {
            return;
        }

        if (!this._isActive) {
            this._staggerListViewEntrance();
            return;
        }

        const view = document.getElementById('seatingChartView');
        const board = document.getElementById('scClassroomBoard');
        if (!view || !board) return;

        const desk = board.querySelector('.sc-desk');
        const hadEnteringDesk = Boolean(desk?.classList.contains('sc-desk-entering'));
        if (hadEnteringDesk) {
            desk.classList.remove('sc-desk-entering');
        }
        if (wasAlreadyTransitioning || hadEnteringDesk) {
            void view.offsetWidth;
        }

        const rawCols = Math.max(1, this._getCols?.() || 6);
        const rawRows = Math.max(1, this._getRows?.() || 5);
        const bounds = this._getEffectiveGridBounds
            ? this._getEffectiveGridBounds(rawRows, rawCols)
            : { startRow: 0, rowCount: rawRows, startCol: 0, colCount: rawCols };
        const cols = Math.max(1, bounds.colCount);
        const rows = Math.max(1, bounds.rowCount);
        const isStudent = this._isStudentOrientation
            ? this._isStudentOrientation()
            : (!this._isActivityMode?.() && this._orientation === 'student');
        const centerCol = (cols - 1) / 2;
        const centerRow = (rows - 1) / 2;

        const cells = board.querySelectorAll('.sc-cell:not([class*="sc-cell-special-"])');
        cells.forEach(cell => {
            const r = Math.max(0, (Number(cell.dataset.row) || 0) - bounds.startRow);
            const c = Math.max(0, (Number(cell.dataset.col) || 0) - bounds.startCol);
            const visualCol = isStudent ? (cols - 1 - c) : c;
            const visualRow = isStudent ? (rows - 1 - r) : r;
            const colOffset = visualCol - centerCol;
            const rowOffset = visualRow - centerRow;
            const radialIndex = Math.hypot(colOffset, rowOffset * 0.6);
            const hingeDx = Math.round((isUnfolding ? -colOffset * 11 : colOffset * 7) * 10) / 10;

            cell.style.setProperty('--fold-hinge-dx', `${hingeDx}px`);
            cell.style.setProperty('--fold-cell-i', radialIndex.toFixed(2));
            cell.classList.add('sc-fold-cell-wave');
        });

        view.classList.add('sc-fold-transitioning', isUnfolding ? 'sc-unfolding-to-tablet' : 'sc-folding-to-mobile');
        desk?.classList.add('sc-desk-entering');

        if (!this._isLocked) {
            this._staggerSidebarEntrance(isUnfolding ? 55 : 40);
        }

        this._foldTransitionTimer = setTimeout(() => {
            this._cleanupFoldContinuum();
        }, 620);
    },

    /** Capture outgoing classroom board clone for simultaneous carousel cross-slide */
    _captureModeCarouselGhost(prevMode) {
        this._cleanupModeCarousel();
        if (this._staggerCellTimer) {
            clearTimeout(this._staggerCellTimer);
            this._staggerCellTimer = null;
            document.querySelectorAll('#scGridContainer .sc-cell.sc-cell-stagger').forEach(c => {
                c.classList.remove('sc-cell-stagger');
                c.style.removeProperty('--cell-i');
                c.style.removeProperty('animation-delay');
            });
        }

        const board = document.getElementById('scClassroomBoard');
        const bodyEl = document.querySelector('#seatingChartView .sc-body');
        if (!board || !bodyEl) return null;

        const boardRect = board.getBoundingClientRect?.();
        const bodyRect = bodyEl.getBoundingClientRect?.();
        if (!boardRect || !bodyRect || boardRect.width <= 0 || boardRect.height <= 0) return null;

        const ghost = board.cloneNode(true);
        ghost.removeAttribute('id');
        ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        ghost.querySelectorAll('[data-row], [data-col], [data-result-id], [data-tooltip], [draggable]').forEach(el => {
            el.removeAttribute('data-row');
            el.removeAttribute('data-col');
            el.removeAttribute('data-result-id');
            el.removeAttribute('data-tooltip');
            el.removeAttribute('draggable');
        });
        ghost.querySelectorAll('.sc-cell-stagger, .sc-cell-placed, .sc-cell-swapped, .sc-cell-swap-dropped, .sc-cell-swap-secondary, .sc-auto-placed, .sc-desk-entering').forEach(el => {
            el.classList.remove('sc-cell-stagger', 'sc-cell-placed', 'sc-cell-swapped', 'sc-cell-swap-dropped', 'sc-cell-swap-secondary', 'sc-auto-placed', 'sc-desk-entering');
            el.style.removeProperty('--swap-dx');
            el.style.removeProperty('--swap-dy');
        });

        ghost.className = 'sc-classroom-board sc-board-carousel-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.dataset.planMode = prevMode;
        ghost.dataset.locked = this._isLocked ? 'true' : 'false';
        ghost.style.removeProperty('transform');
        ghost.style.removeProperty('transition');

        const computedBoard = window.getComputedStyle(board);
        const cellW = computedBoard.getPropertyValue('--sc-cell-w');
        const cellH = computedBoard.getPropertyValue('--sc-cell-h');
        if (cellW) ghost.style.setProperty('--sc-cell-w', cellW);
        if (cellH) ghost.style.setProperty('--sc-cell-h', cellH);
        if (computedBoard.flexDirection) ghost.style.flexDirection = computedBoard.flexDirection;

        const liveGrid = board.querySelector('.sc-grid-container');
        const ghostGrid = ghost.querySelector('.sc-grid-container');
        if (liveGrid && ghostGrid) {
            ghostGrid.style.gap = window.getComputedStyle(liveGrid).gap;
        }

        const unscaledW = board.offsetWidth || boardRect.width;
        const unscaledH = board.offsetHeight || boardRect.height;
        const centerX = (boardRect.left - bodyRect.left) + (boardRect.width / 2);
        const centerY = (boardRect.top - bodyRect.top) + (boardRect.height / 2);

        ghost.style.position = 'absolute';
        ghost.style.left = `${Math.round((centerX - unscaledW / 2) * 10) / 10}px`;
        ghost.style.top = `${Math.round((centerY - unscaledH / 2) * 10) / 10}px`;
        ghost.style.width = `${unscaledW}px`;
        ghost.style.height = `${unscaledH}px`;
        ghost.style.margin = '0';

        return ghost;
    },

    /** Play directional horizontal carousel with supple column wave inertia between Cours and Activité */
    _playModeCarousel(ghost, isForward) {
        if (this._prefersReducedMotion()) {
            this._cleanupModeCarousel();
            return;
        }
        const board = document.getElementById('scClassroomBoard');
        const bodyEl = document.querySelector('#seatingChartView .sc-body');
        if (!board) return;

        const enterClass = isForward ? 'sc-mode-carousel-in-right' : 'sc-mode-carousel-in-left';
        const exitClass = isForward ? 'sc-mode-carousel-out-left' : 'sc-mode-carousel-out-right';

        const rawCols = Math.max(1, this._getCols());
        const rawRows = Math.max(1, this._getRows());
        const bounds = this._getEffectiveGridBounds
            ? this._getEffectiveGridBounds(rawRows, rawCols)
            : { startRow: 0, rowCount: rawRows, startCol: 0, colCount: rawCols };
        const cols = Math.max(1, bounds.colCount);
        const rows = Math.max(1, bounds.rowCount);
        const isStudent = this._isStudentOrientation ? this._isStudentOrientation() : (!this._isActivityMode?.() && this._orientation === 'student');

        board.querySelectorAll('.sc-cell').forEach(cell => {
            const r = Math.max(0, (Number(cell.dataset.row) || 0) - bounds.startRow);
            const c = Math.max(0, (Number(cell.dataset.col) || 0) - bounds.startCol);
            const visualCol = isStudent ? (cols - 1 - c) : c;
            const visualRow = isStudent ? (rows - 1 - r) : r;
            const leadCol = isForward ? visualCol : (cols - 1 - visualCol);
            const waveIndex = Math.max(0, leadCol + visualRow * 0.22);
            cell.style.setProperty('--carousel-col-i', waveIndex.toFixed(2));
        });

        if (ghost && bodyEl) {
            ghost.classList.add(exitClass);
            bodyEl.appendChild(ghost);
        }

        const needsReflow = board.classList.contains('sc-mode-carousel-in-right') || board.classList.contains('sc-mode-carousel-in-left');
        board.classList.remove('sc-mode-carousel-in-right', 'sc-mode-carousel-in-left');
        if (needsReflow) {
            void board.offsetWidth;
        }
        board.classList.add(enterClass);

        const onAnimEnd = (e) => {
            if (e && e.target !== board) return;
            this._cleanupModeCarousel();
        };
        this._modeCarouselBoard = board;
        this._modeCarouselEndHandler = onAnimEnd;
        board.addEventListener('animationend', onAnimEnd);
        this._modeCarouselTimer = setTimeout(() => {
            this._cleanupModeCarousel();
        }, 500);
    },

    /** Stagger cell entrance (used after render) */
    _staggerCellEntrance(baseDelay = 0) {
        if (this._staggerCellTimer) {
            clearTimeout(this._staggerCellTimer);
            this._staggerCellTimer = null;
        }
        const cells = document.querySelectorAll('#scGridContainer .sc-cell:not([class*="sc-cell-special-"])');
        if (cells.length === 0) return;

        cells.forEach((cell, i) => {
            cell.classList.remove('sc-cell-stagger');
            cell.style.setProperty('--cell-i', i);
            if (baseDelay > 0) {
                cell.style.animationDelay = `calc(${baseDelay}ms + ${i * 20}ms)`;
            } else {
                cell.style.removeProperty('animation-delay');
            }
        });
        void cells[0]?.offsetWidth;
        cells.forEach(cell => cell.classList.add('sc-cell-stagger'));

        const duration = cells.length * 20 + 400 + baseDelay;
        this._staggerCellTimer = setTimeout(() => {
            this._staggerCellTimer = null;
            cells.forEach(c => {
                c.classList.remove('sc-cell-stagger');
                c.style.removeProperty('--cell-i');
                c.style.removeProperty('animation-delay');
            });
        }, duration);
    },

    /** Stagger sidebar student chips entrance when entering Plan view in edit mode */
    _staggerSidebarEntrance(baseDelay = 0) {
        if (this._staggerSidebarTimer) {
            clearTimeout(this._staggerSidebarTimer);
            this._staggerSidebarTimer = null;
        }
        if (this._isLocked) return;
        const chips = document.querySelectorAll('#scStudentList .sc-student-chip');
        if (chips.length === 0) return;

        chips.forEach((chip, i) => {
            const staggerIdx = Math.min(i, 20);
            chip.classList.remove('sc-chip-stagger');
            chip.style.setProperty('--chip-i', staggerIdx);
            if (baseDelay > 0) {
                chip.style.animationDelay = `calc(${baseDelay}ms + ${staggerIdx * 12}ms)`;
            } else {
                chip.style.removeProperty('animation-delay');
            }
        });
        void chips[0]?.offsetWidth;
        chips.forEach(chip => chip.classList.add('sc-chip-stagger'));

        const duration = Math.min(chips.length, 20) * 12 + 420 + baseDelay;
        this._staggerSidebarTimer = setTimeout(() => {
            this._staggerSidebarTimer = null;
            chips.forEach(chip => {
                chip.classList.remove('sc-chip-stagger');
                chip.style.removeProperty('--chip-i');
                chip.style.removeProperty('animation-delay');
            });
        }, duration);
    },

    /** Animate a single cell as "placed" (from sidebar or drop) */
    _animateCellPlaced(row, col) {
        const cell = document.querySelector(`.sc-cell[data-row="${row}"][data-col="${col}"]`);
        if (!cell) return;
        cell.classList.add('sc-cell-placed');
        cell.addEventListener('animationend', () => cell.classList.remove('sc-cell-placed'), { once: true });
    },

    /** Apply a FLIP glide animation from delta `(dx, dy)` and clean up on completion */
    _applyCellFlip(cell, dx, dy, extraClass = '') {
        if (!cell) return;
        cell.style.setProperty('--swap-dx', `${dx}px`);
        cell.style.setProperty('--swap-dy', `${dy}px`);
        const classes = extraClass ? ['sc-cell-swapped', extraClass] : ['sc-cell-swapped'];
        cell.classList.add(...classes);
        cell.addEventListener('animationend', () => {
            cell.classList.remove(...classes);
            cell.style.removeProperty('--swap-dx');
            cell.style.removeProperty('--swap-dy');
        }, { once: true });
    },

    /** Animate a single cell gliding via FLIP from `(fromRow, fromCol)` to `(toRow, toCol)` */
    _animateCellMove(fromRow, fromCol, toRow, toCol) {
        if (fromRow == null || fromCol == null || (Number(fromRow) === Number(toRow) && Number(fromCol) === Number(toCol))) {
            this._animateCellPlaced(toRow, toCol);
            return;
        }
        const toCell = document.querySelector(`.sc-cell[data-row="${toRow}"][data-col="${toCol}"]`);
        if (!toCell) return;
        const fromCell = document.querySelector(`.sc-cell[data-row="${fromRow}"][data-col="${fromCol}"]`);
        const { dx, dy } = this._computeCellSwapDelta(toCell, fromCell, toRow, toCol, fromRow, fromCol);
        this._applyCellFlip(toCell, dx, dy);
    },

    /** Compute unscaled local pixel vector from cell1 to cell2 (cell2 - cell1) */
    _computeCellSwapDelta(cell1, cell2, row1, col1, row2, col2) {
        if (cell1 && cell2) {
            const dxOffset = (cell2.offsetLeft || 0) - (cell1.offsetLeft || 0);
            const dyOffset = (cell2.offsetTop || 0) - (cell1.offsetTop || 0);
            if (dxOffset !== 0 || dyOffset !== 0) {
                return { dx: Math.round(dxOffset), dy: Math.round(dyOffset) };
            }

            const rect1 = cell1.getBoundingClientRect?.();
            const rect2 = cell2.getBoundingClientRect?.();
            if (rect1 && rect2 && (rect1.left !== rect2.left || rect1.top !== rect2.top)) {
                const board = document.getElementById('scClassroomBoard');
                const scale = parseFloat(board?.style?.getPropertyValue('--sc-scale')) || this._zoomScale || 1;
                const safeScale = scale > 0 ? scale : 1;
                return {
                    dx: Math.round((rect2.left - rect1.left) / safeScale),
                    dy: Math.round((rect2.top - rect1.top) / safeScale)
                };
            }
        }

        const isStudent = this._isStudentOrientation
            ? this._isStudentOrientation()
            : (!this._isActivityMode?.() && this._orientation === 'student');
        const sign = isStudent ? -1 : 1;
        const isActivity = Boolean(this._isActivityMode?.());
        const stepX = (isActivity ? 118 : 88) + 8;
        const stepY = (isActivity ? 114 : 96) + 8;
        return {
            dx: (Number(col2) - Number(col1)) * stepX * sign,
            dy: (Number(row2) - Number(row1)) * stepY * sign
        };
    },

    /**
     * Animate swap between two cells with FLIP trajectory + elastic landing bounce.
     * - Click-to-swap (default): both cells glide from each other's position and bounce into place.
     * - Drag-and-drop (`fromDrag: true`): the dropped cell (`row2, col2`) bounces in place,
     *   while the displaced cell (`row1, col1`) glides from `(row2, col2)` to `(row1, col1)` with a landing bounce.
     */
    _animateCellSwap(row1, col1, row2, col2, { fromDrag = false } = {}) {
        const cell1 = document.querySelector(`.sc-cell[data-row="${row1}"][data-col="${col1}"]`);
        const cell2 = document.querySelector(`.sc-cell[data-row="${row2}"][data-col="${col2}"]`);
        if (!cell1 && !cell2) return;

        const { dx, dy } = this._computeCellSwapDelta(cell1, cell2, row1, col1, row2, col2);
        this._applyCellFlip(cell1, dx, dy);

        if (cell2) {
            if (fromDrag) {
                cell2.classList.add('sc-cell-swapped', 'sc-cell-swap-dropped');
                cell2.addEventListener('animationend', () => {
                    cell2.classList.remove('sc-cell-swapped', 'sc-cell-swap-dropped');
                }, { once: true });
            } else {
                this._applyCellFlip(cell2, -dx, -dy, 'sc-cell-swap-secondary');
            }
        }
    },

    /**
     * Capture geometry and visual clone of a cell (or stacked member avatar) BEFORE optimistic grid re-render.
     * @param {HTMLElement|null} sourceEl
     * @returns {Object|null}
     */
    _captureFlightOrigin(sourceEl) {
        if (!sourceEl || typeof sourceEl.getBoundingClientRect !== 'function') return null;
        const startRect = sourceEl.getBoundingClientRect();
        const isStacked = sourceEl.classList.contains('sc-cell-stacked');
        const isMemberAvatar = sourceEl.classList.contains('sc-stacked-avatar');

        const clone = sourceEl.cloneNode(true);
        clone.className = isMemberAvatar
            ? 'sc-flight-token sc-flight-token--avatar'
            : `sc-cell occupied sc-flight-token${isStacked ? ' sc-cell-stacked' : ''}`;
        clone.removeAttribute('id');
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        clone.querySelectorAll('.sc-cell-remove, .sc-cell-pin, .sc-stacked-member-remove, .sc-station-badge, .sc-cell-status-badge').forEach(el => el.remove());

        const naturalW = sourceEl.offsetWidth || startRect.width || (isMemberAvatar ? 36 : 88);
        const naturalH = sourceEl.offsetHeight || startRect.height || (isMemberAvatar ? 36 : 96);
        const startScale = (naturalW > 0 && startRect.width > 0)
            ? Math.round((startRect.width / naturalW) * 1000) / 1000
            : (this._zoomScale || this._fitScale || 1);
        const computedRadius = window.getComputedStyle?.(sourceEl)?.borderRadius;

        return {
            clone,
            startRect,
            naturalW,
            naturalH,
            startScale,
            isMemberAvatar,
            borderRadius: computedRadius && computedRadius !== '0px' ? computedRadius : ''
        };
    },

    /**
     * Resolve exact viewport target (x, y) in the unplaced sidebar for a returning student.
     * Aims at the student's actual rendered chip avatar when visible inside `#scStudentList`,
     * clamping smoothly to the list edge if scrolled out of view.
     */
    _resolveSidebarFlightTarget(targetStudentId, startCenterY) {
        const sidebar = document.getElementById('scSidebar');
        const list = document.getElementById('scStudentList');
        const destRect = sidebar?.getBoundingClientRect?.();
        const hasSidebarBounds = Boolean(destRect && (destRect.width > 0 || destRect.height > 0));
        const isMobile = this._isCompactLayout ? this._isCompactLayout() : this._isMobileView?.();

        if (targetStudentId && list) {
            const safeId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
                ? CSS.escape(String(targetStudentId))
                : String(targetStudentId).replace(/"/g, '\\"');
            const chip = list.querySelector(`.sc-student-chip[data-result-id="${safeId}"]`);
            const listRect = list.getBoundingClientRect?.();
            const chipRect = chip?.getBoundingClientRect?.();
            const hasChipBounds = Boolean(chipRect && (chipRect.width > 0 || chipRect.height > 0));
            const hasListBounds = Boolean(listRect && (listRect.width > 0 || listRect.height > 0));

            if (hasChipBounds) {
                const avatarRect = chip.querySelector('.student-avatar')?.getBoundingClientRect?.();
                const anchorRect = (avatarRect && avatarRect.width > 0) ? avatarRect : chipRect;
                let tx = anchorRect.left + anchorRect.width / 2;
                let ty = anchorRect.top + anchorRect.height / 2;

                if (hasListBounds) {
                    tx = Math.min(Math.max(tx, listRect.left + 28), listRect.right - 28);
                    ty = Math.min(Math.max(ty, listRect.top + 24), listRect.bottom - 24);
                }
                return { x: tx, y: ty, targetAvatarSize: (avatarRect && avatarRect.width > 0) ? avatarRect.width : 40 };
            }
        }

        const viewRect = !hasSidebarBounds
            ? (document.getElementById('seatingChartView')?.getBoundingClientRect?.() || {
                left: 0,
                top: 0,
                right: window.innerWidth || 360,
                bottom: window.innerHeight || 640,
                width: window.innerWidth || 360,
                height: window.innerHeight || 640
            })
            : null;

        return {
            x: hasSidebarBounds
                ? (isMobile ? destRect.left + destRect.width / 2 : destRect.left + 44)
                : (isMobile ? viewRect.left + viewRect.width / 2 : viewRect.left + 80),
            y: hasSidebarBounds
                ? (isMobile ? destRect.top + 38 : Math.min(Math.max(startCenterY, destRect.top + 88), destRect.bottom - 48))
                : (isMobile ? viewRect.bottom - 40 : startCenterY),
            targetAvatarSize: 40
        };
    },

    /**
     * Targeted GPU-composited flight from a classroom seat directly to the student's real slot in the sidebar.
     * Supports either a live cell element or a pre-captured origin object from `_captureFlightOrigin`.
     * @param {HTMLElement|Object} source - Live cell element or pre-captured origin object
     * @param {Function} [onComplete] - Called once token is cleaned up
     * @param {Object} [options] - `{ targetStudentId, delay, onArrival }`
     */
    _flyStudentToSidebar(source, onComplete, options = {}) {
        const { targetStudentId = null, delay = 0, onArrival = null } = options;
        const sidebar = document.getElementById('scSidebar');
        const isPreCaptured = Boolean(source && source.clone && source.startRect);
        const liveCell = !isPreCaptured ? source : null;

        if (!sidebar || !source) {
            onArrival?.();
            onComplete?.();
            return;
        }

        if (this._prefersReducedMotion()) {
            onArrival?.();
            onComplete?.();
            return;
        }

        const origin = isPreCaptured ? source : this._captureFlightOrigin(liveCell);
        if (!origin) {
            onArrival?.();
            onComplete?.();
            return;
        }

        const { clone: flyer, startRect, naturalW, naturalH, startScale, isMemberAvatar, borderRadius } = origin;
        const startCenterX = startRect.left + startRect.width / 2;
        const startCenterY = startRect.top + startRect.height / 2;
        const target = this._resolveSidebarFlightTarget(targetStudentId, startCenterY);

        const dx = target.x - startCenterX;
        const dy = target.y - startCenterY;
        const endScale = isMemberAvatar
            ? 0.92
            : Math.max(0.42, Math.min(0.62, Math.round(((target.targetAvatarSize + 4) / Math.max(naturalW, 1)) * 100) / 100));

        if (liveCell) {
            liveCell.style.opacity = '0';
            liveCell.style.pointerEvents = 'none';
        }

        flyer.style.position = 'fixed';
        flyer.style.left = `${Math.round((startCenterX - naturalW / 2) * 10) / 10}px`;
        flyer.style.top = `${Math.round((startCenterY - naturalH / 2) * 10) / 10}px`;
        flyer.style.width = `${naturalW}px`;
        flyer.style.height = `${naturalH}px`;
        flyer.style.margin = '0';
        flyer.style.zIndex = '10001';
        flyer.style.pointerEvents = 'none';
        flyer.style.transformOrigin = 'center center';
        if (borderRadius) {
            flyer.style.borderRadius = borderRadius;
        }
        flyer.style.transform = `translate3d(0px, 0px, 0) scale(${startScale})`;
        flyer.style.opacity = '1';

        document.body.appendChild(flyer);

        const duration = 240;
        let arrived = false;
        let finished = false;
        let handoffTimer = null;
        let fallbackTimer = null;

        const triggerArrival = () => {
            if (arrived) return;
            arrived = true;
            if (handoffTimer) {
                clearTimeout(handoffTimer);
                handoffTimer = null;
            }
            onArrival?.();
        };

        const cleanup = () => {
            if (finished) return;
            finished = true;
            if (fallbackTimer) {
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
            }
            triggerArrival();
            flyer.remove();
            if (liveCell) {
                liveCell.style.opacity = '';
                liveCell.style.pointerEvents = '';
            }
            onComplete?.();
        };

        handoffTimer = setTimeout(triggerArrival, delay + Math.round(duration * 0.68));

        if (typeof flyer.animate === 'function') {
            const anim = flyer.animate([
                {
                    transform: `translate3d(0px, 0px, 0) scale(${startScale})`,
                    opacity: 1
                },
                {
                    transform: `translate3d(${Math.round(dx * 0.86)}px, ${Math.round(dy * 0.86)}px, 0) scale(${Math.round(endScale * 1.08 * 1000) / 1000})`,
                    opacity: 0.92,
                    offset: 0.68
                },
                {
                    transform: `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0) scale(${endScale})`,
                    opacity: 0
                }
            ], {
                duration,
                delay,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'forwards'
            });
            anim.onfinish = cleanup;
            anim.oncancel = cleanup;
            fallbackTimer = setTimeout(cleanup, delay + duration + 80);
        } else {
            flyer.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, opacity ${duration}ms cubic-bezier(0.4, 0, 1, 1) ${delay}ms`;
            void flyer.offsetWidth;
            flyer.style.transform = `translate3d(${Math.round(dx)}px, ${Math.round(dy)}px, 0) scale(${endScale})`;
            flyer.style.opacity = '0';

            const onTransitionEnd = (e) => {
                if (e && e.target !== flyer) return;
                flyer.removeEventListener('transitionend', onTransitionEnd);
                cleanup();
            };
            flyer.addEventListener('transitionend', onTransitionEnd);
            fallbackTimer = setTimeout(() => {
                flyer.removeEventListener('transitionend', onTransitionEnd);
                cleanup();
            }, delay + duration + 80);
        }
    }
};
