/**
 * @fileoverview Focus Panel Manager - Gestion du panneau de détail élève
 * Part of Liste + Focus UX Revolution
 * @module managers/FocusPanelManager
 */

import { appState, userSettings } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { AIService } from '../services/AIService.js';
import { PromptService } from '../services/PromptService.js';
import { ClassUIManager } from './ClassUIManager.js';
import { ClassManager } from './ClassManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { JournalManager } from './JournalManager.js';
import { StatsUI } from './StatsUIManager.js';
import { TooltipsUI } from './TooltipsManager.js';
// ResultCardsUI removed - logic moved to Utils

/** @type {import('./AppreciationsManager.js').AppreciationsManager|null} */
let AppreciationsManager = null;

/**
 * Module de gestion du Focus Panel (vue détaillée élève)
 * @namespace FocusPanelManager
 */
export const FocusPanelManager = {
    /** ID de l'élève actuellement affiché */
    currentStudentId: null,

    /** Index dans la liste filtrée */
    currentIndex: -1,

    /** Map of active generation controllers by student ID */
    _activeGenerations: new Map(),

    /**
     * Initialise le module avec les références nécessaires
     * @param {Object} appreciationsManager - Référence à AppreciationsManager
     */
    init(appreciationsManager) {
        AppreciationsManager = appreciationsManager;
        this._setupEventListeners();
    },

    /**
     * Configure les event listeners du Focus Panel
     * @private
     */
    _setupEventListeners() {
        if (this._listenersAttached) return;
        this._listenersAttached = true;

        // DOM elements
        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');
        const backBtn = document.getElementById('focusBackBtn');
        const prevBtn = document.getElementById('focusPrevBtn');
        const nextBtn = document.getElementById('focusNextBtn');
        const generateBtn = document.getElementById('focusGenerateBtn');
        const copyBtn = document.getElementById('focusCopyBtn');

        // Close panel
        if (backdrop) backdrop.addEventListener('click', () => this.close());
        if (backBtn) backBtn.addEventListener('click', () => this.close());

        // Navigation
        if (prevBtn) prevBtn.addEventListener('click', () => this.navigatePrev());
        if (nextBtn) nextBtn.addEventListener('click', () => this.navigateNext());

        // Generate
        if (generateBtn) generateBtn.addEventListener('click', () => this.generate());

        // Copy
        if (copyBtn) copyBtn.addEventListener('click', () => this.copy());

        // Header inputs change detection
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');
        if (nomInput) nomInput.addEventListener('input', () => this._refreshAppreciationStatus());
        if (prenomInput) prenomInput.addEventListener('input', () => this._refreshAppreciationStatus());

        const statusesContainer = document.querySelector('.focus-header-edit .status-checkboxes');
        if (statusesContainer) {
            statusesContainer.addEventListener('change', () => this._refreshAppreciationStatus());
        }

        // NEW: Header Edit Mode
        const studentName = document.getElementById('focusStudentName');
        const focusEditSaveBtn = document.getElementById('focusEditSaveBtn');

        if (studentName) {
            studentName.addEventListener('click', () => this._toggleHeaderEditMode(true));
        }

        if (focusEditSaveBtn) {
            focusEditSaveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleHeaderEditMode(false); // Validates and closes
            });
        }

        // Settings Change Listener (for instant Threshold updates)
        document.addEventListener('app-settings-changed', () => {
            // If we are viewing a student, refresh the badge status
            if (this.currentStudentId) {
                this._refreshAppreciationStatus();
            }
        });

        const focusEditCancelBtn = document.getElementById('focusEditCancelBtn');
        if (focusEditCancelBtn) {
            focusEditCancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleHeaderEditMode(false, true); // Cancel without saving
            });
        }

        // (Toggle Details button removed - main header period selector is the source of truth)

        // Analyze button/page (Existing logic)
        const analyzeBtn = document.getElementById('focusAnalyzeBtn');
        if (analyzeBtn) analyzeBtn.addEventListener('click', () => this._showAnalysisPage());
        const analysisBackBtn = document.getElementById('focusAnalysisBackBtn');
        if (analysisBackBtn) analysisBackBtn.addEventListener('click', () => this._hideAnalysisPage());
        const generateAnalysisBtn = document.getElementById('focusGenerateAnalysisBtn');
        if (generateAnalysisBtn) generateAnalysisBtn.addEventListener('click', () => this._generateAnalysis());

        // Grade Input Listener for dirty check
        // Note: focusCurrentGradeInput is dynamically created/valued in _renderContent, 
        // so we need to attach listener THERE or delegate. 
        // delegated listener for convenience:
        document.addEventListener('input', (e) => {
            if (e.target && (e.target.id === 'focusCurrentGradeInput' || e.target.id === 'focusEditGradeInput')) {
                this._refreshAppreciationStatus();
            }
        });




        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen()) return;
            const activeEl = document.activeElement;
            const isEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'ArrowLeft' && !isEditing) {
                e.preventDefault();
                this.navigatePrev();
            } else if (e.key === 'ArrowRight' && !isEditing) {
                e.preventDefault();
                this.navigateNext();
            }
        });

        // Refinement & Appreciation (Existing logic)
        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            refinementOptions.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-refine-type]');
                if (btn) this._refineAppreciation(btn.dataset.refineType);
            });
        }

        const appreciationText = document.getElementById('focusAppreciationText');
        if (appreciationText) {
            appreciationText.addEventListener('input', () => this._updateWordCount());
            appreciationText.addEventListener('blur', () => {
                const content = appreciationText.textContent?.trim();
                if (content && !content.includes('Aucune appréciation')) {
                    this._pushToHistory(content);

                    // Mark as manually edited (no longer AI generated)
                    const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                    if (result) {
                        result.wasGenerated = false; // Mark as manually edited
                        result.tokenUsage = null; // Clear AI metadata
                    }

                    // Save and show feedback for manual edits
                    this._saveContext();
                    this._updateAppreciationStatus(null, { state: 'saved' });

                    // Hide AI indicator (manual edit)
                    const aiIndicator = document.getElementById('focusAiIndicator');
                    if (aiIndicator) aiIndicator.style.display = 'none';

                    // Update list view to reflect changes
                    if (result) this._updateListRow(result);
                }
            });
            appreciationText.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); this._undo(); }
                    else if (e.key === 'z' && e.shiftKey || e.key === 'y') { e.preventDefault(); this._redo(); }
                }
            });
        }

        const historyIndicator = document.getElementById('focusHistoryIndicator');
        if (historyIndicator) {
            historyIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                this._showHistoryPopover();
            });
        }

        // Note: FAB button (addStudentFab) is now handled by ImportWizardManager via the Hub

        // Context textarea
        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) {
            contextInput.addEventListener('input', () => {
                this._autoResizeTextarea(contextInput);
                this._saveContext(); // Immediate save to prevent data loss
                this._refreshAppreciationStatus(); // Check dirty state
            });
        }

        // === JOURNAL DE BORD EVENT LISTENERS ===
        this._setupJournalListeners();
    },

    /**
         * Auto-resize textarea based on content
         * @param {HTMLTextAreaElement} textarea - The textarea element
         * @private
         */
    _autoResizeTextarea(textarea) {
        if (!textarea) return;
        // Reset to 1 row to allow full shrink
        textarea.rows = 1;
        // Reset height to auto to get correct scrollHeight
        textarea.style.height = 'auto';
        // Set to scrollHeight but respect max-height from CSS
        const maxHeight = 200;
        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    },
    /** Creation mode flag */
    isCreationMode: false,

    /** Journal editing mode */
    _editingJournalEntryId: null,

    /**
     * Vérifie si le panel est ouvert
     * @returns {boolean}
     */
    isOpen() {
        const panel = document.getElementById('focusPanel');
        return panel?.classList.contains('open') ?? false;
    },

    /**
     * Vérifie si les données actuelles diffèrent du snapshot de génération
     * @returns {boolean} true si des données pertinentes ont changé
     */
    _checkDirtyState(result) {
        if (!result || !result.wasGenerated || !result.generationSnapshot) return false;

        // CRITICAL FIX: Only check dirty state if we're viewing the SAME period that was generated
        // This prevents showing "Modified" badge on T1/T2 when only T3 was generated
        const currentPeriod = appState.currentPeriod;
        if (result.generationPeriod && result.generationPeriod !== currentPeriod) {
            // The generation was for a different period, so no dirty check applies
            return false;
        }

        // 1. Comparer l'identité
        // Note: On regarde les inputs s'ils existent (en mode édition), sinon le result
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');

        const currentNom = nomInput ? nomInput.value.trim() : result.nom;
        const currentPrenom = prenomInput ? prenomInput.value.trim() : result.prenom;

        // Comparaison avec snapshot (qui a la structure studentData)
        // Le snapshot contient le nom/prenom dans la racine de l'objet snapshot (car c'est une copie de studentData + props racine par StudentDataManager ?)
        // Vérifions StudentDataManager.js : generationSnapshot est une copie de newStudentData.
        // newStudentData contient : statuses, periods, currentPeriod, negativeInstructions...
        // MAIS newStudentData NE CONTIENT PAS nom/prenom à la racine ! Ils sont passés en arguments séparés à createResultObject.
        // ATTENTION : StudentDataManager.createResultObject snapshot newStudentData.
        // Il faut vérifier si nom/prenom sont dans studentData.
        // Utils.parseStudentLine retourne { nom, prenom, studentData: {...} }
        // Donc studentData NE contient PAS nom/prenom.
        // ==> Le dirty check sur le nom/prénom doit comparer avec result.nom/prenom au moment de la génération.
        // MAIS result.nom/prenom sont mutés directement par le FocusPanelManager en mode édition !
        // Problème : on a perdu l'état original du nom/prénom post-génération si on le modifie.
        // SOLUTION : On accepte que le changement de nom/prénom ne soit pas 'dirty' pour l'IA (ce qui est logique, l'IA s'en fiche un peu du nom sauf pour le deanonymizer).
        // OU : On stocke nom/prenom dans le snapshot aussi.
        // Pour l'instant, concentrons-nous sur les données CRITIQUES pour l'IA : Context, Grade, Statuses.

        const snapshot = result.generationSnapshot;

        // 2. Comparer les statuts
        // Les statuts sont dans result.studentData.statuses.
        // En mode édition, ils peuvent être dans les checkboxes.
        let currentStatuses = result.studentData.statuses || [];
        const editMode = document.querySelector('.focus-header-edit');
        if (editMode && editMode.classList.contains('visible')) {
            const checkedBoxes = editMode.querySelectorAll('input[type="checkbox"]:checked');
            currentStatuses = Array.from(checkedBoxes).map(cb => cb.value);
        }

        const snapshotStatuses = snapshot.statuses || [];
        // Tri pour comparaison
        if (!Utils.isEqual([...currentStatuses].sort(), [...snapshotStatuses].sort())) return true;

        // 3. Comparer les données de la période (Grade + Contexte)
        // Les inputs sont la source de vérité si présents
        const gradeInput = document.getElementById('focusCurrentGradeInput');
        const contextInput = document.getElementById('focusContextInput');

        let currentGrade = result.studentData.periods?.[currentPeriod]?.grade;
        if (gradeInput) {
            const val = gradeInput.value.replace(',', '.');
            currentGrade = (val === '' || val === null) ? null : parseFloat(val);
        }

        let currentContext = result.studentData.periods?.[currentPeriod]?.context || '';
        if (contextInput) {
            currentContext = contextInput.value.trim();
        }

        const snapshotPeriod = snapshot.periods?.[currentPeriod] || {};
        const snapshotGrade = snapshotPeriod.grade;
        const snapshotContext = snapshotPeriod.context || '';

        // Comparaison Note
        // Attention au null vs undefined vs ''
        const normCurrentGrade = (currentGrade === undefined || currentGrade === null || isNaN(currentGrade)) ? null : currentGrade;
        const normSnapshotGrade = (snapshotGrade === undefined || snapshotGrade === null || isNaN(snapshotGrade)) ? null : snapshotGrade;

        if (normCurrentGrade !== normSnapshotGrade) return true;

        // Comparaison Contexte
        if (currentContext !== snapshotContext) return true;

        // 4. Comparer le Journal de bord
        // Logic: Only changes that affect the AI prompt should trigger "Modified"
        // - Any change to textual notes is relevant.
        // - Tag changes are only relevant if they cross the threshold.

        const currentJournal = result.journal || [];
        const snapshotJournal = result.generationSnapshotJournal || [];
        // Fallback for old snapshots (backward compatibility)
        if (!result.generationSnapshotJournal && result.generationSnapshotJournalCount !== undefined) {
            const currentJournalCount = result.journal?.length || 0;
            const snapshotJournalCount = result.generationSnapshotJournalCount ?? 0;
            if (currentJournalCount !== snapshotJournalCount) return true;
            return false;
        }

        // A. Check Notes (Any content difference is dirty)
        const currentNotes = currentJournal.filter(e => e.note && e.note.trim()).map(e => e.note.trim()).sort().join('||');
        const snapshotNotes = snapshotJournal.filter(e => e.note && e.note.trim()).map(e => e.note.trim()).sort().join('||');
        if (currentNotes !== snapshotNotes) return true;

        // B. Check Active Tags (Threshold-based)
        const currentThreshold = appState.journalThreshold ?? 2;
        const snapshotThreshold = result.generationThreshold ?? currentThreshold;

        const getActiveTags = (entries, thresh) => {
            const counts = {};
            entries.forEach(e => {
                e.tags.forEach(t => {
                    counts[t] = (counts[t] || 0) + 1;
                });
            });
            // Return sorted list of tags that meet threshold
            return Object.keys(counts).filter(t => counts[t] >= thresh).sort();
        };

        const currentActiveTags = getActiveTags(currentJournal, currentThreshold);
        const snapshotActiveTags = getActiveTags(snapshotJournal, snapshotThreshold);

        if (!Utils.isEqual(currentActiveTags, snapshotActiveTags)) return true;

        return false;
    },

    /**
     * Unified Appreciation Status Badge Manager
     * Single source of truth for all appreciation status states
     * States: 'none', 'pending', 'generated', 'modified', 'saved', 'error', 'dictating'
     * @param {Object} result - Student result object
     * @param {Object} [options] - Optional overrides { state, tooltip, animate }
     */
    _updateAppreciationStatus(result, options = {}) {
        const badge = document.getElementById('focusAppreciationBadge');
        if (!badge) return;

        // Determine state based on result data (unless overridden)
        let state = options.state;
        let tooltip = options.tooltip || '';
        const animate = options.animate !== false; // Default true

        if (!state) {
            // Auto-detect state from result
            const isGenerating = this._activeGenerations.has(result?.id);
            const isGenerated = result?.wasGenerated === true;
            const hasAppreciation = result?.appreciation && result.appreciation.trim();
            const isDirty = hasAppreciation && isGenerated && this._checkDirtyState(result);

            if (isGenerating) {
                state = 'pending';
                tooltip = 'Génération en cours...';
            } else if (isDirty) {
                state = 'modified';
                tooltip = 'Données modifiées depuis la génération.\nPensez à régénérer.';
            } else if (isGenerated && hasAppreciation) {
                state = 'generated';
                // Simple tooltip for status badge
                tooltip = 'Appréciation générée et à jour';
            } else if (hasAppreciation && !isGenerated) {
                // Manual edit or legacy content
                state = 'valid';
                tooltip = 'Appréciation validée (éditée manuellement)';
            } else {
                state = 'none';
            }
        }

        // Reset badge state
        badge.className = 'appreciation-status-badge tooltip';
        badge.innerHTML = '';
        badge.removeAttribute('data-tooltip');

        if (state === 'none') {
            // Hidden - no display
            return;
        }

        // Apply state-specific styling
        badge.classList.add('visible', state);

        // CRITICAL FIX: Always ensure icon-only is REMOVED for states that need text
        // Only 'generated' is allowed to collapse (handled in its case block)
        badge.classList.remove('icon-only');

        // Special case: dictating uses 'is-dictating' class in CSS
        if (state === 'dictating') {
            badge.classList.add('is-dictating');
        }

        // Build badge content
        let icon = '';
        let text = '';

        switch (state) {
            case 'pending':
                icon = '<i class="fas fa-spinner fa-spin"></i>';
                text = '';
                break;
            case 'generated':
                icon = '<i class="fas fa-check"></i>';
                if (animate) {
                    text = '<span class="badge-text">Généré</span>';
                    // Schedule collapse to icon-only after 2s
                    setTimeout(() => {
                        // Check if we are still in generated state before collapsing
                        if (badge.classList.contains('generated')) {
                            badge.classList.add('icon-only');
                            // Re-init tooltips after collapse
                            UI.initTooltips();
                        }
                    }, 2000);
                } else {
                    // When not animating (e.g., on navigation), directly show icon-only
                    text = '';
                    badge.classList.add('icon-only');
                }
                break;
            case 'modified':
                icon = '<i class="fas fa-sync-alt"></i>';
                text = '<span class="badge-text" style="display:inline-block;">Modifié</span>';
                // Note: CSS might hide badge-text if icon-only is present, but we removed it above.
                // Inline block ensures layout stability.
                break;
            case 'saved':
                icon = '<i class="fas fa-check"></i>';
                text = '<span class="badge-text">Enregistré</span>';
                // Auto-hide after 2s
                setTimeout(() => {
                    if (badge.classList.contains('saved')) {
                        badge.classList.remove('visible', 'saved');
                    }
                }, 2000);
                break;
            case 'valid':
                // New state for manual edits - persistent checkmark (no text to avoid clutter, or text?)
                // User asked for "Badge (validé?) invisible".
                // Let's make it a simple checkmark that doesn't hide, or maybe "Validé".
                // User said: "Seul le Badge 'Généré' doit se mettre en mode contracté... ou harmoniser"
                // Let's try "Validé" then contract? Or just persistent "Validé"?
                // Standard behavior: Manual edit = valid.
                icon = '<i class="fas fa-check-circle"></i>';
                text = '<span class="badge-text">Validé</span>';
                // Let's contract it to icon-only too for harmony, or keep it text?
                // User said "Seul le Badge Généré doit se mettre en mode contracté".
                // So "Validé" should stay text? Or maybe "Validé" is not a primary state.
                // Actually, "Validé" is often synonym for "Saved".
                // Let's Keep text for "Modifié", and maybe "Validé" too.
                // BUT, constant "Validé" might be annoying.
                // Let's make "Validé" behave like "Généré" (collapse) for harmony? 
                // User said "Seul le Badge Généré... OU ALORS harmoniser".
                // Harmonizing is simpler. Let's collapse "Validé" too.
                if (animate) {
                    setTimeout(() => {
                        if (badge.classList.contains('valid')) {
                            badge.classList.add('icon-only');
                        }
                    }, 2000);
                } else {
                    badge.classList.add('icon-only');
                    text = '';
                }
                break;
            case 'error':
                icon = '<i class="fas fa-exclamation-triangle"></i>';
                text = '<span class="badge-text">Erreur</span>';
                break;
            case 'dictating':
                icon = '<i class="fas fa-microphone"></i>';
                text = '<span class="badge-text">Dictée...</span>';
                break;
        }

        badge.innerHTML = icon + text;
        if (tooltip) {
            badge.setAttribute('data-tooltip', tooltip);
        }

        // Re-init tooltips (delay to ensure DOM is fully updated)
        setTimeout(() => UI.initTooltips(), 50);
    },

    /**
     * Quick helper to refresh status from current student
     */
    _refreshAppreciationStatus() {
        if (!this.currentStudentId) return;
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (result) {
            this._updateAppreciationStatus(result);
        }
    },

    /**
     * Ouvre le Focus Panel pour un élève
     * @param {string} studentId - ID de l'élève
     */
    open(studentId) {
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result) return;

        // CRITICAL FIX: Save context of PREVIOUS student BEFORE changing currentStudentId
        // This prevents race conditions where user switches during generation
        if (this.currentStudentId && this.currentStudentId !== studentId) {
            this._saveContext();
        }

        this.currentStudentId = studentId;
        this.currentIndex = appState.filteredResults.findIndex(r => r.id === studentId);

        // Load history from student if available
        this._clearHistory(true);

        // Reset generate button state (only if target student is NOT being generated)
        // If target is being generated, _renderContent will restore the loading state
        if (!this._activeGenerations.has(studentId)) {
            const generateBtn = document.getElementById('focusGenerateBtn');
            if (generateBtn) {
                UI.hideInlineSpinner(generateBtn);
            }
            // Reset appreciation badge state
            this._updateAppreciationStatus(null, { state: 'none' });
        }

        this._renderContent(result);
        this._updateNavigation();

        // Show panel
        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');

        if (panel) panel.classList.add('open');
        if (backdrop) backdrop.classList.add('visible');

        // Focus the panel for accessibility
        panel?.focus();

    },

    /**
     * Ouvre le Focus Panel en mode création (nouvel élève)
     */
    openNew() {
        // GUARD: Require at least one class before creating students
        const classes = ClassManager.getAllClasses();
        if (classes.length === 0) {
            UI.showNotification('Créez d\'abord une classe avant d\'ajouter des élèves', 'warning');
            // Open class dropdown and show creation prompt
            ClassUIManager.openDropdown();
            setTimeout(() => ClassUIManager.showNewClassPrompt(), 100);
            return;
        }

        this.isCreationMode = true;
        this.currentStudentId = null;
        this.currentIndex = -1;

        const currentPeriod = appState.currentPeriod;

        // Create a dummy result for the new student
        const dummyResult = {
            id: null,
            nom: '',
            prenom: '',
            studentData: {
                statuses: [],
                periods: {},
                negativeInstructions: ''
            },
            appreciation: '',
            isPending: false,
            wasGenerated: false
        };

        // Initialize empty period data for current period
        dummyResult.studentData.periods[currentPeriod] = {};

        // Render the content using the standard method
        this._renderContent(dummyResult);

        // Show panel
        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');
        if (panel) panel.classList.add('open');
        if (backdrop) backdrop.classList.add('visible');

        // Explicitly clear inputs to ensure no residue from previous edits
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');
        if (nomInput) nomInput.value = '';
        if (prenomInput) prenomInput.value = '';

        // Clear any stored original values to prevents "Cancel" from restoring previous student data
        this._originalHeaderValues = null;

        // Enable Header Edit Mode (Identity + Statuses)
        this._toggleHeaderEditMode(true);

        // Clear history for fresh start
        this._clearHistory();
    },

    /**
     * Ferme le Focus Panel
     */
    close() {
        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');

        // Exit edit mode if active (cancel, don't save)
        const header = document.querySelector('.focus-header');
        if (header && header.classList.contains('editing')) {
            this._toggleHeaderEditMode(false, true); // Cancel without saving
        }

        // Save context and identity changes before closing
        this._saveContext();

        // Cancel any in-progress generation
        if (this.currentStudentId) this._cancelGenerationForStudent(this.currentStudentId);

        if (panel) panel.classList.remove('open');
        if (backdrop) backdrop.classList.remove('visible');

        // Reset state
        this.currentStudentId = null;
        this.currentIndex = -1;
        this.isCreationMode = false;
        this._originalHeaderValues = null; // Clear stored edit values
    },


    /**
     * Render the compact history timeline in the retractable menu
     * Unified method for Read Mode (viewing) and Creation Mode (editing)
     * @param {Object|null} studentData - Student data object (null in creation mode)
     * @param {boolean} [isEditable=false] - Whether to render inputs for editing
     */
    _renderStudentDetailsTimeline(studentData, isEditable = false) {
        const container = document.getElementById('studentDetailsTimeline');
        if (!container) return;

        container.innerHTML = '';
        const periods = Utils.getPeriods();
        const currentPeriod = appState.currentPeriod;

        // In creation/edit mode, we might want to filter out the current period
        // or ensure we only show previous ones if that's the desired UX.
        // But for consistency, let's show what we have.
        // For Creation Mode: We usually only want to input PREVIOUS periods history.

        periods.forEach(periodKey => {
            // Skip current period in creation mode (it has its own input in main view)
            if (isEditable && periodKey === currentPeriod) return;

            let grade = '-';
            let appreciation = '';

            // Data Retrieval
            if (isEditable) {
                // Creation Mode: Get from temporary storage
                if (!this._newStudentHistory) this._newStudentHistory = {};
                const savedData = this._newStudentHistory[periodKey] || {};
                grade = savedData.grade !== undefined ? savedData.grade : '';
                appreciation = savedData.appreciation || '';
            } else {
                // Read Mode: Get from student object
                const periodData = studentData?.studentData?.periods?.[periodKey] || {};
                grade = periodData.grade !== undefined ? periodData.grade : '-';
                appreciation = periodData.appreciation || '';
            }

            const shortPeriod = Utils.getPeriodLabel(periodKey, false);

            const item = document.createElement('div');
            item.className = 'timeline-compact-item';
            if (isEditable) {
                item.classList.add('editing');
                // Remove the forced column layout to match read-only view's row layout
                // However, we need to ensure the content area takes full width
                // item.style.flexDirection = 'column'; // REMOVED
                // item.style.alignItems = 'stretch';   // REMOVED
            }

            if (isEditable) {
                // --- EDITABLE TEMPLATE ---
                // Mirror the Read-Only Structure: Badge | Content
                item.innerHTML = `
                    <div class="timeline-compact-badge">${shortPeriod}</div>
                    <div class="timeline-compact-content" style="width:100%;">
                        <div class="timeline-compact-header" style="justify-content: space-between; margin-bottom: 8px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="font-weight: 600; color: var(--text-primary);">Moyenne :</span>
                                <input type="text" class="history-grade-input-creation" data-period="${periodKey}" 
                                    value="${grade}" 
                                    placeholder="--" style="width:50px; text-align:center; padding:4px; border:1px solid var(--border-color); border-radius:4px; background: var(--bg-primary);">
                            </div>
                        </div>
                        <textarea class="history-appreciation-input-creation" data-period="${periodKey}"
                            placeholder="Saisissez l'appréciation pour le trimestre ${shortPeriod}..." 
                            style="width:100%; min-height:80px; padding:8px; border:1px solid var(--border-color); border-radius:4px; font-size:0.9rem; resize:vertical; background: var(--bg-primary); line-height: 1.5;">${appreciation}</textarea>
                    </div>
                `;
            } else {
                // --- READ-ONLY TEMPLATE ---
                item.innerHTML = `
                    <div class="timeline-compact-badge">${shortPeriod}</div>
                    <div class="timeline-compact-content">
                        <div class="timeline-compact-header">
                            <span>Moyenne : ${grade}</span>
                        </div>
                        ${appreciation ? `<div class="timeline-compact-appreciation">"${appreciation}"</div>` : ''}
                    </div>
                `;
            }
            container.appendChild(item);
        });

        if (isEditable) {
            // Add listeners to save data temporarily
            container.querySelectorAll('.history-grade-input-creation').forEach(input => {
                input.addEventListener('input', (e) => {
                    const period = e.target.dataset.period;
                    const val = e.target.value.replace(',', '.');
                    if (!this._newStudentHistory[period]) this._newStudentHistory[period] = {};
                    this._newStudentHistory[period].grade = val;
                });
            });

            container.querySelectorAll('.history-appreciation-input-creation').forEach(input => {
                input.addEventListener('input', (e) => {
                    const period = e.target.dataset.period;
                    if (!this._newStudentHistory[period]) this._newStudentHistory[period] = {};
                    this._newStudentHistory[period].appreciation = e.target.value;
                });
            });
        }
    },

    /**
     * Toggles the Header Edit Mode (Identity + Statuses)
     * @param {boolean} show - True to edit, False to save and view
     * @param {boolean} [cancel=false] - If true, exit without saving
     */
    _toggleHeaderEditMode(show, cancel = false) {
        const header = document.querySelector('.focus-header');
        const readMode = document.querySelector('.focus-header-read');
        const editMode = document.querySelector('.focus-header-edit');

        if (!readMode || !editMode || !header) return;

        if (show) {
            // Enter Edit Mode
            header.classList.add('editing');
            readMode.classList.add('hidden');
            editMode.classList.add('visible');

            // Populate Inputs
            const result = this.currentStudentId ? appState.filteredResults.find(r => r.id === this.currentStudentId) : null;
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
            } else if (this.isCreationMode) {
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

                // Clear stored values
                this._originalHeaderValues = null;
            } else if (!cancel) {
                this._saveHeaderChanges();
                this._originalHeaderValues = null;
            }

            header.classList.remove('editing');
            readMode.classList.remove('hidden');
            editMode.classList.remove('visible');
        }
    },

    /**
     * Saves changes made in the Header Edit Mode
     */
    /**
     * Saves changes made in the Header Edit Mode
     */
    _saveHeaderChanges() {
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');

        // Validation basic
        if ((!nomInput?.value?.trim() && !prenomInput?.value?.trim()) && this.isCreationMode) {
            UI.showNotification('Veuillez entrer au moins un nom ou un prénom', 'warning');
            return;
        }

        let result;

        if (this.isCreationMode || !this.currentStudentId) {
            // === CREATION MODE ===

            // Generate new ID
            const newId = 'student-' + Date.now(); // Simple ID generation

            // Create new student structure
            result = {
                id: newId,
                nom: nomInput.value.trim().toUpperCase() || 'NOUVEAU',
                prenom: prenomInput.value.trim() || 'Élève',
                // CRITICAL: Associate student with current class for multi-class support
                classId: userSettings.academic.currentClassId || null,
                studentData: {
                    statuses: [],
                    periods: {},
                    negativeInstructions: ''
                },
                appreciation: '',
                isPending: false,
                wasGenerated: false
            };

            // Merge history if available
            if (this._historyEdits) {
                Object.entries(this._historyEdits).forEach(([period, data]) => {
                    // Ensure structure exists
                    if (!result.studentData.periods[period]) {
                        result.studentData.periods[period] = {};
                    }

                    // Helper to parse grade
                    const parseGrade = (val) => {
                        if (!val && val !== 0 && val !== '0') return undefined; // allow undefined if empty
                        const num = parseFloat(val.toString().replace(',', '.'));
                        return isNaN(num) ? undefined : num;
                    };

                    const grade = parseGrade(data.grade);
                    if (grade !== undefined) {
                        result.studentData.periods[period].grade = grade;
                    }
                    // Only update appreciation if input was interacted with (or if we want to overwrite empty with empty? )
                    // If data.appreciation is set, use it.
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
            appState.filteredResults.push(result); // Add to filtered list too

            // Update tracking
            this.currentStudentId = newId;
            this.currentIndex = appState.filteredResults.length - 1;

            // Cleanup creation specific items
            this._historyEdits = null;
            this.isCreationMode = false;

            UI.showNotification('Élève créé avec succès', 'success');

            // CRITICAL: Update header student count after creation
            ClassUIManager.updateStudentCount();

        } else {
            // === EDIT MODE (Existing) ===
            // CRITICAL FIX: Use generatedResults as source of truth
            result = appState.generatedResults.find(r => r.id === this.currentStudentId);
            if (!result) return;

            // 1. Save Identity
            if (nomInput) result.nom = nomInput.value.trim() || result.nom;
            if (prenomInput) result.prenom = prenomInput.value.trim() || result.prenom;

            // 1b. Save History Edits (if any)
            if (this._historyEdits) {
                Object.entries(this._historyEdits).forEach(([period, data]) => {
                    if (!result.studentData.periods[period]) result.studentData.periods[period] = {};

                    const parseGrade = (val) => {
                        if (!val && val !== 0 && val !== '0') return undefined;
                        const num = parseFloat(val.toString().replace(',', '.'));
                        return isNaN(num) ? undefined : num;
                    };

                    if (data.grade !== undefined) {
                        const grade = parseGrade(data.grade);
                        if (grade !== undefined) result.studentData.periods[period].grade = grade;
                    }
                    if (data.appreciation !== undefined) {
                        result.studentData.periods[period].appreciation = data.appreciation;
                    }
                });
                // Cleanup
                this._historyEdits = null;
            }
        }

        // 2. Save Statuses (Common for both)
        const editMode = document.querySelector('.focus-header-edit');
        if (editMode) {
            const checkedBoxes = editMode.querySelectorAll('input[type="checkbox"]:checked');
            result.studentData.statuses = Array.from(checkedBoxes).map(cb => cb.value);
        }

        // 3. Persist
        StorageManager.saveAppState();

        // 4. Update View
        this._updateHeaderName();
        this._renderStatusBadges(result.studentData.statuses);

        // Render history grades again to show the newly added history
        this._renderStudentDetailsTimeline(result.studentData);
        this._updateNavigation();

        // 5. Sync with Main List
        this._updateListRow(result);

        if (!this.isCreationMode) {
            UI.showNotification('Modifications enregistrées', 'success');
        }
    },

    /**
     * Navigue vers l'élève précédent avec animation
     */
    navigatePrev() {
        if (this.currentIndex <= 0) return;
        this._navigateWithAnimation('prev');
    },

    /**
     * Navigue vers l'élève suivant avec animation
     */
    navigateNext() {
        if (this.currentIndex >= appState.filteredResults.length - 1) return;
        this._navigateWithAnimation('next');
    },

    /**
     * Navigation avec animation de transition
     * @param {'prev'|'next'} direction - Direction de navigation
     * @private
     */
    _navigateWithAnimation(direction) {
        // Cancel edit mode before navigating (don't save, just discard)
        const header = document.querySelector('.focus-header');
        if (header && header.classList.contains('editing')) {
            this._toggleHeaderEditMode(false, true); // Cancel without saving
        }

        const isAnalysisVisible = this._isAnalysisPageVisible();
        const content = isAnalysisVisible
            ? document.querySelector('.focus-analysis-content-area')
            : document.querySelector('.focus-main-page .focus-content');

        if (!content) {
            // Fallback sans animation
            this._saveContext();
            const targetIndex = direction === 'prev' ? this.currentIndex - 1 : this.currentIndex + 1;
            const filteredResult = appState.filteredResults[targetIndex];
            if (filteredResult) {
                const targetResult = appState.generatedResults.find(r => r.id === filteredResult.id) || filteredResult;
                this.open(targetResult.id);
            }
            return;
        }

        // 1. Prepare Target Data
        const targetIndex = direction === 'prev' ? this.currentIndex - 1 : this.currentIndex + 1;
        const filteredResult = appState.filteredResults[targetIndex];
        if (!filteredResult) return;

        const targetResult = appState.generatedResults.find(r => r.id === filteredResult.id) || filteredResult;

        // 2. Clone Current Content (Eliminates the "Empty Void")
        const clone = content.cloneNode(true);
        const parent = content.offsetParent || document.body;

        clone.style.position = 'absolute';
        clone.style.top = `${content.offsetTop}px`;
        clone.style.left = `${content.offsetLeft}px`;
        clone.style.width = `${content.offsetWidth}px`;
        clone.style.height = `${content.offsetHeight}px`;
        clone.style.margin = '0';
        clone.style.zIndex = '10';
        clone.style.pointerEvents = 'none';
        clone.style.overflow = 'hidden';
        clone.scrollTop = content.scrollTop;

        parent.appendChild(clone);

        // 3. Animation Classes
        const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
        const inClass = direction === 'next' ? 'slide-in-right' : 'slide-in-left';

        // 4. Update State & Content IMMEDIATELY
        this._saveContext();

        this.currentStudentId = targetResult.id;
        this.currentIndex = targetIndex;
        this._clearHistory(true);

        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) UI.hideInlineSpinner(generateBtn);
        this._updateAppreciationStatus(null, { state: 'none' });

        this._renderContent(targetResult);
        this._updateNavigation();

        if (isAnalysisVisible) {
            this._resetAnalysisSection();
            if (targetResult.strengthsWeaknesses || targetResult.nextSteps) {
                this._populateExistingAnalysis(targetResult);
            }
        }

        content.scrollTop = 0;

        // 5. Trigger Animations
        requestAnimationFrame(() => {
            clone.classList.add(outClass);

            content.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
            void content.offsetWidth;
            content.classList.add(inClass);
        });

        // 6. Cleanup
        setTimeout(() => {
            clone.remove();
            content.classList.remove(inClass);
        }, 400);
    },

    /**
     * Cancel any pending generation for a specific student (restart behavior)
     * @param {string} studentId - ID of student to cancel
     * @private
     */
    _cancelGenerationForStudent(studentId) {
        if (this._activeGenerations.has(studentId)) {
            const controller = this._activeGenerations.get(studentId);
            controller.abort();
            this._activeGenerations.delete(studentId);
        }
    },

    /**
     * Génère l'appréciation pour l'élève courant
     * IMPORTANT: Captures studentId at start and verifies it hasn't changed before applying results
     */
    async generate() {
        if (!this.currentStudentId) return;

        // CRITICAL: Capture the student ID AND period at the START of generation
        // This allows us to detect if user navigated away during async operation
        // and ensures we save to the correct period even if user changes it
        const generatingForStudentId = this.currentStudentId;
        const generatingForPeriod = appState.currentPeriod;

        const result = appState.generatedResults.find(r => r.id === generatingForStudentId);
        if (!result) return;

        // Cancel only if there is ALREADY a generation running for THIS student
        // (Restart behavior)
        this._cancelGenerationForStudent(generatingForStudentId);

        // Create new AbortController for this specific generation
        const abortController = new AbortController();
        this._activeGenerations.set(generatingForStudentId, abortController);
        const signal = abortController.signal;

        // Save current context before generating
        this._saveContext();

        // Get grade from focus panel
        const gradeInput = document.querySelector('.timeline-period.current .timeline-grade-input');
        const grade = gradeInput?.value.trim().replace(',', '.');

        if (grade) {
            if (!result.studentData.periods[generatingForPeriod]) {
                result.studentData.periods[generatingForPeriod] = {};
            }
            result.studentData.periods[generatingForPeriod].grade = parseFloat(grade);
        }

        // Update generate button to loading
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (generateBtn) {
            UI.showInlineSpinner(generateBtn);
        }

        // Save current state to history before generating (allows Undo)
        const currentText = document.getElementById('focusAppreciationText')?.textContent;
        if (currentText) this._pushToHistory(currentText);

        // Show pending badge and skeleton loading in appreciation area
        this._updateAppreciationStatus(null, { state: 'pending' });
        this._showAppreciationSkeleton();

        const appreciationEl = document.getElementById('focusAppreciationText');

        try {
            // Use existing appreciation generation logic
            const studentData = {
                id: generatingForStudentId, // Required for journal lookup
                nom: result.nom,
                prenom: result.prenom,
                statuses: result.studentData.statuses || [],
                negativeInstructions: result.studentData.periods?.[generatingForPeriod]?.context || '',
                periods: result.studentData.periods,
                currentPeriod: generatingForPeriod
            };

            const newResult = await AppreciationsManager.generateAppreciation(studentData, false, null, null);

            // Check if signal was aborted
            if (signal.aborted) {
                return;
            }

            // Generation complete - remove from active map
            this._activeGenerations.delete(generatingForStudentId);

            // ALWAYS save the result to the correct student (even if user navigated away)
            // This ensures the appreciation is there when they come back

            // Update existing result - include tokenUsage for AI indicator
            Object.assign(result, {
                appreciation: newResult.appreciation,
                evolutions: newResult.evolutions,
                errorMessage: newResult.errorMessage,
                timestamp: newResult.timestamp,
                isPending: false,
                wasGenerated: true, // Mark as generated by AI
                tokenUsage: newResult.tokenUsage // Include token usage and generation time
            });

            // Also update the AI model used in studentData
            if (newResult.studentData?.currentAIModel) {
                result.studentData.currentAIModel = newResult.studentData.currentAIModel;
            }

            // CRITICAL: Update generationSnapshot to capture current state for dirty detection
            // This must be done BEFORE any UI updates to capture the "baseline" at generation time
            result.generationSnapshot = Utils.deepClone(result.studentData);
            // Also capture full journal for granular comparison
            result.generationSnapshotJournal = Utils.deepClone(result.journal || []);
            // Capture threshold used at generation time
            result.generationThreshold = appState.journalThreshold ?? 2;
            // CRITICAL FIX: Store which period the generation was for
            // This allows dirty check to only apply to this specific period
            result.generationPeriod = generatingForPeriod;

            // Deprecated: existing count (kept for backward compat)
            result.generationSnapshotJournalCount = result.journal?.length || 0;

            // CRITICAL FIX: Use captured period, not current one (user may have switched)
            if (!result.studentData.periods[generatingForPeriod]) {
                result.studentData.periods[generatingForPeriod] = {};
            }
            result.studentData.periods[generatingForPeriod].appreciation = newResult.appreciation;

            // Check if the result contains an error (quota exceeded, etc.)
            if (newResult.errorMessage) {
                // Only update UI if still on the same student
                if (this.currentStudentId === generatingForStudentId) {
                    const appreciationEl = document.getElementById('focusAppreciationText');
                    // Show error state
                    if (appreciationEl) {
                        appreciationEl.innerHTML = `<span class="error-text">${newResult.errorMessage}</span>`;
                    }
                    // Show error badge
                    this._updateAppreciationStatus(result, { state: 'error' });
                    UI.showNotification(`Erreur : ${newResult.errorMessage}`, 'error');
                }
            } else if (newResult.appreciation) {
                // Check if user is still viewing the same student for UI updates
                const stillOnSameStudent = this.currentStudentId === generatingForStudentId;

                if (stillOnSameStudent) {
                    const appreciationEl = document.getElementById('focusAppreciationText');
                    if (appreciationEl) {
                        // Clear skeleton and show text with typewriter effect
                        appreciationEl.classList.remove('empty');
                        await UI.typewriterReveal(appreciationEl, newResult.appreciation, { speed: 'fast' });
                    }

                    // Initialize history with generated appreciation
                    this._pushToHistory(newResult.appreciation);

                    // Show done badge
                    this._updateAppreciationStatus(result, { state: 'generated' });

                    // Animate word count from 0 (skeleton had no words)
                    this._updateWordCount(true, 0);

                    // Update AI indicator with new metadata
                    this._updateAiIndicator(result);

                    UI.showNotification('Appréciation générée !', 'success');
                } else {
                    // User navigated away - just show a subtle notification
                    UI.showNotification(`Appréciation générée pour ${result.prenom}`, 'success');
                }

                // ALWAYS update the list view (regardless of current student)
                this._updateListRow(result);

                // ALWAYS persist to storage
                StorageManager.saveAppState();
            }

        } catch (error) {
            // If aborted, silently ignore
            if (signal.aborted || error.name === 'AbortError') {
                return;
            }

            console.error('Erreur génération:', error);

            // Only show error if still on the same student
            if (this.currentStudentId === generatingForStudentId) {
                UI.showNotification(`Erreur : ${error.message}`, 'error');

                // Show error state
                if (appreciationEl) {
                    appreciationEl.innerHTML = `<span class="error-text">${error.message}</span>`;
                }

                // Show error badge
                this._updateAppreciationStatus(null, { state: 'error' });
            }
        } finally {
            // Ensure we clean up the map in case of errors/exit
            if (this._activeGenerations.has(generatingForStudentId)) {
                // Determine if it was OUR controller or a newer one (race condition check)
                const currentController = this._activeGenerations.get(generatingForStudentId);
                // Only delete if it matches our signal (avoid deleting a restart)
                if (currentController && currentController.signal === signal) {
                    this._activeGenerations.delete(generatingForStudentId);
                }
            }

            // Only hide spinner if still on the same student
            if (this.currentStudentId === generatingForStudentId && generateBtn) {
                UI.hideInlineSpinner(generateBtn);
            }
        }
    },

    /**
     * Show skeleton loading in appreciation area
     * @private
     */
    _showAppreciationSkeleton() {
        const appreciationEl = document.getElementById('focusAppreciationText');
        if (!appreciationEl) return;

        // Remove empty class to hide placeholder text during skeleton display
        appreciationEl.classList.remove('empty');
        appreciationEl.innerHTML = Utils.getSkeletonHTML(false);
    },

    /**
     * Copie l'appréciation dans le presse-papier
     */
    async copy() {
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        // Use the main header's period as source of truth
        const periodAppreciation = result.studentData.periods?.[appState.currentPeriod]?.appreciation;

        if (!periodAppreciation || !periodAppreciation.trim()) {
            UI.showNotification('Aucune appréciation à copier', 'warning');
            return;
        }

        try {
            // Strip HTML tags for clean copy
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = periodAppreciation;
            const cleanText = tempDiv.textContent || tempDiv.innerText || '';

            await navigator.clipboard.writeText(cleanText);
            UI.showNotification('Appréciation copiée !', 'success');
        } catch (error) {
            UI.showNotification('Erreur de copie', 'error');
        }
    },

    /**
     * Rend le contenu du Focus Panel - "Ultima" Redesign
     * Popule les éléments HTML existants au lieu de les remplacer
     * @param {Object} result - Données de l'élève
     * @private
     */
    _renderContent(result) {
        const currentPeriod = appState.currentPeriod;

        // Exit creation mode when viewing existing student
        this.isCreationMode = false;

        // === 0. HEADER: Avatar ===
        const avatarContainer = document.getElementById('focusAvatarContainer');
        if (avatarContainer) {
            avatarContainer.innerHTML = StudentPhotoManager.getAvatarHTML(result, 'lg');
            avatarContainer.classList.add('focus-panel-avatar-container');

            // Add click handler for photo upload
            const avatarEl = avatarContainer.querySelector('.student-avatar');
            if (avatarEl) {
                if (result.id) {
                    // Existing student: enable photo upload
                    avatarEl.classList.add('student-avatar--editable');
                    avatarEl.onclick = () => this._handleAvatarClick(result.id);
                } else {
                    // Creation mode: show as editable but with tooltip + click feedback
                    avatarEl.classList.add('student-avatar--editable-pending');
                    avatarEl.setAttribute('data-tooltip', 'Enregistrez l\'élève pour ajouter une photo');
                    avatarEl.classList.add('tooltip');
                    avatarEl.onclick = () => UI.showNotification('Enregistrez l\'élève pour ajouter une photo', 'info');
                }
            }
        }

        // === 1. HEADER: Student Name ===
        const nameEl = document.getElementById('focusStudentName');
        if (nameEl) {
            nameEl.innerHTML = `${result.prenom} ${result.nom} <i class="fas fa-pen focus-name-edit-icon"></i>`;
        }

        // === 2. HEADER: Status Badges ===
        this._renderStatusBadges(result.studentData.statuses || []);

        // === 3. CONTEXT CARD: Previous Grades ===
        const prevGradesEl = document.getElementById('focusPreviousGrades');
        if (prevGradesEl) {
            prevGradesEl.innerHTML = '';
            const periods = Utils.getPeriods();
            const currentIdx = periods.indexOf(currentPeriod);

            periods.forEach((period, idx) => {
                if (idx >= currentIdx) return; // Only past periods
                const periodData = result.studentData.periods?.[period] || {};
                const grade = periodData.grade;

                // Show chip for ALL past periods (even if empty) for consistency
                const chip = document.createElement('span');
                chip.className = 'previous-grade-chip';
                const displayGrade = (grade !== undefined && grade !== null && grade !== '')
                    ? parseFloat(grade).toFixed(1).replace('.', ',')
                    : '--';

                chip.innerHTML = `<span class="prev-grade-label">${Utils.getPeriodLabel(period, false)} :</span> <span class="prev-grade-value">${displayGrade}</span>`;
                prevGradesEl.appendChild(chip);
            });
        }

        // === 5. CONTEXT CARD: Current Grade Input ===
        const gradeLabel = document.getElementById('focusCurrentGradeLabel');
        if (gradeLabel) {
            gradeLabel.textContent = Utils.getPeriodLabel(currentPeriod, false) + ' :';
        }

        const gradeInput = document.getElementById('focusCurrentGradeInput');
        if (gradeInput) {
            const currentGrade = result.studentData.periods?.[currentPeriod]?.grade;
            gradeInput.value = (currentGrade !== undefined && currentGrade !== null)
                ? parseFloat(currentGrade).toFixed(1).replace('.', ',')
                : '';

            // Add input listener for grade changes
            gradeInput.oninput = () => {
                const val = gradeInput.value.replace(',', '.');
                const grade = parseFloat(val);
                if (!isNaN(grade) && this.currentStudentId) {
                    const r = appState.generatedResults.find(r => r.id === this.currentStudentId);
                    if (r) {
                        if (!r.studentData.periods[currentPeriod]) {
                            r.studentData.periods[currentPeriod] = {};
                        }
                        r.studentData.periods[currentPeriod].grade = grade;
                        this._checkIfDataModified();
                    }
                }
            };
        }

        // === 6. CONTEXT CARD: Context Textarea ===
        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) {
            // [FIX] Only show period-specific context, NOT legacy fallback
            // Each period should have its own independent context
            const periodContext = result.studentData.periods?.[currentPeriod]?.context || '';
            contextInput.value = periodContext;
            this._autoResizeTextarea(contextInput);
        }

        // === 7. APPRECIATION CARD: Text Content ===
        // [FIX] Use period-specific appreciation as source of truth (not result.appreciation)
        // This ensures consistency between list view and focus panel
        const appreciationEl = document.getElementById('focusAppreciationText');
        let hasAppreciation = false;

        if (appreciationEl) {
            // Check if this student has a generation in progress
            const isGenerating = this._activeGenerations.has(result.id);

            if (isGenerating) {
                // Restore loading state for this student
                this._showAppreciationSkeleton();
                this._updateAppreciationStatus(null, { state: 'pending' });

                // Also restore Generate button loading state
                const generateBtn = document.getElementById('focusGenerateBtn');
                if (generateBtn) {
                    UI.showInlineSpinner(generateBtn);
                }

                hasAppreciation = false; // Consider as no appreciation yet
            } else {
                // Normal rendering: Get appreciation for the CURRENT period specifically
                const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;

                if (periodAppreciation && periodAppreciation.trim()) {
                    // Decode HTML entities and strip tags for clean display
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = periodAppreciation;
                    const cleanText = tempDiv.textContent || tempDiv.innerText || '';
                    appreciationEl.textContent = cleanText;
                    appreciationEl.classList.remove('empty');
                    appreciationEl.classList.add('filled');
                    hasAppreciation = true;

                    // [FIX] Initialize history with the initial content
                    // This ensures the history button appears after the FIRST modification
                    if (this._appreciationHistory.versions.length === 0) {
                        this._appreciationHistory.versions.push(cleanText);
                        this._appreciationHistory.currentIndex = 0;
                    }
                } else {
                    // Apply empty state class directly on the element for proper styling
                    appreciationEl.textContent = ''; // Clear content to show ::before placeholder
                    appreciationEl.classList.add('empty');
                    appreciationEl.classList.remove('filled');
                    hasAppreciation = false;
                }
            }
            this._updateWordCount();
        }

        // === 8. FOOTER: Generate Button Period ===
        const genPeriodSpan = document.getElementById('focusGeneratePeriod');
        if (genPeriodSpan) {
            genPeriodSpan.textContent = Utils.getPeriodLabel(currentPeriod, false);
        }

        // === 9. Copy Button State ===
        const copyBtn = document.getElementById('focusCopyBtn');
        if (copyBtn) {
            copyBtn.disabled = !hasAppreciation;
        }

        // === 10. Refinement Buttons State ===
        // Disable refinement buttons when there's no appreciation to refine
        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            const refineButtons = refinementOptions.querySelectorAll('[data-refine-type]');
            refineButtons.forEach(btn => {
                btn.disabled = !hasAppreciation;
                btn.classList.toggle('disabled', !hasAppreciation);
            });
        }

        // === 11. AI INDICATOR (✨) - Provenance info ===
        this._updateAiIndicator(result);

        // === 12. STATUS BADGE - Freshness state (generated, modified, pending) ===
        this._updateAppreciationStatus(result, { animate: false });

        // === 13. JOURNAL DE BORD ===
        this._renderJournal(result);
    },

    /**
     * Handle avatar click - opens file picker for photo upload
     * @param {string} studentId - Student ID
     * @private
     */
    async _handleAvatarClick(studentId) {
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
                // Re-render to show new photo
                const result = appState.generatedResults.find(r => r.id === studentId);
                if (result) {
                    this._renderContent(result);
                    // Also update list view row
                    this._updateListRow(result);
                }
                UI.showNotification('Photo ajoutée', 'success');
            } else {
                UI.showNotification('Erreur lors du téléchargement', 'error');
            }
        };

        input.click();
    },


    /**
     * Status descriptions for tooltips
     * @private
     */
    _statusDescriptions: {
        'Nouveau': 'Élève arrivé récemment dans la classe',
        'Départ': 'Élève qui quitte la classe prochainement',
        'PPRE': 'Programme Personnalisé de Réussite Éducative',
        'PAP': 'Plan d\'Accompagnement Personnalisé',
        'ULIS': 'Unité Localisée pour l\'Inclusion Scolaire',
        'Délégué': 'Délégué de classe'
    },

    /**
     * Rend les badges de statut avec tooltips et cliquables
     * @param {Array} statuses - Liste des statuts
     * @private
     */
    _renderStatusBadges(statuses) {
        const container = document.getElementById('focusStatusBadges');
        if (!container) return;

        container.innerHTML = statuses.map(s => {
            const badgeInfo = Utils.getStatusBadgeInfo(s);
            const tooltip = this._statusDescriptions[s] || s;
            // Clickable badge with tooltip
            return `<span class="${badgeInfo.className} tooltip status-badge-clickable" 
                          data-tooltip="${tooltip}" 
                          role="button" 
                          tabindex="0">${badgeInfo.label}</span>`;
        }).join('');

        // Add click listeners to badges
        container.querySelectorAll('.status-badge-clickable').forEach(badge => {
            badge.addEventListener('click', () => this._toggleHeaderEditMode(true));
            badge.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this._toggleHeaderEditMode(true);
                }
            });
        });
    },

    // Period tabs methods removed - main header period selector is the single source of truth

    /**
     * Met à jour les boutons de navigation
     * @private
     */
    _updateNavigation() {
        const prevBtn = document.getElementById('focusPrevBtn');
        const nextBtn = document.getElementById('focusNextBtn');
        const positionEl = document.getElementById('focusPosition');

        if (prevBtn) prevBtn.disabled = this.currentIndex <= 0;
        if (nextBtn) nextBtn.disabled = this.currentIndex >= appState.filteredResults.length - 1;
        if (positionEl) positionEl.textContent = `${this.currentIndex + 1}/${appState.filteredResults.length}`;
    },

    /**
     * Public method to save current context (called by UIManager before period switch)
     * This ensures context/grade/appreciation edits are saved to the correct period
     */
    saveCurrentContext() {
        this._saveContext();
    },

    /**
     * Sauvegarde le contexte avant de quitter
     * @private
     */
    _saveContext() {
        if (!this.currentStudentId) return;

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) {
            const currentPeriod = appState.currentPeriod;
            if (!result.studentData.periods[currentPeriod]) {
                result.studentData.periods[currentPeriod] = {};
            }
            result.studentData.periods[currentPeriod].context = contextInput.value.trim();
        }

        // Save grade
        const gradeInput = document.querySelector('.timeline-period.current .timeline-grade-input');
        if (gradeInput) {
            const gradeStr = gradeInput.value.trim().replace(',', '.');
            const currentPeriod = appState.currentPeriod;
            if (!result.studentData.periods[currentPeriod]) {
                result.studentData.periods[currentPeriod] = {};
            }
            result.studentData.periods[currentPeriod].grade = gradeStr === '' ? null : parseFloat(gradeStr);
        }

        // Save appreciation text (Critical fix for manual edits)
        // IMPORTANT: Do NOT save if generation is in progress (skeleton would be saved as appreciation)
        const isGeneratingForThisStudent = this._activeGenerations.has(this.currentStudentId);
        const appreciationEl = document.getElementById('focusAppreciationText');

        if (appreciationEl && !appreciationEl.classList.contains('empty') && !isGeneratingForThisStudent) {
            const content = appreciationEl.innerHTML;
            // Additional check: Don't save skeleton HTML
            const isSkeleton = content.includes('appreciation-skeleton');
            // Check if text content is truly empty (handling <br> remnants)
            const textContent = appreciationEl.textContent.trim();

            if (content && textContent !== '' && !isSkeleton) {
                result.appreciation = content;
                result.copied = false; // Reset copied status
                // Sync with period data
                const currentPeriod = appState.currentPeriod;
                if (!result.studentData.periods[currentPeriod]) {
                    result.studentData.periods[currentPeriod] = {};
                }
                result.studentData.periods[currentPeriod].appreciation = content;
                result.isPending = false;
            } else if (textContent === '') {
                // Explicitly save empty string if user cleared it
                result.appreciation = '';
                const currentPeriod = appState.currentPeriod;
                if (result.studentData.periods[currentPeriod]) {
                    result.studentData.periods[currentPeriod].appreciation = '';
                }
            }
        }

        // Save History (Persist versions)
        if (this._appreciationHistory && this._appreciationHistory.versions.length > 0) {
            result.appreciationHistory = JSON.parse(JSON.stringify(this._appreciationHistory));
        }

        // Persist to storage
        StorageManager.saveAppState();

        // Refresh appreciation status (dirty check)
        this._refreshAppreciationStatus();
    },

    /**
     * Met à jour une ligne dans la vue liste
     * @param {Object} result - Données de l'élève
     * @private
     */
    _updateListRow(result) {
        // Will be implemented when ListView is created
        // For now, trigger a full re-render
        if (AppreciationsManager?.renderResults) {
            AppreciationsManager.renderResults();
        }
    },


    /**
     * Update word count display
     * @param {boolean} [animate=false] - Whether to animate the number change
     * @param {number|null} [fromCount=null] - Optional starting value for animation
     * @private
     */
    _updateWordCount(animate = false, fromCount = null) {
        const appreciationText = document.getElementById('focusAppreciationText');
        const wordCountEl = document.getElementById('focusWordCount');

        if (appreciationText) {
            const text = appreciationText.textContent || '';
            // Check if empty or placeholder
            const isEmpty = !text.trim();

            // Toggle placeholder class
            if (isEmpty) {
                appreciationText.classList.add('empty');
            } else {
                appreciationText.classList.remove('empty');
            }

            // Update state of buttons based on content presence
            const refinementOptions = document.getElementById('focusRefinementOptions');
            if (refinementOptions) {
                const refineButtons = refinementOptions.querySelectorAll('[data-refine-type]');
                refineButtons.forEach(btn => {
                    btn.disabled = isEmpty;
                    btn.classList.toggle('disabled', isEmpty);
                });
            }

            const copyBtn = document.getElementById('focusCopyBtn');
            if (copyBtn) {
                copyBtn.disabled = isEmpty;
            }

            if (wordCountEl) {
                if (isEmpty) {
                    wordCountEl.textContent = '0 mots';
                    if (wordCountEl._tippy) {
                        wordCountEl._tippy.destroy(); // Remove tooltip if empty
                    }
                    wordCountEl.removeAttribute('data-tooltip');
                } else {
                    const words = Utils.countWords(text);
                    const charCount = Utils.countCharacters(text);
                    const templateFn = (val) => `<i class="fas fa-align-left"></i>${val} mot${val !== 1 ? 's' : ''}`;

                    if (animate) {
                        // Determine start value: explicit > DOM > 0
                        let startVal = 0;
                        if (fromCount !== null) {
                            startVal = fromCount;
                        } else {
                            const prevText = wordCountEl.textContent || '';
                            const prevMatch = prevText.match(/(\d+)/);
                            startVal = prevMatch ? parseInt(prevMatch[1], 10) : 0;
                        }

                        if (startVal !== words) {
                            StatsUI.animateNumberWithMarkup(wordCountEl, startVal, words, 600, templateFn);
                        } else {
                            wordCountEl.innerHTML = templateFn(words);
                        }
                    } else {
                        wordCountEl.innerHTML = templateFn(words);
                    }

                    UI.updateTooltip(wordCountEl, `${words} mot${words !== 1 ? 's' : ''} • ${charCount} car.`);
                }
            }
        }
    },

    /**
     * Update AI indicator display
     * @param {Object} result - Student result object
     * @private
     */
    _updateAiIndicator(result) {
        const aiIndicator = document.getElementById('focusAiIndicator');
        if (!aiIndicator) return;

        const currentPeriod = appState.currentPeriod;
        const hasAppreciation = result.appreciation && result.appreciation.trim().length > 0;

        // CRITICAL FIX: Only show AI indicator if we're viewing the SAME period that was generated
        // This prevents showing AI stars on T1/T2 when only T3 was generated by AI
        const isGeneratedPeriod = !result.generationPeriod || result.generationPeriod === currentPeriod;

        // Only show indicator if explicitly generated by AI:
        // - wasGenerated === true (set after AI generation), OR
        // - tokenUsage has actual data (generationTimeMs or tokens), OR
        // - currentAIModel is set AND tokenUsage exists
        const wasExplicitlyGenerated = result.wasGenerated === true;
        const hasTokenData = result.tokenUsage?.generationTimeMs > 0 ||
            result.tokenUsage?.appreciation?.total_tokens > 0;
        const hasAiModelWithUsage = result.studentData?.currentAIModel && result.tokenUsage?.appreciation;

        const showIndicator = hasAppreciation && isGeneratedPeriod && (wasExplicitlyGenerated || hasTokenData || hasAiModelWithUsage);

        if (showIndicator) {
            const { tooltip } = Utils.getGenerationModeInfo(result);
            aiIndicator.style.display = 'inline-flex';
            aiIndicator.setAttribute('data-tooltip', tooltip);
            UI.initTooltips();
        } else {
            aiIndicator.style.display = 'none';
        }
    },

    /**
     * History system for appreciation undo/redo
     * @private
     */
    _appreciationHistory: {
        versions: [],
        currentIndex: -1,
        maxVersions: 10
    },

    /**
     * Push current appreciation to history before making changes
     * @param {string} content - The content to save
     * @private
     */
    _pushToHistory(content) {
        if (!content || document.getElementById('focusAppreciationText')?.classList.contains('empty')) return;

        const history = this._appreciationHistory;

        // If we're not at the end, truncate future versions
        if (history.currentIndex < history.versions.length - 1) {
            history.versions = history.versions.slice(0, history.currentIndex + 1);
        }

        // Don't add if same as last version
        const lastVersion = history.versions[history.versions.length - 1];
        if (lastVersion === content) return;

        // Add new version
        history.versions.push(content);

        // Limit to max versions
        if (history.versions.length > history.maxVersions) {
            history.versions.shift();
        }

        history.currentIndex = history.versions.length - 1;
        this._updateHistoryIndicator();
    },

    /**
     * Check if undo is available
     * @returns {boolean}
     * @private
     */
    _canUndo() {
        return this._appreciationHistory.currentIndex > 0;
    },

    /**
     * Check if redo is available
     * @returns {boolean}
     * @private
     */
    _canRedo() {
        const history = this._appreciationHistory;
        return history.currentIndex < history.versions.length - 1;
    },

    /**
     * Undo to previous version with iOS-style animation
     * @private
     */
    _undo() {
        if (!this._canUndo()) return;

        this._appreciationHistory.currentIndex--;
        const content = this._appreciationHistory.versions[this._appreciationHistory.currentIndex];
        this._animateVersionChange(content, 'backward');
    },

    /**
     * Redo to next version with iOS-style animation
     * @private
     */
    _redo() {
        if (!this._canRedo()) return;

        this._appreciationHistory.currentIndex++;
        const content = this._appreciationHistory.versions[this._appreciationHistory.currentIndex];
        this._animateVersionChange(content, 'forward');
    },

    /**
     * Sync appreciation content to the result object
     * @param {string} content - The appreciation content
     * @private
     */
    _syncAppreciationToResult(content) {
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (result) {
            result.appreciation = content;
            result.copied = false; // Reset copied status on change
            if (result.studentData?.periods?.[appState.currentPeriod]) {
                result.studentData.periods[appState.currentPeriod].appreciation = content;
            }
        }
    },

    /**
     * Clear or restore history when switching students
     * @param {boolean} [restore=false] - If true, attempts to restore history from student data
     * @private
     */
    _clearHistory(restore = false) {
        let history = null;

        if (restore && this.currentStudentId) {
            const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
            if (result && result.appreciationHistory) {
                history = JSON.parse(JSON.stringify(result.appreciationHistory));
            }
        }

        this._appreciationHistory = history || {
            versions: [],
            currentIndex: -1,
            maxVersions: 10
        };
        this._updateHistoryIndicator();
    },

    /**
     * Update the history indicator UI
     * @private
     */
    _updateHistoryIndicator() {
        const indicator = document.getElementById('focusHistoryIndicator');
        if (!indicator) return;

        const history = this._appreciationHistory;
        const modifCount = history.versions.length - 1; // Exclude initial version

        if (modifCount > 0) {
            indicator.style.display = 'inline-flex';
            const countEl = indicator.querySelector('.history-count');
            if (countEl) {
                countEl.textContent = modifCount;
            }
            indicator.setAttribute('data-tooltip', `${modifCount} modification${modifCount > 1 ? 's' : ''} • Ctrl+Z pour annuler`);
        } else {
            indicator.style.display = 'none';
        }
    },

    /**
     * Show history popover with all versions
     * @private
     */
    _showHistoryPopover() {
        const history = this._appreciationHistory;
        if (history.versions.length <= 1) return;

        // Remove existing popover
        const existingPopover = document.getElementById('historyPopover');
        if (existingPopover) existingPopover.remove();

        // Create popover
        const popover = document.createElement('div');
        popover.id = 'historyPopover';
        popover.className = 'history-popover';

        let html = '<div class="history-popover-title">Historique des modifications</div>';
        html += '<div class="history-popover-list">';

        // Show versions in reverse order (newest first)
        for (let i = history.versions.length - 1; i >= 0; i--) {
            const version = history.versions[i];
            const preview = version.substring(0, 80) + (version.length > 80 ? '...' : '');
            const isCurrent = i === history.currentIndex;
            const label = i === 0 ? 'Original' : `Modif. ${i}`;

            html += `
                <div class="history-version-item ${isCurrent ? 'current' : ''}" data-index="${i}">
                    <span class="history-version-label">${label}</span>
                    <span class="history-version-preview">${preview}</span>
                </div>
            `;
        }

        html += '</div>';
        popover.innerHTML = html;

        // Position near the indicator
        const indicator = document.getElementById('focusHistoryIndicator');
        if (indicator) {
            const rect = indicator.getBoundingClientRect();
            // Smart positioning logic
            const spaceBelow = window.innerHeight - rect.bottom - 20;
            const spaceAbove = rect.top - 20;
            const minSpaceNeeded = 200; // Min height for a usable menu

            // Prefer bottom if enough space, otherwise check top
            let placement = 'bottom';
            let maxListHeight = 300; // Default max height

            if (spaceBelow < minSpaceNeeded && spaceAbove > spaceBelow) {
                placement = 'top';
                // Calculate max height for top placement (accounting for title ~50px)
                maxListHeight = Math.min(300, spaceAbove - 60);
            } else {
                // Calculate max height for bottom placement
                maxListHeight = Math.min(300, spaceBelow - 60);
            }

            popover.style.position = 'fixed';
            if (placement === 'bottom') {
                popover.style.top = `${rect.bottom + 8}px`;
                popover.style.transformOrigin = 'top right';
            } else {
                popover.style.bottom = `${window.innerHeight - rect.top + 8}px`;
                popover.style.transformOrigin = 'bottom right';
            }
            popover.style.right = `${window.innerWidth - rect.right}px`;

            // Apply dynamic max-height to list
            const listEl = popover.querySelector('.history-popover-list');
            if (listEl) {
                listEl.style.maxHeight = `${Math.max(100, maxListHeight)}px`; // Ensure at least 100px
            }
        }

        document.body.appendChild(popover);

        // Add click handlers
        popover.querySelectorAll('.history-version-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index, 10);
                this._restoreVersion(index);
                popover.remove();
            });
        });

        // Close on outside click
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!popover.contains(e.target)) {
                    popover.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    },

    /**
     * Restore a specific version from history with iOS-style animation
     * @param {number} index - Version index
     * @private
     */
    _restoreVersion(index) {
        const history = this._appreciationHistory;
        if (index < 0 || index >= history.versions.length) return;

        const direction = index < history.currentIndex ? 'backward' : 'forward';
        history.currentIndex = index;
        const content = history.versions[index];
        this._animateVersionChange(content, direction);
    },

    /**
     * Animate version change with smooth iOS 2025 premium transition
     * Uses blur + scale + fade for a polished, fluid experience
     * @param {string} content - The new content to display
     * @param {'forward'|'backward'} direction - Animation direction
     * @private
     */
    _animateVersionChange(content, direction = 'forward') {
        const appreciationText = document.getElementById('focusAppreciationText');
        if (!appreciationText) return;

        // Prevent multiple simultaneous animations
        if (appreciationText.classList.contains('history-animating')) return;
        appreciationText.classList.add('history-animating');

        // Apply exit animation
        const exitClass = direction === 'backward' ? 'history-exit-forward' : 'history-exit-backward';
        const enterClass = direction === 'backward' ? 'history-enter-backward' : 'history-enter-forward';

        appreciationText.classList.add(exitClass);

        // After exit animation, update content and animate back in
        setTimeout(() => {
            appreciationText.classList.remove(exitClass);
            appreciationText.textContent = content;
            appreciationText.classList.add(enterClass);

            // Update UI state
            this._updateWordCount();
            this._updateHistoryIndicator();
            this._syncAppreciationToResult(content);

            // Clean up
            setTimeout(() => {
                appreciationText.classList.remove(enterClass, 'history-animating');
            }, 280);
        }, 180);
    },

    /**
     * Set appreciation badge state
     * @param {'pending'|'done'|'error'|'saved'|'none'} state - Badge state
     * @private
     */
    _setAppreciationBadge(state) {
        const badge = document.getElementById('focusAppreciationBadge');
        if (!badge) return;

        // Reset classes
        badge.className = 'appreciation-status-badge';

        if (state === 'none') {
            // Hide badge
            return;
        }

        badge.classList.add('visible', state);

        // Set icon based on state
        switch (state) {
            case 'pending':
                badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                break;
            case 'done':
                badge.innerHTML = '<i class="fas fa-check"></i>';
                break;
            case 'error':
                badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                break;
            case 'saved':
                badge.innerHTML = '<i class="fas fa-check"></i> Enregistré';
                // Auto-hide after 2 seconds
                setTimeout(() => {
                    if (badge.classList.contains('saved')) {
                        badge.classList.remove('visible', 'saved');
                    }
                }, 2000);
                break;
            case 'modified':
                badge.innerHTML = '<i class="fas fa-sync-alt"></i> Données modifiées';
                badge.setAttribute('data-tooltip', 'Le contexte ou la note ont changé. Cliquez sur Générer pour mettre à jour.');
                badge.classList.add('tooltip');
                // Ensure UI updates immediately
                UI.initTooltips();
                break;
        }
    },

    /**
     * Apply a refinement style to the appreciation
     * @param {string} refineType - Type of refinement (concise, detailed, encouraging, variations, polish)
     * @private
     */
    async _refineAppreciation(refineType) {
        const appreciationText = document.getElementById('focusAppreciationText');
        if (!appreciationText) return;

        const currentText = appreciationText.textContent?.trim();
        if (!currentText || currentText.includes('Aucune appréciation')) {
            UI.showNotification('Générez d\'abord une appréciation', 'info');
            return;
        }

        // Save current state to history before refinement
        this._pushToHistory(currentText);

        // Find the refine button and show loading
        const btn = document.querySelector(`[data-refine-type="${refineType}"]`);
        if (btn) {
            btn.disabled = true;
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            // Show pending badge during refinement
            this._updateAppreciationStatus(null, { state: 'pending' });

            try {
                // Use VariationsManager to apply refinement
                const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                if (!result) return;

                // Import VariationsManager dynamically
                const { VariationsManager } = await import('./VariationsManager.js');
                const response = await VariationsManager.applyRefinement(currentText, refineType);

                if (response && response.text) {
                    const refined = response.text;

                    // Effet typewriter pour afficher le nouveau texte
                    await UI.typewriterReveal(appreciationText, refined, { speed: 'fast' });
                    this._updateWordCount();

                    // Push refined version to history
                    this._pushToHistory(refined);

                    // Save to result
                    result.appreciation = refined;
                    result.copied = false; // Reset copied status
                    result.wasGenerated = true; // Mark as AI-generated
                    const currentPeriod = appState.currentPeriod;
                    if (result.studentData.periods[currentPeriod]) {
                        result.studentData.periods[currentPeriod].appreciation = refined;
                    }

                    // Update AI metadata (model, tokens, time)
                    if (response.modelUsed) {
                        result.studentData.currentAIModel = response.modelUsed;
                    }
                    // Structure expected by Utils.getGenerationModeInfo
                    result.tokenUsage = {
                        appreciation: {
                            total_tokens: response.usage?.total_tokens || 0
                        },
                        generationTimeMs: response.generationTimeMs || 0
                    };
                    result.timestamp = new Date().toISOString();

                    // Show done badge after successful refinement
                    this._updateAppreciationStatus(result, { state: 'generated' });

                    // Update AI indicator with new metadata
                    this._updateAiIndicator(result);

                    UI.showNotification('Appréciation raffinée !', 'success');
                }
            } catch (error) {
                console.error('Refinement error:', error);
                UI.showNotification(error.message || 'Erreur lors du raffinement', 'error');
                // Show error badge on failure
                this._updateAppreciationStatus(result, { state: 'error' });
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    },

    /**
     * Save appreciation edits to result
     * @private
     */
    _saveAppreciationEdits() {
        if (!this.currentStudentId) return;

        const appreciationText = document.getElementById('focusAppreciationText');
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);

        if (appreciationText && result) {
            const text = appreciationText.textContent?.trim();
            if (text && !text.includes('Aucune appréciation')) {
                result.appreciation = text;
                const currentPeriod = appState.currentPeriod;
                if (result.studentData.periods[currentPeriod]) {
                    result.studentData.periods[currentPeriod].appreciation = text;
                }
            }
        }
    },

    /**
     * Check if context or grade has been modified for an AI-generated appreciation
     * and update the status badge accordingly.
     * @private
     */
    _checkIfDataModified() {
        if (!this.currentStudentId) return;
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        // Only relevant if the appreciation was previously generated by AI
        if (!result.wasGenerated) return;

        // Check if we are already in a state that supercedes 'modified' (like pending or error)
        // But since we can't easily check the current badge logic state, we just set it if passing checks.
        // Actually, we should check if we are currently generating.
        if (this._activeGenerations.has(this.currentStudentId)) return;

        // Set the badge to modified
        this._refreshAppreciationStatus();
    },

    /**
     * Toggle identity editing section accordion
     * @private
     */
    _toggleIdentitySection() {
        const content = document.getElementById('focusIdentityContent');
        if (!content) return;

        const isExpanded = content.classList.contains('expanded');

        if (isExpanded) {
            this._closeIdentitySection();
        } else {
            this._openIdentitySection();
        }
    },

    /**
     * Open identity editing section
     * @private
     */
    _openIdentitySection() {
        const content = document.getElementById('focusIdentityContent');
        const toggle = document.getElementById('focusIdentityToggle');
        const nameEl = document.getElementById('focusStudentName');

        // Store original values for potential revert
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (result) {
            this._originalIdentity = {
                nom: result.nom,
                prenom: result.prenom,
                statuses: [...(result.studentData.statuses || [])]
            };
        }

        if (content) {
            content.classList.add('expanded');
        }
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'true');
        }
        if (nameEl) {
            nameEl.classList.add('editing');
        }
    },

    /**
     * Close identity editing section
     * @private
     */
    _closeIdentitySection() {
        const content = document.getElementById('focusIdentityContent');
        const toggle = document.getElementById('focusIdentityToggle');
        const nameEl = document.getElementById('focusStudentName');

        if (content) {
            content.classList.remove('expanded');
        }
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
        }
        if (nameEl) {
            nameEl.classList.remove('editing');
        }
    },

    /**
     * Revert identity changes to original values (for cancel)
     * @private
     */
    _revertIdentityChanges() {
        if (!this._originalIdentity) return;

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        // Restore original values
        result.nom = this._originalIdentity.nom;
        result.prenom = this._originalIdentity.prenom;
        result.studentData.statuses = [...this._originalIdentity.statuses];

        // Restore periods (grades)
        if (this._originalIdentity.periods) {
            result.studentData.periods = JSON.parse(JSON.stringify(this._originalIdentity.periods));
        }

        // Update form fields to show original values
        const nomInput = document.getElementById('focusNomInput');
        const prenomInput = document.getElementById('focusPrenomInput');
        if (nomInput) nomInput.value = this._originalIdentity.nom || '';
        if (prenomInput) prenomInput.value = this._originalIdentity.prenom || '';

        // Update checkboxes
        document.querySelectorAll('#focusStatusPills input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = this._originalIdentity.statuses.includes(checkbox.value);
        });

        // Update header display
        const nameEl = document.getElementById('focusStudentName');
        if (nameEl) {
            nameEl.innerHTML = `${this._originalIdentity.prenom} ${this._originalIdentity.nom} <i class="fas fa-pen focus-name-edit-icon"></i>`;
        }

        // Update badges
        this._renderStatusBadges(this._originalIdentity.statuses);

        this._originalIdentity = null;
    },

    /**
     * Update header name display from identity inputs (real-time)
     * Uses headerNomInput/headerPrenomInput from edit mode, or falls back to student result data
     * @private
     */
    _updateHeaderName() {
        const nameEl = document.getElementById('focusStudentName');
        if (!nameEl) return;

        // Try to get values from header edit inputs first
        const nomInput = document.getElementById('headerNomInput');
        const prenomInput = document.getElementById('headerPrenomInput');

        let nom, prenom;

        if (nomInput && prenomInput && (nomInput.value.trim() || prenomInput.value.trim())) {
            // Use edit inputs if available and have content
            nom = nomInput.value.trim().toUpperCase() || '...';
            prenom = prenomInput.value.trim() || '...';
        } else if (this.currentStudentId) {
            // Fallback: read from saved result data
            const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
            if (result) {
                nom = result.nom || '...';
                prenom = result.prenom || '...';
            } else {
                return; // No data to display
            }
        } else {
            return; // No student selected
        }

        // Preserve the edit icon
        nameEl.innerHTML = `${prenom} ${nom} <i class="fas fa-pen focus-name-edit-icon"></i>`;
    },

    /**
     * Save identity changes (name and statuses) to result
     * @private
     */
    _saveIdentityChanges() {
        if (!this.currentStudentId) return;

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        // Save name changes
        const nomInput = document.getElementById('focusNomInput');
        const prenomInput = document.getElementById('focusPrenomInput');

        if (nomInput?.value?.trim()) {
            result.nom = nomInput.value.trim().toUpperCase();
        }
        if (prenomInput?.value?.trim()) {
            result.prenom = prenomInput.value.trim();
        }

        // Save status changes
        const statusCheckboxes = document.querySelectorAll('#focusStatusPills input[type="checkbox"]:checked');
        const statuses = Array.from(statusCheckboxes).map(cb => cb.value);
        result.studentData.statuses = statuses;

        // 1. Save Current Period Grade (from single input in Context header)
        const currentPeriod = appState.currentPeriod;
        const currentGradeInput = document.getElementById('focusCurrentGradeInput');
        if (currentGradeInput) {
            const gradeStr = currentGradeInput.value.trim().replace(',', '.');
            const grade = gradeStr === '' ? null : parseFloat(gradeStr);

            if (!result.studentData.periods[currentPeriod]) {
                result.studentData.periods[currentPeriod] = {};
            }
            result.studentData.periods[currentPeriod].grade = grade;
        }

        // 2. Save Past Grades (from inputs in History header)
        const historyInputs = document.querySelectorAll('.history-grade-input');
        historyInputs.forEach(input => {
            const period = input.dataset.period;
            if (period) {
                const gradeStr = input.value.trim().replace(',', '.');
                const grade = gradeStr === '' ? null : parseFloat(gradeStr);

                if (!result.studentData.periods[period]) {
                    result.studentData.periods[period] = {};
                }
                result.studentData.periods[period].grade = grade;
            }
        });

        // Update badges in header
        this._renderStatusBadges(statuses);

        // Update the grades timeline (to refresh arrows/averages if needed) and re-enable read mode display
        // Update the history grades and current grade input
        this._renderHistoryGrades(result.studentData.periods || {}, false);

        // Update the list row to reflect changes
        this._updateListRow(result);

        // Refresh appreciation status (dirty check)
        this._refreshAppreciationStatus();
    },

    // ===============================
    // STUDENT CARD (Mode lecture/édition)
    // ===============================

    /**
     * Toggle edit mode for student card
     * @private
     */
    _toggleEditMode() {
        const readMode = document.getElementById('focusReadMode');
        const editMode = document.getElementById('focusEditMode');

        if (!readMode || !editMode) {
            console.warn('Student card elements not found');
            return;
        }

        // Check if edit mode is currently visible (not hidden)
        const isInEditMode = !editMode.classList.contains('hidden');
        this._setEditMode(!isInEditMode);
    },

    /**
     * Set edit mode state
     * @param {boolean} isEdit - Whether to show edit mode
     * @private
     */
    _setEditMode(isEdit) {
        const readMode = document.getElementById('focusReadMode');
        const editMode = document.getElementById('focusEditMode');
        const nameEl = document.getElementById('focusStudentName');
        const cardTitle = document.getElementById('focusHistoryTitle');
        const editBtn = document.getElementById('focusEditHistoryBtn');

        if (!readMode || !editMode) return;

        // Get current result data
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);

        if (isEdit) {
            // Update card title
            if (cardTitle) cardTitle.textContent = 'Informations';
            if (editBtn) editBtn.classList.add('active');

            // Store original values for potential revert
            if (result) {
                const currentPeriod = appState.currentPeriod;
                this._originalIdentity = {
                    nom: result.nom,
                    prenom: result.prenom,
                    statuses: [...(result.studentData.statuses || [])],
                    // Deep copy periods for revert
                    periods: JSON.parse(JSON.stringify(result.studentData.periods || {}))
                };
            }

            // Animate the transition
            readMode.classList.add('hiding');
            setTimeout(() => {
                readMode.classList.add('hidden');
                readMode.classList.remove('hiding');
                editMode.classList.remove('hidden');
                editMode.classList.add('showing');
                setTimeout(() => editMode.classList.remove('showing'), 300);
            }, 150);

            if (nameEl) nameEl.classList.add('editing');

            // Re-render history grades in EDIT mode
            if (result) {
                this._renderHistoryGrades(result.studentData.periods || {}, true);
            }

            // Focus on first input after animation
            setTimeout(() => {
                document.getElementById('focusNomInput')?.focus();
            }, 300);
        } else {
            // Update card title
            if (cardTitle) cardTitle.textContent = 'Historique';
            if (editBtn) editBtn.classList.remove('active');

            // Animate the transition
            editMode.classList.add('hiding');
            setTimeout(() => {
                editMode.classList.add('hidden');
                editMode.classList.remove('hiding');
                readMode.classList.remove('hidden');
                readMode.classList.add('showing');
                setTimeout(() => readMode.classList.remove('showing'), 300);
            }, 150);

            if (nameEl) nameEl.classList.remove('editing');

            // Re-render history grades in READ mode
            if (result) {
                this._renderHistoryGrades(result.studentData.periods || {}, false);
                this._updateReadModeDisplay(result);
            }
        }
    },

    /**
     * Render student card with current data
     * @param {Object} result - Student result object
     * @private
     */
    _renderStudentCard(result) {
        const currentPeriod = appState.currentPeriod;

        // === Populate Edit Mode Fields (Identity) ===
        const nomInput = document.getElementById('focusNomInput');
        const prenomInput = document.getElementById('focusPrenomInput');

        if (nomInput) nomInput.value = result.nom || '';
        if (prenomInput) prenomInput.value = result.prenom || '';

        // Populate status checkboxes
        const statuses = result.studentData.statuses || [];
        document.querySelectorAll('#focusStatusPills input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = statuses.some(s => s.includes(checkbox.value) || checkbox.value.includes(s.split(' ')[0]));
        });

        // === Render History Grades (Past) & Current Grade Input ===
        this._renderHistoryGrades(result.studentData.periods || {}, false); // False because we are not in history edit mode initially

        // === Update Read Mode Display ===
        this._updateReadModeDisplay(result);
    },



    /**
     * Update read mode display with student data
     * @param {Object} result - Student result object
     * @private
     */
    _updateReadModeDisplay(result) {
        const currentPeriod = appState.currentPeriod;
        const periods = Utils.getPeriods();
        const currentIndex = periods.indexOf(currentPeriod);

        // Update name display
        const readName = document.getElementById('focusReadName');
        if (readName) {
            readName.textContent = `${result.prenom} ${result.nom}`;
        }

        // Update badges
        const readBadges = document.getElementById('focusReadBadges');
        if (readBadges) {
            const statuses = result.studentData.statuses || [];
            readBadges.innerHTML = statuses.map(s => `<span class="status-pill">${s}</span>`).join('');
        }

        // Update grade display
        const readGradePeriod = document.getElementById('focusReadGradePeriod');
        const readGradeValue = document.getElementById('focusReadGradeValue');

        if (readGradePeriod) {
            readGradePeriod.textContent = Utils.getPeriodLabel(currentPeriod, false);
        }
        if (readGradeValue) {
            const grade = result.studentData.periods?.[currentPeriod]?.grade;
            readGradeValue.textContent = typeof grade === 'number' ? grade.toFixed(1).replace('.', ',') : '--';
        }

        // Check if previous period exists  
        if (currentIndex > 0) {
            const prevPeriod = periods[currentIndex - 1];
            const prevData = result.studentData.periods?.[prevPeriod];

            // Update previous appreciation if available
            const prevAppSection = document.getElementById('focusPrevAppreciationSection');
            const prevPeriodLabel = document.getElementById('focusPrevPeriodLabel');
            const prevAppreciationText = document.getElementById('focusPrevAppreciationText');

            const prevAppreciation = prevData?.appreciation;
            if (prevAppreciation && !prevAppreciation.includes('Aucune appréciation')) {
                if (prevAppSection) prevAppSection.style.display = 'block';
                if (prevPeriodLabel) prevPeriodLabel.textContent = Utils.getPeriodLabel(prevPeriod, false);
                if (prevAppreciationText) {
                    // Show first 200 characters with ellipsis
                    const truncated = prevAppreciation.length > 200
                        ? prevAppreciation.substring(0, 200) + '...'
                        : prevAppreciation;
                    prevAppreciationText.textContent = truncated;
                }
            } else {
                if (prevAppSection) prevAppSection.style.display = 'none';
            }

            // Update previous context if available
            const prevCtxSection = document.getElementById('focusPrevContextSection');
            const prevCtxPeriodLabel = document.getElementById('focusPrevContextPeriodLabel');
            const prevContextText = document.getElementById('focusPrevContextText');

            const prevContext = prevData?.context;
            if (prevContext && prevContext.trim()) {
                if (prevCtxSection) prevCtxSection.style.display = 'block';
                if (prevCtxPeriodLabel) prevCtxPeriodLabel.textContent = Utils.getPeriodLabel(prevPeriod, false);
                if (prevContextText) {
                    // Show first 150 characters with ellipsis
                    const truncated = prevContext.length > 150
                        ? prevContext.substring(0, 150) + '...'
                        : prevContext;
                    prevContextText.textContent = truncated;
                }
            } else {
                if (prevCtxSection) prevCtxSection.style.display = 'none';
            }
        } else {
            // No previous period - hide both sections
            const prevAppSection = document.getElementById('focusPrevAppreciationSection');
            const prevCtxSection = document.getElementById('focusPrevContextSection');
            if (prevAppSection) prevAppSection.style.display = 'none';
            if (prevCtxSection) prevCtxSection.style.display = 'none';
        }
    },

    /**
     * Save student card changes (name, statuses, and grade)
     * @private
     */
    _saveStudentCardChanges() {
        if (!this.currentStudentId) return;

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        const currentPeriod = appState.currentPeriod;

        // Save name changes
        const nomInput = document.getElementById('focusNomInput');
        const prenomInput = document.getElementById('focusPrenomInput');

        if (nomInput?.value?.trim()) {
            result.nom = nomInput.value.trim().toUpperCase();
        }
        if (prenomInput?.value?.trim()) {
            result.prenom = prenomInput.value.trim();
        }

        // Save status changes
        const statusCheckboxes = document.querySelectorAll('#focusStatusPills input[type="checkbox"]:checked');
        const statuses = Array.from(statusCheckboxes).map(cb => cb.value);
        result.studentData.statuses = statuses;



        // Update header display
        const nameEl = document.getElementById('focusStudentName');
        if (nameEl) {
            nameEl.innerHTML = `${result.prenom} ${result.nom} <i class="fas fa-pen focus-name-edit-icon"></i>`;
        }

        // Update badges in header
        this._renderStatusBadges(statuses);

        // Update read mode display
        this._updateReadModeDisplay(result);

        // Update the grades timeline
        this._renderGradesTimeline(result.studentData.periods || {});

        // Update the list row to reflect changes
        this._updateListRow(result);

        // Persist to storage
        StorageManager.saveAppState();

        // Refresh appreciation status (dirty check)
        this._refreshAppreciationStatus();
    },

    /**
     * Get form data from Focus Panel (for creation mode)
     * @returns {Object} Student data
     */
    getFormData() {
        const currentPeriod = appState.currentPeriod;

        // Get name from identity section inputs (used for both creation and edit)
        const nom = document.getElementById('focusNomInput')?.value.trim().toUpperCase() || '';
        const prenom = document.getElementById('focusPrenomInput')?.value.trim() || '';

        // Get statuses
        const statusCheckboxes = document.querySelectorAll('#focusStatusPills input[type="checkbox"]:checked');
        const statuses = Array.from(statusCheckboxes).map(cb => cb.value);

        // Get context
        const contextInput = document.getElementById('focusContextInput');
        const contextValue = contextInput?.value.trim() || '';

        // Get grade from edit mode input for current period
        const editGradeInput = document.getElementById('focusEditGradeInput');
        const editGradeValue = editGradeInput?.value?.trim().replace(',', '.') || '';

        // Build periods data
        const periods = {};
        Utils.getPeriods().forEach(p => {
            if (p === currentPeriod) {
                // Use the edit mode grade input for current period
                periods[p] = {
                    grade: editGradeValue === '' ? null : parseFloat(editGradeValue),
                    appreciation: '',
                    context: contextValue
                };
            } else {
                // Use timeline input for other periods (if available)
                const gradeInput = document.getElementById(`focusGrade_${p}`);
                const gradeValue = gradeInput?.value?.trim().replace(',', '.') || '';

                periods[p] = {
                    grade: gradeValue === '' ? null : parseFloat(gradeValue),
                    appreciation: '',
                    context: undefined
                };
            }
        });

        return {
            nom,
            prenom,
            statuses,
            negativeInstructions: contextValue,
            periods,
            currentPeriod
        };
    },

    // ===============================
    // AI ANALYSIS PAGE (Sliding)
    // ===============================

    /**
     * Show the analysis page (slide from right)
     * @private
     */
    _showAnalysisPage() {
        const container = document.getElementById('focusPagesContainer');

        if (!container) return;

        // ALWAYS reset analysis first to clear previous student's data
        this._resetAnalysisSection();

        // Slide to analysis page
        container.classList.add('show-analysis');

        // If analysis data already exists for CURRENT student, populate it
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (result && (result.strengthsWeaknesses || result.nextSteps)) {
            this._populateExistingAnalysis(result);
        } else if (result) {
            // Auto-trigger generation if appreciation exists and analysis not yet generated
            const currentPeriod = appState.currentPeriod;
            const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;
            const hasApiKey = UI.checkAPIKeyPresence();

            if (periodAppreciation && periodAppreciation.trim() && hasApiKey) {
                // Small delay to let the page slide animation start first
                setTimeout(() => this._generateAnalysis(), 150);
            }
        }
    },

    /**
     * Hide the analysis page (slide back to main)
     * @private
     */
    _hideAnalysisPage() {
        const container = document.getElementById('focusPagesContainer');
        if (container) {
            container.classList.remove('show-analysis');
        }
    },

    /**
     * Check if analysis page is visible
     * @returns {boolean}
     * @private
     */
    _isAnalysisPageVisible() {
        const container = document.getElementById('focusPagesContainer');
        return container?.classList.contains('show-analysis') ?? false;
    },

    /**
     * Reset analysis section content to placeholder state
     * @private
     */
    _resetAnalysisSection() {
        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        const placeholderForces = `<div class="analysis-placeholder">
            <i class="fas fa-lightbulb"></i>
            <span>Cliquez sur "Générer l'analyse" pour découvrir les points forts</span>
        </div>`;
        const placeholderWeaknesses = `<div class="analysis-placeholder">
            <i class="fas fa-lightbulb"></i>
            <span>Cliquez sur "Générer l'analyse" pour identifier les faiblesses</span>
        </div>`;
        const placeholderSuggestions = `<div class="analysis-placeholder">
            <i class="fas fa-lightbulb"></i>
            <span>Cliquez sur "Générer l'analyse" pour des conseils personnalisés</span>
        </div>`;

        if (forcesContent) forcesContent.innerHTML = placeholderForces;
        if (weaknessesContent) weaknessesContent.innerHTML = placeholderWeaknesses;
        if (suggestionsContent) suggestionsContent.innerHTML = placeholderSuggestions;

        // Remove has-content class and badges
        document.querySelectorAll('.analysis-card').forEach(card => {
            card.classList.remove('has-content', 'has-error');
            // Remove existing badges
            const existingBadge = card.querySelector('.analysis-status-badge');
            if (existingBadge) existingBadge.remove();
        });
    },

    /**
     * Show skeleton loading state in analysis cards
     * @private
     */
    _showAnalysisSkeleton() {
        const skeleton = `<div class="analysis-skeleton">
            <div class="analysis-skeleton-line"></div>
            <div class="analysis-skeleton-line"></div>
            <div class="analysis-skeleton-line"></div>
        </div>`;

        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        if (forcesContent) forcesContent.innerHTML = skeleton;
        if (weaknessesContent) weaknessesContent.innerHTML = skeleton;
        if (suggestionsContent) suggestionsContent.innerHTML = skeleton;

        // Add loading badges to all cards
        document.querySelectorAll('.analysis-card').forEach(card => {
            this._setCardBadge(card, 'loading');
        });
    },

    /**
     * Set badge state on an analysis card
     * @param {HTMLElement} card - The analysis card element
     * @param {'loading'|'done'|'error'} state - Badge state
     * @private
     */
    _setCardBadge(card, state) {
        if (!card) return;

        const header = card.querySelector('.analysis-card-header');
        if (!header) return;

        // Remove existing badge
        let badge = header.querySelector('.analysis-status-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'analysis-status-badge';
            header.appendChild(badge);
        }

        // Update badge content and class
        badge.className = 'analysis-status-badge';
        switch (state) {
            case 'loading':
                badge.classList.add('loading');
                badge.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                break;
            case 'done':
                badge.classList.add('done');
                badge.innerHTML = '<i class="fas fa-check"></i>';
                break;
            case 'error':
                badge.classList.add('error');
                badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                break;
        }
    },

    /**
     * Generate AI analysis for current student
     * @private
     */
    async _generateAnalysis() {
        if (!this.currentStudentId) return;

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        // Check API key
        if (!UI.checkAPIKeyPresence()) {
            UI.showNotification('Clé API requise pour l\'analyse IA', 'warning');
            return;
        }

        // [FIX] Check that an appreciation exists for the current period
        // Analysis should be based on the appreciation, so it must exist first
        const currentPeriod = appState.currentPeriod;
        const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;
        if (!periodAppreciation || !periodAppreciation.trim()) {
            UI.showNotification(`Veuillez d'abord générer une appréciation pour ${Utils.getPeriodLabel(currentPeriod, false)}`, 'warning');
            return;
        }

        // Expand section if not already
        const section = document.getElementById('focusAnalysisSection');
        if (section && !section.classList.contains('expanded')) {
            this._toggleAnalysisSection();
        }

        // Show skeleton loading state
        this._showAnalysisSkeleton();

        // Update generate button to loading
        const generateBtn = document.getElementById('focusGenerateAnalysisBtn');
        if (generateBtn) {
            UI.showInlineSpinner(generateBtn);
        }

        try {
            // Force regeneration: reset existing data
            result.strengthsWeaknesses = null;
            result.nextSteps = null;

            // Fetch analyses using existing AppreciationsManager methods
            await this._fetchAnalysesForStudent(result);

            // Save to persist new analysis data
            StorageManager.saveAppState();

            UI.showNotification('Analyse générée !', 'success');
        } catch (error) {
            console.error('Erreur analyse:', error);
            UI.showNotification(`Erreur : ${error.message}`, 'error');

            // Show error state
            this._showAnalysisError(error.message);
        } finally {
            if (generateBtn) {
                UI.hideInlineSpinner(generateBtn);
            }
        }
    },

    /**
     * Fetch and display analyses for the student
     * @param {Object} result - Student result object
     * @private
     */
    async _fetchAnalysesForStudent(result) {
        const id = result.id;
        // IMPORTANT: Always use the source object from generatedResults, not the filtered copy
        const sourceResult = appState.generatedResults.find(r => r.id === id) || result;

        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        const forcesCard = forcesContent?.closest('.analysis-card');
        const weaknessesCard = weaknessesContent?.closest('.analysis-card');
        const suggestionsCard = suggestionsContent?.closest('.analysis-card');

        // Generate strengths/weaknesses (used for both Forces and Faiblesses cards)
        const generateStrengthsWeaknesses = async () => {
            if (sourceResult.strengthsWeaknesses === null || sourceResult.strengthsWeaknesses === undefined) {
                try {
                    await AppreciationsManager.generateStrengthsWeaknesses(id, true);
                    const updated = appState.generatedResults.find(r => r.id === id);

                    if (updated?.strengthsWeaknesses) {
                        // Parse and display Forces
                        if (forcesContent) {
                            UI.animateHtmlReveal(forcesContent, this._parseStrengthsWeaknessesForCards(updated.strengthsWeaknesses, 'forces'));
                            forcesCard?.classList.add('has-content');
                            this._setCardBadge(forcesCard, 'done');
                        }
                        // Parse and display Faiblesses
                        if (weaknessesContent) {
                            UI.animateHtmlReveal(weaknessesContent, this._parseStrengthsWeaknessesForCards(updated.strengthsWeaknesses, 'weaknesses'));
                            weaknessesCard?.classList.add('has-content');
                            this._setCardBadge(weaknessesCard, 'done');
                        }
                    } else {
                        if (forcesContent) {
                            forcesContent.innerHTML = '<em>Aucune donnée générée.</em>';
                            this._setCardBadge(forcesCard, 'done');
                        }
                        if (weaknessesContent) {
                            weaknessesContent.innerHTML = '<em>Aucune donnée générée.</em>';
                            this._setCardBadge(weaknessesCard, 'done');
                        }
                    }
                } catch (e) {
                    console.error('Échec de l\'analyse strengthsWeaknesses:', e);
                    const errorHtml = `<span style="color:var(--error-color);">Erreur : ${e.message.substring(0, 80)}...</span>`;
                    if (forcesContent) {
                        forcesContent.innerHTML = errorHtml;
                        forcesCard?.classList.add('has-error');
                        this._setCardBadge(forcesCard, 'error');
                    }
                    if (weaknessesContent) {
                        weaknessesContent.innerHTML = errorHtml;
                        weaknessesCard?.classList.add('has-error');
                        this._setCardBadge(weaknessesCard, 'error');
                    }
                }
            } else {
                // Data already exists
                if (forcesContent) {
                    forcesContent.innerHTML = this._parseStrengthsWeaknessesForCards(sourceResult.strengthsWeaknesses, 'forces');
                    forcesCard?.classList.add('has-content');
                    this._setCardBadge(forcesCard, 'done');
                }
                if (weaknessesContent) {
                    weaknessesContent.innerHTML = this._parseStrengthsWeaknessesForCards(sourceResult.strengthsWeaknesses, 'weaknesses');
                    weaknessesCard?.classList.add('has-content');
                    this._setCardBadge(weaknessesCard, 'done');
                }
            }
        };

        // Generate next steps (Pistes d'amélioration)
        const generateNextSteps = async () => {
            if (sourceResult.nextSteps === null || sourceResult.nextSteps === undefined) {
                try {
                    await AppreciationsManager.generateNextSteps(id, true);
                    const updated = appState.generatedResults.find(r => r.id === id);

                    if (updated?.nextSteps?.length) {
                        UI.animateHtmlReveal(suggestionsContent, `<ul>${updated.nextSteps.map(s => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(s))}</li>`).join('')}</ul>`);
                        suggestionsCard?.classList.add('has-content');
                        this._setCardBadge(suggestionsCard, 'done');
                    } else {
                        suggestionsContent.innerHTML = '<em>Aucune piste générée.</em>';
                        this._setCardBadge(suggestionsCard, 'done');
                    }
                } catch (e) {
                    console.error('Échec de l\'analyse nextSteps:', e);
                    suggestionsContent.innerHTML = `<span style="color:var(--error-color);">Erreur : ${e.message.substring(0, 80)}...</span>`;
                    suggestionsCard?.classList.add('has-error');
                    this._setCardBadge(suggestionsCard, 'error');
                }
            } else {
                // Data already exists
                suggestionsContent.innerHTML = `<ul>${sourceResult.nextSteps.map(s => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(s))}</li>`).join('')}</ul>`;
                suggestionsCard?.classList.add('has-content');
                this._setCardBadge(suggestionsCard, 'done');
            }
        };

        // Run both analyses in parallel (Forces+Faiblesses together, Pistes separately)
        await Promise.all([
            generateStrengthsWeaknesses(),
            generateNextSteps()
        ]);
    },

    /**
     * Parse strengths/weaknesses data for display in cards
     * @param {Object|string} data - Parsed strengths/weaknesses object or raw string
     * @param {string} type - 'forces' or 'weaknesses'
     * @returns {string} HTML content
     * @private
     */
    _parseStrengthsWeaknessesForCards(data, type) {
        if (!data) return '<em>Aucune donnée.</em>';

        let items = [];

        if (typeof data === 'string') {
            // Raw string handling with section separation
            const raw = data;

            // Try to split into two sections using common headers from prompts, handling Markdown
            const splitRegex = /(?:^|\n)(?:[-*•]\s*)?(?:#+\s*)?(?:\*\*)?(?:Faiblesses|Axes d'amélioration|Points à améliorer|Fragilités|Axes de progrès|Points faibles|Axes d'effort)(?:\*\*)?[:\s]*(?:\n|$)/i;
            const parts = raw.split(splitRegex);

            let relevantText = '';

            if (parts.length > 1) {
                // Found a split between strengths (part 0) and weaknesses (part 1)
                if (type === 'forces') {
                    relevantText = parts[0];
                } else {
                    relevantText = parts.slice(1).join('\n');
                }
            } else {
                // No clear split found
                if (type === 'forces') {
                    relevantText = raw; // Default to strengths
                } else {
                    relevantText = ''; // No explicit weaknesses found
                }
            }

            if (!relevantText && type === 'weaknesses') {
                // Fallback or empty
            }

            // Cleanup headers from the relevant chunk specific to the type
            const headersToRemove = type === 'forces'
                ? ['Points Forts', 'Forces', 'Points forts', 'Atouts', 'Ce qui va bien']
                : ['Faiblesses', 'Axes d\'amélioration', 'Points à améliorer', 'Fragilités'];

            let cleanText = relevantText || '';
            headersToRemove.forEach(header => {
                // Remove header and potential markdown wrappers
                // Matches: **Forces**, ## Forces, - Forces:
                const regex = new RegExp(`(?:^|\\n)(?:[-*•]\\s*)?(?:#+\\s*)?(?:\\*\\*)?${header}(?:\\*\\*)?[:\\s]*`, 'gim');
                cleanText = cleanText.replace(regex, '');
            });

            // Parse bullets
            const lines = cleanText.split(/\n/);
            items = lines
                .map(line => line.trim())
                .filter(line => {
                    return line.length > 5 && (line.match(/^[-*•]/) || line.match(/^\d+\./) || line.length > 20);
                })
                .map(line => {
                    return line.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '');
                });

            // If just a block of text, keep it as one item
            if (items.length === 0 && cleanText.trim().length > 10) {
                items = [cleanText.trim()];
            }

        } else if (typeof data === 'object') {
            items = type === 'forces' ? (data.strengths || data.forces || []) : (data.weaknesses || data.faiblesses || []);
        }

        if (!items || items.length === 0) {
            return `<em>Aucun${type === 'forces' ? 'e force identifiée' : ' axe identifié'}.</em>`;
        }

        return `<ul>${items.map(item => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(item))}</li>`).join('')}</ul>`;
    },

    /**
     * Show error state in analysis cards
     * @param {string} message - Error message
     * @private
     */
    _showAnalysisError(message) {
        const errorHtml = `<span style="color:var(--error-color); font-size: 12px;">
            <i class="fas fa-exclamation-circle"></i> ${message.substring(0, 60)}...
        </span>`;

        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        if (forcesContent) forcesContent.innerHTML = errorHtml;
        if (weaknessesContent) weaknessesContent.innerHTML = errorHtml;
        if (suggestionsContent) suggestionsContent.innerHTML = errorHtml;

        document.querySelectorAll('.analysis-card').forEach(card => {
            card.classList.add('has-error');
        });
    },

    /**
     * Pre-populate analysis section with existing data
     * @param {Object} result - Student result object
     * @private
     */
    _populateExistingAnalysis(result) {
        const forcesContent = document.getElementById('analysisForcesContent');
        const weaknessesContent = document.getElementById('analysisWeaknessesContent');
        const suggestionsContent = document.getElementById('analysisSuggestionsContent');

        const forcesCard = forcesContent?.closest('.analysis-card');
        const weaknessesCard = weaknessesContent?.closest('.analysis-card');
        const suggestionsCard = suggestionsContent?.closest('.analysis-card');

        // Populate strengths/weaknesses if available
        if (result.strengthsWeaknesses) {
            if (forcesContent) {
                forcesContent.innerHTML = this._parseStrengthsWeaknessesForCards(result.strengthsWeaknesses, 'forces');
                forcesCard?.classList.add('has-content');
                this._setCardBadge(forcesCard, 'done');
            }
            if (weaknessesContent) {
                weaknessesContent.innerHTML = this._parseStrengthsWeaknessesForCards(result.strengthsWeaknesses, 'weaknesses');
                weaknessesCard?.classList.add('has-content');
                this._setCardBadge(weaknessesCard, 'done');
            }
        }

        // Populate next steps if available
        if (result.nextSteps && result.nextSteps.length > 0) {
            if (suggestionsContent) {
                suggestionsContent.innerHTML = `<ul>${result.nextSteps.map(s => `<li>${Utils.cleanMarkdown(Utils.decodeHtmlEntities(s))}</li>`).join('')}</ul>`;
                suggestionsCard?.classList.add('has-content');
                this._setCardBadge(suggestionsCard, 'done');
            }
        }
    },



    /**
     * Ouvre le volet latéral "Paramètres Élève"
     * @private
     */
    _openSettingsPanel() {
        const panel = document.getElementById('focusSettingsPanel');
        // const overlay = document.getElementById('focusSettingsOverlay'); // Overlay removed for Context Push
        if (panel) panel.classList.add('active');

        // Push Layout: Add class to body to shrink main content
        document.body.classList.add('sidebar-open');
    },

    /**
     * Ferme le volet latéral "Paramètres Élève"
     * @private
     */
    _closeSettingsPanel() {
        const panel = document.getElementById('focusSettingsPanel');
        // const overlay = document.getElementById('focusSettingsOverlay');
        if (panel) panel.classList.remove('active');

        // Release Push Layout
        document.body.classList.remove('sidebar-open');
    },

    // ====================================================================
    // JOURNAL DE BORD - Observation notes for students
    // ====================================================================

    /** Selected tags for quick add */
    _selectedJournalTags: [],

    /**
     * Setup Journal event listeners
     * @private
     */
    _setupJournalListeners() {
        // Section collapse toggle REMOVED - Card is now static


        // Threshold control
        const thresholdBtn = document.getElementById('journalThresholdBtn');
        const thresholdControl = document.getElementById('journalThresholdControl');
        if (thresholdBtn && thresholdControl) {
            // Toggle popover
            thresholdBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                thresholdControl.classList.toggle('open');
                this._updateThresholdUI();
            });

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!thresholdControl.contains(e.target)) {
                    thresholdControl.classList.remove('open');
                }
            });

            // Adjust buttons
            thresholdControl.querySelectorAll('.threshold-adjust-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const delta = parseInt(btn.dataset.delta, 10);
                    const current = appState.journalThreshold ?? 2;
                    const newValue = Math.max(1, Math.min(5, current + delta)); // Clamp 1-5
                    appState.journalThreshold = newValue;
                    StorageManager.saveAppState();
                    this._updateThresholdUI();
                    // Re-render journal to update isolated states
                    const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                    if (result) {
                        this._renderJournal(result);
                        this._refreshAppreciationStatus();
                    }
                });
            });
        }

        // Journal Entry Click (Delegated Edit)
        const journalContent = document.getElementById('focusJournalContent');
        if (journalContent) {
            journalContent.addEventListener('click', (e) => {
                const entryEl = e.target.closest('.journal-entry');
                const deleteBtn = e.target.closest('.journal-entry-delete');

                // If clicked on entry but NOT on delete button
                if (entryEl && !deleteBtn) {
                    const entryId = entryEl.dataset.entryId;
                    this._onEditJournalEntry(entryId);
                }
            });
        }
    },

    /**
     * Render Journal section for current student
     * @param {Object} result - Student data
     * @private
     */
    _renderJournal(result, highlightEntryId = null) {
        if (!result?.id) {
            // Hide journal section in creation mode
            const section = document.getElementById('focusJournalSection');
            if (section) section.style.display = 'none';
            return;
        }

        const section = document.getElementById('focusJournalSection');
        if (section) section.style.display = '';

        // Update threshold UI (button label + popover value)
        this._updateThresholdUI();

        // Render timeline combined with draft preview
        const contentEl = document.getElementById('focusJournalContent');
        if (contentEl) {
            // Logic: If editing an entry, the draft preview is rendered INLINE in the timeline
            // If NOT editing, the draft preview is rendered at the top

            let html = '';

            // Only render top draft preview if NOT editing an existing entry
            if (!this._editingJournalEntryId) {
                html += JournalManager.renderDraftPreview();
            }

            html += JournalManager.renderTimeline(
                result.id,
                appState.currentPeriod,
                highlightEntryId,
                this._editingJournalEntryId
            );

            // Destroy existing tooltips in the container using centralized manager
            TooltipsUI.cleanupTooltipsIn(contentEl);

            contentEl.innerHTML = html;

            // Attach dynamic listeners for draft actions (Cancel/Save are same IDs)
            const draftCancel = document.getElementById('journalDraftCancelBtn');
            const draftSave = document.getElementById('journalDraftSaveBtn');
            const draftInput = document.getElementById('journalNoteInput');

            if (draftCancel) draftCancel.addEventListener('click', () => this._toggleJournalQuickAdd(false));
            if (draftSave) draftSave.addEventListener('click', () => this._saveJournalEntry());
            if (draftInput) draftInput.addEventListener('input', () => this._updateJournalSaveButton());

            // Attach pill button handlers (inside draft)
            this._setupDraftPillButtons(contentEl);

            // Add delete handlers
            contentEl.querySelectorAll('.journal-entry-delete').forEach(btn => {
                let deleteTimeout;

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const entryId = btn.dataset.entryId;

                    // First click: ask confirmation
                    if (!btn.classList.contains('confirm-delete')) {
                        // Reset any other active buttons first
                        contentEl.querySelectorAll('.confirm-delete').forEach(b => b.classList.remove('confirm-delete'));

                        btn.classList.add('confirm-delete');

                        // Auto-reset after 3s
                        deleteTimeout = setTimeout(() => {
                            btn.classList.remove('confirm-delete');
                        }, 3000);

                        // Handle outside click
                        const outsideClickListener = (ev) => {
                            if (!btn.contains(ev.target)) {
                                btn.classList.remove('confirm-delete');
                                clearTimeout(deleteTimeout);
                                document.removeEventListener('click', outsideClickListener);
                            }
                        };
                        // Delay slightly to avoid catching current click
                        setTimeout(() => document.addEventListener('click', outsideClickListener), 0);
                    }
                    // Second click: execute delete
                    else {
                        clearTimeout(deleteTimeout);

                        // Animate removal
                        const entryEl = btn.closest('.journal-entry');
                        if (entryEl) {
                            entryEl.classList.add('leave');

                            setTimeout(() => {
                                // Execute delete
                                JournalManager.deleteEntry(result.id, entryId);
                                // Re-render to update timeline and isolated states
                                this._renderJournal(result);
                                // Re-render to update timeline and isolated states
                                this._renderJournal(result);
                                UI.showNotification('Observation supprimée', 'success');
                                // Refresh badge status
                                this._refreshAppreciationStatus();
                            }, 400); // Wait for animation
                        }
                    }
                });
            });

            // Re-attach listeners for populated chips (if inline editing or pre-filled)
            // Since we generated HTML directly in JournalManager, we just need to bind events
            contentEl.querySelectorAll('.journal-chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const chip = btn.closest('.journal-selected-chip');
                    const tagId = chip.dataset.tagId;

                    this._selectedJournalTags = this._selectedJournalTags.filter(t => t !== tagId);
                    chip.remove();
                    this._updateJournalSaveButton();
                    this._updateDraftPreviewVisibility();
                });
            });

            // Initialize tooltips for the timeline entries (e.g. isolated entries)
            // This is required because re-rendering destroys the DOM elements tippy was attached to
            setTimeout(() => {
                contentEl.querySelectorAll('[data-tooltip]').forEach(el => {
                    const tooltipText = el.getAttribute('data-tooltip');
                    if (tooltipText) {
                        TooltipsUI.updateTooltip(el, tooltipText);
                    }
                });
            }, 0);
        }

        // Update count badge
        const countBadge = document.getElementById('focusJournalCount');
        if (countBadge) {
            const aggregated = JournalManager.getAggregatedCounts(result.id, appState.currentPeriod);

            if (aggregated.length > 0) {
                const threshold = appState.journalThreshold ?? 2;

                // Render detailed counts with icons using standard journal-tag class for consistency
                const html = aggregated.map(item => {
                    const isBelow = item.count < threshold;
                    const belowClass = isBelow ? 'below-threshold' : '';
                    return `
                    <span class="journal-tag ${belowClass}" style="--tag-color: ${item.color}; margin-right: 0; cursor: help;" data-tooltip="${item.label} : ${item.count}">
                        <i class="fas ${item.icon}"></i> ${item.count}
                    </span>
                `}).join('');

                countBadge.innerHTML = html;

                // Override default badge styles to act as a container
                countBadge.style.display = 'inline-flex';
                countBadge.style.gap = '6px';
                countBadge.style.background = 'transparent';
                countBadge.style.padding = '0';
                countBadge.style.minWidth = 'auto';
                countBadge.style.boxShadow = 'none';
                countBadge.style.border = 'none'; // Ensure no border overrides
                countBadge.style.fontSize = 'inherit'; // Reset font size if badged
                countBadge.style.height = 'auto';

                // Initialize tooltips for the new elements manualy since they are created dynamically
                setTimeout(() => {
                    countBadge.querySelectorAll('[data-tooltip]').forEach(tag => {
                        const tooltipText = tag.getAttribute('data-tooltip');
                        if (tooltipText) {
                            TooltipsUI.updateTooltip(tag, tooltipText);
                        }
                    });
                }, 50);
            } else {
                countBadge.style.display = 'none';
            }
        }

        // Header + button: opens the draft (tags are now inside draft)
        const addBtn = document.getElementById('focusJournalNoteBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                // Show draft preview
                const draftPreview = document.getElementById('journalDraftPreview');
                if (draftPreview) {
                    draftPreview.classList.add('visible');
                    // Auto-scroll journal content to top to show draft (not scrollIntoView which affects entire panel)
                    const journalContent = document.getElementById('focusJournalContent');
                    if (journalContent) {
                        requestAnimationFrame(() => {
                            journalContent.scrollTo({ top: 0, behavior: 'smooth' });
                        });
                    }
                }
                // Open editing mode
                this._toggleJournalQuickAdd(true, true);
            });
        }
    },

    /**
     * Handle tag selection from dropdown
     * @param {string} tagId - ID of selected tag
     * @param {HTMLElement} originElement - Element that triggered the selection (for dropdown closing)
     * @private
     */
    _handleTagSelection(tagId, originElement) {
        // Ensure editing mode is open (don't reset if we are opening it now)
        const section = document.getElementById('focusJournalSection');
        if (!section?.classList.contains('editing')) {
            // Force reset when opening from a fresh tag selection to avoid leaking previous edit state
            this._toggleJournalQuickAdd(true, true);
            // Show draft preview immediately since we are adding a tag
            const draftPreview = document.getElementById('journalDraftPreview');
            if (draftPreview) {
                draftPreview.classList.add('visible');
                // Auto-scroll journal content to top to show draft
                const journalContent = document.getElementById('focusJournalContent');
                if (journalContent) {
                    requestAnimationFrame(() => {
                        journalContent.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                }
            }
        }

        const tag = JournalManager.getTag(tagId);

        // Don't add if already selected
        if (this._selectedJournalTags.includes(tagId)) {
            // Close dropdown
            originElement?.closest('.journal-tag-dropdown')?.classList.remove('open');
            return;
        }

        // Add to selection
        this._selectedJournalTags.push(tagId);

        // Add chip to display
        const chipsContainer = document.getElementById('journalSelectedTags');
        if (chipsContainer && tag) {
            const chip = document.createElement('span');
            chip.className = 'journal-selected-chip';
            chip.style.setProperty('--tag-color', tag.color);
            chip.dataset.tagId = tagId;
            chip.innerHTML = `
                <i class="fas ${tag.icon}"></i>
                <span>${tag.label}</span>
                <button class="journal-chip-remove" aria-label="Retirer">
                    <i class="fas fa-times"></i>
                </button>
            `;

            // Remove handler
            chip.querySelector('.journal-chip-remove').addEventListener('click', (ev) => {
                ev.stopPropagation();
                this._selectedJournalTags = this._selectedJournalTags.filter(t => t !== tagId);
                chip.remove();
                this._updateJournalSaveButton();
                this._updateDraftPreviewVisibility();
            });

            chipsContainer.appendChild(chip);
        }

        // Close dropdown
        originElement?.closest('.journal-tag-dropdown')?.classList.remove('open');
        this._updateJournalSaveButton();
        this._updateDraftPreviewVisibility();
    },

    /**
     * Update threshold UI (button label + popover value)
     * @private
     */
    _updateThresholdUI() {
        const threshold = appState.journalThreshold ?? 2;

        // Update button label
        const btnValue = document.getElementById('journalThresholdValue');
        if (btnValue) {
            btnValue.textContent = `≥${threshold}`;
        }

        // Update popover value
        const popoverValue = document.getElementById('thresholdCurrentValue');
        if (popoverValue) {
            popoverValue.textContent = threshold;
        }

        // Update tooltip on button
        const btn = document.getElementById('journalThresholdBtn');
        if (btn) {
            btn.setAttribute('data-tooltip', `Seuil : ${threshold}× (cliquez pour modifier)`);
        }
    },

    /**
     * Toggle the journal editing mode
     * @param {boolean} show - True to show editing UI, false to hide
     * @param {boolean} reset - Whether to reset the input fields (default: true)
     * @private
     */
    _toggleJournalQuickAdd(show, reset = true) {
        const section = document.getElementById('focusJournalSection');

        // If hiding (Cancel), always reset editing state and re-render to standard view
        // BUT animate first if visible
        if (!show) {
            const draftPreview = document.getElementById('journalDraftPreview');
            const isVisible = draftPreview && (draftPreview.classList.contains('visible') || this._editingJournalEntryId);
            const editingId = this._editingJournalEntryId; // Capture before reset

            // Helper to get current student result
            const getCurrentResult = () => appState.generatedResults.find(r => r.id === this.currentStudentId);

            // Cleanup helper
            const finishClose = () => {
                this._editingJournalEntryId = null;
                this._selectedJournalTags = [];
                const result = getCurrentResult();
                if (result) this._renderJournal(result);
                section?.classList.remove('editing');
            };

            if (isVisible) {
                // === Special handling for INLINE EDIT close (crossfade) ===
                if (editingId) {
                    const entry = JournalManager.getEntry(this.currentStudentId, editingId);
                    if (entry) {
                        // Build the original entry HTML to inject
                        const tagCounts = JournalManager.countTags(this.currentStudentId, appState.currentPeriod);
                        const threshold = appState.journalThreshold ?? 2;
                        const isIsolated = JournalManager.isEntryIsolated(entry, tagCounts);

                        const tagsHTML = entry.tags.map(tagId => {
                            const tag = JournalManager.getTag(tagId);
                            if (!tag) return '';
                            return `<span class="journal-tag" style="--tag-color: ${tag.color}">
                                <i class="fas ${tag.icon}"></i> ${tag.label}
                            </span>`;
                        }).join('');

                        const infoIcon = isIsolated
                            ? `<div class="journal-entry-info" data-tooltip="Observation isolée (< ${threshold}×) — non transmise à l'IA"><i class="fas fa-info-circle"></i></div>`
                            : '';

                        const entryHTML = `
                            <div class="journal-entry crossfade-in ${isIsolated ? 'isolated' : ''}" data-entry-id="${entry.id}">
                                <div class="journal-entry-date">${JournalManager.formatDate(entry.date)}</div>
                                <div class="journal-entry-content">
                                    <div class="journal-entry-tags">${tagsHTML}</div>
                                    ${entry.note ? `<div class="journal-entry-note">${entry.note}</div>` : ''}
                                </div>
                                ${infoIcon}
                                <button class="journal-entry-delete" data-entry-id="${entry.id}" aria-label="Supprimer">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `;

                        // Inject the entry card at the same position as the draft
                        const entryWrapper = document.createElement('div');
                        entryWrapper.className = 'journal-crossfade-wrapper';
                        entryWrapper.innerHTML = entryHTML;
                        draftPreview.parentNode.insertBefore(entryWrapper, draftPreview.nextSibling);

                        // Trigger crossfade animation
                        draftPreview.classList.add('closing');

                        // Wait for crossfade animation then cleanup
                        setTimeout(finishClose, 350);
                        return;
                    }
                }

                // === Standard draft close (not inline edit) ===
                draftPreview.classList.add('closing');
                setTimeout(finishClose, 300);
            } else {
                // Instant update if not visible
                finishClose();
            }
            return;
        }

        const saveBtn = document.getElementById('journalDraftSaveBtn');
        const draftPreview = document.getElementById('journalDraftPreview');
        const noteInput = document.getElementById('journalNoteInput');

        if (show) {
            section?.classList.add('editing');

            if (reset) {
                // Reset state
                this._selectedJournalTags = [];
                // Reset edit mode
                this._editingJournalEntryId = null;

                // Reset header title (though rerender handles this usually)
                const headerLabel = document.querySelector('.journal-draft-label');
                if (headerLabel) {
                    headerLabel.innerHTML = `<i class="fas fa-pencil"></i> Brouillon`;
                }

                if (noteInput) noteInput.value = '';
                if (saveBtn) saveBtn.disabled = true;

                // Clear selected chips
                const chipsContainer = document.getElementById('journalSelectedTags');
                if (chipsContainer) chipsContainer.innerHTML = '';
            }

            // Show the draft preview when opening
            draftPreview?.classList.add('visible');
        }
        // Close any open dropdowns (both old and new pill dropdowns)
        document.querySelectorAll('.journal-tag-dropdown.open').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.journal-pill-dropdown.open').forEach(d => d.classList.remove('open'));

        // Remove visual dimming from original entries
        document.querySelectorAll('.journal-entry.editing-original').forEach(el => el.classList.remove('editing-original'));
    },

    /**
     * Show/hide draft preview based on selected tags
     * @private
     */
    _updateDraftPreviewVisibility() {
        const draftPreview = document.getElementById('journalDraftPreview');
        if (!draftPreview) return;

        if (this._selectedJournalTags.length > 0) {
            draftPreview.classList.add('visible');
        } else {
            draftPreview.classList.remove('visible');
        }
    },

    /**
     * Update save button state based on selected tags or note content
     * @private
     */
    _updateJournalSaveButton() {
        const saveBtn = document.getElementById('journalDraftSaveBtn');
        if (saveBtn) {
            const noteInput = document.getElementById('journalNoteInput');
            const hasNote = noteInput && noteInput.value.trim().length > 0;
            const hasTags = this._selectedJournalTags.length > 0;

            // Enable save if at least one tag is selected OR there is a note
            saveBtn.disabled = !hasTags && !hasNote;
        }
    },

    /**
     * Setup pill button event handlers inside draft
     * @param {HTMLElement} container - The content container
     * @private
     */
    _setupDraftPillButtons(container) {
        const pillsContainer = container.querySelector('#journalDraftPills');
        if (!pillsContainer) return;

        // Handle pill dropdown triggers
        pillsContainer.querySelectorAll('.journal-pill-btn:not(.journal-pill-direct)').forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = trigger.closest('.journal-pill-dropdown');
                const wasOpen = dropdown?.classList.contains('open');

                // Close all dropdowns first
                pillsContainer.querySelectorAll('.journal-pill-dropdown.open').forEach(dd => {
                    dd.classList.remove('open');
                });

                // Toggle clicked dropdown
                if (!wasOpen) {
                    dropdown?.classList.add('open');

                    // Show draft if not visible
                    const draftPreview = document.getElementById('journalDraftPreview');
                    draftPreview?.classList.add('visible');

                    // Close on outside click
                    const closeHandler = (ev) => {
                        if (!dropdown?.contains(ev.target)) {
                            dropdown?.classList.remove('open');
                            document.removeEventListener('click', closeHandler);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeHandler), 0);
                }
            });
        });

        // Handle dropdown option clicks
        pillsContainer.querySelectorAll('.journal-dropdown-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagId = option.dataset.tagId;
                this._handleTagSelection(tagId, option);
                // Close dropdown after selection
                option.closest('.journal-pill-dropdown')?.classList.remove('open');
            });
        });

        // Handle direct Remarque button
        pillsContainer.querySelectorAll('.journal-pill-direct').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tagId = btn.dataset.tagId;
                this._handleTagSelection(tagId, btn);
            });
        });
    },

    /**
     * Handle editing a journal entry
     * @param {string} entryId 
     */
    _onEditJournalEntry(entryId) {
        const entry = JournalManager.getEntry(this.currentStudentId, entryId);
        if (!entry) return;

        // 1. Set editing state and sync tags
        this._editingJournalEntryId = entryId;
        this._selectedJournalTags = [...entry.tags];

        // 2. Re-render journal to show inline editor
        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (result) {
            this._renderJournal(result);

            // 3. Scroll to the inline editor
            // Since we re-rendered, we need to find the element again
            // The drafts ID is #journalDraftPreview (even inline)
            // But we might want to target the container that replaced the entry
            setTimeout(() => {
                const journalContent = document.querySelector('.journal-content');
                if (journalContent) {
                    // Scroll the journal-content container to show the draft at top
                    journalContent.scrollTo({ top: 0, behavior: 'smooth' });
                    // Focus inputs
                    const noteInput = document.getElementById('journalNoteInput');
                    if (noteInput && !entry.note) noteInput.focus();
                }
            }, 50);
        }

        // 4. Mark section as editing to show controls properly if needed
        const section = document.getElementById('focusJournalSection');
        section?.classList.add('editing');
    },

    /**
     * Save a new journal entry or update existing
     * @private
     */
    _saveJournalEntry() {
        const noteInput = document.getElementById('journalNoteInput');
        const note = noteInput?.value?.trim() || '';

        if (!this.currentStudentId || (this._selectedJournalTags.length === 0 && !note)) return;

        // Disable button immediately
        const saveBtn = document.getElementById('journalDraftSaveBtn');
        if (saveBtn) saveBtn.disabled = true;

        // Animate closing
        const draftPreview = document.getElementById('journalDraftPreview');
        if (draftPreview) draftPreview.classList.add('closing');

        // Execute save after animation
        setTimeout(() => {
            let entry;

            if (this._editingJournalEntryId) {
                // Update existing
                entry = JournalManager.updateEntry(this.currentStudentId, this._editingJournalEntryId, {
                    tags: [...this._selectedJournalTags],
                    note: note
                });
                if (entry) UI.showNotification('Observation modifiée', 'success');
            } else {
                // Create new
                entry = JournalManager.addEntry(this.currentStudentId, {
                    tags: [...this._selectedJournalTags],
                    note: note
                });
                if (entry) UI.showNotification('Observation enregistrée', 'success');
            }

            if (entry) {
                // Refresh badge status (dirty check)
                this._refreshAppreciationStatus();

                // Reset editing state
                this._editingJournalEntryId = null;
                this._selectedJournalTags = [];

                // Re-render journal
                const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                if (result) {
                    // If updated, don't necessarily need to highlight animation, but for new we do
                    const highlightId = this._editingJournalEntryId ? null : entry.id;
                    this._renderJournal(result, highlightId);
                }

                const section = document.getElementById('focusJournalSection');
                section?.classList.remove('editing');
            } else {
                // If failed, re-enable button and remove closing class
                if (saveBtn) saveBtn.disabled = false;
                if (draftPreview) draftPreview.classList.remove('closing');
            }
        }, 300);
    }
};
