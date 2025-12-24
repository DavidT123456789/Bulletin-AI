import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';

export const StatsService = {
    /**
     * Calcule la médiane d'un ensemble de notes.
     * @param {number[]} grades - Liste des notes
     * @returns {number|string} La médiane ou '--' si vide
     */
    calculateMedian(grades) {
        if (!grades || grades.length === 0) return '--';
        const sorted = [...grades].sort((a, b) => a - b);
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
        if (!grades || grades.length === 0) return 0;
        const n = grades.length;
        const mean = grades.reduce((a, b) => a + b, 0) / n;
        const variance = grades.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        return Math.sqrt(variance);
    },

    /**
     * Détermine l'hétérogénéité d'une classe basée sur l'écart-type.
     * @param {number} stdDev - L'écart-type
     * @returns {Object} { label: string, colorClass: string, value: number }
     */
    calculateHeterogeneity(grades) {
        if (!grades || grades.length < 2) return { label: 'Indéterminée', colorClass: 'stable', value: 0 };
        const stdDev = this.calculateStandardDeviation(grades);

        // Seuils empiriques pour des notes sur 20
        // < 2.5 : Très homogène
        // 2.5 - 4.5 : Homogène
        // 4.5 - 6.5 : Hétérogène
        // > 6.5 : Très hétérogène
        if (stdDev < 2.5) return { label: 'Très Homogène', colorClass: 'positive', value: stdDev };
        if (stdDev < 4.5) return { label: 'Homogène', colorClass: 'positive', value: stdDev };
        if (stdDev < 6.5) return { label: 'Hétérogène', colorClass: 'warning', value: stdDev };
        return { label: 'Très Hétérogène', colorClass: 'negative', value: stdDev };
    },

    /**
     * Génère la distribution des notes pour l'histogramme.
     * @param {number[]} grades - Liste des notes
     * @returns {number[]} Tableau de 5 entiers représentant les tranches [0-4, 4-8, 8-12, 12-16, 16-20]
     */
    getGradeDistribution(grades) {
        const distribution = [0, 0, 0, 0, 0];
        if (!grades) return distribution;

        grades.forEach(g => {
            if (g < 4) distribution[0]++;
            else if (g < 8) distribution[1]++;
            else if (g < 12) distribution[2]++;
            else if (g < 16) distribution[3]++;
            else distribution[4]++;
        });
        return distribution;
    },

    analyserEvolution(periodsData) {
        const evolutions = [], t = appState.evolutionThresholds;
        const getType = (diff) => {
            if (diff === null || isNaN(diff)) return 'stable';
            // Les seuils sont définis dans appState.evolutionThresholds (ex: positive: 0.5, veryPositive: 2.0...)
            // Si la différence est ENTRE le seuil négatif et le seuil positif, c'est stable.
            // Ex: si positive=2.0 et negative=-2.0, alors 1.5 est stable.

            if (diff >= t.veryPositive) return 'very-positive';
            if (diff >= t.positive) return 'positive';

            if (diff <= t.veryNegative) return 'very-negative';
            if (diff <= t.negative) return 'negative';

            return 'stable';
        };
        const periods = Utils.getPeriods();
        for (let i = 1; i < periods.length; i++) {
            const v1 = periodsData[periods[i - 1]]?.grade, v2 = periodsData[periods[i]]?.grade;
            if (typeof v1 === 'number' && typeof v2 === 'number') { const diff = parseFloat((v2 - v1).toFixed(2)); evolutions.push({ type: getType(diff), valeur: diff, periode: `${periods[i - 1]}-${periods[i]}` }); }
        }
        return evolutions;
    },

    getRelevantEvolution(evolutions, currentPeriod) {
        if (!evolutions || !Array.isArray(evolutions)) return null;
        return evolutions.find(e => e.periode.endsWith(`-${currentPeriod}`));
    }
};
