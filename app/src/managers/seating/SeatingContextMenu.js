/**
 * @fileoverview Seating Chart — Menu contextuel flottant (clic droit ordinateur & clavier)
 * Réutilise la structure et les classes CSS `.action-dropdown-menu` de la vue Liste.
 * @module managers/seating/SeatingContextMenu
 */

import { appState } from '../../state/State.js';
import { Utils } from '../../utils/Utils.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { HistoryManager } from '../HistoryManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { ListViewRenderer } from '../list/ListViewRenderer.js';
import { ListSelectionManager } from '../list/ListSelectionManager.js';

const VIEWPORT_MARGIN = 8;

export const SeatingContextMenu = {
    _handlePlanContextMenu(e) {
        if (!this._isActive) return false;

        // Sur mobile/tablette tactile ou pendant un glisser/lasso, l'appui long reste dédié au D&D
        if (
            this._isTouchInteractionActive?.() ||
            this._dragSource ||
            this._mousePressedElement ||
            this._activeLassoAbort
        ) {
            e.preventDefault();
            return true;
        }

        if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) {
            return false;
        }

        if (e.target?.closest?.('#scContextMenu')) {
            e.preventDefault();
            return true;
        }

        const openedViaKeyboard = (typeof e.pointerType === 'string' && e.pointerType === '')
            || (e.button === 0 && e.detail === 0 && !e.clientX && !e.clientY);

        const chip = e.target?.closest?.('.sc-student-chip[data-result-id]');
        if (chip && !this._isLocked) {
            const chipId = chip.dataset.resultId;
            if (!chipId) return false;
            const useSelection = this._selectedChipIds.length > 1 && this._selectedChipIds.includes(chipId);
            const studentIds = useSelection ? [...this._selectedChipIds] : [chipId];
            const selectedGridCells = useSelection ? this._getSelectedGridCells() : [];
            e.preventDefault();
            e.stopPropagation();
            this._openContextMenu({
                clientX: e.clientX,
                clientY: e.clientY,
                studentIds,
                isPlaced: selectedGridCells.length > 0,
                selectedGridCells,
                triggerEl: chip,
                openedViaKeyboard
            });
            return true;
        }

        const cell = e.target?.closest?.('.sc-cell.occupied');
        if (cell) {
            const row = parseInt(cell.dataset.row, 10);
            const col = parseInt(cell.dataset.col, 10);
            const hasCoords = !Number.isNaN(row) && !Number.isNaN(col);
            const cellIds = hasCoords
                ? this._getCellStudentIds(row, col)
                : [cell.dataset.resultId].filter(Boolean);
            if (cellIds.length === 0) return false;

            const cellStudents = cellIds
                .map(id => this._studentMap?.get(id) || appState.generatedResults?.find(r => r.id === id))
                .filter(Boolean);
            if (cellStudents.length === 0) return false;

            const memberEl = cellStudents.length > 1
                ? e.target?.closest?.('.sc-stacked-avatar[data-result-id], .sc-stacked-member[data-result-id]')
                : null;
            const memberId = memberEl?.dataset?.resultId || null;

            const useSelection = !this._isLocked
                && this._selectedChipIds.length > 1
                && cellIds.some(id => this._selectedChipIds.includes(id));

            e.preventDefault();
            e.stopPropagation();

            if (useSelection) {
                const selectedGridCells = this._getSelectedGridCells();
                this._openContextMenu({
                    clientX: e.clientX,
                    clientY: e.clientY,
                    studentIds: [...this._selectedChipIds],
                    isPlaced: selectedGridCells.length > 0,
                    selectedGridCells,
                    triggerEl: cell,
                    openedViaKeyboard
                });
            } else if (cellStudents.length === 1) {
                this._openContextMenu({
                    clientX: e.clientX,
                    clientY: e.clientY,
                    studentIds: [cellStudents[0].id],
                    row: hasCoords ? row : null,
                    col: hasCoords ? col : null,
                    isPlaced: true,
                    isGroupMember: false,
                    cellStudents,
                    triggerEl: cell,
                    openedViaKeyboard
                });
            } else if (memberId && cellIds.includes(memberId)) {
                this._openContextMenu({
                    clientX: e.clientX,
                    clientY: e.clientY,
                    studentIds: [memberId],
                    row: hasCoords ? row : null,
                    col: hasCoords ? col : null,
                    isPlaced: true,
                    isGroupMember: true,
                    cellStudents,
                    triggerEl: memberEl || cell,
                    openedViaKeyboard
                });
            } else {
                this._openContextMenu({
                    clientX: e.clientX,
                    clientY: e.clientY,
                    studentIds: cellIds,
                    row: hasCoords ? row : null,
                    col: hasCoords ? col : null,
                    isPlaced: true,
                    showMemberPicker: true,
                    cellStudents,
                    triggerEl: cell,
                    openedViaKeyboard
                });
            }
            return true;
        }

        this._closeContextMenu();
        if (!this._isLocked) {
            e.preventDefault();
            return true;
        }
        return false;
    },

    _openContextMenu(context) {
        this._closeContextMenu({ silentHistory: true });
        this._closeConfigPopover?.();
        this._closePlacementPopover?.();
        TooltipsUI?.hideAll?.();

        const menu = document.createElement('div');
        menu.id = 'scContextMenu';
        menu.className = 'action-dropdown-menu sc-context-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Actions élève');
        menu.tabIndex = -1;

        this._renderContextMenuContent(menu, context);
        document.body.appendChild(menu);

        let anchorX = Number(context.clientX) || 0;
        let anchorY = Number(context.clientY) || 0;
        if (anchorX === 0 && anchorY === 0 && context.triggerEl?.getBoundingClientRect) {
            const rect = context.triggerEl.getBoundingClientRect();
            anchorX = rect.left + Math.min(24, rect.width / 2);
            anchorY = rect.bottom - 4;
        }

        this._positionContextMenu(menu, anchorX, anchorY);

        const targetEl = context.triggerEl || null;
        const parentCell = (targetEl && !targetEl.classList?.contains('sc-cell'))
            ? targetEl.closest?.('.sc-cell') || null
            : null;
        targetEl?.classList?.add('sc-context-target');
        parentCell?.classList?.add('sc-context-target-parent');

        const clearKeyboardItemFocusOnHover = (ev) => {
            const hovered = ev.target?.closest?.('[role="menuitem"]');
            if (hovered && document.activeElement && menu.contains(document.activeElement) && document.activeElement !== menu && document.activeElement !== hovered) {
                menu.focus({ preventScroll: true });
            }
        };
        menu.addEventListener('pointermove', clearKeyboardItemFocusOnHover, { passive: true });

        const dismissOnViewportChange = () => this._closeContextMenu();
        window.addEventListener('scroll', dismissOnViewportChange, { capture: true, passive: true });
        window.addEventListener('wheel', dismissOnViewportChange, { capture: true, passive: true });
        window.addEventListener('resize', dismissOnViewportChange, { passive: true });

        this._activeContextMenu = {
            menu,
            context,
            anchorX,
            anchorY,
            triggerEl: targetEl,
            parentCell,
            cleanupListeners: () => {
                menu.removeEventListener('pointermove', clearKeyboardItemFocusOnHover);
                window.removeEventListener('scroll', dismissOnViewportChange, { capture: true });
                window.removeEventListener('wheel', dismissOnViewportChange, { capture: true });
                window.removeEventListener('resize', dismissOnViewportChange);
            }
        };

        if (!HistoryManager.isOpen('scContextMenu')) {
            HistoryManager.pushState('scContextMenu', () => {
                this._closeContextMenu({ causedByHistory: true });
            });
        }

        void menu.offsetWidth;
        menu.classList.add('open');

        if (context.openedViaKeyboard || (!context.clientX && !context.clientY)) {
            menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
        } else {
            menu.focus({ preventScroll: true });
        }
    },

    _positionContextMenu(menu, clientX, clientY) {
        const vw = window.innerWidth || 1024;
        const vh = window.innerHeight || 768;
        const rect = menu.getBoundingClientRect();
        const menuW = rect.width || menu.offsetWidth || 200;
        const menuH = rect.height || menu.offsetHeight || 220;

        let x = clientX;
        let y = clientY;
        let originX = 'left';
        let originY = 'top';

        if (x + menuW > vw - VIEWPORT_MARGIN) {
            x = Math.max(VIEWPORT_MARGIN, vw - menuW - VIEWPORT_MARGIN);
            originX = 'right';
        } else {
            x = Math.max(VIEWPORT_MARGIN, x);
        }

        if (y + menuH > vh - VIEWPORT_MARGIN) {
            if (clientY - menuH >= VIEWPORT_MARGIN) {
                y = clientY - menuH;
                originY = 'bottom';
            } else {
                y = Math.max(VIEWPORT_MARGIN, vh - menuH - VIEWPORT_MARGIN);
            }
        } else {
            y = Math.max(VIEWPORT_MARGIN, y);
        }

        menu.style.left = `${Math.round(x)}px`;
        menu.style.top = `${Math.round(y)}px`;
        menu.style.transformOrigin = `${originY} ${originX}`;
    },

    _renderContextMenuContent(menu, context) {
        const {
            studentIds = [],
            row = null,
            col = null,
            isPlaced = false,
            isGroupMember = false,
            cellStudents = null,
            showMemberPicker = false,
            selectedGridCells = []
        } = context;

        const hasCoords = row !== null && col !== null;

        if (showMemberPicker && Array.isArray(cellStudents) && cellStudents.length > 1) {
            const posKey = this._getActivePositionKey();
            const isPinned = cellStudents.some(s => Boolean(s?.[posKey]?.pinned));
            const planSection = (!this._isLocked && hasCoords) ? `
                <h5 class="dropdown-header">Plan</h5>
                <button type="button" class="action-dropdown-item" role="menuitem" data-action="toggle-pin">
                    <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon> ${isPinned ? 'Détacher le poste' : 'Épingler le poste'}
                </button>
                <button type="button" class="action-dropdown-item" role="menuitem" data-action="unplace-cell">
                    <iconify-icon icon="solar:logout-3-linear"></iconify-icon> Libérer le poste
                </button>
            ` : '';

            menu.innerHTML = `
                ${planSection}
                <h5 class="dropdown-header">Élèves du poste</h5>
                ${cellStudents.map(s => `
                    <button type="button" class="action-dropdown-item" role="menuitem" data-pick-member-id="${Utils.escapeHtml(String(s.id))}">
                        <iconify-icon icon="solar:user-rounded-linear"></iconify-icon>
                        <span>${Utils.escapeHtml(Utils.formatStudentName(s.nom, s.prenom, false))}</span>
                    </button>
                `).join('')}
            `;
        } else {
            const isBulk = studentIds.length > 1;
            const primaryId = studentIds[0];
            const targetStudent = !isBulk
                ? (this._studentMap?.get(primaryId) || appState.generatedResults?.find(r => r.id === primaryId))
                : null;

            const profileItemHTML = !isBulk ? `
                <button type="button" class="action-dropdown-item" role="menuitem" data-action="open-profile">
                    <iconify-icon icon="solar:user-id-linear"></iconify-icon> Voir la fiche
                </button>
            ` : '';

            let planSectionHTML = '';
            if (!this._isLocked && isPlaced) {
                if (isBulk && selectedGridCells.length > 0) {
                    const placedCount = selectedGridCells.reduce((sum, c) => sum + c.ids.length, 0);
                    planSectionHTML = `
                        <h5 class="dropdown-header">Plan</h5>
                        <button type="button" class="action-dropdown-item" role="menuitem" data-action="unplace-selection">
                            <iconify-icon icon="solar:logout-3-linear"></iconify-icon> Retirer du plan (${placedCount})
                        </button>
                    `;
                } else if (!isBulk && hasCoords) {
                    const posKey = this._getActivePositionKey();
                    const cellIds = this._getCellStudentIds(row, col);
                    const isPinned = cellIds.some(id => {
                        const st = this._studentMap?.get(id) || appState.generatedResults?.find(r => r.id === id);
                        return Boolean(st?.[posKey]?.pinned);
                    });
                    const pinLabel = isPinned
                        ? (isGroupMember ? 'Détacher le poste' : 'Détacher')
                        : (isGroupMember ? 'Épingler le poste' : 'Épingler');
                    const unplaceLabel = isGroupMember ? 'Retirer du poste' : 'Retirer du plan';

                    planSectionHTML = `
                        <h5 class="dropdown-header">Plan</h5>
                        <button type="button" class="action-dropdown-item" role="menuitem" data-action="toggle-pin">
                            <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon> ${pinLabel}
                        </button>
                        <button type="button" class="action-dropdown-item" role="menuitem" data-action="unplace-student">
                            <iconify-icon icon="solar:logout-3-linear"></iconify-icon> ${unplaceLabel}
                        </button>
                    `;
                }
            }

            const studentHeader = isBulk
                ? `${studentIds.length} élèves sélectionnés`
                : (isGroupMember && targetStudent
                    ? `Élève · ${Utils.formatStudentName(targetStudent.nom, targetStudent.prenom, false)}`
                    : 'Élève');
            const countSuffix = isBulk ? ` (${studentIds.length})` : '';

            menu.innerHTML = `
                ${profileItemHTML}
                ${planSectionHTML}
                ${ListViewRenderer.generateStudentMenuSectionHTML(studentIds, {
                    headerLabel: studentHeader,
                    countSuffix
                })}
            `;
        }

        menu.onclick = (e) => {
            e.stopPropagation();
            const pickBtn = e.target.closest('[data-pick-member-id]');
            if (pickBtn) {
                const pickedId = pickBtn.dataset.pickMemberId;
                if (!pickedId) return;
                const nextContext = {
                    ...context,
                    studentIds: [pickedId],
                    isGroupMember: true,
                    showMemberPicker: false
                };
                if (this._activeContextMenu) {
                    this._activeContextMenu.context = nextContext;
                }
                this._renderContextMenuContent(menu, nextContext);
                this._positionContextMenu(
                    menu,
                    this._activeContextMenu?.anchorX ?? context.clientX,
                    this._activeContextMenu?.anchorY ?? context.clientY
                );
                menu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
                return;
            }

            const item = e.target.closest('.action-dropdown-item[data-action]');
            if (!item) return;

            const action = item.dataset.action;
            const ids = [...studentIds];
            this._closeContextMenu();

            switch (action) {
                case 'open-profile':
                    if (ids[0]) FocusPanelManager.open(ids[0]);
                    break;
                case 'toggle-pin':
                    if (hasCoords) {
                        this._toggleCellPin(row, col);
                    } else if (ids[0]) {
                        this._togglePin(ids[0]);
                    }
                    break;
                case 'unplace-cell':
                    if (hasCoords) this._removeFromCell(row, col);
                    break;
                case 'unplace-student':
                    if (isGroupMember && hasCoords && ids[0]) {
                        this._removeStudentFromCell(row, col, ids[0]);
                    } else if (hasCoords) {
                        this._removeFromCell(row, col);
                    }
                    break;
                case 'unplace-selection':
                    this._unplaceSelectedCells(selectedGridCells);
                    break;
                case 'move-student':
                    if (ids.length > 1) {
                        ListSelectionManager.bulkMove(ids, () => this._clearSelection());
                    } else {
                        ListSelectionManager.bulkMove(ids);
                    }
                    break;
                case 'reset-student': {
                    const resetPromise = ListSelectionManager.bulkReset(ids);
                    if (ids.length > 1 && resetPromise?.then) {
                        resetPromise.then((didClear) => {
                            if (didClear) this._clearSelection();
                        });
                    }
                    break;
                }
                case 'delete-student':
                    ListSelectionManager.confirmAndDeleteStudents(ids);
                    break;
            }
        };
    },

    _unplaceSelectedCells(selectedGridCells = []) {
        if (this._isLocked || !Array.isArray(selectedGridCells) || selectedGridCells.length === 0) return;
        this._snapshotGrid();
        let lastRemovedId = null;
        for (const cellInfo of selectedGridCells) {
            if (this._gridState?.[cellInfo.row]) {
                if (cellInfo.ids?.[0]) lastRemovedId = cellInfo.ids[0];
                this._gridState[cellInfo.row][cellInfo.col] = null;
            }
        }
        this._clearSelection();
        this._savePositionsToState();
        this._renderGrid();
        this._renderSidebar(lastRemovedId);
        this._updateFooter();
        this._updateSidebarLockState();
        this._onRemovalComplete();
    },

    _handleContextMenuKeydown(e) {
        if (!this._activeContextMenu?.menu) return false;
        const { menu } = this._activeContextMenu;

        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this._closeContextMenu({ restoreFocus: true });
            return true;
        }

        if (e.key === 'Tab') {
            this._closeContextMenu();
            return true;
        }

        const items = Array.from(menu.querySelectorAll('[role="menuitem"]:not(:disabled)'));
        if (items.length === 0) return true;

        const currentIdx = items.indexOf(document.activeElement);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            const nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % items.length;
            items[nextIdx]?.focus({ preventScroll: true });
            return true;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            const prevIdx = currentIdx <= 0 ? items.length - 1 : currentIdx - 1;
            items[prevIdx]?.focus({ preventScroll: true });
            return true;
        }

        if (e.key === 'Home') {
            e.preventDefault();
            e.stopPropagation();
            items[0]?.focus({ preventScroll: true });
            return true;
        }

        if (e.key === 'End') {
            e.preventDefault();
            e.stopPropagation();
            items[items.length - 1]?.focus({ preventScroll: true });
            return true;
        }

        // Laisser l'activation native (<button> sur Entrée / Espace) sans déclencher les raccourcis du Plan
        if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            return true;
        }

        return true;
    },

    _closeContextMenu(options = {}) {
        const { restoreFocus = false, causedByHistory = false, silentHistory = false } = options;
        if (!this._activeContextMenu) {
            document.getElementById('scContextMenu')?.remove();
            document.querySelectorAll('.sc-context-target').forEach(el => el.classList.remove('sc-context-target'));
            document.querySelectorAll('.sc-context-target-parent').forEach(el => el.classList.remove('sc-context-target-parent'));
            return;
        }

        const { menu, triggerEl, parentCell, cleanupListeners } = this._activeContextMenu;
        this._activeContextMenu = null;
        triggerEl?.classList?.remove('sc-context-target');
        parentCell?.classList?.remove('sc-context-target-parent');
        cleanupListeners?.();
        menu?.remove();

        if (!causedByHistory && !silentHistory && HistoryManager.isOpen('scContextMenu')) {
            HistoryManager.handleManualClose('scContextMenu');
        }

        if (restoreFocus && triggerEl?.isConnected && typeof triggerEl.focus === 'function') {
            triggerEl.focus({ preventScroll: true });
        }
    }
};
