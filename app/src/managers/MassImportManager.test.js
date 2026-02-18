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
    },
    runtimeState: {
        process: {
            isMassImportCancelled: false
        }
    },
    userSettings: {
        academic: {
            currentClassId: null
        }
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
        id: 'test-id-' + nom,
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
    showHeaderProgress: vi.fn(),
    hideHeaderProgress: vi.fn(),
    updateGenerateButtonState: vi.fn(),
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
import { appState } from '../state/State.js';

describe('MassImportManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MassImportManager.init(mockAm, mockApp, mockUI);
        MassImportManager.massImportAbortController = null;
        appState.generatedResults = [];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('init', () => {
        it('should initialize the manager with dependencies', () => {
            MassImportManager.init(mockAm, mockApp, mockUI);
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

            expect(MassImportManager.massImportAbortController).toBeNull();
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

            expect(mockAm.createResultObject).toHaveBeenCalledWith(
                'ERROR', 'Student', '', [],
                expect.any(Object), {}, {},
                expect.stringContaining('Erreur IA')
            );
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
    });

    describe('_createPendingCards', () => {
        it('should create result IDs for each student', () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] },
                { nom: 'DUPONT', prenom: 'Emma', periods: { T1: { grade: 12 } }, statuses: [] }
            ];

            const resultIds = MassImportManager._createPendingCards(students);

            expect(resultIds.length).toBe(2);
            expect(mockAm.createResultObject).toHaveBeenCalledTimes(2);
        });

        it('should add pending results to generatedResults', () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            MassImportManager._createPendingCards(students);

            expect(appState.generatedResults.length).toBe(1);
            expect(appState.generatedResults[0].isPending).toBe(true);
        });

        it('should use existing results when existingId is provided', () => {
            const existingResult = { id: 'existing-1', nom: 'MARTIN', prenom: 'Lucas', isPending: false };
            appState.generatedResults = [existingResult];

            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', existingId: 'existing-1', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            const resultIds = MassImportManager._createPendingCards(students);

            expect(resultIds).toContain('existing-1');
            expect(appState.generatedResults[0].isPending).toBe(true);
        });

        it('should call renderResults after creating cards', () => {
            const students = [
                { nom: 'MARTIN', prenom: 'Lucas', periods: { T1: { grade: 15 } }, statuses: [] }
            ];

            MassImportManager._createPendingCards(students);

            expect(mockAm.renderResults).toHaveBeenCalled();
        });
    });

    describe('_updatePendingCard', () => {
        it('should handle null card gracefully', async () => {
            await expect(
                MassImportManager._updatePendingCard(null, { nom: 'TEST', prenom: 'A' }, false)
            ).resolves.not.toThrow();
        });

        it('should update existing result in appState', async () => {
            appState.generatedResults = [
                { nom: 'MARTIN', prenom: 'Lucas', isPending: true, appreciation: '' }
            ];

            const resultObject = {
                id: 'new-id-123',
                nom: 'MARTIN',
                prenom: 'Lucas',
                appreciation: 'Excellent travail'
            };

            await MassImportManager._updatePendingCard(null, resultObject, false);

            expect(appState.generatedResults[0].appreciation).toBe('Excellent travail');
            expect(appState.generatedResults[0].isPending).toBe(false);
        });

        it('should push new result if not found in appState', async () => {
            appState.generatedResults = [];

            const resultObject = {
                id: 'new-id',
                nom: 'NEW',
                prenom: 'Student',
                appreciation: 'Good'
            };

            await MassImportManager._updatePendingCard(null, resultObject, false);

            expect(appState.generatedResults.length).toBe(1);
            expect(appState.generatedResults[0].isPending).toBe(false);
        });
    });
});
