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

export const FocusPanelHeader = {
    // Callbacks to main manager
    callbacks: {
        getCurrentStudentId: () => null,
        getIsCreationMode: () => false,
        setIsCreationMode: (val) => { },
        onRefreshStatus: () => { },
        onUpdateListRow: () => { },
        onRenderTimeline: () => { },
        onUpdateNavigation: () => { },
        getHistoryEdits: () => null,
        clearHistoryEdits: () => { }
    },

    // Internal state for edit reversions
    _originalHeaderValues: null,


    // Definitions
    _statusDescriptions: {
        'Nouveau': 'Élève arrivé récemment dans la classe',
        'Départ': 'Élève qui quitte la classe prochainement',
        'PPRE': 'Programme Personnalisé de Réussite Éducative',
        'PAP': 'Plan d\'Accompagnement Personnalisé',
        'ULIS': 'Unité Localisée pour l\'Inclusion Scolaire',
        'Délégué': 'Délégué de classe'
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
        const focusEditSaveBtn = document.getElementById('focusEditSaveBtn');
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');
        const statusesContainer = document.querySelector('.focus-header-edit .status-checkboxes');

        if (studentName) {
            studentName.addEventListener('click', () => this.toggleEditMode(true));
        }

        if (focusEditSaveBtn) {
            focusEditSaveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleEditMode(false); // Validates and closes
            });
        }
        // Note: Cancel is now handled by the close button (×) in focus-nav-buttons

        if (nomInput) nomInput.addEventListener('input', () => this.callbacks.onRefreshStatus());
        if (prenomInput) prenomInput.addEventListener('input', () => this.callbacks.onRefreshStatus());

        if (statusesContainer) {
            statusesContainer.addEventListener('change', () => this.callbacks.onRefreshStatus());
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
            // Enter Edit Mode
            header.classList.add('editing');
            readMode.classList.add('hidden');
            editMode.classList.add('visible');

            // Add editing class to nav buttons for styling
            const navButtons = document.querySelector('.focus-nav-buttons');
            if (navButtons) navButtons.classList.add('editing');

            // Update tooltips for edit mode
            const saveBtn = document.getElementById('focusEditSaveBtn');
            const closeBtn = document.getElementById('focusBackBtn');
            if (saveBtn) {
                saveBtn.setAttribute('data-tooltip', 'Valider les modifications');
                saveBtn.classList.add('tooltip');
            }
            if (closeBtn) {
                closeBtn.setAttribute('data-tooltip', 'Annuler les modifications');
                closeBtn.classList.add('tooltip');
            }

            // === ENABLE avatar editing ===
            if (avatarEl) {
                const studentId = avatarContainer.dataset.studentId;
                if (studentId) {
                    // Existing student: enable photo upload
                    avatarEl.classList.add('student-avatar--editable');
                    avatarEl.onclick = () => this.handleAvatarClick(studentId);
                } else {
                    // Creation mode: allow photo upload with temporary storage
                    avatarEl.classList.add('student-avatar--editable');
                    avatarEl.onclick = () => this._handlePendingAvatarClick(avatarEl);
                }
            }

            // Populate Inputs
            // FORCE null result if in creation mode to ensure we don't load a previous student
            const result = (currentStudentId && !isCreationMode) ? appState.filteredResults.find(r => r.id === currentStudentId) : null;
            if (result) {
                const nomInput = document.getElementById('headerNomInput');
                const prenomInput = document.getElementById('headerPrenomInput');
                if (nomInput) nomInput.value = result.nom;
                if (prenomInput) prenomInput.value = result.prenom;

                // STORE original values for cancel/revert
                this._originalHeaderValues = {
                    nom: result.nom,
                    prenom: result.prenom,
                    statuses: [...(result.studentData.statuses || [])]
                };

                // Populate Statuses
                const checkboxes = editMode.querySelectorAll('input[type="checkbox"]');
                const currentStatuses = result.studentData.statuses || [];
                checkboxes.forEach(cb => {
                    cb.checked = currentStatuses.includes(cb.value);

                    // Add tooltip to parent label
                    const label = cb.closest('label');
                    if (label) {
                        const description = this._statusDescriptions[cb.value] || cb.value;
                        label.setAttribute('data-tooltip', description);
                        label.classList.add('tooltip');
                    }
                });

                // Initialize tooltips for these new elements
                setTimeout(() => UI.initTooltips(), 0);

                // Focus Name
                if (nomInput) setTimeout(() => nomInput.focus(), 100);
            } else if (isCreationMode) {
                // Clear Inputs for New Student
                const nomInput = document.getElementById('headerNomInput');
                const prenomInput = document.getElementById('headerPrenomInput');
                if (nomInput) nomInput.value = '';
                if (prenomInput) prenomInput.value = '';

                // Store empty original values
                this._originalHeaderValues = {
                    nom: '',
                    prenom: '',
                    statuses: []
                };

                // Uncheck all statuses
                const checkboxes = editMode.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => cb.checked = false);

                // Focus Name
                if (nomInput) setTimeout(() => nomInput.focus(), 100);
            }
        } else {
            // Exit Edit Mode

            // Check if we're in creation mode (no existing student)
            const isCreationMode = this.callbacks.getIsCreationMode();

            if (cancel && this._originalHeaderValues) {
                // RESTORE original values to inputs (for visual consistency)
                const nomInput = document.getElementById('headerNomInput');
                const prenomInput = document.getElementById('headerPrenomInput');
                if (nomInput) nomInput.value = this._originalHeaderValues.nom;
                if (prenomInput) prenomInput.value = this._originalHeaderValues.prenom;

                // Restore checkboxes
                const checkboxes = editMode.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = this._originalHeaderValues.statuses.includes(cb.value);
                });

                // Clear stored values and pending photo
                this._originalHeaderValues = null;
                this.clearPendingAvatarData();
            } else if (cancel && isCreationMode) {
                // Cancel in creation mode: clean up and close panel
                this.clearPendingAvatarData();
                this._exitEditModeUI(header, readMode, editMode, avatarEl);

                // Close the panel
                if (typeof FocusPanelManager !== 'undefined') {
                    FocusPanelManager.close();
                }
                return;
            } else if (!cancel) {
                this._saveHeaderChanges();
                this._originalHeaderValues = null;
            }

            // Clean up UI
            this._exitEditModeUI(header, readMode, editMode, avatarEl);
        }
    },

    /**
     * Clean up UI state when exiting edit mode
     * @private
     */
    _exitEditModeUI(header, readMode, editMode, avatarEl) {
        // Disable avatar editing
        if (avatarEl) {
            avatarEl.classList.remove('student-avatar--editable', 'student-avatar--editable-pending', 'tooltip');
            avatarEl.removeAttribute('data-tooltip');
            avatarEl.onclick = null;
        }

        // Remove editing state from header
        header?.classList.remove('editing');
        readMode?.classList.remove('hidden');
        editMode?.classList.remove('visible');

        // Remove editing state from nav buttons
        const navButtons = document.querySelector('.focus-nav-buttons');
        navButtons?.classList.remove('editing');

        // Restore original tooltips
        const saveBtn = document.getElementById('focusEditSaveBtn');
        const closeBtn = document.getElementById('focusBackBtn');
        saveBtn?.classList.remove('tooltip');
        closeBtn?.setAttribute('data-tooltip', 'Fermer');
    },

    /**
     * Saves changes made in the Header Edit Mode
     * @private
     */
    _saveHeaderChanges() {
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');
        const currentStudentId = this.callbacks.getCurrentStudentId();
        const isCreationMode = this.callbacks.getIsCreationMode();

        // Validation basic
        if ((!nomInput?.value?.trim() && !prenomInput?.value?.trim()) && isCreationMode) {
            UI.showNotification('Veuillez entrer au moins un nom ou un prénom', 'warning');
            return;
        }

        let result;

        if (isCreationMode || !currentStudentId) {
            // === CREATION MODE ===
            const newId = 'student-' + Date.now();

            result = {
                id: newId,
                nom: nomInput.value.trim().toUpperCase() || 'NOUVEAU',
                prenom: prenomInput.value.trim() || 'Élève',
                classId: userSettings.academic.currentClassId || null,
                studentData: {
                    statuses: [],
                    periods: {}
                },
                appreciation: '',
                isPending: false,
                wasGenerated: false
            };

            // Merge history if available
            const historyEdits = this.callbacks.getHistoryEdits();
            if (historyEdits) {
                Object.entries(historyEdits).forEach(([period, data]) => {
                    if (!result.studentData.periods[period]) {
                        result.studentData.periods[period] = {};
                    }

                    if (data.grade !== undefined && data.grade !== '') {
                        const num = parseFloat(data.grade.toString().replace(',', '.'));
                        if (!isNaN(num)) result.studentData.periods[period].grade = num;
                    }
                    if (data.appreciation !== undefined) {
                        result.studentData.periods[period].appreciation = data.appreciation;
                    }
                });
            }

            // Ensure current period exists in structure
            const currentPeriod = appState.currentPeriod;
            if (!result.studentData.periods[currentPeriod]) {
                result.studentData.periods[currentPeriod] = {};
            }

            // Add to app state
            appState.generatedResults.push(result);
            appState.filteredResults.push(result);

            // Apply pending avatar photo if any
            if (this._pendingAvatarData) {
                result.studentData.photo = this._pendingAvatarData;
                this.clearPendingAvatarData();
            }

            // Update tracking via callbacks
            this.callbacks.setCurrentStudentId(newId);
            this.callbacks.setIsCreationMode(false);
            this.callbacks.clearHistoryEdits();

            UI.showNotification('Élève créé avec succès', 'success');
            ClassUIManager.updateStudentCount();

        } else {
            // === EDIT MODE ===
            result = appState.generatedResults.find(r => r.id === currentStudentId);
            if (!result) return;

            // 1. Save Identity
            if (nomInput) result.nom = nomInput.value.trim() || result.nom;
            if (prenomInput) result.prenom = prenomInput.value.trim() || result.prenom;

            // 1b. Save History Edits (if any)
            const historyEdits = this.callbacks.getHistoryEdits();
            if (historyEdits) {
                Object.entries(historyEdits).forEach(([period, data]) => {
                    if (!result.studentData.periods[period]) result.studentData.periods[period] = {};

                    if (data.grade !== undefined) {
                        // Parse grade duplicate logic from FocusPanelManager._parseGrade but simple here
                        const num = parseFloat(data.grade.toString().replace(',', '.'));
                        const grade = isNaN(num) ? undefined : num;
                        if (grade !== undefined) result.studentData.periods[period].grade = grade;
                    }
                    if (data.appreciation !== undefined) {
                        result.studentData.periods[period].appreciation = data.appreciation;
                    }
                });
                this.callbacks.clearHistoryEdits();
            }
        }

        // 2. Save Statuses (Common)
        const editMode = document.querySelector('.focus-header-edit');
        if (editMode) {
            const checkedBoxes = editMode.querySelectorAll('input[type="checkbox"]:checked');
            result.studentData.statuses = Array.from(checkedBoxes).map(cb => cb.value);
        }

        // 3. Persist
        StorageManager.saveAppState();

        // 4. Update View
        this.updateHeaderName(); // Uses current student, which we updated
        this.renderStatusBadges(result.studentData.statuses);

        // Render history grades again to show the newly added history
        this.callbacks.onRenderTimeline(result.studentData);
        this.callbacks.onUpdateNavigation();

        // 5. Sync with List
        this.callbacks.onUpdateListRow(result);

        if (!isCreationMode) {
            UI.showNotification('Modifications enregistrées', 'success');
        }
    },

    /**
     * Update header name display
     * @param {Object} [result] - Optional result object, otherwise fetches from current ID
     */
    updateHeaderName(result) {
        const nameEl = document.getElementById('focusStudentName');
        if (!nameEl) return;

        let nom, prenom;

        // Try inputs first if in edit mode and active
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');

        if (nomInput && prenomInput && (nomInput.value.trim() || prenomInput.value.trim())) {
            nom = nomInput.value.trim().toUpperCase() || '...';
            prenom = prenomInput.value.trim() || '...';
        } else {
            if (!result) {
                const currentId = this.callbacks.getCurrentStudentId();
                if (currentId) {
                    result = appState.generatedResults.find(r => r.id === currentId);
                }
            }

            if (result) {
                nom = result.nom || '...';
                prenom = result.prenom || '...';
            } else {
                return;
            }
        }

        nameEl.innerHTML = `${prenom} ${nom} <i class="fas fa-pen focus-name-edit-icon"></i>`;
    },

    /**
     * Renders status badges
     * @param {Array} statuses 
     */
    renderStatusBadges(statuses) {
        const container = document.getElementById('focusStatusBadges');
        if (!container) return;

        container.innerHTML = statuses.map(s => {
            const badgeInfo = Utils.getStatusBadgeInfo(s);
            const tooltip = this._statusDescriptions[s] || s;
            return `<span class="${badgeInfo.className} tooltip status-badge-clickable" 
                          data-tooltip="${tooltip}" 
                          role="button" 
                          tabindex="0">${badgeInfo.label}</span>`;
        }).join('');

        // Add click listeners
        container.querySelectorAll('.status-badge-clickable').forEach(badge => {
            badge.addEventListener('click', () => this.toggleEditMode(true));
            badge.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.toggleEditMode(true);
                }
            });
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
                UI.showNotification('Photo ajoutée', 'success');
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

            // Validate file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                UI.showNotification('Image trop volumineuse (max 2 Mo)', 'warning');
                return;
            }

            // Read file as base64 and store temporarily
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64Data = event.target.result;
                this._pendingAvatarData = base64Data;

                // Update avatar visually immediately
                if (avatarEl) {
                    // Create or update the image
                    let imgEl = avatarEl.querySelector('.student-avatar__img');
                    const initialsEl = avatarEl.querySelector('.student-avatar__initials');

                    if (!imgEl) {
                        imgEl = document.createElement('img');
                        imgEl.className = 'student-avatar__img';
                        avatarEl.appendChild(imgEl);
                    }

                    imgEl.src = base64Data;
                    if (initialsEl) initialsEl.style.display = 'none';
                }

                UI.showNotification('Photo ajoutée (sera enregistrée avec l\'élève)', 'success');
            };
            reader.readAsDataURL(file);
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
     * Close edit mode if active (helper for external calls)
     * @param {boolean} save - Whether to save changes
     */
    closeEditMode(save) {
        const header = document.querySelector('.focus-header');
        if (header && header.classList.contains('editing')) {
            this.toggleEditMode(false, !save);
        }
    }
};
