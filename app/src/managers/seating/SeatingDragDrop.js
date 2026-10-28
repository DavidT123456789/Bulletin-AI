/**
 * @fileoverview Seating Chart — Drag & Drop (HTML5, Mouse Pointer & Touch Inertia)
 * @module managers/seating/SeatingDragDrop
 */

import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { UI } from '../UIManager.js';
import { Utils } from '../../utils/Utils.js';
import { MAX_ACTIVITY_GROUP_SIZE } from './SeatingState.js';

export const SeatingDragDrop = {
    _isNativeDraggableAllowed() {
        if (this._isLocked) return false;
        if (this._isMousePointerActive) return true;
        if (this._isTouchActive) return false;
        if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse), (hover: none)')?.matches) {
            return false;
        }
        return true;
    },

    _setElementDraggable(el, canDrag) {
        if (!el) return;
        el.draggable = canDrag;
        el.querySelectorAll('.sc-stacked-avatar, .sc-stacked-member').forEach(memberEl => {
            memberEl.draggable = canDrag;
        });
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
        this._gridState[row][col] = unplacedId;
        this._dismissOnboardingHint();
        this._savePositionsToState();
        this._render();
        this._animateCellPlaced(row, col);
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
        return true;
    },
    _attachCellDragListeners(cell, student, row, col) {
        if (!cell || !student || cell._hasDragListeners) return;
        cell._hasDragListeners = true;

        cell.addEventListener('dragstart', (e) => {
            if (this._isLocked || cell.classList.contains('pinned') || this._isTouchInteractionActive()) {
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
            cell.classList.add('dragging');
        });

        cell.addEventListener('dragend', () => {
            cell.classList.remove('dragging');
            this._dragSource = null;
            this._removeDragClones?.();
            document.getElementById('scSidebar')?.classList.remove('drag-over');
        });

        this._addTouchDrag(cell, { type: 'cell', resultId: student.id, row, col });
    },

    _attachMemberAvatarDragListeners(cell, students, row, col) {
        if (!cell || !Array.isArray(students) || students.length <= 1) return;
        cell.querySelectorAll('.sc-stacked-avatar, .sc-stacked-member').forEach(memberEl => {
            if (memberEl._hasMemberDragListeners) return;
            memberEl._hasMemberDragListeners = true;

            memberEl.addEventListener('dragstart', (e) => {
                if (this._isLocked || cell.classList.contains('pinned') || e.target.closest?.('.sc-stacked-member-remove') || this._isTouchInteractionActive()) {
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
                cell.querySelectorAll(`.sc-stacked-avatar[data-result-id="${memberId}"], .sc-stacked-member[data-result-id="${memberId}"]`).forEach(el => {
                    el.classList.add('dragging-member');
                });
            });

            memberEl.addEventListener('dragend', (e) => {
                e.stopPropagation();
                cell.querySelectorAll('.dragging-member').forEach(el => el.classList.remove('dragging-member'));
                this._dragSource = null;
                this._removeDragClones?.();
                document.getElementById('scSidebar')?.classList.remove('drag-over');
            });
        });
    },

    _attachMemberHoverEcho(cell) {
        if (!cell || cell._hasMemberHoverEcho) return;
        cell._hasMemberHoverEcho = true;

        const setHighlight = (memberId, active) => {
            if (!memberId) return;
            if (active && (this._dragSource || this._touchSourceInfo || this._mousePressedElement)) return;
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
            this._setElementDraggable(cell, this._isNativeDraggableAllowed() && !isPinned);
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);
            const cellIds = (!isNaN(row) && !isNaN(col)) ? this._getCellStudentIds(row, col) : [cell.dataset.resultId].filter(Boolean);
            const students = cellIds.map(id => this._studentMap?.get(id)).filter(Boolean);

            if (students.length === 1) {
                const student = students[0];
                const tooltipText = this._getStudentTooltipText(student);
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
                cell.querySelectorAll('.sc-stacked-member, .sc-stacked-avatar').forEach(memberEl => {
                    const memberId = memberEl.dataset.resultId;
                    const s = this._studentMap?.get(memberId);
                    if (!s) return;
                    const tooltipText = this._getStudentTooltipText(s);
                    memberEl.setAttribute('data-tooltip', tooltipText);
                    if (memberEl.classList.contains('sc-stacked-member')) {
                        memberEl.setAttribute('data-tooltip-anchor', `.sc-stacked-avatar[data-result-id='${memberId}']`);
                    }
                    TooltipsUI?.updateTooltip?.(memberEl, tooltipText);
                });
            }
        });
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

        if (type === 'sidebar' || type === 'group-member') {
            this._animateCellPlaced(targetRow, targetCol);
        } else if (isSwap) {
            this._animateCellSwap(srcRow, srcCol, targetRow, targetCol, { fromDrag: true });
        } else {
            this._animateCellPlaced(targetRow, targetCol);
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
            this._renderSidebar(primaryRemovedId);
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
    // TOUCH DRAG & DROP
    // ========================================================================

    _isTouchInteractionActive() {
        const touchElapsed = this._lastTouchTime > 0 ? (Date.now() - this._lastTouchTime) : -1;
        return Boolean(
            this._isTouchActive ||
            this._touchSourceInfo ||
            this._touchDragEl ||
            (touchElapsed >= 0 && touchElapsed < 800)
        );
    },

    _wasRecentTouchDrag() {
        const elapsed = this._lastTouchDragEndTime > 0 ? (Date.now() - this._lastTouchDragEndTime) : -1;
        this._lastTouchDragEndTime = 0;
        return elapsed >= 0 && elapsed < 350;
    },

    _resolveElementDragSource(element, eventTarget, fallbackSourceInfo = null) {
        let activeSourceInfo = fallbackSourceInfo
            ? { ...fallbackSourceInfo }
            : (element.classList.contains('sc-student-chip')
                ? { type: 'sidebar', resultId: element.dataset.resultId }
                : { type: 'cell', resultId: element.dataset.resultId });

        if (element.dataset.row !== undefined && element.dataset.col !== undefined) {
            const r = parseInt(element.dataset.row, 10);
            const c = parseInt(element.dataset.col, 10);
            if (!isNaN(r) && !isNaN(c)) {
                activeSourceInfo.row = r;
                activeSourceInfo.col = c;
                const cellIds = this._getCellStudentIds(r, c);
                if (cellIds.length > 0) {
                    activeSourceInfo.resultId = cellIds[0];
                }
                const memberEl = cellIds.length > 1
                    ? eventTarget?.closest?.('.sc-stacked-avatar[data-result-id], .sc-stacked-member[data-result-id]')
                    : null;
                if (memberEl?.dataset?.resultId && !this._selectedChipIds.includes(activeSourceInfo.resultId)) {
                    activeSourceInfo = {
                        type: 'group-member',
                        resultId: memberEl.dataset.resultId,
                        row: r,
                        col: c
                    };
                }
            }
        }
        if (activeSourceInfo.type !== 'group-member' && activeSourceInfo.resultId && this._selectedChipIds.includes(activeSourceInfo.resultId)) {
            activeSourceInfo = { type: 'multi-cell', ids: [...this._selectedChipIds] };
        }
        return activeSourceInfo;
    },

    _executePointerDrop(x, y, sourceInfo, hitTarget = null) {
        if (!sourceInfo || !(x > 0 || y > 0)) return;
        const directHit = (!this._touchDragEl && hitTarget?.closest?.('#seatingChartView')) ? hitTarget : null;
        const elementsAtPoint = directHit ? null : (document.elementsFromPoint?.(x, y) || []);
        const isOverSidebar = directHit
            ? (sourceInfo.type !== 'sidebar' && Boolean(directHit.closest('.sc-sidebar')))
            : this._isTouchOverSidebar(x, y, elementsAtPoint);
        if (isOverSidebar) {
            if (sourceInfo.type === 'cell' || sourceInfo.type === 'multi-cell' || sourceInfo.type === 'group-member') {
                this._dragSource = sourceInfo;
                this._handleRemoveFromSidebarDrop();
            }
        } else {
            const targetCell = directHit
                ? directHit.closest('.sc-cell')
                : this._getCellUnderPoint(x, y, elementsAtPoint);
            if (targetCell) {
                const targetRow = parseInt(targetCell.dataset.row, 10);
                const targetCol = parseInt(targetCell.dataset.col, 10);
                if (this._isValidDropTarget(targetRow, targetCol)) {
                    this._dragSource = sourceInfo;
                    this._handleDrop(targetRow, targetCol);
                    this._dragSource = null;
                }
            }
        }
    },

    _startMousePointerDrag(e, dragTarget) {
        this._cleanupMouseDrag();
        this._mousePressedElement = dragTarget;
        this._setElementDraggable(dragTarget, false);

        const startX = e.clientX;
        const startY = e.clientY;
        const sourceInfo = this._resolveElementDragSource(dragTarget, e.target);
        let hasDragged = false;
        let lastX = startX;
        let lastY = startY;

        const onPointerMove = (ev) => {
            if (this._isLocked || !this._mousePressedElement) {
                finishDrag(ev, true);
                return;
            }
            const cx = ev.clientX;
            const cy = ev.clientY;
            if (!hasDragged) {
                if (Math.hypot(cx - startX, cy - startY) < 4) return;
                hasDragged = true;
                this._dragSource = sourceInfo;
                this._suppressTouchTooltips(0);
                this._dismissOnboardingHint();

                const isGroupMember = sourceInfo.type === 'group-member' && sourceInfo.resultId;
                const memberStudent = isGroupMember
                    ? (this._studentMap?.get(sourceInfo.resultId) || this._students?.find(s => s.id === sourceInfo.resultId) || false)
                    : null;
                const count = sourceInfo.type === 'multi-cell' ? sourceInfo.ids.length : 1;
                const cloneSourceEl = isGroupMember
                    ? (dragTarget.querySelector(`.sc-stacked-avatar[data-result-id="${sourceInfo.resultId}"], .sc-stacked-member[data-result-id="${sourceInfo.resultId}"]`) || dragTarget)
                    : dragTarget;
                const clone = this._buildFloatingDragClone(cloneSourceEl, {
                    baseClass: 'sc-drag-clone',
                    count,
                    memberStudent
                });

                this._removeDragClones();
                document.getElementById('seatingChartView')?.setAttribute('data-dragging', 'true');

                if (isGroupMember) {
                    dragTarget.querySelectorAll('.is-member-hovered').forEach(el => el.classList.remove('is-member-hovered'));
                    this._clearSelection();
                    dragTarget.querySelectorAll(`.sc-stacked-avatar[data-result-id="${sourceInfo.resultId}"], .sc-stacked-member[data-result-id="${sourceInfo.resultId}"]`).forEach(el => {
                        el.classList.add('dragging-member');
                    });
                } else {
                    if (sourceInfo.type !== 'multi-cell') {
                        this._clearSelection();
                    }
                    dragTarget.classList.add('dragging');
                }

                this._setFloatingClonePosition(clone, cx, cy);
                document.body.appendChild(clone);
                this._mouseDragClone = clone;
                lastX = cx;
                lastY = cy;
                if (cx > 0 || cy > 0) {
                    this._highlightCellUnderTouch(cx, cy, ev.target);
                    this._updateTouchAutoScroll(cx, cy);
                }
                return;
            }

            if (cx === lastX && cy === lastY) return;
            lastX = cx;
            lastY = cy;

            if (this._mouseDragClone && (cx > 0 || cy > 0)) {
                this._highlightCellUnderTouch(cx, cy, ev.target);
                this._updateTouchAutoScroll(cx, cy);
                this._setFloatingClonePosition(this._mouseDragClone, cx, cy);
            }
        };

        const onKeyDown = (ev) => {
            if (ev.key === 'Escape' && hasDragged) {
                finishDrag(ev, true);
            }
        };

        const finishDrag = (ev, cancelled = false) => {
            window.removeEventListener('pointermove', onPointerMove, true);
            window.removeEventListener('pointerup', onPointerUp, true);
            window.removeEventListener('pointercancel', onPointerCancel, true);
            window.removeEventListener('blur', onPointerCancel);
            window.removeEventListener('keydown', onKeyDown, true);
            this._activeMouseDragAbort = null;

            if (hasDragged) {
                const suppressClickOnce = (clickEv) => {
                    clickEv.stopPropagation();
                    clickEv.preventDefault();
                    dragTarget.removeEventListener('click', suppressClickOnce, true);
                };
                dragTarget.addEventListener('click', suppressClickOnce, true);
                setTimeout(() => dragTarget.removeEventListener('click', suppressClickOnce, true), 0);

                if (!cancelled && ev) {
                    this._executePointerDrop(ev.clientX, ev.clientY, sourceInfo, ev.target);
                }
            }

            this._cleanupMouseDrag();
        };

        const onPointerUp = (ev) => finishDrag(ev, false);
        const onPointerCancel = (ev) => finishDrag(ev, true);

        this._activeMouseDragAbort = () => finishDrag(null, true);
        window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
        window.addEventListener('pointerup', onPointerUp, true);
        window.addEventListener('pointercancel', onPointerCancel, true);
        window.addEventListener('blur', onPointerCancel, { once: true });
        window.addEventListener('keydown', onKeyDown, true);
    },

    _cleanupMouseDrag() {
        if (this._activeMouseDragAbort) {
            const abort = this._activeMouseDragAbort;
            this._activeMouseDragAbort = null;
            abort();
            return;
        }
        const hadActiveDrag = Boolean(this._mouseDragClone || this._dragSource);
        if (this._mousePressedElement) {
            const el = this._mousePressedElement;
            this._mousePressedElement = null;
            el.classList.remove('dragging');
            el.querySelectorAll('.dragging-member').forEach(m => m.classList.remove('dragging-member'));
            this._setElementDraggable(el, this._isNativeDraggableAllowed() && !el.classList.contains('pinned'));
        }
        this._stopTouchAutoScroll();
        this._mouseDragClone = null;
        this._dragSource = null;
        this._dragGridAreaRect = null;
        this._removeDragClones();
        if (hadActiveDrag) {
            this._suppressTouchTooltips(150);
        }
        document.querySelectorAll('.sc-cell.drag-over, .sc-cell.drag-over-join, .sc-cell.drag-over-full').forEach(c => {
            c.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
        });
        document.getElementById('scSidebar')?.classList.remove('drag-over');
    },

    _addTouchDrag(element, sourceInfo) {
        let startX, startY, lastTouchX, lastTouchY, lastMoveX = -1, lastMoveY = -1, hasMoved = false, hasDragged = false;
        let isScrolling = false;
        let longPressTimer = null;
        let pendingSourceInfo = null;

        const clearHoldTimer = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            if (this._longPressTimer) {
                clearTimeout(this._longPressTimer);
                this._longPressTimer = null;
            }
        };

        const engageTouchDrag = (touchPoint) => {
            if (hasMoved || isScrolling || this._isPinching || !pendingSourceInfo || this._isLocked || element.classList.contains('pinned')) {
                return false;
            }
            clearHoldTimer();
            hasMoved = true;
            this._touchSourceInfo = pendingSourceInfo;
            this._touchDraggedElement = element;
            this._suppressTouchTooltips(0);
            this._createTouchGhost(element, touchPoint);
            document.getElementById('seatingChartView')?.setAttribute('data-dragging', 'true');
            if (pendingSourceInfo.type === 'group-member' && pendingSourceInfo.resultId) {
                element.querySelectorAll(`.sc-stacked-avatar[data-result-id="${pendingSourceInfo.resultId}"], .sc-stacked-member[data-result-id="${pendingSourceInfo.resultId}"]`).forEach(el => {
                    el.classList.add('dragging-member');
                });
            } else {
                element.classList.add('dragging');
            }
            if (pendingSourceInfo.resultId && !this._selectedChipIds.includes(pendingSourceInfo.resultId)) {
                this._clearSelection();
            }
            this._highlightCellUnderTouch(touchPoint.clientX, touchPoint.clientY);
            return true;
        };

        element.addEventListener('touchstart', (e) => {
            this._isTouchActive = true;
            this._isMousePointerActive = false;
            this._lastTouchTime = Date.now();
            if (e.touches.length !== 1 || this._isPinching || this._isLocked || element.classList.contains('pinned') || e.target.closest?.('.sc-chip-profile-btn, .sc-cell-remove, .sc-cell-pin, .sc-stacked-member-remove')) {
                clearHoldTimer();
                pendingSourceInfo = null;
                return;
            }
            this._dismissOnboardingHint();
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            lastTouchX = startX;
            lastTouchY = startY;
            lastMoveX = -1;
            lastMoveY = -1;
            hasMoved = false;
            hasDragged = false;
            isScrolling = false;

            // Disarm native HTML5 touch drag during finger interaction so only the unified touch ghost is used
            this._touchPressedElement = element;
            this._setElementDraggable(element, false);

            const activeSourceInfo = this._resolveElementDragSource(element, e.target, sourceInfo);
            pendingSourceInfo = activeSourceInfo;
            this._touchSourceInfo = activeSourceInfo;

            // Lift visual ghost under finger if held stationary (without any delayed second vibration)
            clearHoldTimer();
            const holdDelay = (activeSourceInfo.type !== 'sidebar' && this._isFitted) ? 115 : 140;
            longPressTimer = setTimeout(() => {
                this._longPressTimer = null;
                engageTouchDrag({ clientX: lastTouchX, clientY: lastTouchY });
            }, holdDelay);
            this._longPressTimer = longPressTimer;
        }, { passive: true });

        element.addEventListener('touchmove', (e) => {
            if (this._isPinching || (e.touches && e.touches.length > 1)) {
                clearHoldTimer();
                isScrolling = true;
                pendingSourceInfo = null;
                if (this._touchSourceInfo || this._touchDragEl || this._touchPressedElement) {
                    this._cleanupTouch();
                }
                return;
            }
            if ((!pendingSourceInfo && !this._touchSourceInfo) || this._isLocked || isScrolling || element.classList.contains('pinned')) return;
            const touch = e.touches[0];
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (Math.hypot(dx, dy) > 5) {
                hasDragged = true;
            }

            // Touch gestures disambiguation
            if (!hasMoved) {
                const candidateType = pendingSourceInfo?.type || sourceInfo.type;
                if (candidateType === 'sidebar') {
                    if (this._isCompactLayout()) {
                        // Horizontal motion in bottom tray: prioritize native horizontal list scrolling
                        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
                            isScrolling = true;
                            clearHoldTimer();
                            pendingSourceInfo = null;
                            this._touchSourceInfo = null;
                            return;
                        }

                        // Vertical motion pulling upward toward the board: engage unified drag on first upward move
                        if (dy < -3 && Math.abs(dy) >= Math.abs(dx) * 0.75) {
                            hasDragged = true;
                            engageTouchDrag(touch);
                        }
                    } else {
                        // Vertical sidebar dock on tablet (> 768px): vertical motion scrolls the list
                        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
                            isScrolling = true;
                            clearHoldTimer();
                            pendingSourceInfo = null;
                            this._touchSourceInfo = null;
                            return;
                        }

                        // Horizontal motion pulling rightward toward the board: engage unified drag on first rightward move
                        if (dx > 3 && Math.abs(dx) >= Math.abs(dy) * 0.75) {
                            hasDragged = true;
                            engageTouchDrag(touch);
                        }
                    }
                } else if (candidateType === 'cell' || candidateType === 'multi-cell' || candidateType === 'group-member') {
                    if (this._isFitted) {
                        // On fitted board (no pan/scroll): engage visual ghost immediately on first touchmove frame
                        if (Math.hypot(dx, dy) >= 1) {
                            engageTouchDrag(touch);
                        }
                    } else if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
                        // On zoomed board: quick motion before hold pans/scrolls the board
                        isScrolling = true;
                        clearHoldTimer();
                        pendingSourceInfo = null;
                        this._touchSourceInfo = null;
                        return;
                    }
                }
            }

            if (hasMoved && this._touchDragEl) {
                if (e.cancelable) e.preventDefault();
                if (touch.clientX === lastMoveX && touch.clientY === lastMoveY) return;
                lastMoveX = touch.clientX;
                lastMoveY = touch.clientY;
                if (hasDragged) {
                    this._highlightCellUnderTouch(touch.clientX, touch.clientY);
                    this._updateTouchAutoScroll(touch.clientX, touch.clientY);
                }
                if (touch.clientX > 0 || touch.clientY > 0) {
                    this._setFloatingClonePosition(this._touchDragEl, touch.clientX, touch.clientY);
                }
            }
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            clearHoldTimer();
            if (this._isPinching || !hasMoved || !hasDragged || !this._touchSourceInfo) {
                this._cleanupTouch();
                return;
            }
            this._lastTouchDragEndTime = Date.now();
            if (e.cancelable) e.preventDefault();
            const touch = e.changedTouches[0];
            if (touch) {
                this._executePointerDrop(touch.clientX, touch.clientY, this._touchSourceInfo);
            }
            this._cleanupTouch();
        });

        element.addEventListener('touchcancel', () => {
            clearHoldTimer();
            this._cleanupTouch({ preserveTouchTimestamp: true });
        });
    },

    _createTouchGhost(element, touch) {
        this._removeTouchGhost();
        if (!touch || !(touch.clientX > 0 || touch.clientY > 0)) return;
        const isGroupMember = this._touchSourceInfo?.type === 'group-member' && this._touchSourceInfo.resultId;
        const memberStudent = isGroupMember
            ? (this._studentMap?.get(this._touchSourceInfo.resultId) || this._students?.find(s => s.id === this._touchSourceInfo.resultId) || false)
            : null;
        const count = this._touchSourceInfo?.type === 'multi-cell' ? this._touchSourceInfo.ids.length : 1;
        const ghost = this._buildFloatingDragClone(element, {
            baseClass: 'sc-touch-ghost',
            count,
            memberStudent
        });
        this._setFloatingClonePosition(ghost, touch.clientX, touch.clientY);
        document.body.appendChild(ghost);
        this._touchDragEl = ghost;
    },

    _removeTouchGhost() {
        this._touchDragEl?.remove();
        this._touchDragEl = null;
        this._touchGhostOffsetY = null;
    },

    _updateTouchAutoScroll(x, y) {
        this._lastTouchDragX = x;
        this._lastTouchDragY = y;

        const hasActiveFloatingClone = Boolean(this._touchDragEl || this._mouseDragClone);
        if (this._isFitted || !hasActiveFloatingClone || this._isDragOverSidebar) {
            this._stopTouchAutoScroll();
            return;
        }

        const gridArea = document.getElementById('scGridArea');
        if (!gridArea) return;

        let rect = this._dragGridAreaRect;
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            rect = gridArea.getBoundingClientRect?.();
            if (!rect || rect.width <= 0 || rect.height <= 0) return;
            this._dragGridAreaRect = rect;
        }

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
                if (!(this._touchDragEl || this._mouseDragClone) || this._isFitted || (this._touchAutoScrollVx === 0 && this._touchAutoScrollVy === 0)) {
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

    _cleanupTouch({ preserveTouchTimestamp = false } = {}) {
        const hadActiveDrag = Boolean(this._touchDragEl || this._touchSourceInfo);
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        if (this._touchDraggedElement) {
            this._touchDraggedElement.classList.remove('dragging');
            this._touchDraggedElement.querySelectorAll('.dragging-member').forEach(el => el.classList.remove('dragging-member'));
            this._touchDraggedElement = null;
        }
        if (this._touchPressedElement) {
            const el = this._touchPressedElement;
            this._touchPressedElement = null;
            this._isTouchActive = false;
            if (!preserveTouchTimestamp) {
                this._lastTouchTime = 0;
            }
            const canDrag = !preserveTouchTimestamp && this._isNativeDraggableAllowed() && !el.classList.contains('pinned');
            this._setElementDraggable(el, canDrag);
        }
        document.querySelectorAll('#seatingChartView .dragging, #seatingChartView .dragging-member').forEach(el => {
            el.classList.remove('dragging', 'dragging-member');
        });
        this._stopTouchAutoScroll();
        this._removeTouchGhost();
        this._touchSourceInfo = null;
        this._dragGridAreaRect = null;
        this._isDragOverSidebar = false;
        this._isTouchActive = false;
        this._lastTouchTime = preserveTouchTimestamp ? Date.now() : 0;
        if (hadActiveDrag && !this._isPinching) {
            this._suppressTouchTooltips(400);
        }
        document.body.classList.remove('sc-drag-over-sidebar');
        document.getElementById('seatingChartView')?.removeAttribute('data-dragging');
        this._hoveredDragCell = null;
        this._lastEvaluatedDragCell = undefined;
        document.querySelectorAll('.sc-cell.drag-over, .sc-cell.drag-over-join, .sc-cell.drag-over-full').forEach(c => {
            c.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
        });
        document.querySelector('.sc-sidebar')?.classList.remove('drag-over');
    },

    _highlightCellUnderTouch(x, y, hitTarget = null) {
        const sidebar = document.getElementById('scSidebar') || document.querySelector('.sc-sidebar');
        const activeSource = this._touchSourceInfo || this._dragSource;
        const canCheckSidebar = activeSource?.type !== 'sidebar';
        const directHit = (!this._touchDragEl && hitTarget?.closest?.('#seatingChartView')) ? hitTarget : null;
        const elementsAtPoint = (!directHit && (canCheckSidebar || !this._touchDragEl))
            ? (document.elementsFromPoint?.(x, y) || [])
            : null;

        const isOverSidebar = canCheckSidebar && (
            directHit
                ? Boolean(directHit.closest('.sc-sidebar'))
                : this._isTouchOverSidebar(x, y, elementsAtPoint)
        );

        if (isOverSidebar) {
            this._isDragOverSidebar = true;
            this._touchGhostOffsetY = null;
            this._lastEvaluatedDragCell = undefined;
            if (this._hoveredDragCell) {
                this._hoveredDragCell.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
                this._hoveredDragCell = null;
            }
            const canRemove = Boolean(
                sidebar &&
                !this._isLocked &&
                activeSource &&
                (activeSource.type === 'cell' || activeSource.type === 'multi-cell' || activeSource.type === 'group-member')
            );
            sidebar?.classList.toggle('drag-over', canRemove);
            document.body.classList.toggle('sc-drag-over-sidebar', canRemove);
            return;
        }

        if (this._isDragOverSidebar || sidebar?.classList.contains('drag-over')) {
            this._isDragOverSidebar = false;
            this._touchGhostOffsetY = null;
            sidebar?.classList.remove('drag-over');
            document.body.classList.remove('sc-drag-over-sidebar');
        }

        const cell = directHit
            ? directHit.closest('.sc-cell')
            : this._getCellUnderPoint(x, y, elementsAtPoint);
        if (cell === this._lastEvaluatedDragCell) {
            if (!cell || !this._hoveredDragCell || cell.classList.contains('drag-over')) {
                return;
            }
        }
        this._lastEvaluatedDragCell = cell;

        if (this._hoveredDragCell) {
            this._hoveredDragCell.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
            this._hoveredDragCell = null;
        }

        if (cell) {
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);
            if (this._isValidDropTarget(row, col)) {
                this._hoveredDragCell = cell;
                cell.classList.add('drag-over');
                cell.classList.toggle('drag-over-join', this._willDropJoinGroup(row, col, activeSource));
                cell.classList.toggle('drag-over-full', this._willDropOverflowGroup(row, col, activeSource));
            }
        }
    },

    _getCellUnderPoint(x, y, elementsAtPoint = null) {
        if (this._touchDragEl) {
            if (this._touchGhostOffsetY === null || this._touchGhostOffsetY === undefined) {
                const ghostRect = this._touchDragEl.getBoundingClientRect?.();
                if (ghostRect && ghostRect.width > 0 && ghostRect.height > 0) {
                    this._touchGhostOffsetY = (ghostRect.top + ghostRect.height / 2) - y;
                }
            }
            if (this._touchGhostOffsetY !== null && this._touchGhostOffsetY !== undefined) {
                const cellUnderGhost = (document.elementsFromPoint?.(x, y + this._touchGhostOffsetY) || []).find(el => el.classList.contains('sc-cell'));
                if (cellUnderGhost) return cellUnderGhost;
            }
        }
        const hits = elementsAtPoint || document.elementsFromPoint?.(x, y) || [];
        return hits.find(el => el.classList.contains('sc-cell')) || null;
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
        const posKey = this._getActivePositionKey();
        const targetIds = this._getCellStudentIds(r, c);
        if (targetIds.length > 0) {
            const anyPinned = targetIds.some(id => {
                const targetStudent = this._studentMap?.get(id) || this._students.find(s => s.id === id);
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

    _isTouchOverSidebar(x, y, elementsAtPoint = null) {
        const activeSource = this._touchSourceInfo || this._dragSource;
        if (activeSource?.type === 'sidebar') return false;
        const hits = elementsAtPoint || document.elementsFromPoint?.(x, y) || [];
        return hits.some(el => el.classList.contains('sc-sidebar') || el.closest('.sc-sidebar'));
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
                this._renderSidebar(resultId || removedIds[0]);
                this._updateFooter();
                this._updateSidebarLockState();
                this._onRemovalComplete();
            });
        } else if (type === 'multi-cell') {
            const rows = this._getRows();
            const cols = this._getCols();
            let delay = 0;

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
                this._clearSelection();
            }, Math.min(delay * 30 + 300, 600));
        }

        this._dragSource = null;
    }
};
