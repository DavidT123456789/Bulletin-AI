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
import { ListViewManager } from './ListViewManager.js';
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
import { FocusPanelRefinement } from './FocusPanelRefinement.js';
import { VariationsManager } from './VariationsManager.js';
import { SettingsModalListeners } from './listeners/SettingsModalListeners.js';
import { SpeechSynthesisManager } from './SpeechSynthesisManager.js';


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

    /** Flag indicating that the panel is currently closing (to defer DOM writes/layout/stats updates) */
    _isClosing: false,

    /** Set of student IDs/results that have deferred row updates */
    _deferredRowUpdates: new Set(),

    /**
     * Initialise le module avec les références nécessaires
     * @param {Object} appreciationsManager - Référence à AppreciationsManager
     * @param {Object} listViewManager - Référence à ListViewManager (injected to avoid circular dependency)
     */
    init(appreciationsManager, listViewManager) {
        AppreciationsManager = appreciationsManager;
        this.listViewManager = listViewManager;

        // Initialize extracted sub-modules
        FocusPanelRefinement.init(this, UI);

        // Initialize History module with callbacks
        FocusPanelHistory.init({
            onContentChange: (content) => {
                FocusPanelStatus.updateWordCount();
                FocusPanelStatus.syncAppreciationToResult(content);
                // CRITICAL FIX: Ensure List View and source indicator update on Undo/Redo
                if (this.currentStudentId) {
                    const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                    if (result) {
                        // appreciationSource already restored by _animateVersionChange before this callback
                        FocusPanelStatus.updateSourceIndicator(result);
                        this._updateListRow(result);
                    }
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

        this._initCloseGestures();

        // DOM elements
        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');
        const backBtn = document.getElementById('focusBackBtn');
        const prevBtn = document.getElementById('focusPrevBtn');
        const nextBtn = document.getElementById('focusNextBtn');
        const analysisPrevBtn = document.getElementById('focusAnalysisPrevBtn');
        const analysisNextBtn = document.getElementById('focusAnalysisNextBtn');
        const generateBtn = document.getElementById('focusGenerateBtn');
        const copyBtn = document.getElementById('focusCopyBtn');

        // Dynamic shadow on scroll: reinforce pill shadow when content scrolls underneath
        const focusContent = panel?.querySelector('.focus-main-page .focus-content');
        const focusHeader = panel?.querySelector('.focus-header');
        if (focusContent && focusHeader) {
            focusContent.addEventListener('scroll', () => {
                focusHeader.classList.toggle('scrolled', focusContent.scrollTop > 8);
            }, { passive: true });
        }

        // Set _isClosing flag on pointerdown (touch/mouse down) to defer synchronous
        // blur events and stats updates, preventing animation stutter on mobile
        const preCloseHandler = () => {
            const header = document.querySelector('.focus-header');
            const isEditing = header?.classList.contains('editing');
            if (!isEditing || this.isCreationMode) {
                this._isClosing = true;
                clearTimeout(this._preCloseTimeout);
                this._preCloseTimeout = setTimeout(() => {
                    this._isClosing = false;
                }, 1000);
            }
        };

        // Close panel
        if (backdrop) {
            backdrop.addEventListener('pointerdown', preCloseHandler);
            backdrop.addEventListener('click', () => this.close());
        }

        // Back button: Cancel edit mode if active, otherwise close panel
        // Special case: In creation mode, always close the panel
        if (backBtn) {
            backBtn.addEventListener('pointerdown', preCloseHandler);
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
        if (analysisPrevBtn) analysisPrevBtn.addEventListener('click', () => FocusPanelNavigation.navigatePrev());
        if (analysisNextBtn) analysisNextBtn.addEventListener('click', () => FocusPanelNavigation.navigateNext());

        // [UX Mobile] Back Button Trap
        // Intercept browser back button to close panel instead of navigating away/closing app
        window.addEventListener('popstate', (e) => {
            // [FIX] Don't close FocusPanel if a Modal is active on top of it
            // The Modal will handle the back button event
            if (ModalUI.activeModal) return;

            if (this.isOpen()) {
                // Set isClosing flag immediately on popstate to ensure any blur events
                // triggered by keyboard closing are deferred
                this._isClosing = true;
                // Close panel without triggering another history.back()
                this.close({ causedByHistory: true });
            }
        });

        // Generate
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generate();
                generateBtn.blur(); // Remove focus after click to prevent sticky focus rings
            });
            // [NEW] Right-click to preview the prompt
            generateBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showPromptPreview();
                generateBtn.blur();
            });
        }

        // Copy
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                this.copy();
                copyBtn.blur(); // Remove focus after click to prevent sticky focus rings when scrolling/navigating
            });
            // [NEW] Right-click to copy the prompt directly (symmetric with Generate button)
            copyBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._copyPromptToClipboard();
                copyBtn.blur();
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
                // Debounce UI updates to prevent typing lag
                clearTimeout(this._uiUpdateTimeout);
                this._uiUpdateTimeout = setTimeout(() => {
                    // Refresh Status (Badge) - This dispatch event for List View update
                    FocusPanelStatus.refreshAppreciationStatus();
                    // Note: We deliberately update the model LIVE so ListViewManager._isResultDirty sees changes immediately
                    // LIVE UPDATE: Update the List View row immediately to show/hide dirty indicator
                    this._updateListRow(result);
                }, 300);
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
                if (btn && !btn.classList.contains('disabled')) {
                    this._refineAppreciation(btn.dataset.refineType);
                    btn.blur(); // Remove focus after click to prevent sticky focus rings
                }
            });

            // [NEW] Right-click to preview the refinement prompt
            refinementOptions.addEventListener('contextmenu', (e) => {
                const btn = e.target.closest('[data-refine-type]');
                if (btn) {
                    e.preventDefault();
                    this._showRefinementPreview(btn.dataset.refineType);
                    btn.blur();
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
                        // Universal Rule: User Input = Manual Ownership
                        // Transitions from AI, Imported, Empty, or Legacy states to 'manual'
                        if (result.appreciationSource !== 'manual' || result.wasGenerated === true) {
                            result.appreciationSource = 'manual';
                            result.wasGenerated = false;
                        }

                        // Ensure baseline for dirty detection (if missing or just created)
                        if (!result.promptHash) {
                            result.promptHash = PromptService.getPromptHash({
                                ...result.studentData,
                                id: result.id,
                                currentPeriod: appState.currentPeriod
                            });
                            result.generationPeriod = appState.currentPeriod;
                        }

                        result.appreciation = content;
                        if (result.studentData?.periods?.[appState.currentPeriod]) {
                            result.studentData.periods[appState.currentPeriod].appreciation = content;
                        }
                    } else {
                        result.appreciation = '';
                        if (result.studentData?.periods?.[appState.currentPeriod]) {
                            result.studentData.periods[appState.currentPeriod].appreciation = '';
                        }
                    }

                    // Debounce UI updates to prevent typing lag
                    clearTimeout(this._appreciationUITimeout);
                    this._appreciationUITimeout = setTimeout(() => {
                        FocusPanelStatus.updateSourceIndicator(result);
                        FocusPanelStatus.updateAppreciationStatus(result);
                        this._updateListRow(result);
                    }, 300);
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
                // Note: state is updated live in handleDataChange. 
                // Saving to localStorage on every keystroke causes severe UI lag, moved to blur.
            });
            contextInput.addEventListener('blur', () => {
                this._saveContext();
                FocusPanelStatus.refreshAppreciationStatus();
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
                SettingsModalListeners._updateStudentContextAndPrompt();

                // 3. Use centralized highlight utility for length slider
                UI.highlightSettingsElement('iaLengthSlider', { tab: 'templates' });
            });
        }

        // Journal listeners are now handled by FocusPanelJournal module
    },

    /**
     * Initialise les gestures natives iOS pour fermer le panneau ("Edge Swipe" et "Pull-to-Dismiss")
     * @private
     */
    _initCloseGestures() {
        const panel = document.getElementById('focusPanel');
        if (!panel) return;

        let touchStartX = null;
        let touchStartY = null;
        let currentX = 0;
        let currentY = 0;
        let isEdgeSwiping = false;
        let isPullingDown = false;
        let contentEl = null;

        panel.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;

            // Ignorer si on interagit avec des inputs spécifiques
            if (e.target.closest('input[type="range"]') || e.target.closest('textarea')) return;

            // En mode édition, bloquer la gestuelle pour éviter la perte de brouillon
            const header = document.querySelector('.focus-header');
            if (header && header.classList.contains('editing')) return;

            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            currentX = 0;
            currentY = 0;

            const isAnalysisVisible = document.getElementById('focusPagesContainer')?.classList.contains('show-analysis');

            // 1. Edge Swipe: Le doigt démarre tout au bord gauche (< 30px)
            isEdgeSwiping = touchStartX < 30;
            isPullingDown = false;

            contentEl = isAnalysisVisible
                ? panel.querySelector('.focus-analysis-content-area')
                : panel.querySelector('.focus-main-page .focus-content');

            // 2. Pull-to-Dismiss
            if (!isEdgeSwiping && contentEl && contentEl.scrollTop <= 0) {
                let currentHeaderRect = null;
                if (isAnalysisVisible) {
                    const analysisHeader = panel.querySelector('.focus-analysis-header');
                    currentHeaderRect = analysisHeader ? analysisHeader.getBoundingClientRect() : null;
                } else {
                    currentHeaderRect = header ? header.getBoundingClientRect() : null;
                }

                if (currentHeaderRect && touchStartY <= currentHeaderRect.bottom + 40) {
                    isPullingDown = true; // Détecté
                }
            }

            if (isEdgeSwiping || isPullingDown) {
                const target = isAnalysisVisible ? document.querySelector('.focus-analysis-page') : panel;
                if (target) {
                    target.style.transition = 'none';
                    target.style.willChange = 'transform';
                }
            }
        }, { passive: true });

        panel.addEventListener('touchmove', (e) => {
            if (touchStartX === null || touchStartY === null) return;

            currentX = e.touches[0].clientX - touchStartX;
            currentY = e.touches[0].clientY - touchStartY;

            const isAnalysisVisible = document.getElementById('focusPagesContainer')?.classList.contains('show-analysis');
            const target = isAnalysisVisible ? document.querySelector('.focus-analysis-page') : panel;
            if (!target) return;

            if (isEdgeSwiping) {
                if (currentX > 0) {
                    if (e.cancelable) e.preventDefault();

                    if (isAnalysisVisible) {
                        target.style.transform = `translateX(${currentX}px)`;
                    } else {
                        const progress = Math.min(currentX / window.innerWidth, 1);
                        target.style.transform = `translateX(${currentX}px)`;
                        const backdrop = document.getElementById('focusPanelBackdrop');
                        if (backdrop) backdrop.style.opacity = (1 - progress).toString();
                    }
                }
            }
            else if (isPullingDown && currentY > 0) {
                if (currentY > Math.abs(currentX)) {
                    if (e.cancelable) e.preventDefault();
                    const resistance = currentY * 0.45;
                    target.style.transform = `translateY(${resistance}px)`;
                } else {
                    isPullingDown = false;
                    target.style.transition = '';
                    target.style.transform = '';
                }
            }
        }, { passive: false });

        panel.addEventListener('touchend', (e) => {
            if (touchStartX === null || touchStartY === null) return;

            const isAnalysisVisible = document.getElementById('focusPagesContainer')?.classList.contains('show-analysis');
            const target = isAnalysisVisible ? document.querySelector('.focus-analysis-page') : panel;

            if (!target) return;

            if (isEdgeSwiping) {
                const threshold = window.innerWidth * 0.3;
                const velocity = currentX / (e.timeStamp || 1);

                if (currentX > threshold || velocity > 1.5) {
                    // => Fermeture validée
                    this._isClosing = true;
                    target.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateX(100%)';

                    if (isAnalysisVisible) {
                        setTimeout(() => {
                            FocusPanelAnalysis.hide();
                            this._resetTransformations(target, null);
                        }, 300);
                    } else {
                        const backdrop = document.getElementById('focusPanelBackdrop');
                        if (backdrop) {
                            backdrop.style.transition = 'opacity 0.3s ease';
                            backdrop.style.opacity = '0';
                        }
                        setTimeout(() => {
                            target.style.transition = 'none';
                            this.close();
                            this._resetTransformations(target, backdrop);
                        }, 300);
                    }
                } else {
                    // => Rebond (Annulation)
                    target.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateX(0)';

                    if (!isAnalysisVisible) {
                        const backdrop = document.getElementById('focusPanelBackdrop');
                        if (backdrop) {
                            backdrop.style.transition = 'opacity 0.45s ease';
                            backdrop.style.opacity = '1';
                            setTimeout(() => this._resetTransformations(target, backdrop), 450);
                        } else {
                            setTimeout(() => this._resetTransformations(target, null), 450);
                        }
                    } else {
                        setTimeout(() => this._resetTransformations(target, null), 450);
                    }
                }
            }
            else if (isPullingDown) {
                const threshold = 100; // 100px pour fermer via pull down
                if (currentY > threshold) {
                    // => Fermeture validée vers le bas
                    this._isClosing = true;
                    target.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = `translateY(100vh)`;

                    if (isAnalysisVisible) {
                        setTimeout(() => {
                            FocusPanelAnalysis.hide();
                            this._resetTransformations(target, null);
                        }, 300);
                    } else {
                        setTimeout(() => {
                            target.style.transition = 'none';
                            this.close();
                            this._resetTransformations(target, null);
                        }, 300);
                    }
                } else {
                    // => Rebond (Annulation)
                    target.style.transition = 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';
                    target.style.transform = 'translateX(0) translateY(0)';
                    setTimeout(() => this._resetTransformations(target, null), 450);
                }
            }

            touchStartX = null;
            touchStartY = null;
            currentX = 0;
            currentY = 0;
            isEdgeSwiping = false;
            isPullingDown = false;
        }, { passive: true });
    },

    /**
     * Helper pour nettoyer les transformations en ligne après un drag
     * @private
     */
    _resetTransformations(target, backdrop) {
        if (target) {
            target.style.transition = '';
            target.style.transform = '';
            target.style.willChange = '';
        }
        if (backdrop) {
            backdrop.style.transition = '';
            backdrop.style.opacity = '';
        }
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

        // Mark as closing to defer layout/paint-heavy list and stats updates
        this._isClosing = true;

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
        }

        // Save context and identity changes before closing (NOT in creation mode)
        if (!wasCreationMode) {
            this._saveContext();
        }

        // Cancel speech synthesis if active
        SpeechSynthesisManager.cancel();

        // Cancel any in-progress generation
        if (this.currentStudentId) this._cancelGenerationForStudent(this.currentStudentId);

        // ALWAYS hide analysis page on close to reset view and inert states
        FocusPanelAnalysis.hide();

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

        if (wasOpen) {
            // Defer processing of row updates and stats updates until after the close transition
            setTimeout(() => {
                this._isClosing = false;
                if (this._deferredRowUpdates && this._deferredRowUpdates.size > 0) {
                    this._deferredRowUpdates.forEach(deferredResult => {
                        this._updateListRow(deferredResult);
                    });
                    this._deferredRowUpdates.clear();
                }
            }, 500);
        } else {
            this._isClosing = false;
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
                                    value="${Utils.escapeHtml(grade)}" 
                                    placeholder="--" style="width:50px; text-align:center; padding:4px; border:1px solid var(--border-color); border-radius:4px; background: var(--bg-primary);">
                            </div>
                        </div>
                        <textarea class="history-appreciation-input-creation" data-period="${periodKey}"
                            placeholder="Saisissez l'appréciation pour le trimestre ${shortPeriod}..." 
                            style="width:100%; min-height:80px; padding:8px; border:1px solid var(--border-color); border-radius:4px; font-size:0.9rem; resize:vertical; background: var(--bg-primary); line-height: 1.5;">${Utils.escapeHtml(appreciation)}</textarea>
                    </div>
                `;
            } else {
                // --- READ-ONLY TEMPLATE ---
                item.innerHTML = `
                    <div class="timeline-compact-badge">${shortPeriod}</div>
                    <div class="timeline-compact-content">
                        <div class="timeline-compact-header">
                            <span>Moyenne : ${Utils.escapeHtml(grade)}</span>
                        </div>
                        ${appreciation ? `<div class="timeline-compact-appreciation">"${Utils.escapeHtml(appreciation)}"</div>` : ''}
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
        
        // Defensively blur any focused elements with a slight delay
        // to counter browser popstate focus restoration quirks.
        setTimeout(() => {
            document.querySelectorAll('.student-row:focus').forEach(row => {
                row.blur();
            });
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
        }, 50);
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
                const icon = copyBtn.querySelector('iconify-icon');
                const originalIcon = icon?.getAttribute('icon');

                // Clear any existing copy success animation timeout
                if (copyBtn.dataset.copyTimeout) {
                    clearTimeout(parseInt(copyBtn.dataset.copyTimeout));
                }

                // Change to check icon and add 'copied-prompt' class
                if (icon) icon.setAttribute('icon', 'ph:check-bold');
                copyBtn.classList.add('copied-prompt');

                // Reset after delay
                const timeoutId = setTimeout(() => {
                    if (icon && originalIcon) icon.setAttribute('icon', originalIcon);
                    copyBtn.classList.remove('copied-prompt');
                    delete copyBtn.dataset.copyTimeout;
                }, 1500);
                copyBtn.dataset.copyTimeout = timeoutId.toString();
            }

            UI.showNotification('Prompt copié dans le presse-papier', 'prompt');
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
        const gradeInput = document.getElementById('focusCurrentGradeInput');
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
                wasGenerated: true,
                appreciationSource: 'ai',
                tokenUsage: newResult.tokenUsage
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
                    // Render appreciation text area normally (will show empty/previous) and update badge/tooltip
                    this._renderAppreciationText(result);
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

                        const htmlHtml = Utils.decodeHtmlEntities(Utils.cleanMarkdown(newResult.appreciation));
                        await UI.animateHtmlReveal(appreciationEl, htmlHtml, { speed: 'fast' });
                    }

                    // Réinitialiser l'historique - la régénération est un nouveau départ
                    // L'"Original" sera la nouvelle génération IA
                    // CRITICAL: Use captured generatingForPeriod, not appState.currentPeriod
                    // (user may have switched periods during async generation)
                    if (!result.historyPerPeriod) result.historyPerPeriod = {};
                    result.historyPerPeriod[generatingForPeriod] = null;
                    FocusPanelHistory.load(generatingForStudentId); // Re-init with fresh state
                    FocusPanelHistory.push(newResult.appreciation, 'original');

                    // Show done badge
                    FocusPanelStatus.updateAppreciationStatus(result, { state: 'generated' });

                    // Update AI indicator with new metadata
                    FocusPanelStatus.updateSourceIndicator(result);

                    // Update button to "Régénérer" state
                    this._updateGenerateButton(result);
                } else {
                    // User navigated away — this is their only feedback
                    UI.showNotification(`Appréciation générée pour ${result.prenom}`, 'info');
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

            // Persist error in the model so it appears in the table and dashboard
            result.errorMessage = error.message;
            result.errorPeriod = generatingForPeriod;

            // Only show error in panel if still on the same student
            if (this.currentStudentId === generatingForStudentId) {
                UI.showNotification(`Erreur : ${error.message}`, 'error');

                // Render normal text (empty or manual) and show error status badge with tooltip
                this._renderAppreciationText(result);
            }

            // Update list row to show error badge
            this._updateListRow(result);
            StorageManager.saveAppState();
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
                        this._updateGenerateButton(result);
                    }
                }

                // ALWAYS refresh header dashboard counts (error badge, validated count, smart button)
                // regardless of which student is currently viewed
                UI.updateControlButtons();
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
        generateBtn.classList.remove('btn-ai', 'btn-ai-outline', 'btn-regenerate-warning', 'btn-neutral', 'btn-warning');

        // NEW UX LOGIC:
        // - Bold style (btn-ai) = ACTION NEEDED → "Générer" first time
        // - Warning style = ACTION RECOMMENDED → "Mettre à jour" when data changed  
        // - Neutral style = OPTIONAL → "Régénérer" when already up to date

        if (!hasAppreciation) {
            // STATE 1: No appreciation yet → Bold primary style (action needed)
            generateBtn.classList.add('btn-ai');
            generateBtn.innerHTML = `<iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> Générer <span id="focusGeneratePeriod">${periodLabel}</span>`;
        } else if (isDirty) {
            // STATE 2: Data modified since generation → Warning style (action recommended)
            generateBtn.classList.add('btn-warning');
            generateBtn.innerHTML = `<iconify-icon icon="solar:refresh-bold"></iconify-icon> Mettre à jour`;
        } else if (isRegenerate) {
            // STATE 3: Already generated and up to date → Neutral style (optional)
            generateBtn.classList.add('btn-neutral');
            generateBtn.innerHTML = `<iconify-icon icon="solar:refresh-bold"></iconify-icon> Régénérer`;
        } else {
            // Fallback: Has appreciation but not AI-generated (manual) → Neutral
            generateBtn.classList.add('btn-neutral');
            generateBtn.innerHTML = `<iconify-icon icon="solar:magic-stick-3-bold-duotone"></iconify-icon> Générer <span id="focusGeneratePeriod">${periodLabel}</span>`;
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
                const icon = copyBtn.querySelector('iconify-icon');
                const originalIcon = icon?.getAttribute('icon');

                // Clear any existing copy success animation timeout
                if (copyBtn.dataset.copyTimeout) {
                    clearTimeout(parseInt(copyBtn.dataset.copyTimeout));
                }

                // Change to check icon and add 'copied' class
                if (icon) icon.setAttribute('icon', 'ph:check-bold');
                copyBtn.classList.add('copied');

                // Reset after delay
                const timeoutId = setTimeout(() => {
                    if (icon && originalIcon) icon.setAttribute('icon', originalIcon);
                    copyBtn.classList.remove('copied');
                    delete copyBtn.dataset.copyTimeout;
                }, 1500);
                copyBtn.dataset.copyTimeout = timeoutId.toString();
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
        // Cancel speech synthesis when switching students
        SpeechSynthesisManager.cancel();

        // Reset Copy Button success animation and checkmark icon to prevent bleed when switching students
        const copyBtn = document.getElementById('focusCopyBtn');
        if (copyBtn) {
            if (copyBtn.dataset.copyTimeout) {
                clearTimeout(parseInt(copyBtn.dataset.copyTimeout));
                delete copyBtn.dataset.copyTimeout;
            }
            copyBtn.classList.remove('copied');
            const icon = copyBtn.querySelector('iconify-icon');
            if (icon) {
                icon.setAttribute('icon', 'solar:copy-linear');
            }
        }

        // Reset Refinement Buttons loading states to prevent bleed when switching students
        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            refinementOptions.querySelectorAll('[data-refine-type]').forEach(btn => {
                btn.classList.remove('is-generating');
            });
        }

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
            nameEl.innerHTML = `
                <span class="focus-name-details">
                    <span class="focus-name-nom">${Utils.escapeHtml(result.nom).toUpperCase()}</span>
                    <span class="focus-name-prenom">${Utils.escapeHtml(result.prenom)}</span>
                </span>
                <iconify-icon icon="solar:pen-bold" class="focus-name-edit-icon"></iconify-icon>
            `;
        }

        // === 2. HEADER: Status Badges ===
        FocusPanelHeader.renderStatusBadges(result.studentData.statuses || []);

        // === 3. CONTEXT CARD: Previous Grades ===
        const prevGradesEl = document.getElementById('focusPreviousGrades');
        const getEvolutionHtml = (gradeA, gradeB) => {
            if (gradeA === null || gradeA === undefined || gradeA === '' ||
                gradeB === null || gradeB === undefined || gradeB === '') {
                return '';
            }
            const valA = parseFloat(gradeA);
            const valB = parseFloat(gradeB);
            if (isNaN(valA) || isNaN(valB)) return '';

            const diff = valB - valA;
            const diffText = diff >= 0 ? `+${diff.toFixed(1).replace('.', ',')}` : diff.toFixed(1).replace('.', ',');
            const evoType = Utils.getEvolutionType(diff);

            let arrowIcon = 'ph:arrow-right-bold';
            let evoClass = 'stable';
            if (['very-positive', 'positive'].includes(evoType)) {
                arrowIcon = 'ph:trend-up-bold';
                evoClass = 'positive';
            } else if (diff < 0) {
                arrowIcon = 'ph:trend-down-bold';
                evoClass = 'negative';
            }

            return `<span class="grade-evolution ${evoClass} tooltip" data-tooltip="${diffText} pts"><iconify-icon icon="${arrowIcon}"></iconify-icon></span>`;
        };

        const getTooltipText = (period, gradeVal, evalCount, isCurrent = false) => {
            const periodLabel = Utils.getPeriodLabel(period, true);
            const displayGrade = (gradeVal !== undefined && gradeVal !== null && gradeVal !== '')
                ? parseFloat(gradeVal).toFixed(1).replace('.', ',')
                : '--';
            const suffix = isCurrent ? ' (Période actuelle)' : '';
            let tooltip = `${periodLabel}${suffix} : ${displayGrade}`;
            if (typeof evalCount === 'number') {
                tooltip += ` (Moyenne sur ${evalCount} évaluation${evalCount > 1 ? 's' : ''})`;
            }
            return tooltip;
        };

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

                const gradeClass = (grade !== undefined && grade !== null && grade !== '')
                    ? Utils.getGradeClass(parseFloat(grade))
                    : '';

                // Add tooltip showing period info and evaluation count if available
                const tooltipText = getTooltipText(period, grade, evalCount, false);
                chip.classList.add('tooltip');
                chip.setAttribute('data-tooltip', tooltipText);

                chip.innerHTML = `<span class="prev-grade-value grade-value ${gradeClass}">${displayGrade}</span>`;
                prevGradesEl.appendChild(chip);

                // Add evolution arrow between this past grade and the next grade (or current input)
                const nextPeriod = periods[idx + 1];
                if (nextPeriod) {
                    let nextGrade = null;
                    if (nextPeriod === currentPeriod) {
                        const currentGradeVal = result.studentData.periods?.[currentPeriod]?.grade;
                        nextGrade = (currentGradeVal !== undefined && currentGradeVal !== null && currentGradeVal !== '')
                            ? parseFloat(currentGradeVal)
                            : null;
                    } else {
                        const nextPeriodData = result.studentData.periods?.[nextPeriod] || {};
                        nextGrade = (nextPeriodData.grade !== undefined && nextPeriodData.grade !== null && nextPeriodData.grade !== '')
                            ? parseFloat(nextPeriodData.grade)
                            : null;
                    }

                    const pastGradeNum = (grade !== undefined && grade !== null && grade !== '') ? parseFloat(grade) : null;
                    const evoHtml = getEvolutionHtml(pastGradeNum, nextGrade);

                    const evoEl = document.createElement('span');
                    evoEl.className = 'evolution-container-inline';
                    if (nextPeriod === currentPeriod) {
                        evoEl.id = 'focusCurrentEvolutionArrow';
                    }
                    evoEl.innerHTML = evoHtml;
                    prevGradesEl.appendChild(evoEl);
                }
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

            const initialGradeClass = (currentGrade !== undefined && currentGrade !== null)
                ? Utils.getGradeClass(currentGrade)
                : '';
            gradeInput.className = `context-grade-input grade-value ${initialGradeClass}`;

            // Add tooltip showing current period details and evaluation count if available
            const gradeWrapper = gradeInput.closest('.grade-input-wrapper') || gradeInput.parentElement;
            if (gradeWrapper) {
                gradeWrapper.classList.add('tooltip');
                gradeWrapper.setAttribute('data-tooltip', getTooltipText(currentPeriod, currentGrade, evalCount, true));
            }

            // Add input listener for grade changes
            gradeInput.oninput = () => {
                const val = gradeInput.value.replace(',', '.');
                const grade = parseFloat(val);
                
                // Reset to default class
                gradeInput.className = 'context-grade-input grade-value';
                
                let gradeToSave = null;
                if (!isNaN(grade)) {
                    const gradeClass = Utils.getGradeClass(grade);
                    if (gradeClass) {
                        gradeInput.classList.add(gradeClass);
                    }
                    gradeToSave = grade;
                }
                
                if (this.currentStudentId) {
                    const r = appState.generatedResults.find(r => r.id === this.currentStudentId);
                    if (r) {
                        if (!r.studentData.periods[currentPeriod]) {
                            r.studentData.periods[currentPeriod] = {};
                        }
                        r.studentData.periods[currentPeriod].grade = gradeToSave;
                        FocusPanelStatus.checkIfDataModified();
                        
                        // Update current evolution arrow live
                        const arrowEl = document.getElementById('focusCurrentEvolutionArrow');
                        if (arrowEl) {
                            const periods = Utils.getPeriods();
                            const currentIdx = periods.indexOf(currentPeriod);
                            if (currentIdx > 0) {
                                const prevPeriod = periods[currentIdx - 1];
                                const prevGradeVal = r.studentData.periods?.[prevPeriod]?.grade;
                                const prevGradeNum = (prevGradeVal !== undefined && prevGradeVal !== null && prevGradeVal !== '')
                                    ? parseFloat(prevGradeVal)
                                    : null;
                                
                                arrowEl.innerHTML = getEvolutionHtml(prevGradeNum, gradeToSave);
                            }
                        }

                        // Update current period tooltip live
                        if (gradeWrapper) {
                            TooltipsUI.updateTooltip(gradeWrapper, getTooltipText(currentPeriod, gradeToSave, evalCount, true));
                        }
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
        FocusPanelStatus.updateSourceIndicator(result);

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

            hasAppreciation = false;
        } else if (result.errorMessage && result.errorPeriod === currentPeriod) {
            // Error state for current period — do not overwrite textarea with error text
            const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;

            if (periodAppreciation && periodAppreciation.trim()) {
                appreciationEl.innerHTML = Utils.decodeHtmlEntities(Utils.cleanMarkdown(periodAppreciation));
                appreciationEl.classList.remove('empty');
                appreciationEl.classList.add('filled');
                hasAppreciation = true;
            } else {
                appreciationEl.textContent = '';
                appreciationEl.classList.add('empty');
                appreciationEl.classList.remove('filled');
                hasAppreciation = false;
            }
            FocusPanelStatus.updateAppreciationStatus(result, { state: 'error', tooltip: result.errorMessage });
        } else {
            // Normal rendering: Get appreciation for the CURRENT period specifically
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

        const currentPeriod = appState.currentPeriod;

        const contextInput = document.getElementById('focusContextInput');
        if (contextInput) {
            if (!result.studentData.periods[currentPeriod]) {
                result.studentData.periods[currentPeriod] = {};
            }
            result.studentData.periods[currentPeriod].context = contextInput.value.trim();
        }

        // Save grade
        const gradeInput = document.getElementById('focusCurrentGradeInput');
        if (gradeInput) {
            const gradeStr = gradeInput.value.trim().replace(',', '.');
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
            const isSkeleton = content.includes('appreciation-skeleton');
            const textContent = appreciationEl.textContent.trim();

            if (content && textContent !== '' && !isSkeleton) {
                // PERIOD GUARD: Only save DOM content into the current period if it genuinely
                // belongs to it. This prevents S1 appreciation (still in result.appreciation)
                // from being written into periods['S2'] when the user merely opens/closes the panel.
                // Content belongs to the current period if:
                //   (a) periods[currentPeriod] already has an appreciation (user typed or generated here), OR
                //   (b) result.generationPeriod matches (this result was generated for this period)
                const periodAlreadyHasContent = !!(result.studentData.periods?.[currentPeriod]?.appreciation?.trim());
                const resultBelongsToCurrentPeriod = result.generationPeriod === currentPeriod;

                if (periodAlreadyHasContent || resultBelongsToCurrentPeriod) {
                    result.appreciation = content;
                    result.copied = false;
                    if (!result.studentData.periods[currentPeriod]) {
                        result.studentData.periods[currentPeriod] = {};
                    }
                    result.studentData.periods[currentPeriod].appreciation = content;
                    result.isPending = false;
                }
            } else if (textContent === '') {
                // User explicitly cleared the appreciation
                result.appreciation = '';
                if (result.studentData.periods[currentPeriod]) {
                    result.studentData.periods[currentPeriod].appreciation = '';
                }
            }
        }

        // Persist to storage
        StorageManager.saveAppState();

        // Refresh header stats (avgWordsChip) after any context/text/grade change
        UI?.updateStats?.();

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

        // Sync with appState.filteredResults
        const filteredIndex = appState.filteredResults?.findIndex(r => r.id === result.id);
        if (filteredIndex > -1) {
            appState.filteredResults[filteredIndex] = {
                ...result,
                appreciation: result.studentData?.periods?.[appState.currentPeriod]?.appreciation || result.appreciation,
                isPending: result.isPending
            };
        }

        if (this._isClosing) {
            if (!this._deferredRowUpdates) {
                this._deferredRowUpdates = new Set();
            }
            this._deferredRowUpdates.add(result);
            return;
        }

        try {
            let manager = this.listViewManager;

            // Fallback: If injected manager is missing or invalid, try global or static import
            if (!manager || !manager.updateStudentRow) {
                manager = ListViewManager;
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

        // Centralized stats refresh — single source of truth for all Focus Panel mutations
        // (generate, refine, manual edit, speech input, etc.)
        UI?.updateStats?.();
    },



    // Refinement functions delegated to FocusPanelRefinement
    _showRefinementPreview(refineType) { return FocusPanelRefinement.showPreview(refineType); },
    _displayPromptModal(promptText, title) { return FocusPanelRefinement.displayPromptModal(promptText, title); },
    _refineAppreciation(refineType) { return FocusPanelRefinement.apply(refineType); }
};
