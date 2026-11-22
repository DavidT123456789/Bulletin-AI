/**
 * @fileoverview Manager for Class Dashboard - Analytics & AI Synthesis
 * @module managers/ClassDashboardManager
 * Provides comprehensive class analytics with calculated statistics and AI synthesis
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { DOMHelper } from '../utils/DOMHelper.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { PromptService } from '../services/PromptService.js';
import { StatsService } from '../services/StatsService.js';
import { StatsUI } from './StatsUIManager.js';
import { StorageManager } from './StorageManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { ClassManager } from './ClassManager.js';
import { FocusPanelRefinement } from './FocusPanelRefinement.js';
import { JournalManager } from './JournalManager.js';
import { ExportManager } from './ExportManager.js';
import { getPreviousPeriod, GRADE_BRACKETS } from '../config/academicConstants.js';
import * as HistoryUtils from '../utils/HistoryUtils.js';
import * as HistoryPopoverUI from '../utils/HistoryPopoverUI.js';

const DEFAULT_HIGHLIGHT_LIMIT = 5;
const SYNTHESIS_HISTORY_POPOVER_ID = 'synthesisHistoryPopover';
const SYNTHESIS_HISTORY_KEY = 'synthesisHistoryPopover';
const INTRO_EDIT_DEBOUNCE_MS = 450;

/**
 * Configuration déclarative des 3 cartes de liste de la synthèse de classe (SSOT rendu/édition)
 * @type {Array<{key: 'strengths'|'vigilances'|'recommendations', title: string, icon: string, color: string, emptyIcon: string, addTooltip: string, emptyText: string}>}
 */
const SYNTHESIS_LIST_SECTIONS = [
    {
        key: 'strengths',
        title: 'Points forts',
        icon: 'solar:cup-linear',
        color: 'success',
        emptyIcon: 'solar:stars-line-linear',
        addTooltip: 'Ajouter un point fort',
        emptyText: 'Aucun point fort renseigné — cliquez pour ajouter'
    },
    {
        key: 'vigilances',
        title: 'Points de vigilance',
        icon: 'solar:danger-triangle-linear',
        color: 'warning',
        emptyIcon: 'solar:magnifer-zoom-in-linear',
        addTooltip: 'Ajouter un point de vigilance',
        emptyText: 'Aucun point de vigilance particulier — cliquez pour ajouter'
    },
    {
        key: 'recommendations',
        title: 'Pistes pédagogiques',
        icon: 'solar:lightbulb-linear',
        color: 'info',
        emptyIcon: 'solar:signpost-linear',
        addTooltip: 'Ajouter une piste pédagogique',
        emptyText: 'Aucune piste pédagogique renseignée — cliquez pour ajouter'
    }
];

/**
 * Class Dashboard Manager
 * Handles all analytics, statistics calculation, and AI synthesis for class analysis
 */
export const ClassDashboardManager = {

    /** @type {HTMLElement|null} Modal element */
    modal: null,

    /** @type {Object|null} Cached statistics */
    cachedStats: null,

    /** @type {string|null} Cached AI synthesis HTML (persists across modal open/close) */
    cachedSynthesisHTML: null,

    /** @type {string|null} Class ID for which synthesis was generated */
    cachedSynthesisClassId: null,

    /** @type {string|null} Period for which synthesis was generated */
    cachedSynthesisPeriod: null,

    /** @type {string|null} Data Hash for which synthesis was generated */
    cachedSynthesisDataHash: null,

    /** @type {string|null} AI Model for which synthesis was generated */
    cachedSynthesisModel: null,

    /** @type {string|null} Subject for which synthesis was generated */
    cachedSynthesisSubject: null,

    /** @type {string|null} Original AI synthesis HTML before any refinement */
    originalSynthesisHTML: null,

    /** @type {boolean} Track if listeners were bound to avoid duplicate binding */
    _listenersBound: false,

    /** @type {{progress: boolean, risk: boolean}} Expanded state for highlight lists beyond Top 5 */
    _expandedHighlights: { progress: false, risk: false },

    /** @type {{ versions: Array<Object>, currentIndex: number }} Unified version history for Synthèse globale intro */
    _introHistoryState: { versions: [], currentIndex: -1 },

    /** @type {{ active: boolean, editIndex: number, originIndex: number }} Coalescing session for live manual intro edits */
    _introEditSession: HistoryUtils.createEditSession(),

    /** @type {ReturnType<typeof setTimeout>|null} Debounce timer for live intro edit commits */
    _introEditTimer: null,

    /** @type {number} Monotonic sequence token guarding async intro/synthesis version reveals */
    _introRenderSeq: 0,

    /** @type {boolean} True while a history version reveal animation is actively playing on the intro */
    _isIntroVersionAnimating: false,

    /** @type {Map<string, {type: 'synthesis'|'refinement', refineType?: string|null, controller: AbortController, classId: string|null, period: string, startedAt: number, previousSnapshot?: Object|null}>} Active AI operations (full synthesis & intro refinement) keyed by classId::period */
    _activeGenerations: new Map(),

    /**
     * Build a stable map key for a (classId, period) generation context.
     * @param {string|null} [classId=appState.currentClassId]
     * @param {string} [period=appState.currentPeriod]
     * @returns {string}
     * @private
     */
    _getContextKey(classId = appState.currentClassId, period = appState.currentPeriod) {
        return `${classId ?? '__default__'}::${period || ''}`;
    },

    /**
     * Detect whether the modal is currently closed/hidden in the real UI
     * (remains false for minimal test DOM stubs without the `.modal` class).
     * @returns {boolean}
     * @private
     */
    _isModalVisiblyClosed() {
        if (!this.modal) return true;
        if (this.modal.style.display === 'none' || this.modal.classList.contains('modal-closing')) return true;
        if (
            this.modal.classList.contains('modal') &&
            !this.modal.classList.contains('modal-visible') &&
            !this.modal.classList.contains('show') &&
            this.modal.style.display !== 'flex'
        ) {
            return true;
        }
        return false;
    },

    /**
     * Check whether the browser is offline for a cloud AI model (Ollama local stays allowed).
     * @returns {boolean}
     * @private
     */
    _isOfflineForActiveModel() {
        return typeof navigator !== 'undefined' &&
            navigator.onLine === false &&
            !(appState.currentAIModel || '').startsWith('ollama');
    },

    /**
     * Ensure modal reference is present and listeners bound if modal exists.
     * @private
     * @returns {HTMLElement|null}
     */
    _ensureModal() {
        if (!this.modal) {
            this.modal = document.getElementById('classDashboardModal');
        }
        if (this.modal && !this._listenersBound) {
            this.init();
        }
        return this.modal;
    },

    /**
     * Initialize the dashboard modal reference
     */
    init() {
        this.modal = document.getElementById('classDashboardModal');
        if (!this.modal || this._listenersBound) return;
        this._listenersBound = true;

        // Attach Context Menu listener for Prompt Preview (Right Click on Generate or Refinement buttons)
        this.modal.addEventListener('contextmenu', (e) => {
            const triggerBtn = e.target.closest('#generateSynthesisBtn, #generateSynthesisPlaceholderBtn');
            if (triggerBtn) {
                e.preventDefault();
                if (!triggerBtn.classList.contains('is-loading')) {
                    this._showPromptPreview();
                }
                return;
            }
            const refineBtn = e.target.closest('.btn-refinement[data-refine-type]');
            if (refineBtn && !refineBtn.classList.contains('disabled')) {
                e.preventDefault();
                this._showRefinementPromptPreview(refineBtn.dataset.refineType);
                refineBtn.blur();
            }
        });

        // Delegated listeners for quick intro copy/undo, refinement actions, highlight toggles, retry, and adding bullets
        this.modal.addEventListener('click', (e) => {
            const copyIntroBtn = e.target.closest('[data-action="copy-intro-synthesis"]');
            if (copyIntroBtn) {
                e.stopPropagation();
                if (!copyIntroBtn.classList.contains('disabled')) {
                    this.copyIntroSynthesis(copyIntroBtn);
                }
                return;
            }
            const historyPrevBtn = e.target.closest('[data-action="synthesis-history-prev"]');
            if (historyPrevBtn) {
                e.stopPropagation();
                if (!historyPrevBtn.classList.contains('disabled')) {
                    this.undoIntroSynthesis();
                }
                return;
            }
            const historyIndicatorBtn = e.target.closest('[data-action="synthesis-history-indicator"]');
            if (historyIndicatorBtn) {
                e.stopPropagation();
                if (!historyIndicatorBtn.classList.contains('disabled')) {
                    this.showIntroHistoryPopover();
                }
                return;
            }
            const historyNextBtn = e.target.closest('[data-action="synthesis-history-next"]');
            if (historyNextBtn) {
                e.stopPropagation();
                if (!historyNextBtn.classList.contains('disabled')) {
                    this.redoIntroSynthesis();
                }
                return;
            }
            const retryBtn = e.target.closest('[data-action="retry-synthesis"]');
            if (retryBtn) {
                e.preventDefault();
                this.generateAISynthesis();
                return;
            }
            const refineBtn = e.target.closest('.btn-refinement[data-refine-type]');
            if (refineBtn) {
                e.preventDefault();
                if (!refineBtn.classList.contains('disabled')) {
                    this.handleClassAnalysisActions(refineBtn);
                }
                return;
            }
            const revertBtn = e.target.closest('#revertSynthesisBtn');
            if (revertBtn) {
                e.preventDefault();
                if (!revertBtn.classList.contains('disabled')) {
                    this.revertSynthesis();
                }
                return;
            }
            const toggleHighlightBtn = e.target.closest('[data-highlight-toggle]');
            if (toggleHighlightBtn) {
                e.preventDefault();
                const groupKey = toggleHighlightBtn.dataset.highlightToggle;
                if (groupKey === 'progress' || groupKey === 'risk') {
                    this._expandedHighlights[groupKey] = !this._expandedHighlights[groupKey];
                    this.updateHighlights(this.cachedStats);
                }
                return;
            }
            const addTrigger = e.target.closest('[data-synthesis-add]');
            if (addTrigger) {
                e.preventDefault();
                this.addSynthesisItem(addTrigger.dataset.synthesisAdd, addTrigger.closest('.synthesis-section'));
            }
        });

        this.modal.addEventListener('input', (e) => {
            const introEl = e.target.closest('#aiSynthesisContent .synthesis-intro-text');
            if (introEl) {
                this._updateIntroWordCount();
                const text = (introEl.innerText || introEl.textContent || '').replace(/\s+/g, ' ').trim();
                if (text) {
                    this._scheduleIntroEditCommit(text);
                }
            }
        });

        this.modal.addEventListener('keydown', (e) => {
            const introEl = e.target.closest?.('#aiSynthesisContent .synthesis-intro-text');
            if (introEl && (e.ctrlKey || e.metaKey) && !e.altKey) {
                const key = e.key.toLowerCase();
                if (key === 'z' && !e.shiftKey) {
                    const currentText = (introEl.innerText || introEl.textContent || '').replace(/\s+/g, ' ').trim();
                    if (this._canUndoIntroWithPending(currentText)) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.undoIntroSynthesis();
                    }
                } else if ((key === 'z' && e.shiftKey) || key === 'y') {
                    if (!this._activeGenerations.has(this._getContextKey()) && HistoryUtils.canRedo(this._introHistoryState)) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.redoIntroSynthesis();
                    }
                }
            }
        });

        DOMHelper.bindInlineEditable(this.modal, {
            selector: '#aiSynthesisContent [contenteditable="true"]',
            onCancel: (editable) => this.cancelEditableItem(editable),
            onCommit: (editable) => this._handleEditableBlur(editable)
        });
    },

    /**
     * Open the Class Dashboard
     * Calculates all statistics and renders the dashboard
     */
    async openDashboard() {
        if (!this._ensureModal()) return;

        const students = this.getStudentsData();
        if (students.length === 0) {
            UI.showNotification("Aucun élève à analyser.", "warning");
            return;
        }

        // Calculate statistics (pass full class roster so historical periodAverages stay invariant across periods)
        this.cachedStats = this.calculateStatistics(students, this._getFullClassRoster());

        // Open modal and render (flush pending inline edit & close history popover on any close path)
        UI.openModal(this.modal, {
            onClose: () => {
                this.closeIntroHistoryPopover();
                this._endIntroEditSession();
                this.flushPendingEdit();
            }
        });
        this.renderDashboard(this.cachedStats, students);
    },

    /**
     * Resolve full class roster (physical or virtual class, independent of active list filters and current-period departures).
     * @param {string|null} [classId=null]
     * @returns {Array}
     * @private
     */
    _getFullClassRoster(classId = null) {
        const targetClassId = classId || appState.currentClassId;
        if (targetClassId && Array.isArray(appState.generatedResults) && appState.generatedResults.length > 0) {
            const classRoster = ClassManager.getStudentsForClass(targetClassId);
            if (classRoster.length > 0 || classId) {
                return classRoster;
            }
        }
        return appState.filteredResults || [];
    },

    /**
     * Get students data for a specific class or the full active class roster
     * (independent of active list search/stat filters, consistent with StatsUIManager)
     * @param {string|null} classId Optional class ID. If null, uses active class roster or filteredResults fallback
     * @returns {Array} Array of student objects with grades and info
     */
    getStudentsData(classId = null) {
        const period = appState.currentPeriod;
        const sourceData = this._getFullClassRoster(classId).filter(
            r => !Utils.isStudentDepartedBeforePeriod?.(r, period)
        );

        const allPeriods = Utils.getPeriods();
        const currentPeriodIdx = allPeriods.indexOf(period);
        const relevantPeriods = currentPeriodIdx >= 0 ? allPeriods.slice(0, currentPeriodIdx + 1) : [period];

        // Robust data gathering that doesn't fail on appreciation errors
        return sourceData
            .map(r => {
                // 1. Safe access to period data
                const periodData = r.studentData?.periods?.[period];
                if (!periodData) return null;

                // 2. Validate Grade existence (accepts 0, rejects null/undefined/empty)
                const rawGrade = periodData.grade;
                if (rawGrade === undefined || rawGrade === null || rawGrade === '') return null;

                // 3. Parse Grade
                const currentGrade = this.parseGrade(rawGrade);
                if (isNaN(currentGrade)) return null;

                // 4. Calculate Evolution & Multi-Period Trajectory Grades
                const previousPeriod = this.getPreviousPeriod(period);
                const previousData = previousPeriod ? r.studentData.periods?.[previousPeriod] : null;
                const previousRawGrade = previousData ? previousData.grade : null;

                const prevGrade = (previousRawGrade !== null && previousRawGrade !== undefined)
                    ? this.parseGrade(previousRawGrade)
                    : null;

                const evolution = StatsService.computeEvolutionDiff(currentGrade, prevGrade);

                const periodGrades = {};
                relevantPeriods.forEach(p => {
                    const pRaw = r.studentData?.periods?.[p]?.grade;
                    if (pRaw !== undefined && pRaw !== null && pRaw !== '') {
                        const parsed = this.parseGrade(pRaw);
                        if (!isNaN(parsed)) {
                            periodGrades[p] = parsed;
                        }
                    }
                });

                // 5. Extract Journal Synthesis & Significant Tags for the active period
                const studentJournalRef = {
                    id: r.id,
                    classId: r.classId || classId || appState.currentClassId,
                    journal: r.journal || r.studentData?.journal
                };
                const journalSynthesis = PromptService._extractJournalSynthesis(studentJournalRef, period);
                const journalTags = JournalManager.getSignificantTagIds(studentJournalRef, period);

                return {
                    id: r.id,
                    nom: r.nom,
                    prenom: r.prenom,
                    fullName: Utils.formatStudentName(r.nom, r.prenom),
                    studentPhoto: r.studentPhoto || null,
                    grade: currentGrade,
                    previousGrade: prevGrade,
                    evolution: evolution,
                    periodGrades: periodGrades,
                    appreciation: Utils.getPeriodAppreciation(r, period),
                    context: periodData.context || '',
                    journalSynthesis: journalSynthesis,
                    journalTags: journalTags
                };
            })
            // Filter out nulls (students without valid grades for this period)
            .filter(s => s !== null);
    },

    /**
     * Helper to get stats for a specific class ID
     * @param {string} classId 
     * @returns {Object|null} Stats object or null if empty
     */
    getStatsForClass(classId) {
        const students = this.getStudentsData(classId);
        return this.calculateStatistics(students, this._getFullClassRoster(classId));
    },

    /**
     * Parse grade string to number safely (delegates to StatsService)
     * @param {string|number} grade 
     * @returns {number} Number or NaN
     */
    parseGrade(grade) {
        return StatsService.parseGrade(grade);
    },

    /**
     * Get previous period based on current period
     * @param {string} period 
     * @returns {string|null}
     */
    getPreviousPeriod(period) {
        return getPreviousPeriod(period);
    },

    /**
     * Calculate all statistics for the class
     * Mutualizes calculations with StatsService and respects appState.evolutionThresholds
     * @param {Array} students 
     * @returns {Object|null} Computed statistics
     */
    calculateStatistics(students, fullClassRoster = null) {
        const cohort = StatsService.computeCohortStats(students, { topLimit: 15 });
        if (!cohort) return null;

        const {
            count: n,
            grades,
            average,
            min,
            max,
            median,
            stdDev,
            heterogeneity,
            aboveTenCount,
            successRate,
            distribution,
            avgEvolution,
            progressCount,
            stableCount,
            regressionCount,
            hasEvolutionData,
            topProgressions,
            topRegressions,
            atRisk
        } = cohort;

        const minStudents = students.filter(s => s.grade === min).map(s => s.fullName);
        const maxStudents = students.filter(s => s.grade === max).map(s => s.fullName);

        // Multi-period class average trajectory (e.g., T1 -> T2 -> T3 or S1 -> S2)
        const allPeriods = Utils.getPeriods();
        const currentPeriod = appState.currentPeriod;
        const currentIdx = allPeriods.indexOf(currentPeriod);
        const relevantPeriods = currentIdx >= 0 ? allPeriods.slice(0, currentIdx + 1) : [currentPeriod];
        const prevPeriod = this.getPreviousPeriod(currentPeriod);

        const periodAverages = (Array.isArray(fullClassRoster) && fullClassRoster.length > 0)
            ? StatsService.computePeriodAverages(fullClassRoster, relevantPeriods)
            : (() => {
                const avgs = [];
                relevantPeriods.forEach(p => {
                    let pGrades = [];
                    if (p === currentPeriod) {
                        pGrades = grades;
                    } else {
                        pGrades = students
                            .map(s => {
                                if (s.periodGrades && typeof s.periodGrades[p] === 'number' && !isNaN(s.periodGrades[p])) {
                                    return s.periodGrades[p];
                                }
                                if (p === prevPeriod && typeof s.previousGrade === 'number' && !isNaN(s.previousGrade)) {
                                    return s.previousGrade;
                                }
                                return null;
                            })
                            .filter(g => g !== null);
                    }
                    if (pGrades.length > 0) {
                        const pAvg = pGrades.reduce((a, b) => a + b, 0) / pGrades.length;
                        avgs.push({
                            period: p,
                            average: parseFloat(pAvg.toFixed(2)),
                            count: pGrades.length
                        });
                    }
                });
                return avgs;
            })();

        // Aggregate significant Journal de Bord trends across the class for the active period
        const classTagStudentCounts = {};
        students.forEach(s => {
            const tags = Array.isArray(s.journalTags)
                ? s.journalTags
                : (Array.isArray(s.journal) ? JournalManager.getSignificantTagIds(s, currentPeriod) : []);
            if (tags.length > 0) {
                new Set(tags).forEach(tagId => {
                    classTagStudentCounts[tagId] = (classTagStudentCounts[tagId] || 0) + 1;
                });
            }
        });

        const journalTrends = Object.entries(classTagStudentCounts)
            .map(([tagId, studentCount]) => {
                const tagMeta = JournalManager.getTag(tagId);
                return {
                    id: tagId,
                    label: tagMeta ? tagMeta.label : tagId,
                    category: tagMeta ? tagMeta.category : 'neutral',
                    count: studentCount
                };
            })
            .sort((a, b) => b.count - a.count);

        // Qualitative per-student items: use finalized appreciation when available,
        // or transparently fall back to period context + journal synthesis before bulletins are generated
        const appreciationsList = students
            .map(s => {
                const appreciationText = (s.appreciation || '').trim();
                if (appreciationText) {
                    return { prenom: s.prenom, nom: s.nom, text: appreciationText };
                }
                const ctxText = (s.context || '').trim();
                const jrnText = (s.journalSynthesis ?? (Array.isArray(s.journal) ? JournalManager.synthesizeForPrompt(s, currentPeriod) : '')).trim();
                const fallbackText = [ctxText, jrnText].filter(Boolean).join(' — ');
                return fallbackText ? { prenom: s.prenom, nom: s.nom, text: fallbackText } : null;
            })
            .filter(Boolean);

        const writtenAppreciationsCount = students.filter(s => (s.appreciation || '').trim().length > 0).length;

        return {
            count: n,
            average: average,
            median: typeof median === 'number' ? median : average,
            min: min,
            max: max,
            minStudents: minStudents,
            maxStudents: maxStudents,
            stdDev: stdDev,
            heterogeneity: heterogeneity,
            successRate: successRate,
            aboveTenCount: aboveTenCount,
            distribution: distribution,
            avgEvolution: avgEvolution,
            progressCount: progressCount,
            stableCount: stableCount,
            regressionCount: regressionCount,
            topProgressions: topProgressions,
            topRegressions: topRegressions,
            atRisk: atRisk,
            hasEvolutionData: hasEvolutionData,
            periodAverages: periodAverages,
            journalTrends: journalTrends,
            writtenAppreciationsCount: writtenAppreciationsCount,
            qualitativeContextCount: appreciationsList.length,

            // Metadata for AI & Consistency
            dataHash: this._computeClassDataHash(students),
            appreciationsList: appreciationsList
        };
    },

    /**
     * Compute a deterministic hash of the current class data (grades, appreciations, contexts, and journal)
     * @param {Array} students
     * @returns {string}
     * @private
     */
    _computeClassDataHash(students) {
        if (!students || students.length === 0) return '';
        const raw = students.map(s => {
            const app = (s.appreciation || '').trim();
            const ctx = (s.context || '').trim();
            const jrn = (s.journalSynthesis || '').trim();
            return `${s.id}:${s.grade}:${app}:${ctx}:${jrn}`;
        }).join('|');

        let hash = 5381;
        for (let i = 0; i < raw.length; i++) {
            hash = ((hash << 5) + hash) + raw.charCodeAt(i);
            hash = hash & hash;
        }
        return `cd_${(hash >>> 0).toString(16)}`;
    },

    /**
     * Render the dashboard with statistics
     * @param {Object} stats 
     * @param {Array} students 
     */
    renderDashboard(stats, students) {
        if (!stats || !this._ensureModal()) return;
        this.cachedStats = stats;
        this._expandedHighlights = { progress: false, risk: false };

        // Update header title (class name directly in H2) + clean typographic metadata
        const titlePrefix = this.modal?.querySelector('#dashboardTitlePrefix');
        const titleSep = this.modal?.querySelector('#dashboardTitleSep');
        const periodBadge = this.modal?.querySelector('#dashboardPeriodBadge');
        const studentCount = this.modal?.querySelector('#dashboardStudentCount');
        const classBadge = this.modal?.querySelector('#dashboardClassBadge');
        const subjectBadge = this.modal?.querySelector('#dashboardSubjectBadge');

        if (periodBadge) {
            const periodLabels = { T1: 'Trimestre 1', T2: 'Trimestre 2', T3: 'Trimestre 3', S1: 'Semestre 1', S2: 'Semestre 2' };
            periodBadge.textContent = periodLabels[appState.currentPeriod] || appState.currentPeriod;
        }
        if (studentCount) {
            studentCount.textContent = `${stats.count} ${stats.count > 1 ? 'élèves' : 'élève'}`;
        }

        // Retrieve and display class name directly in the modal main title (physical or virtual class)
        const currentClassName = Utils.getCurrentClassName(appState.currentClassId);
        if (currentClassName) {
            if (titlePrefix) titlePrefix.textContent = 'Analyse';
            if (titleSep) titleSep.hidden = false;
            if (classBadge) {
                classBadge.textContent = currentClassName;
                classBadge.hidden = false;
                classBadge.style.display = '';
            }
        } else {
            if (titlePrefix) titlePrefix.textContent = 'Analyse de la classe';
            if (titleSep) titleSep.hidden = true;
            if (classBadge) {
                classBadge.textContent = '';
                classBadge.hidden = true;
                classBadge.style.display = 'none';
            }
        }

        // Retrieve and display active subject (discipline)
        const effectiveStyle = PromptService._getEffectiveStyle?.(PromptService._resolveIaConfig?.()) || {};
        const discipline = effectiveStyle.discipline || (appState.currentSubject !== 'Générique' && appState.currentSubject !== 'MonStyle' ? appState.currentSubject : null);

        if (subjectBadge && discipline) {
            subjectBadge.textContent = discipline;
            subjectBadge.hidden = false;
            subjectBadge.style.display = 'inline-flex';
        } else if (subjectBadge) {
            subjectBadge.hidden = true;
            subjectBadge.style.display = 'none';
        }

        // Display Class Stats (Moyenne, Médiane, Min, Max) in Cohort Stats Bar
        const statAverage = this.modal?.querySelector('#cohortStatAverage');
        const statAverageItem = this.modal?.querySelector('#cohortStatAverageItem');
        const statAverageDelta = this.modal?.querySelector('#cohortStatAverageDelta');
        const statMedian = this.modal?.querySelector('#cohortStatMedian');
        const statMedianItem = this.modal?.querySelector('#cohortStatMedianItem');
        const statMedianSub = this.modal?.querySelector('#cohortStatMedianSub');
        const statMin = this.modal?.querySelector('#cohortStatMin');
        const statMinItem = this.modal?.querySelector('#cohortStatMinItem');
        const statMax = this.modal?.querySelector('#cohortStatMax');
        const statMaxItem = this.modal?.querySelector('#cohortStatMaxItem');

        const moy = stats.average.toFixed(1).replace('.', ',');
        const med = stats.median.toFixed(1).replace('.', ',');
        const min = stats.min.toFixed(1).replace('.', ',');
        const max = stats.max.toFixed(1).replace('.', ',');
        const stdDevFormatted = stats.stdDev.toFixed(1).replace('.', ',');

        if (statAverage) {
            statAverage.innerHTML = `${moy}<span class="stat-denominator">/20</span>`;
            statAverage.className = 'stat-value';
            const gradeClass = Utils.getGradeClass(stats.average);
            if (gradeClass) {
                statAverage.classList.add(gradeClass);
            }

            let avgTooltip = `<strong>Moyenne de la classe (${moy}/20)</strong>`;
            if (Array.isArray(stats.periodAverages) && stats.periodAverages.length >= 2) {
                const trajectory = stats.periodAverages
                    .map(p => `${p.period} : ${p.average.toFixed(1).replace('.', ',')}/20`)
                    .join(' → ');
                avgTooltip += `<br>Trajectoire : ${trajectory}`;
            } else {
                avgTooltip += `<br>${stats.count} élève${stats.count > 1 ? 's' : ''} évalué${stats.count > 1 ? 's' : ''}`;
            }
            if (typeof stats.avgEvolution === 'number' && !isNaN(stats.avgEvolution)) {
                const cleanEvo = Math.round(stats.avgEvolution * 10) / 10 || 0;
                const sign = cleanEvo > 0 ? '+' : '';
                const evoFormatted = cleanEvo.toFixed(1).replace('.', ',');
                const unit = Math.abs(cleanEvo) >= 2 ? 'pts' : 'pt';
                avgTooltip += `<br>Évolution récente : ${sign}${evoFormatted} ${unit}`;
            }
            TooltipsUI.updateTooltip(statAverageItem || statAverage, avgTooltip);
        }

        if (statAverageDelta) {
            if (typeof stats.avgEvolution === 'number' && !isNaN(stats.avgEvolution)) {
                const cleanEvo = Math.round(stats.avgEvolution * 10) / 10 || 0;
                const sign = cleanEvo > 0 ? '+' : '';
                const evoFormatted = cleanEvo.toFixed(1).replace('.', ',');
                const unit = Math.abs(cleanEvo) >= 2 ? 'pts' : 'pt';
                const posThreshold = appState.evolutionThresholds?.positive ?? 0.5;
                const negThreshold = appState.evolutionThresholds?.negative ?? -0.5;
                const toneClass = cleanEvo >= posThreshold ? 'positive' : (cleanEvo <= negThreshold ? 'negative' : 'neutral');
                statAverageDelta.textContent = `${sign}${evoFormatted} ${unit}`;
                statAverageDelta.className = `stat-sub ${toneClass}`;
                statAverageDelta.hidden = false;
            } else {
                statAverageDelta.textContent = '';
                statAverageDelta.hidden = true;
            }
        }

        if (statMedian) {
            statMedian.innerHTML = `${med}<span class="stat-denominator">/20</span>`;
            const hetLabel = stats.heterogeneity?.label ? ` · ${stats.heterogeneity.label}` : '';
            const medTooltip = `<strong>Médiane (${med}/20)</strong><br>50% des élèves ont au moins ${med}/20<br>Écart-type : ${stdDevFormatted} pt${hetLabel}`;
            TooltipsUI.updateTooltip(statMedianItem || statMedian, medTooltip);
        }

        if (statMedianSub) {
            const hetLabel = stats.heterogeneity?.label;
            if (hetLabel && hetLabel !== 'Indéterminée') {
                statMedianSub.textContent = hetLabel;
                const colorClass = stats.heterogeneity?.colorClass || 'neutral';
                statMedianSub.className = `stat-sub ${colorClass}`;
                statMedianSub.hidden = false;
            } else {
                statMedianSub.textContent = '';
                statMedianSub.hidden = true;
            }
        }

        if (statMin) {
            statMin.innerHTML = `${min}<span class="stat-denominator">/20</span>`;
            const minTooltip = StatsUI.formatStudentListTooltip(
                `Note la plus basse (${min}/20)`,
                stats.minStudents,
                name => Utils.escapeHtml(name)
            );
            TooltipsUI.updateTooltip(statMinItem || statMin, minTooltip);
        }

        if (statMax) {
            statMax.innerHTML = `${max}<span class="stat-denominator">/20</span>`;
            const maxTooltip = StatsUI.formatStudentListTooltip(
                `Note la plus haute (${max}/20)`,
                stats.maxStudents,
                name => Utils.escapeHtml(name)
            );
            TooltipsUI.updateTooltip(statMaxItem || statMax, maxTooltip);
        }

        // Update cohort header micro-metric (success rate) with semantic mineral color & tooltip
        const cohortHeaderMetric = this.modal?.querySelector('#cohortHeaderMetric');
        if (cohortHeaderMetric) {
            const rateRounded = Math.round(stats.successRate);
            const semanticClass = rateRounded >= 70 ? 'positive' : rateRounded >= 50 ? 'warning' : 'negative';
            cohortHeaderMetric.className = `cohort-header-metric tooltip ${semanticClass}`;
            cohortHeaderMetric.innerHTML = `<iconify-icon icon="solar:shield-check-linear"></iconify-icon> <strong>${rateRounded}%</strong> de réussite`;
            const successTooltip = `<strong>Taux de réussite (≥ 10/20)</strong><br>${stats.aboveTenCount} élève${stats.aboveTenCount > 1 ? 's' : ''} sur ${stats.count} ont la moyenne`;
            TooltipsUI.updateTooltip(cohortHeaderMetric, successTooltip);
        }

        // Render grade distribution micro-bar & conditional journal trends
        this._renderDistributionBar(stats);
        this._renderJournalTrends(stats);

        // Update Highlights
        this.updateHighlights(stats);

        // Restore cached AI synthesis if it matches current class/period, otherwise reset
        this.restoreOrResetAISection();
    },

    /**
     * Render the compact segmented grade distribution micro-bar across canonical brackets.
     * @param {Object} stats
     * @private
     */
    _renderDistributionBar(stats) {
        const section = this.modal?.querySelector('#cohortDistributionSection');
        const bar = this.modal?.querySelector('#cohortDistributionBar');
        const summary = this.modal?.querySelector('#cohortDistributionSummary');
        if (!section || !bar) return;

        TooltipsUI.cleanupTooltipsIn(bar);

        const dist = stats.distribution;
        const total = stats.count || 0;
        if (!dist || total === 0) {
            bar.innerHTML = '';
            if (summary) summary.textContent = '';
            section.hidden = true;
            return;
        }

        const counts = Array.isArray(dist)
            ? GRADE_BRACKETS.map((_, idx) => Number(dist[idx]) || 0)
            : GRADE_BRACKETS.map(b => Number(dist[b.id]) || 0);

        const activeTotal = counts.reduce((sum, n) => sum + n, 0);
        if (activeTotal === 0) {
            bar.innerHTML = '';
            if (summary) summary.textContent = '';
            section.hidden = true;
            return;
        }

        if (summary) {
            const aboveTen = stats.aboveTenCount ?? 0;
            summary.textContent = `${aboveTen}/${total} ≥ 10`;
        }

        bar.innerHTML = GRADE_BRACKETS.map((bracket, idx) => {
            const count = counts[idx];
            if (count <= 0) return '';
            const pctExact = (count / activeTotal) * 100;
            const pctRounded = Math.round(pctExact);
            const tooltip = `<strong>${Utils.escapeHtml(bracket.label)}/20</strong><br>${count} élève${count > 1 ? 's' : ''} (${pctRounded} %)`;
            return `<div class="cohort-dist-seg" data-range="${bracket.id}" style="width: ${pctExact.toFixed(2)}%;" data-tooltip="${Utils.escapeHtml(tooltip)}"></div>`;
        }).join('');

        section.hidden = false;
        TooltipsUI.initTooltips(bar);
    },

    /**
     * Render conditional Journal de bord recurring trends (hidden if none have >= 2 students).
     * @param {Object} stats
     * @private
     */
    _renderJournalTrends(stats) {
        const section = this.modal?.querySelector('#cohortJournalTrends');
        const chipsContainer = this.modal?.querySelector('#cohortJournalChips');
        if (!section || !chipsContainer) return;

        TooltipsUI.cleanupTooltipsIn(chipsContainer);

        const recurring = Array.isArray(stats.journalTrends)
            ? stats.journalTrends.filter(t => t && Number(t.count) >= 2).slice(0, 4)
            : [];

        if (recurring.length === 0) {
            chipsContainer.innerHTML = '';
            section.hidden = true;
            return;
        }

        chipsContainer.innerHTML = recurring.map(trend => {
            const tagMeta = JournalManager.getTag?.(trend.id);
            const icon = tagMeta?.icon ? `<iconify-icon icon="${Utils.escapeHtml(tagMeta.icon)}" aria-hidden="true"></iconify-icon>` : '';
            const category = ['positive', 'negative', 'neutral'].includes(trend.category) ? trend.category : 'neutral';
            const tooltip = `${trend.label} — relevé chez ${trend.count} élèves`;
            return `<span class="cohort-journal-chip is-${category} tooltip" data-tooltip="${Utils.escapeHtml(tooltip)}">${icon}<span>${Utils.escapeHtml(trend.label)}</span><span class="cohort-journal-chip-count">· ${trend.count}</span></span>`;
        }).join('');

        section.hidden = false;
        TooltipsUI.initTooltips(chipsContainer);
    },

    /**
     * Update the discrete synthesis data-source line in the left panel footer.
     * @param {Object|null} [stats=null]
     * @private
     */
    _updateSynthesisMeta(stats = null) {
        const sourceEl = this.modal?.querySelector('#aiSynthesisSourceInfo');
        if (!sourceEl) return;
        const resolvedStats = stats || this.cachedStats;
        if (!resolvedStats) {
            sourceEl.textContent = '';
            return;
        }
        const count = resolvedStats.count || 0;
        const notesLabel = `${count} note${count > 1 ? 's' : ''}`;
        const appCount = resolvedStats.writtenAppreciationsCount ?? 0;
        const ctxCount = resolvedStats.qualitativeContextCount ?? 0;

        if (appCount > 0) {
            sourceEl.textContent = `Basé sur ${notesLabel} et ${appCount} appréciation${appCount > 1 ? 's' : ''}`;
        } else if (ctxCount > 0) {
            sourceEl.textContent = `Basé sur ${notesLabel} et ${ctxCount} suivi${ctxCount > 1 ? 's' : ''} (notes/journal)`;
        } else {
            sourceEl.textContent = `Basé sur ${notesLabel} uniquement`;
        }
    },

    /**
     * Render a paginated highlight list (Top 5 + toggle button for remaining items).
     * @param {HTMLElement|null} listEl
     * @param {Array} items
     * @param {'progress'|'risk'} groupKey
     * @param {(student: Object) => string} renderItemFn
     * @param {string} emptyHTML
     * @private
     */
    _renderHighlightList(listEl, items, groupKey, renderItemFn, emptyHTML) {
        if (!listEl) return;
        TooltipsUI.cleanupTooltipsIn(listEl);

        if (!Array.isArray(items) || items.length === 0) {
            listEl.innerHTML = emptyHTML;
            return;
        }

        const isExpanded = Boolean(this._expandedHighlights?.[groupKey]);
        const visibleItems = isExpanded ? items : items.slice(0, DEFAULT_HIGHLIGHT_LIMIT);
        const remaining = items.length - DEFAULT_HIGHLIGHT_LIMIT;

        let html = visibleItems.map(renderItemFn).join('');
        if (remaining > 0) {
            const toggleLabel = isExpanded
                ? 'Réduire'
                : `Afficher ${remaining > 1 ? `les ${remaining} autres` : '1 autre'}`;
            const toggleIcon = isExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear';
            html += `
                <button type="button" class="highlight-toggle-more-btn" data-highlight-toggle="${groupKey}" aria-expanded="${isExpanded}">
                    <span>${toggleLabel}</span>
                    <iconify-icon icon="${toggleIcon}" aria-hidden="true"></iconify-icon>
                </button>
            `;
        }

        listEl.innerHTML = html;
        TooltipsUI.initTooltips(listEl);
    },

    /**
     * Update highlights sections (progressions and students to watch)
     * @param {Object} stats 
     */
    updateHighlights(stats) {
        if (!stats || !this._ensureModal()) return;

        const negThreshold = appState.evolutionThresholds?.negative ?? -0.5;
        const progressGroup = this.modal?.querySelector('#highlightProgressGroup');
        const progressList = this.modal?.querySelector('#highlightProgressList');
        const progressCountBadge = this.modal?.querySelector('#highlightProgressCount');

        progressGroup?.classList.toggle('is-unavailable', !stats.hasEvolutionData);

        // 1. Top Progressions
        if (progressList) {
            if (!stats.hasEvolutionData) {
                TooltipsUI.cleanupTooltipsIn(progressList);
                const nextPeriodShort = appState.periodSystem === 'semestres' ? 'S2' : 'T2';
                const nextPeriodFull = appState.periodSystem === 'semestres' ? 'semestre' : 'trimestre';
                if (progressCountBadge) {
                    progressCountBadge.textContent = `Dès le ${nextPeriodShort}`;
                    progressCountBadge.className = 'highlight-count-badge muted';
                }
                progressList.innerHTML = `<div class="highlight-empty">Comparaison disponible au prochain ${nextPeriodFull}</div>`;
            } else {
                if (progressCountBadge) {
                    progressCountBadge.textContent = String(stats.topProgressions.length);
                    progressCountBadge.className = `highlight-count-badge ${stats.topProgressions.length > 0 ? 'positive' : 'muted'}`;
                }
                this._renderHighlightList(
                    progressList,
                    stats.topProgressions,
                    'progress',
                    (s) => {
                        const formattedGrade = s.grade.toFixed(1).replace('.', ',');
                        const formattedEvolution = s.evolution.toFixed(1).replace('.', ',');
                        const unit = Math.abs(s.evolution) >= 2 ? 'pts' : 'pt';
                        const tooltipText = `${s.fullName} — Moyenne : ${formattedGrade}/20 (+${formattedEvolution} ${unit})`;
                        return `
                            <div class="highlight-item" role="button" tabindex="0" data-student-id="${Utils.escapeHtml(String(s.id ?? ''))}" data-tooltip="${Utils.escapeHtml(tooltipText)}" aria-label="${Utils.escapeHtml(`Ouvrir la fiche de ${s.fullName}`)}">
                                <div class="highlight-item-left">
                                    ${StudentPhotoManager.getAvatarHTML(s, 'sm', false, false)}
                                    <span class="highlight-student-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                                </div>
                                <div class="highlight-item-metrics">
                                    <span class="highlight-grade">${formattedGrade}<small>/20</small></span>
                                    <span class="highlight-evolution positive">+${formattedEvolution} ${unit}</span>
                                </div>
                            </div>
                        `;
                    },
                    '<div class="highlight-empty">Aucune progression significative</div>'
                );
            }
        }

        // 2. Students to Watch (Élèves à surveiller)
        const riskList = this.modal?.querySelector('#highlightRiskList');
        const riskCountBadge = this.modal?.querySelector('#highlightRiskCount');

        if (riskList) {
            const atRiskStudents = (stats.atRisk || []).slice(0, 15);

            if (riskCountBadge) {
                riskCountBadge.textContent = String(atRiskStudents.length);
                riskCountBadge.className = `highlight-count-badge ${atRiskStudents.length > 0 ? 'negative' : 'muted'}`;
            }

            this._renderHighlightList(
                riskList,
                atRiskStudents,
                'risk',
                (s) => {
                    const formattedGrade = s.grade.toFixed(1).replace('.', ',');
                    const isBelowAverage = s.grade < 10;
                    const hasNumericEvolution = typeof s.evolution === 'number' && !Number.isNaN(s.evolution);
                    let tooltipText = `${s.fullName} — Moyenne : ${formattedGrade}/20`;
                    let badgeHTML = '';

                    if (hasNumericEvolution && s.evolution <= negThreshold) {
                        const formattedEvolution = s.evolution.toFixed(1).replace('.', ',');
                        const unit = Math.abs(s.evolution) >= 2 ? 'pts' : 'pt';
                        tooltipText += ` (${formattedEvolution} ${unit})`;
                        badgeHTML = `<span class="highlight-evolution negative">${formattedEvolution} ${unit}</span>`;
                    } else if (hasNumericEvolution) {
                        const cleanEvo = Math.round(s.evolution * 10) / 10 || 0;
                        const sign = cleanEvo > 0 ? '+' : '';
                        const formattedEvolution = cleanEvo.toFixed(1).replace('.', ',');
                        const unit = Math.abs(cleanEvo) >= 2 ? 'pts' : 'pt';
                        tooltipText += ` (${sign}${formattedEvolution} ${unit})`;
                        badgeHTML = `<span class="highlight-evolution neutral">${sign}${formattedEvolution} ${unit}</span>`;
                    } else {
                        badgeHTML = `<span class="highlight-evolution negative">&lt; 10</span>`;
                    }

                    return `
                        <div class="highlight-item" role="button" tabindex="0" data-student-id="${Utils.escapeHtml(String(s.id ?? ''))}" data-tooltip="${Utils.escapeHtml(tooltipText)}" aria-label="${Utils.escapeHtml(`Ouvrir la fiche de ${s.fullName}`)}">
                            <div class="highlight-item-left">
                                ${StudentPhotoManager.getAvatarHTML(s, 'sm', false, false)}
                                <span class="highlight-student-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                            </div>
                            <div class="highlight-item-metrics">
                                <span class="highlight-grade${isBelowAverage ? ' is-below-average' : ''}">${formattedGrade}<small>/20</small></span>
                                ${badgeHTML}
                            </div>
                        </div>
                    `;
                },
                '<div class="highlight-empty">Aucun élève en difficulté</div>'
            );
        }
    },

    /**
     * Safely extract #aiRefinementToolbar from #aiSynthesisContent before replacing content HTML.
     * @private
     */
    _parkRefinementToolbar() {
        const modal = this.modal || document.getElementById('classDashboardModal');
        if (!modal) return;
        const toolbar = modal.querySelector('#aiRefinementToolbar');
        const content = modal.querySelector('#aiSynthesisContent');
        if (!toolbar) return;

        toolbar.classList.remove('is-embedded');
        if (content && content.contains(toolbar)) {
            if (content.parentNode) {
                content.insertAdjacentElement('afterend', toolbar);
            } else {
                modal.appendChild(toolbar);
            }
        }
    },

    /**
     * Toggle secondary synthesis controls (copy, undo, revert, intro inline edit) during active refinement.
     * Uses `.disabled` class (not native `:disabled`) so Tippy tooltips remain functional.
     * @param {boolean} disabled
     * @private
     */
    _setRefinementSecondaryControlsDisabled(disabled) {
        if (!this.modal) return;
        const selectors = [
            '#copyDashboardSynthesisBtn',
            '.synthesis-intro-copy-btn',
            '#revertSynthesisBtn'
        ];
        selectors.forEach(sel => {
            const el = this.modal.querySelector(sel);
            if (!el) return;
            el.classList.toggle('disabled', disabled);
            el.setAttribute('aria-disabled', String(disabled));
        });
        const introEl = this.modal.querySelector('#aiSynthesisContent .synthesis-intro-text');
        if (introEl) {
            introEl.setAttribute('contenteditable', disabled ? 'false' : 'true');
        }
        if (disabled) {
            this.closeIntroHistoryPopover();
        }
        this._updateIntroHistoryUI();
    },

    /**
     * Render the 4-card Bento loading skeleton and switch #generateSynthesisBtn into cancellable mode.
     * Shared between generateAISynthesis() and restoreOrResetAISection() on modal reopen.
     * @private
     */
    _applySynthesisLoadingUI() {
        if (!this.modal) return;
        const content = this.modal.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal.querySelector('#generateSynthesisBtn');
        const copyBtn = this.modal.querySelector('#copyDashboardSynthesisBtn');
        const toolbar = this.modal.querySelector('#aiRefinementToolbar');
        const metaEl = this.modal.querySelector('#aiSynthesisMeta');

        this._parkRefinementToolbar();
        if (toolbar) toolbar.style.display = 'none';
        if (metaEl) metaEl.style.display = 'none';
        if (copyBtn) copyBtn.style.display = 'none';

        if (content) {
            content.innerHTML = `
                <div class="appreciation-skeleton synthesis-skeleton-grid">
                    <div class="synthesis-section synthesis-intro-card synthesis-skeleton-card synthesis-skeleton-card--intro">
                        <div class="skeleton-line skeleton-line--title"></div>
                        <div class="skeleton-line skeleton-line--w95"></div>
                        <div class="skeleton-line skeleton-line--w88"></div>
                        <div class="skeleton-line skeleton-line--w60"></div>
                    </div>
                    <div class="synthesis-section synthesis-section--success synthesis-skeleton-card">
                        <div class="skeleton-line skeleton-line--title"></div>
                        <div class="skeleton-line skeleton-line--w90"></div>
                        <div class="skeleton-line skeleton-line--w85"></div>
                    </div>
                    <div class="synthesis-section synthesis-section--warning synthesis-skeleton-card">
                        <div class="skeleton-line skeleton-line--title"></div>
                        <div class="skeleton-line skeleton-line--w88"></div>
                        <div class="skeleton-line skeleton-line--w80"></div>
                    </div>
                    <div class="synthesis-section synthesis-section--info synthesis-skeleton-card">
                        <div class="skeleton-line skeleton-line--title"></div>
                        <div class="skeleton-line skeleton-line--w92"></div>
                        <div class="skeleton-line skeleton-line--w85"></div>
                    </div>
                    <span class="generating-badge active">
                        <iconify-icon icon="ph:spinner-gap-bold" class="rotate-icon"></iconify-icon>
                        <span>Analyse de la classe en cours...</span>
                    </span>
                </div>
            `;
        }

        if (generateBtn) {
            generateBtn.style.display = 'inline-flex';
            if (typeof UI.showInlineSpinner === 'function') {
                UI.showInlineSpinner(generateBtn, '', { canCancel: true });
            } else {
                UI.setGenerateButtonState(generateBtn, 'loading');
            }
        }
    },

    /**
     * Apply busy/cancellable UI state for an active intro refinement.
     * Matches FocusPanelRefinement: active chip animates & stays clickable to cancel,
     * sibling chips & secondary controls are muted, and #generateSynthesisBtn shows "Annuler".
     * @param {string} activeType
     * @private
     */
    _applyRefinementBusyUI(activeType) {
        if (!this.modal) return;
        const refineButtons = Array.from(
            this.modal.querySelectorAll('#aiRefinementToolbar .btn-refinement[data-refine-type]')
        );
        refineButtons.forEach(b => {
            b.disabled = false;
            const isTarget = b.dataset.refineType === activeType;
            b.classList.toggle('is-generating', isTarget);
            b.classList.toggle('disabled', !isTarget);
            if (isTarget) {
                b.dataset.baseTooltip ??= b.dataset.tooltip || '';
                TooltipsUI.updateTooltip(b, 'Cliquer pour annuler');
            }
        });
        this._setRefinementSecondaryControlsDisabled(true);

        const generateBtn = this.modal.querySelector('#generateSynthesisBtn');
        if (generateBtn) {
            generateBtn.style.display = 'inline-flex';
            if (typeof UI.showInlineSpinner === 'function') {
                UI.showInlineSpinner(generateBtn, '', { canCancel: true });
            }
        }
    },

    /**
     * Restore #generateSynthesisBtn to its idle/done/dirty state after cancellation or completion.
     * @param {string|null} targetClassId
     * @param {string} targetPeriod
     * @private
     */
    _restoreGenerateButtonState(targetClassId, targetPeriod) {
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');
        if (!generateBtn) return;
        UI.hideInlineSpinner?.(generateBtn);
        const hasSynthesis = Boolean(
            this.cachedSynthesisHTML &&
            this.cachedSynthesisClassId === targetClassId &&
            this.cachedSynthesisPeriod === targetPeriod
        );
        generateBtn.style.display = hasSynthesis ? 'inline-flex' : 'none';
        UI.setGenerateButtonState(generateBtn, hasSynthesis ? 'done' : 'idle');
        if (hasSynthesis) {
            TooltipsUI.updateTooltip(generateBtn, 'Clic droit : prévisualiser le prompt');
            this._checkStaleData();
        }
    },

    /**
     * Clear refinement busy classes from the toolbar and secondary controls in the current modal view.
     * @private
     */
    _clearRefinementToolbarVisuals() {
        if (!this.modal) return;
        this.modal.querySelectorAll('#aiRefinementToolbar .btn-refinement[data-refine-type]').forEach(btn => {
            btn.classList.remove('is-generating', 'disabled');
            btn.disabled = false;
            if (btn.dataset.baseTooltip !== undefined) {
                const baseTooltip = btn.dataset.baseTooltip;
                delete btn.dataset.baseTooltip;
                TooltipsUI.updateTooltip(btn, baseTooltip);
            }
        });
        this._setRefinementSecondaryControlsDisabled(false);
    },

    /**
     * Cancel an active AI operation (full synthesis or intro refinement) for a specific (classId, period).
     * @param {string|null} [classId=appState.currentClassId]
     * @param {string} [period=appState.currentPeriod]
     * @param {Object} [options={}]
     * @param {boolean} [options.restoreUI=true]
     * @returns {boolean} True if an active operation was cancelled
     */
    cancelGeneration(classId = appState.currentClassId, period = appState.currentPeriod, { restoreUI = true } = {}) {
        const ctxKey = this._getContextKey(classId, period);
        const active = this._activeGenerations.get(ctxKey);
        if (!active) return false;

        this._activeGenerations.delete(ctxKey);
        active.controller?.abort?.();

        if (restoreUI && this.modal && appState.currentClassId === classId && appState.currentPeriod === period) {
            const content = this.modal.querySelector('#aiSynthesisContent');
            const introEl = content?.querySelector('.synthesis-intro-text');
            if (introEl) UI.cancelHtmlReveal?.(introEl);
            if (content) UI.cancelHtmlReveal?.(content);

            if (active.type === 'synthesis') {
                if (active.previousSnapshot?.html) {
                    this._introHistoryState = HistoryUtils.normalizeHistoryState(active.previousSnapshot.introHistory);
                    this._applySynthesisToUI(active.previousSnapshot.html, false);
                    this._checkStaleData();
                } else {
                    this.resetAISection();
                }
            } else {
                if (active.restoreIntroText && introEl) {
                    introEl.textContent = active.restoreIntroText;
                    introEl._initialTextBeforeEdit = active.restoreIntroText;
                    this._updateIntroWordCount();
                }
                this._clearRefinementToolbarVisuals();
                this._restoreGenerateButtonState(classId, period);
            }
        }
        return true;
    },

    /**
     * Cancel ALL active Class Dashboard AI operations (full syntheses & intro refinements).
     * Invoked by the header dynamic pill cancel button (#dashCancelBtn).
     * @returns {boolean} True if at least one operation was cancelled
     */
    cancelAllGenerations() {
        let cancelled = false;
        for (const entry of [...this._activeGenerations.values()]) {
            if (this.cancelGeneration(entry.classId, entry.period, { restoreUI: true })) {
                cancelled = true;
            }
        }
        return cancelled;
    },

    /**
     * Extract the intro paragraph string from a raw synthesis JSON or fallback text.
     * @param {string|null|undefined} rawText
     * @returns {string}
     * @private
     */
    _extractIntroTextFromRaw(rawText) {
        if (!rawText || typeof rawText !== 'string') return '';
        let cleaned = rawText.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object' && typeof parsed.synthesis === 'string') {
                return parsed.synthesis.trim();
            }
        } catch (_) {
            // Non-JSON legacy synthesis
        }
        return '';
    },

    /**
     * Ensure `_introHistoryState` is initialized with the current intro text when empty.
     * @param {string|null} [fallbackText=null]
     * @private
     */
    _ensureIntroHistorySeeded(fallbackText = null) {
        if (!this._introHistoryState || !Array.isArray(this._introHistoryState.versions)) {
            this._introHistoryState = { versions: [], currentIndex: -1 };
        }
        if (this._introHistoryState.versions.length > 0) return;

        const seedText = (
            fallbackText
            || this.modal?.querySelector('#aiSynthesisContent .synthesis-intro-text')?.textContent
            || this._extractIntroTextFromRaw(this.cachedSynthesisRawText)
            || ''
        ).trim();

        if (seedText) {
            HistoryUtils.pushToState(
                this._introHistoryState,
                seedText,
                'original',
                'ai',
                this.cachedSynthesisModel || appState.currentAIModel || null,
                null
            );
        }
    },

    /**
     * Schedule a coalesced manual-edit commit during live typing in `.synthesis-intro-text`.
     * @param {string} text
     * @private
     */
    _scheduleIntroEditCommit(text) {
        if (this._introEditTimer) {
            clearTimeout(this._introEditTimer);
            this._introEditTimer = null;
        }
        const targetClassId = appState.currentClassId;
        const targetPeriod = appState.currentPeriod;
        this._introEditTimer = setTimeout(() => {
            this._introEditTimer = null;
            if (appState.currentClassId !== targetClassId || appState.currentPeriod !== targetPeriod) return;
            if (this._activeGenerations.has(this._getContextKey(targetClassId, targetPeriod))) return;
            this._flushIntroEditSession(text, { persist: true });
        }, INTRO_EDIT_DEBOUNCE_MS);
    },

    /**
     * Commit or update in-place the active manual-edit session on the Synthèse globale intro.
     * @param {string|null} [text=null]
     * @param {Object} [options={}]
     * @param {boolean} [options.persist=false]
     * @returns {boolean} True if history changed
     * @private
     */
    _flushIntroEditSession(text = null, { persist = false } = {}) {
        if (this._introEditTimer) {
            clearTimeout(this._introEditTimer);
            this._introEditTimer = null;
        }
        const raw = typeof text === 'string'
            ? text
            : (this.modal?.querySelector('#aiSynthesisContent .synthesis-intro-text')?.textContent || '');
        const cleanText = raw.replace(/\s+/g, ' ').trim();
        if (!cleanText) return false;

        this._ensureIntroHistorySeeded(this._extractIntroTextFromRaw(this.cachedSynthesisRawText));
        const res = HistoryUtils.upsertEditVersion(this._introHistoryState, cleanText, this._introEditSession, {
            appreciationSource: 'manual',
            aiModel: this.cachedSynthesisModel || null,
            tokenUsage: null
        });
        this._introEditSession = res.session;

        if (res.changed) {
            this._updateIntroHistoryUI();
            if (persist) {
                this._syncManualSynthesisEdit();
            }
        }
        return res.changed;
    },

    /**
     * End the active manual-edit coalescing session on Synthèse globale.
     * @private
     */
    _endIntroEditSession() {
        if (this._introEditTimer) {
            clearTimeout(this._introEditTimer);
            this._introEditTimer = null;
        }
        this._introEditSession = HistoryUtils.createEditSession();
    },

    /**
     * True while an intro/version progressive reveal animation is actively in flight.
     * Prevents reading transitional DOM text as a manual edit during rapid version switches.
     * @param {HTMLElement|null} [introEl=null]
     * @returns {boolean}
     * @private
     */
    _isIntroRevealActive(introEl = null) {
        const el = introEl || this.modal?.querySelector('#aiSynthesisContent .synthesis-intro-text');
        return Boolean(
            this._isIntroVersionAnimating
            || el?._activeRevealId
            || el?.classList?.contains('progressive-reveal-container')
        );
    },

    /**
     * Resolve the canonical intro text, preferring the committed synthesis state while an intro reveal animation is in flight.
     * @param {HTMLElement|null} [introEl=null]
     * @returns {string}
     * @private
     */
    _getCanonicalIntroText(introEl = null) {
        const el = introEl || this.modal?.querySelector('#aiSynthesisContent .synthesis-intro-text');
        const domText = (el?.innerText || el?.textContent || '').trim();
        if (this._isIntroRevealActive(el)) {
            return this._extractIntroTextFromRaw(this.cachedSynthesisRawText) || domText;
        }
        return domText;
    },

    /**
     * Invalidate any in-flight intro version reveal and cancel active HTML reveal timers.
     * @private
     */
    _cancelIntroReveal() {
        this._introRenderSeq += 1;
        this._isIntroVersionAnimating = false;
        const content = this.modal?.querySelector('#aiSynthesisContent');
        const introEl = content?.querySelector('.synthesis-intro-text');
        if (introEl) UI.cancelHtmlReveal?.(introEl);
        if (content) UI.cancelHtmlReveal?.(content);
    },

    /**
     * Check whether Ctrl+Z in `.synthesis-intro-text` should step back in version history.
     * @param {string} currentText
     * @returns {boolean}
     * @private
     */
    _canUndoIntroWithPending(currentText = '') {
        if (this._activeGenerations.has(this._getContextKey())) return false;
        const state = this._introHistoryState;
        if (!state || !Array.isArray(state.versions) || state.versions.length === 0) return false;
        if (HistoryUtils.canUndo(state)) return true;

        const clean = String(currentText || '').trim();
        const activeContent = HistoryUtils.getVersionContent(state.versions[state.currentIndex]).trim();
        return Boolean(clean && activeContent && clean !== activeContent);
    },

    /**
     * Update the live word/character counter in the Synthèse globale header.
     * @param {string|null} [textOverride=null]
     * @private
     */
    _updateIntroWordCount(textOverride = null) {
        if (!this.modal) return;
        const introEl = this.modal.querySelector('#aiSynthesisContent .synthesis-intro-text');
        const countEl = this.modal.querySelector('#aiSynthesisContent .synthesis-intro-word-count');
        if (!countEl) return;

        const text = typeof textOverride === 'string'
            ? textOverride.trim()
            : (introEl?.innerText || introEl?.textContent || '').trim();
        const words = Utils.countWords(text);
        const chars = Utils.countCharacters(text);

        if (!words) {
            countEl.textContent = '';
            countEl.hidden = true;
            return;
        }

        const label = `${words} mot${words > 1 ? 's' : ''}`;
        countEl.textContent = label;
        countEl.hidden = false;
        const tooltipText = `${label} · ${chars} car.`;
        if (countEl._tippy) {
            TooltipsUI.updateTooltip(countEl, tooltipText);
        } else {
            countEl.dataset.tooltip = tooltipText;
        }
    },

    /**
     * Synchronize the shared `< x/y >` history stepper inside the Appréciation de classe header.
     * @private
     */
    _updateIntroHistoryUI() {
        if (!this.modal) return;
        const groupEl = this.modal.querySelector('#aiSynthesisContent .synthesis-intro-history-group');
        if (!groupEl) return;

        const prevBtn = groupEl.querySelector('[data-action="synthesis-history-prev"]');
        const indicatorBtn = groupEl.querySelector('[data-action="synthesis-history-indicator"]');
        const nextBtn = groupEl.querySelector('[data-action="synthesis-history-next"]');
        const isBusy = this._activeGenerations.has(this._getContextKey());

        HistoryPopoverUI.syncStepperUI({
            groupEl,
            prevBtn,
            indicatorBtn,
            nextBtn,
            state: this._introHistoryState,
            isCurrentlyEmpty: false,
            isBusy,
            onHide: () => this.closeIntroHistoryPopover()
        });
    },

    /**
     * Toggle the shared version history popover anchored to the Appréciation de classe stepper.
     */
    showIntroHistoryPopover() {
        if (!this._ensureModal()) return;
        if (this._activeGenerations.has(this._getContextKey())) return;

        const introEl = this.modal.querySelector('#aiSynthesisContent .synthesis-intro-text');
        if (introEl && !this._isIntroRevealActive(introEl)) {
            const liveText = (introEl.innerText || introEl.textContent || '').replace(/\s+/g, ' ').trim();
            if (liveText) {
                this._flushIntroEditSession(liveText, { persist: true });
            }
        }

        const indicatorEl = this.modal.querySelector('#aiSynthesisContent [data-action="synthesis-history-indicator"]');
        HistoryPopoverUI.togglePopover({
            popoverId: SYNTHESIS_HISTORY_POPOVER_ID,
            historyKey: SYNTHESIS_HISTORY_KEY,
            indicatorEl,
            state: this._introHistoryState,
            isCurrentlyEmpty: false,
            onSelectVersion: (idx) => this.restoreIntroVersion(idx),
            presentationOptions: { defaultInitialSource: 'ai' }
        });
    },

    /**
     * Close the Appréciation de classe version history popover.
     * @param {Object} [options={}]
     */
    closeIntroHistoryPopover(options = {}) {
        HistoryPopoverUI.closePopover(SYNTHESIS_HISTORY_POPOVER_ID, options);
    },

    /**
     * Reset AI section to placeholder state
     */
    resetAISection() {
        if (!this._ensureModal()) return;
        this._cancelIntroReveal();
        this.closeIntroHistoryPopover();
        this._endIntroEditSession();
        this._clearRefinementToolbarVisuals();
        this._introHistoryState = { versions: [], currentIndex: -1 };
        this._parkRefinementToolbar();

        const content = this.modal?.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');
        const toolbar = this.modal?.querySelector('#aiRefinementToolbar');
        const metaEl = this.modal?.querySelector('#aiSynthesisMeta');

        if (content) {
            delete content.dataset.classId;
            delete content.dataset.period;
            content.innerHTML = `
                <div class="ai-placeholder">
                    <div class="ai-placeholder-glow"></div>
                    <h4 class="ai-placeholder-title">Bilan de la classe</h4>
                    <p class="ai-placeholder-text">Générez le bilan complet de votre classe en un instant. L'IA croise les notes, les évolutions et les appréciations individuelles pour rédiger l'appréciation de classe, les points forts, les points de vigilance et des pistes pédagogiques.</p>
                    <button type="button" class="btn btn-ai tooltip" id="generateSynthesisPlaceholderBtn" data-tooltip="Clic droit : prévisualiser le prompt">
                        <iconify-icon class="iconify-inline" icon="solar:stars-bold-duotone"></iconify-icon> Générer le bilan
                    </button>
                </div>
            `;
            const placeholderBtn = content.querySelector('#generateSynthesisPlaceholderBtn');
            if (placeholderBtn) {
                placeholderBtn.addEventListener('click', () => {
                    this.generateAISynthesis();
                });
            }
            TooltipsUI.initTooltips(content);
        }

        // Reset button state to "Générer" and hide header duplicate while placeholder CTA is visible
        if (generateBtn) {
            UI.hideInlineSpinner?.(generateBtn);
            UI.setGenerateButtonState(generateBtn, 'idle');
            generateBtn.style.display = 'none';
        }

        // Hide copy button
        const copyBtn = this.modal?.querySelector('#copyDashboardSynthesisBtn');
        if (copyBtn) {
            copyBtn.style.display = 'none';
            copyBtn.classList.remove('disabled');
            copyBtn.removeAttribute('aria-disabled');
        }

        // Hide refinement toolbar & synthesis footer meta
        if (toolbar) {
            toolbar.style.display = 'none';
        }
        if (metaEl) {
            metaEl.style.display = 'none';
        }

        this.originalSynthesisHTML = null;
        this.cachedSynthesisHTML = null;
        this.originalSynthesisRawText = null;
        this.cachedSynthesisRawText = null;
    },

    /**
     * Restore cached AI synthesis if it matches current class/period, otherwise reset to placeholder
     * This persists the synthesis between modal open/close operations and sessions (via persistent storage)
     */
    restoreOrResetAISection() {
        if (!this._ensureModal()) return;
        const currentClassId = appState.currentClassId;
        const currentPeriod = appState.currentPeriod;
        const ctxKey = this._getContextKey(currentClassId, currentPeriod);

        // 0. Check if an AI operation is already in flight for this exact (classId, period)
        const activeOp = this._activeGenerations.get(ctxKey);
        const hasActiveOp = Boolean(activeOp && !activeOp.controller.signal.aborted);
        if (hasActiveOp && activeOp.type === 'synthesis') {
            this._applySynthesisLoadingUI();
            return;
        }

        const activeRefinementType = (hasActiveOp && activeOp.type === 'refinement') ? activeOp.refineType : null;
        if (!activeRefinementType) {
            this._clearRefinementToolbarVisuals();
        }

        // 1. Check in-memory cache first (fastest)
        if (this.cachedSynthesisHTML &&
            this.cachedSynthesisClassId === currentClassId &&
            this.cachedSynthesisPeriod === currentPeriod) {

            this._applySynthesisToUI(this.cachedSynthesisHTML);
            this._checkStaleData();
            if (activeRefinementType) {
                this._applyRefinementBusyUI(activeRefinementType);
            }
            return;
        }

        // 2. Check persistent storage (physical class or virtual class map)
        this.closeIntroHistoryPopover();
        this._endIntroEditSession();
        this._introHistoryState = { versions: [], currentIndex: -1 };
        const classes = appState.classes || [];
        const currentClass = classes.find(c => c.id === currentClassId);
        const savedAnalysis = currentClass?.analyses?.[currentPeriod]
            || (ClassManager.isVirtualClass(currentClassId) ? appState.virtualClassAnalyses?.[currentClassId]?.[currentPeriod] : null);

        if (savedAnalysis) {

            if (savedAnalysis.content || savedAnalysis.rawText) {
                const safeContent = this._resolveSafeSynthesisHTML(savedAnalysis.rawText, savedAnalysis.content);
                if (!safeContent) {
                    this.resetAISection();
                    return;
                }
                const hasOriginal = Boolean(savedAnalysis.originalRawText || savedAnalysis.originalContent);
                const safeOriginalContent = hasOriginal
                    ? (this._resolveSafeSynthesisHTML(savedAnalysis.originalRawText, savedAnalysis.originalContent) || safeContent)
                    : safeContent;

                // Hydrate persisted intro history (or seed from saved synthesis text)
                const savedIntroText = this._extractIntroTextFromRaw(savedAnalysis.rawText);
                this._introHistoryState = HistoryUtils.normalizeHistoryState(
                    savedAnalysis.introHistory,
                    savedIntroText,
                    { source: 'original', appreciationSource: 'ai', aiModel: savedAnalysis.model || null }
                );

                // Update in-memory cache before rendering so stepper & tooltips resolve metadata cleanly
                this.cachedSynthesisHTML = safeContent;
                this.originalSynthesisHTML = safeOriginalContent;
                this.cachedSynthesisRawText = savedAnalysis.rawText || '';
                this.originalSynthesisRawText = savedAnalysis.originalRawText || savedAnalysis.rawText || '';
                this.cachedSynthesisClassId = currentClassId;
                this.cachedSynthesisPeriod = currentPeriod;
                this.cachedSynthesisDataHash = savedAnalysis.dataHash || null;
                this.cachedSynthesisModel = savedAnalysis.model || null;
                this.cachedSynthesisSubject = savedAnalysis.subject || null;

                this._applySynthesisToUI(safeContent);

                this._updateRevertButtonState();
                this._checkStaleData();
                if (activeRefinementType) {
                    this._applyRefinementBusyUI(activeRefinementType);
                }
                return;
            }
        }

        // 3. No matching cache or saved data, reset to placeholder
        this.resetAISection();
    },

    /**
     * Check if the current data differs from the data used for synthesis
     * Updates the UI button if data is stale
     * @private
     */
    _checkStaleData() {
        if (!this._ensureModal()) return;
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');
        if (!generateBtn || !this.cachedStats || !this.cachedSynthesisDataHash) return;

        const dataChanged = this.cachedStats.dataHash !== this.cachedSynthesisDataHash;
        generateBtn.removeAttribute('title');

        if (dataChanged) {
            UI.setGenerateButtonState(generateBtn, 'dirty');
            TooltipsUI.updateTooltip(
                generateBtn,
                'Les données (notes ou appréciations) ont changé depuis la dernière génération.<br><span class="kbd-hint">Clic droit : prévisualiser le prompt</span>'
            );
        } else {
            UI.setGenerateButtonState(generateBtn, 'done');
            TooltipsUI.updateTooltip(generateBtn, 'Clic droit : prévisualiser le prompt');
        }
    },

    /**
     * Determine whether the current synthesis differs from the original generated version
     * @returns {boolean}
     * @private
     */
    _hasSynthesisChangedFromOriginal() {
        if (!this.originalSynthesisHTML || !this.cachedSynthesisHTML) return false;
        if (this.originalSynthesisHTML === this.cachedSynthesisHTML) return false;

        if (this.originalSynthesisRawText && this.cachedSynthesisRawText) {
            try {
                const origObj = JSON.parse(this.originalSynthesisRawText);
                const currObj = JSON.parse(this.cachedSynthesisRawText);
                return JSON.stringify(origObj) !== JSON.stringify(currObj);
            } catch (e) {
                return this.originalSynthesisRawText.trim() !== this.cachedSynthesisRawText.trim();
            }
        }

        return true;
    },

    /**
     * Determine whether any of the 3 bullet cards (Points forts, Vigilances, Recommandations)
     * differs from the original generated synthesis.
     * Used for `#revertSynthesisBtn` visibility so intro-only refinements stay handled solely by `< x/y >`.
     * @returns {boolean}
     * @private
     */
    _hasBulletSectionsChangedFromOriginal() {
        if (!this.originalSynthesisHTML || !this.cachedSynthesisHTML) return false;
        if (this.originalSynthesisHTML === this.cachedSynthesisHTML) return false;

        if (this.originalSynthesisRawText && this.cachedSynthesisRawText) {
            try {
                const origObj = JSON.parse(this.originalSynthesisRawText);
                const currObj = JSON.parse(this.cachedSynthesisRawText);
                const pickLists = (obj) => ({
                    strengths: obj?.strengths || obj?.strength || [],
                    vigilances: obj?.vigilances || obj?.vigilance || [],
                    recommendations: obj?.recommendations || obj?.recommendation || []
                });
                return JSON.stringify(pickLists(origObj)) !== JSON.stringify(pickLists(currObj));
            } catch (_) {
                return this.originalSynthesisRawText.trim() !== this.cachedSynthesisRawText.trim();
            }
        }

        return true;
    },

    /**
     * Show or hide the footer revert button solely when the 3 bullet cards were edited
     * (the Synthèse globale intro paragraph has its own `< x/y >` version stepper in its header).
     * @private
     */
    _updateRevertButtonState() {
        if (!this._ensureModal()) return;
        const revertBtn = this.modal?.querySelector('#revertSynthesisBtn');
        if (!revertBtn) return;

        const hasBulletChanges = this._hasBulletSectionsChangedFromOriginal();
        revertBtn.style.display = hasBulletChanges ? 'inline-flex' : 'none';
        const hintEl = this.modal?.querySelector('#aiSynthesisMeta .synthesis-meta-hint');
        if (hintEl) {
            hintEl.hidden = hasBulletChanges;
        }
    },

    /**
     * Build the HTML for a section header's "+" button.
     * @param {{key: string, addTooltip: string}} cfg
     * @returns {string}
     * @private
     */
    _buildSectionAddButtonHTML(cfg) {
        return `<button type="button" class="journal-header-btn icon-only analysis-add-item-btn tooltip" data-synthesis-add="${cfg.key}" data-tooltip="${Utils.escapeHtml(cfg.addTooltip)}" aria-label="${Utils.escapeHtml(cfg.addTooltip)}"><iconify-icon icon="ph:plus" aria-hidden="true"></iconify-icon></button>`;
    },

    /**
     * Build the HTML for an empty list section placeholder.
     * @param {{key: string, emptyIcon: string, emptyText: string}} cfg
     * @returns {string}
     * @private
     */
    _buildSectionPlaceholderHTML(cfg) {
        return `<button type="button" class="analysis-placeholder" data-synthesis-add="${cfg.key}"><iconify-icon icon="${cfg.emptyIcon}" aria-hidden="true"></iconify-icon><span>${Utils.escapeHtml(cfg.emptyText)}</span></button>`;
    },

    /**
     * Build the HTML for one of the 3 synthesis list cards (Points forts / Points de vigilance / Recommandations).
     * @param {Object} cfg - Entry from SYNTHESIS_LIST_SECTIONS
     * @param {string[]} items
     * @returns {string}
     * @private
     */
    _buildListSectionHTML(cfg, items) {
        const cleanItems = Array.isArray(items)
            ? items.map(item => String(item ?? '').trim()).filter(Boolean)
            : [];
        const bodyHtml = cleanItems.length > 0
            ? `<ul class="synthesis-list">${cleanItems.map(item => `<li contenteditable="true" spellcheck="true">${Utils.escapeHtml(item)}</li>`).join('')}</ul>`
            : this._buildSectionPlaceholderHTML(cfg);

        return `
            <div class="synthesis-section synthesis-section--${cfg.color}" data-synthesis-section="${cfg.key}">
                <div class="synthesis-section-header">
                    <iconify-icon icon="${cfg.icon}"></iconify-icon>
                    <span>${Utils.escapeHtml(cfg.title)}</span>
                    ${this._buildSectionAddButtonHTML(cfg)}
                </div>
                <div class="synthesis-section-content">
                    ${bodyHtml}
                </div>
            </div>
        `;
    },

    /**
     * Hydrate synthesis DOM with quick-copy button, "+" add buttons, embedded refinement toolbar,
     * inline contenteditable attributes, and tooltips
     * (Ensures backward compatibility for analyses restored from persistent storage)
     * @param {HTMLElement|null} container
     * @private
     */
    _enhanceSynthesisDOM(container) {
        if (!container) return;

        const introHeader = container.querySelector('.synthesis-intro-header');
        if (introHeader) {
            const introIcon = introHeader.querySelector(':scope > iconify-icon');
            if (introIcon && introIcon.getAttribute('icon') !== 'solar:stars-bold-duotone') {
                introIcon.setAttribute('icon', 'solar:stars-bold-duotone');
            }

            const introTitleSpan = introHeader.querySelector(':scope > span');
            if (introTitleSpan && /^synth[èe]se(?:\s+globale|\s+de\s+la\s+classe)?$/i.test(introTitleSpan.textContent.trim())) {
                introTitleSpan.textContent = 'Appréciation de classe';
            }

            let metaGroup = introHeader.querySelector('.synthesis-intro-meta');
            if (!metaGroup) {
                metaGroup = document.createElement('div');
                metaGroup.className = 'synthesis-intro-meta';
                introHeader.appendChild(metaGroup);
            }

            // Remove legacy one-way undo button if hydrated from older persisted HTML
            metaGroup.querySelector('.synthesis-intro-undo-btn')?.remove();

            if (!metaGroup.querySelector('.synthesis-intro-history-group')) {
                metaGroup.insertAdjacentHTML('afterbegin', HistoryPopoverUI.buildStepperHTML({
                    groupClass: 'synthesis-intro-history-group',
                    prevAction: 'synthesis-history-prev',
                    indicatorAction: 'synthesis-history-indicator',
                    nextAction: 'synthesis-history-next'
                }));
            }

            let wordCountEl = metaGroup.querySelector('.synthesis-intro-word-count');
            if (!wordCountEl) {
                wordCountEl = document.createElement('span');
                wordCountEl.className = 'synthesis-intro-word-count tooltip';
                wordCountEl.setAttribute('aria-live', 'polite');
                metaGroup.appendChild(wordCountEl);
            }

            let copyBtn = introHeader.querySelector('.synthesis-intro-copy-btn');
            if (!copyBtn) {
                copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.dataset.action = 'copy-intro-synthesis';
            }
            if (copyBtn.parentElement !== metaGroup) {
                metaGroup.appendChild(copyBtn);
            }
            copyBtn.className = 'synthesis-intro-copy-btn tooltip';
            copyBtn.dataset.tooltip = "Copier l'appréciation de classe (texte seul)";
            copyBtn.setAttribute('aria-label', "Copier l'appréciation de classe");
            const labelSpan = copyBtn.querySelector('span');
            if (!labelSpan || labelSpan.textContent.trim() === 'Copier le texte') {
                copyBtn.innerHTML = '<iconify-icon icon="solar:copy-linear" aria-hidden="true"></iconify-icon><span>Copier</span>';
            }
        }

        const introCard = container.querySelector('.synthesis-intro-card');
        const toolbar = this.modal?.querySelector('#aiRefinementToolbar');
        if (introCard && toolbar) {
            introCard.appendChild(toolbar);
            toolbar.classList.add('is-embedded');
        } else if (toolbar) {
            this._parkRefinementToolbar();
        }

        SYNTHESIS_LIST_SECTIONS.forEach(cfg => {
            const sec = container.querySelector(`.synthesis-section--${cfg.color}`);
            if (!sec) return;
            if (!sec.dataset.synthesisSection) {
                sec.dataset.synthesisSection = cfg.key;
            }
            const header = sec.querySelector('.synthesis-section-header');
            const headerIcon = header?.querySelector(':scope > iconify-icon');
            if (headerIcon && headerIcon.getAttribute('icon') !== cfg.icon) {
                headerIcon.setAttribute('icon', cfg.icon);
            }
            if (cfg.key === 'recommendations') {
                const headerTitleSpan = header?.querySelector(':scope > span');
                if (headerTitleSpan && /^recommandations?$/i.test(headerTitleSpan.textContent.trim())) {
                    headerTitleSpan.textContent = cfg.title;
                }
                const placeholderSpan = sec.querySelector('.analysis-placeholder span');
                if (placeholderSpan && /recommandation/i.test(placeholderSpan.textContent)) {
                    placeholderSpan.textContent = cfg.emptyText;
                }
            }
            const existingAddBtn = header?.querySelector('.analysis-add-item-btn');
            if (header && !existingAddBtn) {
                header.insertAdjacentHTML('beforeend', this._buildSectionAddButtonHTML(cfg));
            } else if (existingAddBtn) {
                existingAddBtn.dataset.tooltip = cfg.addTooltip;
                existingAddBtn.setAttribute('aria-label', cfg.addTooltip);
            }
        });

        container.querySelectorAll('.synthesis-intro-text, .synthesis-list li').forEach(el => {
            el.setAttribute('contenteditable', 'true');
            el.setAttribute('spellcheck', 'true');
        });

        this._ensureIntroHistorySeeded();
        this._updateIntroWordCount();
        this._updateIntroHistoryUI();
        TooltipsUI.initTooltips(container);
    },

    /**
     * Validate and persist an ongoing inline contenteditable edit before closing, copying, exporting or regenerating.
     * @param {Object} [options={}]
     * @param {boolean} [options.blur=true]
     */
    flushPendingEdit({ blur = true } = {}) {
        const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
        const editable = activeEl?.closest?.('#classDashboardModal #aiSynthesisContent [contenteditable="true"]');
        if (!editable) return;
        if (editable.classList.contains('synthesis-intro-text') && this._isIntroRevealActive(editable)) {
            return;
        }
        if (!blur) {
            const cleanedText = (editable.innerText || editable.textContent || '').replace(/\s+/g, ' ').trim();
            const initialText = editable._initialTextBeforeEdit ?? '';
            if (cleanedText && cleanedText !== initialText) {
                if (editable.classList.contains('synthesis-intro-text')) {
                    if (initialText) {
                        this._ensureIntroHistorySeeded(initialText);
                    }
                    this._flushIntroEditSession(cleanedText, { persist: false });
                }
                editable._initialTextBeforeEdit = cleanedText;
                this._syncManualSynthesisEdit();
            }
            return;
        }
        this._handleEditableBlur(editable);
        if (document.activeElement === editable) {
            editable.blur();
        }
    },

    /**
     * Add a new inline-editable bullet to a class synthesis card and focus it.
     * @param {'strengths'|'vigilances'|'recommendations'} sectionKey
     * @param {HTMLElement|null} [sectionEl=null]
     */
    addSynthesisItem(sectionKey, sectionEl = null) {
        if (!this._ensureModal()) return;
        const cfg = SYNTHESIS_LIST_SECTIONS.find(s => s.key === sectionKey);
        if (!cfg) return;

        const targetSection = sectionEl ||
            this.modal?.querySelector(`#aiSynthesisContent .synthesis-section[data-synthesis-section="${sectionKey}"]`) ||
            this.modal?.querySelector(`#aiSynthesisContent .synthesis-section--${cfg.color}`);
        const contentEl = targetSection?.querySelector('.synthesis-section-content');
        if (!contentEl) return;

        let list = contentEl.querySelector('.synthesis-list');
        if (!list) {
            contentEl.innerHTML = '<ul class="synthesis-list"></ul>';
            list = contentEl.querySelector('.synthesis-list');
        }

        const li = document.createElement('li');
        li.setAttribute('contenteditable', 'true');
        li.setAttribute('spellcheck', 'true');
        li._initialTextBeforeEdit = '';
        list.appendChild(li);
        li.focus();
    },

    /**
     * Cancel an ongoing inline edit and restore initial text (removing empty new bullets).
     * @param {HTMLElement} editable
     */
    cancelEditableItem(editable) {
        if (!editable) return;
        editable._cancelEdit = true;
        editable.textContent = editable._initialTextBeforeEdit ?? '';
        editable.blur();
    },

    /**
     * Restore a section's empty placeholder when its last bullet is removed.
     * @param {HTMLElement|null} sectionEl
     * @private
     */
    _restoreSectionPlaceholder(sectionEl) {
        if (!sectionEl) return;
        const contentEl = sectionEl.querySelector('.synthesis-section-content');
        if (!contentEl) return;
        const key = sectionEl.dataset.synthesisSection;
        const cfg = SYNTHESIS_LIST_SECTIONS.find(s =>
            (key && s.key === key) || sectionEl.classList.contains(`synthesis-section--${s.color}`)
        );
        if (cfg) {
            contentEl.innerHTML = this._buildSectionPlaceholderHTML(cfg);
        }
    },

    /**
     * Handle blur on an inline-editable synthesis element, normalizing text and persisting changes
     * @param {HTMLElement} editable
     * @private
     */
    _handleEditableBlur(editable) {
        if (!editable || !editable.isConnected) return;
        if (editable.classList.contains('synthesis-intro-text') && this._isIntroRevealActive(editable)) {
            return;
        }

        const wasCancelled = Boolean(editable._cancelEdit);
        delete editable._cancelEdit;

        const cleanedText = (editable.innerText || editable.textContent || '').replace(/\s+/g, ' ').trim();
        const initialText = editable._initialTextBeforeEdit ?? '';
        const sectionEl = editable.closest('.synthesis-section');

        if (wasCancelled) {
            if (editable.tagName === 'LI' && !cleanedText) {
                const parentList = editable.closest('.synthesis-list');
                editable.remove();
                if (parentList && parentList.querySelectorAll('li').length === 0) {
                    this._restoreSectionPlaceholder(sectionEl);
                }
            }
            return;
        }

        if (!cleanedText) {
            if (editable.tagName === 'LI') {
                const parentList = editable.closest('.synthesis-list');
                editable.remove();
                if (parentList && parentList.querySelectorAll('li').length === 0) {
                    this._restoreSectionPlaceholder(sectionEl);
                }
                this._syncManualSynthesisEdit();
                return;
            }
            editable.textContent = initialText;
            if (editable.classList.contains('synthesis-intro-text')) {
                this._endIntroEditSession();
                this._updateIntroWordCount();
                this._updateIntroHistoryUI();
            }
            return;
        }

        editable.textContent = cleanedText;

        if (cleanedText === initialText) {
            if (editable.classList.contains('synthesis-intro-text')) {
                this._endIntroEditSession();
                this._updateIntroWordCount();
                this._updateIntroHistoryUI();
            }
            return;
        }

        if (editable.classList.contains('synthesis-intro-text')) {
            if (initialText) {
                this._ensureIntroHistorySeeded(initialText);
            }
            this._flushIntroEditSession(cleanedText, { persist: false });
            this._endIntroEditSession();
        }

        editable._initialTextBeforeEdit = cleanedText;
        this._syncManualSynthesisEdit();
        if (editable.classList.contains('synthesis-intro-text')) {
            this._updateIntroWordCount();
            this._updateIntroHistoryUI();
        }
    },

    /**
     * Extract the structured 4-key synthesis payload from a rendered `.ai-synthesis-text` container.
     * @param {HTMLElement|null} synthesisContainer
     * @returns {{synthesis: string, strengths: string[], vigilances: string[], recommendations: string[]}|null}
     * @private
     */
    _readSynthesisPayloadFromDOM(synthesisContainer) {
        if (!synthesisContainer) return null;
        if (synthesisContainer.querySelector('.synthesis-section--primary')) return null;

        const introEl = synthesisContainer.querySelector('.synthesis-intro-text');
        const lists = {};
        let hasListItems = false;

        SYNTHESIS_LIST_SECTIONS.forEach(cfg => {
            const items = Array.from(
                synthesisContainer.querySelectorAll(`.synthesis-section--${cfg.color} .synthesis-list li`)
            )
                .map(li => (li.innerText || li.textContent || '').trim())
                .filter(Boolean);
            lists[cfg.key] = items;
            if (items.length > 0) hasListItems = true;
        });

        if (!introEl && !synthesisContainer.querySelector('[data-synthesis-section]') && !hasListItems) {
            return null;
        }

        return {
            synthesis: introEl ? this._getCanonicalIntroText(introEl) : '',
            strengths: lists.strengths || [],
            vigilances: lists.vigilances || [],
            recommendations: lists.recommendations || []
        };
    },

    /**
     * Synchronize manual DOM edits in #aiSynthesisContent with in-memory cache,
     * rawText JSON (for subsequent AI refinements), persistent storage, and revert button.
     * @private
     */
    _syncManualSynthesisEdit() {
        if (!this._ensureModal()) return;
        const contentDiv = this.modal?.querySelector('#aiSynthesisContent');
        const synthesisContainer = contentDiv?.querySelector('.ai-synthesis-text');
        if (!synthesisContainer) return;

        const payload = this._readSynthesisPayloadFromDOM(synthesisContainer);

        let serializedRawText = '';
        let canonicalHTML = '';

        if (payload) {
            serializedRawText = JSON.stringify(payload);
            canonicalHTML = `<div class="ai-synthesis-text">${this._formatSynthesisText(serializedRawText)}</div>`;
        } else {
            const clone = synthesisContainer.cloneNode(true);
            clone.querySelector('#aiRefinementToolbar')?.remove();
            clone.querySelectorAll('.copied').forEach(el => el.classList.remove('copied'));
            canonicalHTML = clone.outerHTML;
            serializedRawText = (clone.innerText || clone.textContent || '').trim();
        }

        if (!this.originalSynthesisHTML) {
            this.originalSynthesisHTML = this.cachedSynthesisHTML || canonicalHTML;
        }

        this.cachedSynthesisHTML = canonicalHTML;
        this.cachedSynthesisRawText = serializedRawText;
        this.cachedSynthesisClassId = this.cachedSynthesisClassId ?? appState.currentClassId;
        this.cachedSynthesisPeriod = this.cachedSynthesisPeriod || appState.currentPeriod;

        this._saveSynthesisToStorage(canonicalHTML, this.cachedSynthesisDataHash, {
            classId: this.cachedSynthesisClassId,
            period: this.cachedSynthesisPeriod,
            rawText: serializedRawText
        });

        this._updateRevertButtonState();
    },

    /**
     * Resolve synthesis HTML safely: prioritize rebuilding from rawText via _formatSynthesisText,
     * otherwise sanitize legacy HTML with a strict tag/attribute allowlist.
     * @param {string|null|undefined} rawText
     * @param {string|null|undefined} legacyHtml
     * @returns {string}
     * @private
     */
    _resolveSafeSynthesisHTML(rawText, legacyHtml) {
        if (typeof rawText === 'string' && rawText.trim()) {
            return `<div class="ai-synthesis-text">${this._formatSynthesisText(rawText)}</div>`;
        }
        if (typeof legacyHtml === 'string' && legacyHtml.trim()) {
            return this._sanitizeLegacySynthesisHTML(legacyHtml);
        }
        return '';
    },

    /**
     * Sanitize legacy persisted synthesis HTML using an inert document and a strict allowlist.
     * Prevents stored XSS from untrusted JSON backups lacking rawText.
     * @param {string} html
     * @returns {string}
     * @private
     */
    _sanitizeLegacySynthesisHTML(html) {
        if (typeof html !== 'string' || !html.trim()) return '';
        if (typeof DOMParser !== 'function' || typeof document === 'undefined') {
            return `<p>${Utils.escapeHtml(html)}</p>`;
        }

        const ALLOWED_TAGS = new Set([
            'DIV', 'P', 'UL', 'OL', 'LI', 'SPAN', 'STRONG', 'EM', 'B', 'I', 'BR',
            'H3', 'H4', 'BUTTON', 'ICONIFY-ICON'
        ]);
        const SAFE_TEXT_ATTRS = new Set([
            'class', 'aria-label', 'aria-hidden', 'data-tooltip',
            'data-action', 'data-synthesis-section', 'data-synthesis-add'
        ]);

        return DOMHelper.sanitizeHTML(html, {
            allowedTags: ALLOWED_TAGS,
            sanitizeAttr: (tag, name, value) => {
                if (SAFE_TEXT_ATTRS.has(name)) return value;
                if ((name === 'contenteditable' || name === 'spellcheck') && (value === 'true' || value === 'false')) {
                    return value;
                }
                if (tag === 'BUTTON' && name === 'type') return 'button';
                if (tag === 'ICONIFY-ICON' && name === 'icon' && /^[a-z0-9:_-]+$/i.test(value)) {
                    return value;
                }
                return null;
            }
        });
    },

    /**
     * Apply synthesis HTML to the UI and update button state
     * @param {string} htmlContent - HTML to render
     * @param {boolean} [animate=false] - Whether to animate the reveal
     * @param {AbortSignal|null} [signal=null] - Optional abort signal for reveal animation
     * @private
     */
    async _applySynthesisToUI(htmlContent, animate = false, signal = null) {
        if (!this._ensureModal()) return;
        this._cancelIntroReveal();
        this._parkRefinementToolbar();

        const content = this.modal?.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');
        const toolbar = this.modal?.querySelector('#aiRefinementToolbar');
        const metaEl = this.modal?.querySelector('#aiSynthesisMeta');

        if (content) {
            content.dataset.classId = String(appState.currentClassId || '');
            content.dataset.period = String(appState.currentPeriod || '');
            if (animate) {
                await UI.animateHtmlReveal(content, htmlContent, signal ? { signal } : undefined);
                if (signal?.aborted) return;
            } else {
                content.innerHTML = htmlContent;
            }
            this._enhanceSynthesisDOM(content);
        }

        // Update button to show "Régénérer" since synthesis exists
        if (generateBtn) {
            UI.hideInlineSpinner?.(generateBtn);
            generateBtn.style.display = 'inline-flex';
            UI.setGenerateButtonState(generateBtn, 'done');
            generateBtn.removeAttribute('title');
            TooltipsUI.updateTooltip(generateBtn, 'Clic droit : prévisualiser le prompt');
        }

        // Toggle copy button display next to generate button
        const copyBtn = this.modal?.querySelector('#copyDashboardSynthesisBtn');
        if (copyBtn) {
            copyBtn.style.display = 'inline-flex';
            copyBtn.classList.remove('disabled');
            copyBtn.removeAttribute('aria-disabled');
        }

        // Show refinement toolbar & synthesis meta footer
        if (toolbar) {
            toolbar.style.display = 'flex';
        }
        if (metaEl) {
            metaEl.style.display = 'flex';
            this._updateSynthesisMeta(this.cachedStats);
        }

        // Update revert button visibility
        this._updateRevertButtonState();
    },

    /**
     * Restore a previously captured synthesis snapshot (storage, in-memory cache, and UI).
     * @param {string} targetClassId
     * @param {string} targetPeriod
     * @param {Object} snapshot
     * @private
     */
    async _restorePreviousSnapshot(targetClassId, targetPeriod, snapshot) {
        if (!snapshot?.html) return;
        const restoredIntroHistory = HistoryUtils.normalizeHistoryState(
            snapshot.introHistory,
            this._extractIntroTextFromRaw(snapshot.rawText),
            { source: 'original', appreciationSource: 'ai', aiModel: snapshot.model || null }
        );
        this._saveSynthesisToStorage(snapshot.html, snapshot.dataHash, {
            classId: targetClassId,
            period: targetPeriod,
            model: snapshot.model,
            subject: snapshot.subject,
            originalContent: snapshot.originalHtml,
            rawText: snapshot.rawText,
            originalRawText: snapshot.originalRawText,
            introHistory: restoredIntroHistory
        });

        if (appState.currentClassId === targetClassId && appState.currentPeriod === targetPeriod) {
            this._endIntroEditSession();
            this.closeIntroHistoryPopover();
            this._introHistoryState = restoredIntroHistory;
            this.cachedSynthesisHTML = snapshot.html;
            this.originalSynthesisHTML = snapshot.originalHtml;
            this.cachedSynthesisRawText = snapshot.rawText;
            this.originalSynthesisRawText = snapshot.originalRawText;
            this.cachedSynthesisClassId = targetClassId;
            this.cachedSynthesisPeriod = targetPeriod;
            this.cachedSynthesisDataHash = snapshot.dataHash;
            this.cachedSynthesisModel = snapshot.model;
            this.cachedSynthesisSubject = snapshot.subject;

            if (this._ensureModal()) {
                await this._applySynthesisToUI(snapshot.html, false);
                this._checkStaleData();
            }
        }
        UI.showNotification('Bilan précédent rétabli.', 'success');
    },

    /**
     * Generate AI synthesis based on calculated statistics (cancellable via #generateSynthesisBtn or header pill)
     */
    async generateAISynthesis() {
        if (!this._ensureModal()) return;

        const targetClassId = appState.currentClassId;
        const targetPeriod = appState.currentPeriod;
        const ctxKey = this._getContextKey(targetClassId, targetPeriod);

        // Click-to-cancel if any AI operation (full synthesis or intro refinement) is running for this class/period
        const active = this._activeGenerations.get(ctxKey);
        if (active) {
            if (Date.now() - (active.startedAt || 0) < 350) return;
            this.cancelGeneration(targetClassId, targetPeriod);
            return;
        }

        this.flushPendingEdit();
        if (this._isOfflineForActiveModel()) {
            UI.showNotification("Mode hors-ligne : connexion Internet requise pour générer avec l'IA.", 'warning');
            return;
        }
        if (!UI.checkAPIKeyPresence()) return;

        const content = this.modal?.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');

        if (!content || !this.cachedStats) return;

        const targetModel = appState.currentAIModel;
        const targetSubject = appState.currentSubject;

        const hasExistingForContext = Boolean(
            this.cachedSynthesisHTML &&
            this.cachedSynthesisClassId === targetClassId &&
            this.cachedSynthesisPeriod === targetPeriod
        );
        if (hasExistingForContext) {
            this._ensureIntroHistorySeeded();
        }
        const previousSnapshot = hasExistingForContext ? {
            html: this.cachedSynthesisHTML,
            rawText: this.cachedSynthesisRawText || '',
            originalHtml: this.originalSynthesisHTML || this.cachedSynthesisHTML,
            originalRawText: this.originalSynthesisRawText || this.cachedSynthesisRawText || '',
            dataHash: this.cachedSynthesisDataHash || null,
            model: this.cachedSynthesisModel || null,
            subject: this.cachedSynthesisSubject || null,
            hadEdits: this._hasSynthesisChangedFromOriginal(),
            introHistory: Utils.deepClone(this._introHistoryState)
        } : null;

        this.closeIntroHistoryPopover();
        this._endIntroEditSession();

        const abortController = new AbortController();
        const { signal } = abortController;
        this._activeGenerations.set(ctxKey, {
            type: 'synthesis',
            refineType: null,
            controller: abortController,
            classId: targetClassId,
            period: targetPeriod,
            startedAt: Date.now(),
            previousSnapshot
        });

        this._applySynthesisLoadingUI();
        let buttonSynced = false;

        try {
            const stats = this.cachedStats;
            const { systemPrompt, userPrompt } = this.buildAIPrompt(stats);

            const response = await AIService.callAIWithFallback(userPrompt, {
                systemPrompt,
                taskType: 'class-synthesis',
                context: 'class-synthesis',
                signal
            });
            if (signal.aborted) return;

            // Reject truncated/malformed JSON so raw `{ "synthesis": ...` is never rendered or persisted
            const jsonCheck = AIService._inspectJsonResponse?.(response.text);
            if (jsonCheck?.looksLikeJson && !jsonCheck.isValidObject) {
                throw new Error("La réponse de l'IA a été tronquée (JSON incomplet). Réessayez ou changez de modèle.");
            }

            const usedModel = response.modelUsed || targetModel;

            // Parse the response into structured sections
            const formattedText = this._formatSynthesisText(response.text);
            const synthesisHTML = `<div class="ai-synthesis-text">${formattedText}</div>`;

            const stillOnSameContext = appState.currentClassId === targetClassId && appState.currentPeriod === targetPeriod;
            const isClosed = this._isModalVisiblyClosed();

            // Build updated intro version history (preserving prior versions on regeneration so teacher can compare)
            const newIntroText = this._extractIntroTextFromRaw(response.text);
            const nextIntroHistory = previousSnapshot?.introHistory
                ? HistoryUtils.normalizeHistoryState(previousSnapshot.introHistory)
                : { versions: [], currentIndex: -1 };
            const hadPriorIntro = nextIntroHistory.versions.length > 0;
            if (newIntroText) {
                HistoryUtils.pushToState(
                    nextIntroHistory,
                    newIntroText,
                    hadPriorIntro ? 'regenerate' : 'original',
                    'ai',
                    usedModel,
                    null
                );
            }

            // PERSISTENCE: Save to Class Object in Storage for the target class/period
            this._saveSynthesisToStorage(synthesisHTML, stats.dataHash, {
                classId: targetClassId,
                period: targetPeriod,
                model: usedModel,
                subject: targetSubject,
                originalContent: synthesisHTML,
                rawText: response.text,
                originalRawText: response.text,
                introHistory: nextIntroHistory
            });

            if (stillOnSameContext) {
                this._introHistoryState = nextIntroHistory;
                this.cachedSynthesisHTML = synthesisHTML;
                this.originalSynthesisHTML = synthesisHTML;
                this.cachedSynthesisRawText = response.text;
                this.originalSynthesisRawText = response.text;
                this.cachedSynthesisClassId = targetClassId;
                this.cachedSynthesisDataHash = stats.dataHash;
                this.cachedSynthesisPeriod = targetPeriod;
                this.cachedSynthesisModel = usedModel;
                this.cachedSynthesisSubject = targetSubject;

                await this._applySynthesisToUI(synthesisHTML, !isClosed, signal);
                if (signal.aborted) return;
                this._checkStaleData();
                buttonSynced = true;

                if (isClosed) {
                    UI.showNotification('Analyse de la classe prête.', 'success', 5000, {
                        bypassCoalescing: true,
                        action: {
                            label: 'Voir',
                            onClick: () => this.openDashboard()
                        }
                    });
                } else if (previousSnapshot?.hadEdits) {
                    UI.showNotification('Bilan régénéré.', 'info', 6000, {
                        bypassCoalescing: true,
                        action: {
                            label: 'Rétablir',
                            onClick: () => this._restorePreviousSnapshot(targetClassId, targetPeriod, previousSnapshot)
                        }
                    });
                }
            } else {
                const targetClassName = Utils.getCurrentClassName?.(targetClassId);
                UI.showNotification(
                    targetClassName ? `Analyse prête pour ${targetClassName}.` : 'Analyse de la classe prête.',
                    'info'
                );
            }

        } catch (error) {
            const isAborted = signal.aborted ||
                error?.name === 'AbortError' ||
                error?.message?.toLowerCase?.().includes('annulé');
            if (isAborted) return;

            const msg = Utils.translateErrorMessage ? Utils.translateErrorMessage(error.message) : error.message;
            UI.showNotification(`Erreur lors de la génération : ${msg}`, 'error');

            if (appState.currentClassId === targetClassId && appState.currentPeriod === targetPeriod) {
                if (previousSnapshot?.html) {
                    this._introHistoryState = HistoryUtils.normalizeHistoryState(previousSnapshot.introHistory);
                    await this._applySynthesisToUI(previousSnapshot.html, false);
                    this._checkStaleData();
                    buttonSynced = true;
                } else {
                    this._parkRefinementToolbar();
                    content.innerHTML = `
                        <div class="ai-placeholder">
                            <div class="ai-placeholder-icon is-error"><iconify-icon icon="solar:danger-triangle-linear"></iconify-icon></div>
                            <h4 class="ai-placeholder-title">Impossible de générer le bilan</h4>
                            <p class="ai-placeholder-text">${Utils.escapeHtml(msg)}</p>
                            <button type="button" class="btn btn-ai" id="retrySynthesisPlaceholderBtn" data-action="retry-synthesis">
                                <iconify-icon class="iconify-inline" icon="solar:refresh-bold"></iconify-icon> Réessayer
                            </button>
                        </div>
                    `;
                }
            }
        } finally {
            const currentEntry = this._activeGenerations.get(ctxKey);
            if (currentEntry?.controller === abortController) {
                this._activeGenerations.delete(ctxKey);
            }
            if (
                !buttonSynced &&
                generateBtn &&
                !this._activeGenerations.has(ctxKey) &&
                appState.currentClassId === targetClassId &&
                appState.currentPeriod === targetPeriod
            ) {
                this._restoreGenerateButtonState(targetClassId, targetPeriod);
            }
        }
    },

    /**
     * Helper to save synthesis to the persistent Class object
     * @private
     */
    _saveSynthesisToStorage(htmlContent, dataHash, options = {}) {
        const currentClassId = options.classId !== undefined ? options.classId : appState.currentClassId;
        const currentPeriod = options.period || appState.currentPeriod;

        if (!currentClassId) return;

        const classes = appState.classes || [];
        const classObj = classes.find(c => c.id === currentClassId);

        let targetAnalysesMap = null;
        if (classObj) {
            if (!classObj.analyses) {
                classObj.analyses = {};
            }
            targetAnalysesMap = classObj.analyses;
        } else if (ClassManager.isVirtualClass(currentClassId)) {
            if (!appState.virtualClassAnalyses || typeof appState.virtualClassAnalyses !== 'object') {
                appState.virtualClassAnalyses = {};
            }
            if (!appState.virtualClassAnalyses[currentClassId]) {
                appState.virtualClassAnalyses[currentClassId] = {};
            }
            targetAnalysesMap = appState.virtualClassAnalyses[currentClassId];
        }

        if (targetAnalysesMap) {
            const existingAnalysis = targetAnalysesMap[currentPeriod] || {};

            const resolvedIntroHistory = options.introHistory !== undefined
                ? Utils.deepClone(options.introHistory)
                : (currentClassId === this.cachedSynthesisClassId && currentPeriod === this.cachedSynthesisPeriod
                    ? Utils.deepClone(this._introHistoryState)
                    : (existingAnalysis.introHistory ? Utils.deepClone(existingAnalysis.introHistory) : undefined));

            targetAnalysesMap[currentPeriod] = {
                content: htmlContent,
                originalContent: options.originalContent || existingAnalysis.originalContent || this.originalSynthesisHTML || htmlContent,
                rawText: options.rawText !== undefined ? options.rawText : (this.cachedSynthesisRawText || existingAnalysis.rawText || ''),
                originalRawText: options.originalRawText !== undefined ? options.originalRawText : (this.originalSynthesisRawText || existingAnalysis.originalRawText || ''),
                ...(resolvedIntroHistory ? { introHistory: resolvedIntroHistory } : {}),
                timestamp: Date.now(),
                model: options.model || appState.currentAIModel,
                subject: options.subject || appState.currentSubject,
                dataHash: dataHash || null
            };

            StorageManager.saveAppState();
        }
    },

    /**
     * Agrège les identités (prénom/nom) de la classe pour le masquage des camarades ([CAMARADE] / [ÉLÈVE])
     * lors de la construction ou de l'affinage de la synthèse de classe.
     * @param {Object|null} [stats=null]
     * @param {string|null} [classId=null]
     * @returns {Array<{id?: string, prenom: string, nom: string}>}
     * @private
     */
    _collectClassRosterIdentities(stats = null, classId = null) {
        const sources = [
            ...(this._getFullClassRoster(classId) || []),
            ...(Array.isArray(stats?.appreciationsList) ? stats.appreciationsList : []),
            ...(Array.isArray(stats?.topProgressions) ? stats.topProgressions : []),
            ...(Array.isArray(stats?.topRegressions) ? stats.topRegressions : []),
            ...(Array.isArray(stats?.atRisk) ? stats.atRisk : [])
        ];

        const identities = [];
        const seen = new Set();
        for (const item of sources) {
            if (!item || typeof item !== 'object') continue;
            const prenom = String(item.prenom ?? item.studentData?.prenom ?? '').trim();
            const nom = String(item.nom ?? item.studentData?.nom ?? '').trim();
            if (!prenom && !nom) continue;
            const key = `${prenom.toLowerCase()}|${nom.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            identities.push({ id: item.id ?? null, prenom, nom });
        }
        return identities;
    },

    /**
     * Build the AI prompt with statistics context
     * @param {Object} stats 
     * @returns {{systemPrompt: string, userPrompt: string}}
     */
    buildAIPrompt(stats) {
        const period = appState.currentPeriod;
        const periodLabel = { T1: 'premier trimestre', T2: 'deuxième trimestre', T3: 'troisième trimestre', S1: 'premier semestre', S2: 'second semestre' }[period] || period;

        // Propagate teacher's active style profile via PromptService SSOT (respects enableTone & enableStyleInstructions)
        const effectiveStyle = PromptService._getEffectiveStyle
            ? PromptService._getEffectiveStyle(PromptService._resolveIaConfig?.())
            : (() => {
                const iaCfg = appState.subjects?.['MonStyle']?.iaConfig || appState.subjects?.['Générique']?.iaConfig || { tone: 3 };
                const isToneOn = iaCfg.enableTone ?? (iaCfg.tone !== 3 && iaCfg.tone !== undefined);
                return {
                    tone: isToneOn ? iaCfg.tone : null,
                    styleInstructions: iaCfg.enableStyleInstructions !== false ? (iaCfg.styleInstructions || '') : '',
                    discipline: iaCfg.discipline || ''
                };
            })();

        const toneMap = {
            1: 'très encourageant et positif',
            2: 'bienveillant et constructif',
            3: null,
            4: 'exigeant mais constructif',
            5: 'strict et formel'
        };
        const toneInstruction = effectiveStyle.tone ? toneMap[effectiveStyle.tone] : null;

        let styleInstructionText = '';
        if (toneInstruction) {
            styleInstructionText += `\n- Adopte un ton ${toneInstruction} pour l'ensemble du bilan.`;
        }
        if (effectiveStyle.styleInstructions) {
            styleInstructionText += `\n- Consignes additionnelles : ${effectiveStyle.styleInstructions}`;
        }

        const discipline = effectiveStyle.discipline || (appState.currentSubject !== 'Générique' && appState.currentSubject !== 'MonStyle' ? appState.currentSubject : null);
        const roleText = discipline
            ? `Tu es un enseignant de ${discipline}. Tu rédiges un bilan/synthèse de classe précis, nuancé et professionnel dans cette matière pour le conseil de classe du ${periodLabel}.`
            : `Tu es un conseiller principal d'éducation ou un professeur principal. Tu rédiges un bilan/synthèse de classe précis, nuancé et professionnel global pour le conseil de classe du ${periodLabel}.`;

        const allPeriods = Utils.getPeriods();
        const isYearEnd = allPeriods.length > 1 && allPeriods.indexOf(period) === allPeriods.length - 1;
        const yearEndClause = isYearEnd && Array.isArray(stats.periodAverages) && stats.periodAverages.length >= 2
            ? ` Comme il s'agit du bilan de fin d'année (au ${periodLabel}), intègre une mise en perspective de la trajectoire annuelle de la classe.`
            : '';

        const systemPrompt = `${roleText}
Tu dois extraire de l'analyse globale et qualitative de la classe : une synthèse globale, les points forts, les points de vigilance, et des recommandations collectives concrètes.

RÈGLES D'ÉCRITURE :
- Synthèse globale : Rédige 2 à 4 phrases (40 à 90 mots) résumant la dynamique générale, le climat de travail et le potentiel du groupe dans cette matière.${yearEndClause} Sans redite d'une phrase à l'autre ni sigle de période (« T1 », « T2 », « T3 », « S1 », « S2 »).
- Points forts : Identifie 1 à 2 points forts collectifs factuels (max 15 mots par point), sans broder si les données qualitatives sont absentes.
- Points de vigilance : Identifie 0 à 2 points de vigilance collectifs factuels (max 15 mots par point ; renvoie [] s'il n'y a aucune fragilité collective objective). Ne cite pas de prénoms d'élèves spécifiques pour les aspects négatifs de comportement.
- Recommandations : Formule 1 à 2 leviers pédagogiques concrets et applicables en classe (rituels, méthodologie, organisation, remédiation — max 20 mots par action). Ne te contente jamais de paraphraser un point de vigilance sous forme de vœu vague (« Encourager… », « Renforcer… ») sans préciser le moyen concret.
- Écris dans un style naturel, sobre et précis, sans formules scolaires toutes faites.
- Utilise un ton professionnel et constructif.${styleInstructionText}

FORMAT DE RÉPONSE OBLIGATOIRE :
Tu dois répondre uniquement sous le format d'un objet JSON strict avec la structure suivante :
{
  "synthesis": "Texte de la synthèse générale...",
  "strengths": [
    "Premier point fort...",
    "Deuxième point fort..."
  ],
  "vigilances": [
    "Premier point de vigilance...",
    "Deuxième point de vigilance..."
  ],
  "recommendations": [
    "Première recommandation...",
    "Deuxième recommandation..."
  ]
}

Ne rajoute aucune introduction, aucun commentaire, ni de balises de code Markdown. Réponds directement par l'objet JSON brut.`;

        const isAnonymous = appState.anonymizeData ?? true;
        const count = stats.count ?? stats.total ?? 0;
        const average = stats.average ?? stats.classAverage ?? 0;
        const median = stats.median ?? average;
        const min = stats.min ?? stats.minGrade ?? 0;
        const max = stats.max ?? stats.maxGrade ?? 0;
        const stdDev = stats.stdDev ?? 0;
        const dist = stats.distribution || {};
        const dist16_20 = dist['16-20'] ?? dist.excellent ?? 0;
        const dist12_16 = dist['12-16'] ?? dist.good ?? 0;
        const dist8_12 = dist['8-12'] ?? dist.average ?? 0;
        const dist4_8 = dist['4-8'] ?? dist.low ?? 0;
        const dist0_4 = dist['0-4'] ?? dist.veryLow ?? 0;
        const avgEvolution = stats.avgEvolution ?? stats.evolutionStats?.avgEvolution ?? 0;
        const progressCount = stats.progressCount ?? stats.evolutionStats?.up ?? 0;
        const stableCount = stats.stableCount ?? stats.evolutionStats?.stable ?? 0;
        const regressionCount = stats.regressionCount ?? stats.evolutionStats?.down ?? 0;
        const hasEvolutionData = stats.hasEvolutionData ?? Boolean(stats.evolutionStats || stats.topProgressions?.length);

        let userPrompt = `Voici les données de la classe :
• Effectif : ${count} élèves
• Moyenne : ${Number(average).toFixed(1)}/20 | Médiane : ${Number(median).toFixed(1)}/20
• Min : ${Number(min).toFixed(1)} | Max : ${Number(max).toFixed(1)} | Écart-type : ${Number(stdDev).toFixed(1)}
• Répartition : ${dist16_20} excellents, ${dist12_16} bons, ${dist8_12} moyens, ${dist4_8} fragiles, ${dist0_4} en difficulté`;

        if (Array.isArray(stats.periodAverages) && stats.periodAverages.length >= 2) {
            const trajectoryStr = stats.periodAverages
                .map(p => `${p.period} : ${Number(p.average).toFixed(1)}/20`)
                .join(' → ');
            userPrompt += `\n• Trajectoire annuelle des moyennes : ${trajectoryStr}`;
        }

        if (hasEvolutionData) {
            const cleanAvgEvo = Math.round(Number(avgEvolution) * 10) / 10 || 0;
            userPrompt += `
• Évolution : ${cleanAvgEvo > 0 ? '+' : ''}${cleanAvgEvo.toFixed(1)} pts | ${progressCount} progressions, ${stableCount} stables, ${regressionCount} régressions`;
            if (Array.isArray(stats.topProgressions) && stats.topProgressions.length > 0) {
                userPrompt += `\n• Top progressions : ${stats.topProgressions.slice(0, 3).map((s, idx) => {
                    const label = isAnonymous ? `Élève #${idx + 1}` : s.prenom;
                    return `${label} (+${Number(s.evolution || 0).toFixed(1)})`;
                }).join(', ')}`;
            }
        }

        if (Array.isArray(stats.journalTrends) && stats.journalTrends.length > 0) {
            const trendsStr = stats.journalTrends
                .map(t => `${t.label} (${t.count} élève${t.count > 1 ? 's' : ''})`)
                .join(', ');
            userPrompt += `\n• Tendances du journal de suivi : ${trendsStr}`;
        }

        if (stats.appreciationsList && stats.appreciationsList.length > 0) {
            const classRosterIdentities = this._collectClassRosterIdentities(stats);
            userPrompt += `\n\n**APPRÉCIATIONS INDIVIDUELLES (pour contexte qualitatif) :**
Utilise ces commentaires pour affiner l'analyse (ambiance, comportement, efforts) mais NE CITE PAS d'élèves spécifiques pour les points négatifs de comportement.
${stats.appreciationsList.map((a, idx) => {
    const label = isAnonymous ? `Élève #${idx + 1}` : a.prenom;
    const scrubbedText = PromptService.scrubStudentIdentity(
        a.text || '',
        { prenom: a.prenom, nom: a.nom },
        {
            anonymizePrenom: isAnonymous,
            classmates: classRosterIdentities,
            scrubSensitive: true
        }
    );
    const displayText = isAnonymous
        ? scrubbedText.replace(/\[pr[eéèêëėẻẽ]nom\]/gi, label)
        : scrubbedText;
    return `• ${label} : ${displayText}`;
}).join('\n')}`;
        }

        return { systemPrompt, userPrompt };
    },

    /**
     * Resolve the current structured synthesis payload from DOM or cached rawText.
     * @returns {{ payload: Object|null, currentIntroText: string }}
     * @private
     */
    _resolveCurrentSynthesisPayload() {
        const contentDiv = this.modal?.querySelector('#aiSynthesisContent');
        const currentTextElement = contentDiv?.querySelector('.ai-synthesis-text');
        if (!this.cachedSynthesisHTML && !currentTextElement) {
            return { payload: null, currentIntroText: '' };
        }

        let payload = this._readSynthesisPayloadFromDOM(currentTextElement);
        if (!payload && this.cachedSynthesisRawText) {
            try {
                const parsed = JSON.parse(this.cachedSynthesisRawText);
                if (parsed && typeof parsed === 'object') {
                    payload = {
                        synthesis: String(parsed.synthesis || '').trim(),
                        strengths: parsed.strengths || parsed.strength || [],
                        vigilances: parsed.vigilances || parsed.vigilance || [],
                        recommendations: parsed.recommendations || parsed.recommendation || []
                    };
                }
            } catch (_) {
                // Non-JSON legacy synthesis handled below
            }
        }

        return { payload, currentIntroText: payload?.synthesis || '' };
    },

    /**
     * Show a preview of the AI refinement prompt for the Synthèse globale.
     * Triggered by right-click on any refinement chip.
     * @param {'concise'|'encouraging'|'demanding'|'polish'} refineType
     * @private
     */
    async _showRefinementPromptPreview(refineType) {
        this.flushPendingEdit();
        if (!this._ensureModal()) return;

        const { currentIntroText } = this._resolveCurrentSynthesisPayload();
        if (!currentIntroText) {
            UI.showNotification("Aucune appréciation de classe à affiner.", "warning");
            return;
        }

        const targetClassId = this.cachedSynthesisClassId ?? appState.currentClassId;
        const classRosterIdentities = this._collectClassRosterIdentities(this.cachedStats, targetClassId);
        const prompts = PromptService.getClassSynthesisRefinementPrompts(refineType, currentIntroText, {
            classmates: classRosterIdentities
        });
        if (!prompts) return;

        await FocusPanelRefinement.displayPromptModal(prompts.prompt, 'Prévisualisation du prompt (affinage)');
    },

    /**
     * Handles refinement actions solely on the "Synthèse globale" intro paragraph
     * (concise, encouraging, demanding, polish), preserving the teacher's bullet cards intact.
     * Supports click-to-cancel via AbortController and disables sibling chips cleanly without blocking tooltips.
     * @param {HTMLButtonElement} button - The clicked button with data-refine-type
     */
    async handleClassAnalysisActions(button) {
        if (!button || !this._ensureModal()) return;
        const type = button.dataset.refineType;

        const currentCtxKey = this._getContextKey(appState.currentClassId, appState.currentPeriod);
        const active = this._activeGenerations.get(currentCtxKey);

        if (active?.type === 'refinement' && active.refineType === type) {
            if (Date.now() - (active.startedAt || 0) >= 350) {
                this.cancelGeneration(appState.currentClassId, appState.currentPeriod);
            }
            return;
        }

        if (button.classList.contains('disabled') || active) return;

        this.flushPendingEdit();
        if (this._isOfflineForActiveModel()) {
            UI.showNotification("Mode hors-ligne : connexion Internet requise pour générer avec l'IA.", 'warning');
            return;
        }
        if (!UI.checkAPIKeyPresence()) return;

        const { payload, currentIntroText } = this._resolveCurrentSynthesisPayload();
        if (!payload || !currentIntroText) {
            if (this.cachedSynthesisHTML || this.modal?.querySelector('#aiSynthesisContent .ai-synthesis-text')) {
                UI.showNotification("Aucune appréciation de classe à affiner.", "warning");
            }
            return;
        }

        const targetClassId = this.cachedSynthesisClassId ?? appState.currentClassId;
        const targetPeriod = this.cachedSynthesisPeriod || appState.currentPeriod;
        const targetCtxKey = this._getContextKey(targetClassId, targetPeriod);
        const targetDataHash = this.cachedSynthesisDataHash;
        const classRosterIdentities = this._collectClassRosterIdentities(this.cachedStats, targetClassId);

        this._ensureIntroHistorySeeded(currentIntroText);
        const baseIntroHistory = Utils.deepClone(this._introHistoryState);
        this._endIntroEditSession();
        this._cancelIntroReveal();

        const prompts = PromptService.getClassSynthesisRefinementPrompts(type, currentIntroText, {
            classmates: classRosterIdentities
        });
        if (!prompts) return;

        const abortController = new AbortController();
        const { signal } = abortController;
        this._activeGenerations.set(targetCtxKey, {
            type: 'refinement',
            refineType: type,
            controller: abortController,
            classId: targetClassId,
            period: targetPeriod,
            startedAt: Date.now(),
            restoreIntroText: currentIntroText,
            previousSnapshot: null
        });

        this._applyRefinementBusyUI(type);

        try {
            const resp = await AIService.callAIWithFallback(prompts.userPrompt, {
                systemPrompt: prompts.systemPrompt,
                taskType: 'refinement',
                context: 'class-synthesis-refinement',
                signal
            });
            if (signal.aborted) return;

            let refinedIntro = (resp.text || '').trim().replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '').trim();
            if (refinedIntro.startsWith('{')) {
                const jsonCheck = AIService._inspectJsonResponse?.(refinedIntro);
                if (jsonCheck?.looksLikeJson && !jsonCheck.isValidObject) {
                    throw new Error("La réponse de l'IA a été tronquée (format incomplet). Réessayez.");
                }
                try {
                    const parsedResp = JSON.parse(refinedIntro);
                    if (typeof parsedResp?.synthesis === 'string' && parsedResp.synthesis.trim()) {
                        refinedIntro = parsedResp.synthesis.trim();
                    }
                } catch (_) {
                    throw new Error("La réponse de l'IA a été tronquée (format incomplet). Réessayez.");
                }
            }
            refinedIntro = PromptService.sanitizeAppreciationOutput(refinedIntro).replace(/\.{3,}/g, '...').trim();
            if (!refinedIntro) return;

            const stillOnSameContext = appState.currentClassId === targetClassId && appState.currentPeriod === targetPeriod;
            const isClosed = this._isModalVisiblyClosed();

            // Re-read live bullet cards from DOM when still on the same context so manual bullet edits made during refinement are never overwritten
            const livePayload = stillOnSameContext
                ? this._readSynthesisPayloadFromDOM(this.modal?.querySelector('#aiSynthesisContent .ai-synthesis-text'))
                : null;
            const updatedPayload = { ...(livePayload || payload), synthesis: refinedIntro };
            const updatedRawText = JSON.stringify(updatedPayload);
            const formattedText = this._formatSynthesisText(updatedRawText);
            const refinedHTML = `<div class="ai-synthesis-text">${formattedText}</div>`;

            // Build updated intro version history (non-destructive append with refinement source badge)
            const nextIntroHistory = HistoryUtils.normalizeHistoryState(
                stillOnSameContext ? this._introHistoryState : baseIntroHistory,
                currentIntroText,
                { source: 'original', appreciationSource: 'ai', aiModel: this.cachedSynthesisModel || null }
            );
            HistoryUtils.pushToState(
                nextIntroHistory,
                refinedIntro,
                type,
                'ai',
                resp.modelUsed || this.cachedSynthesisModel || appState.currentAIModel || null,
                null
            );

            if (stillOnSameContext) {
                const contentDiv = this.modal?.querySelector('#aiSynthesisContent');
                const introEl = contentDiv?.querySelector('.synthesis-intro-text');
                if (introEl) {
                    if (isClosed) {
                        introEl.innerHTML = Utils.escapeHtml(refinedIntro);
                    } else {
                        await UI.animateHtmlReveal(introEl, Utils.escapeHtml(refinedIntro), { signal });
                        if (signal.aborted) return;
                    }
                    introEl._initialTextBeforeEdit = refinedIntro;
                } else if (contentDiv) {
                    this._parkRefinementToolbar();
                    if (isClosed) {
                        contentDiv.innerHTML = refinedHTML;
                    } else {
                        await UI.animateHtmlReveal(contentDiv, refinedHTML, { signal });
                        if (signal.aborted) return;
                    }
                    this._enhanceSynthesisDOM(contentDiv);
                }
                this._introHistoryState = nextIntroHistory;
                this.cachedSynthesisHTML = refinedHTML;
                this.cachedSynthesisRawText = updatedRawText;
                this._saveSynthesisToStorage(refinedHTML, targetDataHash, {
                    classId: targetClassId,
                    period: targetPeriod,
                    rawText: updatedRawText,
                    introHistory: nextIntroHistory
                });
                this._updateIntroWordCount();
                this._updateIntroHistoryUI();
                this._updateRevertButtonState();

                if (isClosed) {
                    UI.showNotification('Appréciation de classe affinée prête.', 'success', 5000, {
                        bypassCoalescing: true,
                        action: {
                            label: 'Voir',
                            onClick: () => this.openDashboard()
                        }
                    });
                }
            } else {
                this._saveSynthesisToStorage(refinedHTML, targetDataHash, {
                    classId: targetClassId,
                    period: targetPeriod,
                    rawText: updatedRawText,
                    introHistory: nextIntroHistory
                });
                const targetClassName = Utils.getCurrentClassName?.(targetClassId);
                UI.showNotification(
                    targetClassName ? `Appréciation affinée prête pour ${targetClassName}.` : 'Appréciation de classe affinée prête.',
                    'info'
                );
            }
        } catch (e) {
            if (signal.aborted || e?.name === 'AbortError' || e?.message?.toLowerCase?.().includes('annulé')) {
                return;
            }
            const msg = Utils.translateErrorMessage ? Utils.translateErrorMessage(e.message) : e.message;
            UI.showNotification(`Erreur d'affinage : ${msg}`, 'error');
        } finally {
            const currentEntry = this._activeGenerations.get(targetCtxKey);
            if (currentEntry?.controller === abortController) {
                this._activeGenerations.delete(targetCtxKey);
            }
            if (
                !this._activeGenerations.has(targetCtxKey) &&
                appState.currentClassId === targetClassId &&
                appState.currentPeriod === targetPeriod
            ) {
                this._clearRefinementToolbarVisuals();
                this._restoreGenerateButtonState(targetClassId, targetPeriod);
            }
        }
    },

    /**
     * Apply a resolved intro version to the Appréciation de classe ONLY,
     * preserving the teacher's edits on the 3 bullet cards intact.
     * @param {Object|null} versionData
     * @private
     */
    async _applyIntroVersion(versionData) {
        const nextIntro = versionData?.content?.trim();
        if (!nextIntro) {
            this._updateIntroHistoryUI();
            return;
        }

        const { payload } = this._resolveCurrentSynthesisPayload();
        if (!payload) {
            this._updateIntroHistoryUI();
            return;
        }

        const targetClassId = appState.currentClassId;
        const targetPeriod = appState.currentPeriod;
        const renderSeq = ++this._introRenderSeq;

        const updatedPayload = { ...payload, synthesis: nextIntro };
        const updatedRawText = JSON.stringify(updatedPayload);
        const formattedText = this._formatSynthesisText(updatedRawText);
        const restoredHTML = `<div class="ai-synthesis-text">${formattedText}</div>`;

        // Synchronously commit cache, storage, word count and stepper BEFORE animating
        // so rapid version switches, copy clicks, or modal closes never persist a superseded version.
        this.cachedSynthesisHTML = restoredHTML;
        this.cachedSynthesisRawText = updatedRawText;
        this._saveSynthesisToStorage(restoredHTML, this.cachedSynthesisDataHash, {
            classId: targetClassId,
            period: targetPeriod,
            rawText: updatedRawText,
            introHistory: this._introHistoryState
        });

        const contentDiv = this.modal?.querySelector('#aiSynthesisContent');
        const introEl = contentDiv?.querySelector('.synthesis-intro-text');
        if (introEl) {
            introEl._initialTextBeforeEdit = nextIntro;
        }

        this._updateIntroWordCount(nextIntro);
        this._updateIntroHistoryUI();
        this._updateRevertButtonState();

        this._isIntroVersionAnimating = true;
        try {
            if (introEl) {
                const completed = await UI.animateHtmlReveal(introEl, Utils.escapeHtml(nextIntro));
                if (
                    completed === false
                    || this._introRenderSeq !== renderSeq
                    || appState.currentClassId !== targetClassId
                    || appState.currentPeriod !== targetPeriod
                ) {
                    return;
                }
                introEl._initialTextBeforeEdit = nextIntro;
            } else if (contentDiv) {
                this._parkRefinementToolbar();
                const completed = await UI.animateHtmlReveal(contentDiv, restoredHTML);
                if (
                    completed === false
                    || this._introRenderSeq !== renderSeq
                    || appState.currentClassId !== targetClassId
                    || appState.currentPeriod !== targetPeriod
                ) {
                    return;
                }
                this._enhanceSynthesisDOM(contentDiv);
            }
        } finally {
            if (this._introRenderSeq === renderSeq) {
                this._isIntroVersionAnimating = false;
            }
        }
    },

    /**
     * Step backward in the Appréciation de classe version history (preserving the 3 bullet cards intact).
     */
    async undoIntroSynthesis() {
        if (!this._ensureModal()) return;
        const introEl = this.modal?.querySelector('#aiSynthesisContent .synthesis-intro-text');
        if (introEl && !this._isIntroRevealActive(introEl)) {
            const liveText = (introEl.innerText || introEl.textContent || '').replace(/\s+/g, ' ').trim();
            if (liveText) {
                this._flushIntroEditSession(liveText, { persist: false });
            }
        }
        this._endIntroEditSession();

        if (!HistoryUtils.canUndo(this._introHistoryState)) {
            this._updateIntroHistoryUI();
            return;
        }

        this.cancelGeneration(appState.currentClassId, appState.currentPeriod, { restoreUI: false });
        this._clearRefinementToolbarVisuals();

        const version = HistoryUtils.undo(this._introHistoryState);
        await this._applyIntroVersion(version);
    },

    /**
     * Step forward in the Appréciation de classe version history (preserving the 3 bullet cards intact).
     */
    async redoIntroSynthesis() {
        if (!this._ensureModal()) return;
        this._endIntroEditSession();
        if (!HistoryUtils.canRedo(this._introHistoryState)) {
            this._updateIntroHistoryUI();
            return;
        }

        this.cancelGeneration(appState.currentClassId, appState.currentPeriod, { restoreUI: false });
        this._clearRefinementToolbarVisuals();

        const version = HistoryUtils.redo(this._introHistoryState);
        await this._applyIntroVersion(version);
    },

    /**
     * Jump directly to a specific version index from the Appréciation de classe history popover.
     * @param {number} index
     */
    async restoreIntroVersion(index) {
        if (!this._ensureModal()) return;
        const oldIndex = this._introHistoryState?.currentIndex ?? 0;
        if (index === oldIndex) return;

        this._endIntroEditSession();
        this.cancelGeneration(appState.currentClassId, appState.currentPeriod, { restoreUI: false });
        this._clearRefinementToolbarVisuals();

        const version = HistoryUtils.goToVersion(this._introHistoryState, index);
        await this._applyIntroVersion(version);
    },

    /**
     * Reverts the refined synthesis back to the original AI synthesis (all 4 sections)
     * while preserving refined intro variants non-destructively in `_introHistoryState`.
     */
    async revertSynthesis() {
        this.flushPendingEdit();
        if (!this._ensureModal()) return;
        const contentDiv = this.modal?.querySelector('#aiSynthesisContent');
        if (!contentDiv || !this.originalSynthesisHTML) return;

        this.cancelGeneration(appState.currentClassId, appState.currentPeriod, { restoreUI: false });
        this._cancelIntroReveal();
        this.closeIntroHistoryPopover();
        this._endIntroEditSession();
        this._clearRefinementToolbarVisuals();

        const targetClassId = appState.currentClassId;
        const targetPeriod = appState.currentPeriod;
        const renderSeq = ++this._introRenderSeq;

        const originalIntro = this._extractIntroTextFromRaw(this.originalSynthesisRawText);
        if (originalIntro) {
            HistoryUtils.pushToState(
                this._introHistoryState,
                originalIntro,
                'original',
                'ai',
                this.cachedSynthesisModel || null,
                null
            );
        }

        this._parkRefinementToolbar();
        this.cachedSynthesisHTML = this.originalSynthesisHTML;
        this.cachedSynthesisRawText = this.originalSynthesisRawText || '';
        this._saveSynthesisToStorage(this.originalSynthesisHTML, this.cachedSynthesisDataHash, {
            classId: targetClassId,
            period: targetPeriod,
            rawText: this.originalSynthesisRawText || '',
            introHistory: this._introHistoryState
        });

        this._isIntroVersionAnimating = true;
        try {
            const completed = await UI.animateHtmlReveal(contentDiv, this.originalSynthesisHTML);
            if (
                completed === false
                || this._introRenderSeq !== renderSeq
                || appState.currentClassId !== targetClassId
                || appState.currentPeriod !== targetPeriod
            ) {
                return;
            }
            this._enhanceSynthesisDOM(contentDiv);
            this._updateRevertButtonState();

            UI.showNotification("Bilan d'origine restauré !", "success");
        } finally {
            if (this._introRenderSeq === renderSeq) {
                this._isIntroVersionAnimating = false;
            }
        }
    },

    /**
     * Show a preview of the AI prompt
     * Triggered by right-click on Generate button
     * @private
     */
    async _showPromptPreview() {
        if (!this.cachedStats) return;

        const { systemPrompt, userPrompt } = this.buildAIPrompt(this.cachedStats);
        const combined = `=== SYSTEM PROMPT ===\n${systemPrompt}\n\n=== USER PROMPT ===\n${userPrompt}`;
        const className = Utils.getCurrentClassName?.(appState.currentClassId);
        const periodLabel = Utils.getPeriodLabel?.(appState.currentPeriod, true) || appState.currentPeriod;
        const title = className
            ? `Prompt d'analyse — ${className} (${periodLabel})`
            : `Prompt d'analyse de la classe (${periodLabel})`;

        await FocusPanelRefinement.displayPromptModal(combined, title);
    },

    /**
     * Trigger tactile visual feedback on a copy button (header capsule or intro-card capsule)
     * @param {HTMLElement|null} btn
     * @param {boolean} [isIntroBtn=false]
     * @private
     */
    _triggerCopyFeedback(btn, isIntroBtn = false) {
        if (!btn) return;
        if (btn._copyFeedbackTimer) clearTimeout(btn._copyFeedbackTimer);
        btn.classList.add('copied');
        btn.innerHTML = isIntroBtn
            ? '<iconify-icon icon="ph:check-bold"></iconify-icon><span>Copié</span>'
            : '<iconify-icon icon="ph:check-bold"></iconify-icon> Copié';
        btn._copyFeedbackTimer = setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = isIntroBtn
                ? '<iconify-icon icon="solar:copy-linear" aria-hidden="true"></iconify-icon><span>Copier</span>'
                : '<iconify-icon icon="solar:copy-linear"></iconify-icon> Tout copier';
            btn._copyFeedbackTimer = null;
        }, 1800);
    },

    /**
     * Copy only the global synthesis paragraph (plain text without title)
     * Calibrated for the "Appréciation générale de la classe" field in school software (Pronote, ÉcoleDirecte)
     * @param {HTMLElement|null} [buttonEl=null]
     */
    copyIntroSynthesis(buttonEl = null) {
        this.flushPendingEdit();
        if (!this._ensureModal()) return;
        const introTextEl = this.modal?.querySelector('#aiSynthesisContent .synthesis-intro-text');
        const textToCopy = this._getCanonicalIntroText(introTextEl);

        if (!textToCopy) {
            UI.showNotification("Aucune appréciation de classe à copier.", "warning");
            return;
        }

        const targetBtn = buttonEl || this.modal?.querySelector('.synthesis-intro-copy-btn');

        return navigator.clipboard.writeText(textToCopy)
            .then(() => {
                UI.showNotification("Appréciation de classe copiée !", "success");
                this._triggerCopyFeedback(targetBtn, true);
            })
            .catch(() => UI.showNotification("Erreur lors de la copie.", "error"));
    },

    /**
     * Copy structured synthesis to clipboard with tactile visual feedback
     */
    copySynthesis() {
        this.flushPendingEdit();
        if (!this._ensureModal()) return;
        const copyBtn = this.modal?.querySelector('#copyDashboardSynthesisBtn');
        if (copyBtn?.classList.contains('disabled')) return;
        const content = this.modal?.querySelector('#aiSynthesisContent .ai-synthesis-text');
        if (!content) {
            UI.showNotification("Aucun bilan à copier.", "warning");
            return;
        }

        // Build clean structured text with headers and bullet points for pasting into school reports
        const sections = content.querySelectorAll('.synthesis-section');
        let textToCopy = '';

        if (sections.length > 0) {
            const blocks = [];
            sections.forEach(sec => {
                const headerEl = sec.querySelector('.synthesis-intro-header span, .synthesis-section-header span');
                const introTextEl = sec.querySelector('.synthesis-intro-text');
                const listItems = sec.querySelectorAll('.synthesis-list li');
                const title = headerEl ? headerEl.textContent.trim() : '';

                if (introTextEl) {
                    const body = this._getCanonicalIntroText(introTextEl);
                    blocks.push(title ? `${title} :\n${body}` : body);
                } else if (listItems.length > 0) {
                    const bullets = Array.from(listItems).map(li => `• ${li.textContent.trim()}`).join('\n');
                    blocks.push(title ? `${title} :\n${bullets}` : bullets);
                }
            });
            textToCopy = blocks.join('\n\n');
        }

        if (!textToCopy) {
            textToCopy = (content.innerText || content.textContent || '').trim();
        }

        return navigator.clipboard.writeText(textToCopy)
            .then(() => {
                UI.showNotification("Bilan copié !", "success");
                this._triggerCopyFeedback(copyBtn, false);
            })
            .catch(() => UI.showNotification("Erreur lors de la copie.", "error"));
    },

    /**
     * Build the HTML for the top full-width synthesis intro card with quick copy action and inline editing
     * @param {string} title - Card header title
     * @param {string} text - Raw text content
     * @param {boolean} [preserveLineBreaks=false] - Whether to convert newlines to <br>
     * @returns {string} HTML string
     * @private
     */
    _buildIntroCardHTML(title, text, preserveLineBreaks = false) {
        const formattedBody = preserveLineBreaks
            ? text.split('\n').map(l => Utils.escapeHtml(l.trim())).filter(Boolean).join('<br>')
            : Utils.escapeHtml(text);

        return `
                    <div class="synthesis-section synthesis-intro-card">
                        <div class="synthesis-intro-header">
                            <iconify-icon icon="solar:stars-bold-duotone"></iconify-icon>
                            <span>${Utils.escapeHtml(title)}</span>
                            <div class="synthesis-intro-meta">
                                ${HistoryPopoverUI.buildStepperHTML({
                                    groupClass: 'synthesis-intro-history-group',
                                    prevAction: 'synthesis-history-prev',
                                    indicatorAction: 'synthesis-history-indicator',
                                    nextAction: 'synthesis-history-next'
                                })}
                                <span class="synthesis-intro-word-count tooltip" aria-live="polite"></span>
                                <button type="button" class="synthesis-intro-copy-btn tooltip" data-action="copy-intro-synthesis" data-tooltip="Copier l'appréciation de classe (texte seul)" aria-label="Copier l'appréciation de classe">
                                    <iconify-icon icon="solar:copy-linear" aria-hidden="true"></iconify-icon>
                                    <span>Copier</span>
                                </button>
                            </div>
                        </div>
                        <p class="synthesis-intro-text" contenteditable="true" spellcheck="true">${formattedBody}</p>
                    </div>
                `;
    },

    /**
     * Format synthesis text into structured HTML sections
     * @param {string} text - Raw AI response text or JSON
     * @returns {string} Formatted HTML
     * @private
     */
    _formatSynthesisText(text) {
        // Normalize multiple ellipsis (e.g., "......" -> "...")
        text = text.replace(/\.{3,}/g, '...');

        // 1. JSON Parser Mode (Robust, handles optional markdown fences or surrounding text)
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        } else {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                cleaned = cleaned.slice(firstBrace, lastBrace + 1);
            }
        }

        try {
            const data = JSON.parse(cleaned);
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                const synthesis = typeof data.synthesis === 'string' ? data.synthesis : '';
                const hasExpectedKey = Boolean(synthesis) || ['strengths', 'strength', 'vigilances', 'vigilance', 'recommendations', 'recommendation']
                    .some(k => Array.isArray(data[k]) && data[k].length > 0);

                if (hasExpectedKey) {
                    const listsByKey = {
                        strengths: data.strengths || data.strength || [],
                        vigilances: data.vigilances || data.vigilance || [],
                        recommendations: data.recommendations || data.recommendation || []
                    };
                    let html = synthesis ? this._buildIntroCardHTML('Appréciation de classe', synthesis) : '';
                    SYNTHESIS_LIST_SECTIONS.forEach(cfg => {
                        html += this._buildListSectionHTML(cfg, listsByKey[cfg.key]);
                    });
                    if (html) return html;
                }
            }
        } catch (e) {
            // Silent fallback to legacy Markdown parser below
        }

        // 2. Legacy Regex Markdown Parser Fallback
        const sections = [
            { emoji: '📝', title: 'Synthèse', icon: 'solar:stars-bold-duotone', color: 'primary-dark', isFullWidth: true },
            { emoji: '📊', title: 'Bilan', icon: 'solar:chart-square-linear', color: 'primary' },
            { emoji: '✅', title: 'Points forts', icon: 'solar:cup-linear', color: 'success' },
            { emoji: '⚠️', title: 'Points de vigilance', icon: 'solar:danger-triangle-linear', color: 'warning' },
            { emoji: '💡', title: 'Recommandations', icon: 'solar:lightbulb-linear', color: 'info' }
        ];

        let html = '';

        const lines = text.split('\n');
        let currentSection = null;
        let currentContent = [];

        const flushSection = () => {
            if (currentSection && currentContent.length > 0) {
                const config = sections.find(s =>
                    currentSection.includes(s.emoji) ||
                    currentSection.toLowerCase().includes(s.title.toLowerCase())
                ) || { icon: 'solar:info-circle-linear', color: 'primary' };

                const cleanTitle = currentSection
                    .replace(/\*\*/g, '')
                    .replace(/[📝📊✅⚠️💡]/g, '')
                    .trim();

                const items = currentContent
                    .map(line => line.replace(/^[•\-→]\s*/, '').trim())
                    .filter(line => line.length > 0);

                if (config.isFullWidth) {
                    const paragraph = items.join(' ');
                    html += this._buildIntroCardHTML(cleanTitle || 'Appréciation de classe', paragraph);
                } else {
                    html += `
                    <div class="synthesis-section synthesis-section--${config.color}">
                        <div class="synthesis-section-header">
                            <iconify-icon icon="${config.icon}"></iconify-icon>
                            <span>${Utils.escapeHtml(cleanTitle)}</span>
                        </div>
                        <div class="synthesis-section-content">
                            <ul class="synthesis-list">
                                ${items.map(item => `<li contenteditable="true" spellcheck="true">${Utils.escapeHtml(item)}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                `;
                }
            }
            currentContent = [];
        };

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const isHeader = sections.some(s =>
                trimmed.includes(s.emoji) ||
                trimmed.match(new RegExp(`\\*\\*.*${s.title}.*\\*\\*`, 'i'))
            );

            if (isHeader) {
                flushSection();
                currentSection = trimmed;
            } else if (currentSection) {
                currentContent.push(trimmed);
            }
        }

        flushSection();

        if (html) return html;

        // 3. Plain-text / bullet fallback wrapped in intro card so layout never collapses
        const fallbackLines = text.split('\n').map(l => l.trim()).filter(Boolean);
        return this._buildIntroCardHTML('Appréciation de classe', fallbackLines.join('\n'), true);
    },

    /**
     * Export the class dashboard (cohort stats, SVG charts and AI synthesis) to PDF via print
     */
    exportPdf() {
        this.flushPendingEdit();
        const stats = this.cachedStats || this.calculateStatistics(this.getStudentsData(), this._getFullClassRoster());
        const subjectEl = this.modal?.querySelector('#dashboardSubjectBadge');
        const subject = subjectEl && !subjectEl.hidden && subjectEl.style.display !== 'none' ? subjectEl.textContent.trim() : '';
        ExportManager.exportClassDashboardPdf({ stats, subject });
    },

    /**
     * Close the dashboard modal
     */
    closeDashboard() {
        if (this._isIntroVersionAnimating) {
            this._cancelIntroReveal();
        }
        this.closeIntroHistoryPopover();
        this._endIntroEditSession();
        this.flushPendingEdit();
        if (this.modal) {
            UI.closeModal(this.modal);
        }
    }
};
