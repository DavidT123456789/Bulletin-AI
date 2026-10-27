/**
 * @fileoverview Focus Panel Manager - Façade coordinatrice du panneau de détail élève
 * Découpé en sous-modules thématiques (Lot 11 — Découpage God Object #1) :
 * - FocusPanelEvents (`src/managers/focus/FocusPanelEvents.js`)
 * - FocusPanelGrades (`src/managers/focus/FocusPanelGrades.js`)
 * - FocusPanelGenerator (`src/managers/focus/FocusPanelGenerator.js`)
 * @module managers/FocusPanelManager
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { StorageManager } from './StorageManager.js';
import { ListViewManager } from './ListViewManager.js';
import { ClassUIManager } from './ClassUIManager.js';
import { ClassManager } from './ClassManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { FocusPanelHistory } from './FocusPanelHistory.js';
import { FocusPanelJournal } from './FocusPanelJournal.js';
import { FocusPanelAnalysis } from './FocusPanelAnalysis.js';
import { FocusPanelHeader } from './FocusPanelHeader.js';
import { FocusPanelNavigation } from './FocusPanelNavigation.js';
import { FocusPanelStatus } from './FocusPanelStatus.js';
import { ModalUI } from './ModalUIManager.js';
import { HistoryManager } from './HistoryManager.js';
import { FocusPanelRefinement } from './FocusPanelRefinement.js';
import { SpeechSynthesisManager } from './SpeechSynthesisManager.js';
import { SpeechRecognitionManager } from './SpeechRecognitionManager.js';
import { FocusPanelEvents } from './focus/FocusPanelEvents.js';
import { FocusPanelGrades } from './focus/FocusPanelGrades.js';
import { FocusPanelGenerator } from './focus/FocusPanelGenerator.js';

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

    /** Timestamp of latest generation launch to avoid accidental double-click cancellation */
    _activeGenerationStartTime: 0,

    /** Guard flag preventing double-trigger during cancellation */
    _isCancellingGeneration: false,

    /** Flag indicating that the panel is currently closing (to defer DOM writes/layout/stats updates) */
    _isClosing: false,

    /** Set of student IDs/results that have deferred row updates */
    _deferredRowUpdates: new Set(),

    /** Tracks whether appreciation text was modified by user typing */
    _isAppreciationEdited: false,

    /** Tracks initial rendered HTML of appreciation for reliable change detection */
    _initialAppreciationHtml: '',

    /** Tracks whether grade was modified by user input */
    _isGradeEdited: false,

    /** Tracks whether context was modified by user input */
    _isContextEdited: false,

    /** Creation mode flag */
    isCreationMode: false,

    /**
     * Initialise le module avec les références nécessaires
     * @param {Object} appreciationsManager - Référence à AppreciationsManager
     * @param {Object} listViewManager - Référence à ListViewManager
     */
    init(appreciationsManager, listViewManager) {
        AppreciationsManager = appreciationsManager;
        this.appreciationsManager = appreciationsManager;
        this.listViewManager = listViewManager;

        FocusPanelRefinement.init(this, UI);

        FocusPanelHistory.init({
            onContentChange: (content) => {
                FocusPanelStatus.updateWordCount();
                FocusPanelStatus.syncAppreciationToResult(content);
                const textEl = document.getElementById('focusAppreciationText');
                if (textEl) {
                    this._initialAppreciationHtml = textEl.innerHTML;
                    this._isAppreciationEdited = false;
                }
                if (this.currentStudentId) {
                    const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
                    if (result) {
                        FocusPanelStatus.updateSourceIndicator(result);
                        this._updateListRow(result);
                    }
                }
            },
            onHistoryChange: () => {
                FocusPanelStatus.updateHistoryIndicator();
            }
        });

        FocusPanelJournal.init({
            getCurrentStudentId: () => this.currentStudentId,
            onStatusRefresh: () => FocusPanelStatus.refreshAppreciationStatus()
        });

        FocusPanelAnalysis.init({
            getCurrentStudentId: () => this.currentStudentId
        }, AppreciationsManager);

        FocusPanelHeader.init({
            getCurrentStudentId: () => this.currentStudentId,
            setCurrentStudentId: (id) => { this.currentStudentId = id; },
            getIsCreationMode: () => this.isCreationMode,
            setIsCreationMode: (val) => { this.isCreationMode = val; },
            onRefreshStatus: () => FocusPanelStatus.refreshAppreciationStatus(),
            onUpdateListRow: (r) => this._updateListRow(r),
            onRenderTimeline: (d) => this._renderStudentDetailsTimeline(d, true),
            onUpdateNavigation: () => FocusPanelNavigation.updateControls(),
            getHistoryEdits: () => this._newStudentHistory,
            clearHistoryEdits: () => { this._newStudentHistory = null; }
        });

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
            onUpdateActiveRow: (id) => this._updateActiveRow(id),
            updateScrollAffordances: () => this.updateScrollAffordances()
        });

        this._setupEventListeners();
    },

    /**
     * Vérifie si le panel est ouvert
     * @returns {boolean}
     */
    isOpen() {
        const panel = document.getElementById('focusPanel');
        return panel?.classList.contains('open') ?? false;
    },

    /**
     * Met à jour les brumes d'indication de défilement (scrims) en haut/bas et gauche/droite.
     * @param {Element|null} [scrollEl]
     * @param {Element|null} [containerEl]
     */
    updateScrollAffordances(scrollEl, containerEl) {
        const panel = !scrollEl ? document.getElementById('focusPanel') : null;
        const content = scrollEl || panel?.querySelector('.focus-main-page .focus-content');
        const container = containerEl || scrollEl || panel?.querySelector('.focus-main-page');
        if (!content || !container) return;

        if (container.dataset.view === 'plan') {
            container.classList.remove('can-scroll-top', 'can-scroll-bottom', 'can-scroll-left', 'can-scroll-right');
            return;
        }

        const scrollTop = Math.max(0, content.scrollTop);
        const maxScroll = Math.max(0, content.scrollHeight - content.clientHeight);

        container.classList.toggle('can-scroll-top', scrollTop > 4);
        container.classList.toggle('can-scroll-bottom', maxScroll > 4 && (maxScroll - scrollTop) > 4);

        const scrollLeft = Math.max(0, content.scrollLeft);
        const maxScrollX = Math.max(0, content.scrollWidth - content.clientWidth);

        container.classList.toggle('can-scroll-left', scrollLeft > 4);
        container.classList.toggle('can-scroll-right', maxScrollX > 4 && (maxScrollX - scrollLeft) > 4);
    },

    /**
     * Attache de manière idempotente l'écouteur de scroll passif sur un conteneur
     * @param {Element|null} scrollEl
     * @param {Function} [onScroll]
     */
    bindScrollAffordances(scrollEl, onScroll) {
        if (!scrollEl) return;
        if (onScroll) {
            scrollEl._scrollAffordanceCallback = onScroll;
        }
        if (!scrollEl._hasScrollAffordanceListener) {
            scrollEl._hasScrollAffordanceListener = true;
            scrollEl.addEventListener('scroll', () => {
                scrollEl._scrollAffordanceCallback?.();
                this.updateScrollAffordances(scrollEl);
            }, { passive: true });
        }
        this.updateScrollAffordances(scrollEl);
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => this.updateScrollAffordances(scrollEl));
        }
    },

    /**
     * Rafraîchit les données du Focus Panel pour la période actuelle
     */
    refreshPeriod() {
        const openState = typeof this.isOpen === 'function' ? this.isOpen() : Boolean(this.isOpen);
        if (!openState) return;

        const currentPeriod = appState.currentPeriod;

        if (this.isCreationMode) {
            FocusPanelGrades.renderCreationModePeriod(this, currentPeriod);
            return;
        }

        if (!this.currentStudentId) return;

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        SpeechSynthesisManager.cancel();
        FocusPanelHeader.renderStatusBadges(result.studentData?.statuses || []);
        this._renderGradesAndContext(result, currentPeriod);

        const appreciationTitle = document.getElementById('focusAppreciationTitle');
        if (appreciationTitle) {
            const periodLabel = Utils.getPeriodLabel(currentPeriod, false);
            appreciationTitle.textContent = `Appréciation ${periodLabel}`;
        }
        this._renderAppreciationText(result);

        FocusPanelHistory.load(this.currentStudentId);
        FocusPanelStatus.updateHistoryIndicator();
        this._updateGenerateButton(result);
        FocusPanelStatus.updateSourceIndicator(result);
        FocusPanelStatus.updateAppreciationStatus(result, { animate: false });
        FocusPanelJournal.render(result);
        FocusPanelNavigation.updateControls();
        this.updateScrollAffordances();
    },

    /**
     * Ouvre le Focus Panel pour un élève
     * @param {string} studentId - ID de l'élève
     */
    open(studentId) {
        this.isCreationMode = false;
        const result = appState.generatedResults.find(r => r.id === studentId);
        if (!result) return;

        const openState = typeof this.isOpen === 'function' ? this.isOpen() : Boolean(this.isOpen);
        if (openState && this.currentStudentId === studentId) {
            this.refreshPeriod();
            return;
        }

        if (this.currentStudentId && this.currentStudentId !== studentId) {
            SpeechRecognitionManager.abort();
            this._saveContext();
        }

        if (!openState) {
            HistoryManager.pushState('focusPanel', () => {
                this._isClosing = true;
                this.close({ causedByHistory: true });
            });
        }

        this.currentStudentId = studentId;
        this.currentIndex = appState.filteredResults.findIndex(r => r.id === studentId);

        FocusPanelHistory.load(studentId);

        if (!this._activeGenerations.has(studentId)) {
            const generateBtn = document.getElementById('focusGenerateBtn');
            if (generateBtn) {
                UI.hideInlineSpinner(generateBtn);
            }
            FocusPanelStatus.updateAppreciationStatus(null, { state: 'none' });
        }

        this._renderContent(result);
        setTimeout(() => FocusPanelNavigation.updateControls(), 0);

        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');

        if (panel) panel.classList.add('open');
        if (backdrop) backdrop.classList.add('visible');

        const focusContent = panel?.querySelector('.focus-main-page .focus-content');
        if (focusContent) focusContent.scrollTop = 0;
        const focusHeader = panel?.querySelector('.focus-header');
        if (focusHeader) {
            focusHeader.style.removeProperty('--scroll-p');
            focusHeader.classList.remove('scrolled');
        }
        this.updateScrollAffordances();
        this._updateActiveRow(studentId);

        if (panel && !panel.hasAttribute('tabindex')) {
            panel.setAttribute('tabindex', '-1');
        }
        panel?.focus?.({ preventScroll: true });
        if (panel) ModalUI.activateFocusTrap?.(panel);
    },

    /**
     * Ouvre le Focus Panel en mode création (nouvel élève)
     */
    openNew() {
        let currentClass = ClassManager.getCurrentClass();
        if (!currentClass) {
            const classes = ClassManager.getAllClasses();
            if (classes.length === 0) {
                currentClass = ClassManager.createClass('Nouvelle classe');
            } else {
                currentClass = classes[0];
            }
            ClassManager.switchClass(currentClass.id);
            ClassUIManager.updateHeaderDisplay();
            ClassUIManager.renderClassList();
        }

        this.isCreationMode = true;
        this.currentStudentId = null;
        this.currentIndex = -1;

        const currentPeriod = appState.currentPeriod;
        const openState = typeof this.isOpen === 'function' ? this.isOpen() : Boolean(this.isOpen);

        if (!openState) {
            HistoryManager.pushState('focusPanel', () => {
                this._isClosing = true;
                this.close({ causedByHistory: true });
            });
        }

        const dummyResult = {
            id: null,
            nom: '',
            prenom: '',
            studentData: {
                statuses: [],
                periods: { [currentPeriod]: {} }
            },
            appreciation: '',
            isPending: false,
            wasGenerated: false
        };

        this._renderContent(dummyResult);

        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');
        if (panel) panel.classList.add('open');
        if (backdrop) backdrop.classList.add('visible');
        if (panel) ModalUI.activateFocusTrap?.(panel);

        const focusContent = panel?.querySelector('.focus-main-page .focus-content');
        if (focusContent) focusContent.scrollTop = 0;
        this.updateScrollAffordances();

        FocusPanelHeader.toggleEditMode(true);
        this._newStudentHistory = {};
        this._renderStudentDetailsTimeline(null, true);
        FocusPanelHistory.reset();
    },

    /**
     * Ferme le Focus Panel
     * @param {Object} [options={}]
     * @param {boolean} [options.causedByHistory=false]
     */
    close(options = {}) {
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }

        const panel = document.getElementById('focusPanel');
        const backdrop = document.getElementById('focusPanelBackdrop');
        const wasOpen = typeof this.isOpen === 'function' ? this.isOpen() : Boolean(this.isOpen);

        this._resetTransformations(panel, backdrop);
        const analysisPage = document.querySelector('.focus-analysis-page');
        if (analysisPage) this._resetTransformations(analysisPage, null);

        this._isClosing = true;
        const wasCreationMode = this.isCreationMode;

        const header = document.querySelector('.focus-header');
        if (!wasCreationMode && header && header.classList.contains('editing')) {
            FocusPanelHeader.toggleEditMode(false, true);
        } else if (wasCreationMode && header?.classList.contains('editing')) {
            header.classList.remove('editing');
            document.querySelector('.focus-header-read')?.classList.remove('hidden');
            document.querySelector('.focus-header-edit')?.classList.remove('visible');
        }

        SpeechRecognitionManager.abort();

        if (!wasCreationMode) {
            this._saveContext();
        }

        SpeechSynthesisManager.cancel();
        FocusPanelAnalysis.hide();

        if (panel) {
            panel.classList.remove('open');
            ModalUI.deactivateFocusTrap?.(panel);
        }
        if (backdrop) backdrop.classList.remove('visible');
        const focusHeader = panel?.querySelector('.focus-header');
        if (focusHeader) {
            focusHeader.style.removeProperty('--scroll-p');
            focusHeader.classList.remove('scrolled');
        }

        if (this.currentStudentId) {
            const lastActiveRow = document.querySelector(`.student-row[data-student-id="${this.currentStudentId}"]`);
            if (lastActiveRow) {
                if (this._closedFlashTimer) {
                    clearTimeout(this._closedFlashTimer);
                    this._closedFlashTimer = null;
                }
                lastActiveRow.classList.remove('focus-closed-flash', 'highlight-new');
                void lastActiveRow.offsetWidth;
                lastActiveRow.classList.add('focus-closed-flash');
                this._closedFlashTimer = setTimeout(() => {
                    this._closedFlashTimer = null;
                    lastActiveRow.classList.remove('focus-closed-flash');
                }, 1300);
            }
        }

        this._clearActiveRow();

        this.currentStudentId = null;
        this.currentIndex = -1;
        this.isCreationMode = false;

        if (wasOpen && !options.causedByHistory) {
            HistoryManager.handleManualClose('focusPanel');
        }

        if (wasOpen) {
            window.dispatchEvent(new CustomEvent('student-updated'));
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

    /** @private */
    _updateActiveRow(studentId) {
        this._clearActiveRow();
        if (studentId) {
            const row = document.querySelector(`.student-row[data-student-id="${studentId}"]`);
            if (row) {
                row.classList.remove('focus-closed-flash', 'highlight-new');
                row.classList.add('focus-active');
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    },

    /** @private */
    _clearActiveRow() {
        document.querySelectorAll('.student-row.focus-active').forEach(row => {
            row.classList.remove('focus-active');
        });
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
     * Rend le contenu du Focus Panel
     * @param {Object} result - Données de l'élève
     * @private
     */
    _renderContent(result) {
        SpeechSynthesisManager.cancel();
        this._resetCopyFeedback();

        const refinementOptions = document.getElementById('focusRefinementOptions');
        if (refinementOptions) {
            refinementOptions.querySelectorAll('[data-refine-type]').forEach(btn => {
                btn.classList.remove('is-generating');
            });
        }

        const currentPeriod = appState.currentPeriod;
        this._isAppreciationEdited = false;
        this._isGradeEdited = false;
        this._isContextEdited = false;

        const avatarContainer = document.getElementById('focusAvatarContainer');
        if (avatarContainer) {
            avatarContainer.innerHTML = StudentPhotoManager.getAvatarHTML(result, 'lg');
            avatarContainer.classList.add('focus-panel-avatar-container');
            avatarContainer.dataset.studentId = result.id || '';
        }

        FocusPanelHeader.updateHeaderName(result);
        FocusPanelHeader.renderStatusBadges(result.studentData.statuses || []);
        this._renderGradesAndContext(result, currentPeriod);

        const appreciationTitle = document.getElementById('focusAppreciationTitle');
        if (appreciationTitle) {
            const periodLabel = Utils.getPeriodLabel(currentPeriod, false);
            appreciationTitle.textContent = `Appréciation ${periodLabel}`;
        }
        this._renderAppreciationText(result);
        this._updateGenerateButton(result);
        FocusPanelStatus.updateSourceIndicator(result);
        FocusPanelStatus.updateAppreciationStatus(result, { animate: false });
        FocusPanelJournal.render(result);
        FocusPanelStatus.updateHistoryIndicator();
        this.updateScrollAffordances();
    },

    /**
     * Rend la zone de texte de l'appréciation
     * @param {Object} result
     * @private
     */
    _renderAppreciationText(result) {
        if (!result) return;

        const appreciationEl = document.getElementById('focusAppreciationText');
        if (!appreciationEl) return;

        const currentPeriod = appState.currentPeriod;
        const isGenerating = this._activeGenerations.has(result.id);

        if (isGenerating) {
            this._showAppreciationSkeleton();
            FocusPanelStatus.updateAppreciationStatus(null, { state: 'pending' });
            const generateBtn = document.getElementById('focusGenerateBtn');
            if (generateBtn) UI.showInlineSpinner(generateBtn);
        } else if (result.errorMessage && result.errorPeriod === currentPeriod) {
            const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;
            if (periodAppreciation && periodAppreciation.trim()) {
                appreciationEl.innerHTML = Utils.cleanMarkdown(periodAppreciation);
                appreciationEl.classList.remove('empty');
                appreciationEl.classList.add('filled');
            } else {
                appreciationEl.textContent = '';
                appreciationEl.classList.add('empty');
                appreciationEl.classList.remove('filled');
            }
            FocusPanelStatus.updateAppreciationStatus(result, { state: 'error', tooltip: result.errorMessage });
        } else {
            const periodAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation;
            if (periodAppreciation && periodAppreciation.trim()) {
                appreciationEl.innerHTML = Utils.cleanMarkdown(periodAppreciation);
                appreciationEl.classList.remove('empty');
                appreciationEl.classList.add('filled');
            } else {
                appreciationEl.textContent = '';
                appreciationEl.classList.add('empty');
                appreciationEl.classList.remove('filled');
            }
        }
        this._initialAppreciationHtml = appreciationEl.innerHTML;
        this._initialAppreciationText = appreciationEl.textContent?.trim() || '';
        this._isAppreciationEdited = false;
        FocusPanelStatus.updateWordCount();
    },

    /**
     * Sauvegarde publique du contexte courant (appelée notamment par UIManager avant un changement de période)
     */
    saveCurrentContext() {
        this._saveContext();
    },

    /**
     * Sauvegarde le contexte, la note et l'appréciation édités avant de quitter
     * @private
     */
    _saveContext() {
        if (!this.currentStudentId) return;

        const result = appState.generatedResults.find(r => r.id === this.currentStudentId);
        if (!result) return;

        const currentPeriod = appState.currentPeriod;
        let hasChanged = false;

        if (this._isContextEdited) {
            const contextInput = document.getElementById('focusContextInput');
            if (contextInput) {
                const newContext = contextInput.value.trim();
                const existingContext = result.studentData.periods?.[currentPeriod]?.context ?? '';
                if (newContext !== existingContext) {
                    if (!result.studentData.periods) result.studentData.periods = {};
                    if (!result.studentData.periods[currentPeriod]) result.studentData.periods[currentPeriod] = {};
                    result.studentData.periods[currentPeriod].context = newContext === '' ? undefined : newContext;
                    hasChanged = true;
                }
            }
            this._isContextEdited = false;
        }

        if (this._isGradeEdited) {
            const gradeInput = document.getElementById('focusCurrentGradeInput');
            if (gradeInput) {
                const gradeStr = gradeInput.value.trim().replace(',', '.');
                const newGrade = gradeStr === '' ? null : parseFloat(gradeStr);
                const existingGrade = result.studentData.periods?.[currentPeriod]?.grade ?? null;
                if (newGrade !== existingGrade) {
                    if (!result.studentData.periods) result.studentData.periods = {};
                    if (!result.studentData.periods[currentPeriod]) result.studentData.periods[currentPeriod] = {};
                    result.studentData.periods[currentPeriod].grade = newGrade;
                    hasChanged = true;
                }
            }
            this._isGradeEdited = false;
        }

        const isGeneratingForThisStudent = this._activeGenerations.has(this.currentStudentId);
        const appreciationEl = document.getElementById('focusAppreciationText');

        if (this._isAppreciationEdited && appreciationEl && !isGeneratingForThisStudent) {
            const rawHtml = appreciationEl.innerHTML;
            const isSkeleton = rawHtml.includes('appreciation-skeleton');
            const normalizedText = (appreciationEl.innerText || appreciationEl.textContent || '')
                .replace(/\u00A0/g, ' ')
                .trim();

            if (rawHtml && normalizedText !== '' && !isSkeleton) {
                const periodAlreadyHasContent = !!(result.studentData.periods?.[currentPeriod]?.appreciation?.trim());
                const resultBelongsToCurrentPeriod = result.generationPeriod === currentPeriod;

                if (periodAlreadyHasContent || resultBelongsToCurrentPeriod) {
                    if (rawHtml !== this._initialAppreciationHtml) {
                        result.appreciation = normalizedText;
                        result.copied = false;
                        result.errorMessage = null;
                        result.errorPeriod = null;
                        if (!result.studentData.periods) result.studentData.periods = {};
                        if (!result.studentData.periods[currentPeriod]) result.studentData.periods[currentPeriod] = {};
                        result.studentData.periods[currentPeriod].appreciation = normalizedText;
                        result.isPending = false;
                        this._initialAppreciationHtml = rawHtml;
                        hasChanged = true;
                    }
                }
            } else if (normalizedText === '') {
                const existingAppreciation = result.studentData.periods?.[currentPeriod]?.appreciation || '';
                if (existingAppreciation !== '') {
                    result.appreciation = '';
                    if (result.studentData?.periods?.[currentPeriod]) {
                        result.studentData.periods[currentPeriod].appreciation = '';
                    }
                    this._initialAppreciationHtml = '';
                    hasChanged = true;
                }
            }
            this._isAppreciationEdited = false;
        }

        if (hasChanged) {
            StorageManager.saveAppState();
            UI?.updateStats?.();
            FocusPanelStatus.refreshAppreciationStatus();
        }
    },

    /**
     * Met à jour une ligne dans la vue liste
     * @param {Object} result - Données de l'élève
     * @private
     */
    async _updateListRow(result) {
        if (!result) return;

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
            if (!manager || !manager.updateStudentRow) {
                manager = ListViewManager;
            }

            if (manager && manager.updateStudentRow) {
                const updated = manager.updateStudentRow(result.id);
                if (!updated && AppreciationsManager) {
                    AppreciationsManager.renderResults(result.id, 'new');
                }
            } else {
                console.warn('[FocusPanelManager] ListViewManager not available for update');
            }
        } catch (e) {
            console.error('[FocusPanelManager] Failed to update list row:', e);
        }

        UI?.updateStats?.();
    },

    // --- Délégations vers FocusPanelEvents ---
    _setupEventListeners() { return FocusPanelEvents.setupEventListeners(this); },
    _initCloseGestures() { return FocusPanelEvents.initCloseGestures(this); },
    _resetTransformations(target, backdrop) { return FocusPanelEvents.resetTransformations(target, backdrop); },

    // --- Délégations vers FocusPanelGrades ---
    _autoResizeTextarea(textarea) { return FocusPanelGrades.autoResizeTextarea(this, textarea); },
    _renderStudentDetailsTimeline(studentData, isEditable = false) { return FocusPanelGrades.renderStudentDetailsTimeline(this, studentData, isEditable); },
    _renderGradesAndContext(result, currentPeriod) { return FocusPanelGrades.renderGradesAndContext(this, result, currentPeriod); },

    // --- Délégations vers FocusPanelGenerator ---
    _cancelGenerationForStudent(studentId, options) { return FocusPanelGenerator.cancelGenerationForStudent(this, studentId, options); },
    _showPromptPreview() { return FocusPanelGenerator.showPromptPreview(this); },
    _copyPromptToClipboard() { return FocusPanelGenerator.copyPromptToClipboard(this); },
    _prepareStudentData(studentId, period, result) { return FocusPanelGenerator.prepareStudentData(studentId, period, result); },
    generate() { return FocusPanelGenerator.generate(this); },
    handleExternalGenerationStart(studentId) { return FocusPanelGenerator.handleExternalGenerationStart(this, studentId); },
    handleExternalGenerationComplete(studentId, result, animate = true) { return FocusPanelGenerator.handleExternalGenerationComplete(this, studentId, result, animate); },
    _showAppreciationSkeleton() { return FocusPanelGenerator.showAppreciationSkeleton(); },
    _updateGenerateButton(result) { return FocusPanelGenerator.updateGenerateButton(result); },
    copy() { return FocusPanelGenerator.copy(this); },
    _flashCopyFeedback(stateClass, label) { return FocusPanelGenerator.flashCopyFeedback(this, stateClass, label); },
    _resetCopyFeedback() { return FocusPanelGenerator.resetCopyFeedback(this); },

    // --- Délégations vers FocusPanelRefinement ---
    _showRefinementPreview(refineType) { return FocusPanelRefinement.showPreview(refineType); },
    _displayPromptModal(promptText, title) { return FocusPanelRefinement.displayPromptModal(promptText, title); },
    _refineAppreciation(refineType) { return FocusPanelRefinement.apply(refineType); }
};
