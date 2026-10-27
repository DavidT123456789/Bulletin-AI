/**
 * @fileoverview Seating Chart — Mobile Action Sheets, Form-Factor Continuum & Onboarding Hints
 * @module managers/seating/SeatingMobileSheet
 */

import { appState } from '../../state/State.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { StorageManager } from '../StorageManager.js';
import { TooltipsUI } from '../TooltipsManager.js';
import { UI } from '../UIManager.js';
import { Utils } from '../../utils/Utils.js';
import { ClassManager } from '../ClassManager.js';
import { ClassUIManager } from '../ClassUIManager.js';
import { HistoryManager } from '../HistoryManager.js';
import {
    MIN_COLS,
    MAX_COLS,
    MIN_ROWS,
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
            this._closeMobileSheet(true);
            TooltipsUI?.hideAll?.();
            this._applySmartFit(true);
            this._updatePlanModeSwitchUI?.();
        }

        const toggleWrapper = document.getElementById('viewToggle');
        if (toggleWrapper && window.UI && typeof window.UI.updateGlider === 'function') {
            window.UI.updateGlider(toggleWrapper, false);
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
    _openOccupiedCellSheet(row, col, student, cellStudents = null) {
        this._closeMobileSheet(true);
        if (!HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.pushState('scMobileSheet', () => this._closeMobileSheet(true));
        }

        const students = Array.isArray(cellStudents) && cellStudents.length > 0
            ? cellStudents
            : (this._getCellStudentIds(row, col).map(id => this._studentMap?.get(id)).filter(Boolean));
        const primary = students[0] || student;
        if (!primary) return;

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
            : `${primary.prenom || ''} ${primary.nom || ''}`;

        const currentClassName = this._getCurrentClass()?.name || Utils.getCurrentClassName();
        const primaryClassInfo = !isMulti ? this._getStudentContextualClassInfo(primary) : null;
        const primaryStatuses = !isMulti
            ? [...(primaryClassInfo?.tooltipLabel ? [primaryClassInfo.tooltipLabel] : []), ...this._getStudentStatusLabels(primary)]
            : [];
        const primaryStatusSuffix = primaryStatuses.length > 0
            ? ` • ${primaryStatuses.join(' • ')}`
            : '';

        const headerAvatarHTML = isMulti
            ? `<div class="sc-sheet-desk-icon"><iconify-icon icon="solar:users-group-two-rounded-linear"></iconify-icon></div>`
            : StudentPhotoManager.getAvatarHTML(primary, 'md');

        const membersSectionHTML = isMulti ? `
            <div class="sc-sheet-section-title">Membres du poste (${students.length}/${MAX_ACTIVITY_GROUP_SIZE})</div>
            <div class="sc-sheet-picker-list sc-sheet-members-list">
                ${students.map(s => {
                    const memberStatusBadge = this._getStudentStatusLabels(s).map(label => {
                        const badgeClass = label === 'Départ'
                            ? 'sc-chip-badge-depart'
                            : (label === 'Nouveau'
                                ? 'sc-chip-badge-new'
                                : (label === 'ULIS'
                                    ? 'sc-chip-badge-ulis'
                                    : (label === 'Délégué' ? 'sc-chip-badge-delegate' : 'sc-chip-badge-device')));
                        return `<span class="sc-chip-badge ${badgeClass}">${Utils.escapeHtml(label)}</span>`;
                    }).join('');
                    return `
                    <div class="sc-sheet-picker-item sc-sheet-member-row" data-member-id="${s.id}">
                        <button class="sc-sheet-picker-user sc-sheet-member-profile-btn" data-profile-id="${s.id}" type="button">
                            ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                            <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true, '', Utils.getOriginClass(s, currentClassName))}</span>
                            ${memberStatusBadge}
                        </button>
                        <button class="sc-sheet-member-remove-btn" data-remove-member-id="${s.id}" type="button" aria-label="Retirer ${s.prenom || s.nom}">
                            <iconify-icon icon="ph:x"></iconify-icon> Retirer
                        </button>
                    </div>
                `;
                }).join('')}
            </div>
        ` : '';

        const addTeammateSectionHTML = (isActivity && students.length < MAX_ACTIVITY_GROUP_SIZE && unplaced.length > 0) ? `
            <div class="sc-sheet-section-title">Associer un élève sur ce poste (${students.length}/${MAX_ACTIVITY_GROUP_SIZE})</div>
            <div class="sc-sheet-picker-list sc-sheet-compact-picker" id="scSheetJoinList">
                ${unplaced.map(s => `
                    <button class="sc-sheet-picker-item" data-join-student-id="${s.id}" type="button">
                        <div class="sc-sheet-picker-user">
                            ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                            <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true, '', Utils.getOriginClass(s, currentClassName))}</span>
                        </div>
                        <span class="sc-sheet-picker-badge"><iconify-icon icon="solar:user-plus-linear"></iconify-icon> Associer</span>
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
                        <p class="sc-sheet-entity-meta">${locationLabel}${primaryStatusSuffix}${isPinned ? ' • 📌 Place fixée' : ''}</p>
                    </div>
                </div>
                <button class="sc-sheet-close-btn" id="scSheetCloseBtn" aria-label="Fermer" type="button">
                    <iconify-icon icon="ph:x"></iconify-icon>
                </button>
            </div>
            <div class="sc-sheet-content">
                ${membersSectionHTML}
                ${addTeammateSectionHTML}
                <div class="sc-sheet-actions">
                    <button class="sc-sheet-action-btn" data-action="move" type="button">
                        <div class="sc-sheet-action-icon sc-icon-primary">
                            <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isMulti ? 'Déplacer ou permuter le groupe' : 'Déplacer ou permuter'}</span>
                            <span class="sc-sheet-action-hint">Touchez ensuite le poste de destination</span>
                        </div>
                    </button>
                    <button class="sc-sheet-action-btn" data-action="pin" type="button">
                        <div class="sc-sheet-action-icon ${isPinned ? 'sc-icon-warning' : 'sc-icon-secondary'}">
                            <iconify-icon icon="solar:pin-${isPinned ? 'bold' : 'linear'}"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isPinned ? 'Détacher la place' : 'Épingler à ce poste'}</span>
                            <span class="sc-sheet-action-hint">${isPinned ? 'Le poste redeviendra mobile' : 'Fige ce poste lors des réagencements'}</span>
                        </div>
                    </button>
                    <button class="sc-sheet-action-btn sc-action-danger" data-action="remove" type="button">
                        <div class="sc-sheet-action-icon sc-icon-danger">
                            <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                        </div>
                        <div class="sc-sheet-action-text">
                            <span class="sc-sheet-action-label">${isMulti ? 'Libérer tout le poste' : 'Retirer du plan'}</span>
                            <span class="sc-sheet-action-hint">Renvoie ${isMulti ? 'les élèves' : "l'élève"} dans les non placés</span>
                        </div>
                    </button>
                    ${!isMulti ? `
                        <button class="sc-sheet-action-btn" data-action="profile" type="button">
                            <div class="sc-sheet-action-icon sc-icon-secondary">
                                <iconify-icon icon="solar:user-id-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Voir la fiche élève</span>
                                <span class="sc-sheet-action-hint">Notes, observations et historique</span>
                            </div>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        this._activeMobileSheet = { backdrop, sheet };

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
            this._closeMobileSheet(true);
            this._clearSelection();
            this._toggleChipSelection(primary.id);
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

        sheet.querySelector('[data-action="profile"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            FocusPanelManager.open(primary.id);
        });
    },

    _openEmptyCellSheet(row, col, special) {
        this._closeMobileSheet(true);
        if (!HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.pushState('scMobileSheet', () => this._closeMobileSheet(true));
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
        const stationNum = (isActivity && !special) ? this._getStationNumber(row, col) : null;
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
        const headerEntityName = stationNum
            ? `Poste #${stationNum} • Rangée ${row + 1}, Col ${col + 1}`
            : `Rangée ${row + 1} • Table ${col + 1}`;

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
                            <button class="sc-sheet-picker-item" data-student-id="${s.id}" type="button">
                                <div class="sc-sheet-picker-user">
                                    ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                                    <span class="sc-sheet-picker-name">${Utils.formatStudentName(s.nom, s.prenom, true, '', Utils.getOriginClass(s, currentClassName))}</span>
                                </div>
                                <span class="sc-sheet-picker-badge"><iconify-icon icon="solar:add-circle-linear"></iconify-icon> Placer</span>
                            </button>
                        `).join('')}
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
                            <div class="sc-sheet-action-icon sc-icon-secondary">
                                <iconify-icon icon="solar:ghost-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Transformer en allée</span>
                                <span class="sc-sheet-action-hint">Espace de passage (aucune table)</span>
                            </div>
                        </button>
                        <button class="sc-sheet-action-btn" data-special-type="aesh" type="button">
                            <div class="sc-sheet-action-icon sc-icon-secondary">
                                <iconify-icon icon="solar:user-speak-rounded-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Place AESH</span>
                                <span class="sc-sheet-action-hint">Réservée pour accompagnant</span>
                            </div>
                        </button>
                        <button class="sc-sheet-action-btn" data-special-type="blocked" type="button">
                            <div class="sc-sheet-action-icon sc-icon-secondary">
                                <iconify-icon icon="solar:forbidden-circle-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Condamner la table</span>
                                <span class="sc-sheet-action-hint">Table hors service ou indisponible</span>
                            </div>
                        </button>
                    ` : `
                        <button class="sc-sheet-action-btn" data-special-type="normal" type="button">
                            <div class="sc-sheet-action-icon sc-icon-primary">
                                <iconify-icon icon="solar:refresh-linear"></iconify-icon>
                            </div>
                            <div class="sc-sheet-action-text">
                                <span class="sc-sheet-action-label">Rétablir en table normale</span>
                                <span class="sc-sheet-action-hint">Permet d'asseoir à nouveau un élève</span>
                            </div>
                        </button>
                        ${special.type === 'blocked' ? `
                            <button class="sc-sheet-action-btn" data-special-type="toggle-scope" type="button">
                                <div class="sc-sheet-action-icon sc-icon-secondary">
                                    <iconify-icon icon="${isClassScope ? 'solar:buildings-linear' : 'solar:users-group-two-rounded-linear'}"></iconify-icon>
                                </div>
                                <div class="sc-sheet-action-text">
                                    <span class="sc-sheet-action-label">${isClassScope ? 'Appliquer à toute la salle' : 'Restreindre à cette classe'}</span>
                                    <span class="sc-sheet-action-hint">Portée : ${isClassScope ? 'Cette classe uniquement' : 'Toutes les classes'}</span>
                                </div>
                            </button>
                        ` : ''}
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
        this._activeMobileSheet = { backdrop, sheet };

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
        if (searchInput && pickerList) {
            searchInput.addEventListener('input', (e) => {
                const q = (e.target.value || '').trim().toLowerCase();
                pickerList.querySelectorAll('.sc-sheet-picker-item').forEach(item => {
                    const name = item.querySelector('.sc-sheet-picker-name')?.textContent?.toLowerCase() || '';
                    item.style.display = name.includes(q) ? 'flex' : 'none';
                });
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

    _closeMobileSheet(immediate = false) {
        if (HistoryManager.isOpen('scMobileSheet')) {
            HistoryManager.handleManualClose('scMobileSheet');
        }

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
        if (this._onboardingStep === 'room' || this._onboardingStep === 'placement') {
            return this._onboardingStep;
        }
        const isConfigured = this._isRoomConfigured('course');
        this._onboardingStep = isConfigured ? 'placement' : 'room';
        return this._onboardingStep;
    },

    _transitionOnboardingStep(hint, nextStep) {
        if (!hint) return;
        const startW = hint.offsetWidth;
        const startH = hint.offsetHeight;

        hint.dataset.step = nextStep;
        this._renderOnboardingHintContent(hint, nextStep);

        const endW = hint.offsetWidth;
        const endH = hint.offsetHeight;

        if (typeof hint.animate === 'function' && startW > 0 && startH > 0 && (startW !== endW || startH !== endH)) {
            hint.style.overflow = 'hidden';
            const anim = hint.animate([
                { width: `${startW}px`, height: `${startH}px` },
                { width: `${endW}px`, height: `${endH}px` }
            ], {
                duration: 240,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
            });
            const cleanup = () => {
                hint.style.overflow = '';
            };
            anim.onfinish = cleanup;
            anim.oncancel = cleanup;
        }
    },

    _confirmRoomSetup() {
        const gridKey = this._getActiveGridKey();
        appState[gridKey] = {
            rows: this._getRows(),
            cols: this._getCols(),
            locked: this._isLocked,
            roomConfigured: true,
            specialLayout: appState[gridKey]?.specialLayout || {}
        };
        document.getElementById('scConfigBtn')?.classList.remove('sc-has-pulse');
        StorageManager.saveAppState();

        this._roomSetupFromPlacement = false;
        this._roomSetupSnapshot = null;
        this._onboardingStep = 'placement';
        const hint = document.querySelector('#scGridArea .sc-onboarding-hint');
        if (hint) {
            this._transitionOnboardingStep(hint, 'placement');
        }
    },

    _cancelRoomSetup() {
        const snap = this._roomSetupSnapshot;
        const gridKey = this._getActiveGridKey();
        let hasGridChanged = false;

        if (snap) {
            const currentSpecialJson = JSON.stringify(appState[gridKey]?.specialLayout || {});
            const snapSpecialJson = JSON.stringify(snap.gridClone?.specialLayout || {});
            hasGridChanged = this._getRows() !== snap.rows
                || this._getCols() !== snap.cols
                || currentSpecialJson !== snapSpecialJson;

            appState[gridKey] = snap.gridClone ? JSON.parse(JSON.stringify(snap.gridClone)) : null;
            if (hasGridChanged) {
                const rowSlider = document.getElementById('scRowsSlider');
                const colSlider = document.getElementById('scColsSlider');
                const rowValEl = document.getElementById('scRowsValue');
                const colValEl = document.getElementById('scColsValue');
                if (rowSlider) rowSlider.value = String(snap.rows);
                if (rowValEl) rowValEl.textContent = String(snap.rows);
                if (colSlider) colSlider.value = String(snap.cols);
                if (colValEl) colValEl.textContent = String(snap.cols);
                this._initGrid(snap.rows, snap.cols);
                this._loadPositionsFromState();
                StorageManager.saveAppState();
            }
        }

        this._roomSetupFromPlacement = false;
        this._roomSetupSnapshot = null;
        this._onboardingStep = 'placement';

        if (hasGridChanged) {
            this._render();
            this._applySmartFit(true);
        } else {
            const hint = document.querySelector('#scGridArea .sc-onboarding-hint');
            if (hint) {
                this._transitionOnboardingStep(hint, 'placement');
            }
        }
    },

    _maybeShowOnboardingHint() {
        const isVirtual = this._isVirtualClass();
        if (this._getPlacedIds().size > 0 || (this._isLocked && !isVirtual)) return;

        const gridArea = document.getElementById('scGridArea');
        if (!gridArea) return;

        const step = this._getEffectiveOnboardingStep();
        let hint = gridArea.querySelector('.sc-onboarding-hint');

        if (hint && !hint.classList.contains('sc-hint-exiting')) {
            if (hint.dataset.step === step) {
                this._syncOnboardingHintUI(hint);
                return;
            }
            this._transitionOnboardingStep(hint, step);
            return;
        }

        if (hint) hint.remove();

        hint = document.createElement('div');
        hint.className = 'sc-onboarding-hint';
        hint.dataset.step = step;
        this._renderOnboardingHintContent(hint, step);
        gridArea.appendChild(hint);

        const gridKey = this._getActiveGridKey();
        if (!appState[gridKey] && step !== 'room') {
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
                    <div class="sc-hint-subtitle">Créez des binômes, groupes ou postes de travail.</div>
                </div>
                <div class="sc-onboarding-actions">
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintPairsRandomBtn">
                        <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                        <span>Binômes aléatoires</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintPairsNeighborsBtn">
                        <iconify-icon icon="solar:transfer-horizontal-linear"></iconify-icon>
                        <span>Binômes voisins du cours</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintGroups4Btn">
                        <iconify-icon icon="solar:widget-4-linear"></iconify-icon>
                        <span>Groupes de 4 / Terrains</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                        <span>Placer manuellement</span>
                    </button>
                </div>
            `;
        } else if (step === 'room') {
            const rows = this._getRows();
            const cols = this._getCols();
            const activePreset = this._detectCurrentRoomPreset();
            const capInfo = this._getRoomCapacityInfo();
            const isWarning = capInfo.isShortForCurrent || capInfo.isShortForMax;
            const isEditMode = Boolean(this._roomSetupFromPlacement);

            hint.innerHTML = `
                <div class="sc-onboarding-hint-text">
                    ${isEditMode ? '' : '<span class="sc-hint-step-badge">Étape 1 / 2 · Configuration unique</span>'}
                    <div class="sc-hint-title">${isEditMode ? 'Régler la salle de cours' : 'Configurez votre salle de cours'}</div>
                    <div class="sc-hint-subtitle">Ce plan de salle s'appliquera à toutes vos classes (modifiable à tout moment).</div>
                </div>

                <div class="sc-room-preset-grid" role="radiogroup" aria-label="Disposition des tables">
                    <button type="button" class="sc-room-preset-card ${activePreset === 'compact' ? 'active' : ''}" data-room-preset="compact" role="radio" aria-checked="${activePreset === 'compact'}">
                        <span class="sc-preset-diagram" aria-hidden="true">
                            <span class="sc-mini-diagram is-compact">
                                <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                                <span class="sc-mini-row"><i></i><i></i><i></i><i></i><i></i><i></i></span>
                            </span>
                        </span>
                        <span class="sc-preset-card-title">Sans allée</span>
                        <span class="sc-preset-card-sub">6 col. continues</span>
                    </button>
                    <button type="button" class="sc-room-preset-card ${activePreset === 'center-aisle' ? 'active' : ''}" data-room-preset="center-aisle" role="radio" aria-checked="${activePreset === 'center-aisle'}">
                        <span class="sc-preset-diagram" aria-hidden="true">
                            <span class="sc-mini-diagram is-center-aisle">
                                <span class="sc-mini-row"><i></i><i></i><i></i><b class="aisle"></b><i></i><i></i><i></i></span>
                                <span class="sc-mini-row"><i></i><i></i><i></i><b class="aisle"></b><i></i><i></i><i></i></span>
                            </span>
                        </span>
                        <span class="sc-preset-card-title">1 allée centrale</span>
                        <span class="sc-preset-card-sub">2 îlots de 3</span>
                    </button>
                    <button type="button" class="sc-room-preset-card ${activePreset === 'double-aisles' ? 'active' : ''}" data-room-preset="double-aisles" role="radio" aria-checked="${activePreset === 'double-aisles'}">
                        <span class="sc-preset-diagram" aria-hidden="true">
                            <span class="sc-mini-diagram is-double-aisles">
                                <span class="sc-mini-row"><i></i><i></i><b class="aisle"></b><i></i><i></i><b class="aisle"></b><i></i><i></i></span>
                                <span class="sc-mini-row"><i></i><i></i><b class="aisle"></b><i></i><i></i><b class="aisle"></b><i></i><i></i></span>
                            </span>
                        </span>
                        <span class="sc-preset-card-title">2 allées</span>
                        <span class="sc-preset-card-sub">3 rangées doubles</span>
                    </button>
                </div>

                <div class="sc-onboarding-dims-bar">
                    <div class="sc-onboarding-dims-controls">
                        <div class="sc-onboarding-dim-group">
                            <span class="sc-onboarding-dim-label">Colonnes</span>
                            <div class="sc-onboarding-stepper">
                                <button type="button" class="sc-hint-step-btn" data-dim="cols" data-delta="-1" aria-label="Moins de colonnes" ${cols <= MIN_COLS ? 'disabled' : ''}>−</button>
                                <span class="sc-hint-dim-val" id="scHintColsVal">${cols}</span>
                                <button type="button" class="sc-hint-step-btn" data-dim="cols" data-delta="1" aria-label="Plus de colonnes" ${cols >= MAX_COLS ? 'disabled' : ''}>+</button>
                            </div>
                        </div>
                        <span class="sc-onboarding-dim-sep" aria-hidden="true">×</span>
                        <div class="sc-onboarding-dim-group">
                            <span class="sc-onboarding-dim-label">Rangées</span>
                            <div class="sc-onboarding-stepper">
                                <button type="button" class="sc-hint-step-btn" data-dim="rows" data-delta="-1" aria-label="Moins de rangées" ${rows <= MIN_ROWS ? 'disabled' : ''}>−</button>
                                <span class="sc-hint-dim-val" id="scHintRowsVal">${rows}</span>
                                <button type="button" class="sc-hint-step-btn" data-dim="rows" data-delta="1" aria-label="Plus de rangées" ${rows >= MAX_ROWS ? 'disabled' : ''}>+</button>
                            </div>
                        </div>
                    </div>
                    <div class="sc-hint-capacity-pill ${isWarning ? 'is-warning' : 'is-ok'}" id="scHintCapacityBadge" role="status">
                        ${this._getCapacityBadgeInnerHTML(capInfo)}
                    </div>
                </div>

                <div class="sc-onboarding-actions">
                    <button type="button" class="sc-onboarding-btn secondary sc-onboarding-confirm-btn" id="scHintConfirmRoomBtn">
                        <iconify-icon icon="${isEditMode ? 'solar:check-read-linear' : 'solar:arrow-right-linear'}"></iconify-icon>
                        <span>${isEditMode ? 'Valider la salle' : 'Continuer vers le placement'}</span>
                    </button>
                    <div class="sc-onboarding-footer-links">
                        ${isEditMode ? `
                            <button type="button" class="sc-onboarding-btn text-only" id="scHintCancelRoomBtn">
                                <iconify-icon icon="solar:arrow-left-linear"></iconify-icon>
                                <span>Retour sans modifier</span>
                            </button>
                        ` : `
                            <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                                <span>Passer et placer manuellement</span>
                            </button>
                        `}
                    </div>
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
                    <div class="sc-hint-subtitle">Placez vos élèves pour commencer.</div>
                </div>
                ${capacityWarningHTML}
                <div class="sc-onboarding-actions">
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintAutoBtn">
                        <iconify-icon icon="solar:sort-by-alphabet-linear"></iconify-icon>
                        <span>Placer (A → Z)</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintRandomBtn">
                        <iconify-icon icon="solar:shuffle-linear"></iconify-icon>
                        <span>Mélanger (regroupé)</span>
                    </button>
                    <button type="button" class="sc-onboarding-btn secondary" id="scHintDisperseBtn">
                        <iconify-icon icon="solar:maximize-square-minimalistic-linear"></iconify-icon>
                        <span>Disperser (toute la salle)</span>
                    </button>
                    <div class="sc-onboarding-footer-links">
                        <button type="button" class="sc-onboarding-btn text-only" id="scHintManualBtn">
                            <span>Placer manuellement</span>
                        </button>
                        <span class="sc-onboarding-footer-dot" aria-hidden="true">·</span>
                        <button type="button" class="sc-onboarding-btn text-only" id="scHintEditRoomBtn">
                            <iconify-icon icon="solar:settings-minimalistic-linear"></iconify-icon>
                            <span>Régler la salle</span>
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

        hint.querySelectorAll('.sc-room-preset-card').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const preset = btn.dataset.roomPreset;
                if (preset) {
                    this._applyRoomPreset(preset);
                }
            });
        });

        hint.querySelectorAll('.sc-hint-step-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dim = btn.dataset.dim;
                const delta = parseInt(btn.dataset.delta, 10);
                if (dim && !Number.isNaN(delta)) {
                    this._stepGridDimension(dim, delta);
                }
            });
        });

        hint.querySelector('#scHintConfirmRoomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._confirmRoomSetup();
        });

        hint.querySelector('#scHintCancelRoomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._cancelRoomSetup();
        });

        hint.querySelector('#scHintEditRoomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const gridKey = this._getActiveGridKey();
            this._roomSetupFromPlacement = true;
            this._roomSetupSnapshot = {
                rows: this._getRows(),
                cols: this._getCols(),
                gridClone: appState[gridKey] ? JSON.parse(JSON.stringify(appState[gridKey])) : null
            };
            this._onboardingStep = 'room';
            this._transitionOnboardingStep(hint, 'room');
        });

        hint.querySelector('#scHintAutoExpandRowsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const extra = parseInt(e.currentTarget.dataset.extraRows, 10) || 1;
            this._stepGridDimension('rows', extra);
            this._renderOnboardingHintContent(hint, 'placement');
        });

        hint.querySelector('#scHintAutoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('alpha-asc');
        });
        hint.querySelector('#scHintRandomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('random');
        });
        hint.querySelector('#scHintDisperseBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('random-disperse');
        });
        hint.querySelector('#scHintPairsRandomBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('pairs-random');
        });
        hint.querySelector('#scHintPairsNeighborsBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('pairs-neighbors');
        });
        hint.querySelector('#scHintGroups4Btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._autoPlace('groups-4');
        });
        hint.querySelector('#scHintManualBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismissOnboardingHint();
        });
    },

    _syncOnboardingHintUI(hint) {
        if (!hint || hint.dataset.step !== 'room') return;

        const rows = this._getRows();
        const cols = this._getCols();
        const activePreset = this._detectCurrentRoomPreset();
        const capInfo = this._getRoomCapacityInfo();
        const isWarning = capInfo.isShortForCurrent || capInfo.isShortForMax;

        const colsVal = hint.querySelector('#scHintColsVal');
        const rowsVal = hint.querySelector('#scHintRowsVal');
        if (colsVal) colsVal.textContent = cols;
        if (rowsVal) rowsVal.textContent = rows;

        hint.querySelectorAll('.sc-hint-step-btn').forEach(btn => {
            const dim = btn.dataset.dim;
            const delta = parseInt(btn.dataset.delta, 10);
            if (dim === 'cols') {
                btn.disabled = (delta < 0 && cols <= MIN_COLS) || (delta > 0 && cols >= MAX_COLS);
            } else if (dim === 'rows') {
                btn.disabled = (delta < 0 && rows <= MIN_ROWS) || (delta > 0 && rows >= MAX_ROWS);
            }
        });

        hint.querySelectorAll('.sc-room-preset-card').forEach(card => {
            const isMatch = card.dataset.roomPreset === activePreset;
            card.classList.toggle('active', isMatch);
            card.setAttribute('aria-checked', isMatch ? 'true' : 'false');
        });

        const capBadge = hint.querySelector('#scHintCapacityBadge');
        if (capBadge) {
            capBadge.innerHTML = this._getCapacityBadgeInnerHTML(capInfo);
            capBadge.classList.toggle('is-warning', isWarning);
            capBadge.classList.toggle('is-ok', !isWarning);
        }
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
