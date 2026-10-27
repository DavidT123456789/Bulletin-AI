/**
 * @fileoverview Tests unitaires pour AIService
 * @module services/AIService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIService, parseRetryDelay } from './AIService.js';

// Mock state module
vi.mock('../state/State.js', () => ({
    appState: {
        openaiApiKey: '',
        googleApiKey: '',
        groqApiKey: '',
        openrouterApiKey: '',
        mistralApiKey: '',
        currentAIModel: 'gemini-2.0-flash',
        sessionCost: 0
    }
}));

// Mock config module
vi.mock('../config/Config.js', () => ({
    CONFIG: {
        OPENAI_API_BASE: 'https://api.openai.com/v1',
        GOOGLE_API_BASE: 'https://generativelanguage.googleapis.com/v1beta',
        GROQ_API_BASE: 'https://api.groq.com/openai/v1',
        OPENROUTER_API_BASE: 'https://openrouter.ai/api/v1',
        MISTRAL_API_BASE: 'https://api.mistral.ai/v1',
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

            expect(() => AIService._getApiConfig('Test prompt')).toThrow('Clé API Google manquante.');
        });

        it('should return correct config for Google provider', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-google-key';
            appState.currentAIModel = 'gemini-2.0-flash';

            const config = AIService._getApiConfig('Test prompt');

            expect(config.apiKey).toBe('test-google-key');
            expect(config.apiUrl).toContain('gemini-2.0-flash');
            expect(config.apiUrl).not.toContain('test-google-key');
            expect(config.headers['x-goog-api-key']).toBe('test-google-key');
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

        it('should return correct config for Groq provider', async () => {
            const { appState } = await import('../state/State.js');
            appState.groqApiKey = 'gsk-test-groq-key';
            appState.currentAIModel = 'groq-gpt-oss-120b';

            const config = AIService._getApiConfig('Test prompt');

            expect(config.apiKey).toBe('gsk-test-groq-key');
            expect(config.apiUrl).toContain('api.groq.com');
            expect(config.headers['Authorization']).toBe('Bearer gsk-test-groq-key');
            expect(config.payload.model).toBe('openai/gpt-oss-120b');
            expect(config.payload.reasoning_format).toBe('parsed');
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
            expect(config.payload.generationConfig).toEqual({ maxOutputTokens: 5 });
            expect(config.payload.max_tokens).toBeUndefined();
        });

        it('should set max_tokens to 5 in validation mode for OpenAI-compatible providers', async () => {
            const { appState } = await import('../state/State.js');
            appState.groqApiKey = 'gsk-test-groq-key';

            const config = AIService._getApiConfig('test', {
                isValidation: true,
                validationProvider: 'groq',
                modelOverride: 'groq-gpt-oss-120b'
            });

            expect(config.payload.max_tokens).toBe(5);
        });
    });

    describe('callAI - Error Handling', () => {
        it('should throw error when fetch fails with error response', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-key';

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

    describe('parseRetryDelay()', () => {
        it('should parse Groq "try again in Xs" format', () => {
            expect(parseRetryDelay('Rate limit reached. Please try again in 1.45s.')).toBe(2);
            expect(parseRetryDelay('Please try again in 23.4s.')).toBe(24);
        });

        it('should parse "retry in Xs" format', () => {
            expect(parseRetryDelay('Resource has been exhausted. Please retry in 55.35s')).toBe(56);
        });

        it('should parse millisecond format properly', () => {
            expect(parseRetryDelay('Please try again in 500ms')).toBe(1);
            expect(parseRetryDelay('retry in 2500ms')).toBe(3);
        });

        it('should parse "retry after X seconds" format', () => {
            expect(parseRetryDelay('Too many requests, retry after 15 seconds')).toBe(15);
        });

        it('should parse minutes format', () => {
            expect(parseRetryDelay('Please try again in 2m')).toBe(120);
            expect(parseRetryDelay('Please try again in 1.5min')).toBe(90);
        });

        it('should return null for non-rate-limit error messages', () => {
            expect(parseRetryDelay('Invalid API key provided')).toBeNull();
            expect(parseRetryDelay('500 Internal Server Error')).toBeNull();
            expect(parseRetryDelay('')).toBeNull();
            expect(parseRetryDelay(null)).toBeNull();
        });
    });

    describe('_hasApiKeyForModel()', () => {
        it('should return true when API key is configured for provider', async () => {
            const { appState } = await import('../state/State.js');
            appState.groqApiKey = 'gsk-valid-key-12345';
            expect(AIService._hasApiKeyForModel('groq-gpt-oss-120b')).toBe(true);
            expect(AIService._hasApiKeyForModel('groq-llama-3.3-70b')).toBe(true);

            appState.googleApiKey = 'AIzaSyGoogle12345';
            expect(AIService._hasApiKeyForModel('gemini-3.6-flash')).toBe(true);
        });

        it('should return false when API key is missing or invalid', async () => {
            const { appState } = await import('../state/State.js');
            appState.groqApiKey = '';
            expect(AIService._hasApiKeyForModel('groq-gpt-oss-120b')).toBe(false);

            appState.mistralApiKey = 'short';
            expect(AIService._hasApiKeyForModel('mistral-direct-small-latest')).toBe(false);
        });

        it('should check ollama status for ollama models', async () => {
            const { appState } = await import('../state/State.js');
            appState.ollamaEnabled = true;
            appState.ollamaInstalledModels = ['qwen2.5:7b'];
            expect(AIService._hasApiKeyForModel('ollama-qwen2.5:7b')).toBe(true);

            appState.ollamaEnabled = false;
            expect(AIService._hasApiKeyForModel('ollama-qwen2.5:7b')).toBe(false);
        });
    });
});

