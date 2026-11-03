/**
 * @fileoverview Seating Chart — Unplaced Students Sidebar, Chip Selection, Quick Group & Footer
 * @module managers/seating/SeatingSidebar
 */

import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { UI } from '../UIManager.js';
import { Utils } from '../../utils/Utils.js';
import { MAX_ACTIVITY_GROUP_SIZE } from './SeatingState.js';

export const SeatingSidebar = {
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

    _toggleCellSelection(row, col) {
        const cellIds = this._getCellStudentIds(row, col);
        if (cellIds.length === 0) return;
        const posKey = this._getActivePositionKey();
        if (cellIds.some(id => this._studentMap?.get(id)?.[posKey]?.pinned)) return;

        const isSelected = cellIds.some(id => this._selectedChipIds.includes(id));
        if (isSelected) {
            this._selectedChipIds = this._selectedChipIds.filter(id => !cellIds.includes(id));
        } else {
            cellIds.forEach(id => {
                if (!this._selectedChipIds.includes(id)) {
                    this._selectedChipIds.push(id);
                }
            });
        }
        this._applyChipSelectionUI();
        this._updateSelectionAttribute();
    },

    _getSelectedGridCells() {
        if (!Array.isArray(this._selectedChipIds) || this._selectedChipIds.length === 0 || !Array.isArray(this._gridState)) {
            return [];
        }
        const selectedSet = new Set(this._selectedChipIds);
        const rows = this._getRows();
        const cols = this._getCols();
        const cells = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cellIds = this._getCellStudentIds(r, c);
                if (cellIds.length > 0 && cellIds.some(id => selectedSet.has(id))) {
                    cells.push({
                        row: r,
                        col: c,
                        ids: [...cellIds]
                    });
                }
            }
        }
        return cells;
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
                if (cellIds.length === 0) continue;
                const isPinned = cellIds.some(id => this._studentMap?.get(id)?.[posKey]?.pinned);
                if (isPinned) continue;
                cellIds.forEach(id => {
                    if (id && !this._selectedChipIds.includes(id)) {
                        this._selectedChipIds.push(id);
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
        if (this._activeLassoAbort || this._lassoBoxEl) {
            this._cleanupMouseLasso?.();
        }
        if (this._selectedChipIds.length === 0) return;
        this._selectedChipIds = [];
        this._lastSelectedGridPos = null;
        this._lastSelectedSidebarIndex = null;
        this._applyChipSelectionUI();
        this._updateSelectionAttribute();
    },

    _applyChipSelectionUI() {
        const selectedSet = new Set(this._selectedChipIds);
        document.querySelectorAll('.sc-student-chip, .sc-cell.occupied').forEach(el => {
            if (el.classList.contains('sc-cell')) {
                const r = parseInt(el.dataset.row, 10);
                const c = parseInt(el.dataset.col, 10);
                const cellIds = (!isNaN(r) && !isNaN(c))
                    ? this._getCellStudentIds(r, c)
                    : [el.dataset.resultId].filter(Boolean);
                el.classList.toggle('sc-chip-selected', cellIds.some(id => selectedSet.has(id)));
            } else {
                const id = el.dataset.resultId;
                if (id) el.classList.toggle('sc-chip-selected', selectedSet.has(id));
            }
        });
    },

    _updateSelectionAttribute() {
        const view = document.getElementById('seatingChartView');
        if (view) view.dataset.hasSelection = this._selectedChipIds.length > 0;
        this._updateQuickGroupButton();
    },

    _canQuickGroupSelection() {
        const count = this._selectedChipIds.length;
        if (!this._isActivityMode() || this._isLocked || count < 2 || count > MAX_ACTIVITY_GROUP_SIZE) {
            return false;
        }
        const selectedCells = this._getSelectedGridCells();
        const gridIdSet = new Set(selectedCells.flatMap(c => c.ids));
        const hasUnplaced = this._selectedChipIds.some(id => !gridIdSet.has(id));
        if (!hasUnplaced && (selectedCells.length <= 1 || selectedCells.some(c => c.ids.length > 1))) {
            return false;
        }
        return true;
    },

    _updateQuickGroupButton() {
        const btn = document.getElementById('scQuickGroupBtn');
        const labelEl = document.getElementById('scQuickGroupBtnLabel');
        if (!btn || !labelEl) return;

        const count = this._selectedChipIds.length;
        const canQuickGroup = this._canQuickGroupSelection();

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
            this._placeSelectedAt(targetRow, targetCol, null, null, { groupIntoSingleStation: true });
        } else {
            UI.showNotification('Aucun poste libre disponible.', 'warning');
        }
    },

    _resolveGridBlockMovePlan(targetRow, targetCol, anchorRow = null, anchorCol = null) {
        const selectedCells = this._getSelectedGridCells();
        if (selectedCells.length === 0) return null;

        const rows = this._getRows();
        const cols = this._getCols();
        if (targetRow < 0 || targetRow >= rows || targetCol < 0 || targetCol >= cols) return null;
        if (this._isSpecialSpot(targetRow, targetCol)) return null;

        const posKey = this._getActivePositionKey();
        const isCellPinned = (r, c) => {
            const cellIds = this._getCellStudentIds(r, c);
            return cellIds.some(id => this._studentMap?.get(id)?.[posKey]?.pinned);
        };
        if (isCellPinned(targetRow, targetCol)) return null;

        const hasValidAnchor = anchorRow !== null && anchorCol !== null &&
            !isNaN(Number(anchorRow)) && !isNaN(Number(anchorCol)) &&
            selectedCells.some(s => s.row === Number(anchorRow) && s.col === Number(anchorCol));
        const defaultAnchorCell = this._isStudentOrientation?.()
            ? selectedCells[selectedCells.length - 1]
            : selectedCells[0];
        const anchor = hasValidAnchor
            ? { row: Number(anchorRow), col: Number(anchorCol) }
            : { row: defaultAnchorCell.row, col: defaultAnchorCell.col };

        const rawDRow = targetRow - anchor.row;
        const rawDCol = targetCol - anchor.col;

        let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
        for (const s of selectedCells) {
            if (s.row < minR) minR = s.row;
            if (s.row > maxR) maxR = s.row;
            if (s.col < minC) minC = s.col;
            if (s.col > maxC) maxC = s.col;
        }

        const clampedDRow = Math.max(-minR, Math.min(rows - 1 - maxR, rawDRow));
        const clampedDCol = Math.max(-minC, Math.min(cols - 1 - maxC, rawDCol));

        const canTranslateWith = (dRow, dCol) => {
            if (dRow === 0 && dCol === 0) return false;
            return selectedCells.every(s => {
                const nr = s.row + dRow;
                const nc = s.col + dCol;
                return nr >= 0 && nr < rows &&
                    nc >= 0 && nc < cols &&
                    !this._isSpecialSpot(nr, nc) &&
                    !isCellPinned(nr, nc);
            });
        };

        let effDRow = null;
        let effDCol = null;
        if (canTranslateWith(rawDRow, rawDCol)) {
            effDRow = rawDRow;
            effDCol = rawDCol;
        } else if (canTranslateWith(clampedDRow, clampedDCol)) {
            effDRow = clampedDRow;
            effDCol = clampedDCol;
        }

        if (effDRow !== null && effDCol !== null) {
            return {
                mode: 'rigid',
                dRow: effDRow,
                dCol: effDCol,
                selectedCells,
                targets: selectedCells.map(s => ({
                    srcRow: s.row,
                    srcCol: s.col,
                    row: s.row + effDRow,
                    col: s.col + effDCol,
                    ids: s.ids
                }))
            };
        }

        if (rawDRow === 0 && rawDCol === 0) return null;

        // Tier 2 fallback: sequential placement of intact workstation units into free/selected valid cells starting from (targetRow, targetCol)
        const selectedKeySet = new Set(selectedCells.map(s => `${s.row},${s.col}`));
        const candidateSlots = [];
        const totalCells = rows * cols;
        const startIdx = targetRow * cols + targetCol;
        for (let step = 0; step < totalCells && candidateSlots.length < selectedCells.length; step++) {
            const idx = (startIdx + step) % totalCells;
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            if (this._isSpecialSpot(r, c) || isCellPinned(r, c)) continue;
            const isOccupiedByUnselected = this._getCellStudentIds(r, c).length > 0 && !selectedKeySet.has(`${r},${c}`);
            if (!isOccupiedByUnselected) {
                candidateSlots.push({ row: r, col: c });
            }
        }

        if (candidateSlots.length < selectedCells.length) return null;

        const anyMoved = selectedCells.some((s, i) => s.row !== candidateSlots[i].row || s.col !== candidateSlots[i].col);
        if (!anyMoved) return null;

        return {
            mode: 'sequential',
            selectedCells,
            targets: selectedCells.map((s, i) => ({
                srcRow: s.row,
                srcCol: s.col,
                row: candidateSlots[i].row,
                col: candidateSlots[i].col,
                ids: s.ids
            }))
        };
    },

    _executeGridBlockMovePlan(plan) {
        if (!plan || !Array.isArray(plan.targets) || plan.targets.length === 0) return false;
        this._snapshotGrid();

        const cloneCellVal = (val) => (Array.isArray(val) ? [...val] : (val ?? null));

        const swappedCells = [];
        if (plan.mode === 'rigid') {
            const { dRow, dCol, selectedCells, targets } = plan;
            const selectedKeySet = new Set(selectedCells.map(s => `${s.row},${s.col}`));
            const targetKeySet = new Set(targets.map(t => `${t.row},${t.col}`));
            const oldGrid = this._gridState.map(row => row.map(cloneCellVal));

            for (const t of targets) {
                const tKey = `${t.row},${t.col}`;
                if (!selectedKeySet.has(tKey)) {
                    let vr = t.row - dRow;
                    let vc = t.col - dCol;
                    while (selectedKeySet.has(`${vr},${vc}`) && targetKeySet.has(`${vr},${vc}`)) {
                        vr -= dRow;
                        vc -= dCol;
                    }
                    const displaced = cloneCellVal(oldGrid[t.row]?.[t.col]);
                    this._gridState[vr][vc] = displaced;
                    if (displaced) {
                        swappedCells.push({ row: vr, col: vc });
                    }
                }
            }

            for (const t of targets) {
                this._setCellStudentIds(t.row, t.col, t.ids);
            }
        } else {
            for (const s of plan.selectedCells) {
                this._gridState[s.row][s.col] = null;
            }
            for (const t of plan.targets) {
                this._setCellStudentIds(t.row, t.col, t.ids);
            }
        }

        const placedCells = [
            ...plan.targets.map((t, index) => ({ row: t.row, col: t.col, index })),
            ...swappedCells
        ];
        this._selectedChipIds = [];
        this._lastSelectedGridPos = null;
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
        return true;
    },

    _placeSelectedAt(startRow, startCol, anchorRow = null, anchorCol = null, options = {}) {
        const ids = [...this._selectedChipIds];
        if (ids.length === 0) return;

        if (!options.groupIntoSingleStation) {
            const selectedGridCells = this._getSelectedGridCells();
            if (selectedGridCells.length > 0) {
                const gridIdSet = new Set(selectedGridCells.flatMap(c => c.ids));
                const hasUnplacedSelected = ids.some(id => !gridIdSet.has(id));
                if (!hasUnplacedSelected) {
                    const plan = this._resolveGridBlockMovePlan(startRow, startCol, anchorRow, anchorCol);
                    if (plan) {
                        this._executeGridBlockMovePlan(plan);
                        return;
                    }
                }
            }
        }

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
        this._lastSelectedGridPos = null;
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

    /** Track all-placed state for edit-mode sidebar collapse and auto-place disable */
    _updateSidebarLockState() {
        const view = document.getElementById('seatingChartView');
        if (!view) return;
        const allPlaced = this._getUnplacedStudents().length === 0;
        view.dataset.allPlaced = allPlaced;
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
        const currentClassName = this._getCurrentClass()?.name || Utils.getCurrentClassName();

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
                    ? `<div class="sc-empty-text"><strong>Bravo</strong><br>Tous les élèves sont placés</div>
                       <div class="sc-empty-success-badge" aria-hidden="true">
                           <svg class="sc-empty-check-svg" viewBox="0 0 24 24" fill="none">
                               <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                           </svg>
                       </div>`
                    : 'Aucun résultat'}
               </div>`
            : filtered.map((s, index) => {
                const badgeInfo = this._getStudentStatusBadgeInfo(s);
                const chipBadgeLabel = badgeInfo
                    ? (badgeInfo.type === 'ulis' ? 'ULIS' : badgeInfo.label.split(' • ')[0])
                    : '';
                const chipBadgeHtml = badgeInfo
                    ? `<span class="sc-chip-badge sc-chip-badge-${badgeInfo.type}">${Utils.escapeHtml(chipBadgeLabel)}</span>`
                    : '';
                const canDragChip = this._isNativeDraggableAllowed();
                return `
                <div class="${isReset ? 'sc-student-chip sc-chip-stagger' : 'sc-student-chip'}${s.isNew ? ' sc-chip-new' : ''}" ${isReset ? `style="--chip-i: ${index}"` : ''} draggable="${canDragChip}" data-result-id="${s.id}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                    <span class="sc-student-chip-name">${Utils.formatStudentName(s.nom, s.prenom, true, '', Utils.getOriginClass(s, currentClassName))}</span>
                    ${chipBadgeHtml}
                    <button type="button" class="sc-chip-profile-btn" data-profile-id="${s.id}" aria-label="Voir la fiche de ${Utils.escapeHtml(s.prenom || s.nom)}" data-tooltip="Voir la fiche élève">
                        <iconify-icon icon="solar:user-id-linear"></iconify-icon>
                    </button>
                </div>
            `;
            }).join('');

        const departedHtml = filteredDeparted.length > 0
            ? `<div class="sc-sidebar-departed-section">
                <div class="sc-sidebar-departed-header">
                    <iconify-icon icon="solar:user-cross-linear"></iconify-icon>
                    <span>Élève${filteredDeparted.length > 1 ? 's' : ''} parti${filteredDeparted.length > 1 ? 's' : ''} (${filteredDeparted.length})</span>
                </div>
                <div class="sc-sidebar-departed-list">
                    ${filteredDeparted.map(s => `
                        <div class="sc-student-chip sc-chip-departed" draggable="${this._isNativeDraggableAllowed()}" data-result-id="${s.id}">
                            ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                            <span class="sc-student-chip-name">${Utils.formatStudentName(s.nom, s.prenom, true, '', Utils.getOriginClass(s, currentClassName))}</span>
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
        FocusPanelManager.bindScrollAffordances?.(list);

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
                if (this._isLocked || e.target.closest?.('.sc-chip-profile-btn') || this._isTouchInteractionActive()) {
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
                chip.classList.add('dragging');
            });

            chip.addEventListener('dragend', () => {
                chip.classList.remove('dragging');
                this._dragSource = null;
                this._removeDragClones?.();
            });

            chip.addEventListener('click', (e) => {
                if (e.defaultPrevented || this._wasRecentTouchDrag() || this._isLocked || e.target.closest?.('.sc-chip-profile-btn')) return;
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
    }
};
