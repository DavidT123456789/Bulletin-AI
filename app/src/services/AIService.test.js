/**
 * @fileoverview Tests unitaires pour AIService
 * @module services/AIService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIService } from './AIService.js';

// Mock state module
vi.mock('../state/State.js', () => ({
    appState: {
        openaiApiKey: '',
        googleApiKey: '',
        openrouterApiKey: '',
        currentAIModel: 'gemini-2.0-flash',
        isDemoMode: false,
        sessionCost: 0
    }
}));

// Mock config module
vi.mock('../config/Config.js', () => ({
    CONFIG: {
        OPENAI_API_BASE: 'https://api.openai.com/v1',
        GOOGLE_API_BASE: 'https://generativelanguage.googleapis.com/v1beta',
        OPENROUTER_API_BASE: 'https://openrouter.ai/api/v1',
        API_CALL_TIMEOUT_MS: 25000
    },
    COSTS_PER_MILLION_TOKENS: {
        'gemini-2.0-flash': { input: 0.10, output: 0.40 },
        'gpt-3.5-turbo': { input: 0.50, output: 1.50 }
    }
}));

// Mock DOM module
vi.mock('../utils/DOM.js', () => ({
    DOM: {
        sessionCost: null
    }
}));

describe('AIService', () => {
    let mockAppState;

    beforeEach(() => {
        vi.resetModules();
        // Reset appState for each test
        mockAppState = {
            openaiApiKey: '',
            googleApiKey: '',
            openrouterApiKey: '',
            currentAIModel: 'gemini-2.0-flash',
            isDemoMode: false,
            sessionCost: 0
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('_getApiConfig', () => {
        it('should throw error when API key is missing', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = '';
            appState.currentAIModel = 'gemini-2.0-flash';

            expect(() => AIService._getApiConfig('Test prompt')).toThrow('Clé Google manquante.');
        });

        it('should return correct config for Google provider', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-google-key';
            appState.currentAIModel = 'gemini-2.0-flash';

            const config = AIService._getApiConfig('Test prompt');

            expect(config.apiKey).toBe('test-google-key');
            expect(config.apiUrl).toContain('gemini-2.0-flash');
            expect(config.apiUrl).toContain('test-google-key');
            expect(config.headers['Content-Type']).toBe('application/json');
            expect(config.payload.contents[0].parts[0].text).toBe('Test prompt');
        });

        it('should return correct config for OpenAI provider', async () => {
            const { appState } = await import('../state/State.js');
            appState.openaiApiKey = 'test-openai-key';
            appState.currentAIModel = 'openai-gpt-3.5-turbo';

            const config = AIService._getApiConfig('Test prompt');

            expect(config.apiKey).toBe('test-openai-key');
            expect(config.apiUrl).toContain('openai');
            expect(config.headers['Authorization']).toBe('Bearer test-openai-key');
            expect(config.payload.model).toBe('gpt-3.5-turbo');
            expect(config.payload.messages[0].content).toBe('Test prompt');
        });

        it('should return correct config for validation mode', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-google-key';

            const config = AIService._getApiConfig('test', {
                isValidation: true,
                validationProvider: 'google',
                modelOverride: 'gemini-1.5-flash'
            });

            expect(config.payload.contents[0].parts[0].text).toBe('test');
        });
    });

    describe('callAI - Demo Mode', () => {
        it('should return fake response in demo mode', async () => {
            const { appState } = await import('../state/State.js');
            appState.isDemoMode = true;

            const result = await AIService.callAI('Generate appreciation');

            expect(result.text).toContain('MODE DÉMO');
            expect(result.usage.total_tokens).toBe(123);
        });

        it('should return strength/weakness format for specific prompts', async () => {
            const { appState } = await import('../state/State.js');
            appState.isDemoMode = true;

            const result = await AIService.callAI('Analyse: Points Forts et Points Faibles');

            expect(result.text).toContain('Points Forts');
            expect(result.text).toContain('Points Faibles');
        });

        it('should return improvement tips for specific prompts', async () => {
            const { appState } = await import('../state/State.js');
            appState.isDemoMode = true;

            const result = await AIService.callAI('Propose des pistes d\'amélioration');

            expect(result.text).toContain('1.');
            expect(result.text).toContain('2.');
        });
    });

    describe('callAI - Error Handling', () => {
        it('should throw error when fetch fails with error response', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-key';
            appState.isDemoMode = false;

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ error: { message: 'Invalid API key' } })
            });

            await expect(AIService.callAI('Test prompt'))
                .rejects.toThrow('401');
        });

        it('should handle abort signal for cancellation', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-key';
            appState.isDemoMode = false;

            const abortController = new AbortController();
            abortController.abort();

            await expect(AIService.callAI('Test prompt', { signal: abortController.signal }))
                .rejects.toThrow();
        });
    });

    describe('callAI - Success Response', () => {
        it('should parse Google API response correctly', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-key';
            appState.isDemoMode = false;

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [{ text: 'Generated text from Google' }]
                        }
                    }],
                    usageMetadata: {
                        promptTokenCount: 10,
                        candidatesTokenCount: 20
                    }
                })
            });

            const result = await AIService.callAI('Test prompt');

            expect(result.text).toBe('Generated text from Google');
            expect(result.usage.prompt_tokens).toBe(10);
            expect(result.usage.completion_tokens).toBe(20);
            expect(result.usage.total_tokens).toBe(30);
        });

        it('should parse OpenAI API response correctly', async () => {
            const { appState } = await import('../state/State.js');
            appState.openaiApiKey = 'test-key';
            appState.currentAIModel = 'openai-gpt-3.5-turbo';
            appState.isDemoMode = false;

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{
                        message: { content: 'Generated text from OpenAI' }
                    }],
                    usage: {
                        prompt_tokens: 15,
                        completion_tokens: 25
                    }
                })
            });

            const result = await AIService.callAI('Test prompt');

            expect(result.text).toBe('Generated text from OpenAI');
            expect(result.usage.prompt_tokens).toBe(15);
            expect(result.usage.completion_tokens).toBe(25);
            expect(result.usage.total_tokens).toBe(40);
        });
    });

    describe('getAvailableModels', () => {
        it('should fetch Google models list', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-key';

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    models: [
                        { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
                        { name: 'models/gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' }
                    ]
                })
            });

            const models = await AIService.getAvailableModels('google');

            expect(models).toHaveLength(2);
            expect(models[0].name).toBe('models/gemini-2.0-flash');
        });

        it('should throw error when Google API key is missing', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = '';

            await expect(AIService.getAvailableModels('google'))
                .rejects.toThrow('Clé API manquante.');
        });

        it('should return empty array for non-google providers', async () => {
            const models = await AIService.getAvailableModels('openai');

            expect(models).toEqual([]);
        });
    });
});
