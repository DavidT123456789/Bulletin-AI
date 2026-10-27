/**
 * @fileoverview TrombiStudentMatcher — Réconciliation de classe, appariement élèves ↔ zones, décalages et popover de recherche
 * Extrait de TrombinoscopeManager.js (Lot 12 — Découpage God Object #2)
 * @module managers/trombinoscope/TrombiStudentMatcher
 */

import { appState } from '../../state/State.js';
import { UI } from '../UIManager.js';
import { ClassManager } from '../ClassManager.js';
import { Utils } from '../../utils/Utils.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { getSampleTrombiStudents } from '../../data/SampleData.js';

export const TrombiStudentMatcher = {
    getSampleFallbackStudents() {
        return getSampleTrombiStudents();
    },

    getTargetClassInfo(manager) {
        const existingClasses = ClassManager.getAllClasses?.() || [];
        const currentClass = ClassManager.getCurrentClass?.();

        if (!manager._parsedPdfData) {
            const filtered = appState.filteredResults || [];
            const classScoped = currentClass
                ? (appState.generatedResults || []).filter(r => r.classId === currentClass.id)
                : [];
            let existingClassStudents = filtered.length > 0
                ? filtered
                : classScoped;
            if (existingClassStudents.length === 0 && typeof manager._imageSrc === 'string' && manager._imageSrc.includes('sample-trombinoscope.png')) {
                existingClassStudents = manager._getSampleFallbackStudents();
            }
            return {
                targetClass: currentClass,
                existingClassStudents,
                newStudents: [],
                existingStudents: existingClassStudents,
                isUpdate: false
            };
        }

        const rawTargetName = (manager._parsedPdfData.className || 'Nouvelle Classe').trim();
        const targetName = Utils.formatClassDisplayName ? Utils.formatClassDisplayName(rawTargetName) : rawTargetName;
        const hasStudents = currentClass && (appState.generatedResults || []).some(r => r.classId === currentClass.id);
        const isDemo = currentClass && ClassManager.isDemoClass ? ClassManager.isDemoClass(currentClass.id) : false;

        const pdfStudents = manager._parsedPdfData.students || [];

        // 1. Recherche correspondance exacte (insensible à la casse sur nom formaté ou brut)
        let targetClass = existingClasses.find(c =>
            c.name.toLowerCase() === targetName.toLowerCase() ||
            c.name.toLowerCase() === rawTargetName.toLowerCase()
        );

        // 2. Recherche tolérante / normalisée (ex: "5°1" vs "5 1", "6ème A" vs "6 A")
        if (!targetClass && Utils.normalizeClassName) {
            const targetNorm = Utils.normalizeClassName(targetName);
            const rawNorm = Utils.normalizeClassName(rawTargetName);
            if (targetNorm || rawNorm) {
                targetClass = existingClasses.find(c => {
                    const cNorm = Utils.normalizeClassName(c.name);
                    return (targetNorm && cNorm === targetNorm) || (rawNorm && cNorm === rawNorm);
                });
            }
        }

        // 3. Réutilisation de la classe active si vide et non-démo
        const reusedEmptyClass = Boolean(!targetClass && currentClass && !hasStudents && !isDemo);
        if (reusedEmptyClass) {
            targetClass = currentClass;
        }

        const hasRealPdfClassName = Boolean(manager._parsedPdfData.className) && !/^(classe|nouvelle classe)$/i.test(rawTargetName);
        const shouldRename = reusedEmptyClass && hasRealPdfClassName;

        const existingClassStudents = targetClass
            ? (appState.generatedResults || []).filter(r => r.classId === targetClass.id)
            : [];

        const existingStudents = [];
        const newStudents = [];

        for (const pdfS of pdfStudents) {
            const matched = existingClassStudents.find(es =>
                es.id === pdfS.id ||
                Utils.normalizeName(es.nom, es.prenom) === Utils.normalizeName(pdfS.nom, pdfS.prenom)
            );
            if (matched) {
                existingStudents.push({ ...pdfS, matchedExisting: matched });
            } else {
                newStudents.push(pdfS);
            }
        }

        return {
            targetClass,
            targetName,
            shouldRename,
            existingClassStudents,
            newStudents,
            existingStudents,
            isUpdate: existingStudents.length > 0
        };
    },

    getStudentsForImport(manager) {
        if (manager._parsedPdfData && manager._parsedPdfData.students) {
            return manager._parsedPdfData.students;
        }
        const allStudents = manager._getTargetClassInfo().existingClassStudents;
        const excludeWithPhotos = document.getElementById('trombiExcludeWithPhotos')?.checked ?? true;
        if (excludeWithPhotos) {
            const withoutPhotos = allStudents.filter(s => !s.studentPhoto?.data);
            if (withoutPhotos.length === 0 && allStudents.length > 0 && !manager._userToggledExcludeFilter) {
                return allStudents;
            }
            return withoutPhotos;
        }
        return allStudents;
    },

    autoAssignSilent(manager, silent = false) {
        const students = manager._getStudentsForImport();
        manager._zones.forEach((zone, idx) => {
            zone.studentId = students[idx]?.id || null;
        });
        if (!silent) {
            manager._renderZones();
            manager._renderAssignmentGrid();
        }
    },

    insertGapAndShiftDown(manager, zoneId) {
        const sortedZones = [...manager._zones].sort((a, b) => a.id - b.id);
        const fromIdx = sortedZones.findIndex(z => z.id === zoneId);
        if (fromIdx === -1) return;

        // Guard: do nothing if neither this zone nor any subsequent zone has an assigned student
        const hasAnyStudentFromHere = sortedZones.slice(fromIdx).some(z => Boolean(z.studentId));
        if (!hasAnyStudentFromHere) return;

        manager._closeStudentPopover();
        manager._saveState();

        // Shift student IDs down
        for (let j = sortedZones.length - 1; j > fromIdx; j--) {
            sortedZones[j].studentId = sortedZones[j - 1].studentId;
        }

        // Set the current zone to null (empty)
        sortedZones[fromIdx].studentId = null;

        manager._clearZoneSelection();
        manager._renderZones();
        manager._renderAssignmentGrid();
    },

    removeAndShiftUp(manager, zoneId) {
        const sortedZones = [...manager._zones].sort((a, b) => a.id - b.id);
        const fromIdx = sortedZones.findIndex(z => z.id === zoneId);
        if (fromIdx === -1) return;

        // Guard: do nothing if neither this zone nor any subsequent zone has an assigned student
        const hasAnyStudentFromHere = sortedZones.slice(fromIdx).some(z => Boolean(z.studentId));
        if (!hasAnyStudentFromHere) return;

        manager._closeStudentPopover();
        manager._saveState();

        const removedStudentId = sortedZones[fromIdx].studentId;
        const previousTailStudentId = sortedZones[sortedZones.length - 1]?.studentId || null;

        // Shift student IDs up
        for (let j = fromIdx; j < sortedZones.length - 1; j++) {
            sortedZones[j].studentId = sortedZones[j + 1].studentId;
        }

        // Pull the next unassigned student from the ordered list if the tail had a student
        let nextTailStudentId = null;
        if (previousTailStudentId && sortedZones.length > 0) {
            const orderedStudents = manager._getStudentsForImport();
            const tailIdx = orderedStudents.findIndex(s => s.id === previousTailStudentId);
            if (tailIdx !== -1) {
                for (let k = tailIdx + 1; k < orderedStudents.length; k++) {
                    const candidateId = orderedStudents[k]?.id;
                    if (!candidateId || candidateId === removedStudentId) continue;
                    const alreadyAssigned = sortedZones.slice(0, -1).some(z => z.studentId === candidateId) ||
                        (manager._parsedPdfData?.pages?.some((p, pIdx) => pIdx !== manager._currentPageIndex && (p.zones || []).some(z => z.studentId === candidateId)));
                    if (!alreadyAssigned) {
                        nextTailStudentId = candidateId;
                        break;
                    }
                }
            }
        }

        sortedZones[sortedZones.length - 1].studentId = nextTailStudentId;

        manager._clearZoneSelection();
        manager._renderZones();
        manager._renderAssignmentGrid();
    },

    isAutoAssignedInOrder(manager, sortedZones = [...manager._zones].sort((a, b) => a.id - b.id)) {
        if (sortedZones.length === 0) return true;
        let students = manager._getStudentsForImport();
        if (manager._parsedPdfData && manager._parsedPdfData.numPages > 1) {
            const pageOffset = manager._getPageOffset();
            students = students.slice(pageOffset, pageOffset + sortedZones.length);
        }
        if (students.length === 0) return true;
        return sortedZones.every((zone, idx) => (zone.studentId || null) === (students[idx]?.id || null));
    },

    autoAssignInOrder(manager) {
        const sortedZones = [...manager._zones].sort((a, b) => a.id - b.id);
        if (manager._isAutoAssignedInOrder(sortedZones)) return;

        manager._closeStudentPopover();
        manager._saveState();
        let students = manager._getStudentsForImport();
        if (manager._parsedPdfData && manager._parsedPdfData.numPages > 1) {
            const pageOffset = manager._getPageOffset();
            students = students.slice(pageOffset, pageOffset + sortedZones.length);
        }
        sortedZones.forEach((zone, idx) => {
            zone.studentId = students[idx]?.id || null;
        });
        manager._renderZones();
        manager._renderAssignmentGrid();
    },

    getAssignmentContext(manager) {
        const targetInfo = manager._getTargetClassInfo();
        const existingClassStudents = targetInfo.existingClassStudents;
        const isPdfMode = !!manager._parsedPdfData;
        let allStudents = [];

        if (isPdfMode && manager._parsedPdfData.students) {
            allStudents = manager._parsedPdfData.students.map(pdfS => {
                const matched = existingClassStudents.find(es =>
                    es.id === pdfS.id ||
                    Utils.normalizeName(es.nom, es.prenom) === Utils.normalizeName(pdfS.nom, pdfS.prenom)
                );
                return {
                    id: pdfS.id,
                    nom: pdfS.nom,
                    prenom: pdfS.prenom,
                    originClass: pdfS.originClass || null,
                    classe: pdfS.classe || null,
                    studentPhoto: matched?.studentPhoto || null,
                    matchedExistingId: matched?.id || null,
                    isNew: !matched
                };
            });
        } else {
            allStudents = existingClassStudents.map(s => ({ ...s, isNew: false }));
        }

        const rawExcludeChecked = document.getElementById('trombiExcludeWithPhotos')?.checked ?? true;
        const withoutPhotosCount = allStudents.filter(s => !s.studentPhoto?.data).length;
        const excludeWithPhotos = !isPdfMode && rawExcludeChecked && (withoutPhotosCount > 0 || manager._userToggledExcludeFilter);
        const pageOffset = manager._getPageOffset();
        const sortedZones = [...manager._zones].sort((a, b) => a.id - b.id);
        const getDropdownStudents = (zoneStudentId) => allStudents.filter(s =>
            s.id === zoneStudentId || !(excludeWithPhotos && s.studentPhoto?.data)
        );

        return {
            targetInfo,
            allStudents,
            isPdfMode,
            excludeWithPhotos,
            pageOffset,
            sortedZones,
            getDropdownStudents
        };
    },

    getAssignedZoneNumber(manager, studentId, excludeZoneId, sortedZones = [...manager._zones].sort((a, b) => a.id - b.id)) {
        if (!studentId) return null;
        if (manager._parsedPdfData && manager._parsedPdfData.numPages > 1) {
            for (let pIdx = 0; pIdx < manager._parsedPdfData.pages.length; pIdx++) {
                const rawZones = (pIdx === manager._currentPageIndex) ? manager._zones : (manager._parsedPdfData.pages[pIdx].zones || []);
                const pageSorted = [...rawZones].sort((a, b) => a.id - b.id);
                const zIdx = pageSorted.findIndex(z => z.studentId === studentId && !(pIdx === manager._currentPageIndex && z.id === excludeZoneId));
                if (zIdx !== -1) {
                    return manager._getPageOffset(pIdx) + zIdx + 1;
                }
            }
            return null;
        }
        const zIdx = sortedZones.findIndex(z => z.studentId === studentId && z.id !== excludeZoneId);
        return zIdx !== -1 ? (manager._getPageOffset() + zIdx + 1) : null;
    },

    assignStudentToZone(manager, zoneId, studentId) {
        const normalizedStudentId = studentId || null;
        const zone = manager._zones.find(z => z.id === zoneId);
        if (!zone) {
            manager._closeStudentPopover();
            return;
        }
        if ((zone.studentId || null) === normalizedStudentId) {
            manager._closeStudentPopover();
            return;
        }

        manager._closeStudentPopover();
        manager._saveState();

        const previousStudentId = zone.studentId || null;

        // If selecting a student already assigned to another zone, swap their assignments (including across PDF pages)
        if (normalizedStudentId) {
            const existingZone = manager._zones.find(z => z.studentId === normalizedStudentId && z.id !== zoneId);
            if (existingZone) {
                existingZone.studentId = previousStudentId;
            } else if (manager._parsedPdfData?.pages) {
                for (let pIdx = 0; pIdx < manager._parsedPdfData.pages.length; pIdx++) {
                    if (pIdx === manager._currentPageIndex) continue;
                    const otherPageZone = (manager._parsedPdfData.pages[pIdx].zones || []).find(z => z.studentId === normalizedStudentId);
                    if (otherPageZone) {
                        otherPageZone.studentId = previousStudentId;
                        break;
                    }
                }
            }
        }

        zone.studentId = normalizedStudentId;

        manager._clearZoneSelection();
        manager._renderZones();
        manager._renderAssignmentGrid();
    },

    closeStudentPopover(manager, restoreFocus = false) {
        const prevZoneId = manager._openPopoverZoneId;
        manager._openPopoverZoneId = null;

        if (manager._outsidePopoverHandler && typeof document !== 'undefined') {
            document.removeEventListener('mousedown', manager._outsidePopoverHandler, true);
            manager._outsidePopoverHandler = null;
        }

        if (typeof document === 'undefined') return;

        document.querySelectorAll('.trombi-student-popover').forEach(el => el.remove());
        document.querySelectorAll('#trombiAssignmentGrid .assignment-row.is-dropdown-open').forEach(row => {
            row.classList.remove('is-dropdown-open');
        });
        document.querySelectorAll('#trombiAssignmentGrid .assignment-combobox-btn[aria-expanded="true"]').forEach(btn => {
            btn.setAttribute('aria-expanded', 'false');
        });

        if (prevZoneId !== null) {
            manager._clearZoneSelection();
        }

        if (restoreFocus && prevZoneId !== null) {
            const triggerBtn = document.querySelector(`#trombiAssignmentGrid .assignment-combobox-btn[data-zone-id="${prevZoneId}"]`);
            triggerBtn?.focus?.({ preventScroll: true });
        }
    },

    toggleStudentPopover(manager, zoneId, triggerBtn) {
        if (manager._openPopoverZoneId === zoneId) {
            manager._closeStudentPopover(false);
            triggerBtn?.blur?.();
            return;
        }
        manager._openStudentPopover(zoneId, triggerBtn);
    },

    openStudentPopover(manager, zoneId, triggerBtn) {
        manager._closeStudentPopover(false);

        const zone = manager._zones.find(z => z.id === zoneId);
        const container = document.getElementById('trombiAssignmentGrid');
        if (!zone || !container) return;

        manager._openPopoverZoneId = zoneId;
        manager._selectSingleZone(zoneId, false);

        const row = triggerBtn?.closest('.assignment-row') || container.querySelector(`.assignment-row[data-zone-id="${zoneId}"]`);
        row?.classList.add('is-dropdown-open');
        triggerBtn?.setAttribute('aria-expanded', 'true');

        const { targetInfo, allStudents, isPdfMode, excludeWithPhotos, pageOffset, sortedZones, getDropdownStudents } = manager._getAssignmentContext();
        const dropdownStudents = getDropdownStudents(zone.studentId);
        const currentZoneDisplayNum = pageOffset + sortedZones.findIndex(z => z.id === zone.id) + 1;
        const studentsWithPhotoCount = dropdownStudents.filter(s => Boolean(s.studentPhoto?.data)).length;
        const showPhotoIndicator = !isPdfMode && studentsWithPhotoCount > 0 && studentsWithPhotoCount < dropdownStudents.length;

        const host = container.closest('.trombi-assignment-panel') || container.parentElement || document.body;
        const popover = document.createElement('div');
        popover.className = 'trombi-student-popover';
        popover.dataset.zoneId = String(zoneId);

        const showSearch = dropdownStudents.length > 5;
        popover.innerHTML = `
            ${showSearch ? `
                <div class="trombi-popover-search">
                    <iconify-icon icon="solar:magnifer-linear" class="trombi-popover-search-icon" aria-hidden="true"></iconify-icon>
                    <input type="text" class="trombi-popover-search-input custom-input" placeholder="Rechercher un élève..." autocomplete="off" spellcheck="false" aria-label="Rechercher un élève">
                </div>
            ` : ''}
            <div class="trombi-popover-list" role="listbox" aria-label="Liste des élèves"></div>
        `;

        const listEl = popover.querySelector('.trombi-popover-list');
        const searchInput = popover.querySelector('.trombi-popover-search-input');

        let activeOptionIdx = -1;

        const syncActiveOption = (nextIdx) => {
            const options = listEl.querySelectorAll('.trombi-popover-option');
            if (options.length === 0) {
                activeOptionIdx = -1;
                return;
            }
            activeOptionIdx = ((nextIdx % options.length) + options.length) % options.length;
            options.forEach((opt, i) => {
                const isActive = i === activeOptionIdx;
                opt.classList.toggle('is-active', isActive);
                if (isActive) {
                    opt.scrollIntoView?.({ block: 'nearest' });
                }
            });
        };

        const renderList = (query = '') => {
            const normQuery = Utils.normalizeName(query, '');
            const filtered = normQuery
                ? dropdownStudents.filter(s => Utils.normalizeName(s.nom, s.prenom).includes(normQuery))
                : dropdownStudents;

            if (filtered.length === 0) {
                if (!normQuery && excludeWithPhotos && allStudents.length > 0) {
                    listEl.innerHTML = `
                        <div class="trombi-popover-empty">
                            <span>Tous les élèves ont déjà une photo.</span>
                            <button type="button" class="trombi-popover-empty-btn" data-action="show-all-students">
                                Afficher tous les élèves (${allStudents.length})
                            </button>
                        </div>
                    `;
                } else if (!normQuery && allStudents.length === 0) {
                    listEl.innerHTML = `
                        <div class="trombi-popover-empty">
                            <span>Aucun élève dans cette classe.</span>
                        </div>
                    `;
                } else {
                    listEl.innerHTML = `
                        <div class="trombi-popover-empty">
                            <span>Aucun élève trouvé</span>
                        </div>
                    `;
                }
                activeOptionIdx = -1;
                FocusPanelManager.updateScrollAffordances(listEl);
                return;
            }

            const clearOptionHtml = (!normQuery && zone.studentId)
                ? `
                    <button type="button" class="trombi-popover-option is-clear-option" role="option" data-student-id="">
                        <span class="trombi-option-main">
                            <iconify-icon icon="solar:close-circle-linear" class="trombi-option-clear-icon" aria-hidden="true"></iconify-icon>
                            <span class="trombi-option-label">Aucun élève (vider la zone)</span>
                        </span>
                    </button>
                    <div class="trombi-popover-divider" role="separator"></div>
                `
                : '';

            const optionsHtml = filtered.map(s => {
                const isSelected = zone.studentId === s.id;
                const otherZoneNum = manager._getAssignedZoneNumber(s.id, zone.id, sortedZones);
                const hasPhoto = showPhotoIndicator && Boolean(s.studentPhoto?.data);
                const isNewStudent = isPdfMode && targetInfo.isUpdate && Boolean(s.isNew);
                const studentNameFormatted = Utils.formatStudentName(s.nom, s.prenom);

                const badges = [];
                if (isNewStudent) {
                    badges.push('<span class="trombi-option-badge is-new">Nouveau</span>');
                }
                if (hasPhoto) {
                    badges.push('<span class="trombi-option-badge is-has-photo" title="Possède déjà une photo"><iconify-icon icon="solar:camera-minimalistic-linear"></iconify-icon></span>');
                }
                if (isSelected && currentZoneDisplayNum > 0) {
                    badges.push(`<span class="trombi-option-badge is-current" title="Assigné à cette zone #${currentZoneDisplayNum}"><iconify-icon icon="ph:check-bold"></iconify-icon>#${currentZoneDisplayNum}</span>`);
                } else if (otherZoneNum !== null) {
                    badges.push(`<span class="trombi-option-badge is-swap" title="Échanger avec la zone #${otherZoneNum}"><iconify-icon icon="ph:arrows-left-right"></iconify-icon>#${otherZoneNum}</span>`);
                }

                return `
                    <button type="button" class="trombi-popover-option ${isSelected ? 'is-selected' : ''}" role="option" aria-selected="${isSelected}" data-student-id="${s.id}">
                        <span class="trombi-option-main">
                            <span class="trombi-option-label">${studentNameFormatted}</span>
                        </span>
                        ${badges.length > 0 ? `<span class="trombi-option-meta">${badges.join('')}</span>` : ''}
                    </button>
                `;
            }).join('');

            listEl.innerHTML = clearOptionHtml + optionsHtml;

            const allOpts = Array.from(listEl.querySelectorAll('.trombi-popover-option'));
            const selectedIdx = allOpts.findIndex(o => o.classList.contains('is-selected'));
            if (normQuery && allOpts.length > 0) {
                activeOptionIdx = selectedIdx !== -1 ? selectedIdx : 0;
                allOpts[activeOptionIdx]?.classList.add('is-active');
            } else {
                activeOptionIdx = selectedIdx;
            }
            FocusPanelManager.updateScrollAffordances(listEl);
        };

        renderList('');
        host.appendChild(popover);

        const anchorEl = row || triggerBtn;
        if (anchorEl?.getBoundingClientRect && host.getBoundingClientRect) {
            const hostRect = host.getBoundingClientRect();
            const anchorRect = anchorEl.getBoundingClientRect();
            const gridRect = container.getBoundingClientRect?.() || hostRect;
            if (hostRect.height > 0 && anchorRect.height > 0) {
                const topLimit = Math.max(hostRect.top, gridRect.top);
                const spaceBelow = hostRect.bottom - anchorRect.bottom;
                const spaceAbove = anchorRect.top - topLimit;
                const openUpward = spaceBelow < 190 && spaceAbove > spaceBelow;
                if (openUpward) {
                    popover.classList.add('is-upward');
                    popover.style.bottom = `${Math.max(6, Math.round(hostRect.bottom - anchorRect.top + 6))}px`;
                    popover.style.maxHeight = `${Math.max(140, Math.min(280, Math.floor(spaceAbove - 8)))}px`;
                } else {
                    popover.style.top = `${Math.max(6, Math.round(anchorRect.bottom - hostRect.top + 6))}px`;
                    popover.style.maxHeight = `${Math.max(140, Math.min(280, Math.floor(spaceBelow - 10)))}px`;
                }
            }
        }

        const selectedOpt = listEl.querySelector('.trombi-popover-option.is-selected');
        if (selectedOpt && listEl.clientHeight > 0) {
            const optTop = selectedOpt.offsetTop;
            const optBottom = optTop + selectedOpt.offsetHeight;
            if (optBottom > listEl.clientHeight) {
                listEl.scrollTop = Math.max(0, optBottom - listEl.clientHeight + 8);
            }
        }
        FocusPanelManager.bindScrollAffordances(listEl);

        listEl.addEventListener('mouseover', (e) => {
            const opt = e.target.closest('.trombi-popover-option');
            if (!opt) return;
            listEl.querySelectorAll('.trombi-popover-option.is-active').forEach(el => el.classList.remove('is-active'));
        });

        listEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const showAllBtn = e.target.closest('[data-action="show-all-students"]');
            if (showAllBtn) {
                const excludeInput = document.getElementById('trombiExcludeWithPhotos');
                if (excludeInput) {
                    excludeInput.checked = false;
                }
                manager._userToggledExcludeFilter = true;
                manager._closeStudentPopover(false);
                manager._autoAssignSilent();
                const refreshedBtn = document.querySelector(`#trombiAssignmentGrid .assignment-combobox-btn[data-zone-id="${zoneId}"]`);
                if (refreshedBtn) {
                    manager._openStudentPopover(zoneId, refreshedBtn);
                }
                return;
            }

            const optionBtn = e.target.closest('.trombi-popover-option');
            if (!optionBtn) return;
            manager._assignStudentToZone(zoneId, optionBtn.dataset.studentId || null);
        });

        searchInput?.addEventListener('input', (e) => {
            renderList(e.target.value);
        });

        popover.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                syncActiveOption(activeOptionIdx + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                syncActiveOption(activeOptionIdx <= 0 ? 0 : activeOptionIdx - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const options = listEl.querySelectorAll('.trombi-popover-option');
                const targetOpt = options[activeOptionIdx] || options[0];
                if (targetOpt) {
                    manager._assignStudentToZone(zoneId, targetOpt.dataset.studentId || null);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                manager._closeStudentPopover(true);
            }
        });

        if (searchInput) {
            searchInput.focus?.({ preventScroll: true });
        } else {
            popover.setAttribute('tabindex', '-1');
            popover.focus?.({ preventScroll: true });
        }

        manager._outsidePopoverHandler = (e) => {
            if (popover.contains(e.target) || triggerBtn?.contains(e.target)) return;
            manager._closeStudentPopover(false);
        };
        document.addEventListener('mousedown', manager._outsidePopoverHandler, true);
    },

    renderAssignmentGrid(manager) {
        const container = document.getElementById('trombiAssignmentGrid');
        if (!container) return;

        manager._closeStudentPopover(false);

        const {
            targetInfo,
            allStudents,
            isPdfMode,
            pageOffset,
            sortedZones,
            getDropdownStudents
        } = manager._getAssignmentContext();

        const panelHeaderTitle = document.querySelector('.trombi-assignment-panel-header h4');
        if (panelHeaderTitle) {
            const newCount = targetInfo.newStudents.length;
            const newPill = (targetInfo.isUpdate && newCount > 0)
                ? ` <span class="trombi-header-count-pill is-new">+${newCount} nouveau${newCount > 1 ? 'x' : ''}</span>`
                : '';
            panelHeaderTitle.innerHTML = `Associer les élèves aux zones${newPill}`;
        }

        const autoAssignBtn = document.getElementById('trombiAutoAssignBtn');
        if (autoAssignBtn) {
            const isInOrder = manager._isAutoAssignedInOrder(sortedZones);
            autoAssignBtn.classList.toggle('disabled', isInOrder);
            autoAssignBtn.setAttribute('aria-disabled', String(isInOrder));
            autoAssignBtn.setAttribute(
                'data-tooltip',
                isInOrder
                    ? 'Déjà assigné dans l\'ordre alphabétique (A→Z)'
                    : 'Réassigner dans l\'ordre alphabétique (A→Z)'
            );
        }

        if (manager._zones.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <iconify-icon icon="solar:cursor-linear"></iconify-icon>
                    <p>Cliquez sur l'image pour ajouter des zones</p>
                </div>
            `;
            FocusPanelManager.updateScrollAffordances(container);
            return;
        }

        container.innerHTML = `
            ${sortedZones.map((zone, index) => {
                const dropdownStudents = getDropdownStudents(zone.studentId);
                const assignedStudent = allStudents.find(s => s.id === zone.studentId);
                const assignedName = assignedStudent ? Utils.formatStudentName(assignedStudent.nom, assignedStudent.prenom) : '';
                const isAssigned = !!assignedStudent;
                const isNew = assignedStudent?.isNew ?? false;
                const isNewRow = isAssigned && isPdfMode && targetInfo.isUpdate && isNew;
                const isFocused = manager._lastFocusedZoneId === zone.id;
                const zoneNumber = pageOffset + index + 1;
                const hasStudentFromHere = sortedZones.slice(index).some(z => Boolean(z.studentId));
                const shiftDownTooltip = hasStudentFromHere
                    ? 'Insérer un vide ici (décaler la suite vers le bas)'
                    : 'Aucun élève à décaler à partir de cette zone';
                const shiftUpTooltip = !hasStudentFromHere
                    ? 'Aucun élève à remonter à partir de cette zone'
                    : (isAssigned
                        ? 'Retirer cet élève et remonter les suivants'
                        : 'Combler ce vide (remonter les élèves suivants)');

                const badgeHtml = isNewRow
                    ? `<span class="trombi-student-badge is-new" data-tooltip="Nouvel élève à ajouter"><iconify-icon icon="solar:user-plus-rounded-bold"></iconify-icon>Nouveau</span>`
                    : '';

                return `
                    <div class="assignment-row ${isNewRow ? 'is-new-student' : ''} ${!isAssigned ? 'is-unassigned' : ''} ${isFocused ? 'focused' : ''}" data-zone-id="${zone.id}">
                        <div class="assignment-preview">
                            <canvas class="live-preview-canvas" 
                                    data-zone-id="${zone.id}" 
                                    width="80" height="80"></canvas>
                        </div>
                        <div class="assignment-id">
                            #${zoneNumber}
                        </div>
                        <div class="assignment-student-select">
                            <div class="assignment-select-wrapper">
                                <div class="assignment-select-box">
                                    <select class="assignment-select" data-zone-id="${zone.id}" tabindex="-1" aria-hidden="true">
                                        <option value="">Choisir un élève...</option>
                                        ${dropdownStudents.map(s => `<option value="${s.id}" ${zone.studentId === s.id ? 'selected' : ''}>${Utils.formatStudentName(s.nom, s.prenom)}</option>`).join('')}
                                    </select>
                                    <button type="button"
                                            class="assignment-combobox-btn ${isAssigned ? 'is-assigned' : 'is-placeholder'}"
                                            data-zone-id="${zone.id}"
                                            aria-haspopup="listbox"
                                            aria-expanded="false"
                                            aria-label="${isAssigned ? `Zone #${zoneNumber} : ${assignedName}` : `Choisir un élève pour la zone #${zoneNumber}`}">
                                        <span class="assignment-combobox-text">${isAssigned ? assignedName : 'Choisir un élève...'}</span>
                                        <iconify-icon icon="solar:alt-arrow-down-linear" class="assignment-select-chevron" aria-hidden="true"></iconify-icon>
                                    </button>
                                </div>
                                ${badgeHtml}
                            </div>
                        </div>
                        <div class="assignment-actions">
                            <button type="button" class="assignment-action-btn shift-down-btn ${!hasStudentFromHere ? 'disabled' : ''}" 
                                    data-zone-id="${zone.id}" 
                                    aria-disabled="${!hasStudentFromHere}"
                                    aria-label="${shiftDownTooltip}"
                                    data-tooltip="${shiftDownTooltip}">
                                <iconify-icon icon="ph:caret-double-down"></iconify-icon>
                            </button>
                            <button type="button" class="assignment-action-btn shift-up-btn ${!hasStudentFromHere ? 'disabled' : ''}" 
                                    data-zone-id="${zone.id}" 
                                    aria-disabled="${!hasStudentFromHere}"
                                    aria-label="${shiftUpTooltip}"
                                    data-tooltip="${shiftUpTooltip}">
                                <iconify-icon icon="ph:caret-double-up"></iconify-icon>
                            </button>
                            <button type="button" class="assignment-action-btn delete-zone-btn danger" 
                                    data-zone-id="${zone.id}" 
                                    aria-label="Supprimer la zone #${zoneNumber}"
                                    data-tooltip="Supprimer la zone #${zoneNumber}">
                                <iconify-icon icon="solar:trash-bin-trash-linear"></iconify-icon>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

        const zonesInfo = document.getElementById('trombiZonesInfo');
        if (zonesInfo) {
            const newCount = targetInfo.newStudents.length;
            const newBadgeHtml = (targetInfo.isUpdate && newCount > 0)
                ? ` • <span class="trombi-stat-badge is-new">+${newCount} nouveau${newCount > 1 ? 'x' : ''}</span>`
                : '';

            if (manager._parsedPdfData && manager._parsedPdfData.numPages > 1) {
                const totalZones = manager._parsedPdfData.pages.reduce((acc, p) => acc + (p.zones?.length || 0), 0);
                const totalAssigned = manager._parsedPdfData.pages.reduce((acc, p) => acc + (p.zones?.filter(z => z.studentId).length || 0), 0);
                zonesInfo.innerHTML = `${totalAssigned} / ${totalZones} zones assignées${newBadgeHtml}`;
            } else {
                const assignedCount = manager._zones.filter(z => z.studentId).length;
                zonesInfo.innerHTML = `${assignedCount} / ${manager._zones.length} zones assignées${newBadgeHtml}`;
            }
        }

        container.querySelectorAll('.assignment-select').forEach(select => {
            select.addEventListener('change', e => {
                const zoneId = parseInt(select.dataset.zoneId, 10);
                manager._assignStudentToZone(zoneId, e.target.value || null);
            });
        });

        container.querySelectorAll('.assignment-combobox-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const zoneId = parseInt(btn.dataset.zoneId, 10);
                manager._toggleStudentPopover(zoneId, btn);
            });
            btn.addEventListener('focus', () => {
                if (!btn.matches?.(':focus-visible')) return;
                const zoneId = parseInt(btn.dataset.zoneId, 10);
                manager._lastFocusedControl = 'zone';
                manager._lastFocusedZoneId = zoneId;
                manager._highlightZone(zoneId);
                manager._highlightAssignmentRow(zoneId, false);
            });
        });

        FocusPanelManager.bindScrollAffordances(container, () => {
            if (manager._openPopoverZoneId !== null) {
                manager._closeStudentPopover(false);
            }
        });

        container.querySelectorAll('.shift-down-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (btn.classList.contains('disabled')) return;
                const zoneId = parseInt(btn.dataset.zoneId, 10);
                manager._insertGapAndShiftDown(zoneId);
            });
        });

        container.querySelectorAll('.shift-up-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (btn.classList.contains('disabled')) return;
                const zoneId = parseInt(btn.dataset.zoneId, 10);
                manager._removeAndShiftUp(zoneId);
            });
        });

        container.querySelectorAll('.delete-zone-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const zoneId = parseInt(btn.dataset.zoneId, 10);
                manager._removeZone(zoneId);
            });
        });

        container.querySelectorAll('.assignment-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('select, .assignment-combobox-btn, .assignment-action-btn')) return;
                if (manager._openPopoverZoneId === null) {
                    manager._clearZoneSelection();
                    const zoneId = parseInt(row.dataset.zoneId, 10);
                    manager._highlightZone(zoneId);
                }
            });

            row.addEventListener('mouseenter', () => {
                if (manager._openPopoverZoneId !== null) return;
                if (manager._selectedZoneIds.size > 0 || manager._lastFocusedZoneId !== null) {
                    manager._clearZoneSelection();
                }
                const zoneId = parseInt(row.dataset.zoneId, 10);
                manager._highlightZone(zoneId);
            });

            row.addEventListener('mouseleave', () => {
                if (manager._openPopoverZoneId !== null) return;
                const overlay = document.getElementById('trombiZonesOverlay');
                overlay?.querySelectorAll('.trombi-zone.focused').forEach(z => z.classList.remove('focused'));
            });
        });

        manager._updateLivePreviews();
        UI.initTooltips?.();
    },

    highlightAssignmentRow(_manager, zoneId, scroll = true) {
        const container = document.getElementById('trombiAssignmentGrid');
        if (!container) return;

        container.querySelectorAll('.assignment-row').forEach(row => {
            row.classList.remove('focused');
        });

        const row = container.querySelector(`.assignment-row[data-zone-id="${zoneId}"]`);
        if (row) {
            row.classList.add('focused');

            if (scroll) {
                row.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }
};
