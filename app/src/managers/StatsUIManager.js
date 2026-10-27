/**
 * @fileoverview Gestionnaire des statistiques et animations de l'interface utilisateur.
 * 
 * Ce module extrait les fonctions de statistiques de UIManager pour améliorer la modularité :
 * - Animations de valeurs numériques
 * - Calcul et mise à jour des statistiques de classe
 * - Gestion des tooltips de statistiques
 * 
 * @module managers/StatsUIManager
 */

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { StatsService } from '../services/StatsService.js';
import { SettingsModalListeners } from './listeners/SettingsModalListeners.js';
import { UI } from './UIManager.js';

/**
 * Module de gestion des statistiques de l'interface utilisateur.
 * @namespace StatsUI
 */
export const StatsUI = {
    /**
     * Anime une valeur numérique dans un élément DOM.
     * @param {HTMLElement|null} element - Élément DOM cible
     * @param {number} start - Valeur de départ
     * @param {number} end - Valeur d'arrivée
     * @param {number} duration - Durée de l'animation en ms
     * @returns {Promise<void>}
     */
    animateValue(element, start, end, duration) {
        return new Promise(resolve => {
            if (!element) return resolve();
            if (start === end) {
                if (typeof end === 'number') element.textContent = Number.isInteger(end) ? end : end.toFixed(1);
                else element.textContent = end;
                return resolve();
            }
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                const currentVal = start + progress * (end - start);
                element.textContent = Number.isInteger(end) ? Math.floor(currentVal) : currentVal.toFixed(1).replace('.', ',');
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                } else {
                    if (typeof end === 'number') element.textContent = Number.isInteger(end) ? end : end.toFixed(1).replace('.', ',');
                    else element.textContent = end;
                    resolve();
                }
            };
            window.requestAnimationFrame(step);
        });
    },

    /**
     * Anime un nombre avec un template de texte.
     * @param {HTMLElement|null} element - Élément DOM cible
     * @param {number} start - Valeur de départ
     * @param {number} end - Valeur d'arrivée
     * @param {number} duration - Durée de l'animation en ms
     * @param {function(number): string} templateFn - Fonction de template
     * @returns {Promise<void>}
     */
    animateNumberWithText(element, start, end, duration, templateFn) {
        return new Promise(resolve => {
            if (!element || start === end) {
                if (element) element.textContent = templateFn(end);
                return resolve();
            }
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                const currentVal = Math.round(start + progress * (end - start));
                element.textContent = templateFn(currentVal);
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                } else {
                    resolve();
                }
            };
            window.requestAnimationFrame(step);
        });
    },

    /**
     * Anime un nombre avec un template HTML.
     * @param {HTMLElement|null} element - Élément DOM cible
     * @param {number} start - Valeur de départ
     * @param {number} end - Valeur d'arrivée
     * @param {number} duration - Durée de l'animation en ms
     * @param {function(number): string} templateFn - Fonction de template retournant du HTML
     * @returns {Promise<void>}
     */
    animateNumberWithMarkup(element, start, end, duration, templateFn) {
        // Cancel any existing animation on this element
        if (element._animationFrame) {
            window.cancelAnimationFrame(element._animationFrame);
            element._animationFrame = null;
        }

        return new Promise(resolve => {
            if (!element || start === end) {
                if (element) {
                    element.innerHTML = templateFn(end);
                    element._animationFrame = null;
                }
                return resolve();
            }
            let startTimestamp = null;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                // Use easeOutQuad for smoother feel
                const ease = 1 - (1 - progress) * (1 - progress);

                const currentVal = Math.round(start + ease * (end - start));
                element.innerHTML = templateFn(currentVal);

                if (progress < 1) {
                    element._animationFrame = window.requestAnimationFrame(step);
                } else {
                    element._animationFrame = null;
                    resolve();
                }
            };
            element._animationFrame = window.requestAnimationFrame(step);
        });
    },

    /**
     * Met à jour les tooltips des statistiques avec les seuils actuels.
     */
    updateStatsTooltips() {
        const thresholds = appState.evolutionThresholds;
        const subStatProgress = document.querySelector('.legend-item[data-filter-id="progressCount"]');
        const subStatRegression = document.querySelector('.legend-item[data-filter-id="regressionCount"]');
        const subStatStable = document.querySelector('.legend-item[data-filter-id="stableCount"]');

        if (subStatProgress) {
            subStatProgress.dataset.tooltip = `Élèves en progrès (≥ +${String(thresholds.positive).replace('.', ',')} pt)`;
        }
        if (subStatRegression) {
            subStatRegression.dataset.tooltip = `Élèves en régression (≤ ${String(thresholds.negative).replace('.', ',')} pt)`;
        }
        if (subStatStable) {
            const negStr = String(thresholds.negative).replace('.', ',');
            const posStr = String(thresholds.positive).replace('.', ',');
            subStatStable.dataset.tooltip = `Élèves stables (entre ${negStr} et +${posStr} pt)`;
        }
    },



    /**
     * Calcule les statistiques à partir des résultats filtrés.
     * @param {Array} filteredResults - Résultats filtrés
     * @param {string} activePeriod - Période active
     * @param {string|null} previousPeriod - Période précédente
     * @returns {Object} Statistiques calculées
     */
    calculateStats(filteredResults, activePeriod, previousPeriod) {
        const stats = {
            avgGrade: '--', prevAvgGrade: '--', minGrade: '--', maxGrade: '--',
            avgWords: 0, avgChars: 0, progress: 0, stable: 0, regression: 0,
            median: '--', heterogeneity: null, distribution: [0, 0, 0, 0, 0]
        };

        if (filteredResults.length === 0) return stats;

        let totalGrades = 0, gradeCount = 0, totalPrevGrades = 0, prevGradeCount = 0;
        let minCurrentGrade = Infinity, maxCurrentGrade = -Infinity;
        let words = 0, chars = 0, errFree = 0;
        const currentGrades = [];

        filteredResults.forEach(res => {
            // Statistique 1: Notes (Indépendant des erreurs d'appréciation)
            const currentGradeRaw = res.studentData?.periods?.[activePeriod]?.grade;
            const currentGrade = typeof currentGradeRaw === 'number' ? currentGradeRaw : parseFloat(String(currentGradeRaw || '').replace(',', '.'));

            if (!isNaN(currentGrade)) {
                totalGrades += currentGrade;
                gradeCount++;
                minCurrentGrade = Math.min(minCurrentGrade, currentGrade);
                maxCurrentGrade = Math.max(maxCurrentGrade, currentGrade);
                currentGrades.push(currentGrade);

                // Statistique 2: Évolution
                if (previousPeriod) {
                    const prevGradeRaw = res.studentData.periods[previousPeriod]?.grade;
                    const prevGrade = typeof prevGradeRaw === 'number' ? prevGradeRaw : parseFloat(String(prevGradeRaw || '').replace(',', '.'));
                    if (!isNaN(prevGrade)) {
                        totalPrevGrades += prevGrade;
                        prevGradeCount++;

                        // Calculer l'évolution
                        const dist = currentGrade - prevGrade;
                        const evoType = Utils.getEvolutionType(dist);
                        if (['very-positive', 'positive'].includes(evoType)) stats.progress++;
                        else if (evoType === 'stable') stats.stable++;
                        else stats.regression++;
                    }
                }
            }

            // Statistique 3: Mots et Caractères (Dépend des erreurs)
            if (!res.errorMessage) {
                errFree++;
                words += Utils.countWords(res.appreciation);
                chars += (res.appreciation || '').replace(/<[^>]*>/g, '').length;
            }
        });

        if (gradeCount > 0) {
            stats.avgGrade = (totalGrades / gradeCount);
            stats.minGrade = minCurrentGrade;
            stats.maxGrade = maxCurrentGrade;

            // Nouveaux calculs via StatsService
            stats.median = StatsService.calculateMedian(currentGrades);
            stats.heterogeneity = StatsService.calculateHeterogeneity(currentGrades);
            stats.distribution = StatsService.getGradeDistribution(currentGrades);
        }
        if (prevGradeCount > 0) stats.prevAvgGrade = (totalPrevGrades / prevGradeCount);
        if (errFree > 0) {
            stats.avgWords = Math.round(words / errFree);
            stats.avgChars = Math.round(chars / errFree);
        }

        return stats;
    },

    /**
     * Met à jour les barres de progression des évolutions.
     * @param {number} progress - Nombre d'élèves en progrès
     * @param {number} stable - Nombre d'élèves stables
     * @param {number} regression - Nombre d'élèves en régression
     */
    updateProgressBars(progress, stable, regression) {
        const total = progress + stable + regression;
        const progressPercent = total > 0 ? (progress / total) * 100 : 0;
        const stablePercent = total > 0 ? (stable / total) * 100 : 0;
        const regressionPercent = total > 0 ? (regression / total) * 100 : 0;

        const progressBarUpdates = {
            'progressChartBar': { percent: progressPercent, count: progress },
            'stableChartBar': { percent: stablePercent, count: stable },
            'regressionChartBar': { percent: regressionPercent, count: regression }
        };

        for (const [id, data] of Object.entries(progressBarUpdates)) {
            const bar = document.getElementById(id);
            if (bar) {
                bar.style.width = `${data.percent}%`;
                bar.setAttribute('data-percent', `${Math.round(data.percent)}%`);
            }
        }

        // Mise à jour des compteurs du donut chart
        const donutProgressCount = document.getElementById('donutProgressCount');
        const donutStableCount = document.getElementById('donutStableCount');
        const donutRegressionCount = document.getElementById('donutRegressionCount');
        if (donutProgressCount) donutProgressCount.textContent = progress;
        if (donutStableCount) donutStableCount.textContent = stable;
        if (donutRegressionCount) donutRegressionCount.textContent = regression;

        // Mise à jour du donut SVG
        this.updateDonutChart(progressPercent, stablePercent, regressionPercent);
    },

    /**
     * Met à jour le graphique donut SVG.
     * @param {number} progressPercent - Pourcentage de progrès
     * @param {number} stablePercent - Pourcentage de stables
     * @param {number} regressionPercent - Pourcentage de régression
     */
    updateDonutChart(progressPercent, stablePercent, regressionPercent) {
        const circumference = 100; // Basé sur le viewBox
        const donutProgress = document.getElementById('donutProgress');
        const donutStable = document.getElementById('donutStable');
        const donutRegression = document.getElementById('donutRegression');

        if (donutProgress && donutStable && donutRegression) {
            // Calcul des offsets pour les arcs
            const progressDash = progressPercent;
            const stableDash = stablePercent;
            const regressionDash = regressionPercent;

            // Progress commence à 0
            donutProgress.setAttribute('stroke-dasharray', `${progressDash} ${circumference - progressDash}`);
            donutProgress.setAttribute('stroke-dashoffset', '0');

            // Stable commence après progress
            donutStable.setAttribute('stroke-dasharray', `${stableDash} ${circumference - stableDash}`);
            donutStable.setAttribute('stroke-dashoffset', `-${progressDash}`);

            // Regression commence après stable
            donutRegression.setAttribute('stroke-dasharray', `${regressionDash} ${circumference - regressionDash}`);
            donutRegression.setAttribute('stroke-dashoffset', `-${progressDash + stableDash}`);
        }
    },


    /**
     * Met à jour les statistiques affichées dans l'interface.
     * @param {Object} uiManager - Référence vers UI Manager pour les tooltips
     * @returns {Promise<void>}
     */
    async updateStats(uiManager) {
        const filtered = appState.filteredResults;
        const activePeriod = appState.currentPeriod;
        const periods = Utils.getPeriods();
        const activePeriodIndex = periods.indexOf(activePeriod);
        const previousPeriod = activePeriodIndex > 0 ? periods[activePeriodIndex - 1] : null;

        const animationPromises = [];

        // Utilise calculateStats existant
        const stats = this.calculateStats(filtered, activePeriod, previousPeriod);

        // --- Empty State & Context Badge: Evolution card ---
        this._updateEvolutionCardEmptyState(previousPeriod, filtered.length, stats);

        const avgEvolution = (typeof stats.avgGrade === 'number' && typeof stats.prevAvgGrade === 'number')
            ? (stats.avgGrade - stats.prevAvgGrade)
            : null;

        const hasEvolutionData = previousPeriod !== null;

        const elementsToAnimate = {
            currentAvgGradeOutput: stats.avgGrade,
            previousAvgGradeOutput: stats.prevAvgGrade,
            minAvgGradeOutput: stats.minGrade,
            maxAvgGradeOutput: stats.maxGrade,
            classEvolutionProgressStat: hasEvolutionData ? stats.progress : '—',
            classEvolutionStableStat: hasEvolutionData ? stats.stable : '—',
            classEvolutionRegressionStat: hasEvolutionData ? stats.regression : '—',
        };

        for (const [id, value] of Object.entries(elementsToAnimate)) {
            const el = document.getElementById(id);
            if (el) {
                if (typeof value === 'number' && !isNaN(value)) {
                    // StartValue can contain a comma, so we replace it before parsing
                    const startValue = parseFloat(el.textContent.replace(',', '.')) || 0;
                    if (el.textContent.replace(',', '.') !== (Number.isInteger(value) ? String(value) : value.toFixed(1))) {
                        animationPromises.push(this.animateValue(el, startValue, value, 500));
                    }
                } else {
                    el.textContent = String(value);
                }
            }
        }

        // Apply grade color classes to the main average grade display
        // Using Utils.getGradeClass() which returns 5 distinct ranges: 0-4, 4-8, 8-12, 12-16, 16-20
        const avgGradeEl = document.getElementById('currentAvgGradeOutput');
        if (avgGradeEl) {
            // Remove all possible grade range classes
            avgGradeEl.classList.remove(
                'grade-range-0-4', 'grade-range-4-8', 'grade-range-8-12',
                'grade-range-12-16', 'grade-range-16-20',
                'grade-high', 'grade-average', 'grade-low' // Legacy classes cleanup
            );
            if (typeof stats.avgGrade === 'number' && !isNaN(stats.avgGrade)) {
                const gradeClass = Utils.getGradeClass(stats.avgGrade);
                if (gradeClass) {
                    avgGradeEl.classList.add(gradeClass);
                }
            }
        }

        const avgWordsEl = document.getElementById('avgWordsChip');
        if (avgWordsEl) {
            avgWordsEl.style.display = stats.avgWords > 0 ? 'inline-flex' : 'none';
            if (stats.avgWords > 0) {
                const currentVal = parseInt(avgWordsEl.textContent.replace('Ø ', '')) || 0;
                if (currentVal !== stats.avgWords) {
                    animationPromises.push(this.animateNumberWithText(avgWordsEl, currentVal, stats.avgWords, 500, (val) => `Ø ${val} mot${val > 1 ? 's' : ''}`));
                }
                // Update tooltip with richer info: avg chars + target words
                const targetWords = appState.subjects?.['MonStyle']?.iaConfig?.length || 60;
                avgWordsEl.setAttribute('data-tooltip', `Ø ${stats.avgWords} mot${stats.avgWords > 1 ? 's' : ''} (${stats.avgChars} car.)<br>Cible : ${targetWords} mots<br><span class="kbd-hint">Modifier</span>`);
                avgWordsEl.classList.add('tooltip', 'clickable-chip');
                avgWordsEl.style.cursor = 'pointer';

                // Make clickable to open personalization modal (attach once)
                if (!avgWordsEl._clickListenerAdded) {
                    avgWordsEl.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent triggering parent header toggle
                        const personalizationModal = document.getElementById('personalizationModal');
                        if (personalizationModal) {
                            UI.openModal(personalizationModal);
                            // [FIX] Refresh Lab data on modal open to sync with current period
                            SettingsModalListeners._updateStudentContextAndPrompt();
                            // Use centralized highlight utility for length slider
                            UI.highlightSettingsElement('iaLengthSlider', { tab: 'templates' });
                        }
                    });
                    avgWordsEl._clickListenerAdded = true;
                }
            }
        }

        const avgEvoEl = DOM.classEvolutionAverageStat;
        const evolutionChip = document.getElementById('classEvolutionChip');
        if (avgEvoEl && evolutionChip) {
            evolutionChip.classList.remove('positive', 'negative', 'stable');
            if (avgEvolution === null) {
                avgEvoEl.textContent = '--';
                evolutionChip.removeAttribute('data-tooltip');
                evolutionChip.classList.remove('tooltip');
                evolutionChip.classList.add('stable');
                evolutionChip.style.display = 'none';
            } else {
                evolutionChip.style.display = '';
                if (previousPeriod && typeof stats.prevAvgGrade === 'number') {
                    const prevAvgFormatted = stats.prevAvgGrade.toFixed(1).replace('.', ',');
                    evolutionChip.classList.add('tooltip');
                    evolutionChip.setAttribute('data-tooltip', `Moyenne ${previousPeriod} : ${prevAvgFormatted}/20`);
                } else {
                    evolutionChip.removeAttribute('data-tooltip');
                    evolutionChip.classList.remove('tooltip');
                }
                // startValue can contain a comma, replace it before parsing
                const startVal = parseFloat(avgEvoEl.textContent.replace(',', '.')) || 0;
                const promise = new Promise(resolve => {
                    let startTimestamp = null; const duration = 500;
                    const step = (timestamp) => {
                        if (!startTimestamp) startTimestamp = timestamp;
                        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                        const currentVal = startVal + progress * (avgEvolution - startVal);
                        const unit = Math.abs(currentVal) >= 2 ? 'pts' : 'pt';
                        avgEvoEl.textContent = `${currentVal >= 0 ? '+' : ''}${currentVal.toFixed(1).replace('.', ',')} ${unit}`;
                        if (progress < 1) window.requestAnimationFrame(step);
                        else {
                            const finalUnit = Math.abs(avgEvolution) >= 2 ? 'pts' : 'pt';
                            avgEvoEl.textContent = `${avgEvolution >= 0 ? '+' : ''}${avgEvolution.toFixed(1).replace('.', ',')} ${finalUnit}`;
                            resolve();
                        }
                    };
                    window.requestAnimationFrame(step);
                });
                animationPromises.push(promise);

                if (avgEvolution >= appState.evolutionThresholds.positive) evolutionChip.classList.add('positive');
                else if (avgEvolution <= appState.evolutionThresholds.negative) evolutionChip.classList.add('negative');
                else evolutionChip.classList.add('stable');
            }
        }

        // Utilise updateProgressBars existant
        this.updateProgressBars(stats.progress, stats.stable, stats.regression);

        // Update Median (maintenant dans performance-details)
        const medianEl = document.getElementById('medianGradeOutput');
        if (medianEl) {
            const medianValue = stats.median === '--' ? '--' : (Number.isInteger(stats.median) ? String(stats.median) : stats.median.toFixed(1).replace('.', ','));
            medianEl.textContent = medianValue;
        }

        // Update Heterogeneity Badge (dans dispersion-card header)
        const hetBadge = document.getElementById('heterogeneityLabel');
        if (hetBadge) {
            const het = stats.heterogeneity;
            if (!het || filtered.length === 0) {
                hetBadge.textContent = '';
                hetBadge.removeAttribute('data-tooltip');
                hetBadge.style.display = 'none';
                hetBadge.className = 'homogeneity-badge';
            } else if (het.label === 'Indéterminée') {
                hetBadge.textContent = '⩾ 2 notes requises';
                hetBadge.removeAttribute('data-tooltip');
                hetBadge.className = 'homogeneity-badge muted';
                hetBadge.style.display = '';
            } else {
                hetBadge.textContent = het.label;
                hetBadge.className = `homogeneity-badge tooltip ${het.colorClass}`;
                if (typeof het.value === 'number') {
                    hetBadge.setAttribute('data-tooltip', `Écart-type : ${het.value.toFixed(1).replace('.', ',')} pt`);
                }
                hetBadge.style.display = '';
            }
        }

        // Update Histogram (en parallèle avec les animations)
        this.updateHistogram(stats.distribution, filtered, activePeriod);

        await Promise.all(animationPromises);

        // Refresh tooltips via UI manager
        if (uiManager && uiManager.initTooltips) {
            uiManager.initTooltips();
        }

        await Promise.all(animationPromises);
    },

    /**
     * Met à jour l'histogramme de distribution des notes.
     * @param {number[]} distribution - Tableau [0-4, 4-8, 8-12, 12-16, 16-20]
     * @param {Array} [filteredResults] - Résultats filtrés pour enrichir le tooltip avec les noms des élèves
     * @param {string} [activePeriod] - Période active
     */
    updateHistogram(distribution, filteredResults = appState.filteredResults, activePeriod = appState.currentPeriod) {
        if (!distribution || distribution.length !== 5) return;
        const maxCount = Math.max(...distribution);
        const ranges = ['0-4', '4-8', '8-12', '12-16', '16-20'];
        const rangeBuckets = [[], [], [], [], []];

        if (Array.isArray(filteredResults) && activePeriod) {
            filteredResults.forEach(res => {
                const raw = res?.studentData?.periods?.[activePeriod]?.grade;
                const grade = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
                if (isNaN(grade)) return;
                const name = res?.studentData?.name || `${res?.studentData?.nom || ''} ${res?.studentData?.prenom || ''}`.trim();
                if (!name) return;
                const idx = grade < 4 ? 0 : grade < 8 ? 1 : grade < 12 ? 2 : grade < 16 ? 3 : 4;
                rangeBuckets[idx].push({ name, grade });
            });
        }

        ranges.forEach((range, index) => {
            const barGroup = document.querySelector(`.hist-bar-group[data-range="${range}"]`);
            if (barGroup) {
                const count = distribution[index];
                // 68% max height leaves room for the count label above and the range label below while keeping true proportional heights (e.g. 2 is 2/3 of 3)
                const heightPercent = maxCount > 0 ? Math.round((count / maxCount) * 68) : 0;

                // Update bar height
                const bar = barGroup.querySelector('.hist-bar');
                if (bar) bar.style.height = `${Math.max(heightPercent, 4)}%`;

                barGroup.setAttribute('data-count', count);
                if (count === 0) {
                    barGroup.setAttribute('tabindex', '-1');
                    barGroup.setAttribute('aria-disabled', 'true');
                } else {
                    barGroup.setAttribute('tabindex', '0');
                    barGroup.removeAttribute('aria-disabled');
                }

                // Update tooltip (Tippy.js) with student names when available
                const pluriel = count > 1 ? 's' : '';
                const headerText = `${count} élève${pluriel} (${range}/20)`;
                const studentsInRange = rangeBuckets[index].sort((a, b) => b.grade - a.grade);

                if (studentsInRange.length > 0) {
                    const maxShown = 8;
                    const escape = (str) => (Utils.escapeHtml ? Utils.escapeHtml(str) : str);
                    const lines = studentsInRange.slice(0, maxShown).map(s => {
                        const gradeStr = Number.isInteger(s.grade) ? String(s.grade) : s.grade.toFixed(1).replace('.', ',');
                        return `${escape(s.name)} (${gradeStr})`;
                    });
                    if (studentsInRange.length > maxShown) {
                        lines.push(`+${studentsInRange.length - maxShown} autre${studentsInRange.length - maxShown > 1 ? 's' : ''}…`);
                    }
                    barGroup.setAttribute('data-tooltip', `<strong>${headerText}</strong><br>${lines.join('<br>')}`);
                } else {
                    barGroup.setAttribute('data-tooltip', headerText);
                }
            }
        });
    },

    /**
     * Affiche la zone de progression de l'output.
     */
    showOutputProgressArea() {
        const area = document.getElementById('mass-import-progress-output-area');
        if (area) area.style.display = 'flex';
    },

    /**
     * Masque la zone de progression de l'output.
     */
    hideOutputProgressArea() {
        const area = document.getElementById('mass-import-progress-output-area');
        if (area) area.style.display = 'none';
    },

    /**
     * Met à jour la barre de progression de l'output.
     * @param {number} current - Valeur actuelle
     * @param {number} total - Valeur totale
     * @param {string} [studentName] - Nom de l'élève en cours (optionnel)
     */
    updateOutputProgress(current, total, studentName = '') {
        const percent = total > 0 ? (current / total) * 100 : 0;
        if (DOM.outputProgressFill) DOM.outputProgressFill.style.width = `${percent}%`;
        if (DOM.outputProgressText) {
            let text = `${current}/${total} traités`;
            if (studentName && current <= total) {
                text = `${current}/${total} • ${studentName}`;
            }
            DOM.outputProgressText.textContent = text;
        }
    },

    /**
     * Réinitialise la barre de progression.
     */
    resetProgressBar() {
        this.updateOutputProgress(0, 0);
    },

    /**
     * Initialise le carrousel mobile (gestion des points de pagination).
     */
    initMobileCarousel() {
        const container = document.getElementById('statsContainer');
        if (!container) return;

        const dots = document.querySelectorAll('.stats-dot');
        if (dots.length === 0) return;

        const updateActiveDot = () => {
            const scrollLeft = container.scrollLeft;
            const containerWidth = container.offsetWidth;
            const cardWidth = container.querySelector('.stat-card')?.offsetWidth || 0;

            // Calculate active index based on card stride (supports 1-up mobile & 2-up tablet carousels)
            const step = cardWidth > 0 ? cardWidth : containerWidth;
            const index = step > 0 ? Math.round(scrollLeft / step) : 0;

            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === index);
            });
        };

        // Throttled scroll listener
        let ticking = false;
        container.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    updateActiveDot();
                    ticking = false;
                });
                ticking = true;
            }
        });

        // Initial check
        updateActiveDot();
    },

    /**
     * Gère l'état de repos ("Blueprint 2026") et l'indicateur contextuel de la carte Dynamique.
     * Conserve la structure Bento alignée en S1/T1 avec un badge contextuel en en-tête.
     * @param {string|null} previousPeriod - Période précédente
     * @param {number} studentCount - Nombre d'élèves affichés
     * @param {Object|null} [stats=null] - Statistiques calculées
     * @private
     */
    _updateEvolutionCardEmptyState(previousPeriod, studentCount, stats = null) {
        const evolutionCard = document.getElementById('evolutionCard');
        if (!evolutionCard) return;

        const hasEvolutionData = previousPeriod !== null;
        evolutionCard.classList.toggle('is-empty', !hasEvolutionData);

        evolutionCard.querySelectorAll('.evolution-legend .legend-item').forEach(item => {
            if (hasEvolutionData) {
                item.setAttribute('tabindex', '0');
                item.removeAttribute('aria-disabled');
            } else {
                item.setAttribute('tabindex', '-1');
                item.setAttribute('aria-disabled', 'true');
            }
        });

        let statusBadge = document.getElementById('evolutionStatusBadge');
        if (!statusBadge) {
            const header = evolutionCard.querySelector('.stat-card-header');
            if (header) {
                statusBadge = document.createElement('span');
                statusBadge.id = 'evolutionStatusBadge';
                statusBadge.className = 'homogeneity-badge muted tooltip';
                header.appendChild(statusBadge);
            }
        }

        if (statusBadge) {
            if (!hasEvolutionData) {
                const isSemestre = appState.periodSystem === 'semestres';
                statusBadge.className = 'homogeneity-badge muted tooltip';
                statusBadge.textContent = studentCount === 0
                    ? 'Aucun élève'
                    : `Dès le ${isSemestre ? 'S2' : 'T2'}`;
                statusBadge.setAttribute(
                    'data-tooltip',
                    studentCount === 0
                        ? 'Ajoutez des élèves pour voir la dynamique'
                        : `Disponible à partir du prochain ${isSemestre ? 'semestre' : 'trimestre'}`
                );
                statusBadge.style.display = '';
            } else {
                const comparedCount = stats ? (stats.progress + stats.stable + stats.regression) : 0;
                statusBadge.className = 'homogeneity-badge plain-context tooltip';
                statusBadge.textContent = comparedCount > 0
                    ? `${comparedCount} élève${comparedCount > 1 ? 's' : ''} vs ${previousPeriod}`
                    : `vs ${previousPeriod}`;
                statusBadge.setAttribute('data-tooltip', `Comparaison des moyennes avec ${previousPeriod}`);
                statusBadge.style.display = '';
            }
        }
    }
};
