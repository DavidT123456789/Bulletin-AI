/**
 * @fileoverview Seating Chart — Grid & Cell DOM Renderer, Status Badges & Homonym Formatting
 * @module managers/seating/SeatingRenderer
 */

import { appState } from '../../state/State.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { Utils } from '../../utils/Utils.js';
import { STUDENT_STATUS_REGISTRY, resolveStudentStatus } from '../../config/academicConstants.js';
import { MAX_ACTIVITY_GROUP_SIZE } from './SeatingState.js';

export const SeatingRenderer = {
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

        if (this._getPlacedIds().size > 0 || (this._isLocked && !this._isVirtualClass())) {
            this._dismissOnboardingHint();
        } else {
            this._maybeShowOnboardingHint();
        }
    },

    _getEffectiveGridBounds(rows = this._getRows(), cols = this._getCols()) {
        if (!this._isActivityMode() || (!this._isLocked && !this._isPrinting) || (rows <= 1 && cols <= 1)) {
            return {
                startRow: 0,
                endRow: Math.max(0, rows - 1),
                rowCount: rows,
                startCol: 0,
                endCol: Math.max(0, cols - 1),
                colCount: cols
            };
        }
        let minRow = Infinity;
        let maxRow = -1;
        let minCol = Infinity;
        let maxCol = -1;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const hasStudents = this._getCellStudentIds(r, c).length > 0;
                const special = this._getCellSpecial(r, c);
                if (hasStudents || special?.type === 'aesh') {
                    if (r < minRow) minRow = r;
                    if (r > maxRow) maxRow = r;
                    if (c < minCol) minCol = c;
                    if (c > maxCol) maxCol = c;
                }
            }
        }
        if (maxRow < 0 || maxCol < 0) {
            return {
                startRow: 0,
                endRow: Math.max(0, rows - 1),
                rowCount: rows,
                startCol: 0,
                endCol: Math.max(0, cols - 1),
                colCount: cols
            };
        }
        return {
            startRow: minRow,
            endRow: maxRow,
            rowCount: maxRow - minRow + 1,
            startCol: minCol,
            endCol: maxCol,
            colCount: maxCol - minCol + 1
        };
    },

    _getEffectiveRowCount(rows = this._getRows(), cols = this._getCols()) {
        return this._getEffectiveGridBounds(rows, cols).rowCount;
    },

    _getEffectiveColCount(rows = this._getRows(), cols = this._getCols()) {
        return this._getEffectiveGridBounds(rows, cols).colCount;
    },

    _renderGrid() {
        const container = document.getElementById('scGridContainer');
        if (!container) return;

        const rows = this._getRows();
        const cols = this._getCols();
        this._studentMap = new Map(this._students.map(s => [s.id, s]));
        const {
            startRow,
            endRow,
            rowCount: effectiveRows,
            startCol,
            endCol,
            colCount: effectiveCols
        } = this._getEffectiveGridBounds(rows, cols);

        container.dataset.gridBounds = `${startRow},${endRow},${startCol},${endCol}`;
        container.style.gridTemplateColumns = `repeat(${effectiveCols}, var(--sc-cell-w, 88px))`;
        container.style.gridTemplateRows = `repeat(${effectiveRows}, var(--sc-cell-h, 96px))`;
        container.innerHTML = '';

        const isStudent = this._isStudentOrientation();
        for (let displayR = 0; displayR < effectiveRows; displayR++) {
            for (let displayC = 0; displayC < effectiveCols; displayC++) {
                const r = startRow + (isStudent ? (effectiveRows - 1 - displayR) : displayR);
                const c = startCol + (isStudent ? (effectiveCols - 1 - displayC) : displayC);
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
            const badgeInfo = this._getStudentStatusBadgeInfo(student);

            cell.classList.add('occupied');
            if (isDeparted) cell.classList.add('sc-cell-departed');
            if (badgeInfo?.cellClass && badgeInfo.cellClass !== 'sc-cell-departed') {
                cell.classList.add(badgeInfo.cellClass);
            }
            if (badgeInfo) cell.classList.add('has-status-badge');
            if (isPinned) cell.classList.add('pinned');
            cell.draggable = this._isNativeDraggableAllowed() && !isPinned;

            const classInfo = this._getStudentContextualClassInfo(student);
            const tooltipText = this._getStudentTooltipText(student, undefined, classInfo);

            cell.setAttribute('data-tooltip', tooltipText);
            if (!this._isLocked) {
                cell.setAttribute('data-tooltip-anchor', '.student-avatar');
            }

            const statusBadgeHTML = badgeInfo
                ? `<span class="sc-cell-status-badge ${badgeInfo.className}" aria-label="${Utils.escapeHtml(badgeInfo.label)}">${Utils.escapeHtml(badgeInfo.label)}</span>`
                : '';
            const groupBadgeHTML = (classInfo?.isVirtual && classInfo.shortLabel)
                ? `<span class="sc-stacked-group-tag" aria-label="${Utils.escapeHtml(classInfo.tooltipLabel)}">${Utils.escapeHtml(classInfo.shortLabel)}</span>`
                : '';
            const nameInfo = this._getStudentCellNameInfo(student);

            cell.innerHTML = `
                <div class="sc-cell-avatar-wrap">
                    ${StudentPhotoManager.getAvatarHTML(student, 'sm')}
                    ${statusBadgeHTML}
                </div>
                <span class="sc-cell-name${nameInfo.modifierClass}${groupBadgeHTML ? ' has-group-tag' : ''}">${groupBadgeHTML ? `<span class="sc-cell-name-text${nameInfo.modifierClass}">${nameInfo.html}</span>${groupBadgeHTML}` : nameInfo.html}</span>
                ${stationBadgeHTML}
                <button class="sc-cell-remove" data-result-id="${student.id}" aria-label="Retirer du plan" data-tooltip="Retirer du plan">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
                <button class="sc-cell-pin" data-result-id="${student.id}" aria-label="${isPinned ? 'Détacher' : 'Fixer'}" data-tooltip="${isPinned ? 'Détacher' : 'Fixer'}">
                    <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon>
                </button>
                ${this._getEvolutionDotHTML(student)}
            `;

            cell.addEventListener('click', (e) => {
                this._handleOccupiedCellClick(e, cell, row, col, students, studentIds);
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
            const membersMeta = students.map(s => {
                const isDeparted = this._isStudentDeparted(s);
                const classInfo = this._getStudentContextualClassInfo(s);
                const tooltip = this._getStudentTooltipText(s, undefined, classInfo);
                return { student: s, isDeparted, classInfo, tooltip };
            });
            const allDeparted = membersMeta.every(m => m.isDeparted);
            cell.classList.add('occupied', 'sc-cell-stacked');
            if (allDeparted) cell.classList.add('sc-cell-departed');
            if (isPinned) cell.classList.add('pinned');
            const canExtractMember = this._isNativeDraggableAllowed() && !isPinned;
            cell.draggable = canExtractMember;
            cell.dataset.resultId = students[0].id;
            cell.dataset.groupSize = String(students.length);
            const avatarsHtml = membersMeta.map(({ student: s, isDeparted: isMemberDeparted, tooltip }, idx) => {
                const memberBadge = this._getStudentStatusBadgeInfo(s);
                const memberDotHtml = memberBadge
                    ? `<span class="sc-cell-status-badge ${memberBadge.className}" aria-label="${Utils.escapeHtml(memberBadge.label)}">${Utils.escapeHtml(memberBadge.label)}</span>`
                    : '';
                return `
                <div class="sc-stacked-avatar${isMemberDeparted ? ' sc-member-departed' : ''}" style="--stack-index: ${idx}; z-index: ${students.length - idx};" data-result-id="${s.id}" draggable="${canExtractMember}" data-tooltip="${Utils.escapeHtml(tooltip)}">
                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                    ${memberDotHtml}
                </div>
            `;
            }).join('');

            const namesHtml = membersMeta.map(({ student: s, isDeparted: isMemberDeparted, classInfo: memberClassInfo, tooltip }) => {
                const memberNameInfo = this._getStudentCellNameInfo(s);
                const memberGroupTagHtml = (memberClassInfo?.isVirtual && memberClassInfo.shortLabel)
                    ? `<span class="sc-stacked-group-tag" aria-label="${Utils.escapeHtml(memberClassInfo.tooltipLabel)}">${Utils.escapeHtml(memberClassInfo.shortLabel)}</span>`
                    : '';
                const memberTooltipAttr = ` data-tooltip="${Utils.escapeHtml(tooltip)}" data-tooltip-anchor=".sc-stacked-avatar[data-result-id='${Utils.escapeHtml(String(s.id))}']"`;
                return `
                <span class="sc-stacked-member sc-stacked-name${isMemberDeparted ? ' sc-member-departed' : ''}${memberNameInfo.modifierClass}" data-result-id="${s.id}" draggable="${canExtractMember}"${memberTooltipAttr}>
                    <span class="sc-stacked-name-text${memberNameInfo.modifierClass}">${memberNameInfo.html}</span>
                    ${memberGroupTagHtml}
                    <button type="button" class="sc-stacked-member-remove" data-member-id="${s.id}" aria-label="Retirer ${Utils.escapeHtml(s.prenom || s.nom)} du groupe">
                        <iconify-icon icon="ph:x-bold"></iconify-icon>
                    </button>
                </span>
            `;
            }).join('');

            cell.innerHTML = `
                <div class="sc-stacked-avatar-cluster">
                    ${avatarsHtml}
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
                this._handleOccupiedCellClick(e, cell, row, col, students, studentIds);
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
                    this._placeSelectedAt(row, col);
                } else if (this._selectedChipIds.length === 0) {
                    if (this._isMobileView()) {
                        this._openEmptyCellSheet(row, col, special);
                    }
                }
            });
        }

        cell.addEventListener('dragover', (e) => {
            if (!this._isValidDropTarget(row, col)) {
                if (this._hoveredDragCell && this._hoveredDragCell !== cell) {
                    this._clearGridDragHover();
                }
                return;
            }
            
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            if (this._hoveredDragCell === cell && cell.classList.contains('drag-over')) return;
            this._applyGridDragHover(cell, row, col);
        });

        cell.addEventListener('dragleave', (e) => {
            if (e.relatedTarget && cell.contains(e.relatedTarget)) return;
            if (this._hoveredDragCell === cell) {
                this._clearGridDragHover();
            } else {
                cell.classList.remove('drag-over', 'drag-over-join', 'drag-over-full');
            }
        });

        cell.addEventListener('drop', (e) => {
            if (this._isLocked) return;
            e.preventDefault();
            this._clearGridDragHover();
            this._handleDrop(row, col);
        });

        return cell;
    },

    _handleOccupiedCellClick(e, cell, row, col, students, studentIds) {
        if (this._wasRecentTouchDrag() || e.target.closest('.sc-cell-remove, .sc-cell-pin, .sc-stacked-member-remove')) return;
        const currentlyPinned = cell.classList.contains('pinned');
        if (this._isLocked) {
            const targetStudentEl = students.length > 1 ? e.target.closest('[data-result-id]') : null;
            const targetId = targetStudentEl?.dataset?.resultId || students[0].id;
            FocusPanelManager.open(targetId);
            return;
        }

        if (!currentlyPinned && (e.shiftKey || e.ctrlKey || e.metaKey)) {
            if (e.shiftKey && this._lastSelectedGridPos) {
                this._selectGridRange(this._lastSelectedGridPos.row, this._lastSelectedGridPos.col, row, col);
            } else {
                this._toggleCellSelection(row, col);
            }
            this._lastSelectedGridPos = { row, col };
            return;
        }

        const isThisCellSelected = studentIds.some(id => this._selectedChipIds.includes(id));
        const selectedGridCells = this._getSelectedGridCells();

        if (this._selectedChipIds.length > 0 && !isThisCellSelected) {
            const isActivity = this._isActivityMode();
            if (isActivity && !currentlyPinned && !this._lastSelectedGridPos) {
                if (students.length + this._selectedChipIds.length <= MAX_ACTIVITY_GROUP_SIZE) {
                    this._joinStudentsToCell(row, col, this._selectedChipIds);
                    this._clearSelection();
                } else {
                    this._notifyGroupFull(row, col);
                }
            } else if (selectedGridCells.length === 1) {
                const srcPos = selectedGridCells[0];
                if (srcPos.row !== row || srcPos.col !== col) {
                    this._swapGridPositions(srcPos.row, srcPos.col, row, col);
                }
                this._clearSelection();
            } else if (this._selectedChipIds.length === 1) {
                const selectedId = this._selectedChipIds[0];
                const srcPos = this._findStudentGridPos(selectedId);
                if (srcPos) {
                    this._swapGridPositions(srcPos.row, srcPos.col, row, col);
                } else {
                    this._replaceOccupantWithUnplaced(row, col, selectedId);
                }
                this._clearSelection();
            } else if (!currentlyPinned) {
                this._selectedChipIds = [];
                this._toggleCellSelection(row, col);
                this._lastSelectedGridPos = { row, col };
            } else {
                this._clearSelection();
            }
        } else if (isThisCellSelected) {
            if (selectedGridCells.length <= 1 && this._selectedChipIds.every(id => studentIds.includes(id))) {
                this._clearSelection();
            } else if (!currentlyPinned) {
                this._selectedChipIds = [...studentIds];
                this._lastSelectedGridPos = { row, col };
                this._applyChipSelectionUI();
                this._updateSelectionAttribute();
            }
        } else if (this._isMobileView() && this._selectedChipIds.length === 0) {
            this._openOccupiedCellSheet(row, col, students[0], students);
        } else if (!currentlyPinned) {
            this._toggleCellSelection(row, col);
            this._lastSelectedGridPos = { row, col };
        } else if (currentlyPinned && this._isMobileView()) {
            this._openOccupiedCellSheet(row, col, students[0], students);
        }
    },

    _normalizeFirstNameKey(prenom) {
        return (prenom || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    },

    _hasFirstNameHomonym(student) {
        if (!student || !Array.isArray(this._students)) return false;
        const targetFirst = this._normalizeFirstNameKey(student.prenom);
        if (!targetFirst) return false;
        return this._students.some(s => s && s.id !== student.id && this._normalizeFirstNameKey(s.prenom) === targetFirst);
    },

    _getStudentCellNameInfo(student) {
        const hasHomonym = this._hasFirstNameHomonym(student);
        const labelOpts = { showInitial: hasHomonym, forceInitial: hasHomonym };
        const html = Utils.formatStudentInitialLabel(student?.nom, student?.prenom, true, labelOpts);
        const plain = Utils.formatStudentInitialLabel(student?.nom, student?.prenom, false, labelOpts);
        const isLong = plain.length >= 11;
        const isExtraLong = plain.length >= 14;
        const modifierClass = `${isLong ? ' is-long-name' : ''}${isExtraLong ? ' is-extra-long-name' : ''}`;
        return { html, plain, isLong, isExtraLong, modifierClass };
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
        return Utils.isStudentDeparted(studentResult, activePeriod);
    },

    _isStudentNew(studentResult, activePeriod = appState.currentPeriod || 'T1') {
        return Utils.isStudentNew(studentResult, activePeriod);
    },

    _getStudentDeviceStatuses(studentResult) {
        if (!studentResult) return [];
        const statuses = studentResult.studentData?.statuses || studentResult.statuses || [];
        if (!Array.isArray(statuses) || statuses.length === 0) return [];
        const found = [];
        for (const raw of statuses) {
            const meta = resolveStudentStatus(raw);
            const canonical = meta?.isDevice ? meta.id : null;
            if (canonical && !found.includes(canonical)) {
                found.push(canonical);
            }
        }
        return found;
    },

    _isStudentDevice(studentResult) {
        return this._getStudentDeviceStatuses(studentResult).length > 0;
    },

    _isStudentDelegate(studentResult) {
        if (!studentResult) return false;
        const statuses = studentResult.studentData?.statuses || studentResult.statuses || [];
        if (!Array.isArray(statuses) || statuses.length === 0) return false;
        return statuses.some(s => {
            return resolveStudentStatus(s)?.id === STUDENT_STATUS_REGISTRY.DELEGUE.id;
        });
    },

    _getStudentStatusLabels(studentResult, activePeriod = appState.currentPeriod || 'T1') {
        if (!studentResult) return [];
        const labels = [];
        if (this._isStudentDeparted(studentResult, activePeriod)) {
            labels.push('Départ');
        } else if (this._isStudentNew(studentResult, activePeriod)) {
            labels.push('Nouveau');
        }
        for (const dev of this._getStudentDeviceStatuses(studentResult)) {
            labels.push(dev);
        }
        if (this._isStudentDelegate(studentResult)) {
            labels.push('Délégué');
        }
        return labels;
    },

    _getStudentContextualClassInfo(studentResult) {
        if (!studentResult) return null;
        const currentClass = this._getCurrentClass();
        const isVirtual = this._isVirtualClass(currentClass);
        const currentClassName = currentClass?.name || Utils.getCurrentClassName();
        const rawOrigin = Utils.getOriginClass(studentResult, currentClassName);
        if (!rawOrigin) return null;
        const displayLabel = Utils.formatClassDisplayName(rawOrigin);
        if (!displayLabel) return null;
        const isGroup = isVirtual || Utils.isGroupClassName(rawOrigin) || Utils.isGroupClassName(displayLabel);
        const shortLabel = isGroup ? Utils.formatShortGroupLabel(rawOrigin) : displayLabel;
        return {
            raw: rawOrigin,
            displayLabel,
            shortLabel,
            isGroup,
            isVirtual,
            tooltipLabel: isGroup ? `Groupe ${displayLabel}` : `Classe ${displayLabel}`
        };
    },

    _getStudentTooltipText(studentResult, activePeriod = appState.currentPeriod || 'T1', classInfo = undefined) {
        if (!studentResult) return '';
        const baseName = Utils.formatStudentFirstLastName(studentResult.nom, studentResult.prenom);
        const resolvedClassInfo = classInfo !== undefined ? classInfo : this._getStudentContextualClassInfo(studentResult);
        const labels = [];
        if (resolvedClassInfo?.tooltipLabel) {
            labels.push(resolvedClassInfo.tooltipLabel);
        }
        labels.push(...this._getStudentStatusLabels(studentResult, activePeriod));
        return labels.length > 0 ? `${baseName} • ${labels.join(' • ')}` : baseName;
    },

    _getStudentStatusBadgeInfo(studentResult, activePeriod = appState.currentPeriod || 'T1') {
        if (!studentResult) return null;
        const dotsConfig = appState.seatingStatusDots || { movements: true, devices: false, delegates: false };

        if (dotsConfig.movements !== false) {
            if (this._isStudentDeparted(studentResult, activePeriod)) {
                return { type: 'depart', className: 'sc-badge-depart', cellClass: 'sc-cell-departed', label: 'Départ' };
            }
            if (this._isStudentNew(studentResult, activePeriod)) {
                return { type: 'new', className: 'sc-badge-new', cellClass: 'sc-cell-new', label: 'Nouveau' };
            }
        }

        if (dotsConfig.devices) {
            const devices = this._getStudentDeviceStatuses(studentResult);
            if (devices.length > 0) {
                if (devices.includes('ULIS')) {
                    return { type: 'ulis', className: 'sc-badge-ulis', cellClass: 'sc-cell-ulis', label: devices.join(' • ') };
                }
                return { type: 'device', className: 'sc-badge-device', cellClass: 'sc-cell-device', label: devices.join(' • ') };
            }
        }

        if (dotsConfig.delegates && this._isStudentDelegate(studentResult)) {
            return { type: 'delegate', className: 'sc-badge-delegate', cellClass: 'sc-cell-delegate', label: 'Délégué' };
        }

        return null;
    }
};
