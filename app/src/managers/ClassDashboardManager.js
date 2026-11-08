/**
 * @fileoverview Manager for Class Dashboard - Analytics & AI Synthesis
 * @module managers/ClassDashboardManager
 * Provides comprehensive class analytics with calculated statistics and AI synthesis
 */

import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { PromptService } from '../services/PromptService.js';
import { StatsService } from '../services/StatsService.js';
import { StorageManager } from './StorageManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { TooltipsUI } from './TooltipsManager.js';
import { ClassManager } from './ClassManager.js';
import { FocusPanelRefinement } from './FocusPanelRefinement.js';
import { JournalManager } from './JournalManager.js';
import { getPreviousPeriod } from '../config/academicConstants.js';

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

        // Attach Context Menu listener for Prompt Preview (Right Click on either Generate button)
        this.modal.addEventListener('contextmenu', (e) => {
            const triggerBtn = e.target.closest('#generateSynthesisBtn, #generateSynthesisPlaceholderBtn');
            if (triggerBtn) {
                e.preventDefault();
                this._showPromptPreview();
            }
        });

        // Setup scroll-to-top buttons for highlights lists
        const progressList = this.modal?.querySelector('#highlightProgressList');
        const riskList = this.modal?.querySelector('#highlightRiskList');
        const progressScrollBtn = this.modal?.querySelector('.scroll-top-btn[data-target="highlightProgressList"]');
        const riskScrollBtn = this.modal?.querySelector('.scroll-top-btn[data-target="highlightRiskList"]');

        const setupScrollListener = (listEl, btnEl) => {
            if (!listEl || !btnEl) return;
            listEl.addEventListener('scroll', () => {
                if (listEl.scrollTop > 30) {
                    btnEl.style.opacity = '1';
                    btnEl.style.pointerEvents = 'auto';
                } else {
                    btnEl.style.opacity = '0';
                    btnEl.style.pointerEvents = 'none';
                }
            });
            btnEl.addEventListener('click', () => {
                listEl.scrollTo({ top: 0, behavior: 'smooth' });
            });
        };

        setupScrollListener(progressList, progressScrollBtn);
        setupScrollListener(riskList, riskScrollBtn);

        // Attach click listeners to refinement toolbar buttons
        const refinementToolbar = this.modal?.querySelector('#aiRefinementToolbar');
        if (refinementToolbar) {
            refinementToolbar.querySelectorAll('.btn-refinement[data-refine-type]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.handleClassAnalysisActions(e.currentTarget);
                });
            });
        }

        // Attach click listener to revert button
        const revertBtn = this.modal?.querySelector('#revertSynthesisBtn');
        if (revertBtn) {
            revertBtn.addEventListener('click', () => {
                this.revertSynthesis();
            });
        }

        // Delegated listeners for quick intro copy and inline card editing
        this.modal.addEventListener('click', (e) => {
            const copyIntroBtn = e.target.closest('[data-action="copy-intro-synthesis"]');
            if (copyIntroBtn) {
                e.stopPropagation();
                this.copyIntroSynthesis(copyIntroBtn);
            }
        });

        this.modal.addEventListener('focusin', (e) => {
            const editable = e.target.closest('#aiSynthesisContent [contenteditable="true"]');
            if (editable) {
                editable._initialTextBeforeEdit = (editable.innerText || editable.textContent || '').replace(/\s+/g, ' ').trim();
            }
        });

        this.modal.addEventListener('keydown', (e) => {
            const editable = e.target.closest('#aiSynthesisContent [contenteditable="true"]');
            if (!editable) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                editable.blur();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                editable.blur();
            }
        });

        this.modal.addEventListener('paste', (e) => {
            const editable = e.target.closest('#aiSynthesisContent [contenteditable="true"]');
            if (!editable) return;

            e.preventDefault();
            const rawPaste = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
            const cleanPaste = rawPaste.replace(/\s+/g, ' ');
            if (document.queryCommandSupported?.('insertText')) {
                document.execCommand('insertText', false, cleanPaste);
            } else {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    selection.deleteFromDocument();
                    selection.getRangeAt(0).insertNode(document.createTextNode(cleanPaste));
                    selection.collapseToEnd();
                }
            }
        });

        this.modal.addEventListener('focusout', (e) => {
            const editable = e.target.closest('#aiSynthesisContent [contenteditable="true"]');
            if (!editable) return;
            this._handleEditableBlur(editable);
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

        // Calculate statistics
        this.cachedStats = this.calculateStatistics(students);

        // Open modal and render
        UI.openModal(this.modal);
        this.renderDashboard(this.cachedStats, students);
    },

    /**
     * Get students data for a specific class or the full active class roster
     * (independent of active list search/stat filters, consistent with StatsUIManager)
     * @param {string|null} classId Optional class ID. If null, uses active class roster or filteredResults fallback
     * @returns {Array} Array of student objects with grades and info
     */
    getStudentsData(classId = null) {
        const period = appState.currentPeriod;
        let sourceData = appState.filteredResults || [];

        if (classId) {
            sourceData = ClassManager.getStudentsForClass(classId).filter(
                r => !Utils.isStudentDepartedBeforePeriod?.(r, period)
            );
        } else if (appState.currentClassId && Array.isArray(appState.generatedResults) && appState.generatedResults.length > 0) {
            const classRoster = appState.generatedResults.filter(
                r => r.classId === appState.currentClassId && !Utils.isStudentDepartedBeforePeriod?.(r, period)
            );
            if (classRoster.length > 0) {
                sourceData = classRoster;
            }
        }

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
                    appreciation: periodData.appreciation ?? r.appreciation ?? '',
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
        return this.calculateStatistics(students);
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
    calculateStatistics(students) {
        if (!students || students.length === 0) return null;

        const gradeSummary = StatsService.summarizeGrades(students.map(s => s.grade));
        if (!gradeSummary) return null;

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
            distributionMap: distribution
        } = gradeSummary;

        const minStudents = students.filter(s => s.grade === min).map(s => s.fullName);
        const maxStudents = students.filter(s => s.grade === max).map(s => s.fullName);

        // Evolution analysis using configured thresholds via StatsService
        const negThreshold = appState.evolutionThresholds?.negative ?? -0.5;

        const withEvolution = students.filter(s => s.evolution !== null);
        let avgEvolution = null;
        let progressCount = 0;
        let stableCount = 0;
        let regressionCount = 0;

        if (withEvolution.length > 0) {
            avgEvolution = withEvolution.reduce((a, s) => a + s.evolution, 0) / withEvolution.length;
            withEvolution.forEach(s => {
                const category = StatsService.classifyEvolutionCategory(s.evolution);
                if (category === 'progress') progressCount++;
                else if (category === 'regression') regressionCount++;
                else stableCount++;
            });
        }

        // Top significant progressions and regressions
        const sortedByEvolution = withEvolution.slice().sort((a, b) => b.evolution - a.evolution);
        const topProgressions = sortedByEvolution
            .filter(s => StatsService.classifyEvolutionCategory(s.evolution) === 'progress')
            .slice(0, 15);
        const topRegressions = sortedByEvolution
            .filter(s => StatsService.classifyEvolutionCategory(s.evolution) === 'regression')
            .slice(-15)
            .reverse();

        // Students genuinely requiring pedagogical attention:
        // - Average below 10/20 (consistent with successRate < 100%)
        // - Or sharp drop (<= -1.5 pt) regardless of grade
        // - Or moderate drop (<= negThreshold) with fragile/medium grade (< 12/20)
        const atRisk = students
            .filter(s =>
                s.grade < 10 ||
                (s.evolution !== null && (s.evolution <= -1.5 || (s.grade < 12 && s.evolution <= negThreshold)))
            )
            .sort((a, b) => {
                const scoreA = a.grade + Math.min(0, (a.evolution || 0) * 1.2);
                const scoreB = b.grade + Math.min(0, (b.evolution || 0) * 1.2);
                return scoreA - scoreB;
            });

        // Multi-period class average trajectory (e.g., T1 -> T2 -> T3 or S1 -> S2)
        const allPeriods = Utils.getPeriods();
        const currentPeriod = appState.currentPeriod;
        const currentIdx = allPeriods.indexOf(currentPeriod);
        const relevantPeriods = currentIdx >= 0 ? allPeriods.slice(0, currentIdx + 1) : [currentPeriod];
        const prevPeriod = this.getPreviousPeriod(currentPeriod);

        const periodAverages = [];
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
                periodAverages.push({
                    period: p,
                    average: parseFloat(pAvg.toFixed(2)),
                    count: pGrades.length
                });
            }
        });

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
            hasEvolutionData: withEvolution.length > 0,
            periodAverages: periodAverages,
            journalTrends: journalTrends,

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

        // Update header info using context line pills
        const periodBadge = this.modal?.querySelector('#dashboardPeriodBadge');
        const studentCount = this.modal?.querySelector('#dashboardStudentCount');
        const classBadge = this.modal?.querySelector('#dashboardClassBadge');
        const subjectBadge = this.modal?.querySelector('#dashboardSubjectBadge');

        if (periodBadge) {
            const periodLabels = { T1: 'Trimestre 1', T2: 'Trimestre 2', T3: 'Trimestre 3', S1: 'Semestre 1', S2: 'Semestre 2' };
            periodBadge.textContent = periodLabels[appState.currentPeriod] || appState.currentPeriod;
        }
        if (studentCount) {
            studentCount.textContent = `${stats.count} ${stats.count > 1 ? 'élèves analysés' : 'élève analysé'}`;
        }

        // Retrieve and display class name
        const classes = appState.classes || [];
        const currentClass = classes.find(c => c.id === appState.currentClassId);
        if (classBadge && currentClass) {
            classBadge.textContent = currentClass.name;
            classBadge.style.display = 'inline-flex';
        } else if (classBadge) {
            classBadge.style.display = 'none';
        }

        // Retrieve and display active subject (discipline)
        const effectiveStyle = PromptService._getEffectiveStyle?.(PromptService._resolveIaConfig?.()) || {};
        const discipline = effectiveStyle.discipline || (appState.currentSubject !== 'Générique' && appState.currentSubject !== 'MonStyle' ? appState.currentSubject : null);

        if (subjectBadge && discipline) {
            subjectBadge.textContent = discipline;
            subjectBadge.style.display = 'inline-flex';
        } else if (subjectBadge) {
            subjectBadge.style.display = 'none';
        }

        // Display Class Stats (Moyenne, Médiane, Min, Max) in Cohort Stats Bar
        const statAverage = this.modal?.querySelector('#cohortStatAverage');
        const statAverageItem = this.modal?.querySelector('#cohortStatAverageItem');
        const statMedian = this.modal?.querySelector('#cohortStatMedian');
        const statMedianItem = this.modal?.querySelector('#cohortStatMedianItem');
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
                const sign = stats.avgEvolution >= 0 ? '+' : '';
                const evoFormatted = stats.avgEvolution.toFixed(1).replace('.', ',');
                const unit = Math.abs(stats.avgEvolution) >= 2 ? 'pts' : 'pt';
                avgTooltip += `<br>Évolution récente : ${sign}${evoFormatted} ${unit}`;
            }
            TooltipsUI.updateTooltip(statAverageItem || statAverage, avgTooltip);
        }

        if (statMedian) {
            statMedian.innerHTML = `${med}<span class="stat-denominator">/20</span>`;
            const hetLabel = stats.heterogeneity?.label ? ` · ${stats.heterogeneity.label}` : '';
            const medTooltip = `<strong>Médiane (${med}/20)</strong><br>50% des élèves ont au moins ${med}/20<br>Écart-type : ${stdDevFormatted} pt${hetLabel}`;
            TooltipsUI.updateTooltip(statMedianItem || statMedian, medTooltip);
        }

        if (statMin) {
            statMin.innerHTML = `${min}<span class="stat-denominator">/20</span>`;
            const minLabel = stats.minStudents.length > 1 ? 'Élèves' : 'Élève';
            const minNames = stats.minStudents.map(name => Utils.escapeHtml(name)).join('<br>');
            const minTooltip = `<strong>${minLabel} (${min}/20) :</strong><br>${minNames}`;
            TooltipsUI.updateTooltip(statMinItem || statMin, minTooltip);
        }

        if (statMax) {
            statMax.innerHTML = `${max}<span class="stat-denominator">/20</span>`;
            const maxLabel = stats.maxStudents.length > 1 ? 'Élèves' : 'Élève';
            const maxNames = stats.maxStudents.map(name => Utils.escapeHtml(name)).join('<br>');
            const maxTooltip = `<strong>${maxLabel} (${max}/20) :</strong><br>${maxNames}`;
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

        // Update Highlights
        this.updateHighlights(stats);

        // Restore cached AI synthesis if it matches current class/period, otherwise reset
        this.restoreOrResetAISection();
    },

    /**
     * Update highlights sections (progressions and students to watch)
     * @param {Object} stats 
     */
    updateHighlights(stats) {
        if (!stats || !this._ensureModal()) return;

        const negThreshold = appState.evolutionThresholds?.negative ?? -0.5;
        const progressList = this.modal?.querySelector('#highlightProgressList');
        const progressCountBadge = this.modal?.querySelector('#highlightProgressCount');

        // 1. Top Progressions
        if (progressList) {
            TooltipsUI.cleanupTooltipsIn(progressList);

            if (!stats.hasEvolutionData) {
                const nextPeriodShort = appState.periodSystem === 'semestres' ? 'S2' : 'T2';
                const nextPeriodFull = appState.periodSystem === 'semestres' ? 'semestre' : 'trimestre';
                if (progressCountBadge) {
                    progressCountBadge.textContent = `Dès le ${nextPeriodShort}`;
                    progressCountBadge.className = 'highlight-count-badge muted';
                }
                progressList.innerHTML = `<div class="highlight-empty">Comparaison disponible au prochain ${nextPeriodFull}</div>`;
            } else if (stats.topProgressions.length > 0) {
                if (progressCountBadge) {
                    progressCountBadge.textContent = String(stats.topProgressions.length);
                    progressCountBadge.className = 'highlight-count-badge positive';
                }
                progressList.innerHTML = stats.topProgressions.map(s => {
                    const formattedGrade = s.grade.toFixed(1).replace('.', ',');
                    const formattedEvolution = s.evolution.toFixed(1).replace('.', ',');
                    const unit = Math.abs(s.evolution) >= 2 ? 'pts' : 'pt';
                    const tooltipText = `${s.fullName} — Moyenne : ${formattedGrade}/20 (+${formattedEvolution} ${unit})`;
                    return `
                        <div class="highlight-item" data-student-id="${s.id}" data-tooltip="${Utils.escapeHtml(tooltipText)}">
                            <div class="highlight-item-left">
                                ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                                <span class="highlight-student-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                            </div>
                            <div class="highlight-item-metrics">
                                <span class="highlight-grade">${formattedGrade}<small>/20</small></span>
                                <span class="highlight-evolution positive">+${formattedEvolution} ${unit}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                if (progressCountBadge) {
                    progressCountBadge.textContent = '0';
                    progressCountBadge.className = 'highlight-count-badge muted';
                }
                progressList.innerHTML = '<div class="highlight-empty">Aucune progression significative</div>';
            }
        }

        // 2. Students to Watch (Élèves à surveiller)
        const riskList = this.modal?.querySelector('#highlightRiskList');
        const riskCountBadge = this.modal?.querySelector('#highlightRiskCount');

        if (riskList) {
            TooltipsUI.cleanupTooltipsIn(riskList);
            const atRiskStudents = (stats.atRisk || []).slice(0, 15);

            if (riskCountBadge) {
                riskCountBadge.textContent = String(atRiskStudents.length);
                riskCountBadge.className = `highlight-count-badge ${atRiskStudents.length > 0 ? 'negative' : 'muted'}`;
            }

            if (atRiskStudents.length > 0) {
                riskList.innerHTML = atRiskStudents.map(s => {
                    const formattedGrade = s.grade.toFixed(1).replace('.', ',');
                    let tooltipText = `${s.fullName} — Moyenne : ${formattedGrade}/20`;
                    let metricsHTML = '';

                    if (s.evolution !== null && s.evolution <= negThreshold) {
                        const formattedEvolution = s.evolution.toFixed(1).replace('.', ',');
                        const unit = Math.abs(s.evolution) >= 2 ? 'pts' : 'pt';
                        tooltipText += ` (${formattedEvolution} ${unit})`;
                        metricsHTML = `
                            <span class="highlight-grade">${formattedGrade}<small>/20</small></span>
                            <span class="highlight-evolution negative">${formattedEvolution} ${unit}</span>
                        `;
                    } else {
                        if (s.evolution !== null) {
                            const sign = s.evolution >= 0 ? '+' : '';
                            const formattedEvolution = s.evolution.toFixed(1).replace('.', ',');
                            const unit = Math.abs(s.evolution) >= 2 ? 'pts' : 'pt';
                            tooltipText += ` (${sign}${formattedEvolution} ${unit})`;
                        }
                        metricsHTML = `<span class="highlight-evolution negative">${formattedGrade}/20</span>`;
                    }

                    return `
                        <div class="highlight-item" data-student-id="${s.id}" data-tooltip="${Utils.escapeHtml(tooltipText)}">
                            <div class="highlight-item-left">
                                ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                                <span class="highlight-student-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                            </div>
                            <div class="highlight-item-metrics">
                                ${metricsHTML}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                riskList.innerHTML = '<div class="highlight-empty">Aucun élève en difficulté</div>';
            }
        }

        // Re-initialize tooltips to bind Tippy.js to the new data-tooltip elements
        TooltipsUI.initTooltips();
    },

    /**
     * Reset AI section to placeholder state
     */
    resetAISection() {
        if (!this._ensureModal()) return;
        const content = this.modal?.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');
        const toolbar = this.modal?.querySelector('#aiRefinementToolbar');

        if (content) {
            content.innerHTML = `
                <div class="ai-placeholder">
                    <div class="ai-placeholder-glow"></div>
                    <div class="ai-placeholder-icon">
                        <iconify-icon icon="solar:stars-bold-duotone"></iconify-icon>
                    </div>
                    <h4 class="ai-placeholder-title">Analyse Intelligente de la Classe</h4>
                    <p class="ai-placeholder-text">Obtenez une analyse globale qualitative de votre classe en un instant. L'IA étudie les notes, les tendances d'évolution et les appréciations individuelles pour proposer des points forts, des points de vigilance et des recommandations pédagogiques actionnables.</p>
                    <button class="btn btn-ai" id="generateSynthesisPlaceholderBtn">
                        <iconify-icon class="iconify-inline" icon="solar:stars-bold-duotone"></iconify-icon> Démarrer l'analyse
                    </button>
                </div>
            `;
            const placeholderBtn = content.querySelector('#generateSynthesisPlaceholderBtn');
            if (placeholderBtn) {
                placeholderBtn.addEventListener('click', () => {
                    this.generateAISynthesis();
                });
            }
        }

        // Reset button state to "Générer" and hide header duplicate while placeholder CTA is visible
        if (generateBtn) {
            UI.setGenerateButtonState(generateBtn, 'idle');
            generateBtn.style.display = 'none';
        }

        // Hide copy button
        const copyBtn = this.modal?.querySelector('#copyDashboardSynthesisBtn');
        if (copyBtn) copyBtn.style.display = 'none';

        // Hide refinement toolbar
        if (toolbar) {
            toolbar.style.display = 'none';
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

        // 1. Check in-memory cache first (fastest)
        if (this.cachedSynthesisHTML &&
            this.cachedSynthesisClassId === currentClassId &&
            this.cachedSynthesisPeriod === currentPeriod) {

            this._applySynthesisToUI(this.cachedSynthesisHTML);
            this._checkStaleData();
            return;
        }

        // 2. Check persistent storage (Class data)
        const classes = appState.classes || [];
        const currentClass = classes.find(c => c.id === currentClassId);

        if (currentClass && currentClass.analyses && currentClass.analyses[currentPeriod]) {
            const savedAnalysis = currentClass.analyses[currentPeriod];

            if (savedAnalysis.content) {
                this._applySynthesisToUI(savedAnalysis.content);

                // Update in-memory cache
                this.cachedSynthesisHTML = savedAnalysis.content;
                this.originalSynthesisHTML = savedAnalysis.originalContent || savedAnalysis.content;
                this.cachedSynthesisRawText = savedAnalysis.rawText || '';
                this.originalSynthesisRawText = savedAnalysis.originalRawText || savedAnalysis.rawText || '';
                this.cachedSynthesisClassId = currentClassId;
                this.cachedSynthesisPeriod = currentPeriod;
                this.cachedSynthesisDataHash = savedAnalysis.dataHash || null;
                this.cachedSynthesisModel = savedAnalysis.model || null;
                this.cachedSynthesisSubject = savedAnalysis.subject || null;

                this._updateRevertButtonState();
                this._checkStaleData();
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

        if (dataChanged) {
            UI.setGenerateButtonState(generateBtn, 'dirty');
            generateBtn.title = "Les données (notes ou appréciations) ont changé depuis la dernière génération.";
        } else {
            UI.setGenerateButtonState(generateBtn, 'done');
            generateBtn.title = "";
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
     * Show or hide the revert button based on refinement or manual edit state
     * @private
     */
    _updateRevertButtonState() {
        if (!this._ensureModal()) return;
        const revertBtn = this.modal?.querySelector('#revertSynthesisBtn');
        if (!revertBtn) return;

        if (this._hasSynthesisChangedFromOriginal()) {
            revertBtn.style.display = 'inline-flex';
        } else {
            revertBtn.style.display = 'none';
        }
    },

    /**
     * Hydrate synthesis DOM with quick-copy button, inline contenteditable attributes, and tooltips
     * (Ensures backward compatibility for analyses restored from persistent storage)
     * @param {HTMLElement|null} container
     * @private
     */
    _enhanceSynthesisDOM(container) {
        if (!container) return;

        const introHeader = container.querySelector('.synthesis-intro-header');
        if (introHeader && !introHeader.querySelector('.synthesis-intro-copy-btn')) {
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'btn-icon synthesis-intro-copy-btn tooltip';
            copyBtn.dataset.action = 'copy-intro-synthesis';
            copyBtn.dataset.tooltip = 'Copier pour le bulletin de classe (texte seul)';
            copyBtn.setAttribute('aria-label', 'Copier la synthèse globale');
            copyBtn.innerHTML = '<iconify-icon icon="solar:copy-linear"></iconify-icon>';
            introHeader.appendChild(copyBtn);
        }

        container.querySelectorAll('.synthesis-intro-text, .synthesis-list li').forEach(el => {
            el.setAttribute('contenteditable', 'true');
            el.setAttribute('spellcheck', 'true');
        });

        TooltipsUI.initTooltips(container);
    },

    /**
     * Handle blur on an inline-editable synthesis element, normalizing text and persisting changes
     * @param {HTMLElement} editable
     * @private
     */
    _handleEditableBlur(editable) {
        if (!editable || !editable.isConnected) return;

        const cleanedText = (editable.innerText || editable.textContent || '').replace(/\s+/g, ' ').trim();
        const initialText = editable._initialTextBeforeEdit ?? '';

        if (!cleanedText) {
            const parentList = editable.closest('.synthesis-list');
            if (editable.tagName === 'LI' && parentList && parentList.querySelectorAll('li').length > 1) {
                editable.remove();
                this._syncManualSynthesisEdit();
                return;
            }
            editable.textContent = initialText;
            return;
        }

        editable.textContent = cleanedText;

        if (cleanedText === initialText) return;

        editable._initialTextBeforeEdit = cleanedText;
        this._syncManualSynthesisEdit();
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

        const introEl = synthesisContainer.querySelector('.synthesis-intro-text');
        const successItems = Array.from(synthesisContainer.querySelectorAll('.synthesis-section--success .synthesis-list li'))
            .map(li => (li.innerText || li.textContent || '').trim())
            .filter(Boolean);
        const warningItems = Array.from(synthesisContainer.querySelectorAll('.synthesis-section--warning .synthesis-list li'))
            .map(li => (li.innerText || li.textContent || '').trim())
            .filter(Boolean);
        const infoItems = Array.from(synthesisContainer.querySelectorAll('.synthesis-section--info .synthesis-list li'))
            .map(li => (li.innerText || li.textContent || '').trim())
            .filter(Boolean);
        const hasLegacyPrimary = Boolean(synthesisContainer.querySelector('.synthesis-section--primary'));

        let serializedRawText = '';
        let canonicalHTML = '';

        if (!hasLegacyPrimary && (introEl || successItems.length || warningItems.length || infoItems.length)) {
            const payload = {
                synthesis: (introEl?.innerText || introEl?.textContent || '').trim(),
                strengths: successItems,
                vigilances: warningItems,
                recommendations: infoItems
            };
            serializedRawText = JSON.stringify(payload);
            canonicalHTML = `<div class="ai-synthesis-text">${this._formatSynthesisText(serializedRawText)}</div>`;
        } else {
            const clone = synthesisContainer.cloneNode(true);
            clone.querySelectorAll('.copied').forEach(el => el.classList.remove('copied'));
            canonicalHTML = clone.outerHTML;
            serializedRawText = (synthesisContainer.innerText || synthesisContainer.textContent || '').trim();
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
     * Apply synthesis HTML to the UI and update button state
     * @param {string} htmlContent - HTML to render
     * @param {boolean} [animate=false] - Whether to animate the reveal
     * @private
     */
    async _applySynthesisToUI(htmlContent, animate = false) {
        if (!this._ensureModal()) return;
        const content = this.modal?.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');
        const toolbar = this.modal?.querySelector('#aiRefinementToolbar');

        if (content) {
            if (animate) {
                await UI.animateHtmlReveal(content, htmlContent);
            } else {
                content.innerHTML = htmlContent;
            }
            this._enhanceSynthesisDOM(content);
        }

        // Update button to show "Régénérer" since synthesis exists
        if (generateBtn) {
            generateBtn.style.display = 'inline-flex';
            UI.setGenerateButtonState(generateBtn, 'done');
        }

        // Toggle copy button display next to generate button
        const copyBtn = this.modal?.querySelector('#copyDashboardSynthesisBtn');
        if (copyBtn) {
            copyBtn.style.display = 'inline-flex';
        }

        // Show refinement toolbar
        if (toolbar) {
            toolbar.style.display = 'flex';
        }

        // Update revert button visibility
        this._updateRevertButtonState();
    },

    /**
     * Generate AI synthesis based on calculated statistics
     */
    async generateAISynthesis() {
        if (!UI.checkAPIKeyPresence() || !this._ensureModal()) return;

        const content = this.modal?.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');

        if (!content || !this.cachedStats) return;

        // Show loading skeleton matching the 4-card Bento layout
        content.innerHTML = `
            <div class="appreciation-skeleton class-synthesis-skeleton ai-synthesis-text">
                <div class="synthesis-section synthesis-intro-card" style="opacity: 0.6; min-height: 120px;">
                    <div class="skeleton-line" style="width: 30%; height: 16px; margin-bottom: var(--space-3);"></div>
                    <div class="skeleton-line" style="width: 95%; margin-bottom: var(--space-2);"></div>
                    <div class="skeleton-line" style="width: 88%; margin-bottom: var(--space-2);"></div>
                    <div class="skeleton-line" style="width: 60%;"></div>
                </div>
                <div class="synthesis-section synthesis-section--success" style="opacity: 0.6; min-height: 100px;">
                    <div class="skeleton-line" style="width: 40%; height: 14px; margin-bottom: var(--space-3);"></div>
                    <div class="skeleton-line" style="width: 90%; margin-bottom: var(--space-2);"></div>
                    <div class="skeleton-line" style="width: 85%;"></div>
                </div>
                <div class="synthesis-section synthesis-section--warning" style="opacity: 0.6; min-height: 100px;">
                    <div class="skeleton-line" style="width: 40%; height: 14px; margin-bottom: var(--space-3);"></div>
                    <div class="skeleton-line" style="width: 88%; margin-bottom: var(--space-2);"></div>
                    <div class="skeleton-line" style="width: 80%;"></div>
                </div>
                <div class="synthesis-section synthesis-section--info" style="opacity: 0.6; min-height: 100px;">
                    <div class="skeleton-line" style="width: 40%; height: 14px; margin-bottom: var(--space-3);"></div>
                    <div class="skeleton-line" style="width: 92%; margin-bottom: var(--space-2);"></div>
                    <div class="skeleton-line" style="width: 85%;"></div>
                </div>
                <span class="generating-badge active">
                    <iconify-icon icon="ph:spinner-gap-bold" class="rotate-icon"></iconify-icon>
                    <span>Analyse de la classe en cours...</span>
                </span>
            </div>
        `;

        if (generateBtn) {
            generateBtn.style.display = 'inline-flex';
            UI.setGenerateButtonState(generateBtn, 'loading');
        }

        const targetClassId = appState.currentClassId;
        const targetPeriod = appState.currentPeriod;
        const targetModel = appState.currentAIModel;
        const targetSubject = appState.currentSubject;

        try {
            const stats = this.cachedStats;
            const { systemPrompt, userPrompt } = this.buildAIPrompt(stats);

            const response = await AIService.callAIWithFallback(userPrompt, { systemPrompt });

            // Parse the response into structured sections
            const formattedText = this._formatSynthesisText(response.text);
            const synthesisHTML = `<div class="ai-synthesis-text">${formattedText}</div>`;

            const stillOnSameContext = appState.currentClassId === targetClassId && appState.currentPeriod === targetPeriod;

            // PERSISTENCE: Save to Class Object in Storage for the target class/period
            this._saveSynthesisToStorage(synthesisHTML, stats.dataHash, {
                classId: targetClassId,
                period: targetPeriod,
                model: targetModel,
                subject: targetSubject,
                originalContent: synthesisHTML,
                rawText: response.text,
                originalRawText: response.text
            });

            if (stillOnSameContext) {
                this.cachedSynthesisHTML = synthesisHTML;
                this.originalSynthesisHTML = synthesisHTML;
                this.cachedSynthesisRawText = response.text;
                this.originalSynthesisRawText = response.text;
                this.cachedSynthesisClassId = targetClassId;
                this.cachedSynthesisDataHash = stats.dataHash;
                this.cachedSynthesisPeriod = targetPeriod;
                this.cachedSynthesisModel = targetModel;
                this.cachedSynthesisSubject = targetSubject;

                await this._applySynthesisToUI(synthesisHTML, true);
            }

        } catch (error) {
            if (appState.currentClassId === targetClassId && appState.currentPeriod === targetPeriod) {
                content.innerHTML = `
                    <div class="ai-placeholder">
                        <div class="ai-placeholder-icon is-error"><iconify-icon icon="solar:danger-triangle-linear"></iconify-icon></div>
                        <p class="ai-placeholder-text">Erreur lors de la génération : ${Utils.escapeHtml(error.message)}</p>
                    </div>
                `;
            }
        } finally {
            if (generateBtn && appState.currentClassId === targetClassId && appState.currentPeriod === targetPeriod) {
                const hasSynthesis = Boolean(this.cachedSynthesisHTML && this.cachedSynthesisClassId === targetClassId && this.cachedSynthesisPeriod === targetPeriod);
                generateBtn.style.display = 'inline-flex';
                UI.setGenerateButtonState(generateBtn, hasSynthesis ? 'done' : 'idle');
                if (hasSynthesis) {
                    this._checkStaleData();
                }
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

        if (classObj) {
            if (!classObj.analyses) {
                classObj.analyses = {};
            }

            const existingAnalysis = classObj.analyses[currentPeriod] || {};

            classObj.analyses[currentPeriod] = {
                content: htmlContent,
                originalContent: options.originalContent || existingAnalysis.originalContent || this.originalSynthesisHTML || htmlContent,
                rawText: options.rawText !== undefined ? options.rawText : (this.cachedSynthesisRawText || existingAnalysis.rawText || ''),
                originalRawText: options.originalRawText !== undefined ? options.originalRawText : (this.originalSynthesisRawText || existingAnalysis.originalRawText || ''),
                timestamp: Date.now(),
                model: options.model || appState.currentAIModel,
                subject: options.subject || appState.currentSubject,
                dataHash: dataHash || null
            };

            StorageManager.saveAppState();
        }
    },

    /**
     * Build the AI prompt with statistics context
     * @param {Object} stats 
     * @returns {{systemPrompt: string, userPrompt: string}}
     */
    buildAIPrompt(stats) {
        const period = appState.currentPeriod;
        const periodLabel = { T1: 'premier trimestre', T2: 'deuxième trimestre', T3: 'troisième trimestre', S1: 'premier semestre', S2: 'deuxième semestre' }[period] || period;

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
            ? ` Comme il s'agit du bilan de fin d'année (${periodLabel}), intègre une mise en perspective de la trajectoire annuelle de la classe.`
            : '';

        const systemPrompt = `${roleText}
Tu dois extraire de l'analyse globale et qualitative de la classe : une synthèse globale, les points forts, les points de vigilance, et des recommandations collectives concrètes.

RÈGLES D'ÉCRITURE :
- Synthèse Globale : Rédige 2-4 phrases résumant l'ambiance générale, la dynamique de groupe et le potentiel de la classe dans cette matière.${yearEndClause} Vise environ 40 à 90 mots.
- Points forts : Identifie 2 points forts collectifs (max 15 mots par point).
- Points de vigilance : Identifie 1 à 2 points de vigilance collectifs (max 15 mots par point). Ne cite pas de prénoms d'élèves spécifiques pour les aspects négatifs de comportement.
- Recommandations : Formule 2 actions ou pistes collectives concrètes (max 20 mots par action).
- Écris dans un style naturel et précis, sans formules scolaires toutes faites : décris des dynamiques de groupe concrètes et des leviers d'action réels.
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
            userPrompt += `
• Évolution : ${avgEvolution >= 0 ? '+' : ''}${Number(avgEvolution).toFixed(1)} pts | ${progressCount} progressions, ${stableCount} stables, ${regressionCount} régressions`;
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
            userPrompt += `\n\n**APPRÉCIATIONS INDIVIDUELLES (pour contexte qualitatif) :**
Utilise ces commentaires pour affiner l'analyse (ambiance, comportement, efforts) mais NE CITE PAS d'élèves spécifiques pour les points négatifs de comportement.
${stats.appreciationsList.map((a, idx) => {
    const label = isAnonymous ? `Élève #${idx + 1}` : a.prenom;
    const scrubbedText = PromptService.scrubStudentIdentity(
        a.text || '',
        { prenom: a.prenom, nom: a.nom },
        { anonymizePrenom: isAnonymous }
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
     * Handles refinement actions on the class analysis (summarize, positive, actionable)
     * Preserves the structured 4-card Bento JSON format.
     * @param {HTMLButtonElement} button - The clicked button with data-refine-type
     */
    async handleClassAnalysisActions(button) {
        if (!UI.checkAPIKeyPresence() || !this._ensureModal()) return;
        const type = button.dataset.refineType;
        const contentDiv = this.modal?.querySelector('#aiSynthesisContent');

        const currentTextElement = contentDiv?.querySelector('.ai-synthesis-text');
        if (!this.cachedSynthesisHTML && !currentTextElement) return;

        const currentContentText = this.cachedSynthesisRawText ||
            currentTextElement?.innerText ||
            currentTextElement?.textContent ||
            '';
        if (!currentContentText) return;

        const targetClassId = this.cachedSynthesisClassId ?? appState.currentClassId;
        const targetPeriod = this.cachedSynthesisPeriod || appState.currentPeriod;
        const targetDataHash = this.cachedSynthesisDataHash;

        UI.showInlineSpinner(button);
        button.disabled = true;

        const prompts = {
            'summarize': "Condense fortement cette analyse : rédige une synthèse globale très directe de 1 à 2 phrases (max 35 mots) et raccourcis chaque point fort, point de vigilance et recommandation à l'essentiel (max 10 mots par puce).",
            'positive': "Reformule l'ensemble de cette analyse avec un ton très encourageant, valorisant et constructif : mets en lumière le potentiel du groupe et transforme les points de vigilance en leviers de progression bienveillants.",
            'actionable': "Oriente cette analyse vers l'action concrète pour la prochaine période : rends la synthèse très opérationnelle et formule 2 à 3 recommandations pédagogiques et méthodologiques directement applicables en classe."
        };

        try {
            const systemPrompt = `Tu es un conseiller pédagogique expert. Ajuste la synthèse de classe fournie selon la consigne de l'enseignant tout en conservant impérativement la structure JSON stricte à 4 clés :
{
  "synthesis": "Texte de la synthèse générale...",
  "strengths": ["Point fort 1...", "Point fort 2..."],
  "vigilances": ["Point de vigilance 1...", "Point de vigilance 2..."],
  "recommendations": ["Recommandation 1...", "Recommandation 2..."]
}
Ne rajoute aucune introduction, aucun commentaire, ni de balises Markdown. Réponds directement par l'objet JSON brut.`;
            const userPrompt = `${prompts[type]}\n\nAnalyse à ajuster :\n${currentContentText}`;
            const resp = await AIService.callAIWithFallback(userPrompt, { systemPrompt });

            const formattedText = this._formatSynthesisText(resp.text);
            const refinedHTML = `<div class="ai-synthesis-text">${formattedText}</div>`;

            const stillOnSameContext = appState.currentClassId === targetClassId && appState.currentPeriod === targetPeriod;

            this._saveSynthesisToStorage(refinedHTML, targetDataHash, {
                classId: targetClassId,
                period: targetPeriod,
                rawText: resp.text
            });

            if (stillOnSameContext) {
                if (contentDiv) {
                    await UI.animateHtmlReveal(contentDiv, refinedHTML);
                    this._enhanceSynthesisDOM(contentDiv);
                }
                this.cachedSynthesisHTML = refinedHTML;
                this.cachedSynthesisRawText = resp.text;
                this._updateRevertButtonState();
            }
        } catch (e) {
            UI.showNotification("Erreur d'affinage : " + e.message, 'error');
        } finally {
            UI.hideInlineSpinner(button);
            button.disabled = false;
        }
    },

    /**
     * Reverts the refined synthesis back to the original AI synthesis
     */
    async revertSynthesis() {
        if (!this._ensureModal()) return;
        const contentDiv = this.modal?.querySelector('#aiSynthesisContent');
        if (!contentDiv || !this.originalSynthesisHTML) return;

        this.cachedSynthesisHTML = this.originalSynthesisHTML;
        this.cachedSynthesisRawText = this.originalSynthesisRawText || '';
        await UI.animateHtmlReveal(contentDiv, this.originalSynthesisHTML);
        this._enhanceSynthesisDOM(contentDiv);

        this._saveSynthesisToStorage(this.originalSynthesisHTML, this.cachedSynthesisDataHash, {
            rawText: this.originalSynthesisRawText || ''
        });

        this._updateRevertButtonState();

        UI.showNotification("Synthèse d'origine restaurée !", "success");
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

        await FocusPanelRefinement.displayPromptModal(combined, 'Prévisualisation du Prompt');
    },

    /**
     * Trigger tactile visual feedback on a copy button (header capsule or icon-only button)
     * @param {HTMLElement|null} btn
     * @param {boolean} [isIconOnly=false]
     * @private
     */
    _triggerCopyFeedback(btn, isIconOnly = false) {
        if (!btn) return;
        if (btn._copyFeedbackTimer) clearTimeout(btn._copyFeedbackTimer);
        btn.classList.add('copied');
        btn.innerHTML = isIconOnly
            ? '<iconify-icon icon="ph:check-bold"></iconify-icon>'
            : '<iconify-icon icon="ph:check-bold"></iconify-icon> Copié';
        btn._copyFeedbackTimer = setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = isIconOnly
                ? '<iconify-icon icon="solar:copy-linear"></iconify-icon>'
                : '<iconify-icon icon="solar:copy-linear"></iconify-icon> Copier';
            btn._copyFeedbackTimer = null;
        }, 1800);
    },

    /**
     * Copy only the global synthesis paragraph (plain text without title)
     * Calibrated for the "Appréciation générale de la classe" field in school software (Pronote, ÉcoleDirecte)
     * @param {HTMLElement|null} [buttonEl=null]
     */
    copyIntroSynthesis(buttonEl = null) {
        if (!this._ensureModal()) return;
        const introTextEl = this.modal?.querySelector('#aiSynthesisContent .synthesis-intro-text');
        const textToCopy = (introTextEl?.innerText || introTextEl?.textContent || '').trim();

        if (!textToCopy) {
            UI.showNotification("Aucune synthèse globale à copier.", "warning");
            return;
        }

        const targetBtn = buttonEl || this.modal?.querySelector('.synthesis-intro-copy-btn');

        return navigator.clipboard.writeText(textToCopy)
            .then(() => {
                UI.showNotification("Synthèse globale copiée !", "success");
                this._triggerCopyFeedback(targetBtn, true);
            })
            .catch(() => UI.showNotification("Erreur lors de la copie.", "error"));
    },

    /**
     * Copy structured synthesis to clipboard with tactile visual feedback
     */
    copySynthesis() {
        if (!this._ensureModal()) return;
        const content = this.modal?.querySelector('#aiSynthesisContent .ai-synthesis-text');
        if (!content) {
            UI.showNotification("Aucune synthèse à copier.", "warning");
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
                    const body = introTextEl.textContent.trim();
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

        const copyBtn = this.modal?.querySelector('#copyDashboardSynthesisBtn');

        return navigator.clipboard.writeText(textToCopy)
            .then(() => {
                UI.showNotification("Synthèse copiée !", "success");
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
                            <button type="button" class="btn-icon synthesis-intro-copy-btn tooltip" data-action="copy-intro-synthesis" data-tooltip="Copier pour le bulletin de classe (texte seul)" aria-label="Copier la synthèse globale">
                                <iconify-icon icon="solar:copy-linear"></iconify-icon>
                            </button>
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
            const synthesis = data.synthesis || '';
            const strengths = data.strengths || data.strength || [];
            const vigilances = data.vigilances || data.vigilance || [];
            const recommendations = data.recommendations || data.recommendation || [];

            let html = '';

            if (synthesis) {
                html += this._buildIntroCardHTML('Synthèse Globale', synthesis);
            }

            const sectionsConfig = [
                { title: 'Points forts', icon: 'ph:check-bold', color: 'success', items: strengths },
                { title: 'Points de vigilance', icon: 'solar:danger-triangle-linear', color: 'warning', items: vigilances },
                { title: 'Recommandations', icon: 'solar:lightbulb-linear', color: 'info', items: recommendations }
            ];

            sectionsConfig.forEach(sec => {
                if (Array.isArray(sec.items) && sec.items.length > 0) {
                    html += `
                        <div class="synthesis-section synthesis-section--${sec.color}">
                            <div class="synthesis-section-header">
                                <iconify-icon icon="${sec.icon}"></iconify-icon>
                                <span>${sec.title}</span>
                            </div>
                            <div class="synthesis-section-content">
                                <ul class="synthesis-list">
                                    ${sec.items.map(item => `<li contenteditable="true" spellcheck="true">${Utils.escapeHtml(item)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    `;
                }
            });

            if (html) return html;
        } catch (e) {
            // Silent fallback to legacy Markdown parser below
        }

        // 2. Legacy Regex Markdown Parser Fallback
        const sections = [
            { emoji: '📝', title: 'Synthèse', icon: 'solar:document-text-linear', color: 'primary-dark', isFullWidth: true },
            { emoji: '📊', title: 'Bilan', icon: 'solar:chart-square-linear', color: 'primary' },
            { emoji: '✅', title: 'Points forts', icon: 'ph:check', color: 'success' },
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
                ) || { icon: 'info-circle', color: 'primary' };

                const cleanTitle = currentSection
                    .replace(/\*\*/g, '')
                    .replace(/[📝📊✅⚠️💡]/g, '')
                    .trim();

                const items = currentContent
                    .map(line => line.replace(/^[•\-→]\s*/, '').trim())
                    .filter(line => line.length > 0);

                if (config.isFullWidth) {
                    const paragraph = items.join(' ');
                    html += this._buildIntroCardHTML(cleanTitle || 'Synthèse', paragraph);
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
        return this._buildIntroCardHTML('Synthèse de la Classe', fallbackLines.join('\n'), true);
    },

    /**
     * Close the dashboard modal
     */
    closeDashboard() {
        if (this.modal) {
            UI.closeModal(this.modal);
        }
    }
};
