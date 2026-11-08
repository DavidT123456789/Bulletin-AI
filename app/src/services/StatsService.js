import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';
import { computeGradeDistributionArray, computeGradeDistributionMap } from '../config/academicConstants.js';

export const StatsService = {
    /**
     * Convertit une note brute (nombre ou chaîne avec virgule/point) en nombre valide ou NaN.
     * @param {number|string|null|undefined} raw
     * @returns {number}
     */
    parseGrade(raw) {
        if (typeof raw === 'number') return isNaN(raw) ? NaN : raw;
        if (raw === null || raw === undefined || raw === '') return NaN;
        const parsed = parseFloat(String(raw).replace(',', '.'));
        return isNaN(parsed) ? NaN : parsed;
    },

    /**
     * Calcule l'écart arrondi à 2 décimales entre deux notes brutes, ou null si l'une est invalide.
     * @param {number|string|null|undefined} currentGradeRaw
     * @param {number|string|null|undefined} prevGradeRaw
     * @returns {number|null}
     */
    computeEvolutionDiff(currentGradeRaw, prevGradeRaw) {
        const currentGrade = this.parseGrade(currentGradeRaw);
        const prevGrade = this.parseGrade(prevGradeRaw);
        if (isNaN(currentGrade) || isNaN(prevGrade)) return null;
        return parseFloat((currentGrade - prevGrade).toFixed(2));
    },

    /**
     * Détermine le type détaillé d'évolution ('very-positive', 'positive', 'stable', 'negative', 'very-negative')
     * selon les seuils configurés dans appState.evolutionThresholds.
     * @param {number|null} diff
     * @returns {string}
     */
    getEvolutionType(diff) {
        if (diff === null || typeof diff !== 'number' || isNaN(diff)) return 'stable';
        const t = appState.evolutionThresholds || { veryPositive: 2, positive: 0.5, negative: -0.5, veryNegative: -2 };
        if (typeof Utils.getEvolutionType === 'function' && t.veryPositive !== undefined) {
            return Utils.getEvolutionType(diff);
        }
        const pos = t.positive ?? 0.5;
        const veryPos = t.veryPositive ?? Math.max(2, pos * 2);
        const neg = t.negative ?? -0.5;
        const veryNeg = t.veryNegative ?? Math.min(-2, neg * 2);

        if (diff >= veryPos) return 'very-positive';
        if (diff >= pos) return 'positive';
        if (diff <= veryNeg) return 'very-negative';
        if (diff <= neg) return 'negative';
        return 'stable';
    },

    /**
     * Classe un écart de points dans l'une des 3 catégories agrégées ('progress' | 'stable' | 'regression')
     * ou null si aucun écart valide.
     * @param {number|null} diff
     * @returns {'progress'|'stable'|'regression'|null}
     */
    classifyEvolutionCategory(diff) {
        if (diff === null || typeof diff !== 'number' || isNaN(diff)) return null;
        const evoType = this.getEvolutionType(diff);
        if (evoType === 'very-positive' || evoType === 'positive') return 'progress';
        if (evoType === 'very-negative' || evoType === 'negative') return 'regression';
        return 'stable';
    },

    /**
     * Calcule la médiane d'un ensemble de notes.
     * @param {number[]} grades - Liste des notes
     * @returns {number|string} La médiane ou '--' si vide
     */
    calculateMedian(grades) {
        const cleanGrades = (grades || []).map(g => this.parseGrade(g)).filter(g => !isNaN(g));
        if (cleanGrades.length === 0) return '--';
        const sorted = [...cleanGrades].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
            ? sorted[mid]
            : ((sorted[mid - 1] + sorted[mid]) / 2);
    },

    /**
     * Calcule l'écart-type d'un ensemble de notes.
     * @param {number[]} grades - Liste des notes
     * @returns {number} L'écart-type
     */
    calculateStandardDeviation(grades) {
        const cleanGrades = (grades || []).map(g => this.parseGrade(g)).filter(g => !isNaN(g));
        if (cleanGrades.length === 0) return 0;
        const n = cleanGrades.length;
        const mean = cleanGrades.reduce((a, b) => a + b, 0) / n;
        const variance = cleanGrades.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        return Math.sqrt(variance);
    },

    /**
     * Détermine l'hétérogénéité d'une classe basée sur l'écart-type.
     * @param {number[]} grades - Liste des notes
     * @returns {Object} { label: string, colorClass: string, value: number }
     */
    calculateHeterogeneity(grades) {
        const cleanGrades = (grades || []).map(g => this.parseGrade(g)).filter(g => !isNaN(g));
        if (cleanGrades.length < 2) return { label: 'Indéterminée', colorClass: 'stable', value: 0 };
        const stdDev = this.calculateStandardDeviation(cleanGrades);

        // Seuils empiriques pour des notes sur 20
        // < 2.5 : Très homogène
        // 2.5 - 4.5 : Homogène
        // 4.5 - 6.5 : Hétérogène
        // > 6.5 : Très hétérogène
        if (stdDev < 2.5) return { label: 'Très homogène', colorClass: 'positive', value: stdDev };
        if (stdDev < 4.5) return { label: 'Homogène', colorClass: 'positive', value: stdDev };
        if (stdDev < 6.5) return { label: 'Hétérogène', colorClass: 'warning', value: stdDev };
        return { label: 'Très hétérogène', colorClass: 'negative', value: stdDev };
    },

    /**
     * Génère la distribution des notes pour l'histogramme.
     * @param {number[]} grades - Liste des notes
     * @returns {number[]} Tableau de 5 entiers représentant les tranches [0-4, 4-8, 8-12, 12-16, 16-20]
     */
    getGradeDistribution(grades) {
        return computeGradeDistributionArray(grades);
    },

    /**
     * Calcule le snapshot statistique complet d'une série de notes.
     * Mutualise moyenne, médiane, min, max, écart-type, hétérogénéité, taux de réussite et distributions.
     * @param {Array<number|string>} grades - Liste de notes
     * @returns {Object|null} Snapshot statistique ou null si aucune note valide
     */
    summarizeGrades(grades) {
        const cleanGrades = (grades || [])
            .map(g => this.parseGrade(g))
            .filter(g => !isNaN(g));

        const count = cleanGrades.length;
        if (count === 0) return null;

        const sortedGrades = [...cleanGrades].sort((a, b) => a - b);
        const sum = sortedGrades.reduce((acc, g) => acc + g, 0);
        const average = sum / count;
        const min = sortedGrades[0];
        const max = sortedGrades[count - 1];
        const median = this.calculateMedian(cleanGrades);
        const stdDev = this.calculateStandardDeviation(cleanGrades);
        const heterogeneity = this.calculateHeterogeneity(cleanGrades);
        const aboveTenCount = sortedGrades.filter(g => g >= 10).length;
        const successRate = (aboveTenCount / count) * 100;
        const distribution = this.getGradeDistribution(cleanGrades);
        const distributionMap = computeGradeDistributionMap(cleanGrades);

        return {
            count,
            grades: sortedGrades,
            average,
            median: typeof median === 'number' ? median : average,
            min,
            max,
            stdDev,
            heterogeneity,
            aboveTenCount,
            successRate,
            distribution,
            distributionMap
        };
    },

    analyserEvolution(periodsData) {
        if (!periodsData) return [];
        const evolutions = [];
        const periods = Utils.getPeriods();
        for (let i = 1; i < periods.length; i++) {
            const diff = this.computeEvolutionDiff(
                periodsData[periods[i]]?.grade,
                periodsData[periods[i - 1]]?.grade
            );
            if (diff !== null) {
                evolutions.push({
                    type: this.getEvolutionType(diff),
                    valeur: diff,
                    periode: `${periods[i - 1]}-${periods[i]}`
                });
            }
        }
        return evolutions;
    },

    getRelevantEvolution(evolutions, currentPeriod) {
        if (!evolutions || !Array.isArray(evolutions)) return null;
        return evolutions.find(e => e.periode.endsWith(`-${currentPeriod}`));
    }
};
