import { describe, it, expect, vi } from 'vitest';
import {
    AI_PROVIDERS,
    PROVIDER_CONFIG,
    PROVIDER_IDS,
    API_KEY_PROVIDER_IDS,
    OLLAMA_CONFIG,
    AI_MODELS,
    MODEL_SELECTOR_CONFIG,
    COSTS_PER_MILLION_TOKENS,
    MODEL_SHORT_NAMES,
    API_MODEL_MAPPINGS,
    FALLBACK_CONFIG,
    PROVIDER_DEFAULT_MODELS,
    PROVIDER_SHOWCASE_MODELS,
    LEGACY_MODEL_MIGRATIONS,
    migrateLegacyModelId,
    getModelMeta,
    getProviderForModel,
    getApiModelName,
    getModelTimeout,
    buildFallbackQueue
} from './aiRegistry.js';
import { appState } from '../state/State.js';
import { AppreciationsManager } from '../managers/AppreciationsManager.js';

describe('aiRegistry (SSOT Fournisseurs & Modèles IA)', () => {
    it('unifie les 8 fournisseurs IA avec leurs métadonnées et endpoints de base', () => {
        expect(PROVIDER_IDS).toEqual([
            'google',
            'albert',
            'groq',
            'openrouter',
            'mistral',
            'openai',
            'anthropic',
            'ollama'
        ]);
        expect(PROVIDER_CONFIG).toBe(AI_PROVIDERS);
        expect(API_KEY_PROVIDER_IDS).toHaveLength(7);
        expect(API_KEY_PROVIDER_IDS).not.toContain('ollama');

        PROVIDER_IDS.forEach(id => {
            const p = AI_PROVIDERS[id];
            expect(p.id).toBe(id);
            expect(p.name).toBeTruthy();
            expect(p.shortLabel).toBeTruthy();
            expect(p.apiBaseUrl).toMatch(/^https?:\/\//);
        });
    });

    it('expose les 30 modèles actifs du sélecteur et les 17 alias de rétrocompatibilité', () => {
        const selectorModels = MODEL_SELECTOR_CONFIG.flatMap(g => g.models);
        expect(selectorModels).toHaveLength(30);

        const allModelIds = Object.keys(AI_MODELS);
        expect(allModelIds).toHaveLength(47);

        selectorModels.forEach(({ id, qualifier }) => {
            const meta = getModelMeta(id);
            expect(meta).not.toBeNull();
            expect(meta.inSelector).toBe(true);
            expect(meta.qualifier).toBe(qualifier);
            expect(COSTS_PER_MILLION_TOKENS[id]).toBeDefined();
            expect(MODEL_SHORT_NAMES[id]).toBeTruthy();
        });

        expect(getModelMeta(null)).toBeNull();
        expect(getModelMeta('unknown-model')).toBeNull();
    });

    it('identifie correctement les modèles Groq (y compris meta-llama/* et openai/gpt-oss-*) vs OpenRouter', () => {
        expect(getProviderForModel('groq-gpt-oss-120b')).toBe('groq');
        expect(getProviderForModel('groq-gpt-oss-20b')).toBe('groq');
        expect(getProviderForModel('groq-llama-3.3-70b')).toBe('groq');
        expect(getProviderForModel('meta-llama/llama-4-scout-17b-16e-instruct')).toBe('groq');
        expect(getProviderForModel('openai/gpt-oss-120b')).toBe('groq');
        expect(getProviderForModel('llama-3.3-70b-versatile')).toBe('groq');

        // Modèles gratuits OpenRouter
        expect(getProviderForModel('llama-3.3-70b-free')).toBe('openrouter');
        expect(getProviderForModel('meta-llama/llama-3.3-70b-instruct:free')).toBe('openrouter');
    });

    it('calcule déclarativement les timeouts par catégorie de modèle via getModelTimeout()', () => {
        expect(getModelTimeout('ollama-qwen2.5:7b')).toBe(OLLAMA_CONFIG.timeoutMs);
        expect(getModelTimeout('gemini-3.8-flash')).toBe(40000);
        expect(getModelTimeout('gemini-4-hydrogen')).toBe(40000);
        expect(getModelTimeout('deepseek-r1')).toBe(40000);
        expect(getModelTimeout('openai-gpt-6.1-sol')).toBe(40000);
        expect(getModelTimeout('openai-gpt-6-luna')).toBe(30000);
        expect(getModelTimeout('groq-gpt-oss-120b')).toBe(40000);
        expect(getModelTimeout('groq-llama-3.3-70b')).toBe(40000);
        expect(getModelTimeout('groq-gemma-2-9b')).toBe(40000);
        expect(getModelTimeout('groq-llama-3.1-8b')).toBe(40000);
        expect(getModelTimeout('mistral-direct-large-latest')).toBe(30000);
        expect(getModelTimeout('mistral-large')).toBe(30000);
        expect(getModelTimeout('anthropic-claude-opus-5-5')).toBe(40000);
        expect(getModelTimeout('anthropic-claude-sonnet-5-5')).toBe(22000);
        expect(getModelTimeout('deepseek-v4-flash')).toBe(22000);
        expect(getModelTimeout(null, 120000, 22000)).toBe(22000);

        expect(OLLAMA_CONFIG.apiEndpoint).toBe('/api/chat');
        expect(getModelMeta('groq-llama-3.3-70b').isReasoning).toBe(true);
        expect(getModelMeta('openai-gpt-6-luna').supportsTemperature).toBe(false);
        expect(getModelMeta('deepseek-r1').supportsTemperature).toBe(false);
        expect(getModelMeta('anthropic-claude-opus-5-5').supportsTemperature).toBe(false);
    });

    it('maintient la cohérence de API_MODEL_MAPPINGS, FALLBACK_CONFIG, PROVIDER_DEFAULT_MODELS et PROVIDER_SHOWCASE_MODELS', () => {
        expect(getApiModelName('groq-gpt-oss-120b')).toBe('openai/gpt-oss-120b');
        expect(getApiModelName('openrouter')).toBe('deepseek/deepseek-chat');
        expect(getApiModelName('amazon-nova-v1-lite')).toBe('amazon/nova-lite-v1');
        expect(API_MODEL_MAPPINGS['claude-sonnet-5.5']).toBe('anthropic/claude-sonnet-5.5');
        expect(PROVIDER_DEFAULT_MODELS.google).toBe('gemini-4-hydrogen');
        expect(PROVIDER_DEFAULT_MODELS.openai).toBe('openai-gpt-6-luna');
        expect(PROVIDER_DEFAULT_MODELS.anthropic).toBe('anthropic-claude-sonnet-5-5');
        expect(PROVIDER_DEFAULT_MODELS.albert).toBe('albert-openweight-medium');
        expect(PROVIDER_SHOWCASE_MODELS.google).toEqual(['gemini-4-hydrogen', 'gemini-3.6-flash', 'gemini-3.8-flash']);
        expect(getModelMeta('gemini-3.8-flash').thinkingLevel).toBe('LOW');
        expect(getModelMeta('gemini-4-hydrogen').thinkingLevel).toBe('LOW');
        expect(getModelMeta('gemini-3.6-flash').thinkingLevel).toBeUndefined();
        expect(PROVIDER_SHOWCASE_MODELS.anthropic).toEqual(['anthropic-claude-sonnet-5-5', 'anthropic-claude-haiku-5-5', 'anthropic-claude-opus-5-5']);
        expect(PROVIDER_SHOWCASE_MODELS.openai).toEqual(['openai-gpt-6-luna', 'openai-gpt-6.1-terra', 'openai-gpt-6.1-sol']);
        expect(PROVIDER_SHOWCASE_MODELS.albert).toEqual(['albert-openweight-medium', 'albert-openweight-large']);
        expect(FALLBACK_CONFIG.albert).toEqual(['albert-openweight-medium', 'albert-openweight-large']);
        expect(PROVIDER_SHOWCASE_MODELS.groq).toEqual(['groq-gpt-oss-120b', 'groq-gpt-oss-20b']);
        expect(buildFallbackQueue('groq-gpt-oss-120b')[0]).toBe('groq-gpt-oss-120b');
        expect(FALLBACK_CONFIG.providerOrder).toHaveLength(8);
    });

    it('migre les anciens modèles obsolètes ou retirés vers des modèles actifs du sélecteur', () => {
        expect(migrateLegacyModelId('gemini-3.6-flash')).toBe('gemini-3.6-flash');
        expect(migrateLegacyModelId('gemini-4-argon')).toBe('gemini-4-hydrogen');
        expect(migrateLegacyModelId('anthropic-claude-3-7-sonnet-latest')).toBe('anthropic-claude-sonnet-5-5');
        expect(migrateLegacyModelId('anthropic-claude-3-5-haiku-latest')).toBe('anthropic-claude-haiku-5-5');
        expect(migrateLegacyModelId('openai-o3-mini')).toBe('openai-gpt-6.1-sol');
        expect(migrateLegacyModelId('openai-gpt-4o-mini')).toBe('openai-gpt-6-luna');
        expect(migrateLegacyModelId('groq-llama-3.3-70b')).toBe('groq-gpt-oss-120b');
        expect(migrateLegacyModelId('albert-openweight-small')).toBe('albert-openweight-medium');
        expect(migrateLegacyModelId('ollama-qwen3:8b')).toBe('ollama-qwen3:8b');
        expect(migrateLegacyModelId('ollama-qwen3:4b')).toBe('ollama-qwen3:4b');
        expect(migrateLegacyModelId('ollama-gemma3:4b')).toBe('ollama-gemma3:4b');
        expect(migrateLegacyModelId('gemini-4-hydrogen')).toBe('gemini-4-hydrogen');
        expect(migrateLegacyModelId(null)).toBeNull();
        expect(migrateLegacyModelId(undefined)).toBeUndefined();

        Object.values(LEGACY_MODEL_MIGRATIONS).forEach(targetId => {
            const meta = getModelMeta(targetId);
            expect(meta).not.toBeNull();
            expect(meta.inSelector).toBe(true);
        });
    });

    it('corrige le message de clé API manquante dans AppreciationsManager pour Groq, Google et Ollama', async () => {
        AppreciationsManager.init({}, { checkAPIKeyPresence: vi.fn().mockReturnValue(false) });

        appState.currentAIModel = 'groq-gpt-oss-120b';
        await expect(AppreciationsManager.generateAppreciation({ nom: 'Test', prenom: 'Eleve' }))
            .rejects.toThrow('Clé API Groq manquante. Veuillez la configurer dans les paramètres.');

        appState.currentAIModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
        await expect(AppreciationsManager.generateAppreciation({ nom: 'Test', prenom: 'Eleve' }))
            .rejects.toThrow('Clé API Groq manquante. Veuillez la configurer dans les paramètres.');

        appState.currentAIModel = 'gemini-3.8-flash';
        await expect(AppreciationsManager.generateAppreciation({ nom: 'Test', prenom: 'Eleve' }))
            .rejects.toThrow('Clé API Google manquante. Veuillez la configurer dans les paramètres.');

        appState.currentAIModel = 'ollama-qwen2.5:7b';
        await expect(AppreciationsManager.generateAppreciation({ nom: 'Test', prenom: 'Eleve' }))
            .rejects.toThrow('Ollama non activé. Activez-le dans les paramètres.');
    });
});
