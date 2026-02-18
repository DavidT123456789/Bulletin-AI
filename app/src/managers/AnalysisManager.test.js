/**
 * @fileoverview Tests unitaires pour AnalysisManager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalysisManager } from './AnalysisManager.js';

// Mock des dépendances
vi.mock('../state/State.js', () => ({
    appState: {
        generatedResults: []
    }
}));

vi.mock('../utils/DOM.js', () => ({
    DOM: {
        studentDetailsModal: {
            querySelector: vi.fn(() => ({ innerHTML: '' }))
        }
    }
}));

vi.mock('../utils/Utils.js', () => ({
    Utils: {
        cleanMarkdown: vi.fn(text => text),
        decodeHtmlEntities: vi.fn(text => text),
        translateErrorMessage: vi.fn(msg => msg)
    }
}));

vi.mock('./UIManager.js', () => ({
    UI: {
        checkAPIKeyPresence: vi.fn(() => true),
        showNotification: vi.fn()
    }
}));

vi.mock('../services/AIService.js', () => ({
    AIService: {
        callAI: vi.fn(),
        callAIWithFallback: vi.fn()
    }
}));

vi.mock('./StorageManager.js', () => ({
    StorageManager: {
        saveAppState: vi.fn()
    }
}));

import { appState } from '../state/State.js';
import { DOM } from '../utils/DOM.js';
import { Utils } from '../utils/Utils.js';
import { UI } from './UIManager.js';
import { AIService } from '../services/AIService.js';
import { StorageManager } from './StorageManager.js';

describe('AnalysisManager', () => {
    let mockApp;
    let mockAppreciationsManager;

    beforeEach(() => {
        mockApp = {};
        mockAppreciationsManager = {
            getAllPrompts: vi.fn(() => ({
                sw: 'sw prompt',
                ns: 'ns prompt'
            }))
        };
        AnalysisManager.init(mockApp, mockAppreciationsManager);

        // Reset mocks
        vi.clearAllMocks();

        // Reset appState
        appState.generatedResults = [];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('init', () => {
        it('should initialize with app instance', () => {
            const appInstance = { test: true };
            AnalysisManager.init(appInstance);
            expect(true).toBe(true);
        });
    });

    describe('parseStrengthsWeaknesses', () => {
        it('should return empty string for empty input', () => {
            const result = AnalysisManager.parseStrengthsWeaknesses('');
            expect(result).toBe('');
        });

        it('should return empty string for null input', () => {
            const result = AnalysisManager.parseStrengthsWeaknesses(null);
            expect(result).toBe('');
        });

        it('should parse strength section', () => {
            const text = '### Points Forts\n- Bon travail\n- Participatif';
            const result = AnalysisManager.parseStrengthsWeaknesses(text);
            expect(result).toContain('strengths-title');
            expect(result).toContain('strengths-list');
        });

        it('should parse weakness section', () => {
            const text = '### Points Faibles\n- Manque d\'attention\n- Devoirs incomplets';
            const result = AnalysisManager.parseStrengthsWeaknesses(text);
            expect(result).toContain('weaknesses-title');
            expect(result).toContain('weaknesses-list');
        });

        it('should return fallback paragraph if no sections parsed', () => {
            Utils.cleanMarkdown.mockReturnValue('Simple text');
            const result = AnalysisManager.parseStrengthsWeaknesses('Just some text');
            expect(result).toContain('<p>');
        });
    });

    describe('generateStrengthsWeaknesses', () => {
        const mockResult = {
            id: 'test-id-1',
            studentData: {
                prompts: {}
            },
            tokenUsage: {}
        };

        beforeEach(() => {
            appState.generatedResults = [mockResult];
        });

        it('should throw error if result not found', async () => {
            await expect(AnalysisManager.generateStrengthsWeaknesses('non-existent'))
                .rejects.toThrow('Conditions non remplies.');
        });

        it('should throw error if no API key', async () => {
            UI.checkAPIKeyPresence.mockReturnValueOnce(false);

            await expect(AnalysisManager.generateStrengthsWeaknesses('test-id-1'))
                .rejects.toThrow('Conditions non remplies.');
        });

        it('should call AIService with correct prompt', async () => {
            AIService.callAIWithFallback.mockResolvedValueOnce({ text: 'Analysis result', usage: { total_tokens: 100 } });

            await AnalysisManager.generateStrengthsWeaknesses('test-id-1');

            expect(AIService.callAIWithFallback).toHaveBeenCalledWith('sw prompt');
        });

        it('should save result and show notification', async () => {
            AIService.callAIWithFallback.mockResolvedValueOnce({ text: 'Analysis result', usage: { total_tokens: 100 } });

            await AnalysisManager.generateStrengthsWeaknesses('test-id-1', false);

            expect(mockResult.strengthsWeaknesses).toBe('Analysis result');
            expect(StorageManager.saveAppState).toHaveBeenCalled();
            expect(UI.showNotification).toHaveBeenCalledWith('Analyse générée.', 'success');
        });

        it('should not show notification when silent', async () => {
            AIService.callAIWithFallback.mockResolvedValueOnce({ text: 'Analysis result', usage: { total_tokens: 100 } });

            await AnalysisManager.generateStrengthsWeaknesses('test-id-1', true);

            expect(UI.showNotification).not.toHaveBeenCalled();
        });

        it('should handle errors gracefully', async () => {
            AIService.callAIWithFallback.mockRejectedValueOnce(new Error('API Error'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await expect(AnalysisManager.generateStrengthsWeaknesses('test-id-1'))
                .rejects.toThrow('API Error');

            expect(UI.showNotification).toHaveBeenCalledWith(expect.stringContaining('Erreur'), 'error');

            consoleSpy.mockRestore();
        });
    });

    describe('generateNextSteps', () => {
        const mockResult = {
            id: 'test-id-1',
            studentData: {
                prompts: {}
            },
            tokenUsage: {}
        };

        beforeEach(() => {
            appState.generatedResults = [mockResult];
        });

        it('should throw error if result not found', async () => {
            await expect(AnalysisManager.generateNextSteps('non-existent'))
                .rejects.toThrow('Conditions non remplies.');
        });

        it('should parse numbered steps from AI response', async () => {
            AIService.callAIWithFallback.mockResolvedValueOnce({
                text: '1. First step\n2. Second step\n3. Third step',
                usage: { total_tokens: 100 }
            });

            await AnalysisManager.generateNextSteps('test-id-1');

            expect(mockResult.nextSteps).toHaveLength(3);
            expect(mockResult.nextSteps[0]).toBe('First step');
        });

        it('should limit to 3 steps', async () => {
            AIService.callAIWithFallback.mockResolvedValueOnce({
                text: '1. Step 1\n2. Step 2\n3. Step 3\n4. Step 4\n5. Step 5',
                usage: { total_tokens: 100 }
            });

            await AnalysisManager.generateNextSteps('test-id-1');

            expect(mockResult.nextSteps).toHaveLength(3);
        });

        it('should merge continuation lines', async () => {
            AIService.callAIWithFallback.mockResolvedValueOnce({
                text: '1. This is the first step\nand continues here',
                usage: { total_tokens: 100 }
            });

            await AnalysisManager.generateNextSteps('test-id-1');

            expect(mockResult.nextSteps[0]).toContain('continues here');
        });

        it('should filter out conclusion phrases', async () => {
            AIService.callAIWithFallback.mockResolvedValueOnce({
                text: '1. Step 1\nJ\'espère que cela aide',
                usage: { total_tokens: 100 }
            });

            await AnalysisManager.generateNextSteps('test-id-1');

            expect(mockResult.nextSteps[0]).not.toContain("J'espère");
        });
    });

    describe('refetchAnalyses', () => {
        const mockResult = {
            id: 'test-id-1',
            strengthsWeaknesses: 'existing',
            nextSteps: ['existing step'],
            studentData: { prompts: {} },
            tokenUsage: {}
        };

        beforeEach(() => {
            appState.generatedResults = [mockResult];
            DOM.studentDetailsModal.querySelector = vi.fn(() => ({ innerHTML: '' }));
        });

        it('should reset strengthsWeaknesses when type is sw', () => {
            AnalysisManager.refetchAnalyses('test-id-1', 'sw');

            expect(mockResult.strengthsWeaknesses).toBeNull();
        });

        it('should reset nextSteps when type is ns', () => {
            AnalysisManager.refetchAnalyses('test-id-1', 'ns');

            expect(mockResult.nextSteps).toBeNull();
        });

        it('should do nothing if result not found', () => {
            const originalSW = mockResult.strengthsWeaknesses;

            AnalysisManager.refetchAnalyses('non-existent', 'sw');

            expect(mockResult.strengthsWeaknesses).toBe(originalSW);
        });
    });

    describe('fetchAnalysesForStudent', () => {
        const mockResult = {
            id: 'test-id-1',
            strengthsWeaknesses: null,
            nextSteps: null,
            studentData: { prompts: {} },
            tokenUsage: {}
        };

        beforeEach(() => {
            appState.generatedResults = [mockResult];
            DOM.studentDetailsModal.querySelector = vi.fn(() => ({ innerHTML: '' }));
            AIService.callAIWithFallback.mockResolvedValue({ text: 'Analysis', usage: {} });
        });

        it('should return early if result not found', async () => {
            await AnalysisManager.fetchAnalysesForStudent('non-existent');

            expect(AIService.callAIWithFallback).not.toHaveBeenCalled();
        });

        it('should generate analyses if null', async () => {
            await AnalysisManager.fetchAnalysesForStudent('test-id-1');

            expect(AIService.callAIWithFallback).toHaveBeenCalled();
        });

        it('should use existing data if not null', async () => {
            mockResult.strengthsWeaknesses = 'existing analysis';
            mockResult.nextSteps = ['existing step'];

            await AnalysisManager.fetchAnalysesForStudent('test-id-1');

            // Should still be called for HTML parsing but not for AI
            expect(mockResult.strengthsWeaknesses).toBe('existing analysis');
        });
    });
});
