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
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelJournal } from './FocusPanelJournal.js';
import { FocusPanelAnalysis } from './FocusPanelAnalysis.js';
import { FocusPanelHeader } from './FocusPanelHeader.js';
import { FocusPanelNavigation } from './FocusPanelNavigation.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { ModalUI } from './ModalUIManager.js';
import { HistoryManager } from './HistoryManager.js';


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
     * @param {Object} listViewManager - Référence à ListViewManager (injected to avoid circular dependency)
     */
    init(appreciationsManager, listViewManager) {
        AppreciationsManager = appreciationsManager;
        this.listViewManager = listViewManager;

        // Initialize History module with callbacks
        FocusPanelHistory.init({
            onContentChange: (content) => {
                FocusPanelStatus.updateWordCount();
                FocusPanelStatus.syncAppreciationToResult(content);
                // CRITICAL FIX: Ensure List View updates on Undo/Redo
                if (this.currentStudentId) {
                    const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                    if (result) this._updateListRow(result);
                }
            },
            onHistoryChange: () => {
                FocusPanelStatus.updateHistoryIndicator();
            }
        });

        // Initialize Journal module with callbacks
        FocusPanelJournal.init({
            getCurrentStudentId: () => this.currentStudentId,
            onStatusRefresh: () => FocusPanelStatus.refreshAppreciationStatus()
        });

        // Initialize Analysis module with callbacks and references
        FocusPanelAnalysis.init({
            getCurrentStudentId: () => this.currentStudentId
        }, AppreciationsManager);

        // Initialize Header module
        FocusPanelHeader.init({
            getCurrentStudentId: () => this.currentStudentId,
            setCurrentStudentId: (id) => { this.currentStudentId = id; },
            getIsCreationMode: () => this.isCreationMode,
            setIsCreationMode: (val) => { this.isCreationMode = val; },
            onRefreshStatus: () => FocusPanelStatus.refreshAppreciationStatus(),
            onUpdateListRow: (r) => this._updateListRow(r),
            onRenderTimeline: (d) => this._renderStudentDetailsTimeline(d, true), // Creation/Edit mode uses true
            onUpdateNavigation: () => FocusPanelNavigation.updateControls(),
            getHistoryEdits: () => this._newStudentHistory,
            clearHistoryEdits: () => { this._newStudentHistory = null; }
        });

        // Initialize Navigation module
        // Initialize Status module with callbacks
        FocusPanelStatus.init({
            getCurrentStudentId: () => this.currentStudentId,
            getActiveGenerations: () => this._activeGenerations,
            onUpdateGenerateButton: (result) => this._updateGenerateButton(result),
            onUpdateListRow: (result) => this._updateListRow(result)
        });

        FocusPanelNavigation.init({
            getCurrentStudentId: () => this.currentStudentId,
            setCurrentStudentId: (id) => { this.currentStudentId = id; },
            getCurrentIndex: () => this.currentIndex,
            setCurrentIndex: (idx) => { this.currentIndex = idx; },
            saveContext: () => this._saveContext(),
            renderContent: (r) => this._renderContent(r),
            updateAppreciationStatus: (s, opts) => FocusPanelStatus.updateAppreciationStatus(s, opts),
            onUpdateActiveRow: (id) => this._updateActiveRow(id)
        });

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

        // Back button: Cancel edit mode if active, otherwise close panel
        // Special case: In creation mode, always close the panel
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const header = document.querySelector('.focus-header');
                const isEditing = header?.classList.contains('editing');

                // In creation mode: always close the panel (nothing to go back to)
                if (this.isCreationMode) {
                    // Clear any pending photo
                    FocusPanelHeader.clearPendingAvatarData();
                    // Close without saving (close() handles UI cleanup for creation mode)
                    this.close();
                    return;
                }

                // Existing student: toggle edit mode or close
                if (isEditing) {
                    // Cancel edit mode without saving
                    FocusPanelHeader.toggleEditMode(false, true);
                } else {
                    // Normal close
                    this.close();
                }
            });
        }

        // Navigation delegated to FocusPanelNavigation
        if (prevBtn) prevBtn.addEventListener('click', () => FocusPanelNavigation.navigatePrev());
        if (nextBtn) nextBtn.addEventListener('click', () => FocusPanelNavigation.navigateNext());

        // [UX Mobile] Back Button Trap
        // Intercept browser back button to close panel instead of navigating away/closing app
        window.addEventListener('popstate', (e) => {
            // [FIX] Don't close FocusPanel if a Modal is active on top of it
            // The Modal will handle the back button event
            if (ModalUI.activeModal) return;

            if (this.isOpen()) {
                // Close panel without triggering another history.back()
                this.close({ causedByHistory: true });
            }
        });

        // Generate
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generate());
            // [NEW] Right-click to preview the prompt
            generateBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showPromptPreview();
            });
        }

        // Copy
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copy());
            // [NEW] Right-click to copy the prompt directly (symmetric with Generate button)
            copyBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._copyPromptToClipboard();
            });
        }

        // Header inputs change detection delegated to FocusPanelHeader

        const statusesContainer = document.querySelector('.focus-header-edit .status-checkboxes');
        // Header listeners derived to FocusPanelHeader

        // Settings Change Listener (for instant Threshold updates)
        document.addEventListener('app-settings-changed', () => {
            // If we are viewing a student, refresh the badge status
            if (this.currentStudentId) {
                FocusPanelStatus.refreshAppreciationStatus();
            }
        });

        // Cancel button listener delegated to FocusPanelHeader

        // (Toggle Details button removed - main header period selector is the source of truth)

        // Analyze button/page (delegated to FocusPanelAnalysis module)
        const analyzeBtn = document.getElementById('focusAnalyzeBtn');
        if (analyzeBtn) analyzeBtn.addEventListener('click', () => FocusPanelAnalysis.show());
        const analysisBackBtn = document.getElementById('focusAnalysisBackBtn');
        if (analysisBackBtn) analysisBackBtn.addEventListener('click', () => FocusPanelAnalysis.hide());
        const generateAnalysisBtn = document.getElementById('focusGenerateAnalysisBtn');
        if (generateAnalysisBtn) generateAnalysisBtn.addEventListener('click', () => FocusPanelAnalysis.generate());

        // Unified Data Change Listener (Live Model Update)
        const handleDataChange = (e) => {
            // Only process if Focus Panel is open and we have a valid student ID
            if (!this.isOpen() || !this.currentStudentId) return;

            // Find result object in current state
            const currentPeriod = appState.currentPeriod;
            const result = appState.generatedResults.find(r => r.id === this.currentStudentId);

            if (!result) return;

            const target = e.target;
            let changed = false;

            // 1. Grade Input
            if (target.id === 'focusCurrentGradeInput' || target.id === 'focusEditGradeInput') {
                const val = target.value.replace(',', '.');
                let numVal = val === '' ? null : parseFloat(val);
                if (isNaN(numVal)) numVal = null; // Store as null if invalid

                // Init structure if missing
                if (!result.studentData.periods) result.studentData.periods = {};
                if (!result.studentData.periods[currentPeriod]) result.studentData.periods[currentPeriod] = {};

                result.studentData.periods[currentPeriod].grade = numVal;
                changed = true;
            }

            // 2. Context Input
            else if (target.id === 'focusContextInput') {
                if (!result.studentData.periods) result.studentData.periods = {};
                if (!result.studentData.periods[currentPeriod]) result.studentData.periods[currentPeriod] = {};

                result.studentData.periods[currentPeriod].context = target.value;
                changed = true;
            }

            // 3. Status Checkboxes (Delegated from header edit container)
            else if (target.type === 'checkbox' && target.closest('.focus-header-edit')) {
                const checked = Array.from(document.querySelectorAll('.focus-header-edit input[type="checkbox"]:checked')).map(cb => cb.value);
                result.studentData.statuses = checked;
                changed = true;
            }

            if (changed) {
                // Refresh Status (Badge) - This dispatch event for List View update
                FocusPanelStatus.refreshAppreciationStatus();
                // Note: We deliberately update the model LIVE so ListViewManager._isResultDirty sees changes immediately
                // LIVE UPDATE: Update the List View row immediately to show/hide dirty indicator
                this._updateListRow(result);
            }
        };

        // Attach global listeners for these inputs (delegated)
        document.addEventListener('input', handleDataChange);
        document.addEventListener('change', handleDataChange);




        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen()) return;
            const activeEl = document.activeElement;
            const isEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

            // [NEW] Shortcut: Ctrl + Enter to launch generation
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.generate();
                return;
            }

            if (e.key === 'Escape') {
                this.close();
            } else if (e.key === 'ArrowLeft' && !isEditing) {
                e.preventDefault();
                FocusPanelNavigation.navigatePrev();
            } else if (e.key === 'ArrowRight' && !isEditing) {
                e.preventDefault();
                FocusPanelNavigation.navigateNext();
            }
        });

        // Refinement & Appreciation (Existing logic)
        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            refinementOptions.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-refine-type]');
                if (btn) this._refineAppreciation(btn.dataset.refineType);
            });

            // [NEW] Right-click to preview the refinement prompt
            refinementOptions.addEventListener('contextmenu', (e) => {
                const btn = e.target.closest('[data-refine-type]');
                if (btn) {
                    e.preventDefault();
                    this._showRefinementPreview(btn.dataset.refineType);
                }
            });
        }

        const appreciationText = document.getElementById('focusAppreciationText');
        if (appreciationText) {
            // Use 'input' logic to reliably detect manual edits
            appreciationText.addEventListener('input', () => {
                FocusPanelStatus.updateWordCount();

                const content = appreciationText.textContent?.trim() || '';
                const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                const isGenerating = FocusPanelStatus._isGenerating(this.currentStudentId);

                if (result && !isGenerating) {
                    const hasRealContent = FocusPanelStatus._hasRealContent(content);

                    if (hasRealContent) {
                        // Only set wasGenerated=false on first manual entry (from empty)
                        // This preserves AI source indicator when editing AI-generated text
                        const wasEmpty = !FocusPanelStatus._hasRealContent(result.appreciation);

                        if (wasEmpty && result.wasGenerated !== true) {
                            result.wasGenerated = false;

                            // Capture prompt hash for manual entries (enables dirty detection)
                            if (!result.promptHash) {
                                result.promptHash = PromptService.getPromptHash({
                                    ...result.studentData,
                                    id: result.id,
                                    currentPeriod: appState.currentPeriod
                                });
                                result.generationPeriod = appState.currentPeriod;
                            }
                        }

                        result.appreciation = content;
                    } else {
                        result.appreciation = '';
                    }

                    FocusPanelStatus.updateSourceIndicator(result);
                    FocusPanelStatus.updateAppreciationStatus(result);
                    this._updateListRow(result);
                }
            });

            appreciationText.addEventListener('blur', () => {
                const content = appreciationText.textContent?.trim();
                const result = appState.generatedResults.find(r => r.id === this.currentStudentId);

                if (result && content !== undefined) {
                    const isRealContent = FocusPanelStatus._hasRealContent(content);

                    if (isRealContent) {
                        FocusPanelHistory.push(content);
                        this._saveContext();

                        // Show "Saved" feedback for manual edits
                        if (result.wasGenerated === false) {
                            FocusPanelStatus.updateAppreciationStatus(null, { state: 'saved' });
                        }
                    } else {
                        // Clear appreciation when content is empty/placeholder
                        result.appreciation = '';
                        if (result.studentData?.periods?.[appState.currentPeriod]) {
                            result.studentData.periods[appState.currentPeriod].appreciation = '';
                        }
                    }

                    FocusPanelStatus.refreshAppreciationStatus();
                }
            });
            appreciationText.addEventListener('keydown', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); FocusPanelHistory.undo(); }
                    else if (e.key === 'z' && e.shiftKey || e.key === 'y') { e.preventDefault(); FocusPanelHistory.redo(); }
                }
            });
        }

        const historyIndicator = document.getElementById('focusHistoryIndicator');
        if (historyIndicator) {
            historyIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                FocusPanelHistory.showPopover();
            });
        }

        // History Navigation Arrows
        const historyPrevBtn = document.getElementById('focusHistoryPrevBtn');
        if (historyPrevBtn) {
            historyPrevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                FocusPanelHistory.undo();
            });
        }

        const historyNextBtn = document.getElementById('focusHistoryNextBtn');
        if (historyNextBtn) {
            historyNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                FocusPanelHistory.redo();
            });
        }

        // Note: FAB button (addStudentFab) is now handled by ImportWizardManager via the Hub

        // Context textarea
        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) {
            contextInput.addEventListener('input', () => {
                this._autoResizeTextarea(contextInput);
                this._saveContext(); // Immediate save to prevent data loss
                FocusPanelStatus.refreshAppreciationStatus(); // Check dirty state
            });
        }

        // [NEW] Word Count Badge Click Listener (Quick access to Personalization)
        // Behavior aligned with avgWordsChip in header for single source of truth
        const wordCountBadge = document.getElementById('focusWordCount');
        if (wordCountBadge) {
            wordCountBadge.addEventListener('click', () => {
                // 1. Open Personalization Modal (same as avgWordsChip)
                const personalizationModal = document.getElementById('personalizationModal');
                if (personalizationModal) UI.openModal(personalizationModal);

                // 2. Refresh Lab data on modal open to sync with current period
                import('./listeners/SettingsModalListeners.js').then(({ SettingsModalListeners }) => {
                    SettingsModalListeners._updateStudentContextAndPrompt();
                });

                // 3. Use centralized highlight utility for length slider
                UI.highlightSettingsElement('iaLengthSlider', { tab: 'templates' });
            });
        }

        // Journal listeners are now handled by FocusPanelJournal module
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



    /**
     * Vérifie si le panel est ouvert
     * @returns {boolean}
     */
    isOpen() {
        const panel = document.getElementById('focusPanel');
        return panel?.classList.contains('open') ?? false;
    },



    /**
     * Ouvre le Focus Panel pour un élève
     * @param {string} studentId - ID de l'élève
     */
    open(studentId) {
        this.isCreationMode = false;
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result) return;

        // CRITICAL FIX: Save context of PREVIOUS student BEFORE changing currentStudentId
        // This prevents race conditions where user switches during generation
        if (this.currentStudentId && this.currentStudentId !== studentId) {
            this._saveContext();
        }

        // [UX Mobile] Manage History State
        // Allows using system Back button to close panel
        const state = { focusPanel: true, studentId: studentId };
        if (this.isOpen() && history.state?.focusPanel) {
            // Already open, switching student -> Replace state to keep history clean (prevent needing 50 back clicks)
            HistoryManager.replaceCurrentState(state);
        } else {
            // Opening from closed -> Push state
            HistoryManager.pushCustomState(state);
        }

        this.currentStudentId = studentId;
        this.currentIndex = appState.filteredResults.findIndex(r => r.id === studentId);

        // Load unified persistent history for this student
        FocusPanelHistory.load(studentId);

        // Reset generate button state (only if target student is NOT being generated)
        // If target is being generated, _renderContent will restore the loading state
        if (!this._activeGenerations.has(studentId)) {
            const generateBtn = document.getElementById('focusGenerateBtn');
            if (generateBtn) {
                UI.hideInlineSpinner(generateBtn);
            }
            // Reset appreciation badge state
            FocusPanelStatus.updateAppreciationStatus(null, { state: 'none' });
        }

        this._renderContent(result);
        // FocusPanelNavigation.updateControls() is handled below

        // Ensure controls are updated after open
        setTimeout(() => FocusPanelNavigation.updateControls(), 0);

        // Show panel
        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');

        if (panel) panel.classList.add('open');
        if (backdrop) backdrop.classList.add('visible');

        // Mark active row in list view for visual feedback
        this._updateActiveRow(studentId);

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

        // [UX Mobile] Push history state for creation mode
        HistoryManager.pushCustomState({ focusPanel: true, mode: 'creation' });

        // Create a dummy result for the new student
        const dummyResult = {
            id: null,
            nom: '',
            prenom: '',
            studentData: {
                statuses: [],
                periods: {}
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

        // Explicitly clear inputs handled by FocusPanelHeader

        // Clear any stored original values to prevents "Cancel" from restoring previous student data
        // Handled by FocusPanelHeader

        // Enable Header Edit Mode (Identity + Statuses)
        FocusPanelHeader.toggleEditMode(true);

        // Clear previous periods history for creation mode
        this._newStudentHistory = {};

        // Render empty timeline for creation (clears previous data)
        this._renderStudentDetailsTimeline(null, true);

        // Reset history state for creation mode (no student to load from)
        FocusPanelHistory.reset();
    },

    /**
     * Ferme le Focus Panel
     * @param {Object} options - Options de fermeture
     * @param {boolean} [options.causedByHistory=false] - Si true, ne tente pas de faire history.back()
     */
    close(options = {}) {
        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');
        const wasOpen = this.isOpen();

        // Check if we're in creation mode BEFORE clearing state
        const wasCreationMode = this.isCreationMode;

        // Exit edit mode if active (only for existing students, not creation)
        const header = document.querySelector('.focus-header');
        if (!wasCreationMode && header && header.classList.contains('editing')) {
            FocusPanelHeader.toggleEditMode(false, true); // Cancel without saving
        } else if (wasCreationMode && header?.classList.contains('editing')) {
            // In creation mode: just clean up UI without triggering any save logic
            header.classList.remove('editing');
            document.querySelector('.focus-header-read')?.classList.remove('hidden');
            document.querySelector('.focus-header-edit')?.classList.remove('visible');
            document.querySelector('.focus-nav-buttons')?.classList.remove('editing');
        }

        // Save context and identity changes before closing (NOT in creation mode)
        if (!wasCreationMode) {
            this._saveContext();
        }

        // Cancel any in-progress generation
        if (this.currentStudentId) this._cancelGenerationForStudent(this.currentStudentId);

        if (panel) panel.classList.remove('open');
        if (backdrop) backdrop.classList.remove('visible');

        // Clear active row highlight
        this._clearActiveRow();

        // Reset state
        this.currentStudentId = null;
        this.currentIndex = -1;
        this.isCreationMode = false;
        // _originalHeaderValues managed by FocusPanelHeader

        // [UX Mobile] History Cleanup
        // CRITICAL: Do NOT call history.back() here! It can navigate to landing page.
        // Instead, replace the current state to "neutralize" it.
        if (wasOpen && !options.causedByHistory && history.state?.focusPanel) {
            HistoryManager.replaceCurrentState({ appBase: true, consumed: true });
        }
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

    // Header Logic delegated to FocusPanelHeader


    /**
     * Navigue vers l'élève précédent avec animation
     */
    // Navigation Logic delegated to FocusPanelNavigation module

    /**
     * Update active row highlight in list view
     * @param {string} studentId - ID of student to mark as active
     * @private
     */
    _updateActiveRow(studentId) {
        // Clear previous active
        this._clearActiveRow();

        // Mark new active row
        if (studentId) {
            const row = document.querySelector(`.student-row[data-student-id="${studentId}"]`);
            if (row) {
                row.classList.add('focus-active');
            }
        }
    },

    /**
     * Clear active row highlight from all rows
     * @private
     */
    _clearActiveRow() {
        document.querySelectorAll('.student-row.focus-active').forEach(row => {
            row.classList.remove('focus-active');
        });
        // Also blur any focused rows to remove keyboard focus outline
        document.querySelectorAll('.student-row:focus').forEach(row => {
            row.blur();
        });
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
     * Affiche une prévisualisation du prompt qui serait envoyé à l'IA
     * Triggered by right-click on Generate button
     */
    async _showPromptPreview() {
        if (!this.currentStudentId) return;

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        const currentPeriod = appState.currentPeriod;

        // Helper to construct student data for prompt generation (same as generate)
        const studentData = this._prepareStudentData(this.currentStudentId, currentPeriod, result);
        studentData.generatedAppreciation = ''; // Explicitly clear for preview

        const prompts = AppreciationsManager.getAllPrompts(studentData);
        // We only show prompt.appreciation
        const promptText = prompts.appreciation || '';

        // Simple HTML reset/escape
        await this._displayPromptModal(promptText, 'Prévisualisation du Prompt');
    },

    /**
     * Copie directement le prompt dans le presse-papier (sans modal)
     * Triggered by right-click on Copy button
     * @private
     */
    async _copyPromptToClipboard() {
        if (!this.currentStudentId) {
            UI.showNotification('Aucun élève sélectionné', 'warning');
            return;
        }

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        const currentPeriod = appState.currentPeriod;

        // Use same logic as _showPromptPreview but copy directly
        const studentData = this._prepareStudentData(this.currentStudentId, currentPeriod, result);
        studentData.generatedAppreciation = ''; // Explicitly clear for prompt

        const prompts = AppreciationsManager.getAllPrompts(studentData);
        const promptText = prompts.appreciation || '';

        if (!promptText) {
            UI.showNotification('Impossible de générer le prompt', 'warning');
            return;
        }

        try {
            await navigator.clipboard.writeText(promptText);

            // Visual feedback on Copy button
            const copyBtn = document.getElementById('focusCopyBtn');
            if (copyBtn) {
                const icon = copyBtn.querySelector('i');
                const originalClass = icon?.className;

                // Change to check icon and add 'copied' class
                if (icon) icon.className = 'fas fa-check';
                copyBtn.classList.add('copied');

                // Reset after delay
                setTimeout(() => {
                    if (icon && originalClass) icon.className = originalClass;
                    copyBtn.classList.remove('copied');
                }, 1500);
            }

            UI.showNotification('Prompt copié dans le presse-papier', 'success');
        } catch (err) {
            console.error('Failed to copy prompt:', err);
            UI.showNotification('Échec de la copie du prompt', 'error');
        }
    },

    /**
     * Helper to prepare student data object for prompt generation
     * Ensures consistency between Generate and Preview
     * @param {string} studentId - Student ID
     * @param {string} period - Target period
     * @param {Object} result - Student result object
     * @returns {Object} Student data object ready for AppreciationsManager
     * @private
     */
    _prepareStudentData(studentId, period, result) {
        return {
            id: studentId, // Required for journal lookup
            nom: result.nom,
            prenom: result.prenom,
            statuses: result.studentData.statuses || [],
            periods: result.studentData.periods,
            currentPeriod: period
        };
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

        // Show pending badge and skeleton loading in appreciation area
        FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });
        this._showAppreciationSkeleton();

        const appreciationEl = document.getElementById('focusAppreciationText');

        try {
            // Use existing appreciation generation logic
            // Use centralized data preparation
            const studentData = this._prepareStudentData(generatingForStudentId, generatingForPeriod, result);

            const newResult = await AppreciationsManager.generateAppreciation(studentData, false, null, signal, 'single-student');

            // Check if signal was aborted
            if (signal.aborted) {
                return;
            }

            // Generation complete
            // Note: We do NOT delete from _activeGenerations here anymore.
            // We wait for the finally block or UI completion to ensure 'isGenerating' remains true
            // during the typewriter effect (preventing false "manual edit" detection)

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

            // NEW APPROACH: Store hash of the prompt used for generation
            // This captures ALL data that affects AI output (grade, context, journal, settings, etc.)
            // Much simpler and more robust than tracking individual fields
            result.promptHash = PromptService.getPromptHash({
                ...result.studentData,
                id: result.id,
                currentPeriod: generatingForPeriod
            });
            result.generationPeriod = generatingForPeriod;

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
                    FocusPanelStatus.updateAppreciationStatus(result, { state: 'error' });
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

                        // Calculate target word count BEFORE typewriter changes DOM
                        const targetWordCount = Utils.countWords(newResult.appreciation);

                        // Start word count animation IN PARALLEL with typewriter
                        // Pass targetCount since DOM is still empty
                        FocusPanelStatus.updateWordCount(true, 0, targetWordCount);

                        await UI.typewriterReveal(appreciationEl, newResult.appreciation, { speed: 'fast' });
                    }

                    // Réinitialiser l'historique - la régénération est un nouveau départ
                    // L'"Original" sera la nouvelle génération IA
                    result.historyState = null;
                    FocusPanelHistory.load(generatingForStudentId); // Re-init with fresh state
                    FocusPanelHistory.push(newResult.appreciation, 'original');

                    // Show done badge
                    FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });

                    // Update AI indicator with new metadata
                    FocusPanelStatus.updateAiIndicator(result);

                    // Update button to "Régénérer" state
                    this._updateGenerateButton(result);

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
                FocusPanelStatus.updateAppreciationStatus(null, { state: 'error' });
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

            // Only update UI if we are truly done (no other generation took over)
            // This prevents hiding spinner/resetting UI if user clicked "Générer" again (restart)
            if (!this._activeGenerations.has(generatingForStudentId)) {

                // Only touch UI if still on the same student
                if (this.currentStudentId === generatingForStudentId) {
                    if (generateBtn) UI.hideInlineSpinner(generateBtn);

                    // Reset Card UI to sync with model (e.g. if aborted)
                    // This ensures badge and appreciation text are restored to valid state
                    if (result) {
                        FocusPanelStatus.updateAppreciationStatus(result, { animate: false });
                        this._renderAppreciationText(result);
                    }
                }
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
     * Update the Generate button state (Générer vs Régénérer)
     * @param {Object} result - Student result object
     * @private
     */
    _updateGenerateButton(result) {
        const generateBtn = document.getElementById('focusGenerateBtn');
        if (!generateBtn) return;

        const currentPeriod = appState.currentPeriod;
        const periodAppreciation = result?.studentData?.periods?.[currentPeriod]?.appreciation;
        const hasAppreciation = periodAppreciation && periodAppreciation.trim().length > 0;
        const wasGenerated = result?.wasGenerated === true;
        const isCurrentPeriodGenerated = result?.generationPeriod === currentPeriod;

        // Determine if this is a regeneration scenario
        const isRegenerate = hasAppreciation && (wasGenerated && isCurrentPeriodGenerated);

        // Check if data is modified (dirty state) - needs regeneration
        const isDirty = hasAppreciation && isRegenerate && FocusPanelStatus.checkDirtyState(result);

        const periodLabel = Utils.getPeriodLabel(currentPeriod, false);

        // Remove all state classes first
        generateBtn.classList.remove('btn-ai', 'btn-ai-outline', 'btn-regenerate-warning', 'btn-neutral');

        // NEW UX LOGIC:
        // - Bold style (btn-ai) = ACTION NEEDED → "Générer" first time
        // - Warning style = ACTION RECOMMENDED → "Régénérer" when data changed  
        // - Neutral style = OPTIONAL → "Régénérer" when already up to date

        if (!hasAppreciation) {
            // STATE 1: No appreciation yet → Bold primary style (action needed)
            generateBtn.classList.add('btn-ai');
            generateBtn.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i> Générer <span id="focusGeneratePeriod">${periodLabel}</span>`;
        } else if (isDirty) {
            // STATE 2: Data modified since generation → Warning style (action recommended)
            generateBtn.classList.add('btn-ai', 'btn-regenerate-warning');
            generateBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Régénérer`;
        } else if (isRegenerate) {
            // STATE 3: Already generated and up to date → Neutral style (optional)
            generateBtn.classList.add('btn-neutral');
            generateBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Régénérer`;
        } else {
            // Fallback: Has appreciation but not AI-generated (manual) → Neutral
            generateBtn.classList.add('btn-neutral');
            generateBtn.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i> Générer <span id="focusGeneratePeriod">${periodLabel}</span>`;
        }
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

        const copyBtn = document.getElementById('focusCopyBtn');

        try {
            // Strip Markdown and HTML tags for clean copy (Plain Text)
            const cleanText = Utils.stripMarkdown(Utils.decodeHtmlEntities(periodAppreciation));

            await navigator.clipboard.writeText(cleanText);

            // Visual feedback on button
            if (copyBtn) {
                const icon = copyBtn.querySelector('i');
                const originalClass = icon?.className;

                // Change to check icon and add 'copied' class
                if (icon) icon.className = 'fas fa-check';
                copyBtn.classList.add('copied');

                // Reset after delay
                setTimeout(() => {
                    if (icon && originalClass) icon.className = originalClass;
                    copyBtn.classList.remove('copied');
                }, 1500);
            }


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
        // this.isCreationMode = false; // MOVED to open() to prevent premature reset during openNew() sequence

        // === 0. HEADER: Avatar ===
        // Avatar is now ONLY editable in edit mode (toggled by FocusPanelHeader)
        // In read mode, avatar is display-only
        const avatarContainer = document.getElementById('focusAvatarContainer');
        if (avatarContainer) {
            avatarContainer.innerHTML = StudentPhotoManager.getAvatarHTML(result, 'lg');
            avatarContainer.classList.add('focus-panel-avatar-container');

            // Store result ID for later reference by edit mode
            avatarContainer.dataset.studentId = result.id || '';

            // Avatar is NOT editable in read mode - just display
            // Edit mode will enable interactivity via FocusPanelHeader.toggleEditMode()
        }

        // === 1. HEADER: Student Name ===
        const nameEl = document.getElementById('focusStudentName');
        if (nameEl) {
            nameEl.innerHTML = `${result.prenom} ${result.nom} <i class="fas fa-pen focus-name-edit-icon"></i>`;
        }

        // === 2. HEADER: Status Badges ===
        FocusPanelHeader.renderStatusBadges(result.studentData.statuses || []);

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
                const evalCount = periodData.evaluationCount;

                // Show chip for ALL past periods (even if empty) for consistency
                const chip = document.createElement('span');
                chip.className = 'previous-grade-chip';
                const displayGrade = (grade !== undefined && grade !== null && grade !== '')
                    ? parseFloat(grade).toFixed(1).replace('.', ',')
                    : '--';

                // Add tooltip class and data if we have evaluation count
                if (typeof evalCount === 'number') {
                    chip.classList.add('tooltip');
                    chip.setAttribute('data-tooltip', `Moyenne sur ${evalCount} évaluation${evalCount > 1 ? 's' : ''}`);
                }

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
            const currentPeriodData = result.studentData.periods?.[currentPeriod] || {};
            const currentGrade = currentPeriodData.grade;
            const evalCount = currentPeriodData.evaluationCount;

            gradeInput.value = (currentGrade !== undefined && currentGrade !== null)
                ? parseFloat(currentGrade).toFixed(1).replace('.', ',')
                : '';

            // Add tooltip showing evaluation count if available
            const gradeWrapper = gradeInput.closest('.grade-input-wrapper') || gradeInput.parentElement;
            if (gradeWrapper && typeof evalCount === 'number') {
                gradeWrapper.classList.add('tooltip');
                gradeWrapper.setAttribute('data-tooltip', `Moyenne sur ${evalCount} évaluation${evalCount > 1 ? 's' : ''}`);
            } else if (gradeWrapper) {
                gradeWrapper.classList.remove('tooltip');
                gradeWrapper.removeAttribute('data-tooltip');
            }

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
                        FocusPanelStatus.checkIfDataModified();
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
        this._renderAppreciationText(result);

        // === 8. FOOTER: Generate Button State (Générer vs Régénérer) ===
        this._updateGenerateButton(result);

        // === 9. Copy Button State & 10. Refinement Buttons ===
        // Handled dynamically by FocusPanelStatus.updateWordCount() triggered in _renderAppreciationText
        // or by Observer to ensure disabled state matches content emptiness.

        // === 11. AI INDICATOR (✨) - Provenance info ===
        FocusPanelStatus.updateAiIndicator(result);

        // === 12. STATUS BADGE - Freshness state (generated, modified, pending) ===
        FocusPanelStatus.updateAppreciationStatus(result, { animate: false });

        // === 13. JOURNAL DE BORD ===
        FocusPanelJournal.render(result);
    },






    /**
     * Renders the appreciation text area (handles skeleton vs content)
     * @param {Object} result - Student result object
     * @private
     */
    _renderAppreciationText(result) {
        if (!result) return;

        const appreciationEl = document.getElementById('focusAppreciationText');
        if (!appreciationEl) return;

        const currentPeriod = appState.currentPeriod;
        let hasAppreciation = false;

        // Check if this student has a generation in progress
        const isGenerating = this._activeGenerations.has(result.id);

        if (isGenerating) {
            // Restore loading state for this student
            this._showAppreciationSkeleton();
            FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });

            // Also restore Generate button loading state
            const generateBtn = document.getElementById('focusGenerateBtn');
            if (generateBtn) {
                UI.showInlineSpinner(generateBtn);
            }

            hasAppreciation = false; // Consider as no appreciation yet
        } else {
            // Normal rendering: Get appreciation for the CURRENT period specifically
            // [FIX] Use period-specific appreciation as source of truth (not result.appreciation)
            const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;

            if (periodAppreciation && periodAppreciation.trim()) {
                // Render with Markdown support (checking for entities)
                appreciationEl.innerHTML = Utils.decodeHtmlEntities(Utils.cleanMarkdown(periodAppreciation));
                appreciationEl.classList.remove('empty');
                appreciationEl.classList.add('filled');
                hasAppreciation = true;
            } else {
                // Apply empty state class directly on the element for proper styling
                appreciationEl.textContent = ''; // Clear content to show ::before placeholder
                appreciationEl.classList.add('empty');
                appreciationEl.classList.remove('filled');
                hasAppreciation = false;
            }
        }
        FocusPanelStatus.updateWordCount();
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

        // Note: History is now unified and managed directly in result.history by FocusPanelHistory
        // No need to save separately - it persists automatically

        // Persist to storage
        StorageManager.saveAppState();

        // Refresh appreciation status (dirty check)
        FocusPanelStatus.refreshAppreciationStatus();
    },

    /**
     * Met à jour une ligne dans la vue liste
     * @param {Object} result - Données de l'élève
     * @private
     */
    async _updateListRow(result) {
        if (!result) return;

        try {
            let manager = this.listViewManager;

            // Fallback: If injected manager is missing or invalid, try global or dynamic import
            if (!manager || !manager.updateStudentRow) {
                const module = await import('./ListViewManager.js');
                manager = module.ListViewManager;
            }

            if (manager && manager.updateStudentRow) {
                const updated = manager.updateStudentRow(result.id);

                // If the row doesn't exist (returns false), we need to full render to ADD it
                if (!updated && AppreciationsManager) {
                    AppreciationsManager.renderResults(result.id, 'new');
                }
            } else {
                console.warn('[FocusPanelManager] ListViewManager not available for update');
            }
        } catch (e) {
            console.error('[FocusPanelManager] Failed to update list row:', e);
        }
    },



    /**
     * Affiche une prévisualisation du prompt de raffinement
     * @param {string} refineType - Type de raffinement
     * @private
     */
    async _showRefinementPreview(refineType) {
        const appreciationText = document.getElementById('focusAppreciationText');
        if (!appreciationText) return;

        const currentText = appreciationText.textContent?.trim();
        if (!currentText || currentText.includes('Aucune appréciation')) {
            UI.showNotification('Générez d\'abord une appréciation', 'info');
            return;
        }

        const promptText = PromptService.getRefinementPrompt(refineType, currentText);
        await this._displayPromptModal(promptText, 'Prévisualisation du Prompt (Raffinement)');
    },

    /**
     * Helper partagé pour afficher une modale de prévisualisation de prompt
     * @param {string} promptText - Le texte du prompt à afficher
     * @param {string} title - Le titre de la modale
     * @private
     */
    async _displayPromptModal(promptText, title) {
        // Simple HTML reset/escape
        const escapedText = Utils.escapeHtml(promptText);

        // Create HTML content for the modal
        const message = `
            <div style="text-align: left;">
                <textarea readonly class="prompt-preview-textarea" style="
                    width: 100%; 
                    height: 400px; 
                    padding: 12px; 
                    border-radius: var(--radius-sm); 
                    border: 1px solid var(--border-color); 
                    background: var(--bg-secondary); 
                    color: var(--text-primary); 
                    font-family: 'SF Mono', Consolas, monospace; 
                    font-size: 0.85rem; 
                    line-height: 1.5;
                    white-space: pre-wrap;
                    resize: vertical;">${escapedText}</textarea>
            </div>
        `;

        const confirmed = await ModalUI.showCustomConfirm(message, null, null, {
            title: title,
            confirmText: 'Copier',
            cancelText: 'Fermer',
            isDanger: false,
            compact: false
        });

        if (confirmed) {
            try {
                await navigator.clipboard.writeText(promptText);
                UI.showNotification('Prompt copié dans le presse-papier', 'success');
            } catch (err) {
                console.error('Failed to copy: ', err);
                UI.showNotification('Échec de la copie', 'error');
            }
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
        FocusPanelHistory.push(currentText);

        // Find the refine button and show loading
        const btn = document.querySelector(`[data-refine-type="${refineType}"]`);
        if (btn) {
            // Add magic loading state - keeps text visible with animated effects
            btn.classList.add('is-generating');

            // Show pending badge during refinement
            FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });

            // CRITICAL: Register in _activeGenerations to prevent input event from
            // resetting wasGenerated to false during typewriter animation
            const refineStudentId = this.currentStudentId;

            // Cancel any existing generation for this student (restart behavior)
            this._cancelGenerationForStudent(refineStudentId);

            // Create real AbortController for this refinement
            const abortController = new AbortController();
            this._activeGenerations.set(refineStudentId, abortController);
            const signal = abortController.signal;

            try {
                // Use VariationsManager to apply refinement
                const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                if (!result) return;

                // Import VariationsManager dynamically
                const { VariationsManager } = await import('./VariationsManager.js');
                const response = await VariationsManager.applyRefinement(currentText, refineType, signal);

                // Check if aborted
                if (signal.aborted) return;

                if (response && response.text) {
                    const refined = response.text;

                    // CRITICAL: Update result data BEFORE typewriter to prevent input event
                    // from resetting wasGenerated to false during the animation
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

                    // CRITICAL FIX: Update snapshot after refinement to reset dirty state
                    // Refinement uses current data, so the new appreciation is up-to-date
                    result.promptHash = PromptService.getPromptHash({
                        ...result.studentData,
                        id: result.id,
                        currentPeriod: currentPeriod
                    });
                    result.generationPeriod = currentPeriod;

                    // Get current word count (for animation start value)
                    const currentWordCount = Utils.countWords(appreciationText.textContent || '');

                    // Calculate target word count from refined text
                    const targetWordCount = Utils.countWords(refined);

                    // Start word count animation IN PARALLEL with typewriter
                    FocusPanelStatus.updateWordCount(true, currentWordCount, targetWordCount);

                    // Effet typewriter pour afficher le nouveau texte
                    const finalHtml = Utils.decodeHtmlEntities(Utils.cleanMarkdown(refined));
                    await UI.animateHtmlReveal(appreciationText, finalHtml, { speed: 'fast' });

                    // Push refined version to history with source type
                    FocusPanelHistory.push(refined, refineType);

                    // Show done badge after successful refinement
                    FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });

                    // Update AI indicator with new metadata
                    FocusPanelStatus.updateAiIndicator(result);

                    UI.showNotification('Appréciation raffinée !', 'success');
                }
            } catch (error) {
                // Handle abort gracefully (user cancelled)
                // AIService throws "Import annulé par l'utilisateur." when external signal is aborted
                const isAborted = error.name === 'AbortError'
                    || signal.aborted
                    || error.message?.includes('annulé');

                if (isAborted) {
                    UI.showNotification('Amélioration annulée', 'info');
                    // Reset status to previous state
                    FocusPanelStatus.refreshAppreciationStatus();
                    return;
                }

                console.error('Refinement error:', error);
                UI.showNotification(error.message || 'Erreur lors du raffinement', 'error');
                // Show error badge on failure
                const result = appState.generatedResults.find(r => r.id === refineStudentId);
                FocusPanelStatus.updateAppreciationStatus(result, { state: 'error' });
            } finally {
                // Clean up _activeGenerations
                this._activeGenerations.delete(refineStudentId);
                // Remove magic loading state
                btn.classList.remove('is-generating');
            }
        }
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
    }


};
