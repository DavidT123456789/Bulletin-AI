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
    MODEL_SELECTOR_CONFIG
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

        it('should prioritize generous free providers in providerOrder', () => {
            expect(FALLBACK_CONFIG.providerOrder[0]).toBe('mistral');
            expect(FALLBACK_CONFIG.providerOrder[1]).toBe('google');
            expect(FALLBACK_CONFIG.providerOrder[2]).toBe('openrouter');
        });
    });

    describe('PROVIDER_DEFAULT_MODELS', () => {
        it('should map each provider to its primary recommended model', () => {
            expect(PROVIDER_DEFAULT_MODELS.mistral).toBe('mistral-direct-small-latest');
            expect(PROVIDER_DEFAULT_MODELS.google).toBe('gemini-3.5-flash');
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
            // Next provider should be mistral (since mistral is first in providerOrder)
            expect(queue[3]).toBe('mistral-direct-small-latest');
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
});
