/**
 * @fileoverview Tests unitaires pour la configuration et helpers des modèles IA.
 * @module config/models.test
 */

import { describe, it, expect } from 'vitest';
import {
    getProviderForModel,
    buildFallbackQueue,
    FALLBACK_CONFIG,
    PROVIDER_DEFAULT_MODELS,
    MODEL_SHORT_NAMES,
    MODEL_SELECTOR_CONFIG,
    getApiModelName
} from './models.js';

describe('models.js configuration & helpers', () => {
    describe('getProviderForModel()', () => {
        it('should correctly identify mistral direct models', () => {
            expect(getProviderForModel('mistral-direct-small-latest')).toBe('mistral');
            expect(getProviderForModel('mistral-direct-large-latest')).toBe('mistral');
        });

        it('should correctly identify google gemini models', () => {
            expect(getProviderForModel('gemini-3.5-flash')).toBe('google');
            expect(getProviderForModel('gemini-3.8-flash')).toBe('google');
            expect(getProviderForModel('gemini-3.1-pro-preview')).toBe('google');
        });

        it('should correctly identify groq models', () => {
            expect(getProviderForModel('groq-llama-3.3-70b')).toBe('groq');
            expect(getProviderForModel('groq-gemma-2-9b')).toBe('groq');
            expect(getProviderForModel('groq-llama-3.1-8b')).toBe('groq');
        });

        it('should correctly identify openai models', () => {
            expect(getProviderForModel('openai-o3-mini')).toBe('openai');
            expect(getProviderForModel('openai-gpt-4o-mini')).toBe('openai');
        });

        it('should correctly identify anthropic models', () => {
            expect(getProviderForModel('anthropic-claude-sonnet-5')).toBe('anthropic');
            expect(getProviderForModel('anthropic-claude-3-7-sonnet-latest')).toBe('anthropic');
        });

        it('should correctly identify ollama local models', () => {
            expect(getProviderForModel('ollama-qwen2.5:7b')).toBe('ollama');
            expect(getProviderForModel('ollama-mistral:7b')).toBe('ollama');
        });

        it('should route -free and openrouter-hosted models to openrouter', () => {
            expect(getProviderForModel('llama-3.3-70b-free')).toBe('openrouter');
            expect(getProviderForModel('claude-sonnet-5')).toBe('openrouter');
            expect(getProviderForModel('openrouter')).toBe('openrouter');
            expect(getProviderForModel('deepseek-r1')).toBe('openrouter');
            expect(getProviderForModel('ministral-3b')).toBe('openrouter');
            expect(getProviderForModel('mistral-small')).toBe('openrouter');
        });

        it('should default to openrouter when model is undefined or null', () => {
            expect(getProviderForModel(null)).toBe('openrouter');
            expect(getProviderForModel(undefined)).toBe('openrouter');
        });
    });

    describe('FALLBACK_CONFIG derived from MODEL_SELECTOR_CONFIG', () => {
        it('should contain only models that exist in MODEL_SELECTOR_CONFIG', () => {
            const allSelectorModelIds = MODEL_SELECTOR_CONFIG.flatMap(g => g.models.map(m => m.id));

            Object.entries(FALLBACK_CONFIG).forEach(([provider, models]) => {
                if (provider === 'providerOrder') return;
                models.forEach(modelId => {
                    expect(allSelectorModelIds).toContain(modelId);
                });
            });
        });

        it('should NOT contain deprecated or unlisted models in google', () => {
            expect(FALLBACK_CONFIG.google).not.toContain('gemini-3.7-flash');
            expect(FALLBACK_CONFIG.google).not.toContain('gemini-2.5-flash');
            expect(FALLBACK_CONFIG.google).not.toContain('gemini-2.5-pro');
            expect(FALLBACK_CONFIG.google).toEqual([
                'gemini-3.5-flash',
                'gemini-3.8-flash',
                'gemini-3.1-pro-preview'
            ]);
        });

        it('should correctly configure groq fallback models', () => {
            expect(FALLBACK_CONFIG.groq).toEqual([
                'groq-llama-3.3-70b',
                'groq-llama-3.1-8b'
            ]);
        });

        it('should prioritize generous free providers in providerOrder', () => {
            expect(FALLBACK_CONFIG.providerOrder[0]).toBe('google');
            expect(FALLBACK_CONFIG.providerOrder[1]).toBe('groq');
            expect(FALLBACK_CONFIG.providerOrder[2]).toBe('openrouter');
            expect(FALLBACK_CONFIG.providerOrder[3]).toBe('mistral');
        });
    });

    describe('PROVIDER_DEFAULT_MODELS', () => {
        it('should map each provider to its primary recommended model', () => {
            expect(PROVIDER_DEFAULT_MODELS.google).toBe('gemini-3.5-flash');
            expect(PROVIDER_DEFAULT_MODELS.groq).toBe('groq-llama-3.3-70b');
            expect(PROVIDER_DEFAULT_MODELS.mistral).toBe('mistral-direct-small-latest');
            expect(PROVIDER_DEFAULT_MODELS.openrouter).toBe('llama-3.3-70b-free');
            expect(PROVIDER_DEFAULT_MODELS.openai).toBe('openai-o3-mini');
            expect(PROVIDER_DEFAULT_MODELS.anthropic).toBe('anthropic-claude-sonnet-5');
            expect(PROVIDER_DEFAULT_MODELS.ollama).toBe('ollama-qwen2.5:7b');
        });
    });

    describe('buildFallbackQueue()', () => {
        it('should place current active model first', () => {
            const queue = buildFallbackQueue('gemini-3.8-flash');
            expect(queue[0]).toBe('gemini-3.8-flash');
        });

        it('should prioritize other models from the same provider before switching providers', () => {
            const queue = buildFallbackQueue('gemini-3.8-flash');
            expect(queue[1]).toBe('gemini-3.5-flash');
            expect(queue[2]).toBe('gemini-3.1-pro-preview');
            // Next provider should be groq (since groq is next in providerOrder after google)
            expect(queue[3]).toBe('groq-llama-3.3-70b');
        });

        it('should contain no duplicates', () => {
            const queue = buildFallbackQueue('mistral-direct-small-latest');
            const uniqueQueue = [...new Set(queue)];
            expect(queue.length).toBe(uniqueQueue.length);
        });

        it('should handle undefined model gracefully', () => {
            const queue = buildFallbackQueue(undefined);
            expect(Array.isArray(queue)).toBe(true);
            expect(queue.length).toBeGreaterThan(0);
        });
    });

    describe('MODEL_SHORT_NAMES display clarity', () => {
        it('should distinguish OpenRouter models from direct API models to avoid duplicates', () => {
            expect(MODEL_SHORT_NAMES['mistral-direct-small-latest']).toBe('Mistral Small');
            expect(MODEL_SHORT_NAMES['mistral-small']).toBe('Mistral Small (OR)');
            expect(MODEL_SHORT_NAMES['mistral-direct-large-latest']).toBe('Mistral Large');
            expect(MODEL_SHORT_NAMES['mistral-large']).toBe('Mistral Large (OR)');
            expect(MODEL_SHORT_NAMES['anthropic-claude-sonnet-5']).toBe('Claude Sonnet 5');
            expect(MODEL_SHORT_NAMES['claude-sonnet-5']).toBe('Claude Sonnet 5 (OR)');
        });
    });

    describe('getApiModelName()', () => {
        it('should map Groq models to their technical API model names', () => {
            expect(getApiModelName('groq-llama-3.3-70b')).toBe('llama-3.3-70b-versatile');
            expect(getApiModelName('groq-gemma-2-9b')).toBe('llama-3.1-8b-instant');
            expect(getApiModelName('groq-llama-3.1-8b')).toBe('llama-3.1-8b-instant');
        });

        it('should map OpenRouter models to their technical API model names', () => {
            expect(getApiModelName('openrouter')).toBe('deepseek/deepseek-chat');
            expect(getApiModelName('deepseek-r1')).toBe('deepseek/deepseek-r1');
            expect(getApiModelName('claude-sonnet-5')).toBe('anthropic/claude-sonnet-5');
            expect(getApiModelName('llama-3.3-70b-free')).toBe('meta-llama/llama-3.3-70b-instruct:free');
            expect(getApiModelName('ministral-3b')).toBe('mistralai/ministral-3b-2512');
        });

        it('should strip prefixes for direct providers', () => {
            expect(getApiModelName('openai-o3-mini')).toBe('o3-mini');
            expect(getApiModelName('mistral-direct-small-latest')).toBe('mistral-small-latest');
            expect(getApiModelName('anthropic-claude-sonnet-5')).toBe('claude-sonnet-5');
            expect(getApiModelName('ollama-qwen2.5:7b')).toBe('qwen2.5:7b');
        });

        it('should preserve model name if already in target format', () => {
            expect(getApiModelName('gemini-3.5-flash')).toBe('gemini-3.5-flash');
        });

        it('should return default model if model is null or undefined', () => {
            expect(getApiModelName(null)).toBe('deepseek/deepseek-chat');
            expect(getApiModelName(undefined)).toBe('deepseek/deepseek-chat');
        });
    });
});

