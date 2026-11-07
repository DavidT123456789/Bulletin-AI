/**
 * @fileoverview Unified Header Search, Spotlight & Cross-Class Navigation
 * Shared across List View & Plan View.
 * @module managers/seating/SeatingSearch
 */

import { appState } from '../../state/State.js';
import { CONFIG } from '../../config/Config.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { Utils } from '../../utils/Utils.js';
import { ClassManager } from '../ClassManager.js';
import { CrossClassSearchManager } from '../CrossClassSearchManager.js';
import { ClassUIManager } from '../ClassUIManager.js';
import { EventHandlersManager } from '../EventHandlersManager.js';
import { HistoryManager } from '../HistoryManager.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';

export const SeatingSearch = {
    // ========================================================================
    // SEARCH & SPOTLIGHT
    // ========================================================================

    _openSearch() {
        const wrap = document.getElementById('scFloatingSearch');
        const input = document.getElementById('scFloatingSearchInput');
        const btn = document.getElementById('scFloatingSearchBtn');
        if (!wrap || !input) return;

        if (btn?._tippy) {
            btn._tippy.hide();
            btn._tippy.disable();
        }

        const wasOpen = wrap.classList.contains('open');
        wrap.classList.add('open');

        if (appState.searchQuery && !input.value) {
            input.value = appState.searchQuery;
        }
        const hasVal = input.value.length > 0;
        wrap.classList.toggle('has-value', hasVal);
        document.getElementById('scFloatingSearchClear')?.classList.toggle('visible', hasVal);

        if (!wasOpen && !HistoryManager.isOpen('inlineSearch')) {
            HistoryManager.pushState('inlineSearch', () => {
                this._closeSearch({ fromHistory: true });
            });
        }

        const focusInput = () => {
            input.focus({ preventScroll: true });
            input.select?.();
        };
        focusInput();
        requestAnimationFrame(focusInput);
    },

    _closeSearch({ fromHistory = false } = {}) {
        const wrap = document.getElementById('scFloatingSearch');
        const input = document.getElementById('scFloatingSearchInput');

        const hadActiveSearch = Boolean(
            wrap?.classList.contains('open') ||
            input?.value ||
            this._activeSearchTerm ||
            appState.searchQuery ||
            CrossClassSearchManager._debounceTimer
        );

        CrossClassSearchManager.resetHeaderSearchUI({ fromHistory });

        if (hadActiveSearch) {
            CrossClassSearchManager.cancelPendingSearch();
            const hadQuery = Boolean(this._activeSearchTerm || appState.searchQuery);
            this._activeSearchTerm = '';
            appState.searchQuery = '';
            this._applySearchHighlight('');
            if (this._isActive) {
                this._renderSidebar?.();
            } else if (hadQuery) {
                EventHandlersManager?.handleSearchInput?.();
            }
        }
    },

    _isSearchOpen() {
        return document.getElementById('scFloatingSearch')?.classList.contains('open') || false;
    },

    _handleSearchInput(value, { immediate = false } = {}) {
        const rawValue = value ?? '';
        const wrap = document.getElementById('scFloatingSearch');
        const clearBtn = document.getElementById('scFloatingSearchClear');
        const hasVal = rawValue.length > 0;

        wrap?.classList.toggle('has-value', hasVal);
        clearBtn?.classList.toggle('visible', hasVal);
        appState.searchQuery = rawValue;

        if (this._isActive) {
            this._renderSidebar?.();
            this._applySearchHighlight(rawValue);
        } else {
            this._activeSearchTerm = rawValue.trim();
            this._updateSearchCountAndSuggestions(rawValue);
            if (immediate || !rawValue) {
                CrossClassSearchManager.cancelPendingSearch();
                EventHandlersManager?.handleSearchInput?.();
            } else {
                CrossClassSearchManager.scheduleSearch(
                    rawValue,
                    () => EventHandlersManager?.handleSearchInput?.(),
                    CONFIG?.DEBOUNCE_TIME_MS ?? 180
                );
            }
        }
    },

    _handleSearchEscape() {
        const input = document.getElementById('scFloatingSearchInput');
        if (input && input.value) {
            input.value = '';
            this._handleSearchInput('', { immediate: true });
            input.focus({ preventScroll: true });
        } else {
            this._closeSearch();
        }
    },

    async _handleSearchEnter(value) {
        const cleaned = (value || '').trim();
        if (!cleaned) return;

        if (!this._isActive) {
            if (CrossClassSearchManager._debounceTimer) {
                CrossClassSearchManager.cancelPendingSearch();
                EventHandlersManager?.handleSearchInput?.();
            }
            const firstRow = document.querySelector('#outputList .student-row');
            if (firstRow?.dataset?.studentId) {
                FocusPanelManager.open(firstRow.dataset.studentId);
                return;
            }
        } else {
            const currentClassName = this._getCurrentClass()?.name || Utils.getCurrentClassName();
            const matchedStudents = (this._students || []).filter(student =>
                Utils.matchesStudent(student, cleaned, { currentClassName })
            );

            if (matchedStudents.length > 0) {
                const index = this._searchMatchIndex % matchedStudents.length;
                const targetStudent = matchedStudents[index];
                this._searchMatchIndex = (index + 1) % matchedStudents.length;

                const targetCell = document.querySelector(`#scGridContainer .sc-cell[data-result-id="${targetStudent.id}"]`)
                    || document.querySelector(`#scGridContainer .sc-stacked-member[data-result-id="${targetStudent.id}"]`)?.closest('.sc-cell');
                if (targetCell && typeof targetCell.scrollIntoView === 'function') {
                    targetCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                }

                const countBadge = document.getElementById('scFloatingSearchCount');
                if (countBadge && matchedStudents.length > 1) {
                    countBadge.textContent = `${index + 1}/${matchedStudents.length}`;
                }

                if (this._isLocked) {
                    FocusPanelManager.open(targetStudent.id);
                } else {
                    this._toggleChipSelection(targetStudent.id);
                }
                return;
            }
        }

        const crossData = CrossClassSearchManager.searchAcrossClasses(cleaned);
        if (crossData.groups && crossData.groups.length > 0) {
            const firstGroup = crossData.groups[0];
            const targetClassId = firstGroup.classId;
            const targetStudentId = firstGroup.students?.[0]?.id;
            CrossClassSearchManager.hideSuggestions();
            await this._switchClassFromSearch(targetClassId, targetStudentId, cleaned);
        }
    },

    _updateSearchCountAndSuggestions(term) {
        const cleaned = (term || '').trim();
        const countBadge = document.getElementById('scFloatingSearchCount');
        const clearBtn = document.getElementById('scFloatingSearchClear');
        const suggestionsEl = document.getElementById('scFloatingSearchSuggestions');

        if (clearBtn) {
            clearBtn.classList.toggle('visible', cleaned.length > 0);
        }

        if (!cleaned) {
            if (countBadge) {
                countBadge.textContent = '';
                countBadge.classList.remove('sc-count-zero');
                countBadge.style.display = 'none';
            }
            CrossClassSearchManager.hideSuggestions(suggestionsEl);
            return { matchedStudentIds: new Set(), matchCount: 0 };
        }

        const matchedStudentIds = new Set();
        const currentClassName = this._getCurrentClass()?.name || Utils.getCurrentClassName();
        let sourceStudents = this._isActive ? (this._students || []) : this._getCurrentClassStudents();
        if (!this._isActive && sourceStudents.length === 0 && Array.isArray(appState.generatedResults) && appState.generatedResults.length > 0 && !appState.currentClassId) {
            sourceStudents = appState.generatedResults;
        }
        sourceStudents.forEach(student => {
            if (Utils.matchesStudent(student, cleaned, { currentClassName })) {
                matchedStudentIds.add(student.id);
            }
        });

        const matchCount = matchedStudentIds.size;
        if (countBadge) {
            countBadge.style.display = 'inline-flex';
            countBadge.textContent = String(matchCount);
            countBadge.classList.toggle('sc-count-zero', matchCount === 0);
        }

        if (matchCount === 0 && cleaned.length >= 2 && suggestionsEl) {
            const crossData = CrossClassSearchManager.searchAcrossClasses(cleaned);
            if (crossData.groups && crossData.groups.length > 0) {
                const items = [];
                for (const group of crossData.groups) {
                    for (const student of (group.students || [])) {
                        if (items.length >= 5) break;
                        items.push({ group, student });
                    }
                    if (items.length >= 5) break;
                }

                const buttonsHtml = items.map(({ group, student }) => {
                    const fullName = `${(student.prenom || '').trim()} ${(student.nom || '').trim()}`.trim();
                    const highlightedName = Utils.highlightMatch(fullName, cleaned);
                    const originClass = Utils.getOriginClass(student, group.className);
                    const displayOrigin = originClass ? Utils.formatClassDisplayName(originClass) : '';
                    const escapedOrigin = displayOrigin ? Utils.escapeHtml(displayOrigin) : '';
                    const originBadge = escapedOrigin
                        ? ` <span class="student-origin-class-tag" title="Classe d'origine : ${escapedOrigin}">${escapedOrigin}</span>`
                        : '';
                    const avatarHtml = StudentPhotoManager.getAvatarHTML(student, 'sm', false, false);
                    return `
                        <button class="sc-cross-action" type="button" data-class-id="${group.classId}" data-student-id="${student.id || ''}">
                            ${avatarHtml}
                            <span class="sc-cross-action-label"><span class="sc-cross-name-text">${highlightedName}</span>${originBadge}</span>
                            <span class="sc-cross-action-class">${Utils.escapeHtml(group.className)}</span>
                            <iconify-icon icon="solar:alt-arrow-right-linear" class="sc-cross-arrow"></iconify-icon>
                        </button>
                    `;
                }).join('');

                suggestionsEl.innerHTML = `
                    <div class="sc-cross-suggestion-pill">
                        <span class="sc-cross-hint">Autres classes</span>
                        ${buttonsHtml}
                    </div>
                `;
                suggestionsEl.classList.add('visible');
                suggestionsEl.style.display = 'block';

                suggestionsEl.querySelectorAll('.sc-cross-action').forEach((actionBtn, idx, allBtns) => {
                    actionBtn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                    });
                    actionBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const targetClassId = actionBtn.dataset.classId;
                        const targetStudentId = actionBtn.dataset.studentId;
                        if (targetClassId) {
                            CrossClassSearchManager.hideSuggestions(suggestionsEl);
                            await this._switchClassFromSearch(targetClassId, targetStudentId, this._activeSearchTerm || cleaned);
                        }
                    });
                    actionBtn.addEventListener('keydown', (e) => {
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            e.stopPropagation();
                            allBtns[idx + 1]?.focus();
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            e.stopPropagation();
                            if (idx > 0) {
                                allBtns[idx - 1]?.focus();
                            } else {
                                document.getElementById('scFloatingSearchInput')?.focus({ preventScroll: true });
                            }
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            document.getElementById('scFloatingSearchInput')?.focus({ preventScroll: true });
                        }
                    });
                });
            } else {
                CrossClassSearchManager.hideSuggestions(suggestionsEl);
            }
        } else {
            CrossClassSearchManager.hideSuggestions(suggestionsEl);
        }

        return { matchedStudentIds, matchCount };
    },

    _applySearchHighlight(term) {
        const cleaned = (term || '').trim();
        this._activeSearchTerm = cleaned;
        appState.searchQuery = cleaned;
        this._searchMatchIndex = 0;

        const view = document.getElementById('seatingChartView');
        const { matchedStudentIds, matchCount } = this._updateSearchCountAndSuggestions(cleaned);

        if (!cleaned) {
            if (view) view.classList.remove('sc-search-active');
            document.querySelectorAll('#scGridContainer .sc-cell').forEach(cell => {
                cell.classList.remove('sc-spotlight-match', 'sc-spotlight-dimmed', 'sc-spotlight-single');
            });
            document.querySelectorAll('#scGridContainer .sc-stacked-member, #scGridContainer .sc-stacked-avatar').forEach(el => {
                el.classList.remove('sc-member-match', 'sc-member-dimmed');
            });
            document.querySelectorAll('#scStudentList .sc-student-chip').forEach(chip => {
                chip.classList.remove('sc-spotlight-match', 'sc-spotlight-dimmed');
            });
            return;
        }

        if (view) view.classList.add('sc-search-active');

        // 2. Grid cells
        const cells = document.querySelectorAll('#scGridContainer .sc-cell');
        cells.forEach(cell => {
            const r = Number(cell.dataset.row);
            const c = Number(cell.dataset.col);
            const cellContent = this._gridState[r]?.[c];
            const studentIds = Array.isArray(cellContent) ? cellContent : (cellContent ? [cellContent] : []);

            const isMatch = studentIds.some(id => matchedStudentIds.has(id));
            if (isMatch) {
                cell.classList.remove('sc-spotlight-dimmed');
                cell.classList.add('sc-spotlight-match');
                cell.classList.toggle('sc-spotlight-single', matchCount === 1);
                cell.querySelectorAll('.sc-stacked-member, .sc-stacked-avatar').forEach(el => {
                    const memberMatch = matchedStudentIds.has(el.dataset.resultId);
                    el.classList.toggle('sc-member-match', memberMatch);
                    el.classList.toggle('sc-member-dimmed', !memberMatch);
                });
            } else {
                cell.classList.remove('sc-spotlight-match', 'sc-spotlight-single');
                cell.classList.add('sc-spotlight-dimmed');
                cell.querySelectorAll('.sc-stacked-member, .sc-stacked-avatar').forEach(el => {
                    el.classList.remove('sc-member-match', 'sc-member-dimmed');
                });
            }
        });

        // Auto-scroll to single match if out of view
        if (matchCount === 1) {
            const singleCell = document.querySelector('#scGridContainer .sc-cell.sc-spotlight-match');
            if (singleCell && typeof singleCell.scrollIntoView === 'function') {
                singleCell.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }
        }

        // 3. Sidebar chips
        document.querySelectorAll('#scStudentList .sc-student-chip').forEach(chip => {
            const chipId = chip.dataset.resultId;
            if (matchedStudentIds.has(chipId)) {
                chip.classList.remove('sc-spotlight-dimmed');
                chip.classList.add('sc-spotlight-match');
            } else {
                chip.classList.remove('sc-spotlight-match');
                chip.classList.add('sc-spotlight-dimmed');
            }
        });
    },

    async _switchClassFromSearch(classId, studentId = null, term = '') {
        if (typeof ClassUIManager?.handleClassSwitch === 'function') {
            await ClassUIManager.handleClassSwitch(classId, studentId);
        } else {
            await ClassManager.switchClass(classId);
        }

        if (!this._isActive) {
            CrossClassSearchManager.clearListSearch({ renderList: false });
            return;
        }

        // Maintenir la barre de recherche ouverte avec le terme actif en vue Plan
        const searchWrap = document.getElementById('scFloatingSearch');
        const searchInput = document.getElementById('scFloatingSearchInput');
        if (searchWrap) {
            searchWrap.classList.add('open');
            searchWrap.classList.toggle('has-value', Boolean(term));
        }
        if (searchInput && term) searchInput.value = term;
        this._searchQueryAtPlanEnter = '';

        // Ré-appliquer le spotlight dans la nouvelle classe (compteur à 1, halo actif)
        if (term) {
            this._applySearchHighlight(term);
        }

        // Focaliser l'élève ciblé (centrage écran + FocusPanel en consultation ou sélection en édition)
        if (studentId) {
            this._focusStudentAfterSwitch(studentId);
        }
    },

    _focusStudentAfterSwitch(studentId) {
        setTimeout(() => {
            // A. Si l'élève est placé sur une table
            const cells = document.querySelectorAll('#scGridContainer .sc-cell');
            for (const cell of cells) {
                const r = Number(cell.dataset.row);
                const c = Number(cell.dataset.col);
                const content = this._gridState[r]?.[c];
                const ids = Array.isArray(content) ? content : (content ? [content] : []);
                if (ids.includes(studentId)) {
                    cell.classList.add('sc-spotlight-match', 'sc-spotlight-single');
                    if (typeof cell.scrollIntoView === 'function') {
                        cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    }

                    if (!this._isLocked && !this._selectedChipIds.includes(studentId)) {
                        this._toggleChipSelection(studentId);
                    }
                    return;
                }
            }

            // B. Si l'élève est dans la liste latérale
            const chip = document.querySelector(`#scStudentList .sc-student-chip[data-result-id="${studentId}"]`);
            if (chip) {
                chip.classList.add('sc-spotlight-match');
                if (typeof chip.scrollIntoView === 'function') {
                    chip.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                if (!this._isLocked && !this._selectedChipIds.includes(studentId)) {
                    this._toggleChipSelection(studentId);
                }
            }
        }, 220);
    }
};
