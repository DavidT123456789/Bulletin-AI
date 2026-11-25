/**
 * @fileoverview Seating Chart — Mobile Action Sheets, Form-Factor Continuum & Onboarding Hints
 * @module managers/seating/SeatingMobileSheet
 */

import { appState } from '../../state/State.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { UI } from '../UIManager.js';
import { Utils } from '../../utils/Utils.js';
import { ClassManager } from '../ClassManager.js';
import { ClassUIManager } from '../ClassUIManager.js';
import { HistoryManager } from '../HistoryManager.js';
import { StudentDataManager } from '../StudentDataManager.js';
import { ListSelectionManager } from '../list/ListSelectionManager.js';
import { attachSheetPullToDismiss } from '../../utils/TouchGestures.js';
import {
    MAX_ROWS,
    MAX_ACTIVITY_GROUP_SIZE
} from './SeatingState.js';

export const SeatingMobileSheet = {
    // ========================================================================
    // MOBILE ACTION SHEETS & TAP-TO-PLACE (iOS / Material 2026 Gold Standard)
    // ========================================================================

    _isCompactLayout() {
        return Boolean(window.innerWidth <= 768);
    },

    _isMobileView() {
        return Boolean(this._isCompactLayout() || window.matchMedia?.('(pointer: coarse)')?.matches);
    },

    _handleFormFactorCheck() {
        const w = window.innerWidth || 0;
        const h = window.innerHeight || 0;
        const isCompactNow = this._isCompactLayout();

        if (typeof this._wasCompactLayout !== 'boolean') {
            this._wasCompactLayout = isCompactNow;
            this._lastViewportW = w;
            this._lastViewportH = h;
            return false;
        }

        const prevW = this._lastViewportW || w;
        const prevH = this._lastViewportH || h;
        const crossedBreakpoint = isCompactNow !== this._wasCompactLayout;

        const minW = Math.min(w, prevW);
        const widthJumpRatio = minW > 0 ? Math.abs(w - prevW) / minW : 0;
        const prevArea = prevW * prevH;
        const currArea = w * h;
        const minArea = Math.min(currArea, prevArea);
        const areaJumpRatio = minArea > 0 ? Math.abs(currArea - prevArea) / minArea : 0;
        const isFoldableAreaJump = minW <= 480 && widthJumpRatio >= 0.45 && areaJumpRatio >= 0.35;

        if (!crossedBreakpoint && !isFoldableAreaJump) {
            if (w > 0) this._lastViewportW = w;
            if (h > 0) this._lastViewportH = h;
            return false;
        }

        const isUnfolding = crossedBreakpoint
            ? (this._wasCompactLayout && !isCompactNow)
            : (w > prevW);

        this._wasCompactLayout = isCompactNow;
        if (w > 0) this._lastViewportW = w;
        if (h > 0) this._lastViewportH = h;

        clearTimeout(this._resizeDebounceTimer);
        this._resizeDebounceTimer = null;

        if (this._isActive) {
            this._cleanupModeCarousel();
            this._closeConfigPopover();
            this._closePlacementPopover();
            this._closeStatusDotsPopover?.();
            this._closeContextMenu?.();
            this._closeMobileSheet(true);
            TooltipsUI?.hideAll?.();
            this._applySmartFit(true);
            this._updatePlanModeSwitchUI?.();
        }

        const toggleWrapper = document.getElementById('viewToggle');
        if (toggleWrapper && window.UI && typeof window.UI.updateGlider === 'function') {
            window.UI.updateGlider(toggleWrapper, true);
        }

        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            this._pendingFoldDirection = isUnfolding;
            this._pendingFoldTimestamp = Date.now();
            return true;
        }

        this._pendingFoldDirection = null;
        this._animateFoldContinuum(isUnfolding);
        return true;
    },
    _getProfileSheetActionHTML() {
        return `
            <div class="sc-sheet-actions">
                <button class="sc-sheet-action-btn" data-action="profile" type="button">
                    <span class="sc-sheet-action-icon" aria-hidden="true">
                        <iconify-icon icon="solar:user-id-linear"></iconify-icon>
                    </span>
                    <span class="sc-sheet-action-text">
                        <span class="sc-sheet-action-label">Voir la fiche</span>
                    </span>
                    <span class="sc-sheet-action-chevron" aria-hidden="true">
                        <iconify-icon icon="solar:alt-arrow-right-linear"></iconify-icon>
                    </span>
                </button>
            </div>
        `;
    },

    _getStudentSheetActionsHTML(student) {
        if (!student) return '';
        const deleteMeta = StudentDataManager.getDeleteActionMeta(student.id);
        let deleteHint = 'Supprime définitivement cette fiche';
        if (!deleteMeta.hasPermanentDeletion) {
            const others = deleteMeta.otherEnrollments || [];
            if (others.length === 1 && others[0]?.displayName) {
                deleteHint = `Conserve sa fiche dans ${Utils.escapeHtml(others[0].displayName)}`;
            } else if (others.length > 1) {
                deleteHint = `Conserve ses fiches (${others.length} autres classes)`;
            } else {
                deleteHint = 'Conserve sa fiche dans ses autres classes';
            }
        }

        return `
            <div class="sc-sheet-section-title">Élève</div>
            <div class="sc-sheet-actions">
                <button class="sc-sheet-action-btn" data-action="move-student" type="button">
                    <span class="sc-sheet-action-icon" aria-hidden="true">
                        <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon>
                    </span>
                    <span class="sc-sheet-action-text">
                        <span class="sc-sheet-action-label">Copier / Déplacer…</span>
                    </span>
                    <span class="sc-sheet-action-chevron" aria-hidden="true">
                        <iconify-icon icon="solar:alt-arrow-right-linear"></iconify-icon>
                    </span>
                </button>
                <button class="sc-sheet-action-btn" data-action="reset-student" type="button">
                    <span class="sc-sheet-action-icon" aria-hidden="true">
                        <iconify-icon icon="solar:eraser-linear"></iconify-icon>
                    </span>
                    <span class="sc-sheet-action-text">
                        <span class="sc-sheet-action-label">Effacer le contenu…</span>
                    </span>
                    <span class="sc-sheet-action-chevron" aria-hidden="true">
                        <iconify-icon icon="solar:alt-arrow-right-linear"></iconify-icon>
                    </span>
                </button>
                <button class="sc-sheet-action-btn sc-action-danger" data-action="delete-student" type="button">
                    <span class="sc-sheet-action-icon sc-icon-danger" aria-hidden="true">
                        <iconify-icon icon="${deleteMeta.menuIcon}"></iconify-icon>
                    </span>
                    <span class="sc-sheet-action-text">
                        <span class="sc-sheet-action-label">${Utils.escapeHtml(deleteMeta.menuLabel)}</span>
                        <span class="sc-sheet-action-hint">${deleteHint}</span>
                    </span>
                </button>
            </div>
        `;
    },

    _bindStudentSheetActions(sheet, studentId, close) {
        if (!sheet || !studentId) return;
        sheet.querySelector('[data-action="profile"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            FocusPanelManager.open(studentId);
        });
        sheet.querySelector('[data-action="move-student"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            ListSelectionManager.bulkMove([studentId]);
        });
        sheet.querySelector('[data-action="reset-student"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            ListSelectionManager.bulkReset([studentId]);
        });
        sheet.querySelector('[data-action="delete-student"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            ListSelectionManager.confirmAndDeleteStudents([studentId]);
        });
    },

    _bindSheetDismissGesture(sheet, backdrop) {
        sheet.querySelectorAll('.sc-sheet-content, .sc-sheet-picker-list').forEach(el => {
            FocusPanelManager.bindScrollAffordances?.(el);
        });
        return attachSheetPullToDismiss(sheet, {
            backdropEl: backdrop,
            scrollContainer: '.sc-sheet-content',
            onDismiss: () => this._closeMobileSheet(true)
        });
    },

    _openOccupiedCellSheet(row, col, student, cellStudents = null) {
        this._closeContextMenu?.();
        const students = Array.isArray(cellStudents) && cellStudents.length > 0
            ? cellStudents
            : (this._getCellStudentIds(row, col).map(id => this._studentMap?.get(id)).filter(Boolean));
        const primary = students[0] || student;
        if (!primary) return;

        this._closeMobileSheet(true, { silentHistory: true });
        if (!HistoryManager.isOpen('scMobileSheet') || HistoryManager.getStack().at(-1)?.id === 'scMobileSheet') {
            HistoryManager.pushState('scMobileSheet', () => this._closeMobileSheet(true, { silentHistory: true }));
        }

        const isMulti = students.length > 1;
        const posKey = this._getActivePositionKey();
        const isPinned = students.some(s => !!s?.[posKey]?.pinned);
        const isActivity = this._isActivityMode();
        const stationNum = isActivity ? this._getStationNumber(row, col) : null;
        const unplaced = (isActivity && students.length < MAX_ACTIVITY_GROUP_SIZE)
            ? [...this._getUnplacedStudents()].sort((a, b) =>
                `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' })
            )
            : [];

        const backdrop = document.createElement('div');
        backdrop.className = 'sc-mobile-sheet-backdrop';
        backdrop.id = 'scMobileSheetBackdrop';

        const sheet = document.createElement('div');
        sheet.className = 'sc-mobile-sheet';
        sheet.id = 'scMobileSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const locationLabel = stationNum
            ? `Poste #${stationNum} • Rangée ${row + 1}, Col ${col + 1}`
            : `Rangée ${row + 1} • Table ${col + 1}`;

        const headerTitle = isMulti
            ? (students.length === 2 ? `Binôme (${students.length} élèves)` : `Groupe (${students.length} élèves)`)
            : Utils.escapeHtml(`${primary.prenom || ''} ${primary.nom || ''}`.trim());

        const currentClassName = this._getCurrentClass()?.name || Utils.getCurrentClassName();
        const primaryClassInfo = !isMulti ? this._getStudentContextualClassInfo(primary) : null;
        const primaryStatuses = !isMulti
            ? [...(primaryClassInfo?.tooltipLabel ? [primaryClassInfo.tooltipLabel] : []), ...this._getStudentStatusLabels(primary)]
            : [];
        const primaryStatusSuffix = primaryStatuses.length > 0
            ? ` • ${Utils.escapeHtml(primaryStatuses.join(' • '))}`
            : '';

        const headerAvatarHTML = isMulti
            ? `<div class="sc-sheet-desk-icon"><iconify-icon icon="solar:users-group-two-rounded-linear"></iconify-icon></div>`
            : StudentPhotoManager.getAvatarHTML(primary, 'md');

        const membersSectionHTML = isMulti ? `
            <div class="sc-sheet-section-title">Membres du poste (${students.length}/${MAX_ACTIVITY_GROUP_SIZE})</div>
            <div class="sc-sheet-picker-list sc-sheet-members-list">
                ${students.map(s => {
                    const escapedId = Utils.escapeHtml(String(s.id));
                    const memberStatusBadge = this._getStudentStatusLabels(s).map(label => {
                        const badgeClass = label === 'Départ'
                            ? 'sc-chip-badge-depart'
                            : (label === 'Nouveau'
                                ? 'sc-chip-badge-new'
                                : (label === 'ULIS' || label === 'AESH'
                                    ? 'sc-chip-badge-ulis'
                                    : (label === 'Délégué' ? 'sc-chip-badge-delegate' : 'sc-chip-badge-device')));
                        return `<span class="sc-chip-badge ${badgeClass}">${Utils.escapeHtml(label)}</span>`;
                    }).join('');
                    return `
                    <div class="sc-sheet-picker-item sc-sheet-member-row" data-member-id="${escapedId}">
                        <button class="sc-sheet-picker-user sc-sheet-member-profile-btn" data-profile-id="${escapedId}" type="button">
                            ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                            <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true, '', Utils.getStudentOriginInfo(s, currentClassName))}</span>
                            ${memberStatusBadge}
                        </button>
                        <div class="sc-sheet-member-actions">
                            <button class="sc-sheet-member-remove-btn" data-remove-member-id="${escapedId}" type="button" aria-label="Retirer ${Utils.escapeHtml(s.prenom || s.nom)} du poste">
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon> Retirer
                            </button>
                            <button class="sc-sheet-member-more-btn" data-member-actions-id="${escapedId}" type="button" aria-label="Actions pour ${Utils.escapeHtml(s.prenom || s.nom)}">
                                <iconify-icon icon="solar:menu-dots-bold"></iconify-icon>
                            </button>
                        </div>
                    </div>
                `;
                }).join('')}
            </div>
        ` : '';

        const addTeammateSectionHTML = (isActivity && students.length < MAX_ACTIVITY_GROUP_SIZE && unplaced.length > 0) ? `
            <div class="sc-sheet-section-title">Associer un élève sur ce poste (${students.length}/${MAX_ACTIVITY_GROUP_SIZE})</div>
            <div class="sc-sheet-picker-list sc-sheet-compact-picker" id="scSheetJoinList">
                ${unplaced.map(s => `
                    <button class="sc-sheet-picker-item" data-join-student-id="${Utils.escapeHtml(String(s.id))}" type="button">
                        <div class="sc-sheet-picker-user">
                            ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                            <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true, '', Utils.getStudentOriginInfo(s, currentClassName))}</span>
                        </div>
                        <span class="sc-sheet-picker-badge"><iconify-icon icon="solar:add-circle-linear"></iconify-icon> Associer</span>
                    </button>
                `).join('')}
            </div>
        ` : '';

        sheet.innerHTML = `
            <div class="sc-sheet-handle"></div>
            <div class="sc-sheet-header">
                <div class="sc-sheet-entity-info">
                    ${headerAvatarHTML}
                    <div class="sc-sheet-entity-text">
                        <h3 class="sc-sheet-entity-name">${headerTitle}</h3>
                        <p class="sc-sheet-entity-meta"><span>${locationLabel}${primaryStatusSuffix}</span>${isPinned ? '<span aria-hidden="true">•</span><span class="sc-sheet-meta-pin"><iconify-icon icon="solar:pin-bold"></iconify-icon> Place fixée</span>' : ''}</p>
                    </div>
                </div>
                <button class="sc-sheet-close-btn" id="scSheetCloseBtn" aria-label="Fermer" type="button">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="sc-sheet-content">
                ${!isMulti ? this._getProfileSheetActionHTML() : ''}
                ${membersSectionHTML}
                ${addTeammateSectionHTML}
                <div class="sc-sheet-section-title">Plan</div>
                <div class="sc-sheet-actions">
                    <button class="sc-sheet-action-btn" data-action="move" type="button">
                        <span class="sc-sheet-action-icon" aria-hidden="true">
                            <iconify-icon icon="solar:move-linear"></iconify-icon>
                        </span>
                        <span class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isMulti ? 'Déplacer ou permuter le groupe' : 'Déplacer ou permuter'}</span>
                            <span class="sc-sheet-action-hint">Touchez ensuite le poste de destination</span>
                        </span>
                    </button>
                    <button class="sc-sheet-action-btn" data-action="pin" type="button">
                        <span class="sc-sheet-action-icon${isPinned ? ' sc-icon-warning' : ''}" aria-hidden="true">
                            <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon>
                        </span>
                        <span class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isPinned ? (isMulti ? 'Détacher le poste' : 'Détacher') : (isMulti ? 'Épingler le poste' : 'Épingler')}</span>
                        </span>
                    </button>
                    <button class="sc-sheet-action-btn" data-action="remove" type="button">
                        <span class="sc-sheet-action-icon" aria-hidden="true">
                            <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                        </span>
                        <span class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isMulti ? 'Libérer le poste' : 'Retirer du plan'}</span>
                        </span>
                    </button>
                </div>
                ${!isMulti ? this._getStudentSheetActionsHTML(primary) : ''}
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        const gesture = this._bindSheetDismissGesture(sheet, backdrop);
        this._activeMobileSheet = { backdrop, sheet, gesture };

        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            sheet.classList.add('active');
        });

        const close = () => this._closeMobileSheet();
        backdrop.addEventListener('click', close);
        sheet.querySelector('#scSheetCloseBtn')?.addEventListener('click', close);

        sheet.querySelectorAll('[data-profile-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pid = btn.dataset.profileId;
                close();
                if (pid) FocusPanelManager.open(pid);
            });
        });

        sheet.querySelectorAll('[data-remove-member-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const mid = btn.dataset.removeMemberId;
                close();
                if (mid) this._removeStudentFromCell(row, col, mid);
            });
        });

        sheet.querySelectorAll('[data-member-actions-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const mid = btn.dataset.memberActionsId;
                const member = students.find(s => String(s.id) === String(mid));
                if (member) {
                    this._openMemberActionsSheet(row, col, member, students);
                }
            });
        });

        sheet.querySelectorAll('[data-join-student-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const jid = btn.dataset.joinStudentId;
                close();
                if (jid) this._joinStudentsToCell(row, col, [jid]);
            });
        });

        sheet.querySelector('[data-action="move"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeMobileSheet(true, { replaceNext: true });
            this._clearSelection({ silentHistory: true });
            this._toggleCellSelection(row, col);
            this._lastSelectedGridPos = { row, col };
            UI?.showNotification?.(`Touchez un poste libre pour déplacer, ou occupé pour permuter.`, 'info');
        });

        sheet.querySelector('[data-action="pin"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            this._toggleCellPin(row, col);
        });

        sheet.querySelector('[data-action="remove"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            this._removeFromCell(row, col);
        });

        if (!isMulti) {
            this._bindStudentSheetActions(sheet, primary.id, close);
        }
    },

    _openMemberActionsSheet(row, col, member, allCellStudents = []) {
        if (!member) return;
        this._closeContextMenu?.();
        this._closeMobileSheet(true, { silentHistory: true });
        if (!HistoryManager.isOpen('scMobileSheet') || HistoryManager.getStack().at(-1)?.id === 'scMobileSheet') {
            HistoryManager.pushState('scMobileSheet', () => {
                if (allCellStudents.length > 1) {
                    this._openOccupiedCellSheet(row, col, allCellStudents[0] || member, allCellStudents);
                } else {
                    this._closeMobileSheet(true, { silentHistory: true });
                }
            });
        }

        const stationNum = this._isActivityMode() ? this._getStationNumber(row, col) : null;
        const locationLabel = stationNum
            ? `Poste #${stationNum} • Rangée ${row + 1}, Col ${col + 1}`
            : `Rangée ${row + 1} • Table ${col + 1}`;
        const classInfo = this._getStudentContextualClassInfo(member);
        const statuses = [...(classInfo?.tooltipLabel ? [classInfo.tooltipLabel] : []), ...this._getStudentStatusLabels(member)];
        const statusSuffix = statuses.length > 0 ? ` • ${Utils.escapeHtml(statuses.join(' • '))}` : '';

        const backdrop = document.createElement('div');
        backdrop.className = 'sc-mobile-sheet-backdrop';
        backdrop.id = 'scMobileSheetBackdrop';

        const sheet = document.createElement('div');
        sheet.className = 'sc-mobile-sheet';
        sheet.id = 'scMobileSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        sheet.innerHTML = `
            <div class="sc-sheet-handle"></div>
            <div class="sc-sheet-header">
                <button class="sc-sheet-back-btn" id="scSheetBackBtn" aria-label="Retour au poste" type="button">
                    <iconify-icon icon="ph:arrow-left-bold"></iconify-icon>
                </button>
                <div class="sc-sheet-entity-info">
                    ${StudentPhotoManager.getAvatarHTML(member, 'md')}
                    <div class="sc-sheet-entity-text">
                        <h3 class="sc-sheet-entity-name">${Utils.escapeHtml(`${member.prenom || ''} ${member.nom || ''}`.trim())}</h3>
                        <p class="sc-sheet-entity-meta">${locationLabel}${statusSuffix}</p>
                    </div>
                </div>
                <button class="sc-sheet-close-btn" id="scSheetCloseBtn" aria-label="Fermer" type="button">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="sc-sheet-content">
                ${this._getProfileSheetActionHTML()}
                ${!this._isLocked ? `
                    <div class="sc-sheet-section-title">Plan</div>
                    <div class="sc-sheet-actions">
                        <button class="sc-sheet-action-btn" data-action="remove-member" type="button">
                            <span class="sc-sheet-action-icon" aria-hidden="true">
                                <iconify-icon icon="solar:logout-3-linear"></iconify-icon>
                            </span>
                            <span class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Retirer du poste</span>
                            </span>
                        </button>
                    </div>
                ` : ''}
                ${this._getStudentSheetActionsHTML(member)}
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        const gesture = this._bindSheetDismissGesture(sheet, backdrop);
        this._activeMobileSheet = { backdrop, sheet, gesture };

        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            sheet.classList.add('active');
        });

        const close = () => this._closeMobileSheet();
        backdrop.addEventListener('click', close);
        sheet.querySelector('#scSheetCloseBtn')?.addEventListener('click', close);
        sheet.querySelector('#scSheetBackBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openOccupiedCellSheet(row, col, allCellStudents[0] || member, allCellStudents);
        });
        sheet.querySelector('[data-action="remove-member"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            this._removeStudentFromCell(row, col, member.id);
        });
        this._bindStudentSheetActions(sheet, member.id, close);
    },

    _openEmptyCellSheet(row, col, special) {
        this._closeContextMenu?.();
        this._closeMobileSheet(true, { silentHistory: true });
        if (!HistoryManager.isOpen('scMobileSheet') || HistoryManager.getStack().at(-1)?.id === 'scMobileSheet') {
            HistoryManager.pushState('scMobileSheet', () => this._closeMobileSheet(true, { silentHistory: true }));
        }
        const unplaced = [...this._getUnplacedStudents()].sort((a, b) =>
            `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr', { sensitivity: 'base' })
        );
        const isClassScope = special?.scope === 'class';
        const backdrop = document.createElement('div');
        backdrop.className = 'sc-mobile-sheet-backdrop';
        backdrop.id = 'scMobileSheetBackdrop';

        const sheet = document.createElement('div');
        sheet.className = 'sc-mobile-sheet';
        sheet.id = 'scMobileSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        const isActivity = this._isActivityMode();
        let statusLabel = isActivity ? 'Poste libre' : 'Place libre';
        let deskIcon = 'solar:chair-linear';
        if (special?.type === 'aisle') {
            statusLabel = 'Allée (Espace vide)';
            deskIcon = 'solar:ghost-linear';
        } else if (special?.type === 'aesh') {
            statusLabel = 'Place réservée AESH';
            deskIcon = 'solar:user-speak-rounded-linear';
        } else if (special?.type === 'blocked') {
            statusLabel = 'Table condamnée';
            deskIcon = 'solar:forbidden-circle-linear';
        }

        const currentClassName = this._getCurrentClass()?.name || Utils.getCurrentClassName();
        const headerEntityName = `Rangée ${row + 1} • ${isActivity ? 'Col' : 'Table'} ${col + 1}`;

        sheet.innerHTML = `
            <div class="sc-sheet-handle"></div>
            <div class="sc-sheet-header">
                <div class="sc-sheet-entity-info">
                    <div class="sc-sheet-desk-icon">
                        <iconify-icon icon="${deskIcon}"></iconify-icon>
                    </div>
                    <div class="sc-sheet-entity-text">
                        <h3 class="sc-sheet-entity-name">${headerEntityName}</h3>
                        <p class="sc-sheet-entity-meta">${statusLabel}</p>
                    </div>
                </div>
                <button class="sc-sheet-close-btn" id="scSheetCloseBtn" aria-label="Fermer" type="button">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="sc-sheet-content">
                ${unplaced.length > 0 && !special ? `
                    <div class="sc-sheet-section-title">Attribuer à un élève non placé (${unplaced.length})</div>
                    <div class="sc-sheet-search-wrap">
                        <input type="text" class="sc-sheet-search" id="scSheetSearchInput" placeholder="Rechercher un élève..." autocomplete="off">
                    </div>
                    <div class="sc-sheet-picker-list" id="scSheetPickerList">
                        ${unplaced.map(s => `
                            <button class="sc-sheet-picker-item" data-student-id="${Utils.escapeHtml(String(s.id))}" type="button">
                                <div class="sc-sheet-picker-user">
                                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                                    <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true, '', Utils.getStudentOriginInfo(s, currentClassName))}</span>
                                </div>
                                <span class="sc-sheet-picker-badge"><iconify-icon icon="solar:add-circle-linear"></iconify-icon> Placer</span>
                            </button>
                        `).join('')}
                        <div class="sc-sheet-picker-empty" id="scSheetPickerEmpty" hidden>Aucun élève trouvé</div>
                    </div>
                ` : (unplaced.length === 0 && !special ? `
                    <div class="sc-sheet-empty-unplaced">
                        <iconify-icon icon="solar:check-circle-bold"></iconify-icon>
                        <span>Tous les élèves sont déjà placés</span>
                    </div>
                ` : '')}
                <div class="sc-sheet-section-title">Configuration de la table</div>
                <div class="sc-sheet-actions">
                    ${!special ? `
                        <button class="sc-sheet-action-btn" data-special-type="aisle" type="button">
                            <span class="sc-sheet-action-icon" aria-hidden="true">
                                <iconify-icon icon="solar:ghost-linear"></iconify-icon>
                            </span>
                            <span class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Transformer en allée</span>
                            </span>
                        </button>
                        <button class="sc-sheet-action-btn" data-special-type="aesh" type="button">
                            <span class="sc-sheet-action-icon" aria-hidden="true">
                                <iconify-icon icon="solar:user-speak-rounded-linear"></iconify-icon>
                            </span>
                            <span class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Place AESH</span>
                            </span>
                        </button>
                        <button class="sc-sheet-action-btn" data-special-type="blocked" type="button">
                            <span class="sc-sheet-action-icon" aria-hidden="true">
                                <iconify-icon icon="solar:forbidden-circle-linear"></iconify-icon>
                            </span>
                            <span class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Condamner la table</span>
                            </span>
                        </button>
                    ` : `
                        <button class="sc-sheet-action-btn" data-special-type="normal" type="button">
                            <span class="sc-sheet-action-icon" aria-hidden="true">
                                <iconify-icon icon="solar:refresh-linear"></iconify-icon>
                            </span>
                            <span class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Rétablir en table normale</span>
                            </span>
                        </button>
                        ${special.type === 'blocked' ? `
                            <button class="sc-sheet-action-btn" data-special-type="toggle-scope" type="button">
                                <span class="sc-sheet-action-icon" aria-hidden="true">
                                    <iconify-icon icon="${isClassScope ? 'solar:buildings-linear' : 'solar:users-group-two-rounded-linear'}"></iconify-icon>
                                </span>
                                <span class="sc-sheet-action-text">
                                    <span class="sc-sheet-action-label">${isClassScope ? 'Appliquer à toute la salle' : 'Restreindre à cette classe'}</span>
                                    <span class="sc-sheet-action-hint">Portée : ${isClassScope ? 'Cette classe uniquement' : 'Toutes les classes'}</span>
                                </span>
                            </button>
                        ` : ''}
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        const gesture = this._bindSheetDismissGesture(sheet, backdrop);
        this._activeMobileSheet = { backdrop, sheet, gesture };

        requestAnimationFrame(() => {
            backdrop.classList.add('active');
            sheet.classList.add('active');
        });

        const close = () => this._closeMobileSheet();
        backdrop.addEventListener('click', close);
        sheet.querySelector('#scSheetCloseBtn')?.addEventListener('click', close);

        // Unplaced student search filter
        const searchInput = sheet.querySelector('#scSheetSearchInput');
        const pickerList = sheet.querySelector('#scSheetPickerList');
        const pickerEmpty = sheet.querySelector('#scSheetPickerEmpty');
        if (searchInput && pickerList) {
            searchInput.addEventListener('input', (e) => {
                const q = (e.target.value || '').trim().toLowerCase();
                let visibleCount = 0;
                pickerList.querySelectorAll('.sc-sheet-picker-item').forEach(item => {
                    const name = item.querySelector('.sc-sheet-picker-name')?.textContent?.toLowerCase() || '';
                    const matches = name.includes(q);
                    item.hidden = !matches;
                    if (matches) visibleCount++;
                });
                if (pickerEmpty) {
                    pickerEmpty.hidden = visibleCount > 0;
                }
                FocusPanelManager.updateScrollAffordances?.(pickerList);
            });
        }

        // Unplaced student placement click
        pickerList?.querySelectorAll('.sc-sheet-picker-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const studentId = item.dataset.studentId;
                if (!studentId) return;
                close();
                this._snapshotGrid();
                this._gridState[row][col] = studentId;
                this._dismissOnboardingHint();
                this._savePositionsToState();
                this._render();
                this._animateCellPlaced(row, col);
            });
        });

        // Special type actions
        sheet.querySelectorAll('[data-special-type]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.dataset.specialType;
                close();
                if (type === 'toggle-scope') {
                    this._toggleBlockedScope(row, col);
                } else {
                    this._setCellSpecialType(row, col, type === 'normal' ? null : type);
                }
            });
        });
    },

    _closeMobileSheet(immediate = false, options = {}) {
        const { silentHistory = false, replaceNext = false } = options;
        if (!silentHistory && HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.handleManualClose('scMobileSheet', { replaceNext });
        }

        this._activeMobileSheet?.gesture?.destroy?.();

        const existingSheets = document.querySelectorAll('.sc-mobile-sheet, .sc-mobile-sheet-backdrop');
        if (immediate) {
            existingSheets.forEach(el => el.remove());
            this._activeMobileSheet = null;
            return;
        }
        if (!this._activeMobileSheet) {
            existingSheets.forEach(el => el.remove());
            return;
        }
        const { backdrop, sheet } = this._activeMobileSheet;
        this._activeMobileSheet = null;
        if (backdrop) backdrop.style.pointerEvents = 'none';
        if (sheet) sheet.style.pointerEvents = 'none';
        backdrop?.classList.remove('active');
        sheet?.classList.remove('active');
        setTimeout(() => {
            backdrop?.remove();
            sheet?.remove();
        }, 300);
    },
    _getEffectiveOnboardingStep() {
        if (this._isVirtualClass()) return 'virtual-empty';
        if (this._isActivityMode()) return 'activity';
        return 'placement';
    },

    _maybeShowOnboardingHint() {
        const isVirtual = this._isVirtualClass();
        if (this._getPlacedIds().size > 0 || (this._isLocked && !isVirtual) || this._isAislePaintMode || this._configPopoverOpen || this._placementPopoverOpen) return;

        const gridArea = document.getElementById('scGridArea');
        if (!gridArea) return;

        const step = this._getEffectiveOnboardingStep();
        let hint = gridArea.querySelector('.sc-onboarding-hint');

        if (hint && !hint.classList.contains('sc-hint-exiting')) {
            if (hint.dataset.step === step) {
                return;
            }
            hint.dataset.step = step;
            this._renderOnboardingHintContent(hint, step);
            return;
        }

        if (hint) hint.remove();

        hint = document.createElement('div');
        hint.className = 'sc-onboarding-hint';
        hint.dataset.step = step;
        this._renderOnboardingHintContent(hint, step);
        gridArea.appendChild(hint);

        const gridKey = this._getActiveGridKey();
        if (!appState[gridKey]) {
            document.getElementById('scConfigBtn')?.classList.add('sc-has-pulse');
        }
    },

    _renderOnboardingHintContent(hint, step) {
        if (step === 'virtual-empty') {
            const currentClass = this._getCurrentClass();
            const sourceIds = Array.isArray(currentClass?.sourceGroupIds) ? currentClass.sourceGroupIds : [];
            const sourceNames = Array.isArray(currentClass?.sourceGroupNames) ? currentClass.sourceGroupNames : [];
            const groupButtonsHtml = sourceIds.map((gid, idx) => {
                const gName = sourceNames[idx] || Utils.getCurrentClassName(gid) || 'Groupe';
                return `
                    <button type="button" class="sc-onboarding-btn secondary" data-switch-group-id="${Utils.escapeHtml(gid)}">
                        <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                        <span>Ouvrir ${Utils.escapeHtml(gName)}</span>
                    </button>
                `;
            }).join('');

            hint.innerHTML = `
                <div class="sc-onboarding-hint-text">
                    <span class="sc-hint-step-badge">Classe reconstituée · Lecture seule</span>
                    <div class="sc-hint-title">Aucun élève placé pour l'instant</div>
                    <div class="sc-hint-subtitle">Cette vue superpose automatiquement les plans de vos groupes. Placez vos élèves directement dans chaque groupe :</div>
                </div>
                ${groupButtonsHtml ? `<div class="sc-onboarding-actions">${groupButtonsHtml}</div>` : ''}
            `;
        } else if (step === 'activity') {
            hint.innerHTML = `
                <div class="sc-onboarding-hint-text">
                    <div class="sc-hint-title">Plan d'activité vide</div>
                    <div class="sc-hint-subtitle">Formez des binômes, îlots de 3 ou groupes de 4 par poste.</div>
                </div>
                <div class="sc-onboarding-actions">
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintActivityPlaceBtn">
                        <iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>
                        <span>Former des binômes ou îlots</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                        <span>Placer manuellement</span>
                    </button>
                </div>
            `;
        } else {
            const capInfo = this._getRoomCapacityInfo();
            const rows = this._getRows();
            let capacityWarningHTML = '';
            if (capInfo.isShortForCurrent && rows < MAX_ROWS) {
                const desksPerRow = Math.max(1, Math.round(capInfo.totalSeats / Math.max(1, rows)));
                const missingSeats = capInfo.activeClassStudents - capInfo.totalSeats;
                const extraRowsNeeded = Math.min(MAX_ROWS - rows, Math.max(1, Math.ceil(missingSeats / desksPerRow)));
                capacityWarningHTML = `
                    <div class="sc-onboarding-capacity-alert">
                        <span><iconify-icon icon="solar:danger-triangle-bold"></iconify-icon> ${capInfo.totalSeats} places pour ${capInfo.activeClassStudents} élèves</span>
                        <button type="button" class="sc-onboarding-adapt-btn" id="scHintAutoExpandRowsBtn" data-extra-rows="${extraRowsNeeded}">
                            Adapter (+${extraRowsNeeded} rangée${extraRowsNeeded > 1 ? 's' : ''})
                        </button>
                    </div>
                `;
            }

            hint.innerHTML = `
                <div class="sc-onboarding-hint-text">
                    <div class="sc-hint-title">Plan de classe vide</div>
                    <div class="sc-hint-subtitle">Placez vos élèves manuellement, ajustez la salle ou lancez un agencement automatique.</div>
                </div>
                ${capacityWarningHTML}
                <div class="sc-onboarding-actions">
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintAutoBtn">
                        <iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon>
                        <span>Agencer automatiquement</span>
                    </button>
                    <div class="sc-onboarding-footer-links">
                        <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                            <span>Placer manuellement</span>
                        </button>
                        <span class="sc-onboarding-footer-dot" aria-hidden="true">·</span>
                        <button type="button" class="sc-onboarding-btn text-only" id="scHintEditRoomBtn">
                            <iconify-icon icon="solar:settings-minimalistic-linear"></iconify-icon>
                            <span>Salle &amp; Allées</span>
                        </button>
                    </div>
                </div>
            `;
        }

        this._bindOnboardingHintEvents(hint);
    },

    _bindOnboardingHintEvents(hint) {
        hint.querySelectorAll('[data-switch-group-id]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const gid = btn.dataset.switchGroupId;
                if (!gid) return;
                if (typeof ClassUIManager?.handleClassSwitch === 'function') {
                    ClassUIManager.handleClassSwitch(gid);
                } else {
                    ClassManager.switchClass(gid);
                }
            });
        });

        hint.querySelector('#scHintEditRoomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismissOnboardingHint();
            this._openConfigPopover?.();
        });

        hint.querySelector('#scHintAutoExpandRowsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const extra = parseInt(e.currentTarget.dataset.extraRows, 10) || 1;
            this._stepGridDimension('rows', extra);
            this._renderOnboardingHintContent(hint, 'placement');
        });

        hint.querySelector('#scHintAutoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismissOnboardingHint();
            this._openPlacementPopover?.();
        });
        hint.querySelector('#scHintActivityPlaceBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismissOnboardingHint();
            this._openPlacementPopover?.();
        });
        hint.querySelector('#scHintManualBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismissOnboardingHint();
        });
    },

    _dismissOnboardingHint() {
        const hint = document.querySelector('.sc-onboarding-hint');
        if (!hint || hint.classList.contains('sc-hint-exiting')) return;

        hint.classList.add('sc-hint-exiting');

        const cleanup = () => hint.remove();
        hint.addEventListener('animationend', cleanup, { once: true });
        setTimeout(cleanup, 400);
    }
};
