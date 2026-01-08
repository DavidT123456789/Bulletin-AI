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

    /**
     * Initialize the dashboard modal reference
     */
    init() {
        this.modal = document.getElementById('classDashboardModal');
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
     * Get current students data from filtered results
     * @returns {Array} Array of student objects with grades and info
     */
    getStudentsData() {
        const period = appState.currentPeriod;

        // Robust data gathering that doesn't fail on appreciation errors
        return appState.filteredResults
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
                    fullName: `${r.prenom} ${r.nom}`,
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
        const median = n % 2 === 0
            ? (grades[n / 2 - 1] + grades[n / 2]) / 2
            : grades[Math.floor(n / 2)];

        // Standard deviation
        const variance = grades.reduce((acc, g) => acc + Math.pow(g - average, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

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
        const topProgressions = sortedByEvolution.filter(s => s.evolution > 0).slice(0, 5);
        const topRegressions = sortedByEvolution.filter(s => s.evolution < 0).slice(-5).reverse();

        // Students at risk (low grades or significant regression)
        const atRisk = students.filter(s => s.grade < 8 || (s.evolution !== null && s.evolution < -2));

        return {
            count: n,
            average: average,
            median: median,
            min: min,
            max: max,
            stdDev: stdDev,
            distribution: distribution,
            avgEvolution: avgEvolution,
            progressCount: progressCount,
            stableCount: stableCount,
            regressionCount: regressionCount,
            topProgressions: topProgressions,
            topRegressions: topRegressions,
            atRisk: atRisk,
            hasEvolutionData: withEvolution.length > 0
        };
    },

    /**
     * Render the dashboard with statistics
     * @param {Object} stats 
     * @param {Array} students 
     */
    renderDashboard(stats, students) {
        if (!stats) return;

        // Update header info
        const periodBadge = this.modal.querySelector('#dashboardPeriodBadge');
        const studentCount = this.modal.querySelector('#dashboardStudentCount');

        if (periodBadge) {
            const periodLabels = { T1: 'Trimestre 1', T2: 'Trimestre 2', T3: 'Trimestre 3', S1: 'Semestre 1', S2: 'Semestre 2' };
            periodBadge.innerHTML = `<i class="fas fa-calendar-alt"></i> ${periodLabels[appState.currentPeriod] || appState.currentPeriod}`;
        }
        if (studentCount) {
            studentCount.innerHTML = `<i class="fas fa-users"></i> <strong>${stats.count}</strong> élèves analysés`;
        }

        // Update KPI Cards
        this.updateKPICards(stats);

        // Update Distribution Chart
        this.updateDistributionChart(stats);

        // Update Highlights
        this.updateHighlights(stats);

        // Restore cached AI synthesis if it matches current class/period, otherwise reset
        this.restoreOrResetAISection();
    },

    /**
     * Update KPI metric cards
     * @param {Object} stats 
     */
    updateKPICards(stats) {
        // Average
        const avgValue = this.modal.querySelector('#kpiAverage');
        const avgEvolution = this.modal.querySelector('#kpiAverageEvolution');
        if (avgValue) avgValue.textContent = stats.average.toFixed(1);
        if (avgEvolution && stats.avgEvolution !== null) {
            const sign = stats.avgEvolution >= 0 ? '+' : '';
            avgEvolution.textContent = `${sign}${stats.avgEvolution.toFixed(1)} pts`;
            avgEvolution.className = `kpi-evolution ${stats.avgEvolution > 0 ? 'positive' : stats.avgEvolution < 0 ? 'negative' : 'neutral'}`;
            avgEvolution.style.display = 'inline-flex';
        } else if (avgEvolution) {
            avgEvolution.style.display = 'none';
        }

        // Median
        const medianValue = this.modal.querySelector('#kpiMedian');
        if (medianValue) medianValue.textContent = stats.median.toFixed(1);

        // Spread (écart-type)
        const spreadValue = this.modal.querySelector('#kpiSpread');
        const spreadLabel = this.modal.querySelector('#kpiSpreadLabel');
        if (spreadValue) spreadValue.textContent = stats.stdDev.toFixed(1);
        if (spreadLabel) {
            if (stats.stdDev < 2) spreadLabel.textContent = 'Classe homogène';
            else if (stats.stdDev < 4) spreadLabel.textContent = 'Écart modéré';
            else spreadLabel.textContent = 'Classe hétérogène';
        }
    },

    /**
     * Update distribution horizontal bar chart
     * @param {Object} stats 
     */
    updateDistributionChart(stats) {
        const container = this.modal.querySelector('#distributionBars');
        if (!container) return;

        const maxCount = Math.max(...Object.values(stats.distribution), 1);
        const ranges = ['16-20', '12-16', '8-12', '4-8', '0-4']; // Top to bottom

        container.innerHTML = ranges.map(range => {
            const count = stats.distribution[range];
            const percent = (count / maxCount) * 100;
            return `
                <div class="distribution-row">
                    <span class="distribution-label">${range}</span>
                    <div class="distribution-bar-track">
                        <div class="distribution-bar-fill" data-range="${range}" style="width: ${percent}%"></div>
                    </div>
                    <span class="distribution-count">${count}</span>
                </div>
            `;
        }).join('');

        // Animate bars after a small delay
        requestAnimationFrame(() => {
            container.querySelectorAll('.distribution-bar-fill').forEach(bar => {
                bar.style.width = bar.style.width; // Trigger animation
            });
        });
    },

    /**
     * Update highlights sections (progressions and regressions)
     * @param {Object} stats 
     */
    updateHighlights(stats) {
        // Top Progressions
        const progressList = this.modal.querySelector('#highlightProgressList');
        if (progressList) {
            if (stats.topProgressions.length > 0) {
                progressList.innerHTML = stats.topProgressions.map(s => `
                    <div class="highlight-item" data-student-id="${s.id}">
                        <span class="highlight-student-name">${s.fullName}</span>
                        <span class="highlight-evolution positive">+${s.evolution.toFixed(1)} pts</span>
                    </div>
                `).join('');
            } else {
                progressList.innerHTML = '<div class="highlight-empty">Aucune progression significative</div>';
            }
        }

        // At Risk / Regressions
        const riskList = this.modal.querySelector('#highlightRiskList');
        if (riskList) {
            // Combine regressions and low grades
            const atRiskStudents = [...new Map([...stats.topRegressions, ...stats.atRisk].map(s => [s.id, s])).values()].slice(0, 5);

            if (atRiskStudents.length > 0) {
                riskList.innerHTML = atRiskStudents.map(s => {
                    const evolutionText = s.evolution !== null ? `${s.evolution.toFixed(1)} pts` : `Moy: ${s.grade.toFixed(1)}`;
                    return `
                        <div class="highlight-item" data-student-id="${s.id}">
                            <span class="highlight-student-name">${s.fullName}</span>
                            <span class="highlight-evolution negative">${evolutionText}</span>
                        </div>
                    `;
                }).join('');
            } else {
                riskList.innerHTML = '<div class="highlight-empty">Aucun élève en difficulté</div>';
            }
        }
    },

    /**
     * Reset AI section to placeholder state
     */
    resetAISection() {
        const content = this.modal.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal.querySelector('#generateSynthesisBtn');

        if (content) {
            content.innerHTML = `
                <div class="ai-placeholder">
                    <div class="ai-placeholder-icon"><i class="fas fa-wand-magic-sparkles"></i></div>
                    <p class="ai-placeholder-text">Cliquez sur "Générer la synthèse" pour obtenir une analyse IA contextuelle de votre classe.</p>
                </div>
            `;
        }

        // Reset button text to "Générer"
        if (generateBtn) {
            generateBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Générer';
        }
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
                this.cachedSynthesisClassId = currentClassId;
                this.cachedSynthesisPeriod = currentPeriod;
                return;
            }
        }

        // 3. No matching cache or saved data, reset to placeholder
        this.resetAISection();
    },

    /**
     * Apply synthesis HTML to the UI and update button state
     * @private
     */
    _applySynthesisToUI(htmlContent) {
        const content = this.modal.querySelector('#aiSynthesisContent');
        const generateBtn = this.modal.querySelector('#generateSynthesisBtn');

        if (content) {
            content.innerHTML = htmlContent;
        }

        // Update button to show "Régénérer" since synthesis exists
        if (generateBtn) {
            generateBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Régénérer';
        }
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
            generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération...';
        }

        try {
            const stats = this.cachedStats;
            const prompt = this.buildAIPrompt(stats);

            const response = await AIService.callAIWithFallback(prompt);

            // Parse the response into structured sections
            const formattedText = this._formatSynthesisText(response.text);
            const synthesisHTML = `<div class="ai-synthesis-text">${formattedText}</div>`;

            content.innerHTML = synthesisHTML;

            // Cache the synthesis for persistence across modal open/close
            this.cachedSynthesisHTML = synthesisHTML;
            this.cachedSynthesisClassId = appState.currentClassId;
            this.cachedSynthesisPeriod = appState.currentPeriod;

            // PERSISTENCE: Save to Class Object in Storage
            this._saveSynthesisToStorage(synthesisHTML);

        } catch (error) {
            content.innerHTML = `
                <div class="ai-placeholder">
                    <div class="ai-placeholder-icon" style="background: var(--error-light); color: var(--error-color);"><i class="fas fa-exclamation-triangle"></i></div>
                    <p class="ai-placeholder-text">Erreur lors de la génération : ${error.message}</p>
                </div>
            `;
        } finally {
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Régénérer';
            }
        }
    },

    /**
     * Helper to save synthesis to the persistent Class object
     * @private
     */
    _saveSynthesisToStorage(htmlContent) {
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
                timestamp: Date.now(),
                model: appState.currentAIModel,
                statsSnapshot: this.cachedStats // Optional: save stats used for generation
            };

            // Trigger storage save
            StorageManager.saveAppState();
        }
    },

    /**
     * Build the AI prompt with statistics context
     * @param {Object} stats 
     * @returns {string}
     */
    buildAIPrompt(stats) {
        const period = appState.currentPeriod;
        const periodLabel = { T1: 'premier trimestre', T2: 'deuxième trimestre', T3: 'troisième trimestre', S1: 'premier semestre', S2: 'deuxième semestre' }[period] || period;

        let prompt = `Rédige une SYNTHÈSE CONCISE pour le conseil de classe du ${periodLabel}.

**DONNÉES :**
• Effectif : ${stats.count} élèves
• Moyenne : ${stats.average.toFixed(1)}/20 | Médiane : ${stats.median.toFixed(1)}/20
• Min : ${stats.min.toFixed(1)} | Max : ${stats.max.toFixed(1)} | Écart-type : ${stats.stdDev.toFixed(1)}
• Répartition : ${stats.distribution['16-20']} excellents, ${stats.distribution['12-16']} bons, ${stats.distribution['8-12']} moyens, ${stats.distribution['4-8']} fragiles, ${stats.distribution['0-4']} en difficulté`;

        if (stats.hasEvolutionData) {
            prompt += `
• Évolution : ${stats.avgEvolution >= 0 ? '+' : ''}${stats.avgEvolution.toFixed(1)} pts | ${stats.progressCount} progressions, ${stats.stableCount} stables, ${stats.regressionCount} régressions`;
            if (stats.topProgressions.length > 0) {
                prompt += `\n• Top progressions : ${stats.topProgressions.slice(0, 3).map(s => `${s.prenom} (+${s.evolution.toFixed(1)})`).join(', ')}`;
            }
        }

        prompt += `

**FORMAT OBLIGATOIRE - Réponds UNIQUEMENT avec ces 4 sections :**

📊 **Bilan**
[1 phrase sur le niveau général et l'homogénéité]

✅ **Points forts**
• [Point 1 - max 10 mots]
• [Point 2 - max 10 mots]

⚠️ **Points de vigilance**
• [Point 1 - max 10 mots]
• [Point 2 si pertinent - max 10 mots]

💡 **Recommandations**
• [Action 1 concrète - max 15 mots]
• [Action 2 concrète - max 15 mots]

RÈGLES STRICTES :
- Maximum 120 mots au total
- Style télégraphique, pas de phrases longues
- Pas d'introduction ni de formules de politesse
- Utilise les prénoms, pas les noms complets`;

        return prompt;
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
     * @param {string} text - Raw AI response text
     * @returns {string} Formatted HTML
     * @private
     */
    _formatSynthesisText(text) {
        // Normalize multiple ellipsis (e.g., "......" -> "...")
        text = text.replace(/\.{3,}/g, '...');

        // Define section configs with icons and colors
        const sections = [
            { emoji: '📊', title: 'Bilan', icon: 'chart-simple', color: 'primary' },
            { emoji: '✅', title: 'Points forts', icon: 'check-circle', color: 'success' },
            { emoji: '⚠️', title: 'Points de vigilance', icon: 'exclamation-triangle', color: 'warning' },
            { emoji: '💡', title: 'Recommandations', icon: 'lightbulb', color: 'info' }
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
                    .replace(/[📊✅⚠️💡]/g, '')
                    .trim();

                // Process content - convert bullet points to list items
                const items = currentContent
                    .map(line => line.replace(/^[•\-→]\s*/, '').trim())
                    .filter(line => line.length > 0);

                html += `
                    <div class="synthesis-section synthesis-section--${config.color}">
                        <div class="synthesis-section-header">
                            <i class="fas fa-${config.icon}"></i>
                            <span>${cleanTitle}</span>
                        </div>
                        <div class="synthesis-section-content">
                            ${items.length > 1
                        ? `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`
                        : `<p>${items.join('')}</p>`
                    }
                        </div>
                    </div>
                `;
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
