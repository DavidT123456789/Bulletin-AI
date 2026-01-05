
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
});
