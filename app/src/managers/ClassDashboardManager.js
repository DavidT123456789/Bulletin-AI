/**
 * @fileoverview Manager for Class Dashboard - Analytics & AI Synthesis
 * @module managers/ClassDashboardManager
 * Provides comprehensive class analytics with calculated statistics and AI synthesis
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { StorageManager } from './StorageManager.js';
import { StudentPhotoManager } from './StudentPhotoManager.js';
import { TooltipsUI } from './TooltipsManager.js';

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

    /**
     * Initialize the dashboard modal reference
     */
    init() {
        this.modal = document.getElementById('classDashboardModal');

        // Attach Context Menu listener for Prompt Preview (Right Click)
        const generateBtn = this.modal?.querySelector('#generateSynthesisBtn');
        if (generateBtn) {
            generateBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this._showPromptPreview();
            });
        }

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
    },

    /**
     * Open the Class Dashboard
     * Calculates all statistics and renders the dashboard
     */
    async openDashboard() {
        if (!this.modal) this.init();

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
     * Get students data for a specific class or current filtered results
     * @param {string|null} classId Optional class ID. If null, uses current appState.filteredResults
     * @returns {Array} Array of student objects with grades and info
     */
    getStudentsData(classId = null) {
        let sourceData = appState.filteredResults;
        const period = appState.currentPeriod;

        // If specific class requested, fetch from main repository
        if (classId) {
            sourceData = (appState.generatedResults || []).filter(r => r.classId === classId);
        }

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

                // 4. Calculate Evolution
                const previousPeriod = this.getPreviousPeriod(period);
                const previousData = previousPeriod ? r.studentData.periods?.[previousPeriod] : null;
                const previousRawGrade = previousData ? previousData.grade : null;

                const prevGrade = (previousRawGrade !== null && previousRawGrade !== undefined)
                    ? this.parseGrade(previousRawGrade)
                    : null;

                const evolution = (prevGrade !== null && !isNaN(prevGrade))
                    ? currentGrade - prevGrade
                    : null;

                return {
                    id: r.id,
                    nom: r.nom,
                    prenom: r.prenom,
                    fullName: Utils.formatStudentName(r.nom, r.prenom),
                    studentPhoto: r.studentPhoto || null,
                    grade: currentGrade,
                    previousGrade: prevGrade,
                    evolution: evolution,
                    appreciation: r.appreciation || '',
                    context: periodData.context || ''
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
     * Parse grade string to number safely
     * @param {string|number} grade 
     * @returns {number} Number or NaN
     */
    parseGrade(grade) {
        if (typeof grade === 'number') return grade;
        if (!grade && grade !== 0) return NaN;

        const parsed = parseFloat(String(grade).replace(',', '.'));
        return isNaN(parsed) ? NaN : parsed;
    },

    /**
     * Get previous period based on current period
     * @param {string} period 
     * @returns {string|null}
     */
    getPreviousPeriod(period) {
        const periods = ['T1', 'T2', 'T3', 'S1', 'S2'];
        const idx = periods.indexOf(period);
        if (idx <= 0) return null;
        // Handle T1 -> nothing, T2 -> T1, T3 -> T2, S2 -> S1
        if (period === 'T2') return 'T1';
        if (period === 'T3') return 'T2';
        if (period === 'S2') return 'S1';
        return null;
    },

    /**
     * Calculate all statistics for the class
     * @param {Array} students 
     * @returns {Object} Computed statistics
     */
    calculateStatistics(students) {
        if (students.length === 0) return null;

        const grades = students.map(s => s.grade).sort((a, b) => a - b);
        const n = grades.length;

        // Basic stats
        const sum = grades.reduce((a, b) => a + b, 0);
        const average = sum / n;
        const min = grades[0];
        const max = grades[n - 1];
        const minStudents = students.filter(s => s.grade === min).map(s => s.fullName);
        const maxStudents = students.filter(s => s.grade === max).map(s => s.fullName);
        const median = n % 2 === 0
            ? (grades[n / 2 - 1] + grades[n / 2]) / 2
            : grades[Math.floor(n / 2)];

        // Standard deviation
        const variance = grades.reduce((acc, g) => acc + Math.pow(g - average, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        // Success Rate (grade >= 10/20)
        const aboveTenCount = grades.filter(g => g >= 10).length;
        const successRate = n > 0 ? (aboveTenCount / n) * 100 : 0;

        // Distribution by range
        const distribution = {
            '0-4': 0,
            '4-8': 0,
            '8-12': 0,
            '12-16': 0,
            '16-20': 0
        };
        grades.forEach(g => {
            if (g < 4) distribution['0-4']++;
            else if (g < 8) distribution['4-8']++;
            else if (g < 12) distribution['8-12']++;
            else if (g < 16) distribution['12-16']++;
            else distribution['16-20']++;
        });

        // Evolution analysis (only students with previous grades)
        const withEvolution = students.filter(s => s.evolution !== null);
        let avgEvolution = null;
        let progressCount = 0;
        let stableCount = 0;
        let regressionCount = 0;

        if (withEvolution.length > 0) {
            avgEvolution = withEvolution.reduce((a, s) => a + s.evolution, 0) / withEvolution.length;
            withEvolution.forEach(s => {
                if (s.evolution > 0.5) progressCount++;
                else if (s.evolution < -0.5) regressionCount++;
                else stableCount++;
            });
        }

        // Top progressions and regressions
        const sortedByEvolution = withEvolution.slice().sort((a, b) => b.evolution - a.evolution);
        const topProgressions = sortedByEvolution.filter(s => s.evolution > 0).slice(0, 15);
        const topRegressions = sortedByEvolution.filter(s => s.evolution < 0).slice(-15).reverse();

        // Students at risk (low grades or significant regression)
        const atRisk = students.filter(s => s.grade < 8 || (s.evolution !== null && s.evolution < -2));

        return {
            count: n,
            average: average,
            median: median,
            min: min,
            max: max,
            minStudents: minStudents,
            maxStudents: maxStudents,
            stdDev: stdDev,
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

            // New Metadata for AI & Consistency
            dataHash: this._computeClassDataHash(students),
            appreciationsList: students.filter(s => s.appreciation && s.appreciation.trim().length > 0)
                .map(s => ({ prenom: s.prenom, text: s.appreciation }))
        };
    },

    /**
     * Compute a simple hash of the current class data to detect changes
     * @param {Array} students
     * @returns {string}
     * @private
     */
    _computeClassDataHash(students) {
        if (!students || students.length === 0) return '';
        // Create a signature based on ID, grade, and appreciation content length
        // We use length/presence to detect changes without storing full text in hash
        return students.map(s =>
            `${s.id}:${s.grade}:${s.appreciation ? s.appreciation.length : 0}`
        ).join('|');
    },

    /**
     * Render the dashboard with statistics
     * @param {Object} stats 
     * @param {Array} students 
     */
    renderDashboard(stats, students) {
        if (!stats) return;

        // Update header info using new context line
        const periodBadge = this.modal.querySelector('#dashboardPeriodBadge');
        const studentCount = this.modal.querySelector('#dashboardStudentCount');
        const classBadge = this.modal.querySelector('#dashboardClassBadge');
        const classDot = this.modal.querySelector('#dashboardClassDot');

        if (periodBadge) {
            const periodLabels = { T1: 'Trimestre 1', T2: 'Trimestre 2', T3: 'Trimestre 3', S1: 'Semestre 1', S2: 'Semestre 2' };
            periodBadge.textContent = periodLabels[appState.currentPeriod] || appState.currentPeriod;
        }
        if (studentCount) {
            studentCount.innerHTML = `<strong>${stats.count}</strong> ${stats.count > 1 ? 'élèves analysés' : 'élève analysé'}`;
        }

        // Retrieve and display class name
        const classes = appState.classes || [];
        const currentClass = classes.find(c => c.id === appState.currentClassId);
        if (classBadge && currentClass) {
            classBadge.textContent = currentClass.name;
            classBadge.style.display = 'inline';
            if (classDot) classDot.style.display = 'inline';
        } else if (classBadge) {
            classBadge.style.display = 'none';
            if (classDot) classDot.style.display = 'none';
        }

        // Retrieve and display active subject (discipline)
        const subjectBadge = this.modal.querySelector('#dashboardSubjectBadge');
        const subjectDot = this.modal.querySelector('#dashboardSubjectDot');
        
        const customStyle = appState.subjects?.['MonStyle']?.iaConfig;
        const genericStyle = appState.subjects?.['Générique']?.iaConfig;
        const iaConfig = customStyle || genericStyle || {};
        const discipline = iaConfig.discipline || (appState.currentSubject !== 'Générique' && appState.currentSubject !== 'MonStyle' ? appState.currentSubject : null);

        if (subjectBadge && discipline) {
            subjectBadge.textContent = discipline;
            subjectBadge.style.display = 'inline';
            if (subjectDot) subjectDot.style.display = 'inline';
        } else if (subjectBadge) {
            subjectBadge.style.display = 'none';
            if (subjectDot) subjectDot.style.display = 'none';
        }

        // Display Class Stats (Moyenne, Min, Max) in Cohort Stats Bar
        const statAverage = this.modal.querySelector('#cohortStatAverage');
        const statMin = this.modal.querySelector('#cohortStatMin');
        const statMax = this.modal.querySelector('#cohortStatMax');

        if (stats) {
            const moy = stats.average.toFixed(1).replace('.', ',');
            const min = stats.min.toFixed(1).replace('.', ',');
            const max = stats.max.toFixed(1).replace('.', ',');

            if (statAverage) {
                statAverage.textContent = `${moy}/20`;
                // Remove previous grade range classes
                statAverage.className = 'stat-value';
                const gradeClass = Utils.getGradeClass(stats.average);
                if (gradeClass) {
                    statAverage.classList.add(gradeClass);
                }
            }
            if (statMin) {
                statMin.textContent = `${min}/20`;
                const minLabel = stats.minStudents.length > 1 ? 'Élèves' : 'Élève';
                const minTooltip = `<strong>${minLabel} (${min}/20) :</strong><br>${stats.minStudents.join('<br>')}`;
                TooltipsUI.updateTooltip(statMin, minTooltip);
            }
            if (statMax) {
                statMax.textContent = `${max}/20`;
                const maxLabel = stats.maxStudents.length > 1 ? 'Élèves' : 'Élève';
                const maxTooltip = `<strong>${maxLabel} (${max}/20) :</strong><br>${stats.maxStudents.join('<br>')}`;
                TooltipsUI.updateTooltip(statMax, maxTooltip);
            }
        }

        // Update cohort header micro-metric (success rate)
        const cohortHeaderMetric = this.modal.querySelector('#cohortHeaderMetric');
        if (cohortHeaderMetric) {
            cohortHeaderMetric.innerHTML = `<iconify-icon icon="solar:shield-check-linear"></iconify-icon> <strong>${stats.successRate.toFixed(0)}%</strong> de réussite`;
        }

        // Update Highlights
        this.updateHighlights(stats);

        // Restore cached AI synthesis if it matches current class/period, otherwise reset
        this.restoreOrResetAISection();
    },

    /**
     * Update KPI metric cards (obsolete, handled in header metric)
     * @param {Object} stats 
     */
    updateKPICards(stats) {
        // No-op : KPIs retirés pour éviter la redondance
    },

    /**
     * Update highlights sections (progressions and regressions)
     * @param {Object} stats 
     */
    updateHighlights(stats) {
        // Top Progressions
        const progressList = this.modal.querySelector('#highlightProgressList');
        if (progressList) {
            TooltipsUI.cleanupTooltipsIn(progressList);
            if (stats.topProgressions.length > 0) {
                progressList.innerHTML = stats.topProgressions.map(s => {
                    const formattedGrade = s.grade.toFixed(1).replace('.', ',');
                    const formattedEvolution = s.evolution.toFixed(1).replace('.', ',');
                    const tooltipText = `${s.fullName} — Moyenne : ${formattedGrade}/20 (+${formattedEvolution} pts)`;
                    return `
                        <div class="highlight-item" data-student-id="${s.id}" data-tooltip="${Utils.escapeHtml(tooltipText)}">
                            <div class="highlight-item-left">
                                ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                                <span class="highlight-student-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                            </div>
                            <span class="highlight-evolution positive">+${formattedEvolution} pts</span>
                        </div>
                    `;
                }).join('');
            } else {
                progressList.innerHTML = '<div class="highlight-empty">Aucune progression significative</div>';
            }
        }

        // At Risk / Regressions
        const riskList = this.modal.querySelector('#highlightRiskList');
        if (riskList) {
            TooltipsUI.cleanupTooltipsIn(riskList);
            // Combine regressions and low grades
            const atRiskStudents = [...new Map([...stats.topRegressions, ...stats.atRisk].map(s => [s.id, s])).values()].slice(0, 15);

            if (atRiskStudents.length > 0) {
                riskList.innerHTML = atRiskStudents.map(s => {
                    const formattedGrade = s.grade.toFixed(1).replace('.', ',');
                    let tooltipText = `${s.fullName} — Moyenne : ${formattedGrade}/20`;
                    let evolutionText = '';

                    if (s.evolution !== null) {
                        const formattedEvolution = s.evolution.toFixed(1).replace('.', ',');
                        tooltipText += ` (${formattedEvolution} pts)`;
                        evolutionText = `${formattedEvolution} pts`;
                    } else {
                        evolutionText = `Moy: ${formattedGrade}`;
                    }

                    return `
                        <div class="highlight-item" data-student-id="${s.id}" data-tooltip="${Utils.escapeHtml(tooltipText)}">
                            <div class="highlight-item-left">
                                ${StudentPhotoManager.getAvatarHTML(s, 'sm')}
                                <span class="highlight-student-name">${Utils.formatStudentName(s.nom, s.prenom, true)}</span>
                            </div>
                            <span class="highlight-evolution negative">${evolutionText}</span>
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
        const content = this.modal.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal.querySelector('#generateSynthesisBtn');
        const toolbar = this.modal.querySelector('#aiRefinementToolbar');

        if (content) {
            content.innerHTML = `
                <div class="ai-placeholder">
                    <div class="ai-placeholder-glow"></div>
                    <div class="ai-placeholder-icon">
                        <iconify-icon icon="solar:magic-stick-3-bold"></iconify-icon>
                    </div>
                    <h4 class="ai-placeholder-title">Analyse Intelligente de la Classe</h4>
                    <p class="ai-placeholder-text">Obtenez une analyse globale qualitative de votre classe en un instant. L'IA étudie les notes, les tendances d'évolution et les appréciations individuelles pour proposer des points forts, des points de vigilance et des recommandations pédagogiques actionnables.</p>
                    <button class="btn btn-primary btn-ai" id="generateSynthesisPlaceholderBtn">
                        <iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon> Démarrer l'analyse
                    </button>
                </div>
            `;
            // Attach event listener for the placeholder button since it's injected dynamically
            const placeholderBtn = content.querySelector('#generateSynthesisPlaceholderBtn');
            if (placeholderBtn) {
                placeholderBtn.addEventListener('click', () => {
                    this.generateAISynthesis();
                });
            }
        }

        // Reset button text to "Générer"
        if (generateBtn) {
            generateBtn.innerHTML = '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon> Générer';
            generateBtn.className = 'btn btn-ai btn-small';
        }

        // Hide copy button
        const copyBtn = this.modal.querySelector('#copyDashboardSynthesisBtn');
        if (copyBtn) copyBtn.style.display = 'none';

        // Hide refinement toolbar
        if (toolbar) {
            toolbar.style.display = 'none';
        }

        this.originalSynthesisHTML = null;
        this.cachedSynthesisHTML = null;
    },

    /**
     * Restore cached AI synthesis if it matches current class/period, otherwise reset to placeholder
     * This persists the synthesis between modal open/close operations and sessions (via persistent storage)
     */
    restoreOrResetAISection() {
        const currentClassId = appState.currentClassId;
        const currentPeriod = appState.currentPeriod;

        // 1. Check in-memory cache first (fastest)
        if (this.cachedSynthesisHTML &&
            this.cachedSynthesisClassId === currentClassId &&
            this.cachedSynthesisPeriod === currentPeriod) {

            this._applySynthesisToUI(this.cachedSynthesisHTML);
            this._checkStaleData(); // Check stale data for memory cache too
            return;
        }

        // 2. Check persistent storage (Class data)
        const classes = appState.classes || [];
        const currentClass = classes.find(c => c.id === currentClassId);

        if (currentClass && currentClass.analyses && currentClass.analyses[currentPeriod]) {
            const savedAnalysis = currentClass.analyses[currentPeriod];

            // Check if saved analysis has valid content
            if (savedAnalysis.content) {
                // Restore to UI
                this._applySynthesisToUI(savedAnalysis.content);

                // Update in-memory cache
                this.cachedSynthesisHTML = savedAnalysis.content;
                this.originalSynthesisHTML = savedAnalysis.originalContent || savedAnalysis.content;
                this.cachedSynthesisClassId = currentClassId;
                this.cachedSynthesisPeriod = currentPeriod;
                this.cachedSynthesisDataHash = savedAnalysis.dataHash || null;
                this.cachedSynthesisModel = savedAnalysis.model || null;
                this.cachedSynthesisSubject = savedAnalysis.subject || null;

                // Update revert button visibility
                this._updateRevertButtonState();

                // Check for stale data (if data has changed since generation)
                // We do this AFTER applying the content to ensure the button state updates correctly
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
        const generateBtn = this.modal.querySelector('#generateSynthesisBtn');
        if (!generateBtn || !this.cachedStats || !this.cachedSynthesisDataHash) return;

        const dataChanged = this.cachedStats.dataHash !== this.cachedSynthesisDataHash;
        const modelChanged = this.cachedSynthesisModel && appState.currentAIModel !== this.cachedSynthesisModel;
        const subjectChanged = this.cachedSynthesisSubject && appState.currentSubject !== this.cachedSynthesisSubject;

        if (dataChanged || modelChanged || subjectChanged) {
            // Data is stale
            generateBtn.innerHTML = '<iconify-icon icon="solar:refresh-linear"></iconify-icon> Actualiser';
            generateBtn.className = 'btn btn-warning btn-small';
            
            let reason = "Les données (notes ou appréciations) ont changé depuis la dernière génération.";
            if (modelChanged && subjectChanged) {
                reason = "Le modèle d'IA et la matière active ont changé.";
            } else if (modelChanged) {
                reason = "Le modèle d'IA sélectionné a changé.";
            } else if (subjectChanged) {
                reason = "La matière active a changé.";
            }
            generateBtn.title = reason;
        } else {
            // Data is fresh
            generateBtn.innerHTML = '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon> Régénérer';
            generateBtn.className = 'btn btn-ai btn-small';
            generateBtn.title = "";
        }
    },

    /**
     * Show or hide the revert button based on refinement state
     * @private
     */
    _updateRevertButtonState() {
        const revertBtn = this.modal.querySelector('#revertSynthesisBtn');
        if (!revertBtn) return;

        if (this.originalSynthesisHTML && this.cachedSynthesisHTML && this.originalSynthesisHTML !== this.cachedSynthesisHTML) {
            revertBtn.style.display = 'inline-flex';
        } else {
            revertBtn.style.display = 'none';
        }
    },

    /**
     * Apply synthesis HTML to the UI and update button state
     * @private
     */
    _applySynthesisToUI(htmlContent) {
        const content = this.modal.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal.querySelector('#generateSynthesisBtn');
        const toolbar = this.modal.querySelector('#aiRefinementToolbar');

        if (content) {
            content.innerHTML = htmlContent;
        }

        // Update button to show "Régénérer" since synthesis exists
        if (generateBtn) {
            generateBtn.innerHTML = '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon> Régénérer';
        }

        // Toggle copy button display next to generate button
        const copyBtn = this.modal.querySelector('#copyDashboardSynthesisBtn');
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
        if (!UI.checkAPIKeyPresence()) return;

        const content = this.modal.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal.querySelector('#generateSynthesisBtn');

        if (!content || !this.cachedStats) return;

        // Show loading
        content.innerHTML = `
            <div class="ai-loading-state">
                <div class="loading-spinner"></div>
                <span>Analyse de la classe en cours...</span>
            </div>
        `;

        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.innerHTML = '<iconify-icon icon="solar:spinner-linear" class="spin"></iconify-icon> Génération...';
        }

        try {
            const stats = this.cachedStats;
            const { systemPrompt, userPrompt } = this.buildAIPrompt(stats);

            const response = await AIService.callAIWithFallback(userPrompt, { systemPrompt });

            // Parse the response into structured sections
            const formattedText = this._formatSynthesisText(response.text);
            const synthesisHTML = `<div class="ai-synthesis-text">${formattedText}</div>`;

            content.innerHTML = synthesisHTML;

            // Cache the synthesis for persistence across modal open/close
            this.cachedSynthesisHTML = synthesisHTML;
            this.originalSynthesisHTML = synthesisHTML; // Save as original when first generated
            this.cachedSynthesisClassId = appState.currentClassId;
            this.cachedSynthesisDataHash = stats.dataHash; // Update hash
            this.cachedSynthesisPeriod = appState.currentPeriod;
            this.cachedSynthesisModel = appState.currentAIModel;
            this.cachedSynthesisSubject = appState.currentSubject;

            // PERSISTENCE: Save to Class Object in Storage
            this._saveSynthesisToStorage(synthesisHTML, stats.dataHash);

        } catch (error) {
            content.innerHTML = `
                <div class="ai-placeholder">
                    <div class="ai-placeholder-icon" style="background: var(--error-light); color: var(--error-color);"><iconify-icon icon="solar:danger-triangle-linear"></iconify-icon></div>
                    <p class="ai-placeholder-text">Erreur lors de la génération : ${Utils.escapeHtml(error.message)}</p>
                </div>
            `;
        } finally {
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<iconify-icon icon="solar:magic-stick-3-linear"></iconify-icon> Régénérer';
            }
        }
    },

    /**
     * Helper to save synthesis to the persistent Class object
     * @private
     */
    _saveSynthesisToStorage(htmlContent, dataHash) {
        const currentClassId = appState.currentClassId;
        const currentPeriod = appState.currentPeriod;

        if (!currentClassId) return; // Legacy mode (no class ID) might not support persistence

        const classes = appState.classes || [];
        const classObj = classes.find(c => c.id === currentClassId);

        if (classObj) {
            // Init analyses object if missing
            if (!classObj.analyses) {
                classObj.analyses = {};
            }

            // Save analysis for this period
            classObj.analyses[currentPeriod] = {
                content: htmlContent,
                originalContent: this.originalSynthesisHTML || htmlContent, // Save original
                timestamp: Date.now(),
                model: appState.currentAIModel,
                subject: appState.currentSubject,
                dataHash: dataHash || null, // Save the signature of data used
                statsSnapshot: this.cachedStats // Optional: save stats used for generation
            };

            // Trigger storage save
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

        // Fetch teacher's style custom profile if available to propagate it
        const customStyle = appState.subjects?.['MonStyle']?.iaConfig;
        const genericStyle = appState.subjects?.['Générique']?.iaConfig;
        const iaConfig = customStyle || genericStyle || { tone: 3 };

        const toneMap = {
            1: 'très encourageant et positif',
            2: 'bienveillant et constructif',
            3: null,
            4: 'exigeant mais constructif',
            5: 'strict et formel'
        };
        const toneInstruction = toneMap[iaConfig.tone];

        let styleInstructionText = '';
        if (toneInstruction) {
            styleInstructionText += `\n- Adopte un ton ${toneInstruction} pour l'ensemble du bilan.`;
        }
        if (iaConfig.styleInstructions && iaConfig.enableStyleInstructions !== false) {
            styleInstructionText += `\n- Consignes additionnelles : ${iaConfig.styleInstructions}`;
        }

        const discipline = iaConfig.discipline || (appState.currentSubject !== 'Générique' && appState.currentSubject !== 'MonStyle' ? appState.currentSubject : null);
        const roleText = discipline
            ? `Tu es un enseignant de ${discipline}. Tu rédiges un bilan/synthèse de classe précis, nuancé et professionnel dans cette matière pour le conseil de classe du ${periodLabel}.`
            : `Tu es un conseiller principal d'éducation ou un professeur principal. Tu rédiges un bilan/synthèse de classe précis, nuancé et professionnel global pour le conseil de classe du ${periodLabel}.`;

        const systemPrompt = `${roleText}
Tu devez extraire de l'analyse globale et qualitative de la classe : une synthèse globale, les points forts, les points de vigilance, et des recommandations collectives concrètes.

RÈGLES D'ÉCRITURE :
- Synthèse Globale : Rédige 2-4 phrases résumant l'ambiance générale, la dynamique de groupe et le potentiel de la classe dans cette matière. Vise une longueur STRICTEMENT comprise entre 40 et 90 mots.
- Points forts : Identifie 2 points forts collectifs (max 15 mots par point).
- Points de vigilance : Identifie 1 à 2 points de vigilance collectifs (max 15 mots par point). Ne cite pas de prénoms d'élèves spécifiques pour les aspects négatifs de comportement.
- Recommandations : Formule 2 actions ou pistes collectives concrètes (max 20 mots par action).
- N'utilise JAMAIS de clichés scolaires vides ("élève sérieux", "peut mieux faire", "continuer ainsi", "poursuivre ses efforts", "doit persévérer"). A la place, décris des dynamiques concrètes et des leviers d'action réels.
- Utilise un ton professionnel et constructif.${styleInstructionText}

FORMAT DE RÉPONSE OBLIGATOIRE :
Tu devez répondre uniquement sous le format d'un objet JSON strict avec la structure suivante :
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

        let userPrompt = `Voici les données de la classe :
• Effectif : ${stats.count} élèves
• Moyenne : ${stats.average.toFixed(1)}/20 | Médiane : ${stats.median.toFixed(1)}/20
• Min : ${stats.min.toFixed(1)} | Max : ${stats.max.toFixed(1)} | Écart-type : ${stats.stdDev.toFixed(1)}
• Répartition : ${stats.distribution['16-20']} excellents, ${stats.distribution['12-16']} bons, ${stats.distribution['8-12']} moyens, ${stats.distribution['4-8']} fragiles, ${stats.distribution['0-4']} en difficulté`;

        if (stats.hasEvolutionData) {
            userPrompt += `
• Évolution : ${stats.avgEvolution >= 0 ? '+' : ''}${stats.avgEvolution.toFixed(1)} pts | ${stats.progressCount} progressions, ${stats.stableCount} stables, ${stats.regressionCount} régressions`;
            if (stats.topProgressions.length > 0) {
                userPrompt += `\n• Top progressions : ${stats.topProgressions.slice(0, 3).map(s => `${s.prenom} (+${s.evolution.toFixed(1)})`).join(', ')}`;
            }
        }

        if (stats.appreciationsList && stats.appreciationsList.length > 0) {
            userPrompt += `\n\n**APPRÉCIATIONS INDIVIDUELLES (pour contexte qualitatif) :**
Utilise ces commentaires pour affiner l'analyse (ambiance, comportement, efforts) mais NE CITE PAS d'élèves spécifiques pour les points négatifs de comportement.
${stats.appreciationsList.map(a => `• ${a.prenom} : ${a.text}`).join('\n')}`;
        }

        return { systemPrompt, userPrompt };
    },

    /**
     * Handles refinement actions on the class analysis (summarize, positive, actionable)
     * @param {HTMLButtonElement} button - The clicked button with data-refine-type
     */
    async handleClassAnalysisActions(button) {
        if (!UI.checkAPIKeyPresence()) return;
        const type = button.dataset.refineType;
        const contentDiv = this.modal.querySelector('#aiSynthesisContent');

        // Find the text of current synthesis (either original or previous refinement)
        const currentTextElement = contentDiv?.querySelector('.ai-synthesis-text');
        if (!currentTextElement || !this.cachedSynthesisHTML) return;

        const currentContentText = currentTextElement.innerText;

        UI.showInlineSpinner(button);
        button.disabled = true;

        const prompts = {
            'summarize': "Résume cette analyse en 3 points clés très concis.",
            'positive': "Reformule cette appréciation pour insister davantage sur les aspects positifs et encourageants.",
            'actionable': "Transforme cette analyse en un plan d'action concret pour le prochain trimestre (3-4 objectifs collectifs)."
        };

        try {
            const systemPrompt = "Tu es un conseiller pédagogique. Réécris ou ajuste la synthèse de classe fournie selon les instructions de l'enseignant. Garde un ton professionnel et constructif. Réponds directement sans introduction ni formule de politesse.";
            const userPrompt = `${prompts[type]}\n\nAnalyse originale :\n${currentContentText}`;
            const resp = await AIService.callAIWithFallback(userPrompt, { systemPrompt });

            // Format and display
            const formattedText = this._formatSynthesisText(resp.text);
            const refinedHTML = `<div class="ai-synthesis-text">${formattedText}</div>`;

            await UI.animateHtmlReveal(contentDiv, refinedHTML);

            // Update cache and save
            this.cachedSynthesisHTML = refinedHTML;
            this._saveSynthesisToStorage(refinedHTML, this.cachedSynthesisDataHash);

            // Update revert button visibility
            this._updateRevertButtonState();
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
        const contentDiv = this.modal.querySelector('#aiSynthesisContent');
        if (!contentDiv || !this.originalSynthesisHTML) return;

        // Apply back original HTML
        this.cachedSynthesisHTML = this.originalSynthesisHTML;
        await UI.animateHtmlReveal(contentDiv, this.originalSynthesisHTML);

        // Save back to storage
        this._saveSynthesisToStorage(this.originalSynthesisHTML, this.cachedSynthesisDataHash);

        // Update revert button visibility
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

        const { FocusPanelRefinement } = await import('./FocusPanelRefinement.js');
        await FocusPanelRefinement.displayPromptModal(combined, 'Prévisualisation du Prompt');
    },


    /**
     * Copy synthesis to clipboard
     */
    copySynthesis() {
        const content = this.modal.querySelector('#aiSynthesisContent .ai-synthesis-text');
        if (!content) {
            UI.showNotification("Aucune synthèse à copier.", "warning");
            return;
        }

        navigator.clipboard.writeText(content.innerText)
            .then(() => UI.showNotification("Synthèse copiée !", "success"))
            .catch(() => UI.showNotification("Erreur lors de la copie.", "error"));
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

        // 1. JSON Parser Mode (Robust)
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }

        try {
            const data = JSON.parse(cleaned);
            const synthesis = data.synthesis || '';
            const strengths = data.strengths || data.strength || [];
            const vigilances = data.vigilances || data.vigilance || [];
            const recommendations = data.recommendations || data.recommendation || [];

            let html = '';
            
            if (synthesis) {
                html += `
                    <div class="synthesis-section synthesis-intro-card">
                        <div class="synthesis-intro-header">
                            <iconify-icon icon="solar:stars-bold-duotone"></iconify-icon>
                            <span>Synthèse Globale</span>
                        </div>
                        <p class="synthesis-intro-text">${Utils.escapeHtml(synthesis)}</p>
                    </div>
                `;
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
                                    ${sec.items.map(item => `<li>${Utils.escapeHtml(item)}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    `;
                }
            });

            if (html) return html;
        } catch (e) {
            console.warn('[ClassDashboardManager] JSON parsing failed, falling back to Markdown parser:', e);
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

        // Split text into sections by looking for section headers
        const lines = text.split('\n');
        let currentSection = null;
        let currentContent = [];

        const flushSection = () => {
            if (currentSection && currentContent.length > 0) {
                const config = sections.find(s =>
                    currentSection.includes(s.emoji) ||
                    currentSection.toLowerCase().includes(s.title.toLowerCase())
                ) || { icon: 'info-circle', color: 'primary' };

                // Clean the title (remove ** and emoji)
                let cleanTitle = currentSection
                    .replace(/\*\*/g, '')
                    .replace(/[📝📊✅⚠️💡]/g, '')
                    .trim();

                // Process content - convert bullet points to list items
                const items = currentContent
                    .map(line => line.replace(/^[•\-→]\s*/, '').trim())
                    .filter(line => line.length > 0);

                if (config.isFullWidth) {
                    // Narrative section (Synthesis)
                    const paragraph = items.join(' ');
                    html += `
                    <div class="synthesis-section synthesis-intro-card">
                        <div class="synthesis-intro-header">
                            <iconify-icon icon="solar:stars-bold-duotone"></iconify-icon>
                            <span>${cleanTitle || 'Synthèse'}</span>
                        </div>
                        <p class="synthesis-intro-text">${paragraph}</p>
                    </div>
                 `;
                } else {
                    // Bullet point sections
                    html += `
                    <div class="synthesis-section synthesis-section--${config.color}">
                        <div class="synthesis-section-header">
                            <iconify-icon icon="${config.icon}"></iconify-icon>
                            <span>${cleanTitle}</span>
                        </div>
                        <div class="synthesis-section-content">
                            <ul class="synthesis-list">
                                ${items.map(item => `<li>${item}</li>`).join('')}
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

            // Check if line is a section header (contains emoji or **Title**)
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

        // Flush last section
        flushSection();

        return html || `<p>${text}</p>`;
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
