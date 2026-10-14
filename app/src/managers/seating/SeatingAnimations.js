/**
 * @fileoverview Seating Chart Animations — View transitions, mode carousel, stagger & flight animations
 * Extracted from SeatingChartManager for modularity (facade pattern via object spread).
 * @module managers/seating/SeatingAnimations
 */

export const SeatingAnimations = {
    _clearListViewTransitionClasses() {
        if (this._listEnterCleanupTimer) {
            clearTimeout(this._listEnterCleanupTimer);
            this._listEnterCleanupTimer = null;
        }
        if (this._listStaggerCleanupTimer) {
            clearTimeout(this._listStaggerCleanupTimer);
            this._listStaggerCleanupTimer = null;
        }
        document.querySelectorAll('.stats-container, .output-header, #outputList, #empty-state-card, #statsPagination').forEach(el => {
            el.classList.remove('view-slide-out-left', 'view-slide-in-left');
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
        const containers = Array.from(
            document.querySelectorAll('.stats-container, .output-header, #outputList, #empty-state-card, #statsPagination')
        ).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

        if (containers.length === 0) {
            onComplete();
            return;
        }

        containers.forEach(el => el.classList.remove('view-slide-in-left'));
        void containers[0]?.offsetWidth;
        containers.forEach(el => el.classList.add('view-slide-out-left'));

        let called = false;
        const done = () => {
            if (called) return;
            called = true;
            this._viewExitTimeout = null;
            containers.forEach(el => el.classList.remove('view-slide-out-left'));
            onComplete();
        };
        this._viewExitTimeout = setTimeout(done, 95);
    },

    /** List view entrance — horizontal micro-slide from left + progressive card/row reveal after Plan exits to right */
    _animateListViewEnter() {
        const containers = Array.from(
            document.querySelectorAll('.stats-container, .output-header, #outputList, #empty-state-card, #statsPagination')
        ).filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

        containers.forEach(el => el.classList.remove('view-slide-out-left'));
        void containers[0]?.offsetWidth;
        containers.forEach(el => el.classList.add('view-slide-in-left'));

        this._staggerListViewEntrance();

        this._listEnterCleanupTimer = setTimeout(() => {
            this._listEnterCleanupTimer = null;
            containers.forEach(el => el.classList.remove('view-slide-in-left'));
        }, 260);
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

        const cards = document.querySelectorAll('.stats-container .stat-card, #empty-state-card .empty-state-hub-card');
        const rows = document.querySelectorAll('#outputList .student-list-table tbody tr.student-row');
        if (cards.length === 0 && rows.length === 0) return;

        const maxStaggerRows = 18;
        cards.forEach((card, i) => {
            card.classList.remove('stat-card-stagger', 'stat-card-animate-in');
            card.style.setProperty('--card-i', i);
        });
        rows.forEach((row, i) => {
            row.classList.remove(
                'row-stagger-enter',
                'row-animate-in',
                'row-filter-enter',
                'row-import-refresh',
                'row-exit',
                'focus-closed-flash'
            );
            row.style.setProperty('--row-i', Math.min(i, maxStaggerRows));
        });

        void cards[0]?.offsetWidth;
        void rows[0]?.offsetWidth;

        cards.forEach(card => card.classList.add('stat-card-stagger'));
        rows.forEach(row => row.classList.add('row-stagger-enter'));

        const maxRowDelay = Math.min(rows.length, maxStaggerRows) * 17;
        const maxCardDelay = cards.length * 35;
        const duration = Math.max(maxRowDelay, maxCardDelay) + 420;

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

    /** View entrance — horizontal micro-slide from right + progressive cell reveal (Liste -> Plan) */
    _animateViewEnter(viewEl) {
        if (this._viewEnterTimeout) {
            clearTimeout(this._viewEnterTimeout);
            this._viewEnterTimeout = null;
        }
        viewEl.classList.remove('sc-exiting');
        void viewEl.offsetWidth;
        viewEl.classList.add('sc-entering');

        this._staggerCellEntrance(40);
        this._staggerSidebarEntrance(40);

        const cleanup = (e) => {
            if (e && e.target !== viewEl) return;
            if (this._viewEnterTimeout) {
                clearTimeout(this._viewEnterTimeout);
                this._viewEnterTimeout = null;
            }
            viewEl.removeEventListener('animationend', cleanup);
            viewEl.classList.remove('sc-entering');
        };
        viewEl.addEventListener('animationend', cleanup);
        this._viewEnterTimeout = setTimeout(() => cleanup(), 260);
    },

    /** View exit — horizontal micro-slide to right (Plan -> Liste) */
    _animateViewExit(viewEl, onComplete) {
        if (this._viewExitTimeout) {
            clearTimeout(this._viewExitTimeout);
            this._viewExitTimeout = null;
        }
        if (this._viewEnterTimeout) {
            clearTimeout(this._viewEnterTimeout);
            this._viewEnterTimeout = null;
        }
        viewEl.classList.remove('sc-entering');
        void viewEl.offsetWidth;
        viewEl.classList.add('sc-exiting');

        let called = false;
        const done = (e) => {
            if (e && e.target !== viewEl) return;
            if (called) return;
            called = true;
            viewEl.removeEventListener('animationend', done);
            this._viewExitTimeout = null;
            viewEl.classList.remove('sc-exiting');
            onComplete();
        };
        viewEl.addEventListener('animationend', done);
        this._viewExitTimeout = setTimeout(() => done(), 95);
    },

    /** Clean up any active Cours <-> Activité carousel ghost & animation classes */
    _cleanupModeCarousel() {
        if (this._modeCarouselTimer) {
            clearTimeout(this._modeCarouselTimer);
            this._modeCarouselTimer = null;
        }
        document.querySelectorAll('#seatingChartView .sc-board-carousel-ghost').forEach(el => el.remove());
        const board = document.getElementById('scClassroomBoard');
        if (board) {
            board.classList.remove('sc-mode-carousel-in-right', 'sc-mode-carousel-in-left', 'sc-mode-switching');
            board.querySelectorAll('.sc-cell').forEach(cell => {
                cell.style.removeProperty('--carousel-col-i');
            });
        }
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
        ghost.querySelectorAll('.sc-cell-stagger, .sc-cell-placed, .sc-cell-swapped, .sc-auto-placed, .sc-desk-entering').forEach(el => {
            el.classList.remove('sc-cell-stagger', 'sc-cell-placed', 'sc-cell-swapped', 'sc-auto-placed', 'sc-desk-entering');
        });

        ghost.className = 'sc-classroom-board sc-board-carousel-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        ghost.dataset.planMode = prevMode;
        ghost.dataset.locked = this._isLocked ? 'true' : 'false';

        const computedBoard = window.getComputedStyle(board);
        const cellW = computedBoard.getPropertyValue('--sc-cell-w');
        const cellH = computedBoard.getPropertyValue('--sc-cell-h');
        if (cellW) ghost.style.setProperty('--sc-cell-w', cellW);
        if (cellH) ghost.style.setProperty('--sc-cell-h', cellH);

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
        const board = document.getElementById('scClassroomBoard');
        const bodyEl = document.querySelector('#seatingChartView .sc-body');
        if (!board) return;

        const enterClass = isForward ? 'sc-mode-carousel-in-right' : 'sc-mode-carousel-in-left';
        const exitClass = isForward ? 'sc-mode-carousel-out-left' : 'sc-mode-carousel-out-right';

        const cols = Math.max(1, this._getCols());
        const rows = Math.max(1, this._getRows());
        const isStudent = this._orientation === 'student';

        board.querySelectorAll('.sc-cell').forEach(cell => {
            const r = Number(cell.dataset.row) || 0;
            const c = Number(cell.dataset.col) || 0;
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

        board.classList.remove('sc-mode-carousel-in-right', 'sc-mode-carousel-in-left', 'sc-mode-switching');
        void board.offsetWidth;
        board.classList.add(enterClass);

        this._modeCarouselTimer = setTimeout(() => {
            this._cleanupModeCarousel();
        }, 640);
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

    /** Ballistic flight animation from cell directly toward unplaced sidebar */
    _flyStudentToSidebar(cell, onComplete) {
        const sidebar = document.getElementById('scSidebar');
        if (!sidebar || !cell) {
            onComplete?.();
            return;
        }

        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            onComplete?.();
            return;
        }

        const startRect = cell.getBoundingClientRect();
        const destRect = sidebar.getBoundingClientRect();

        const isMobile = this._isMobileView();
        const targetX = isMobile
            ? destRect.left + destRect.width / 2
            : destRect.right - 40;
        const targetY = isMobile
            ? destRect.top + 35
            : Math.min(Math.max(startRect.top + startRect.height / 2, destRect.top + 80), destRect.bottom - 60);

        const flyer = cell.cloneNode(true);
        flyer.className = 'sc-cell occupied sc-flight-token';
        flyer.removeAttribute('id');
        flyer.querySelectorAll('.sc-cell-remove, .sc-cell-pin').forEach(el => el.remove());

        // Immediately hide content of the originating cell so it detaches cleanly
        cell.style.opacity = '0';
        cell.style.pointerEvents = 'none';

        const naturalW = cell.offsetWidth || startRect.width || 88;
        const naturalH = cell.offsetHeight || startRect.height || 96;
        const startScale = (naturalW > 0 && startRect.width > 0)
            ? Math.round((startRect.width / naturalW) * 1000) / 1000
            : (this._zoomScale || this._fitScale || 1);
        const startCenterX = startRect.left + startRect.width / 2;
        const startCenterY = startRect.top + startRect.height / 2;

        flyer.style.position = 'fixed';
        flyer.style.left = `${startCenterX - naturalW / 2}px`;
        flyer.style.top = `${startCenterY - naturalH / 2}px`;
        flyer.style.width = `${naturalW}px`;
        flyer.style.height = `${naturalH}px`;
        flyer.style.margin = '0';
        flyer.style.zIndex = '10001';
        flyer.style.pointerEvents = 'none';
        flyer.style.transformOrigin = 'center center';
        flyer.style.transform = `translate(0px, 0px) scale(${startScale})`;
        flyer.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.28s cubic-bezier(0.4, 0, 1, 1), filter 0.28s ease';

        document.body.appendChild(flyer);

        this._pulseSidebarReceiving();

        const dx = targetX - startCenterX;
        const dy = targetY - startCenterY;

        requestAnimationFrame(() => {
            flyer.style.transform = `translate(${dx}px, ${dy}px) scale(0.35) rotate(-10deg)`;
            flyer.style.opacity = '0';
            flyer.style.filter = 'blur(1px)';
        });

        let finished = false;
        const cleanup = () => {
            if (finished) return;
            finished = true;
            flyer.remove();
            cell.style.opacity = '';
            cell.style.pointerEvents = '';
            onComplete?.();
        };

        flyer.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 320);
    }
};
