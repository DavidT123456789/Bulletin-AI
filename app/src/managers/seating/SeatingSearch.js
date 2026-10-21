/**
 * @fileoverview Seating Chart Search, Spotlight & Cross-Class Navigation
 * Extracted from SeatingChartManager for modularity (facade pattern via object spread).
 * @module managers/seating/SeatingSearch
 */

import { FocusPanelManager } from '../FocusPanelManager.js';
import { Utils } from '../../utils/Utils.js';
import { ClassManager } from '../ClassManager.js';
import { CrossClassSearchManager } from '../CrossClassSearchManager.js';
import { ClassUIManager } from '../ClassUIManager.js';

export const SeatingSearch = {
    // ========================================================================
    // SEARCH & SPOTLIGHT
    // ========================================================================

    _openSearch() {
        const wrap = document.getElementById('scFloatingSearch');
        const input = document.getElementById('scFloatingSearchInput');
        if (!wrap || !input) return;
        wrap.classList.add('open');
        requestAnimationFrame(() => {
            input.focus({ preventScroll: true });
            input.select();
        });
    },

    _closeSearch() {
        const wrap = document.getElementById('scFloatingSearch');
        const input = document.getElementById('scFloatingSearchInput');
        if (!wrap) return;
        wrap.classList.remove('open');
        if (input) input.value = '';
        this._applySearchHighlight('');
        const sug = document.getElementById('scFloatingSearchSuggestions');
        if (sug) {
            sug.style.display = 'none';
            sug.innerHTML = '';
        }
    },

    _isSearchOpen() {
        return document.getElementById('scFloatingSearch')?.classList.contains('open') || false;
    },

    _handleSearchEscape() {
        const input = document.getElementById('scFloatingSearchInput');
        if (input && input.value) {
            input.value = '';
            this._applySearchHighlight('');
            input.focus();
        } else {
            this._closeSearch();
        }
    },

    async _handleSearchEnter(value) {
        const cleaned = (value || '').trim();
        if (!cleaned) return;

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
        } else {
            const crossData = CrossClassSearchManager.searchAcrossClasses(cleaned);
            if (crossData.groups && crossData.groups.length > 0) {
                const firstGroup = crossData.groups[0];
                const targetClassId = firstGroup.classId;
                const targetStudentId = firstGroup.students?.[0]?.id;
                const sug = document.getElementById('scFloatingSearchSuggestions');
                if (sug) {
                    sug.style.display = 'none';
                    sug.innerHTML = '';
                }
                await this._switchClassFromSearch(targetClassId, targetStudentId, cleaned);
            }
        }
    },

    _applySearchHighlight(term) {
        const cleaned = (term || '').trim();
        this._activeSearchTerm = cleaned;
        this._searchMatchIndex = 0;

        const view = document.getElementById('seatingChartView');
        const countBadge = document.getElementById('scFloatingSearchCount');
        const clearBtn = document.getElementById('scFloatingSearchClear');
        const suggestionsEl = document.getElementById('scFloatingSearchSuggestions');

        if (clearBtn) {
            clearBtn.classList.toggle('visible', cleaned.length > 0);
        }

        if (!cleaned) {
            if (view) view.classList.remove('sc-search-active');
            if (countBadge) {
                countBadge.textContent = '';
                countBadge.style.display = 'none';
            }
            if (suggestionsEl) {
                suggestionsEl.style.display = 'none';
                suggestionsEl.innerHTML = '';
            }
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

        // 1. Matched students in current class
        const matchedStudentIds = new Set();
        const currentClassName = this._getCurrentClass()?.name || Utils.getCurrentClassName();
        (this._students || []).forEach(student => {
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

        // 4. Cross-class suggestions if 0 matches and term >= 2
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
                    return `
                        <button class="sc-cross-action" type="button" data-class-id="${group.classId}" data-student-id="${student.id || ''}">
                            <iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon>
                            <span class="sc-cross-action-label">${Utils.escapeHtml(fullName)}</span>
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
                suggestionsEl.style.display = 'block';

                suggestionsEl.querySelectorAll('.sc-cross-action').forEach(actionBtn => {
                    actionBtn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                    });
                    actionBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const targetClassId = actionBtn.dataset.classId;
                        const targetStudentId = actionBtn.dataset.studentId;
                        if (targetClassId) {
                            suggestionsEl.style.display = 'none';
                            suggestionsEl.innerHTML = '';
                            await this._switchClassFromSearch(targetClassId, targetStudentId, this._activeSearchTerm || cleaned);
                        }
                    });
                });
            } else {
                suggestionsEl.style.display = 'none';
                suggestionsEl.innerHTML = '';
            }
        } else if (suggestionsEl) {
            suggestionsEl.style.display = 'none';
            suggestionsEl.innerHTML = '';
        }
    },

    async _switchClassFromSearch(classId, studentId = null, term = '') {
        if (typeof ClassUIManager?.handleClassSwitch === 'function') {
            await ClassUIManager.handleClassSwitch(classId, studentId);
        } else {
            await ClassManager.switchClass(classId);
        }

        // Maintenir la barre de recherche ouverte avec le terme actif
        const searchWrap = document.getElementById('scFloatingSearch');
        const searchInput = document.getElementById('scFloatingSearchInput');
        if (searchWrap) searchWrap.classList.add('open');
        if (searchInput && term) searchInput.value = term;

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
