/**
 * @fileoverview Tests unitaires pour AIService
 * @module services/AIService.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIService, parseRetryDelay, sleep } from './AIService.js';
import { AI_MODELS, PROVIDER_DEFAULT_MODELS } from '../config/aiRegistry.js';
import { bus, EVENTS } from '../core/EventBus.js';

// Mock state module
vi.mock('../state/State.js', () => ({
    appState: {
        openaiApiKey: '',
        googleApiKey: '',
        albertApiKey: '',
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
        ALBERT_API_BASE: 'https://albert.api.etalab.gouv.fr/v1',
        GROQ_API_BASE: 'https://api.groq.com/openai/v1',
        OPENROUTER_API_BASE: 'https://openrouter.ai/api/v1',
        MISTRAL_API_BASE: 'https://api.mistral.ai/v1'
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

        it('should resolve Google apiUrl via getApiModelName(m) when apiModelId differs from id', async () => {
            const { appState } = await import('../state/State.js');
            const originalApiModelId = AI_MODELS['gemini-4-hydrogen'].apiModelId;
            AI_MODELS['gemini-4-hydrogen'].apiModelId = 'gemini-4-hydrogen-preview';
            try {
                appState.googleApiKey = 'test-google-key';
                appState.currentAIModel = 'gemini-4-hydrogen';

                const config = AIService._getApiConfig('Test prompt');
                expect(config.apiUrl).toContain('/models/gemini-4-hydrogen-preview:generateContent');
            } finally {
                AI_MODELS['gemini-4-hydrogen'].apiModelId = originalApiModelId;
            }
        });

        it('should fallback Google validation model to PROVIDER_DEFAULT_MODELS.google when modelOverride is omitted', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-google-key';
            appState.currentAIModel = 'openrouter';

            const config = AIService._getApiConfig('Validation', {
                isValidation: true,
                validationProvider: 'google'
            });

            expect(config.apiUrl).toContain(`/models/${PROVIDER_DEFAULT_MODELS.google}:generateContent`);
            expect(config.payload.generationConfig).toEqual({
                thinkingConfig: { thinkingLevel: 'LOW' },
                maxOutputTokens: 5
            });
        });

        it('should fallback validation model to PROVIDER_DEFAULT_MODELS[validationProvider] when modelOverride is omitted', async () => {
            const { appState } = await import('../state/State.js');
            appState.albertApiKey = 'sk-albert-test-key';

            const config = AIService._getApiConfig('Validation', {
                isValidation: true,
                validationProvider: 'albert'
            });

            expect(config.payload.model).toBe('openweight-medium');
            expect(config.payload.max_tokens).toBe(5);
        });

        it('should inject thinkingConfig.thinkingLevel and omit temperature/maxOutputTokens on Google reasoning models while calibrating non-reasoning models', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-google-key';

            appState.currentAIModel = 'gemini-3.8-flash';
            expect(AIService._getApiConfig('Test').payload.generationConfig).toEqual({
                thinkingConfig: { thinkingLevel: 'LOW' }
            });

            appState.currentAIModel = 'gemini-4-hydrogen';
            expect(AIService._getApiConfig('Test', { taskType: 'analysis' }).payload.generationConfig).toEqual({
                thinkingConfig: { thinkingLevel: 'LOW' }
            });

            appState.currentAIModel = 'gemini-3.6-flash';
            expect(AIService._getApiConfig('Test').payload.generationConfig).toEqual({
                temperature: 0.65,
                maxOutputTokens: 1024
            });
        });

        it('should never leak Gemini thought-only parts as final appreciation text when truncated', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-google-key';
            appState.currentAIModel = 'gemini-4-hydrogen';

            global.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        finishReason: 'MAX_TOKENS',
                        content: {
                            parts: [
                                { thought: true, text: 'Stick strictly to data. Let us write: "Lucas...' }
                            ]
                        }
                    }]
                })
            });

            await expect(AIService.callAI('Test prompt')).rejects.toThrow(/Réponse vide/i);

            global.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    candidates: [{
                        content: {
                            parts: [
                                { thought: true, text: 'Internal reasoning...' },
                                { text: 'Lucas a mené un travail approfondi ce semestre.' }
                            ]
                        }
                    }]
                })
            });

            const res = await AIService.callAI('Test prompt');
            expect(res.text).toBe('Lucas a mené un travail approfondi ce semestre.');
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

        it('should return correct config for Albert API provider using openweight alias', async () => {
            const { appState } = await import('../state/State.js');
            appState.albertApiKey = 'sk-albert-test-key';
            appState.currentAIModel = 'albert-openweight-medium';

            const config = AIService._getApiConfig('Test prompt', { systemPrompt: 'Tu es enseignant.' });

            expect(config.apiKey).toBe('sk-albert-test-key');
            expect(config.apiUrl).toBe('https://albert.api.etalab.gouv.fr/v1/chat/completions');
            expect(config.headers['Authorization']).toBe('Bearer sk-albert-test-key');
            expect(config.payload.model).toBe('openweight-medium');
            expect(config.payload.temperature).toBe(0.65);
            expect(config.payload.top_p).toBe(0.9);
            expect(config.payload.max_tokens).toBe(1024);
            expect(config.payload.messages).toEqual([
                { role: 'system', content: 'Tu es enseignant.' },
                { role: 'user', content: 'Test prompt' }
            ]);

            const analysisConfig = AIService._getApiConfig('Test prompt', {
                modelOverride: 'albert-openweight-large',
                taskType: 'analysis'
            });
            expect(analysisConfig.payload.temperature).toBe(0.2);
            expect(analysisConfig.payload.max_tokens).toBe(2048);
        });

        it('should calibrate temperature by taskType, respect supportsTemperature: false and derive max_tokens from isReasoning', async () => {
            const { appState } = await import('../state/State.js');
            appState.openaiApiKey = 'test-openai-key';
            appState.groqApiKey = 'gsk-test-groq-key';
            appState.openrouterApiKey = 'or-test-key';
            appState.anthropicApiKey = 'ant-test-key';
            appState.ollamaEnabled = true;

            // OpenAI reasoning : pas de temperature, utilise max_completion_tokens: 2048
            const openaiReasoning = AIService._getApiConfig('Test', { modelOverride: 'openai-gpt-6-luna' });
            expect(openaiReasoning.payload.temperature).toBeUndefined();
            expect(openaiReasoning.payload.max_tokens).toBeUndefined();
            expect(openaiReasoning.payload.max_completion_tokens).toBe(2048);

            // Validation OpenAI reasoning : plafonne max_completion_tokens à 5
            const openaiValidation = AIService._getApiConfig('test', {
                isValidation: true,
                validationProvider: 'openai',
                modelOverride: 'openai-gpt-6-luna'
            });
            expect(openaiValidation.payload.max_completion_tokens).toBe(5);
            expect(openaiValidation.payload.temperature).toBeUndefined();

            // Groq reasoning : budget 2048 tokens + temperature par tâche
            const groqAppreciation = AIService._getApiConfig('Test', { modelOverride: 'groq-gpt-oss-120b' });
            expect(groqAppreciation.payload.max_tokens).toBe(2048);
            expect(groqAppreciation.payload.temperature).toBe(0.65);

            const groqAnalysis = AIService._getApiConfig('Test', { modelOverride: 'groq-gpt-oss-20b', taskType: 'class-synthesis' });
            expect(groqAnalysis.payload.max_tokens).toBe(4096);
            expect(groqAnalysis.payload.temperature).toBe(0.2);

            // DeepSeek R1 & Anthropic Opus : supportsTemperature: false + 2048 tokens
            const deepseekR1 = AIService._getApiConfig('Test', { modelOverride: 'deepseek-r1' });
            expect(deepseekR1.payload.temperature).toBeUndefined();
            expect(deepseekR1.payload.max_tokens).toBe(2048);

            const claudeOpus = AIService._getApiConfig('Test', { modelOverride: 'anthropic-claude-opus-5-5' });
            expect(claudeOpus.payload.temperature).toBeUndefined();
            expect(claudeOpus.payload.max_tokens).toBe(2048);

            // Ollama /api/chat avec messages system/user, temperature calibrée et num_predict selon isReasoning
            const ollamaChat = AIService._getApiConfig('Données élève', {
                modelOverride: 'ollama-qwen2.5:7b',
                systemPrompt: 'Tu es enseignant.',
                taskType: 'analysis'
            });
            expect(ollamaChat.apiUrl).toBe('http://localhost:11434/api/chat');
            expect(ollamaChat.payload.messages).toEqual([
                { role: 'system', content: 'Tu es enseignant.' },
                { role: 'user', content: 'Données élève' }
            ]);
            expect(ollamaChat.payload.prompt).toBeUndefined();
            expect(ollamaChat.payload.options.temperature).toBe(0.2);
            expect(ollamaChat.payload.options.num_predict).toBe(1024);

            const ollamaReasoning = AIService._getApiConfig('Test', { modelOverride: 'ollama-deepseek-r1:8b' });
            expect(ollamaReasoning.payload.options.num_predict).toBe(2048);
            expect(ollamaReasoning.payload.options.temperature).toBe(0.65);

            appState.ollamaEnabled = false;
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
                .rejects.toMatchObject({ name: 'AbortError' });
        });

        it('should preserve AbortError name when externalSignal aborts in-flight fetch', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-key';

            const abortController = new AbortController();
            globalThis.fetch = vi.fn().mockImplementation((_url, { signal }) => {
                return new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        reject(new DOMException('The operation was aborted.', 'AbortError'));
                    });
                });
            });

            const callPromise = AIService.callAI('Test prompt', { signal: abortController.signal });
            abortController.abort();

            await expect(callPromise).rejects.toMatchObject({ name: 'AbortError' });
        });

        it('should strip both closed and unclosed <think> blocks from reasoning models', async () => {
            const { appState } = await import('../state/State.js');
            appState.openaiApiKey = 'test-key';
            appState.currentAIModel = 'openai-gpt-3.5-turbo';

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    choices: [{
                        message: { content: '<think>Internal chain of thought</think>Appréciation finale.<think>Truncated reasoning at token limit' }
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 20 }
                })
            });

            const result = await AIService.callAI('Test prompt');
            expect(result.text).toBe('Appréciation finale.');
        });

        it('should cap validation timeout at 15s and convert DOMException TimeoutError into formatted TimeoutError', async () => {
            vi.useFakeTimers();
            try {
                const { appState } = await import('../state/State.js');
                appState.googleApiKey = 'test-key';
                appState.currentAIModel = 'gemini-4-hydrogen'; // 40s normal timeout

                globalThis.fetch = vi.fn().mockImplementation((_url, { signal }) => {
                    return new Promise((_resolve, reject) => {
                        signal.addEventListener('abort', () => {
                            reject(signal.reason || new DOMException('Timeout', 'TimeoutError'));
                        });
                    });
                });

                const callPromise = AIService.callAI('Validation', {
                    isValidation: true,
                    validationProvider: 'google',
                    modelOverride: 'gemini-4-hydrogen'
                });
                const assertion = expect(callPromise).rejects.toMatchObject({
                    name: 'TimeoutError',
                    message: 'La requête a expiré (timeout 15s).'
                });

                await vi.advanceTimersByTimeAsync(15000);
                await assertion;
                expect(globalThis.fetch).toHaveBeenCalledTimes(1);
            } finally {
                vi.useRealTimers();
            }
        });

        it('should retry once on TimeoutError during normal generation and succeed on second attempt', async () => {
            vi.useFakeTimers();
            try {
                const { appState } = await import('../state/State.js');
                appState.googleApiKey = 'test-key';
                appState.currentAIModel = 'gemini-3.6-flash';

                let attempt = 0;
                globalThis.fetch = vi.fn().mockImplementation((_url, { signal }) => {
                    attempt++;
                    if (attempt === 1) {
                        return new Promise((_resolve, reject) => {
                            signal.addEventListener('abort', () => {
                                reject(signal.reason || new DOMException('Timeout', 'TimeoutError'));
                            });
                        });
                    }
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            candidates: [{ content: { parts: [{ text: 'Succès après retry' }] } }],
                            usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 }
                        })
                    });
                });

                const callPromise = AIService.callAI('Test prompt');
                await vi.advanceTimersByTimeAsync(22000 + 1000);
                const result = await callPromise;

                expect(result.text).toBe('Succès après retry');
                expect(globalThis.fetch).toHaveBeenCalledTimes(2);
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('sleep()', () => {
        it('should resolve after delay and abort cleanly with AbortError when signal fires', async () => {
            const controller = new AbortController();
            const sleepPromise = sleep(5000, controller.signal);
            controller.abort();
            await expect(sleepPromise).rejects.toMatchObject({ name: 'AbortError' });
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

        it('should parse Ollama /api/chat response correctly', async () => {
            const { appState } = await import('../state/State.js');
            appState.ollamaEnabled = true;
            appState.currentAIModel = 'ollama-qwen2.5:7b';

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    message: { role: 'assistant', content: 'Travail sérieux et régulier.' },
                    prompt_eval_count: 120,
                    eval_count: 35
                })
            });

            try {
                const result = await AIService.callAI('Données', { systemPrompt: 'Tu es enseignant.' });
                expect(result.text).toBe('Travail sérieux et régulier.');
                expect(result.usage).toEqual({ prompt_tokens: 120, completion_tokens: 35, total_tokens: 155 });
            } finally {
                appState.ollamaEnabled = false;
            }
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

        it('should handle non-JSON 503 response on Google /models and attach HTTP status', async () => {
            const { appState } = await import('../state/State.js');
            appState.googleApiKey = 'test-key';

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: () => Promise.reject(new SyntaxError('Unexpected token <'))
            });

            await expect(AIService.getAvailableModels('google'))
                .rejects.toMatchObject({ status: 503, message: expect.stringContaining('503') });
        });

        it('should return empty array for non-google providers', async () => {
            const models = await AIService.getAvailableModels('openai');

            expect(models).toEqual([]);
        });

        it('should fetch Albert API models list and handle 403 account expiration', async () => {
            const { appState } = await import('../state/State.js');
            appState.albertApiKey = 'sk-albert-valid';

            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    object: 'list',
                    data: [{ id: 'openweight-medium', type: 'text-generation' }]
                })
            });

            const models = await AIService.getAvailableModels('albert');
            expect(models).toHaveLength(1);
            expect(models[0].id).toBe('openweight-medium');

            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: () => Promise.resolve({ detail: 'Your account has expired.' })
            });

            await expect(AIService.getAvailableModels('albert'))
                .rejects.toThrow('Compte Albert expiré (403)');
        });
    });

    describe('getAlbertAccountInfo', () => {
        it('should extract rpm and rpd limits from /v1/me response', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    object: 'userInfo',
                    id: 42,
                    email: 'prof@ac-paris.fr',
                    budget: null,
                    expires: null,
                    limits: [
                        { router_id: 1, type: 'rpm', value: 30 },
                        { router_id: 1, type: 'rpd', value: 1000 }
                    ]
                })
            });

            const info = await AIService.getAlbertAccountInfo('sk-albert-key');
            expect(info).toEqual({
                rpmLimit: 30,
                rpdLimit: 1000,
                budget: null,
                expires: null
            });
        });

        it('should prioritize LLM text-generation routers (with tpm > 0) over embedding routers', async () => {
            globalThis.fetch = vi.fn().mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    object: 'userInfo',
                    id: 20899,
                    limits: [
                        { router_id: 342, type: 'rpm', value: 500 },
                        { router_id: 342, type: 'rpd', value: 50000 },
                        { router_id: 342, type: 'tpm', value: null },
                        { router_id: 337, type: 'rpm', value: 50 },
                        { router_id: 337, type: 'rpd', value: 1000 },
                        { router_id: 337, type: 'tpm', value: 128000 }
                    ]
                })
            });

            const info = await AIService.getAlbertAccountInfo('sk-albert-key');
            expect(info.rpmLimit).toBe(50);
            expect(info.rpdLimit).toBe(1000);
        });

        it('should return null when key is empty or endpoint returns 404', async () => {
            const { appState } = await import('../state/State.js');
            appState.albertApiKey = '';
            expect(await AIService.getAlbertAccountInfo()).toBeNull();

            globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 });
            expect(await AIService.getAlbertAccountInfo('sk-albert-key')).toBeNull();
        });
    });

    describe('parseRetryDelay()', () => {
        it('should prioritize HTTP Retry-After and x-ratelimit-reset headers', () => {
            const headers1 = { get: (k) => (k === 'retry-after' ? '8' : null) };
            expect(parseRetryDelay('Rate limit exceeded', headers1)).toBe(8);

            const headers2 = { get: (k) => (k === 'x-ratelimit-reset-requests' ? '3.2s' : null) };
            expect(parseRetryDelay('Too many requests', headers2)).toBe(4);
        });
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

        it('should check ollama status and reject invalid or non-loopback Ollama URLs without fetching', async () => {
            const { appState } = await import('../state/State.js');
            appState.ollamaEnabled = true;
            appState.ollamaInstalledModels = ['qwen2.5:7b'];
            expect(AIService._hasApiKeyForModel('ollama-qwen2.5:7b')).toBe(true);

            appState.ollamaEnabled = false;
            expect(AIService._hasApiKeyForModel('ollama-qwen2.5:7b')).toBe(false);

            appState.ollamaEnabled = true;
            try {
                for (const badUrl of ['https://evil.com', 'http://localhost:9222', 'http://localhost:11434/admin#x']) {
                    appState.ollamaBaseUrl = badUrl;
                    expect(() => AIService._getApiConfig('Test', { modelOverride: 'ollama-qwen2.5:7b' })).toThrow(/URL Ollama invalide/);
                    const fetchSpy = vi.fn();
                    globalThis.fetch = fetchSpy;
                    expect(await AIService.checkOllamaAvailability()).toBe(false);
                    expect(await AIService.getOllamaModels()).toEqual([]);
                    expect(fetchSpy).not.toHaveBeenCalled();
                }
            } finally {
                appState.ollamaEnabled = false;
                appState.ollamaInstalledModels = [];
                appState.ollamaBaseUrl = 'http://localhost:11434';
            }
        });
    });

    describe('Cloudflare Pages Albert API Relay Function ([[path]].js)', () => {
        it('should forward allowed endpoints with same-origin headers and Bearer auth and enforce response hygiene', async () => {
            const { onRequest } = await import('../../functions/api/albert/v1/[[path]].js');
            globalThis.fetch = vi.fn().mockResolvedValueOnce(
                new Response(JSON.stringify({ choices: [{ message: { content: 'Bonjour' } }] }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-ratelimit-reset-requests': '4s',
                        'Set-Cookie': 'secret=leaked'
                    }
                })
            );

            const req = new Request('https://bulletin-ai.pages.dev/api/albert/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Origin': 'https://bulletin-ai.pages.dev',
                    'Sec-Fetch-Site': 'same-origin',
                    'Authorization': 'Bearer sk-albert-test',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: 'openweight-medium', messages: [{ role: 'user', content: 'Test' }] })
            });

            const res = await onRequest({ request: req, params: { path: ['chat', 'completions'] } });
            expect(res.status).toBe(200);
            expect(res.headers.get('Cache-Control')).toBe('no-store');
            expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
            expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
            expect(res.headers.get('x-ratelimit-reset-requests')).toBe('4s');
            expect(res.headers.get('Set-Cookie')).toBeNull();
            expect(globalThis.fetch).toHaveBeenCalledWith(
                'https://albert.api.etalab.gouv.fr/v1/chat/completions',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('should allow GET /models via Referer same-origin fallback (Safari / school proxies) and reject cross-origin requests', async () => {
            const { onRequest } = await import('../../functions/api/albert/v1/[[path]].js');
            globalThis.fetch = vi.fn().mockResolvedValueOnce(
                new Response(JSON.stringify({ data: [] }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                })
            );

            const refererReq = new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                method: 'GET',
                headers: {
                    'Referer': 'https://bulletin-ai.pages.dev/app.html',
                    'Authorization': 'Bearer sk-albert-test'
                }
            });
            const refererRes = await onRequest({ request: refererReq, params: { path: ['models'] } });
            expect(refererRes.status).toBe(200);

            const evilOriginRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'GET',
                    headers: { 'Origin': 'https://evil.example', 'Authorization': 'Bearer sk-albert-test' }
                }),
                params: { path: ['models'] }
            });
            expect(evilOriginRes.status).toBe(403);

            const crossSiteRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'GET',
                    headers: { 'Sec-Fetch-Site': 'cross-site', 'Authorization': 'Bearer sk-albert-test' }
                }),
                params: { path: ['models'] }
            });
            expect(crossSiteRes.status).toBe(403);

            const noOriginRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'GET',
                    headers: { 'Authorization': 'Bearer sk-albert-test' }
                }),
                params: { path: ['models'] }
            });
            expect(noOriginRes.status).toBe(403);
        });

        it('should enforce strict OPTIONS origin, method/route coupling, Bearer auth, JSON Content-Type, body size limit, upstream timeout and non-JSON blocking', async () => {
            const { onRequest } = await import('../../functions/api/albert/v1/[[path]].js');

            const optionsOk = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'OPTIONS',
                    headers: { 'Origin': 'https://bulletin-ai.pages.dev' }
                }),
                params: { path: ['models'] }
            });
            expect(optionsOk.status).toBe(204);
            expect(optionsOk.headers.get('Access-Control-Allow-Origin')).toBe('https://bulletin-ai.pages.dev');
            expect(optionsOk.headers.get('Vary')).toBe('Origin');
            expect(optionsOk.headers.get('X-Content-Type-Options')).toBe('nosniff');

            const optionsCross = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'OPTIONS',
                    headers: { 'Origin': 'https://attacker.example' }
                }),
                params: { path: ['models'] }
            });
            expect(optionsCross.status).toBe(403);

            const deleteRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', { method: 'DELETE' }),
                params: { path: ['models'] }
            });
            expect(deleteRes.status).toBe(405);
            expect(deleteRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
            expect(deleteRes.headers.get('Cache-Control')).toBe('no-store');

            const forbiddenPathRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/admin/users', { method: 'GET' }),
                params: { path: ['admin', 'users'] }
            });
            expect(forbiddenPathRes.status).toBe(404);

            // Method/route mismatch: POST on models, GET on chat/completions
            const postModelsRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'POST',
                    headers: { 'Origin': 'https://bulletin-ai.pages.dev', 'Authorization': 'Bearer sk-albert-test', 'Content-Type': 'application/json' },
                    body: '{}'
                }),
                params: { path: ['models'] }
            });
            expect(postModelsRes.status).toBe(405);
            expect(postModelsRes.headers.get('Allow')).toBe('GET, OPTIONS');

            const getChatRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/chat/completions', {
                    method: 'GET',
                    headers: { 'Sec-Fetch-Site': 'same-origin', 'Authorization': 'Bearer sk-albert-test' }
                }),
                params: { path: ['chat', 'completions'] }
            });
            expect(getChatRes.status).toBe(405);
            expect(getChatRes.headers.get('Allow')).toBe('POST, OPTIONS');

            // Missing or malformed Authorization
            const noAuthRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'GET',
                    headers: { 'Sec-Fetch-Site': 'same-origin' }
                }),
                params: { path: ['models'] }
            });
            expect(noAuthRes.status).toBe(401);

            // Invalid Content-Type on POST
            const badCtRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Origin': 'https://bulletin-ai.pages.dev', 'Authorization': 'Bearer sk-albert-test', 'Content-Type': 'text/plain' },
                    body: '{}'
                }),
                params: { path: ['chat', 'completions'] }
            });
            expect(badCtRes.status).toBe(415);

            // Oversized Content-Length
            const bigClRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Origin': 'https://bulletin-ai.pages.dev',
                        'Authorization': 'Bearer sk-albert-test',
                        'Content-Type': 'application/json',
                        'Content-Length': String(300 * 1024)
                    },
                    body: '{}'
                }),
                params: { path: ['chat', 'completions'] }
            });
            expect(bigClRes.status).toBe(413);

            // Oversized streaming body without Content-Length
            const chunk = new Uint8Array(150 * 1024).fill(97);
            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(chunk);
                    controller.enqueue(chunk);
                    controller.close();
                }
            });
            const streamRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Origin': 'https://bulletin-ai.pages.dev',
                        'Authorization': 'Bearer sk-albert-test',
                        'Content-Type': 'application/json'
                    },
                    body: stream,
                    duplex: 'half'
                }),
                params: { path: ['chat', 'completions'] }
            });
            expect(streamRes.status).toBe(413);

            // Non-JSON upstream HTML response blocked
            globalThis.fetch = vi.fn().mockResolvedValueOnce(
                new Response('<html><body>WAF</body></html>', {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                })
            );
            const htmlRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'GET',
                    headers: { 'Sec-Fetch-Site': 'same-origin', 'Authorization': 'Bearer sk-albert-test' }
                }),
                params: { path: ['models'] }
            });
            expect(htmlRes.status).toBe(502);
            expect(htmlRes.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
            expect(htmlRes.headers.get('X-Content-Type-Options')).toBe('nosniff');

            // Network failure -> 502
            globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network down'));
            const failRes = await onRequest({
                request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                    method: 'GET',
                    headers: { 'Sec-Fetch-Site': 'same-origin', 'Authorization': 'Bearer sk-albert-test' }
                }),
                params: { path: ['models'] }
            });
            expect(failRes.status).toBe(502);

            // Upstream timeout -> 504
            vi.useFakeTimers();
            try {
                globalThis.fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
                    signal.addEventListener('abort', () => reject(signal.reason));
                }));
                const timeoutPromise = onRequest({
                    request: new Request('https://bulletin-ai.pages.dev/api/albert/v1/models', {
                        method: 'GET',
                        headers: { 'Sec-Fetch-Site': 'same-origin', 'Authorization': 'Bearer sk-albert-test' }
                    }),
                    params: { path: ['models'] }
                });
                await vi.advanceTimersByTimeAsync(45_100);
                const timeoutRes = await timeoutPromise;
                expect(timeoutRes.status).toBe(504);
                expect(timeoutRes.headers.get('Cache-Control')).toBe('no-store');
            } finally {
                vi.useRealTimers();
            }
        });
    });

    describe('callAIWithFallback()', () => {
        const resetAllProviderKeys = (appState) => {
            appState.openaiApiKey = '';
            appState.googleApiKey = '';
            appState.albertApiKey = '';
            appState.groqApiKey = '';
            appState.openrouterApiKey = '';
            appState.mistralApiKey = '';
            appState.anthropicApiKey = '';
            appState.ollamaUrl = '';
        };

        it('should short-circuit remaining paid OpenRouter models after HTTP 402 while still allowing -free and switching provider', async () => {
            const { appState } = await import('../state/State.js');
            resetAllProviderKeys(appState);
            appState.currentAIModel = 'mistral-small';
            appState.openrouterApiKey = 'sk-or-test-key';
            appState.googleApiKey = 'test-google-key';

            const calledModels = [];
            vi.spyOn(AIService, 'callAI').mockImplementation(async (_prompt, opts) => {
                calledModels.push(opts.modelOverride);
                if (opts.modelOverride === 'mistral-small') {
                    throw new Error('Erreur API 402: Insufficient credits');
                }
                if (opts.modelOverride === 'llama-3.3-70b-free') {
                    throw new Error('Erreur API 429: Rate limit');
                }
                if (opts.modelOverride === 'gemini-4-hydrogen') {
                    return { text: 'Réponse Google', usedModel: 'gemini-4-hydrogen', tokens: 42 };
                }
                throw new Error(`Unexpected model attempted: ${opts.modelOverride}`);
            });

            const result = await AIService.callAIWithFallback('Test prompt');

            expect(result.usedModel).toBe('gemini-4-hydrogen');
            expect(calledModels).toEqual([
                'mistral-small',
                'llama-3.3-70b-free',
                'gemini-4-hydrogen'
            ]);
        });

        it('should suggest adding an OpenRouter key when only one provider fails and OpenRouter is unconfigured, and omit it when configured', async () => {
            const { appState } = await import('../state/State.js');
            resetAllProviderKeys(appState);
            appState.currentAIModel = 'gemini-4-hydrogen';
            appState.googleApiKey = 'test-google-key';

            vi.spyOn(AIService, 'callAI').mockRejectedValue(new Error('Erreur API 429: Quota exceeded'));

            await expect(AIService.callAIWithFallback('Test prompt'))
                .rejects.toThrow('Ajoutez une clé OpenRouter pour un fallback automatique.');

            appState.openrouterApiKey = 'sk-or-test-key';
            let secondError = '';
            try {
                await AIService.callAIWithFallback('Test prompt');
            } catch (err) {
                secondError = err.message;
            }
            expect(secondError).toContain('Quota atteint (13 modèles testés)');
            expect(secondError).not.toContain('Ajoutez une clé OpenRouter');
        });

        it('should skip timeout retry when fallback alternatives exist and isolate HTTP 401 to the failing provider', async () => {
            const { appState } = await import('../state/State.js');
            resetAllProviderKeys(appState);
            appState.currentAIModel = 'albert-openweight-medium';
            appState.albertApiKey = 'sk-albert-expired';
            appState.googleApiKey = 'AIzaSy-valid-google-key';

            const calls = [];
            vi.spyOn(AIService, 'callAI').mockImplementation(async (_prompt, opts) => {
                calls.push({ model: opts.modelOverride, retryOnTimeout: opts.retryOnTimeout });
                if (opts.modelOverride === 'albert-openweight-medium') {
                    throw new Error('Erreur API 401: Unauthorized');
                }
                if (opts.modelOverride === 'gemini-4-hydrogen') {
                    const err = new Error('La requête a expiré (timeout 40s).');
                    err.name = 'TimeoutError';
                    throw err;
                }
                if (opts.modelOverride === 'gemini-3.6-flash') {
                    return { text: 'Réponse rapide', usage: null };
                }
                throw new Error(`Unexpected model: ${opts.modelOverride}`);
            });

            const result = await AIService.callAIWithFallback('Test prompt');

            expect(result.text).toBe('Réponse rapide');
            expect(result.modelUsed).toBe('gemini-3.6-flash');
            // Albert 401 court-circuite albert-openweight-large et bascule directement sur Google ; retryOnTimeout=false
            expect(calls).toEqual([
                { model: 'albert-openweight-medium', retryOnTimeout: false },
                { model: 'gemini-4-hydrogen', retryOnTimeout: false },
                { model: 'gemini-3.6-flash', retryOnTimeout: false }
            ]);
        });

        it('should report a clear timeout error message when all fallback models time out', async () => {
            const { appState } = await import('../state/State.js');
            resetAllProviderKeys(appState);
            appState.currentAIModel = 'gemini-4-hydrogen';
            appState.googleApiKey = 'AIzaSy-valid-google-key';

            const timeoutErr = new Error('La requête a expiré (timeout 40s).');
            timeoutErr.name = 'TimeoutError';
            vi.spyOn(AIService, 'callAI').mockRejectedValue(timeoutErr);

            await expect(AIService.callAIWithFallback('Test prompt'))
                .rejects.toThrow('Délai dépassé (3 modèles testés). Le serveur IA met trop de temps à répondre, réessayez.');
        });

        it('should reject truncated JSON responses on class-synthesis and automatically fallback to the next model', async () => {
            const { appState } = await import('../state/State.js');
            resetAllProviderKeys(appState);
            appState.currentAIModel = 'albert-openweight-large';
            appState.albertApiKey = 'sk-albert-valid-key';
            appState.googleApiKey = 'AIzaSy-valid-google-key';

            const truncatedJson = '{ "synthesis": "Au terme de l\'année scolaire, la classe affiche une dynamique positive. La majorité des élèves témoigne d';
            const validJson = JSON.stringify({
                synthesis: 'Classe dynamique en progrès constants.',
                strengths: ['Participation active'],
                vigilances: [],
                recommendations: ['Poursuivre les ateliers méthodologiques']
            });

            global.fetch = vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        choices: [{
                            finish_reason: 'length',
                            message: { content: truncatedJson }
                        }]
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({
                        choices: [{
                            finish_reason: 'stop',
                            message: { content: validJson }
                        }]
                    })
                });

            const res = await AIService.callAIWithFallback('Prompt classe', { taskType: 'class-synthesis' });
            expect(res.text).toBe(validJson);
            expect(res.modelUsed).toBe('albert-openweight-medium');
            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should emit AI_GENERATION_END with aborted/hasError flags matching outcome', async () => {
            const { appState } = await import('../state/State.js');
            resetAllProviderKeys(appState);
            appState.currentAIModel = 'gemini-3.6-flash';
            appState.googleApiKey = 'AIzaSy-valid-google-key';
            appState.enableApiFallback = false;

            const events = [];
            const off = bus.on(EVENTS.AI_GENERATION_END, (detail) => events.push(detail));

            try {
                // 1. Aborted
                const ctrl = new AbortController();
                ctrl.abort();
                await expect(AIService.callAIWithFallback('Test', { signal: ctrl.signal })).rejects.toThrow();

                // 2. Failed (truncated JSON without fallback)
                vi.spyOn(AIService, 'callAI').mockRejectedValueOnce(Object.assign(new Error('Réponse IA tronquée'), { name: 'TruncatedResponseError' }));
                await expect(AIService.callAIWithFallback('Test', { taskType: 'class-synthesis' })).rejects.toThrow(/tronquée/i);

                // 3. Success
                vi.spyOn(AIService, 'callAI').mockResolvedValueOnce({ text: 'OK', usage: null });
                await AIService.callAIWithFallback('Test');

                expect(events).toHaveLength(3);
                expect(events[0]).toMatchObject({ aborted: true, hasError: false });
                expect(events[1]).toMatchObject({ aborted: false, hasError: true });
                expect(events[2]).toMatchObject({ aborted: false, hasError: false });
            } finally {
                off();
                appState.enableApiFallback = true;
            }
        });
    });
});

