/**
 * @fileoverview Sous-module des modales de transfert d'élèves inter-classes (ClassUIManager)
 * Gère les modales « Affecter ou déplacer les élèves » (showMoveStudentsModal) et
 * « Piocher dans mes classes » (showPickExistingStudentsModal).
 *
 * @module managers/class/ClassStudentTransferModal
 */

import { DOMHelper } from '../../utils/DOMHelper.js';
import { appState, userSettings } from '../../state/State.js';
import { ClassManager } from '../ClassManager.js';
import { AppreciationsManager } from '../AppreciationsManager.js';
import { FocusPanelManager } from '../FocusPanelManager.js';
import { ListViewManager } from '../ListViewManager.js';
import { StudentDataManager } from '../StudentDataManager.js';
import { StudentPhotoManager } from '../StudentPhotoManager.js';
import { Utils } from '../../utils/Utils.js';

export const ClassStudentTransferModal = {
    /**
     * Affiche une modale pour déplacer ou copier un ou plusieurs élèves vers une autre classe / groupe
     * @param {string|Array<string>} studentIds - ID(s) des élèves concernés
     * @param {Function} [onSuccess] - Callback appelée après l'action réussie
     * @param {Object} [options] - Options facultatives ({ defaultMode: 'copy' | 'move' })
     */
    showMoveStudentsModal(studentIds, onSuccess = null, options = {}) {
        const ids = Array.isArray(studentIds) ? studentIds : [studentIds];
        if (ids.length === 0) return;

        const idSet = new Set(ids);
        const allResults = appState.generatedResults || [];
        const students = allResults.filter(r => r && idSet.has(r.id));
        if (students.length === 0) {
            this._ui?.showNotification('Aucun élève trouvé', 'error');
            return;
        }

        const isBulk = students.length > 1;
        const firstStudent = students[0];
        const currentClassId = firstStudent.classId;
        const allClassesAreSame = students.every(s => s.classId === currentClassId);

        let classes = ClassManager.getAllClasses().filter(c => !ClassManager.isDemoClass(c.id));
        if (allClassesAreSame) {
            classes = classes.filter(c => c.id !== currentClassId);
        }

        const classStudentCounts = new Map();
        for (const r of allResults) {
            if (r?.classId) {
                classStudentCounts.set(r.classId, (classStudentCounts.get(r.classId) || 0) + 1);
            }
        }

        const isViewingVirtualClass = ClassManager.isVirtualClass(appState.currentClassId);
        const currentClass = isViewingVirtualClass
            ? ClassManager.getClassById(appState.currentClassId)
            : ClassManager.getClassById(currentClassId);

        // Mode initial : 'copy' par défaut pour sécuriser la classe d'origine et faciliter l'affectation aux groupes
        let currentMode = options.defaultMode || 'copy';

        const getSubjectLabel = () => isBulk
            ? `<strong>${students.length} élèves</strong>`
            : `<strong>${this._escapeHtml(Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false))}</strong>`;

        const getOriginLabel = () => {
            if (!currentClass?.name) return '';
            return ` depuis <strong>${this._escapeHtml(Utils.formatClassDisplayName(currentClass.name))}</strong>`;
        };

        const getInstructionHtml = (mode) => {
            if (mode === 'copy') {
                return `Copier ${getSubjectLabel()}${getOriginLabel()} vers :`;
            }
            return `Déplacer ${getSubjectLabel()}${allClassesAreSame ? getOriginLabel() : ''} vers :`;
        };

        const getHintText = (mode) => {
            if (mode === 'copy') {
                return isBulk
                    ? 'Conserve ces élèves dans leur classe actuelle et crée une fiche vierge (photo, statuts et classe d\'origine conservés).'
                    : 'Conserve l\'élève dans sa classe actuelle et crée une fiche vierge (photo, statuts et classe d\'origine conservés).';
            }
            return isBulk
                ? 'Transfère ces élèves avec leurs notes et appréciations et les retire de leur classe actuelle.'
                : 'Transfère l\'élève avec ses notes et appréciations et le retire de sa classe actuelle.';
        };

        const modalEl = document.createElement('div');
        modalEl.className = 'modal modal-small';
        modalEl.id = 'moveStudentModal';
        modalEl.innerHTML = `
            <div class="modal-content modal-content-confirm move-student-modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <span class="modal-title-icon" id="moveModalTitleIcon"><iconify-icon icon="solar:copy-bold-duotone"></iconify-icon></span>
                        <span class="modal-title-text" id="moveModalTitleText">${isBulk ? 'Affecter ou déplacer les élèves' : 'Affecter ou déplacer l\'élève'}</span>
                    </h2>
                    <button class="close-button close-move-modal" aria-label="Fermer"><iconify-icon icon="ph:x"></iconify-icon></button>
                </div>
                <div class="modal-body">
                    <div class="move-mode-segmented" role="tablist" aria-label="Mode d'action">
                        <button type="button" class="move-mode-btn ${currentMode === 'copy' ? 'active' : ''}" data-mode="copy" role="tab" aria-selected="${currentMode === 'copy'}">
                            <iconify-icon icon="solar:copy-bold-duotone"></iconify-icon>
                            <span>Copier dans…</span>
                        </button>
                        <button type="button" class="move-mode-btn ${currentMode === 'move' ? 'active' : ''}" data-mode="move" role="tab" aria-selected="${currentMode === 'move'}">
                            <iconify-icon icon="solar:transfer-horizontal-bold"></iconify-icon>
                            <span>Déplacer vers…</span>
                        </button>
                    </div>
                    <p class="move-mode-hint" id="moveModalHintText">${getHintText(currentMode)}</p>
                    <p class="modal-instruction-text" id="moveModalInstructionText">
                        ${getInstructionHtml(currentMode)}
                    </p>
                    <div class="move-class-list" id="moveModalClassList">
                        ${classes.map(cls => {
                            const isGroup = Utils.isGroupClassName(cls.name);
                            const count = classStudentCounts.get(cls.id) || 0;
                            return `
                                <button type="button" class="btn btn-secondary move-target-btn" data-class-id="${cls.id}">
                                    <iconify-icon icon="${isGroup ? 'solar:users-group-rounded-bold' : 'solar:mortarboard-bold'}"></iconify-icon>
                                    <span class="move-target-name">${this._escapeHtml(Utils.formatClassDisplayName(cls.name))}</span>
                                    <span class="move-target-year">${count} élève${count > 1 ? 's' : ''}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                    <div class="move-create-class-section">
                        <button type="button" class="btn btn-secondary move-create-class-toggle" id="moveCreateClassToggle" style="${classes.length === 0 ? 'display: none;' : ''}">
                            <iconify-icon icon="ph:plus-bold"></iconify-icon>
                            <span>Nouvelle classe / groupe…</span>
                        </button>
                        <div class="move-create-class-form ${classes.length === 0 ? 'open' : ''}" id="moveCreateClassForm">
                            <input type="text" class="move-create-class-input" id="moveCreateClassInput" placeholder="Nom du groupe (ex : Groupe PAD, Projet PAPD...)" maxlength="50" autocomplete="off">
                            <button type="button" class="btn btn-primary move-create-class-submit" id="moveCreateClassSubmit">
                                <iconify-icon icon="ph:check-bold"></iconify-icon>
                                <span>Créer</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('moveStudentModal')?.remove();
        document.body.appendChild(modalEl);
        this._ui?.openModal(modalEl);
        FocusPanelManager.bindScrollAffordances(modalEl.querySelector('#moveModalClassList'));

        const closeModal = () => {
            this._ui?.closeModal(modalEl);
        };

        modalEl.querySelector('.close-move-modal')?.addEventListener('click', closeModal);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModal();
        });

        // Toggle mode (Copier / Déplacer)
        const modeBtns = modalEl.querySelectorAll('.move-mode-btn');
        const hintEl = modalEl.querySelector('#moveModalHintText');
        const instructionEl = modalEl.querySelector('#moveModalInstructionText');
        const titleIconEl = modalEl.querySelector('#moveModalTitleIcon iconify-icon');

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (!mode || mode === currentMode) return;
                currentMode = mode;
                modeBtns.forEach(b => {
                    const isActive = b.dataset.mode === currentMode;
                    b.classList.toggle('active', isActive);
                    b.setAttribute('aria-selected', String(isActive));
                });
                if (hintEl) hintEl.textContent = getHintText(currentMode);
                if (instructionEl) instructionEl.innerHTML = getInstructionHtml(currentMode);
                if (titleIconEl) {
                    titleIconEl.setAttribute('icon', currentMode === 'copy' ? 'solar:copy-bold-duotone' : 'solar:transfer-horizontal-bold');
                }
            });
        });

        const executeTargetAction = async (targetClassId, triggerBtn = null) => {
            const targetClass = ClassManager.getClassById(targetClassId);
            if (!targetClass) return;

            if (triggerBtn) {
                triggerBtn.disabled = true;
                triggerBtn.innerHTML = `<iconify-icon icon="svg-spinners:ring-resize"></iconify-icon> ${currentMode === 'copy' ? 'Copie...' : 'Déplacement...'}`;
            }

            const displayTarget = Utils.formatClassDisplayName(targetClass.name);
            let notificationText = '';
            let notificationType = 'success';

            if (currentMode === 'copy') {
                const { copiedCount, skippedCount } = StudentDataManager.copyStudentsToClass(ids, targetClassId);
                if (copiedCount > 0) {
                    notificationText = isBulk
                        ? `${copiedCount} élève${copiedCount > 1 ? 's' : ''} copié${copiedCount > 1 ? 's' : ''} dans « ${displayTarget} »${skippedCount > 0 ? ` (${skippedCount} déjà présent${skippedCount > 1 ? 's' : ''})` : ''}`
                        : `${Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false)} copié dans « ${displayTarget} »`;
                } else if (skippedCount > 0) {
                    notificationText = isBulk
                        ? `Ces élèves sont déjà présents dans « ${displayTarget} »`
                        : `${Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false)} est déjà dans « ${displayTarget} »`;
                    notificationType = 'info';
                }
            } else {
                let movedCount = 0;
                const now = Date.now();
                students.forEach(student => {
                    if (student.classId !== targetClassId) {
                        delete student.seatingPosition;
                        delete student.seatingActivityPosition;
                    }
                    student.classId = targetClassId;
                    student._lastModified = now;

                    const indexInFiltered = appState.filteredResults.findIndex(r => r.id === student.id);
                    if (indexInFiltered !== -1 && allClassesAreSame && appState.currentClassId === currentClassId) {
                        appState.filteredResults.splice(indexInFiltered, 1);
                    }
                    movedCount++;
                });

                notificationText = isBulk
                    ? `${movedCount} élèves déplacés vers « ${displayTarget} »`
                    : `${Utils.formatStudentName(firstStudent.nom, firstStudent.prenom, false)} déplacé vers « ${displayTarget} »`;
            }

            await ClassManager._filterResultsByClass(appState.currentClassId);
            await this._storage?.saveAppState();

            this.updateStudentCount();
            this.renderClassList();
            AppreciationsManager.renderResults();
            this._ui?.updateStats?.();

            closeModal();

            if (notificationText) {
                this._ui?.showNotification(notificationText, notificationType);
            }
            window.dispatchEvent(new CustomEvent('studentsUpdated'));
            if (onSuccess) onSuccess();
        };

        // Sélection d'une classe existante
        modalEl.querySelectorAll('.move-target-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                executeTargetAction(btn.dataset.classId, btn);
            });
        });

        // Création rapide d'une nouvelle classe / groupe à la volée
        const createToggleBtn = modalEl.querySelector('#moveCreateClassToggle');
        const createForm = modalEl.querySelector('#moveCreateClassForm');
        const createInput = modalEl.querySelector('#moveCreateClassInput');
        const createSubmitBtn = modalEl.querySelector('#moveCreateClassSubmit');

        if (classes.length === 0 && createInput) {
            setTimeout(() => createInput.focus(), 80);
        }

        createToggleBtn?.addEventListener('click', () => {
            createToggleBtn.style.display = 'none';
            createForm?.classList.add('open');
            setTimeout(() => createInput?.focus(), 50);
        });

        const handleCreateAndApply = async () => {
            const rawName = (createInput?.value || '').trim();
            if (!rawName) {
                this._ui?.showNotification('Veuillez saisir un nom de classe ou de groupe', 'warning');
                createInput?.focus();
                return;
            }
            const newClass = ClassManager.createClass(rawName);
            await executeTargetAction(newClass.id, createSubmitBtn);
        };

        createSubmitBtn?.addEventListener('click', handleCreateAndApply);
        createInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateAndApply();
            }
        });
    },

    /**
     * Affiche la modale permettant de piocher des élèves parmi les classes existantes
     * pour les ajouter (copier) dans la classe/groupe actif.
     * @param {string|null} [targetClassId=null] - ID de la classe cible (par défaut classe active)
     */
    showPickExistingStudentsModal(targetClassId = null) {
        const effectiveTargetId = targetClassId || appState.currentClassId || userSettings.academic.currentClassId;
        const targetClass = ClassManager.getClassById(effectiveTargetId);
        if (!targetClass || ClassManager.isVirtualClass(effectiveTargetId)) {
            this._ui?.showNotification('Veuillez d\'abord sélectionner une classe ou un groupe.', 'warning');
            return;
        }

        const allResults = appState.generatedResults || [];
        const physicalClasses = ClassManager.getAllClasses().filter(
            c => c.id !== effectiveTargetId && !ClassManager.isDemoClass(c.id)
        );
        const classMap = new Map(physicalClasses.map(c => [c.id, c]));
        const virtualClasses = ClassManager.getVirtualClasses();
        const virtualClassIds = new Set(virtualClasses.map(vc => vc.id));

        // Élèves déjà présents dans la classe cible
        const targetKeys = new Set();
        for (const r of allResults) {
            if (r?.classId === effectiveTargetId) {
                targetKeys.add(Utils.normalizeName(r.nom, r.prenom));
            }
        }

        // Consolider la liste unique des élèves disponibles dans les autres classes
        const candidatesMap = new Map();

        allResults.forEach(r => {
            if (!r?.classId || r.classId === effectiveTargetId) return;
            const sourceClass = classMap.get(r.classId);
            if (!sourceClass) return;

            const key = Utils.normalizeName(r.nom, r.prenom);
            if (!key) return;

            const explicitOrigin = (r.studentData?.classe || r.classe || r.originClass || '').trim();
            const normOrigin = explicitOrigin ? Utils.normalizeClassName(explicitOrigin) : '';
            const rawVirtualId = normOrigin ? `virtual_${normOrigin}` : null;
            const virtualId = rawVirtualId && virtualClassIds.has(rawVirtualId) ? rawVirtualId : null;

            const existing = candidatesMap.get(key);
            if (!existing) {
                const badgeRaw = explicitOrigin || sourceClass.name || '';
                const statuses = Array.isArray(r.studentData?.statuses)
                    ? r.studentData.statuses.filter(s => typeof s === 'string' && !/^(Nouveau|Départ)\b/i.test(s.trim()))
                    : [];

                candidatesMap.set(key, {
                    key,
                    id: r.id,
                    nom: r.nom || '',
                    prenom: r.prenom || '',
                    studentPhoto: r.studentPhoto || r.studentData?.photo || null,
                    originBadge: badgeRaw ? Utils.formatClassDisplayName(badgeRaw) : '',
                    statuses,
                    isCopiedProfile: Boolean(r.isCopiedProfile),
                    classIds: new Set([sourceClass.id]),
                    virtualIds: new Set(virtualId ? [virtualId] : []),
                    alreadyInTarget: targetKeys.has(key)
                });
            } else {
                existing.classIds.add(sourceClass.id);
                if (virtualId) existing.virtualIds.add(virtualId);
                // Préférer l'ID d'une fiche principale et récupérer photo / statuts s'ils manquent
                if (existing.isCopiedProfile && !r.isCopiedProfile) {
                    existing.id = r.id;
                    existing.isCopiedProfile = false;
                }
                if (!existing.studentPhoto?.data && (r.studentPhoto?.data || r.studentData?.photo?.data)) {
                    existing.studentPhoto = r.studentPhoto || r.studentData?.photo;
                }
                if (!existing.originBadge && explicitOrigin) {
                    existing.originBadge = Utils.formatClassDisplayName(explicitOrigin);
                }
            }
        });

        const candidates = Array.from(candidatesMap.values()).sort((a, b) => {
            const cmpNom = (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' });
            if (cmpNom !== 0) return cmpNom;
            return (a.prenom || '').localeCompare(b.prenom || '', 'fr', { sensitivity: 'base' });
        });

        if (candidates.length === 0) {
            this._ui?.showNotification('Aucun élève disponible dans vos autres classes.', 'info');
            return;
        }

        // Pré-calcul en une passe : compteurs par filtre et index de recherche normalisé sans accents
        const classCounts = new Map();
        const virtualCounts = new Map();
        for (const cand of candidates) {
            const plainClass = (cand.originBadge || '').replace(/[ᵉʳ]/g, ' ');
            cand.searchHaystack = `${cand.nom} ${cand.prenom} ${cand.originBadge} ${plainClass}`
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '');
            cand.classIds.forEach(cid => classCounts.set(cid, (classCounts.get(cid) || 0) + 1));
            cand.virtualIds.forEach(vid => virtualCounts.set(vid, (virtualCounts.get(vid) || 0) + 1));
        }

        const filterChips = [
            { id: 'all', label: 'Toutes', count: candidates.length, isVirtual: false },
            ...virtualClasses
                .filter(vc => virtualCounts.has(vc.id))
                .map(vc => ({
                    id: vc.id,
                    label: Utils.formatClassDisplayName(vc.name),
                    count: virtualCounts.get(vc.id),
                    isVirtual: true
                })),
            ...physicalClasses
                .filter(c => classCounts.has(c.id))
                .map(c => ({
                    id: c.id,
                    label: Utils.formatClassDisplayName(c.name),
                    count: classCounts.get(c.id),
                    isVirtual: false
                }))
        ];

        const selectedIds = new Set();
        let activeFilterId = 'all';
        let searchQuery = '';

        const targetDisplayName = Utils.formatClassDisplayName(targetClass.name || 'la classe');

        document.getElementById('pickExistingStudentsModal')?.remove();

        const modalEl = document.createElement('div');
        modalEl.className = 'modal';
        modalEl.id = 'pickExistingStudentsModal';
        modalEl.innerHTML = `
            <div class="modal-content pick-students-modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <span class="modal-title-icon"><iconify-icon icon="solar:users-group-rounded-linear"></iconify-icon></span>
                        <span class="modal-title-text">Piocher dans mes classes</span>
                    </h2>
                    <button class="close-button close-pick-modal" aria-label="Fermer"><iconify-icon icon="ph:x"></iconify-icon></button>
                </div>
                <div class="modal-body pick-students-modal-body">
                    <div class="pick-students-toolbar">
                        <div class="pick-students-search-box">
                            <iconify-icon icon="solar:magnifer-linear" class="pick-search-icon"></iconify-icon>
                            <input type="text" id="pickStudentsSearchInput" class="custom-input pick-students-search-input" placeholder="Rechercher un élève..." autocomplete="off">
                            <button type="button" class="sc-search-clear" id="pickStudentsSearchClear" aria-label="Effacer">
                                <iconify-icon icon="ph:x"></iconify-icon>
                            </button>
                        </div>
                        <div class="pick-students-chips" id="pickStudentsChips" role="tablist" aria-label="Filtrer par classe">
                            ${filterChips.map(chip => `
                                <button type="button" class="pick-class-chip ${chip.id === 'all' ? 'active' : ''}" data-filter-id="${chip.id}" role="tab" aria-selected="${chip.id === 'all'}">
                                    ${chip.isVirtual ? '<iconify-icon icon="solar:diploma-linear"></iconify-icon>' : ''}
                                    <span>${this._escapeHtml(chip.label)}</span>
                                    <span class="pick-chip-count">${chip.count}</span>
                                </button>
                            `).join('')}
                        </div>
                        <div class="pick-students-selection-bar">
                            <span class="pick-visible-count" id="pickVisibleCount">${candidates.length} élève${candidates.length > 1 ? 's' : ''}</span>
                            <button type="button" class="pick-select-all-btn" id="pickSelectAllBtn">
                                <iconify-icon icon="solar:checklist-minimalistic-linear"></iconify-icon>
                                <span>Tout cocher</span>
                            </button>
                        </div>
                    </div>
                    <div class="pick-students-list" id="pickStudentsList" role="listbox" aria-multiselectable="true"></div>
                </div>
                <div class="modal-footer pick-students-modal-footer">
                    <button type="button" class="btn btn-secondary close-pick-modal-cancel">Annuler</button>
                    <button type="button" class="btn btn-primary" id="confirmPickStudentsBtn" disabled>
                        <svg aria-hidden="true"><use href="#icon-user-plus"></use></svg>
                        <span id="confirmPickStudentsLabel">Sélectionnez des élèves</span>
                    </button>
                </div>
            </div>
        `;

        const closeModal = () => {
            this._ui?.closeModal(modalEl);
        };

        modalEl.querySelector('.close-pick-modal')?.addEventListener('click', closeModal);
        modalEl.querySelector('.close-pick-modal-cancel')?.addEventListener('click', closeModal);
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) closeModal();
        });

        const listEl = modalEl.querySelector('#pickStudentsList');
        const chipsEl = modalEl.querySelector('#pickStudentsChips');
        const chipBtns = modalEl.querySelectorAll('.pick-class-chip');
        const visibleCountEl = modalEl.querySelector('#pickVisibleCount');
        const selectAllBtn = modalEl.querySelector('#pickSelectAllBtn');
        const selectAllLabel = selectAllBtn?.querySelector('span');
        const confirmBtn = modalEl.querySelector('#confirmPickStudentsBtn');
        const confirmLabel = modalEl.querySelector('#confirmPickStudentsLabel');
        const searchInput = modalEl.querySelector('#pickStudentsSearchInput');
        let currentVisibleCandidates = candidates;

        const getVisibleCandidates = () => {
            const normWords = searchQuery
                .trim()
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .split(/\s+/)
                .filter(Boolean);
            return candidates.filter(c => {
                if (activeFilterId !== 'all' && !c.classIds.has(activeFilterId) && !c.virtualIds.has(activeFilterId)) {
                    return false;
                }
                if (normWords.length > 0 && !normWords.every(w => c.searchHaystack.includes(w))) {
                    return false;
                }
                return true;
            });
        };

        const updateSelectionUI = (visibleCandidates = currentVisibleCandidates) => {
            let selectableCount = 0;
            let allVisibleSelected = true;
            for (const c of visibleCandidates) {
                if (!c.alreadyInTarget) {
                    selectableCount++;
                    if (allVisibleSelected && !selectedIds.has(c.id)) {
                        allVisibleSelected = false;
                    }
                }
            }
            allVisibleSelected = selectableCount > 0 && allVisibleSelected;

            if (visibleCountEl) {
                visibleCountEl.textContent = `${visibleCandidates.length} élève${visibleCandidates.length > 1 ? 's' : ''}`;
            }

            if (selectAllBtn) {
                selectAllBtn.disabled = selectableCount === 0;
                if (selectAllLabel) selectAllLabel.textContent = allVisibleSelected ? 'Tout décocher' : 'Tout cocher';
            }

            const count = selectedIds.size;
            if (confirmBtn && confirmLabel) {
                confirmBtn.disabled = count === 0;
                confirmLabel.textContent = count === 0
                    ? 'Sélectionnez des élèves'
                    : `Ajouter ${count} élève${count > 1 ? 's' : ''} à ${targetDisplayName}`;
            }
        };

        // Mise à jour ciblée sur place sans destruction/recréation du DOM (zéro flash image/icône)
        const syncRowSelectionDOM = (row, isSelected) => {
            if (!row) return;
            row.classList.toggle('selected', isSelected);
            row.setAttribute('aria-selected', String(isSelected));
        };

        const renderList = ({ skipScrollAffordances = false } = {}) => {
            currentVisibleCandidates = getVisibleCandidates();
            updateSelectionUI(currentVisibleCandidates);

            if (!listEl) return;
            if (currentVisibleCandidates.length === 0) {
                listEl.innerHTML = `
                    <div class="pick-students-empty">
                        <iconify-icon icon="solar:user-speak-rounded-linear"></iconify-icon>
                        <p>Aucun élève ne correspond à ce filtre.</p>
                    </div>
                `;
                if (!skipScrollAffordances) {
                    FocusPanelManager.updateScrollAffordances(listEl);
                }
                return;
            }

            const trimmedQuery = searchQuery.trim();
            listEl.innerHTML = currentVisibleCandidates.map(cand => {
                const isSelected = selectedIds.has(cand.id);
                const isPresent = cand.alreadyInTarget;
                const avatarHtml = StudentPhotoManager.getAvatarHTML(cand, 'sm', false, false);
                const nameHtml = Utils.formatStudentName(cand.nom, cand.prenom, true, trimmedQuery, cand.originBadge);
                const statusesHtml = cand.statuses.length > 0
                    ? `<div class="pick-student-statuses">${cand.statuses.map(st => {
                        const info = Utils.getStatusBadgeInfo(st);
                        return `<span class="${info.className} tag-badge--sm">${this._escapeHtml(info.label)}</span>`;
                    }).join('')}</div>`
                    : '';

                return `
                    <div class="pick-student-row ${isSelected ? 'selected' : ''} ${isPresent ? 'already-present' : ''}"
                         data-student-id="${cand.id}"
                         role="option"
                         aria-selected="${isSelected || isPresent}"
                         tabindex="${isPresent ? '-1' : '0'}">
                        <span class="pick-student-checkbox" aria-hidden="true">
                            <svg viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6.2L5 8.7L9.5 3.5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </span>
                        <div class="student-identity-wrapper">
                            ${avatarHtml}
                            <span class="student-nom-prenom">${nameHtml}</span>
                        </div>
                        ${statusesHtml}
                        ${isPresent ? '<span class="pick-student-present-tag">Déjà présent</span>' : ''}
                    </div>
                `;
            }).join('');
            if (!skipScrollAffordances) {
                FocusPanelManager.updateScrollAffordances(listEl);
            }
        };

        // Événement clic sur une ligne élève : bascule sur place sans re-rendre la liste
        listEl?.addEventListener('click', (e) => {
            const row = e.target.closest('.pick-student-row');
            if (!row || row.classList.contains('already-present')) return;
            const id = row.dataset.studentId;
            if (!id) return;

            const willSelect = !selectedIds.has(id);
            if (willSelect) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
            syncRowSelectionDOM(row, willSelect);
            updateSelectionUI();
        });

        listEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                const row = e.target.closest('.pick-student-row');
                if (row && !row.classList.contains('already-present')) {
                    e.preventDefault();
                    row.click();
                }
            }
        });

        // Défilement horizontal fluide à la molette sur la barre de filtres sans scrollbar native
        chipsEl?.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0 && chipsEl.scrollWidth > chipsEl.clientWidth) {
                e.preventDefault();
                chipsEl.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        // Filtres par classe
        chipBtns.forEach(chip => {
            chip.addEventListener('click', () => {
                activeFilterId = chip.dataset.filterId || 'all';
                chipBtns.forEach(c => {
                    const isActive = c.dataset.filterId === activeFilterId;
                    c.classList.toggle('active', isActive);
                    c.setAttribute('aria-selected', String(isActive));
                });
                if (activeFilterId === 'all') {
                    chipsEl?.scrollTo?.({ left: 0, behavior: 'smooth' });
                } else {
                    chip.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                }
                renderList();
            });
        });

        // Recherche instantanée mutualisée (saisie, bouton ×, touche Échap, clic conteneur)
        DOMHelper.bindSearchInput(
            searchInput,
            modalEl.querySelector('#pickStudentsSearchClear'),
            (val) => {
                searchQuery = val;
                renderList();
            },
            modalEl.querySelector('.pick-students-search-box')
        );

        // Tout cocher / Tout décocher (sur place sur les élèves visibles)
        selectAllBtn?.addEventListener('click', () => {
            if (selectAllBtn.disabled) return;
            const targetState = !currentVisibleCandidates.every(c => c.alreadyInTarget || selectedIds.has(c.id));
            for (const c of currentVisibleCandidates) {
                if (!c.alreadyInTarget) {
                    if (targetState) selectedIds.add(c.id);
                    else selectedIds.delete(c.id);
                }
            }
            listEl?.querySelectorAll('.pick-student-row:not(.already-present)').forEach(row => {
                syncRowSelectionDOM(row, targetState);
            });
            updateSelectionUI();
        });

        // Validation finale
        confirmBtn?.addEventListener('click', async () => {
            if (selectedIds.size === 0) return;
            confirmBtn.disabled = true;

            const { copiedStudents, copiedCount } = StudentDataManager.copyStudentsToClass(
                Array.from(selectedIds),
                effectiveTargetId
            );

            await ClassManager._filterResultsByClass(appState.currentClassId);
            await this._storage?.saveAppState();

            this.updateStudentCount();
            this.renderClassList();

            ListViewManager?.prepareImportReveal?.({
                newIds: copiedStudents.map(s => s.id),
                updatedIds: []
            });
            AppreciationsManager.renderResults();
            this._ui?.updateStats?.();

            closeModal();

            if (copiedCount > 0) {
                this._ui?.showNotification(
                    `${copiedCount} élève${copiedCount > 1 ? 's' : ''} ajouté${copiedCount > 1 ? 's' : ''} à « ${targetDisplayName} »`,
                    'success'
                );
            }
            window.dispatchEvent(new CustomEvent('studentsUpdated'));
        });

        // Construire la liste hors DOM avant montage pour éviter tout reflow intermédiaire à l'ouverture
        renderList({ skipScrollAffordances: true });
        document.body.appendChild(modalEl);
        this._ui?.openModal(modalEl);
        FocusPanelManager.bindScrollAffordances(chipsEl);
        FocusPanelManager.bindScrollAffordances(listEl);
    }
};
