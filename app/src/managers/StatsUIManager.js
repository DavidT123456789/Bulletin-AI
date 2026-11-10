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
import { GRADE_BRACKET_IDS, GRADE_BRACKET_CLASSES } from '../config/academicConstants.js';

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
     * Construit le HTML d'une infobulle listant jusqu'à 8 élèves avec troncature "+X autres…".
     * @param {string} header - En-tête de l'infobulle
     * @param {Array} items - Liste d'élèves à afficher
     * @param {function(Object): string} formatLineFn - Formateur de ligne pour un élève (déjà échappé ou texte brut)
     * @returns {string}
     */
    formatStudentListTooltip(header, items, formatLineFn) {
        if (!Array.isArray(items) || items.length === 0) {
            return header;
        }
        const maxShown = 8;
        const lines = items.slice(0, maxShown).map(formatLineFn);
        if (items.length > maxShown) {
            const remaining = items.length - maxShown;
            lines.push(`+${remaining} autre${remaining > 1 ? 's' : ''}…`);
        }
        return `<strong>${header}</strong><br>${lines.join('<br>')}`;
    },

    /**
     * Formate une infobulle épurée indiquant la part de la classe en % (et le seuil optionnel).
     * Évite de répéter l'effectif ou la tranche déjà inscrits sur la barre/tuile.
     * @param {number} count - Nombre d'élèves dans la catégorie
     * @param {number} total - Effectif total de référence
     * @param {string} [conditionStr=''] - Seuil d'évolution optionnel
     * @returns {string}
     * @private
     */
    _formatClassShareTooltip(count, total, conditionStr = '') {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const suffix = conditionStr ? ` (${conditionStr})` : '';
        return `${pct} % de la classe${suffix}`;
    },

    /**
     * Synchronise l'état d'accessibilité et d'interactivité (`data-count`, `tabindex`, `aria-disabled`)
     * d'une tuile de filtre statistique.
     * @param {HTMLElement|null} el - Élément DOM cible
     * @param {number} count - Effectif associé au filtre
     * @param {boolean} [isAvailable=true] - Indique si la donnée est disponible pour la période
     * @private
     */
    _setFilterTileAccessibility(el, count, isAvailable = true) {
        if (!el) return;
        if (isAvailable) {
            el.setAttribute('data-count', String(count));
        } else {
            el.removeAttribute('data-count');
        }
        if (isAvailable && count > 0) {
            el.setAttribute('tabindex', '0');
            el.removeAttribute('aria-disabled');
        } else {
            el.setAttribute('tabindex', '-1');
            el.setAttribute('aria-disabled', 'true');
        }
    },

    /**
     * Met à jour les tooltips des statistiques d'évolution avec les seuils actuels
     * et, lorsque la période de comparaison est active, l'effectif et le pourcentage.
     * @param {Object|null} [stats=null] - Statistiques calculées
     * @param {boolean} [hasEvolutionData=false] - Indique si une période précédente est disponible
     */
    updateStatsTooltips(stats = null, hasEvolutionData = false) {
        const thresholds = appState.evolutionThresholds || { positive: 0.5, negative: -0.5 };
        const posStr = String(thresholds.positive ?? 0.5).replace('.', ',');
        const negStr = String(thresholds.negative ?? -0.5).replace('.', ',');

        const itemsConfig = [
            {
                filterId: 'progressCount',
                statKey: 'progress',
                rule: `≥ +${posStr} pt`,
                fallbackLabel: 'Élèves en progrès'
            },
            {
                filterId: 'stableCount',
                statKey: 'stable',
                rule: `entre ${negStr} et +${posStr} pt`,
                fallbackLabel: 'Élèves stables'
            },
            {
                filterId: 'regressionCount',
                statKey: 'regression',
                rule: `≤ ${negStr} pt`,
                fallbackLabel: 'Élèves en régression'
            }
        ];

        const resolvedElements = itemsConfig.map(cfg => ({
            ...cfg,
            el: document.querySelector(`.legend-item[data-filter-id="${cfg.filterId}"]`)
        }));

        const hasDomCounts = !stats && resolvedElements.some(({ el }) => el?.hasAttribute('data-count'));
        const isEvoActive = Boolean((stats && hasEvolutionData) || hasDomCounts);

        const counts = resolvedElements.map(({ statKey, el }) => {
            if (stats && hasEvolutionData) return Number(stats[statKey]) || 0;
            if (hasDomCounts && el?.hasAttribute('data-count')) return parseInt(el.getAttribute('data-count'), 10) || 0;
            return null;
        });
        const total = isEvoActive ? counts.reduce((sum, n) => sum + (n || 0), 0) : 0;

        resolvedElements.forEach(({ el, rule, fallbackLabel }, idx) => {
            if (!el) return;
            const count = counts[idx];
            const tooltip = (isEvoActive && count !== null && count > 0 && total > 0)
                ? this._formatClassShareTooltip(count, total, rule)
                : `${fallbackLabel} (${rule})`;
            el.dataset.tooltip = tooltip;
            if (el._tippy && typeof el._tippy.setContent === 'function') {
                el._tippy.setContent(tooltip);
            }
        });
    },


    /**
     * Calcule les statistiques à partir des résultats filtrés.
     * Mutualise les calculs de notes et d'évolution avec StatsService.
     * @param {Array} filteredResults - Résultats filtrés
     * @param {string} activePeriod - Période active
     * @param {string|null} previousPeriod - Période précédente
     * @returns {Object} Statistiques calculées
     */
    calculateStats(filteredResults, activePeriod, previousPeriod) {
        const stats = {
            avgGrade: '--', prevAvgGrade: '--', minGrade: '--', maxGrade: '--',
            minStudents: [], maxStudents: [],
            avgWords: 0, avgChars: 0, progress: 0, stable: 0, regression: 0,
            median: '--', heterogeneity: null, distribution: [0, 0, 0, 0, 0]
        };

        if (filteredResults.length === 0) return stats;

        let totalPrevGrades = 0, prevGradeCount = 0;
        let words = 0, chars = 0, errFree = 0;
        const currentGrades = [];
        const gradedStudents = [];

        filteredResults.forEach(res => {
            // Statistique 1: Notes (Indépendant des erreurs d'appréciation)
            const currentGradeRaw = res.studentData?.periods?.[activePeriod]?.grade;
            const currentGrade = StatsService.parseGrade(currentGradeRaw);

            if (!isNaN(currentGrade)) {
                currentGrades.push(currentGrade);
                const studentName = res.studentData?.name
                    || (Utils.formatStudentName ? Utils.formatStudentName(res.nom || res.studentData?.nom, res.prenom || res.studentData?.prenom) : '')
                    || `${res.nom || res.studentData?.nom || ''} ${res.prenom || res.studentData?.prenom || ''}`.trim();
                if (studentName) {
                    gradedStudents.push({ name: studentName, grade: currentGrade });
                }

                // Statistique 2: Évolution
                if (previousPeriod) {
                    const prevGradeRaw = res.studentData?.periods?.[previousPeriod]?.grade;
                    const prevGrade = StatsService.parseGrade(prevGradeRaw);
                    if (!isNaN(prevGrade)) {
                        totalPrevGrades += prevGrade;
                        prevGradeCount++;

                        const diff = StatsService.computeEvolutionDiff(currentGrade, prevGrade);
                        const category = StatsService.classifyEvolutionCategory(diff);

                        if (category === 'progress') stats.progress++;
                        else if (category === 'stable') stats.stable++;
                        else if (category === 'regression') stats.regression++;
                    }
                }
            }

            // Statistique 3: Mots et Caractères (Dépend des erreurs)
            if (!res.errorMessage) {
                const appreciation = res.studentData?.periods?.[activePeriod]?.appreciation ?? res.appreciation ?? '';
                errFree++;
                words += Utils.countWords(appreciation);
                chars += appreciation.replace(/<[^>]*>/g, '').length;
            }
        });

        const gradeSummary = StatsService.summarizeGrades(currentGrades);
        if (gradeSummary) {
            stats.avgGrade = gradeSummary.average;
            stats.minGrade = gradeSummary.min;
            stats.maxGrade = gradeSummary.max;
            stats.minStudents = gradedStudents.filter(s => s.grade === gradeSummary.min).map(s => s.name);
            stats.maxStudents = gradedStudents.filter(s => s.grade === gradeSummary.max).map(s => s.name);
            stats.median = gradeSummary.median;
            stats.heterogeneity = gradeSummary.heterogeneity;
            stats.distribution = gradeSummary.distribution;
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
        const progressBarUpdates = {
            'progressChartBar': total > 0 ? (progress / total) * 100 : 0,
            'stableChartBar': total > 0 ? (stable / total) * 100 : 0,
            'regressionChartBar': total > 0 ? (regression / total) * 100 : 0
        };

        for (const [id, percent] of Object.entries(progressBarUpdates)) {
            const bar = document.getElementById(id);
            if (bar) {
                bar.style.width = `${percent}%`;
            }
        }
    },

    /**
     * Résout les élèves actifs de la classe courante pour la période donnée,
     * indépendamment des filtres de recherche ou de statistiques actifs.
     * Permet de maintenir les 3 cartes statistiques stables comme sélecteurs de filtre.
     * @param {string} [activePeriod=appState.currentPeriod] - Période active
     * @returns {Array} Élèves de la classe pour la période
     */
    _getStatsSourceResults(activePeriod = appState.currentPeriod) {
        if (appState.currentClassId && Array.isArray(appState.generatedResults) && appState.generatedResults.length > 0) {
            return appState.generatedResults.filter(
                r => r.classId === appState.currentClassId && !Utils.isStudentDepartedBeforePeriod?.(r, activePeriod)
            );
        }
        return appState.filteredResults || [];
    },

    /**
     * Met à jour les statistiques affichées dans l'interface.
     * @param {Object} uiManager - Référence vers UI Manager pour les tooltips
     * @returns {Promise<void>}
     */
    async updateStats(uiManager) {
        const activePeriod = appState.currentPeriod;
        const statsSource = this._getStatsSourceResults(activePeriod);
        const periods = Utils.getPeriods();
        const activePeriodIndex = periods.indexOf(activePeriod);
        const previousPeriod = activePeriodIndex > 0 ? periods[activePeriodIndex - 1] : null;

        const animationPromises = [];

        // Utilise calculateStats sur l'effectif complet de la classe (stable lors du filtrage)
        const stats = this.calculateStats(statsSource, activePeriod, previousPeriod);

        // --- Empty State & Context Badge: Performance & Evolution cards ---
        const hasGrades = typeof stats.avgGrade === 'number' && !isNaN(stats.avgGrade);
        const performanceCard = document.getElementById('performanceCard');
        if (performanceCard) {
            performanceCard.classList.toggle('is-empty', !hasGrades);
        }

        const hasEvolutionData = this._updateEvolutionCardEmptyState(previousPeriod, statsSource.length, stats);

        const avgEvolution = (hasGrades && typeof stats.prevAvgGrade === 'number')
            ? (stats.avgGrade - stats.prevAvgGrade)
            : null;

        const elementsToAnimate = {
            currentAvgGradeOutput: stats.avgGrade,
            previousAvgGradeOutput: stats.prevAvgGrade,
            minAvgGradeOutput: stats.minGrade,
            maxAvgGradeOutput: stats.maxGrade,
            classEvolutionProgressStat: hasEvolutionData ? stats.progress : '--',
            classEvolutionStableStat: hasEvolutionData ? stats.stable : '--',
            classEvolutionRegressionStat: hasEvolutionData ? stats.regression : '--',
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
                ...GRADE_BRACKET_CLASSES,
                'grade-high', 'grade-average', 'grade-low' // Legacy classes cleanup
            );
            if (hasGrades) {
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
                        SettingsModalListeners.openPersonalization('iaLengthSlider');
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
                const formatEvoText = (val) => {
                    const unit = Math.abs(val) >= 2 ? 'pts' : 'pt';
                    return `${val >= 0 ? '+' : ''}${val.toFixed(1).replace('.', ',')} ${unit}`;
                };
                const targetEvoText = formatEvoText(avgEvolution);
                if (avgEvoEl.textContent !== targetEvoText) {
                    const startVal = parseFloat(avgEvoEl.textContent.replace(',', '.')) || 0;
                    animationPromises.push(new Promise(resolve => {
                        let startTimestamp = null;
                        const duration = 500;
                        const step = (timestamp) => {
                            if (!startTimestamp) startTimestamp = timestamp;
                            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                            const currentVal = startVal + progress * (avgEvolution - startVal);
                            avgEvoEl.textContent = progress < 1 ? formatEvoText(currentVal) : targetEvoText;
                            if (progress < 1) window.requestAnimationFrame(step);
                            else resolve();
                        };
                        window.requestAnimationFrame(step);
                    }));
                }

                if (avgEvolution >= appState.evolutionThresholds.positive) evolutionChip.classList.add('positive');
                else if (avgEvolution <= appState.evolutionThresholds.negative) evolutionChip.classList.add('negative');
                else evolutionChip.classList.add('stable');
            }
        }

        // Utilise updateProgressBars existant
        this.updateProgressBars(stats.progress, stats.stable, stats.regression);

        // Update Median, Min & Max tooltips (maintenant dans performance-details)
        const medianEl = document.getElementById('medianGradeOutput');
        if (medianEl) {
            const medianValue = stats.median === '--' ? '--' : (Number.isInteger(stats.median) ? String(stats.median) : stats.median.toFixed(1).replace('.', ','));
            medianEl.textContent = medianValue;
        }

        const escape = (str) => (Utils.escapeHtml ? Utils.escapeHtml(str) : str);
        const minItemEl = document.querySelector('.detail-item[data-filter-id="minGrade"]');
        if (minItemEl) {
            const minFormatted = typeof stats.minGrade === 'number'
                ? ` (${(Number.isInteger(stats.minGrade) ? String(stats.minGrade) : stats.minGrade.toFixed(1).replace('.', ','))}/20)`
                : '';
            this._setFilterTileAccessibility(minItemEl, stats.minStudents.length);
            minItemEl.dataset.tooltip = this.formatStudentListTooltip(
                `Note la plus basse${minFormatted}`,
                stats.minStudents,
                name => escape(name)
            );
        }

        const maxItemEl = document.querySelector('.detail-item[data-filter-id="maxGrade"]');
        if (maxItemEl) {
            const maxFormatted = typeof stats.maxGrade === 'number'
                ? ` (${(Number.isInteger(stats.maxGrade) ? String(stats.maxGrade) : stats.maxGrade.toFixed(1).replace('.', ','))}/20)`
                : '';
            this._setFilterTileAccessibility(maxItemEl, stats.maxStudents.length);
            maxItemEl.dataset.tooltip = this.formatStudentListTooltip(
                `Note la plus haute${maxFormatted}`,
                stats.maxStudents,
                name => escape(name)
            );
        }

        // Update Heterogeneity Badge (dans dispersion-card header)
        const hetBadge = document.getElementById('heterogeneityLabel');
        if (hetBadge) {
            const het = stats.heterogeneity;
            if (!het || statsSource.length === 0) {
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
        this.updateHistogram(stats.distribution);

        // Refresh tooltips scoped to statsContainer immediately (avoids global teardown after 500ms)
        if (uiManager && uiManager.initTooltips) {
            uiManager.initTooltips(document.getElementById('statsContainer'));
        }

        await Promise.all(animationPromises);
    },

    /**
     * Met à jour l'histogramme de distribution des notes.
     * @param {number[]} distribution - Tableau [0-4, 4-8, 8-12, 12-16, 16-20]
     */
    updateHistogram(distribution) {
        if (!distribution || distribution.length !== 5) return;
        const maxCount = Math.max(...distribution);
        const totalCount = distribution.reduce((sum, n) => sum + n, 0);
        const hasGrades = totalCount > 0;
        const ranges = GRADE_BRACKET_IDS;

        ranges.forEach((range, index) => {
            const barGroup = document.querySelector(`.hist-bar-group[data-range="${range}"]`);
            if (barGroup) {
                const count = distribution[index];
                // 68% max height leaves room for the count label above and the range label below while keeping true proportional heights (e.g. 2 is 2/3 of 3)
                const heightPercent = maxCount > 0 ? Math.round((count / maxCount) * 68) : 0;

                // Update bar height
                const bar = barGroup.querySelector('.hist-bar');
                if (bar) bar.style.height = `${Math.max(heightPercent, 4)}%`;

                this._setFilterTileAccessibility(barGroup, count, hasGrades);
                if (count > 0 && hasGrades) {
                    barGroup.setAttribute('data-tooltip', this._formatClassShareTooltip(count, totalCount));
                } else {
                    barGroup.removeAttribute('data-tooltip');
                }
            }
        });
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
        const comparedCount = stats ? (stats.progress + stats.stable + stats.regression) : 0;
        const hasEvolutionData = previousPeriod !== null && comparedCount > 0;
        const evolutionCard = document.getElementById('evolutionCard');
        if (!evolutionCard) return hasEvolutionData;

        evolutionCard.classList.toggle('is-empty', !hasEvolutionData);

        const legendCounts = {
            progressCount: stats ? stats.progress : 0,
            stableCount: stats ? stats.stable : 0,
            regressionCount: stats ? stats.regression : 0
        };

        evolutionCard.querySelectorAll('.evolution-legend .legend-item').forEach(item => {
            const count = legendCounts[item.dataset.filterId] ?? 0;
            this._setFilterTileAccessibility(item, count, hasEvolutionData);
        });

        this.updateStatsTooltips(stats, hasEvolutionData);

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
            if (!previousPeriod && studentCount > 0) {
                const isSemestre = appState.periodSystem === 'semestres';
                statusBadge.className = 'homogeneity-badge muted tooltip';
                statusBadge.textContent = `Dès le ${isSemestre ? 'S2' : 'T2'}`;
                statusBadge.setAttribute(
                    'data-tooltip',
                    `Disponible à partir du prochain ${isSemestre ? 'semestre' : 'trimestre'}`
                );
                statusBadge.style.display = '';
            } else if (hasEvolutionData) {
                statusBadge.className = 'homogeneity-badge plain-context tooltip';
                statusBadge.textContent = `${comparedCount} élève${comparedCount > 1 ? 's' : ''} vs ${previousPeriod}`;
                statusBadge.setAttribute('data-tooltip', `Comparaison des moyennes avec ${previousPeriod}`);
                statusBadge.style.display = '';
            } else {
                statusBadge.textContent = '';
                statusBadge.removeAttribute('data-tooltip');
                statusBadge.style.display = 'none';
                statusBadge.className = 'homogeneity-badge';
            }
        }

        return hasEvolutionData;
    }
};
