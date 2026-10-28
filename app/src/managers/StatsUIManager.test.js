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
        }),
        getPeriods: vi.fn(() => ['T1', 'T2', 'T3']),
        getPeriodLabel: vi.fn(() => 'Trimestre 1'),
        getGradeClass: vi.fn(() => 'grade-range-12-16')
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

    describe('updateStats - heterogeneity badge', () => {
        let hetBadge;

        beforeEach(async () => {
            const { appState } = await import('../state/State.js');
            appState.currentPeriod = 'T1';
            appState.filteredResults = [];

            hetBadge = document.createElement('span');
            hetBadge.id = 'heterogeneityLabel';
            hetBadge.className = 'homogeneity-badge';
            document.body.appendChild(hetBadge);
        });

        it('should hide badge when there are 0 students', async () => {
            const { appState } = await import('../state/State.js');
            appState.filteredResults = [];

            await StatsUI.updateStats();

            expect(hetBadge.style.display).toBe('none');
            expect(hetBadge.textContent).toBe('');
        });

        it('should show "⩾ 2 notes requises" when only 1 grade exists', async () => {
            const { appState } = await import('../state/State.js');
            const { StatsService } = await import('../services/StatsService.js');
            StatsService.calculateHeterogeneity.mockReturnValue({ label: 'Indéterminée', colorClass: 'stable', value: 0 });

            appState.filteredResults = [
                { studentData: { periods: { T1: { grade: 14 } } } }
            ];

            await StatsUI.updateStats();

            expect(hetBadge.style.display).toBe('');
            expect(hetBadge.textContent).toBe('⩾ 2 notes requises');
            expect(hetBadge.className).toContain('muted');
        });

        it('should display the heterogeneity label and color class when 2+ grades exist', async () => {
            const { appState } = await import('../state/State.js');
            const { StatsService } = await import('../services/StatsService.js');
            StatsService.calculateHeterogeneity.mockReturnValue({ label: 'Homogène', colorClass: 'positive', value: 1.5 });

            appState.filteredResults = [
                { studentData: { periods: { T1: { grade: 14 } } } },
                { studentData: { periods: { T1: { grade: 15 } } } }
            ];

            await StatsUI.updateStats();

            expect(hetBadge.style.display).toBe('');
            expect(hetBadge.textContent).toBe('Homogène');
            expect(hetBadge.className).toContain('positive');
        });
    });

    describe('initMobileCarousel - 1-up and 2-up pagination dots', () => {
        it('should compute active dot from cardWidth stride on both mobile (1-up) and tablet portrait (2-up)', () => {
            document.body.innerHTML = `
                <div id="statsContainer">
                    <div class="stat-card"></div>
                    <div class="stat-card"></div>
                    <div class="stat-card"></div>
                </div>
                <div class="stats-pagination">
                    <span class="stats-dot"></span>
                    <span class="stats-dot"></span>
                    <span class="stats-dot"></span>
                </div>
            `;
            const container = document.getElementById('statsContainer');
            const card = container.querySelector('.stat-card');
            const dots = document.querySelectorAll('.stats-dot');

            // Simulate tablet portrait 2-up carousel: container 680px, each card 332px
            Object.defineProperty(container, 'offsetWidth', { value: 680, configurable: true });
            Object.defineProperty(card, 'offsetWidth', { value: 332, configurable: true });
            container.scrollLeft = 0;

            const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => cb());

            StatsUI.initMobileCarousel();
            expect(dots[0].classList.contains('active')).toBe(true);
            expect(dots[1].classList.contains('active')).toBe(false);

            // Scroll right by 1 card stride (348px) -> 2nd dot becomes active
            container.scrollLeft = 348;
            container.dispatchEvent(new Event('scroll'));
            expect(dots[0].classList.contains('active')).toBe(false);
            expect(dots[1].classList.contains('active')).toBe(true);

            rafSpy.mockRestore();
        });
    });

    describe('updateStats - evolution card blueprint state & histogram accessibility', () => {
        beforeEach(async () => {
            const { appState } = await import('../state/State.js');
            appState.periodSystem = 'semestres';
            appState.currentPeriod = 'S1';
            appState.filteredResults = [];

            document.body.innerHTML = `
                <div class="stat-card evolution-card" id="evolutionCard">
                    <div class="stat-card-header">
                        <h4 class="stat-title" id="chartTitle">Dynamique</h4>
                        <span class="homogeneity-badge muted tooltip" id="evolutionStatusBadge" style="display: none;"></span>
                    </div>
                    <div class="evolution-distribution-bar">
                        <div id="progressChartBar" class="bar-segment progress"></div>
                        <div id="stableChartBar" class="bar-segment stable"></div>
                        <div id="regressionChartBar" class="bar-segment regression"></div>
                    </div>
                    <div class="evolution-legend">
                        <div class="legend-item" data-filter-id="progressCount" role="button" tabindex="0">
                            <span class="legend-count" id="classEvolutionProgressStat">0</span>
                        </div>
                        <div class="legend-item" data-filter-id="stableCount" role="button" tabindex="0">
                            <span class="legend-count" id="classEvolutionStableStat">0</span>
                        </div>
                        <div class="legend-item" data-filter-id="regressionCount" role="button" tabindex="0">
                            <span class="legend-count" id="classEvolutionRegressionStat">0</span>
                        </div>
                    </div>
                </div>
                <div class="histogram-bars">
                    <div class="hist-bar-group" data-range="0-4" role="button" tabindex="0"><div class="hist-bar"></div></div>
                    <div class="hist-bar-group" data-range="4-8" role="button" tabindex="0"><div class="hist-bar"></div></div>
                    <div class="hist-bar-group" data-range="8-12" role="button" tabindex="0"><div class="hist-bar"></div></div>
                    <div class="hist-bar-group" data-range="12-16" role="button" tabindex="0"><div class="hist-bar"></div></div>
                    <div class="hist-bar-group" data-range="16-20" role="button" tabindex="0"><div class="hist-bar"></div></div>
                </div>
            `;
        });

        it('should keep evolution legend in blueprint standby ("—") with status badge in S1', async () => {
            const { appState } = await import('../state/State.js');
            const { Utils } = await import('../utils/Utils.js');
            Utils.getPeriods.mockReturnValue(['S1', 'S2']);
            appState.currentPeriod = 'S1';
            appState.filteredResults = [
                { studentData: { periods: { S1: { grade: 12 } } } }
            ];

            await StatsUI.updateStats();

            const evolutionCard = document.getElementById('evolutionCard');
            const badge = document.getElementById('evolutionStatusBadge');
            const progressStat = document.getElementById('classEvolutionProgressStat');
            const progressItem = evolutionCard.querySelector('.legend-item[data-filter-id="progressCount"]');

            expect(evolutionCard.classList.contains('is-empty')).toBe(true);
            expect(badge.style.display).toBe('');
            expect(badge.textContent).toBe('Dès le S2');
            expect(progressStat.textContent).toBe('—');
            expect(progressItem.getAttribute('tabindex')).toBe('-1');
            expect(progressItem.getAttribute('aria-disabled')).toBe('true');
        });

        it('should activate evolution legend and show comparison period badge in S2', async () => {
            const { appState } = await import('../state/State.js');
            const { Utils } = await import('../utils/Utils.js');
            const { DOM } = await import('../utils/DOM.js');
            Utils.getPeriods.mockReturnValue(['S1', 'S2']);
            appState.currentPeriod = 'S2';
            appState.filteredResults = [
                { studentData: { periods: { S1: { grade: 12 }, S2: { grade: 15 } } } }
            ];

            const evoChip = document.createElement('div');
            evoChip.id = 'classEvolutionChip';
            const evoStat = document.createElement('span');
            evoStat.id = 'classEvolutionAverageStat';
            evoChip.appendChild(evoStat);
            document.body.appendChild(evoChip);
            DOM.classEvolutionAverageStat = evoStat;

            await StatsUI.updateStats();

            const evolutionCard = document.getElementById('evolutionCard');
            const badge = document.getElementById('evolutionStatusBadge');
            const progressItem = evolutionCard.querySelector('.legend-item[data-filter-id="progressCount"]');
            const regressionItem = evolutionCard.querySelector('.legend-item[data-filter-id="regressionCount"]');

            expect(evolutionCard.classList.contains('is-empty')).toBe(false);
            expect(badge.style.display).toBe('');
            expect(badge.textContent).toBe('1 élève vs S1');
            expect(badge.classList.contains('plain-context')).toBe(true);
            expect(progressItem.getAttribute('data-count')).toBe('1');
            expect(progressItem.getAttribute('tabindex')).toBe('0');
            expect(progressItem.hasAttribute('aria-disabled')).toBe(false);
            expect(regressionItem.getAttribute('data-count')).toBe('0');
            expect(regressionItem.getAttribute('tabindex')).toBe('-1');
            expect(regressionItem.getAttribute('aria-disabled')).toBe('true');
            expect(evoChip.getAttribute('data-tooltip')).toBe('Moyenne S1 : 12,0/20');
            expect(evoChip.querySelector('#classEvolutionRef')).toBeNull();
        });

        it('should preserve full class statistics and histogram bars when a stat filter restricts filteredResults', async () => {
            const { appState } = await import('../state/State.js');
            const { Utils } = await import('../utils/Utils.js');
            const { StatsService } = await import('../services/StatsService.js');
            Utils.getPeriods.mockReturnValue(['S1', 'S2']);
            StatsService.getGradeDistribution.mockReturnValue([0, 0, 1, 1, 1]);

            appState.currentClassId = 'class_1';
            appState.currentPeriod = 'S2';
            appState.generatedResults = [
                { id: '1', classId: 'class_1', studentData: { name: 'A', periods: { S1: { grade: 10 }, S2: { grade: 10, appreciation: 'Bien' } } } },
                { id: '2', classId: 'class_1', studentData: { name: 'B', periods: { S1: { grade: 13 }, S2: { grade: 14, appreciation: 'Très bien' } } } },
                { id: '3', classId: 'class_1', studentData: { name: 'C', periods: { S1: { grade: 17 }, S2: { grade: 18, appreciation: 'Excellent' } } } },
                { id: '4', classId: 'other_class', studentData: { name: 'D', periods: { S1: { grade: 5 }, S2: { grade: 5 } } } }
            ];
            // Simulate active filter on 12-16 (only 1 student in filteredResults)
            appState.activeStatFilter = 'gradeRange_12-16';
            appState.filteredResults = [appState.generatedResults[1]];

            await StatsUI.updateStats();

            expect(StatsService.getGradeDistribution).toHaveBeenCalledWith([10, 14, 18]);
            expect(document.querySelector('.hist-bar-group[data-range="8-12"]').getAttribute('data-count')).toBe('1');
            expect(document.querySelector('.hist-bar-group[data-range="12-16"]').getAttribute('data-count')).toBe('1');
            expect(document.querySelector('.hist-bar-group[data-range="16-20"]').getAttribute('data-count')).toBe('1');

            // Cleanup state for subsequent tests
            delete appState.currentClassId;
            delete appState.generatedResults;
            delete appState.activeStatFilter;
        });

        it('should mark zero-student histogram bars as aria-disabled and non-focusable', () => {
            StatsUI.updateHistogram([0, 0, 3, 4, 1]);

            const zeroBar = document.querySelector('.hist-bar-group[data-range="0-4"]');
            const activeBar = document.querySelector('.hist-bar-group[data-range="12-16"]');

            expect(zeroBar.getAttribute('data-count')).toBe('0');
            expect(zeroBar.getAttribute('tabindex')).toBe('-1');
            expect(zeroBar.getAttribute('aria-disabled')).toBe('true');

            expect(activeBar.getAttribute('data-count')).toBe('4');
            expect(activeBar.getAttribute('tabindex')).toBe('0');
            expect(activeBar.hasAttribute('aria-disabled')).toBe(false);
        });

        it('should include student names and grades in histogram bar tooltip on hover', () => {
            const results = [
                { studentData: { name: 'BERNARD Thomas', periods: { S2: { grade: 15 } } } },
                { studentData: { name: 'MARTIN Lucas', periods: { S2: { grade: 12.5 } } } }
            ];

            StatsUI.updateHistogram([0, 0, 0, 2, 0], results, 'S2');

            const bar12_16 = document.querySelector('.hist-bar-group[data-range="12-16"]');
            expect(bar12_16.getAttribute('data-tooltip')).toContain('2 élèves (12-16/20)');
            expect(bar12_16.getAttribute('data-tooltip')).toContain('BERNARD Thomas (15)');
            expect(bar12_16.getAttribute('data-tooltip')).toContain('MARTIN Lucas (12,5)');
        });
    });
});
