
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatsService } from './StatsService.js';
import { appState } from '../state/State.js';
import { Utils } from '../utils/Utils.js';

// Mock appState
vi.mock('../state/State.js', () => ({
    appState: {
        evolutionThresholds: {
            veryPositive: 3,
            positive: 1,
            negative: -1,
            veryNegative: -3
        }
    }
}));

// Mock Utils
vi.mock('../utils/Utils.js', () => ({
    Utils: {
        getPeriods: vi.fn()
    }
}));

describe('StatsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('analyserEvolution', () => {
        it('should return empty array if less than 2 periods', () => {
            Utils.getPeriods.mockReturnValue(['T1']);
            const periodsData = { 'T1': { grade: 10 } };
            const evolutions = StatsService.analyserEvolution(periodsData);
            expect(evolutions).toEqual([]);
        });

        it('should calculate evolution correctly between T1 and T2 - Positive', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            const periodsData = {
                'T1': { grade: 10 },
                'T2': { grade: 12 }
            };
            const evolutions = StatsService.analyserEvolution(periodsData);
            expect(evolutions).toHaveLength(1);
            expect(evolutions[0]).toEqual({
                type: 'positive',
                valeur: 2,
                periode: 'T1-T2'
            });
        });

        it('should calculate evolution correctly between T1 and T2 - Very Positive', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            const periodsData = {
                'T1': { grade: 10 },
                'T2': { grade: 14 }
            };
            const evolutions = StatsService.analyserEvolution(periodsData);
            expect(evolutions[0].type).toBe('very-positive');
            expect(evolutions[0].valeur).toBe(4);
        });

        it('should calculate evolution correctly between T1 and T2 - Negative', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            const periodsData = {
                'T1': { grade: 12 },
                'T2': { grade: 10 }
            };
            const evolutions = StatsService.analyserEvolution(periodsData);
            expect(evolutions[0].type).toBe('negative');
            expect(evolutions[0].valeur).toBe(-2);
        });

        it('should calculate evolution correctly between T1 and T2 - Very Negative', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            const periodsData = {
                'T1': { grade: 14 },
                'T2': { grade: 10 }
            };
            const evolutions = StatsService.analyserEvolution(periodsData);
            expect(evolutions[0].type).toBe('very-negative');
            expect(evolutions[0].valeur).toBe(-4);
        });

        it('should calculate evolution correctly between T1 and T2 - Stable', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            const periodsData = {
                'T1': { grade: 10 },
                'T2': { grade: 10.5 }
            };
            const evolutions = StatsService.analyserEvolution(periodsData);
            expect(evolutions[0].type).toBe('stable');
            expect(evolutions[0].valeur).toBe(0.5);
        });

        it('should handle missing grades for evolution', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2']);
            const periodsData = {
                'T1': { grade: 10 },
                'T2': { grade: null } // Missing grade
            };
            const evolutions = StatsService.analyserEvolution(periodsData);
            expect(evolutions).toHaveLength(0);
        });

        it('should calculate multiple periods (T1 -> T2 -> T3)', () => {
            Utils.getPeriods.mockReturnValue(['T1', 'T2', 'T3']);
            const periodsData = {
                'T1': { grade: 10 },
                'T2': { grade: 12 },
                'T3': { grade: 11 }
            };
            const evolutions = StatsService.analyserEvolution(periodsData);
            expect(evolutions).toHaveLength(2);
            expect(evolutions[0]).toEqual({ type: 'positive', valeur: 2, periode: 'T1-T2' });
            expect(evolutions[1]).toEqual({ type: 'negative', valeur: -1, periode: 'T2-T3' });
        });
    });

    describe('getRelevantEvolution', () => {
        const evolutions = [
            { type: 'positive', valeur: 2, periode: 'T1-T2' },
            { type: 'negative', valeur: -1, periode: 'T2-T3' }
        ];

        it('should return relevant evolution for current period T2', () => {
            const result = StatsService.getRelevantEvolution(evolutions, 'T2');
            expect(result).toEqual(evolutions[0]);
        });

        it('should return relevant evolution for current period T3', () => {
            const result = StatsService.getRelevantEvolution(evolutions, 'T3');
            expect(result).toEqual(evolutions[1]);
        });

        it('should return undefined if no relevant evolution found (e.g. T1)', () => {
            const result = StatsService.getRelevantEvolution(evolutions, 'T1');
            expect(result).toBeUndefined();
        });

        it('should return null if evolutions is null or not array', () => {
            expect(StatsService.getRelevantEvolution(null, 'T2')).toBeNull();
            expect(StatsService.getRelevantEvolution({}, 'T2')).toBeNull();
        });
    });

    describe('Math utilities (Median, SD, Heterogeneity, Distribution)', () => {
        it('should calculate median correctly for clean numbers', () => {
            expect(StatsService.calculateMedian([10, 12, 14])).toBe(12);
            expect(StatsService.calculateMedian([10, 12, 14, 16])).toBe(13);
        });

        it('should calculate median and filter out non-numeric values', () => {
            expect(StatsService.calculateMedian([10, 'Abs', NaN, 14, undefined, 12])).toBe(12);
            expect(StatsService.calculateMedian([])).toBe('--');
            expect(StatsService.calculateMedian(null)).toBe('--');
        });

        it('should calculate standard deviation and filter out non-numeric values', () => {
            expect(StatsService.calculateStandardDeviation([10, 10, 10])).toBe(0);
            expect(StatsService.calculateStandardDeviation([10, 'Abs', 14])).toBe(2); // mean=12, diffs=-2,2, var=(4+4)/2=4, sd=2
            expect(StatsService.calculateStandardDeviation([])).toBe(0);
        });

        it('should calculate heterogeneity correctly', () => {
            // Under 2.5 is Très homogène/Homogène
            expect(StatsService.calculateHeterogeneity([10, 11, 10]).label).toBe('Très homogène');
            // Over 4.5 is Hétérogène
            expect(StatsService.calculateHeterogeneity([5, 'Abs', 15]).label).toBe('Hétérogène'); // SD of [5, 15] is 5. SD is < 6.5 so Hétérogène
            expect(StatsService.calculateHeterogeneity([5, 15]).label).toBe('Hétérogène');
            expect(StatsService.calculateHeterogeneity([20, 0, 10]).label).toBe('Très hétérogène'); // SD = sqrt(200/3) = ~8.16 > 6.5
            // Less than 2 numbers is Indéterminée
            expect(StatsService.calculateHeterogeneity([10]).label).toBe('Indéterminée');
            expect(StatsService.calculateHeterogeneity([])).toBeDefined();
        });

        it('should calculate grade distribution and ignore NaN/strings', () => {
            const dist = StatsService.getGradeDistribution([3, 'Abs', 7, 11, NaN, 15, 19]);
            expect(dist).toEqual([1, 1, 1, 1, 1]); // 3 (<4), 7 (<8), 11 (<12), 15 (<16), 19 (>=16)
        });

        it('should parse grades from numbers, comma/dot strings, zero, and reject invalid inputs', () => {
            expect(StatsService.parseGrade(14.5)).toBe(14.5);
            expect(StatsService.parseGrade(0)).toBe(0);
            expect(StatsService.parseGrade('0')).toBe(0);
            expect(StatsService.parseGrade('12,5')).toBe(12.5);
            expect(StatsService.parseGrade('16.25')).toBe(16.25);
            expect(Number.isNaN(StatsService.parseGrade(''))).toBe(true);
            expect(Number.isNaN(StatsService.parseGrade(null))).toBe(true);
            expect(Number.isNaN(StatsService.parseGrade(undefined))).toBe(true);
            expect(Number.isNaN(StatsService.parseGrade('Abs'))).toBe(true);
        });

        it('should compute evolution diff without floating-point drift and classify categories', () => {
            // 12.6 - 12.1 in IEEE-754 is 0.4999999999999999 -> rounded to 0.50
            expect(StatsService.computeEvolutionDiff('12,6', '12,1')).toBe(0.5);
            expect(StatsService.computeEvolutionDiff(10, null)).toBeNull();

            // With mocked thresholds positive: 1, negative: -1
            expect(StatsService.classifyEvolutionCategory(1.5)).toBe('progress');
            expect(StatsService.classifyEvolutionCategory(0.5)).toBe('stable');
            expect(StatsService.classifyEvolutionCategory(-1.2)).toBe('regression');
            expect(StatsService.classifyEvolutionCategory(null)).toBeNull();
        });

        it('should compute a complete class grade snapshot via summarizeGrades()', () => {
            expect(StatsService.summarizeGrades([])).toBeNull();
            expect(StatsService.summarizeGrades(['Abs', null, undefined])).toBeNull();

            const snapshot = StatsService.summarizeGrades(['14,5', 8, 12, '15,5', 'Abs']);
            expect(snapshot).not.toBeNull();
            expect(snapshot.count).toBe(4);
            expect(snapshot.grades).toEqual([8, 12, 14.5, 15.5]);
            expect(snapshot.average).toBe(12.5);
            expect(snapshot.median).toBe(13.25);
            expect(snapshot.min).toBe(8);
            expect(snapshot.max).toBe(15.5);
            expect(snapshot.aboveTenCount).toBe(3);
            expect(snapshot.successRate).toBe(75);
            expect(snapshot.distribution).toEqual([0, 0, 1, 3, 0]);
            expect(snapshot.distributionMap).toEqual({
                '0-4': 0,
                '4-8': 0,
                '8-12': 1,
                '12-16': 3,
                '16-20': 0
            });
        });
    });
});
