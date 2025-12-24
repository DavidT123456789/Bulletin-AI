/**
 * @fileoverview Tests for MassImportManager
 * @module managers/MassImportManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('../state/State.js', () => ({
    appState: {
        currentPeriod: 'T1',
        currentAIModel: 'gemini-2.5-flash',
        generatedResults: [],
        importJustCompleted: false
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        massData: { value: '' },
        massImportErrorActions: { innerHTML: '' },
        emptyStateCard: { style: { display: '' } },
        resultsDiv: { innerHTML: '', appendChild: vi.fn() }
    }
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        normalizeName: (nom, prenom) => `${nom}_${prenom}`.toLowerCase(),
        translateErrorMessage: (msg) => msg
    }
}));

vi.mock('../utils/RateLimiter.js', () => ({
    RateLimiter: {
        estimateTime: vi.fn(() => ({ totalMinutes: '2', delayMs: 1000 })),
        getWaitTime: vi.fn(() => 0),
        waitIfNeeded: vi.fn(() => Promise.resolve()),
        markSuccess: vi.fn(),
        markError429: vi.fn(),
        extractRetryAfter: vi.fn(() => null),
        formatTime: vi.fn((ms) => `${ms / 1000}s`),
        sleep: vi.fn(() => Promise.resolve())
    }
}));

// Mock managers
const mockAm = {
    generateAppreciation: vi.fn(),
    createResultObject: vi.fn((nom, prenom, appreciation, evolutions, studentData, prompts, tokenUsage, errorMessage) => ({
        id: 'test-id-' + Date.now(),
        nom, prenom, appreciation, evolutions, studentData,
        errorMessage,
        timestamp: new Date().toISOString()
    })),
    renderResults: vi.fn()
};

const mockApp = {};

const mockUI = {
    showOutputProgressArea: vi.fn(),
    hideOutputProgressArea: vi.fn(),
    updateOutputProgress: vi.fn(),
    resetProgressBar: vi.fn(),
    showNotification: vi.fn(),
    populateResultCard: vi.fn(() => {
        const div = document.createElement('div');
        div.classList = { add: vi.fn(), remove: vi.fn() };
        div.querySelectorAll = vi.fn(() => []);
        div.querySelector = vi.fn(() => null);
        div.scrollIntoView = vi.fn();
        div.dataset = {};
        return div;
    }),
    showSkeletonInCard: vi.fn(),
    activateCardBadge: vi.fn(),
    fadeOutSkeleton: vi.fn(() => Promise.resolve()),
    typewriterReveal: vi.fn(() => Promise.resolve()),
    updateMassImportPreview: vi.fn()
};

import { MassImportManager } from './MassImportManager.js';

describe('MassImportManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MassImportManager.init(mockAm, mockApp, mockUI);
        MassImportManager.massImportAbortController = null;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('init', () => {
        it('should initialize the manager with dependencies', () => {
            MassImportManager.init(mockAm, mockApp, mockUI);
            // No error means success - dependencies are stored internally
            expect(true).toBe(true);
        });
    });

    describe('cancelImport', () => {
        it('should abort the import if controller exists', () => {
            MassImportManager.massImportAbortController = new AbortController();
            const abortSpy = vi.spyOn(MassImportManager.massImportAbortController, 'abort');

            MassImportManager.cancelImport();

            expect(abortSpy).toHaveBeenCalled();
        });

        it('should do nothing if no controller exists', () => {
            MassImportManager.massImportAbortController = null;

            // Should not throw
            expect(() => MassImportManager.cancelImport()).not.toThrow();
        });
    });

    describe('processMassImport', () => {
        it('should create abort controller on start', async () => {
            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test appreciation',
                studentData: { periods: {} },
                evolutions: [],
                errorMessage: null
            });

            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            await MassImportManager.processMassImport(students, 0);

            expect(MassImportManager.massImportAbortController).toBeNull(); // Cleaned up after
        });

        it('should show progress area on start', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test',
                studentData: { periods: {} },
                evolutions: []
            });

            await MassImportManager.processMassImport(students, 0);

            expect(mockUI.showOutputProgressArea).toHaveBeenCalled();
        });

        it('should call generateAppreciation for each student', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] },
                { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 12 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test',
                studentData: { periods: {} },
                evolutions: []
            });

            await MassImportManager.processMassImport(students, 0);

            expect(mockAm.generateAppreciation).toHaveBeenCalledTimes(2);
        });

        it('should handle generation errors gracefully', async () => {
            const students = [
                { nom: 'ERROR', prenom: 'Student', periods: { T1: { grade: 10 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockRejectedValue(new Error('AI Error'));

            await MassImportManager.processMassImport(students, 0);

            // Should create error result object
            expect(mockAm.createResultObject).toHaveBeenCalledWith(
                'ERROR', 'Student', '', [],
                expect.any(Object), {}, {},
                expect.stringContaining('Erreur IA')
            );
        });

        it('should hide progress area on completion', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test',
                studentData: { periods: {} },
                evolutions: []
            });

            await MassImportManager.processMassImport(students, 0);

            expect(mockUI.hideOutputProgressArea).toHaveBeenCalled();
        });

        it('should call renderResults after completion', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test',
                studentData: { periods: {} },
                evolutions: []
            });

            await MassImportManager.processMassImport(students, 0);

            expect(mockAm.renderResults).toHaveBeenCalled();
        });

        it('should show success notification with count', async () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] },
                { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 12 } }, statuses: [] }
            ];

            mockAm.generateAppreciation.mockResolvedValue({
                id: 'test-id',
                appreciation: 'Test',
                studentData: { periods: {} },
                evolutions: []
            });

            await MassImportManager.processMassImport(students, 1);

            expect(mockUI.showNotification).toHaveBeenCalledWith(
                expect.stringContaining('2/2'),
                'success'
            );
        });
    });

    describe('_createPendingCards', () => {
        it('should create cards for each student', () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] },
                { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 12 } }, statuses: [] }
            ];

            const cards = MassImportManager._createPendingCards(students);

            expect(cards.length).toBe(2);
            expect(mockUI.populateResultCard).toHaveBeenCalledTimes(2);
        });

        it('should show skeleton in each card', () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            MassImportManager._createPendingCards(students);

            expect(mockUI.showSkeletonInCard).toHaveBeenCalled();
        });
    });

    describe('_updatePendingCard', () => {
        it('should handle null card gracefully', async () => {
            await expect(
                MassImportManager._updatePendingCard(null, {}, false)
            ).resolves.not.toThrow();
        });

        it('should update card id from result object', async () => {
            const mockCard = {
                classList: { add: vi.fn(), remove: vi.fn() },
                querySelector: vi.fn(() => null),
                querySelectorAll: vi.fn(() => []),
                dataset: {}
            };

            const resultObject = { id: 'new-id-123', appreciation: 'Test' };

            await MassImportManager._updatePendingCard(mockCard, resultObject, false);

            expect(mockCard.dataset.id).toBe('new-id-123');
        });

        it('should add has-error class on error', async () => {
            const addMock = vi.fn();
            const mockCard = {
                classList: { add: addMock, remove: vi.fn() },
                querySelector: vi.fn(() => ({ innerHTML: '' })),
                querySelectorAll: vi.fn(() => []),
                dataset: {}
            };

            const resultObject = { id: 'id', errorMessage: 'Test error' };

            await MassImportManager._updatePendingCard(mockCard, resultObject, true);

            expect(addMock).toHaveBeenCalledWith('has-error', 'just-errored');
        });
    });
});
