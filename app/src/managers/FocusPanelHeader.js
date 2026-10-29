/**
 * @fileoverview Focus Panel Header - Gestion de l'entête (Identité, Statuts, Avatar)
 * Extrait de FocusPanelManager.js pour réduire la complexité
 * @module managers/FocusPanelHeader
 */

import { appState, userSettings } from '../state/State.js';
import { UI } from './UIManager.js';
import { Utils } from '../utils/Utils.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { StorageManager } from './StorageManager.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelManager } from './FocusPanelManager.js';
import { StudentDataManager } from './StudentDataManager.js';
import { STATUS_DESCRIPTIONS, getStatusDescription, resolveStudentStatus } from '../config/academicConstants.js';

export const FocusPanelHeader = {
    // Callbacks to main manager
    callbacks: {
        getCurrentStudentId: () => null,
        setCurrentStudentId: () => { },
        getIsCreationMode: () => false,
        setIsCreationMode: (val) => { },
        onRefreshStatus: () => { },
        onUpdateListRow: () => { },
        onUpdateNavigation: () => { },
        onStudentCreated: () => { }
    },

    // Internal state for edit reversions
    _originalHeaderValues: null,


    // Definitions
    _statusDescriptions: STATUS_DESCRIPTIONS,

    _statusMatchesCheckbox(status, checkboxValue) {
        const sLower = String(status || '').trim().toLowerCase();
        const cbLower = String(checkboxValue || '').trim().toLowerCase();
        if (!sLower || !cbLower) return false;
        if (sLower === cbLower) return true;
        if (cbLower === 'nouveau' && sLower.startsWith('nouveau')) return true;
        if ((cbLower === 'départ' || cbLower === 'depart') && (sLower.startsWith('départ') || sLower.startsWith('depart'))) return true;
        if ((cbLower === 'délégué' || cbLower === 'delegue') && (sLower.startsWith('délégué') || sLower.startsWith('delegue'))) return true;
        return false;
    },

    /**
     * Indique si une case de statut doit être cochée pour la période active
     * ("Nouveau T2" n'apparaît plus coché en T3, "Départ T2" l'est à partir de T2)
     * @param {string[]} statuses - Statuts enregistrés
     * @param {string} checkboxValue - Valeur de la case
     * @returns {boolean}
     * @private
     */
    _isCheckboxActive(statuses, checkboxValue) {
        return Utils.getActiveStatuses(statuses || [], appState.currentPeriod)
            .some(s => this._statusMatchesCheckbox(s, checkboxValue));
    },

    /**
     * Fusionne les cases cochées avec les statuts enregistrés.
     * - Un statut Nouveau/Départ nouvellement coché est qualifié par la période active ("Nouveau T2").
     * - Les statuts inactifs sur la période (ex: "Nouveau T2" vu en T3) sont conservés comme historique,
     *   sauf si la même case est recochée (le statut est alors requalifié sur la période active).
     * - Les statuts non gérés par une case (PAI, AESH importés...) sont conservés.
     */
    mergeEditedStatuses(baseStatuses = [], checkedValues = [], allCheckboxValues = [], activePeriod = appState.currentPeriod) {
        const base = Array.isArray(baseStatuses) ? baseStatuses : [];
        const activeBase = Utils.getActiveStatuses(base, activePeriod);
        const merged = [];
        const requalifiedValues = [];

        for (const val of checkedValues) {
            const existingMatch = activeBase.find(s => this._statusMatchesCheckbox(s, val));
            if (existingMatch) {
                merged.push(existingMatch);
            } else if (this._isMovementCheckbox(val)) {
                merged.push(`${val} ${activePeriod}`);
                requalifiedValues.push(val);
            } else {
                merged.push(val);
            }
        }

        for (const s of base) {
            if (merged.includes(s)) continue;
            const managingValue = allCheckboxValues.find(cbVal => this._statusMatchesCheckbox(s, cbVal));
            const isInactiveHistory = managingValue && !activeBase.includes(s) && !requalifiedValues.includes(managingValue);
            if (!managingValue || isInactiveHistory) {
                merged.push(s);
            }
        }

        return merged;
    },

    /** @private */
    _isMovementCheckbox(value) {
        return this._statusMatchesCheckbox(value, 'Nouveau') || this._statusMatchesCheckbox(value, 'Départ');
    },

    /**
     * Initialize the module
     * @param {Object} callbacks - Functions to interact with parent manager
     */
    init(callbacks) {
        this.callbacks = { ...this.callbacks, ...callbacks };
        this._setupEventListeners();
    },

    /**
     * Setup event listeners specific to header elements
     * @private
     */
    _setupEventListeners() {
        const studentName = document.getElementById('focusStudentName');
        const focusAvatarContainer = document.getElementById('focusAvatarContainer');
        const focusEditSaveBtn = document.getElementById('focusEditSaveBtn');
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');

        const initiateEdit = () => {
            const header = document.querySelector('.focus-header');
            if (header && !header.classList.contains('editing')) {
                this.toggleEditMode(true);
            }
        };

        if (studentName) {
            studentName.addEventListener('click', initiateEdit);
        }

        // Also allow clicking the avatar to trigger edit mode (unifies the new hover zone)
        if (focusAvatarContainer) {
            focusAvatarContainer.addEventListener('click', initiateEdit);
        }

        if (focusEditSaveBtn) {
            focusEditSaveBtn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
            });
            focusEditSaveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleEditMode(false); // Validates and closes
            });
        }
        // Note: Cancel is handled by the close button (×) at pill level

        const handleIdentityInput = () => {
            this._updateLiveAvatarInitials();
        };

        const handleIdentityKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (e.target === prenomInput && nomInput && !nomInput.value.trim()) {
                    nomInput.focus();
                } else {
                    this.toggleEditMode(false);
                }
            }
        };

        if (nomInput) {
            nomInput.addEventListener('input', handleIdentityInput);
            nomInput.addEventListener('keydown', handleIdentityKeydown);
        }
        if (prenomInput) {
            prenomInput.addEventListener('input', handleIdentityInput);
            prenomInput.addEventListener('keydown', handleIdentityKeydown);
        }
    },

    /**
     * Checks whether at least a first name or last name has been typed in the header inputs
     * @returns {boolean}
     */
    hasCreationIdentityInput() {
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');
        return Boolean(nomInput?.value?.trim() || prenomInput?.value?.trim());
    },

    /**
     * Updates avatar initials live as the user types in the header inputs
     * @private
     */
    _updateLiveAvatarInitials() {
        const avatarContainer = document.getElementById('focusAvatarContainer');
        const avatarEl = avatarContainer?.querySelector('.student-avatar');
        if (!avatarEl) return;

        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');
        const nom = nomInput?.value?.trim() || '';
        const prenom = prenomInput?.value?.trim() || '';
        const hasName = Boolean(nom || prenom);

        avatarEl.classList.toggle('student-avatar--empty-name', !hasName);

        const initialsEl = avatarEl.querySelector('.student-avatar__initials');
        if (initialsEl) {
            initialsEl.textContent = hasName ? StudentPhotoManager.getInitialsFromName(nom, prenom) : '';
        }
    },

    /**
     * Toggles the Header Edit Mode (Identity + Statuses)
     * @param {boolean} show - True to edit, False to save and view
     * @param {boolean} [cancel=false] - If true, exit without saving
     */
    toggleEditMode(show, cancel = false) {
        const header = document.querySelector('.focus-header');
        const readMode = document.querySelector('.focus-header-read');
        const editMode = document.querySelector('.focus-header-edit');

        if (!readMode || !editMode || !header) return;

        const currentStudentId = this.callbacks.getCurrentStudentId();
        const isCreationMode = this.callbacks.getIsCreationMode();

        // Avatar element reference
        const avatarContainer = document.getElementById('focusAvatarContainer');
        const avatarEl = avatarContainer?.querySelector('.student-avatar');

        if (show) {
            // Populate inputs & checkboxes before displaying the edit card to avoid first-frame visual flash
            const nomInput = document.getElementById('headerNomInput');
            const prenomInput = document.getElementById('headerPrenomInput');
            const result = (currentStudentId && !isCreationMode)
                ? appState.generatedResults.find(r => r.id === currentStudentId)
                : null;

            if (result) {
                if (nomInput) nomInput.value = result.nom;
                if (prenomInput) prenomInput.value = result.prenom;

                this._originalHeaderValues = {
                    nom: result.nom,
                    prenom: result.prenom,
                    statuses: [...(result.studentData.statuses || [])]
                };
            } else if (isCreationMode) {
                if (nomInput) nomInput.value = '';
                if (prenomInput) prenomInput.value = '';

                const periods = Utils.getPeriods();
                const currentPeriod = appState.currentPeriod || periods[0];
                const isLaterPeriod = periods.indexOf(currentPeriod) > 0;
                const activeClassId = userSettings?.academic?.currentClassId || appState?.currentClassId || null;
                const hasExistingClassStudents = (appState.generatedResults || []).some(
                    r => !activeClassId || r.classId === activeClassId
                );
                const shouldPreselectNew = isLaterPeriod && hasExistingClassStudents;

                this._originalHeaderValues = {
                    nom: '',
                    prenom: '',
                    statuses: shouldPreselectNew ? [`Nouveau ${currentPeriod}`] : []
                };
            }

            if (result || isCreationMode) {
                const activeStatuses = this._originalHeaderValues?.statuses || [];
                const checkboxes = editMode.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = this._isCheckboxActive(activeStatuses, cb.value);
                    const label = cb.closest('label');
                    if (label) {
                        const description = this._statusDescriptions[cb.value] || cb.value;
                        label.setAttribute('data-tooltip', description);
                        label.classList.add('tooltip');
                    }
                });
                this._updateLiveAvatarInitials();
            }

            // Enter Edit Mode
            header.style.removeProperty('--scroll-p');
            header.classList.remove('scrolled');
            header.classList.add('editing');
            readMode.classList.add('hidden');
            editMode.classList.add('visible');

            // Accessible labels for edit mode (no intrusive tooltips in compact top header)
            const saveBtn = document.getElementById('focusEditSaveBtn');
            const closeBtn = document.getElementById('focusBackBtn');
            if (saveBtn) {
                saveBtn.removeAttribute('data-tooltip');
                saveBtn.classList.remove('tooltip');
                saveBtn.setAttribute('aria-label', 'Valider les modifications');
                saveBtn._tippy?.disable();
                saveBtn._tippy?.hide();
            }
            if (closeBtn) {
                closeBtn.removeAttribute('data-tooltip');
                closeBtn.classList.remove('tooltip');
                closeBtn.setAttribute('aria-label', 'Annuler les modifications');
                closeBtn._tippy?.disable();
                closeBtn._tippy?.hide();
            }

            // === ENABLE avatar editing ===
            if (avatarEl) {
                const studentId = avatarContainer.dataset.studentId;
                avatarEl.classList.add('student-avatar--editable');
                avatarEl.onclick = studentId
                    ? () => this.handleAvatarClick(studentId)
                    : () => this._handlePendingAvatarClick(avatarEl);
            }

            if (result || isCreationMode) {
                setTimeout(() => UI.initTooltips?.(), 0);
                const focusTarget = prenomInput || nomInput;
                if (focusTarget) {
                    const scheduleFocus = typeof requestAnimationFrame === 'function'
                        ? requestAnimationFrame
                        : (fn) => setTimeout(fn, 0);
                    scheduleFocus(() => focusTarget.focus({ preventScroll: true }));
                }
            }
            return true;
        } else {
            // Exit Edit Mode
            if (typeof FocusPanelManager !== 'undefined' && FocusPanelManager._uiUpdateTimeout) {
                clearTimeout(FocusPanelManager._uiUpdateTimeout);
                FocusPanelManager._uiUpdateTimeout = null;
            }

            if (cancel && isCreationMode) {
                // Cancel in creation mode: clean up and close panel
                this.clearPendingAvatarData();
                this._originalHeaderValues = null;
                this._exitEditModeUI(header, readMode, editMode, avatarEl);

                // Close the panel
                if (typeof FocusPanelManager !== 'undefined') {
                    FocusPanelManager.close({ cancelCreation: true });
                }
                return false;
            }

            const firstContentCard = document.querySelector('.focus-main-page .focus-content > :first-child');
            const beforeCloseTop = firstContentCard ? firstContentCard.getBoundingClientRect().top : null;

            if (cancel && this._originalHeaderValues) {
                const orig = this._originalHeaderValues;
                const nomInput = document.getElementById('headerNomInput');
                const prenomInput = document.getElementById('headerPrenomInput');
                if (nomInput) nomInput.value = orig.nom;
                if (prenomInput) prenomInput.value = orig.prenom;

                const checkboxes = editMode.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = this._isCheckboxActive(orig.statuses, cb.value);
                });

                this._updateLiveAvatarInitials();
                this._originalHeaderValues = null;
                this.clearPendingAvatarData();

                const currentAvatarEl = avatarContainer?.querySelector('.student-avatar') || avatarEl;
                this._exitEditModeUI(header, readMode, editMode, currentAvatarEl);
                this._animateContentCloseFlip(beforeCloseTop);

                const resultToRevert = appState.generatedResults.find(r => r.id === currentStudentId);
                if (resultToRevert) {
                    const statusesMutated = !Utils.isEqual(resultToRevert.studentData.statuses || [], orig.statuses || []);
                    resultToRevert.nom = orig.nom;
                    resultToRevert.prenom = orig.prenom;
                    resultToRevert.studentData.statuses = [...orig.statuses];

                    if (statusesMutated) {
                        StudentDataManager.syncFilteredStudent(currentStudentId, resultToRevert);
                        this.callbacks.onUpdateListRow(resultToRevert);
                        this.callbacks.onRefreshStatus();
                    }
                }
                return true;
            } else if (!cancel) {
                const saved = this._saveHeaderChanges({
                    beforeCloseTop,
                    header,
                    readMode,
                    editMode,
                    avatarEl
                });
                if (saved === false) {
                    return false;
                }
                this._originalHeaderValues = null;
                return true;
            }

            // Fallback clean up UI
            const currentAvatarEl = avatarContainer?.querySelector('.student-avatar') || avatarEl;
            this._exitEditModeUI(header, readMode, editMode, currentAvatarEl);
            this._animateContentCloseFlip(beforeCloseTop);
            return true;
        }
    },

    /**
     * Smoothly springs lower content cards back into place when closing header edit mode (FLIP)
     * @param {number|null} beforeTop
     * @private
     */
    _animateContentCloseFlip(beforeTop) {
        if (beforeTop === null) return;
        const panelEl = document.getElementById('focusPanel');
        if (!panelEl || !panelEl.classList.contains('open')) return;

        const focusContent = panelEl.querySelector('.focus-main-page .focus-content');
        const firstCard = focusContent?.firstElementChild;
        if (!focusContent || !firstCard || typeof focusContent.animate !== 'function') return;

        const afterTop = firstCard.getBoundingClientRect().top;
        const deltaY = beforeTop - afterTop;
        if (Math.abs(deltaY) > 2) {
            focusContent.animate(
                [
                    { transform: `translateY(${deltaY}px)` },
                    { transform: 'translateY(0)' }
                ],
                {
                    duration: 380,
                    easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.15)'
                }
            );
        }
    },

    /**
     * Clean up UI state when exiting edit mode
     * @private
     */
    _exitEditModeUI(header, readMode, editMode, avatarEl) {
        if (editMode && document.activeElement && editMode.contains(document.activeElement)) {
            document.activeElement.blur?.();
        }

        // Disable avatar editing
        if (avatarEl) {
            avatarEl.classList.remove('student-avatar--editable', 'student-avatar--empty-name', 'tooltip');
            avatarEl.removeAttribute('data-tooltip');
            avatarEl.onclick = null;
        }

        // Remove editing state from header
        header?.classList.remove('editing');
        readMode?.classList.remove('hidden');
        editMode?.classList.remove('visible');

        // Restore original tooltips and accessibility
        const saveBtn = document.getElementById('focusEditSaveBtn');
        const closeBtn = document.getElementById('focusBackBtn');
        saveBtn?.classList.remove('tooltip');
        saveBtn?.removeAttribute('data-tooltip');
        saveBtn?.setAttribute('aria-label', 'Valider');
        if (closeBtn) {
            closeBtn.setAttribute('data-tooltip', 'Fermer');
            closeBtn.classList.add('tooltip');
            closeBtn.setAttribute('aria-label', 'Fermer le panneau');
            closeBtn._tippy?.enable();
            closeBtn._tippy?.setContent('Fermer');
        }
    },

    /**
     * Saves changes made in the Header Edit Mode
     * @param {Object} [uiContext] - Optional UI elements to transition immediately before persistence
     * @returns {boolean} True if changes were saved, false if validation failed
     * @private
     */
    _saveHeaderChanges(uiContext = {}) {
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');
        const currentStudentId = this.callbacks.getCurrentStudentId();
        const isCreationMode = this.callbacks.getIsCreationMode();

        const nomVal = nomInput?.value?.trim() || '';
        const prenomVal = prenomInput?.value?.trim() || '';

        // Validation basic
        if (!nomVal && !prenomVal) {
            UI.showNotification('Veuillez entrer au moins un nom ou un prénom', 'warning');
            (prenomInput || nomInput)?.focus?.();
            return false;
        }

        const newNom = nomVal.toUpperCase();
        const newPrenom = prenomVal;
        const wasCreating = isCreationMode || !currentStudentId;
        const editMode = uiContext.editMode || document.querySelector('.focus-header-edit');

        let result;
        if (!wasCreating) {
            result = appState.generatedResults.find(r => r.id === currentStudentId);
            if (!result) return false;
        }

        // Compute merged statuses before deciding whether anything changed
        let mergedStatuses = result?.studentData?.statuses || [];
        if (editMode) {
            const allBoxes = Array.from(editMode.querySelectorAll('input[type="checkbox"]'));
            const checkedValues = allBoxes.filter(cb => cb.checked).map(cb => cb.value);
            const allCheckboxValues = allBoxes.map(cb => cb.value);
            const baseStatuses = this._originalHeaderValues?.statuses || result?.studentData?.statuses || [];
            mergedStatuses = this.mergeEditedStatuses(baseStatuses, checkedValues, allCheckboxValues);
        }

        const orig = this._originalHeaderValues;
        const hasChanges = wasCreating
            || Boolean(this._pendingAvatarData)
            || !orig
            || (orig.nom || '').toUpperCase() !== newNom
            || (orig.prenom || '') !== newPrenom
            || !Utils.isEqual(orig.statuses || [], mergedStatuses);

        if (!hasChanges) {
            // Fast path: nothing modified — transition UI immediately with zero persistence overhead
            const avatarContainer = document.getElementById('focusAvatarContainer');
            const currentAvatarEl = avatarContainer?.querySelector('.student-avatar') || uiContext.avatarEl;
            if (uiContext.header) {
                this._exitEditModeUI(uiContext.header, uiContext.readMode, editMode, currentAvatarEl);
                this._animateContentCloseFlip(uiContext.beforeCloseTop ?? null);
            }
            return true;
        }

        if (wasCreating) {
            // === CREATION MODE ===
            const newId = 'student-' + Date.now();
            const currentPeriod = appState.currentPeriod;

            result = {
                id: newId,
                nom: newNom,
                prenom: newPrenom,
                classId: userSettings?.academic?.currentClassId || appState?.currentClassId || null,
                studentData: {
                    statuses: mergedStatuses,
                    periods: {
                        [currentPeriod]: {}
                    }
                },
                appreciation: '',
                isPending: false,
                wasGenerated: false
            };

            // Capture any grade, context, or appreciation typed before validating header in creation mode
            const gradeInput = document.getElementById('focusCurrentGradeInput');
            if (gradeInput && gradeInput.value.trim() !== '') {
                const parsedGrade = parseFloat(gradeInput.value.trim().replace(',', '.'));
                if (!isNaN(parsedGrade)) {
                    result.studentData.periods[currentPeriod].grade = parsedGrade;
                }
            }

            const contextInput = document.getElementById('focusContextInput');
            if (contextInput && contextInput.value.trim() !== '') {
                result.studentData.periods[currentPeriod].context = contextInput.value.trim();
            }

            const appreciationEl = document.getElementById('focusAppreciationText');
            if (appreciationEl && !appreciationEl.classList.contains('empty')) {
                const rawAppreciation = (appreciationEl.innerText || appreciationEl.textContent || '')
                    .replace(/\u00A0/g, ' ')
                    .trim();
                if (rawAppreciation && !rawAppreciation.startsWith('Aucune appréciation') && !rawAppreciation.startsWith('Cliquez sur')) {
                    result.appreciation = rawAppreciation;
                    result.studentData.periods[currentPeriod].appreciation = rawAppreciation;
                    result.appreciationSource = 'manual';
                    result.wasGenerated = false;
                    result.generationPeriod = currentPeriod;
                }
            }

            // Apply pending avatar photo if any
            if (this._pendingAvatarData) {
                result.studentPhoto = {
                    data: this._pendingAvatarData,
                    source: 'manual',
                    uploadedAt: new Date().toISOString()
                };
                this.clearPendingAvatarData();
            }

            // Add to app state (avoid duplicate push if filteredResults aliases generatedResults)
            appState.generatedResults.push(result);
            if (appState.filteredResults && appState.filteredResults !== appState.generatedResults) {
                appState.filteredResults.push(result);
            }

            if (result.appreciation) {
                FocusPanelHistory.load(newId);
                FocusPanelHistory.push(result.appreciation, 'edit');
            }

            // Update tracking via callbacks
            this.callbacks.setCurrentStudentId(newId);
            this.callbacks.setIsCreationMode(false);
        } else {
            // === EDIT MODE ===
            if (nomInput) result.nom = newNom;
            if (prenomInput) result.prenom = newPrenom;
            result.studentData.statuses = mergedStatuses;
        }

        // Update Header View in place (preserve existing .student-avatar DOM node so CSS spring transition plays!)
        const avatarContainer = document.getElementById('focusAvatarContainer');
        let currentAvatarEl = avatarContainer?.querySelector('.student-avatar') || uiContext.avatarEl;
        if (avatarContainer) {
            avatarContainer.dataset.studentId = result.id;
            if (currentAvatarEl) {
                currentAvatarEl.dataset.studentId = String(result.id || '');
                const initialsEl = currentAvatarEl.querySelector('.student-avatar__initials');
                if (initialsEl) {
                    initialsEl.textContent = StudentPhotoManager.getInitialsFromName(result.nom, result.prenom);
                }
            } else {
                avatarContainer.innerHTML = StudentPhotoManager.getAvatarHTML(result, 'lg');
                currentAvatarEl = avatarContainer.querySelector('.student-avatar');
            }
        }

        this.updateHeaderName(result);
        this.renderStatusBadges(result.studentData.statuses);

        // Transition header UI immediately before heavy persistence/list updates
        if (uiContext.header) {
            this._exitEditModeUI(uiContext.header, uiContext.readMode, editMode, currentAvatarEl);
            this._animateContentCloseFlip(uiContext.beforeCloseTop ?? null);
        }

        // Persist & synchronize secondary views
        StorageManager.saveAppState();
        this.callbacks.onUpdateNavigation();

        if (wasCreating) {
            this.callbacks.onStudentCreated?.(result);
            UI.showNotification('Élève créé avec succès', 'success');
        }

        StudentDataManager.syncFilteredStudent(result.id, result);
        this.callbacks.onUpdateListRow(result);
        ClassUIManager.updateStudentCount();
        window.dispatchEvent(new CustomEvent('student-updated', { detail: { studentId: result.id, student: result } }));
        return true;
    },

    /**
     * Update header name display
     * @param {Object} [result] - Optional result object, otherwise fetches from current ID
     */
    updateHeaderName(result) {
        const nameEl = document.getElementById('focusStudentName');
        if (!nameEl) return;

        let nom, prenom;

        if (!result) {
            const currentId = this.callbacks.getCurrentStudentId();
            if (currentId) {
                result = appState.generatedResults.find(r => r.id === currentId);
            }
        }

        if (result && (result.nom || result.prenom)) {
            nom = result.nom || '';
            prenom = result.prenom || '';
        } else {
            const nomInput = document.getElementById('headerNomInput');
            const prenomInput = document.getElementById('headerPrenomInput');
            if (nomInput && prenomInput && (nomInput.value.trim() || prenomInput.value.trim())) {
                nom = nomInput.value.trim().toUpperCase();
                prenom = prenomInput.value.trim();
            } else if (result) {
                nom = result.nom || '...';
                prenom = result.prenom || '...';
            } else {
                return;
            }
        }

        const activeClassId = userSettings?.academic?.currentClassId || appState?.currentClassId;
        const currentClassName = Utils.getCurrentClassName(activeClassId);
        const originClass = Utils.getOriginClass(result, currentClassName);
        const displayClass = originClass ? Utils.formatClassDisplayName(originClass) : '';
        const isGroupOrigin = displayClass ? (Utils.isGroupClassName(originClass) || Utils.isGroupClassName(displayClass)) : false;
        const badgePrefix = isGroupOrigin ? 'Groupe' : 'Classe';
        const originBadge = displayClass ? `
            <span class="focus-origin-class-badge">${badgePrefix} ${Utils.escapeHtml(displayClass)}</span>
        ` : '';

        nameEl.innerHTML = `
            <span class="focus-name-details">
                <span class="focus-name-nom">${Utils.escapeHtml(nom).toUpperCase()}</span>
                <span class="focus-name-prenom">
                    <span class="focus-prenom-text">${Utils.escapeHtml(prenom)}</span>
                    ${originBadge}
                </span>
            </span>
            <iconify-icon icon="solar:pen-linear" class="focus-name-edit-icon"></iconify-icon>
        `;
    },

    /**
     * Renders status badges logically split between panels
     * @param {Array} statuses 
     */
    renderStatusBadges(statuses) {
        const headerContainer = document.getElementById('focusStatusBadges');
        const contextContainer = document.getElementById('focusContextStatusBadges');

        let headerHtml = '';
        let contextHtml = '';

        Utils.getActiveStatuses(statuses || [], appState.currentPeriod).forEach(s => {
            const badgeInfo = Utils.getStatusBadgeInfo(s);
            const tooltip = getStatusDescription(s);
            const html = `<span class="${badgeInfo.className} tooltip status-badge-clickable" 
                          data-tooltip="${tooltip}" 
                          role="button" 
                          tabindex="0">${badgeInfo.label}</span>`;

            // "Nouveau" and "Départ" are general/administrative, they stay in main header
            // Everything else moves to the Contexte card where it belongs logically
            if (resolveStudentStatus(s)?.category === 'movement') {
                headerHtml += html;
            } else {
                contextHtml += html;
            }
        });

        if (headerContainer) headerContainer.innerHTML = headerHtml;
        if (contextContainer) contextContainer.innerHTML = contextHtml;

        // Add click listeners to all generated badges
        [headerContainer, contextContainer].forEach(container => {
            if (container) {
                container.querySelectorAll('.status-badge-clickable').forEach(badge => {
                    badge.addEventListener('click', () => this.toggleEditMode(true));
                    badge.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            this.toggleEditMode(true);
                        }
                    });
                });
            }
        });
    },

    /**
     * Handle avatar click
     * @param {string} studentId 
     */
    async handleAvatarClick(studentId) {
        // Create hidden file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.className = 'student-avatar__input';

        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            const success = await StudentPhotoManager.uploadPhoto(studentId, file);
            if (success) {
                const result = appState.generatedResults.find(r => r.id === studentId);
                if (result) {
                    // Update list row
                    this.callbacks.onUpdateListRow(result);
                    // We need to re-render avatar in header
                    const avatarContainer = document.getElementById('focusAvatarContainer');
                    if (avatarContainer) {
                        avatarContainer.innerHTML = StudentPhotoManager.getAvatarHTML(result, 'lg');
                        // Re-attach listener? Or assume renderContent will call this? 
                        // The renderContent in Main manager calls handleAvatarClick. 
                        // We should probably just let the main manager re-render or handle it here.
                        // For now, let's just re-attach the click
                        const avatarEl = avatarContainer.querySelector('.student-avatar');
                        if (avatarEl) {
                            avatarEl.classList.add('student-avatar--editable');
                            avatarEl.onclick = () => this.handleAvatarClick(studentId);
                        }
                    }
                }
            } else {
                UI.showNotification('Erreur lors du téléchargement', 'error');
            }
        };

        input.click();
    },

    /**
     * Handles avatar click in creation mode (no student ID yet)
     * Stores the photo temporarily until the student is saved
     * @param {HTMLElement} avatarEl - The avatar element to update visually
     */
    _handlePendingAvatarClick(avatarEl) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.className = 'student-avatar__input';

        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.type && !file.type.startsWith('image/')) {
                UI.showNotification('Format d\'image non supporté', 'warning');
                return;
            }

            // Validate file size (max 5MB before compression)
            if (file.size > 5 * 1024 * 1024) {
                UI.showNotification('Image trop volumineuse (max 5 Mo)', 'warning');
                return;
            }

            try {
                const base64Data = typeof StudentPhotoManager._compressImage === 'function'
                    ? await StudentPhotoManager._compressImage(file)
                    : await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (event) => resolve(event.target.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });

                this._pendingAvatarData = base64Data;

                // Update avatar visually immediately
                if (avatarEl) {
                    let imgEl = avatarEl.querySelector('.student-avatar__img');
                    const initialsEl = avatarEl.querySelector('.student-avatar__initials');

                    if (!imgEl) {
                        imgEl = document.createElement('img');
                        imgEl.className = 'student-avatar__img';
                        avatarEl.appendChild(imgEl);
                    }

                    imgEl.src = base64Data;
                    if (initialsEl) initialsEl.style.display = 'none';
                    avatarEl.classList.remove('student-avatar--empty-name');
                }
            } catch (_) {
                UI.showNotification('Erreur lors du téléchargement', 'error');
            }
        };

        input.click();
    },

    /**
     * Gets the pending avatar data (for use when saving a new student)
     * @returns {string|null} Base64 image data or null
     */
    getPendingAvatarData() {
        return this._pendingAvatarData || null;
    },

    /**
     * Clears pending avatar data
     */
    clearPendingAvatarData() {
        this._pendingAvatarData = null;
    },

    /**
     * Settles any active header edit state before a panel transition (open, openNew, close, navigate)
     * - Commits changes when valid identity input is present (unless cancelCreation is true)
     * - Cleans up or reverts cleanly when empty or cancelled without triggering a blocking toast
     * @param {Object} [options={}]
     * @param {boolean} [options.cancelCreation=false]
     */
    settleEditMode({ cancelCreation = false } = {}) {
        const header = document.querySelector('.focus-header');
        if (!header || !header.classList.contains('editing')) return;

        const isCreationMode = this.callbacks.getIsCreationMode();
        const hasIdentity = this.hasCreationIdentityInput();

        if (isCreationMode) {
            if (!cancelCreation && hasIdentity) {
                this.toggleEditMode(false, false);
            } else {
                this.clearPendingAvatarData();
                this._originalHeaderValues = null;
                this.callbacks.setIsCreationMode(false);
                const readMode = document.querySelector('.focus-header-read');
                const editMode = document.querySelector('.focus-header-edit');
                const avatarEl = document.getElementById('focusAvatarContainer')?.querySelector('.student-avatar');
                this._exitEditModeUI(header, readMode, editMode, avatarEl);
            }
        } else {
            this.toggleEditMode(false, !hasIdentity);
        }
    },

    /**
     * Close edit mode if active (helper for external calls)
     * @param {boolean} [save=true] - Whether to save changes
     * @returns {boolean}
     */
    closeEditMode(save = true) {
        const header = document.querySelector('.focus-header');
        if (header && header.classList.contains('editing')) {
            return this.toggleEditMode(false, !save);
        }
        return true;
    }
};
