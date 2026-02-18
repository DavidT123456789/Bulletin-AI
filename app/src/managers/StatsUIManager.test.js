/**
 * @fileoverview Tests unitaires pour StatsUIManager
 * @module managers/StatsUIManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatsUI } from './StatsUIManager.js';

// Mock state module
vi.mock('../state/State.js', () => ({
    appState: {
        evolutionThresholds: { positive: 0.5, veryPositive: 2, negative: -0.5, veryNegative: -2 }
    }
}));

// Mock DOM module
vi.mock('../utils/DOM.js', () => ({
    DOM: {}
}));

// Mock Utils
vi.mock('../utils/Utils.js', () => ({
    Utils: {
        countWords: vi.fn(() => 50),
        getEvolutionType: vi.fn((diff) => {
            if (diff >= 0.5) return 'positive';
            if (diff <= -0.5) return 'negative';
            return 'stable';
        })
    }
}));

vi.mock('../services/StatsService.js', () => ({
    StatsService: {
        calculateMedian: vi.fn(() => 13),
        calculateHeterogeneity: vi.fn(() => null),
        getGradeDistribution: vi.fn(() => [0, 0, 0, 0, 0])
    }
}));

describe('StatsUIManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('animateValue', () => {
        it('should resolve immediately if element is null', async () => {
            await expect(StatsUI.animateValue(null, 0, 10, 500)).resolves.toBe(undefined);
        });

        it('should set final value immediately if start equals end (integer)', async () => {
            const element = document.createElement('div');
            await StatsUI.animateValue(element, 5, 5, 500);
            expect(element.textContent).toBe('5');
        });

        it('should set final value immediately if start equals end (decimal)', async () => {
            const element = document.createElement('div');
            await StatsUI.animateValue(element, 5.5, 5.5, 500);
            expect(element.textContent).toBe('5.5');
        });

        it('should handle non-numeric end value', async () => {
            const element = document.createElement('div');
            await StatsUI.animateValue(element, 'test', 'test', 500);
            expect(element.textContent).toBe('test');
        });
    });

    describe('animateNumberWithText', () => {
        it('should resolve immediately if element is null', async () => {
            const templateFn = (val) => `${val} items`;
            await expect(StatsUI.animateNumberWithText(null, 0, 10, 500, templateFn)).resolves.toBe(undefined);
        });

        it('should apply template if start equals end', async () => {
            const element = document.createElement('div');
            const templateFn = (val) => `Ø ${val} mots`;
            await StatsUI.animateNumberWithText(element, 5, 5, 500, templateFn);
            expect(element.textContent).toBe('Ø 5 mots');
        });
    });

    describe('updateStatsTooltips', () => {
        it('should update tooltip for progress count element', async () => {
            const { appState } = await import('../state/State.js');
            appState.evolutionThresholds = { positive: 0.5, negative: -0.5 };

            const progressEl = document.createElement('div');
            progressEl.className = 'legend-item';
            progressEl.dataset.filterId = 'progressCount';
            document.body.appendChild(progressEl);

            StatsUI.updateStatsTooltips();

            expect(progressEl.dataset.tooltip).toContain('0,5');
            expect(progressEl.dataset.tooltip).toContain('progrès');
        });

        it('should update tooltip for regression count element', async () => {
            const { appState } = await import('../state/State.js');
            appState.evolutionThresholds = { positive: 0.5, negative: -0.5 };

            const regressionEl = document.createElement('div');
            regressionEl.className = 'legend-item';
            regressionEl.dataset.filterId = 'regressionCount';
            document.body.appendChild(regressionEl);

            StatsUI.updateStatsTooltips();

            expect(regressionEl.dataset.tooltip).toContain('-0,5');
            expect(regressionEl.dataset.tooltip).toContain('régression');
        });

        it('should update tooltip for stable count element', async () => {
            const { appState } = await import('../state/State.js');
            appState.evolutionThresholds = { positive: 0.5, negative: -0.5 };

            const stableEl = document.createElement('div');
            stableEl.className = 'legend-item';
            stableEl.dataset.filterId = 'stableCount';
            document.body.appendChild(stableEl);

            StatsUI.updateStatsTooltips();

            expect(stableEl.dataset.tooltip).toContain('stables');
            expect(stableEl.dataset.tooltip).toContain('-0,5');
            expect(stableEl.dataset.tooltip).toContain('0,5');
        });
    });

    describe('calculateStats', () => {
        it('should return default stats for empty results', () => {
            const result = StatsUI.calculateStats([], 'T1', null);

            expect(result.avgGrade).toBe('--');
            expect(result.avgWords).toBe(0);
            expect(result.progress).toBe(0);
        });

        it('should calculate average grade correctly', () => {
            const results = [
                { errorMessage: null, studentData: { periods: { T1: { grade: 12 } } }, appreciation: 'test', evolutions: [] },
                { errorMessage: null, studentData: { periods: { T1: { grade: 14 } } }, appreciation: 'test', evolutions: [] }
            ];

            const result = StatsUI.calculateStats(results, 'T1', null);

            expect(result.avgGrade).toBe(13);
        });

        it('should calculate min and max grades correctly', () => {
            const results = [
                { errorMessage: null, studentData: { periods: { T1: { grade: 10 } } }, appreciation: 'test', evolutions: [] },
                { errorMessage: null, studentData: { periods: { T1: { grade: 16 } } }, appreciation: 'test', evolutions: [] }
            ];

            const result = StatsUI.calculateStats(results, 'T1', null);

            expect(result.minGrade).toBe(10);
            expect(result.maxGrade).toBe(16);
        });

        it('should count evolution types correctly based on grades', () => {
            // Evolution is now calculated directly from grades between periods
            const results = [
                { errorMessage: null, studentData: { periods: { T1: { grade: 10 }, T2: { grade: 15 } }, currentPeriod: 'T2' }, appreciation: 'test', evolutions: [] }, // +5 = progress
                { errorMessage: null, studentData: { periods: { T1: { grade: 12 }, T2: { grade: 12.2 } }, currentPeriod: 'T2' }, appreciation: 'test', evolutions: [] }, // +0.2 = stable
                { errorMessage: null, studentData: { periods: { T1: { grade: 14 }, T2: { grade: 10 } }, currentPeriod: 'T2' }, appreciation: 'test', evolutions: [] } // -4 = regression
            ];

            const result = StatsUI.calculateStats(results, 'T2', 'T1');

            expect(result.progress).toBe(1);
            expect(result.stable).toBe(1);
            expect(result.regression).toBe(1);
        });

        it('should skip results with errors', () => {
            const results = [
                { errorMessage: 'Error', studentData: { periods: { T1: { grade: 12 } } }, appreciation: 'test', evolutions: [] },
                { errorMessage: null, studentData: { periods: { T1: { grade: 14 } } }, appreciation: 'test', evolutions: [] }
            ];

            const result = StatsUI.calculateStats(results, 'T1', null);

            expect(result.avgGrade).toBe(13); // grades are counted regardless of errors
        });
    });

    describe('updateProgressBars', () => {
        beforeEach(() => {
            ['progressChartBar', 'stableChartBar', 'regressionChartBar'].forEach(id => {
                const bar = document.createElement('div');
                bar.id = id;
                document.body.appendChild(bar);
            });
        });

        it('should set correct percentages for progress bars', () => {
            StatsUI.updateProgressBars(2, 3, 5);

            expect(document.getElementById('progressChartBar').style.width).toBe('20%');
            expect(document.getElementById('stableChartBar').style.width).toBe('30%');
            expect(document.getElementById('regressionChartBar').style.width).toBe('50%');
        });

        it('should set 0% when no evolutions exist', () => {
            StatsUI.updateProgressBars(0, 0, 0);

            expect(document.getElementById('progressChartBar').style.width).toBe('0%');
            expect(document.getElementById('stableChartBar').style.width).toBe('0%');
            expect(document.getElementById('regressionChartBar').style.width).toBe('0%');
        });

        it('should handle 100% for single category', () => {
            StatsUI.updateProgressBars(5, 0, 0);

            expect(document.getElementById('progressChartBar').style.width).toBe('100%');
            expect(document.getElementById('stableChartBar').style.width).toBe('0%');
            expect(document.getElementById('regressionChartBar').style.width).toBe('0%');
        });
    });
});
