/**
 * @fileoverview Tests unitaires pour providers.js
 * @module config/providers.test
 */

import { describe, it, expect } from 'vitest';
import {
    PROVIDER_CONFIG,
    PROVIDER_IDS,
    API_KEY_PROVIDER_IDS,
    isValidKeyFormat,
    getProviderApiKey,
    hasValidApiKey,
    getConfiguredProviders,
    getProviderConfig
} from './providers.js';

describe('providers.js configuration and helpers', () => {
    describe('PROVIDER_CONFIG and lists', () => {
        it('should define all expected providers', () => {
            expect(PROVIDER_IDS).toContain('google');
            expect(PROVIDER_IDS).toContain('groq');
            expect(PROVIDER_IDS).toContain('openrouter');
            expect(PROVIDER_IDS).toContain('mistral');
            expect(PROVIDER_IDS).toContain('openai');
            expect(PROVIDER_IDS).toContain('anthropic');
            expect(PROVIDER_IDS).toContain('ollama');
        });

        it('should exclude ollama from API_KEY_PROVIDER_IDS', () => {
            expect(API_KEY_PROVIDER_IDS).not.toContain('ollama');
            expect(API_KEY_PROVIDER_IDS).toContain('google');
            expect(API_KEY_PROVIDER_IDS).toContain('groq');
        });

        it('should have keyProperty and domKey for remote API providers', () => {
            API_KEY_PROVIDER_IDS.forEach(id => {
                const config = PROVIDER_CONFIG[id];
                expect(config).toBeDefined();
                expect(config.keyProperty).toBe(`${id}ApiKey`);
                expect(config.domKey).toBe(`${id}ApiKey`);
            });
        });
    });

    describe('isValidKeyFormat()', () => {
        it('should return true for keys longer than 5 chars', () => {
            expect(isValidKeyFormat('gsk_1234567890')).toBe(true);
            expect(isValidKeyFormat('AIzaSyABCDEF123456')).toBe(true);
        });

        it('should return false for empty, short, or invalid keys', () => {
            expect(isValidKeyFormat('')).toBe(false);
            expect(isValidKeyFormat('12345')).toBe(false);
            expect(isValidKeyFormat('   ')).toBe(false);
            expect(isValidKeyFormat(null)).toBe(false);
            expect(isValidKeyFormat(undefined)).toBe(false);
        });
    });

    describe('getProviderApiKey()', () => {
        it('should retrieve key from state when DOM is not provided', () => {
            const mockState = { groqApiKey: 'gsk_test_key_12345' };
            expect(getProviderApiKey('groq', { state: mockState })).toBe('gsk_test_key_12345');
        });

        it('should prioritize DOM value if present', () => {
            const mockState = { groqApiKey: 'gsk_old_key' };
            const mockDom = { groqApiKey: { value: '  gsk_new_typed_key  ' } };
            expect(getProviderApiKey('groq', { state: mockState, dom: mockDom })).toBe('gsk_new_typed_key');
        });

        it('should return empty string for ollama or invalid provider', () => {
            expect(getProviderApiKey('ollama')).toBe('');
            expect(getProviderApiKey('unknown')).toBe('');
        });
    });

    describe('hasValidApiKey()', () => {
        it('should check ollamaEnabled for ollama', () => {
            expect(hasValidApiKey('ollama', { state: { ollamaEnabled: true } })).toBe(true);
            expect(hasValidApiKey('ollama', { state: { ollamaEnabled: false } })).toBe(false);
        });

        it('should validate API key existence and length for remote providers', () => {
            const state = {
                googleApiKey: 'AIzaSyValidKey',
                groqApiKey: 'short'
            };
            expect(hasValidApiKey('google', { state })).toBe(true);
            expect(hasValidApiKey('groq', { state })).toBe(false);
            expect(hasValidApiKey('mistral', { state })).toBe(false);
        });
    });

    describe('getConfiguredProviders()', () => {
        it('should filter only providers with valid keys', () => {
            const state = {
                googleApiKey: 'AIzaSyGoogle123',
                groqApiKey: 'gsk_Groq12345',
                openaiApiKey: 'short',
                anthropicApiKey: ''
            };
            const configured = getConfiguredProviders({ state });
            const ids = configured.map(p => p.id);

            expect(ids).toContain('google');
            expect(ids).toContain('groq');
            expect(ids).not.toContain('openai');
            expect(ids).not.toContain('anthropic');
        });
    });

    describe('getProviderConfig()', () => {
        it('should find provider by exact id', () => {
            expect(getProviderConfig('groq')?.name).toBe('Groq Cloud');
            expect(getProviderConfig('google')?.name).toBe('Google Gemini');
        });

        it('should find provider by case-insensitive name pattern', () => {
            expect(getProviderConfig('Groq Cloud')?.id).toBe('groq');
            expect(getProviderConfig('gemini')?.id).toBe('google');
            expect(getProviderConfig('Mistral')?.id).toBe('mistral');
        });

        it('should return null for null, undefined or unknown string', () => {
            expect(getProviderConfig(null)).toBeNull();
            expect(getProviderConfig('')).toBeNull();
            expect(getProviderConfig('completely_unknown')).toBeNull();
        });
    });
});
