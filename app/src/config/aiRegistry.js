/**
 * @fileoverview Source unique de vérité (SSOT) pour les 8 fournisseurs et l'ensemble des modèles IA :
 * métadonnées d'affichage, routage API, tarification, timeouts, sélecteur UI et chaînes de repli.
 * @module config/aiRegistry
 */

/**
 * Configuration Ollama
 */
export const OLLAMA_CONFIG = {
    defaultBaseUrl: 'http://localhost:11434',
    apiEndpoint: '/api/generate',
    timeoutMs: 120000,
};

/**
 * Registre unifié des 8 fournisseurs d'IA (Icônes, Noms, Classes CSS, Clés, Endpoints).
 */
export const AI_PROVIDERS = {
    google: {
        id: 'google',
        name: 'Google Gemini',
        shortLabel: 'Google',
        icon: 'logos:google-icon',
        class: 'provider-google',
        keyProperty: 'googleApiKey',
        domKey: 'googleApiKey',
        apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    },
    albert: {
        id: 'albert',
        name: 'Albert API (Gouv.fr)',
        shortLabel: 'Albert',
        icon: 'solar:shield-check-bold',
        class: 'provider-albert',
        keyProperty: 'albertApiKey',
        domKey: 'albertApiKey',
        apiBaseUrl: 'https://albert.api.etalab.gouv.fr/v1',
    },
    groq: {
        id: 'groq',
        name: 'Groq Cloud',
        shortLabel: 'Groq',
        icon: 'solar:bolt-circle-bold',
        class: 'provider-groq',
        keyProperty: 'groqApiKey',
        domKey: 'groqApiKey',
        apiBaseUrl: 'https://api.groq.com/openai/v1',
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        shortLabel: 'OpenRouter',
        icon: 'solar:bolt-bold-duotone',
        class: 'provider-openrouter',
        keyProperty: 'openrouterApiKey',
        domKey: 'openrouterApiKey',
        apiBaseUrl: 'https://openrouter.ai/api/v1',
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        shortLabel: 'OpenAI',
        icon: 'logos:openai-icon',
        class: 'provider-openai',
        keyProperty: 'openaiApiKey',
        domKey: 'openaiApiKey',
        apiBaseUrl: 'https://api.openai.com/v1',
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic Claude',
        shortLabel: 'Anthropic',
        icon: 'logos:anthropic-icon',
        class: 'provider-anthropic',
        keyProperty: 'anthropicApiKey',
        domKey: 'anthropicApiKey',
        apiBaseUrl: 'https://api.anthropic.com/v1',
    },
    mistral: {
        id: 'mistral',
        name: 'Mistral AI',
        shortLabel: 'Mistral',
        icon: 'solar:cat-bold',
        class: 'provider-mistral',
        keyProperty: 'mistralApiKey',
        domKey: 'mistralApiKey',
        apiBaseUrl: 'https://api.mistral.ai/v1',
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama',
        shortLabel: 'Ollama',
        icon: 'solar:server-square-bold',
        class: 'provider-ollama',
        keyProperty: null,
        domKey: null,
        apiBaseUrl: OLLAMA_CONFIG.defaultBaseUrl,
    }
};

export const PROVIDER_CONFIG = AI_PROVIDERS;

/** Liste ordonnée de tous les identifiants de fournisseurs */
export const PROVIDER_IDS = ['google', 'albert', 'groq', 'openrouter', 'mistral', 'openai', 'anthropic', 'ollama'];

/** Liste des fournisseurs nécessitant une clé API distante */
export const API_KEY_PROVIDER_IDS = ['google', 'albert', 'groq', 'openrouter', 'mistral', 'openai', 'anthropic'];

/** Ordre de priorité des fournisseurs pour le fallback automatique (souverain en tête) */
export const FALLBACK_PROVIDER_ORDER = ['albert', 'google', 'groq', 'openrouter', 'mistral', 'ollama', 'openai', 'anthropic'];

/**
 * Registre unifié des modèles IA (30 modèles actifs dans le sélecteur + 17 alias historiques).
 */
export const AI_MODELS = {
    // 1. GOOGLE GEMINI
    'gemini-4-hydrogen': {
        id: 'gemini-4-hydrogen',
        providerId: 'google',
        apiModelId: 'gemini-4-hydrogen',
        shortName: 'Gemini 4 Hydrogen',
        qualifier: 'Recommandé',
        selectorGroup: 'Google Gemini — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        thinkingLevel: 'MEDIUM',
        timeoutMs: 40000,
        costs: { input: 1.50, output: 7.50 },
    },
    'gemini-3.6-flash': {
        id: 'gemini-3.6-flash',
        providerId: 'google',
        apiModelId: 'gemini-3.6-flash',
        shortName: 'Gemini 3.6 Flash',
        qualifier: 'Rapide',
        selectorGroup: 'Google Gemini — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.75, output: 3.75 },
    },
    'gemini-3.8-flash': {
        id: 'gemini-3.8-flash',
        providerId: 'google',
        apiModelId: 'gemini-3.8-flash',
        shortName: 'Gemini 3.8 Flash',
        qualifier: 'Économique',
        selectorGroup: 'Google Gemini — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        thinkingLevel: 'LOW',
        timeoutMs: 40000,
        costs: { input: 0.75, output: 3.75 },
    },
    // Alias / legacy Google
    'gemini-4-argon': {
        id: 'gemini-4-argon',
        providerId: 'google',
        apiModelId: 'gemini-4-argon',
        shortName: 'Gemini 4 Argon',
        inSelector: false,
        isReasoning: true,
        thinkingLevel: 'MEDIUM',
        timeoutMs: 40000,
        costs: { input: 2.00, output: 10.00 },
    },
    'gemini-3.1-pro-preview': {
        id: 'gemini-3.1-pro-preview',
        providerId: 'google',
        apiModelId: 'gemini-3.1-pro-preview',
        shortName: 'Gemini 3.1 Pro',
        inSelector: false,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 2.00, output: 12.00 },
    },
    'gemini-3.5-flash': {
        id: 'gemini-3.5-flash',
        providerId: 'google',
        apiModelId: 'gemini-3.5-flash',
        shortName: 'Gemini 3.5 Flash',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
    },
    'gemini-3.7-flash': {
        id: 'gemini-3.7-flash',
        providerId: 'google',
        apiModelId: 'gemini-3.7-flash',
        shortName: 'Gemini 3.7 Flash',
        inSelector: false,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0.15, output: 0.60 },
    },
    'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        providerId: 'google',
        apiModelId: 'gemini-2.5-flash',
        shortName: 'Gemini 2.5 Flash',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
    },
    'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        providerId: 'google',
        apiModelId: 'gemini-2.5-pro',
        shortName: 'Gemini 2.5 Pro',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 30000,
        costs: { input: 1.25, output: 10.00 },
    },

    // 1b. ALBERT API (GOUV.FR / DINUM — OPENWEIGHT ALIASES)
    'albert-openweight-medium': {
        id: 'albert-openweight-medium',
        providerId: 'albert',
        apiModelId: 'openweight-medium',
        shortName: 'Mistral Small 3.2 24B',
        qualifier: 'Recommandé',
        selectorGroup: 'Albert API (Gouv.fr) — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 25000,
        costs: { input: 0, output: 0 },
    },
    'albert-openweight-large': {
        id: 'albert-openweight-large',
        providerId: 'albert',
        apiModelId: 'openweight-large',
        shortName: 'GPT-OSS 120B',
        qualifier: 'Synthèses',
        selectorGroup: 'Albert API (Gouv.fr) — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0, output: 0 },
    },
    // Alias rétrocompatible Albert
    'albert-openweight-small': {
        id: 'albert-openweight-small',
        providerId: 'albert',
        apiModelId: 'openweight-small',
        shortName: 'Ministral 3 8B',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 20000,
        costs: { input: 0, output: 0 },
    },

    // 2. GROQ CLOUD
    'groq-gpt-oss-120b': {
        id: 'groq-gpt-oss-120b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-120b',
        shortName: 'GPT-OSS 120B (Groq)',
        qualifier: 'Recommandé',
        selectorGroup: 'Groq Cloud — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0, output: 0 },
    },
    'groq-gpt-oss-20b': {
        id: 'groq-gpt-oss-20b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-20b',
        shortName: 'GPT-OSS 20B (Groq)',
        qualifier: 'Instantané',
        selectorGroup: 'Groq Cloud — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0, output: 0 },
    },
    // Alias rétrocompatibles Groq
    'groq-llama-3.3-70b': {
        id: 'groq-llama-3.3-70b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-120b',
        shortName: 'GPT-OSS 120B (Groq)',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0, output: 0 },
    },
    'groq-gemma-2-9b': {
        id: 'groq-gemma-2-9b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-20b',
        shortName: 'GPT-OSS 20B (Groq)',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0, output: 0 },
    },
    'groq-llama-3.1-8b': {
        id: 'groq-llama-3.1-8b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-20b',
        shortName: 'GPT-OSS 20B (Groq)',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0, output: 0 },
    },

    // 3. MISTRAL AI DIRECT
    'mistral-direct-small-latest': {
        id: 'mistral-direct-small-latest',
        providerId: 'mistral',
        apiModelId: 'mistral-small-latest',
        shortName: 'Mistral Small',
        qualifier: 'Recommandé',
        selectorGroup: 'Mistral AI — PAY-AS-YOU-GO',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
    },
    'mistral-direct-large-latest': {
        id: 'mistral-direct-large-latest',
        providerId: 'mistral',
        apiModelId: 'mistral-large-latest',
        shortName: 'Mistral Large',
        qualifier: 'Puissant',
        selectorGroup: 'Mistral AI — PAY-AS-YOU-GO',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.70, output: 2.10 },
    },

    // 4. OPENROUTER
    'llama-3.3-70b-free': {
        id: 'llama-3.3-70b-free',
        providerId: 'openrouter',
        apiModelId: 'meta-llama/llama-3.3-70b-instruct:free',
        shortName: 'Llama 3.3 70B',
        qualifier: 'Gratuit',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 0,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0, output: 0 },
    },

    // 5. OPENROUTER — PAYANT
    'claude-sonnet-5.5': {
        id: 'claude-sonnet-5.5',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-sonnet-5.5',
        shortName: 'Claude Sonnet 5.5 (OR)',
        qualifier: 'Recommandé',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 9,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 2.00, output: 10.00 },
    },
    'claude-haiku-5.5': {
        id: 'claude-haiku-5.5',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-haiku-5.5',
        shortName: 'Claude Haiku 5.5 (OR)',
        qualifier: 'Rapide',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 3,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.10, output: 0.50 },
    },
    'claude-opus-5.5': {
        id: 'claude-opus-5.5',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-opus-5.5',
        shortName: 'Claude Opus 5.5 (OR)',
        qualifier: 'Puissant',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        excludeFromFallback: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 4.00, output: 20.00 },
    },
    'deepseek-v4-flash': {
        id: 'deepseek-v4-flash',
        providerId: 'openrouter',
        apiModelId: 'deepseek/deepseek-v4-flash-latest',
        shortName: 'DeepSeek V4 Flash',
        qualifier: 'Économique',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 1,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.06, output: 0.30 },
    },
    'openrouter': {
        id: 'openrouter',
        providerId: 'openrouter',
        apiModelId: 'deepseek/deepseek-chat',
        shortName: 'DeepSeek V3',
        qualifier: 'Standard',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 4,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.25, output: 1.00 },
    },
    'deepseek-r1': {
        id: 'deepseek-r1',
        providerId: 'openrouter',
        apiModelId: 'deepseek/deepseek-r1',
        shortName: 'DeepSeek R1',
        qualifier: 'Raisonnement',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 8,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0.55, output: 2.19 },
    },
    'ministral-3b': {
        id: 'ministral-3b',
        providerId: 'openrouter',
        apiModelId: 'mistralai/ministral-3b-2512',
        shortName: 'Ministral 3 3B',
        qualifier: 'Économique',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 7,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.10, output: 0.10 },
    },
    'amazon-nova-v1-lite': {
        id: 'amazon-nova-v1-lite',
        providerId: 'openrouter',
        apiModelId: 'amazon/nova-lite-v1',
        shortName: 'Nova Lite',
        qualifier: 'Économique',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 6,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.06, output: 0.24 },
    },
    'mistral-small': {
        id: 'mistral-small',
        providerId: 'openrouter',
        apiModelId: 'mistralai/mistral-small-3.2-24b-instruct',
        shortName: 'Mistral Small (OR)',
        qualifier: 'Standard',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 2,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.08, output: 0.25 },
    },
    'mistral-large': {
        id: 'mistral-large',
        providerId: 'openrouter',
        apiModelId: 'mistralai/mistral-large-4-0',
        shortName: 'Mistral Large (OR)',
        qualifier: 'Puissant',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        fallbackRank: 5,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.70, output: 2.10 },
    },
    // Alias rétrocompatibles OpenRouter
    'claude-sonnet-5': {
        id: 'claude-sonnet-5',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-sonnet-5.5',
        shortName: 'Claude Sonnet 5 (OR)',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 3.00, output: 15.00 },
    },
    'claude-3.7-sonnet': {
        id: 'claude-3.7-sonnet',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-3.7-sonnet',
        shortName: 'Claude 3.7 Sonnet (OR)',
        inSelector: false,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 3.00, output: 15.00 },
    },
    'claude-3.5-sonnet': {
        id: 'claude-3.5-sonnet',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-3.5-sonnet',
        shortName: 'Claude 3.5 Sonnet (OR)',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 3.00, output: 15.00 },
    },

    // 6. OPENAI DIRECT
    'openai-gpt-6-luna': {
        id: 'openai-gpt-6-luna',
        providerId: 'openai',
        apiModelId: 'gpt-6-luna',
        shortName: 'GPT-6 Luna',
        qualifier: 'Recommandé',
        selectorGroup: 'OpenAI — PAYANT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 30000,
        costs: { input: 0.10, output: 0.50 },
    },
    'openai-gpt-6.1-terra': {
        id: 'openai-gpt-6.1-terra',
        providerId: 'openai',
        apiModelId: 'gpt-6.1-terra',
        shortName: 'GPT-6.1 Terra',
        qualifier: 'Rédaction',
        selectorGroup: 'OpenAI — PAYANT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 30000,
        costs: { input: 1.00, output: 5.00 },
    },
    'openai-gpt-6.1-sol': {
        id: 'openai-gpt-6.1-sol',
        providerId: 'openai',
        apiModelId: 'gpt-6.1-sol',
        shortName: 'GPT-6.1 Sol',
        qualifier: 'Raisonnement',
        selectorGroup: 'OpenAI — PAYANT',
        inSelector: true,
        isReasoning: true,
        excludeFromFallback: true,
        timeoutMs: 40000,
        costs: { input: 2.00, output: 10.00 },
    },
    // Alias rétrocompatibles OpenAI
    'openai-o3-mini': {
        id: 'openai-o3-mini',
        providerId: 'openai',
        apiModelId: 'o3-mini',
        shortName: 'o3 Mini',
        inSelector: false,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 1.10, output: 4.40 },
    },
    'openai-gpt-4o-mini': {
        id: 'openai-gpt-4o-mini',
        providerId: 'openai',
        apiModelId: 'gpt-4o-mini',
        shortName: 'GPT-4o Mini',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
    },

    // 7. ANTHROPIC CLAUDE DIRECT
    'anthropic-claude-sonnet-5-5': {
        id: 'anthropic-claude-sonnet-5-5',
        providerId: 'anthropic',
        apiModelId: 'claude-sonnet-5-5',
        shortName: 'Claude Sonnet 5.5',
        qualifier: 'Recommandé',
        selectorGroup: 'Anthropic Claude — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 2.00, output: 10.00 },
    },
    'anthropic-claude-haiku-5-5': {
        id: 'anthropic-claude-haiku-5-5',
        providerId: 'anthropic',
        apiModelId: 'claude-haiku-5-5',
        shortName: 'Claude Haiku 5.5',
        qualifier: 'Rapide',
        selectorGroup: 'Anthropic Claude — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.10, output: 0.50 },
    },
    'anthropic-claude-opus-5-5': {
        id: 'anthropic-claude-opus-5-5',
        providerId: 'anthropic',
        apiModelId: 'claude-opus-5-5',
        shortName: 'Claude Opus 5.5',
        qualifier: 'Puissant',
        selectorGroup: 'Anthropic Claude — PAYANT',
        inSelector: true,
        isReasoning: true,
        excludeFromFallback: true,
        timeoutMs: 30000,
        costs: { input: 4.00, output: 20.00 },
    },
    // Alias rétrocompatibles Anthropic
    'anthropic-claude-sonnet-5': {
        id: 'anthropic-claude-sonnet-5',
        providerId: 'anthropic',
        apiModelId: 'claude-sonnet-5',
        shortName: 'Claude Sonnet 5',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 3.00, output: 15.00 },
    },
    'anthropic-claude-opus-5': {
        id: 'anthropic-claude-opus-5',
        providerId: 'anthropic',
        apiModelId: 'claude-opus-5',
        shortName: 'Claude Opus 5',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 30000,
        costs: { input: 5.00, output: 25.00 },
    },

    // 8. OLLAMA LOCAL
    'ollama-qwen2.5:7b': {
        id: 'ollama-qwen2.5:7b',
        providerId: 'ollama',
        apiModelId: 'qwen2.5:7b',
        shortName: 'Qwen 2.5 7B',
        qualifier: 'Recommandé',
        selectorGroup: 'Ollama — LOCAL',
        inSelector: true,
        isReasoning: false,
        timeoutMs: OLLAMA_CONFIG.timeoutMs,
        costs: { input: 0, output: 0 },
    },
    'ollama-mistral:7b': {
        id: 'ollama-mistral:7b',
        providerId: 'ollama',
        apiModelId: 'mistral:7b',
        shortName: 'Mistral 7B',
        qualifier: 'Standard',
        selectorGroup: 'Ollama — LOCAL',
        inSelector: true,
        isReasoning: false,
        timeoutMs: OLLAMA_CONFIG.timeoutMs,
        costs: { input: 0, output: 0 },
    },
    'ollama-deepseek-r1:8b': {
        id: 'ollama-deepseek-r1:8b',
        providerId: 'ollama',
        apiModelId: 'deepseek-r1:8b',
        shortName: 'DeepSeek R1',
        qualifier: 'Raisonnement',
        selectorGroup: 'Ollama — LOCAL',
        inSelector: true,
        isReasoning: true,
        timeoutMs: OLLAMA_CONFIG.timeoutMs,
        costs: { input: 0, output: 0 },
    },
    'ollama-gemma2:9b': {
        id: 'ollama-gemma2:9b',
        providerId: 'ollama',
        apiModelId: 'gemma2:9b',
        shortName: 'Gemma 2 9B',
        qualifier: 'Standard',
        selectorGroup: 'Ollama — LOCAL',
        inSelector: true,
        isReasoning: false,
        timeoutMs: OLLAMA_CONFIG.timeoutMs,
        costs: { input: 0, output: 0 },
    }
};

const SELECTOR_GROUP_ORDER = [
    'Albert API (Gouv.fr) — QUOTA GRATUIT',
    'Google Gemini — QUOTA GRATUIT',
    'Groq Cloud — QUOTA GRATUIT',
    'Mistral AI — PAY-AS-YOU-GO',
    'OpenRouter — PAYANT',
    'OpenAI — PAYANT',
    'Anthropic Claude — PAYANT',
    'Ollama — LOCAL'
];

export const COSTS_PER_MILLION_TOKENS = Object.fromEntries(
    Object.entries(AI_MODELS)
        .filter(([, m]) => m.costs)
        .map(([id, m]) => [id, m.costs])
);

export const MODEL_SHORT_NAMES = Object.fromEntries(
    Object.entries(AI_MODELS)
        .filter(([, m]) => m.shortName)
        .map(([id, m]) => [id, m.shortName])
);

export const API_MODEL_MAPPINGS = Object.fromEntries(
    Object.entries(AI_MODELS)
        .filter(([, m]) => m.providerId === 'openrouter' || m.providerId === 'groq' || m.providerId === 'albert')
        .map(([id, m]) => [id, m.apiModelId])
);

export const MODEL_SELECTOR_CONFIG = SELECTOR_GROUP_ORDER.map(label => ({
    label,
    models: Object.values(AI_MODELS)
        .filter(m => m.inSelector && m.selectorGroup === label)
        .map(m => ({ id: m.id, qualifier: m.qualifier }))
}));

/**
 * Retourne les métadonnées complètes d'un modèle depuis le registre.
 * @param {string} modelId
 * @returns {Object|null}
 */
export function getModelMeta(modelId) {
    if (!modelId) return null;
    return AI_MODELS[modelId] || null;
}

/**
 * Identifie le fournisseur associé à un identifiant de modèle (interne ou API direct).
 * @param {string} model - Identifiant du modèle
 * @returns {string} ID du fournisseur ('mistral'|'google'|'groq'|'openrouter'|'openai'|'anthropic'|'ollama')
 */
export function getProviderForModel(model) {
    if (!model) return 'openrouter';
    if (AI_MODELS[model]?.providerId) {
        return AI_MODELS[model].providerId;
    }
    if (model.startsWith('albert-') || model.startsWith('openweight-')) return 'albert';
    if (model.endsWith('-free') || model.endsWith(':free')) return 'openrouter';
    if (model.startsWith('mistral-direct')) return 'mistral';
    if (model.startsWith('gemini')) return 'google';
    if (
        model.startsWith('groq-') ||
        model.startsWith('meta-llama/') ||
        model.startsWith('openai/gpt-oss-') ||
        model === 'llama-3.3-70b-versatile' ||
        model === 'llama-3.1-8b-instant'
    ) {
        return 'groq';
    }
    if (model.startsWith('openai')) return 'openai';
    if (model.startsWith('anthropic')) return 'anthropic';
    if (model.startsWith('ollama')) return 'ollama';
    return 'openrouter';
}

export const FALLBACK_CONFIG = (() => {
    const config = {
        google: [],
        albert: [],
        groq: [],
        mistral: [],
        openrouter: [],
        ollama: [],
        openai: [],
        anthropic: [],
        providerOrder: [...FALLBACK_PROVIDER_ORDER]
    };

    MODEL_SELECTOR_CONFIG.forEach(group => {
        group.models.forEach(({ id }) => {
            if (AI_MODELS[id]?.excludeFromFallback) return;
            const provider = getProviderForModel(id);
            if (config[provider] && !config[provider].includes(id)) {
                config[provider].push(id);
            }
        });
    });

    config.openrouter.sort((a, b) => (AI_MODELS[a]?.fallbackRank ?? 99) - (AI_MODELS[b]?.fallbackRank ?? 99));

    return config;
})();

export const PROVIDER_DEFAULT_MODELS = {
    google: FALLBACK_CONFIG.google[0],
    albert: FALLBACK_CONFIG.albert[0],
    groq: FALLBACK_CONFIG.groq[0],
    mistral: FALLBACK_CONFIG.mistral[0],
    openai: FALLBACK_CONFIG.openai[0],
    openrouter: FALLBACK_CONFIG.openrouter[0],
    ollama: FALLBACK_CONFIG.ollama[0],
    anthropic: FALLBACK_CONFIG.anthropic[0],
};

export const PROVIDER_SHOWCASE_MODELS = {
    google: ['gemini-4-hydrogen', 'gemini-3.6-flash', 'gemini-3.8-flash'],
    albert: ['albert-openweight-medium', 'albert-openweight-large'],
    groq: ['groq-gpt-oss-120b', 'groq-gpt-oss-20b'],
    anthropic: ['anthropic-claude-sonnet-5-5', 'anthropic-claude-haiku-5-5', 'anthropic-claude-opus-5-5'],
    mistral: ['mistral-direct-small-latest', 'mistral-direct-large-latest'],
    openai: ['openai-gpt-6-luna', 'openai-gpt-6.1-terra', 'openai-gpt-6.1-sol'],
    openrouter: ['deepseek-v4-flash', 'claude-sonnet-5.5', 'llama-3.3-70b-free'],
    ollama: ['ollama-qwen2.5:7b', 'ollama-mistral:7b', 'ollama-deepseek-r1:8b'],
};

/**
 * Table de migration déclarative des identifiants de modèles obsolètes ou retirés.
 */
export const LEGACY_MODEL_MIGRATIONS = Object.freeze({
    'gemini-1.5-flash': 'gemini-4-hydrogen',
    'gemini-1.5-flash-001': 'gemini-4-hydrogen',
    'gemini-2.0-flash-lite': 'gemini-4-hydrogen',
    'gemini-2.5-flash': 'gemini-4-hydrogen',
    'gemini-3.1-flash': 'gemini-4-hydrogen',
    'gemini-3-flash-preview': 'gemini-4-hydrogen',
    'gemini-3.1-flash-lite-preview': 'gemini-4-hydrogen',
    'gemini-3.5-flash': 'gemini-4-hydrogen',
    'gemini-3-pro': 'gemini-4-hydrogen',
    'gemini-2.5-pro': 'gemini-4-hydrogen',
    'gemini-3.1-pro-preview': 'gemini-4-hydrogen',
    'gemini-4-argon': 'gemini-4-hydrogen',
    'anthropic-claude-3-5-sonnet-latest': 'anthropic-claude-sonnet-5-5',
    'anthropic-claude-3-7-sonnet-latest': 'anthropic-claude-sonnet-5-5',
    'anthropic-claude-3-5-haiku-latest': 'anthropic-claude-haiku-5-5',
    'anthropic-claude-sonnet-4.5': 'anthropic-claude-sonnet-5-5',
    'anthropic-claude-sonnet-4.6': 'anthropic-claude-sonnet-5-5',
    'anthropic-claude-sonnet-5': 'anthropic-claude-sonnet-5-5',
    'anthropic-claude-opus-4.5': 'anthropic-claude-opus-5-5',
    'anthropic-claude-opus-4.6': 'anthropic-claude-opus-5-5',
    'anthropic-claude-opus-5': 'anthropic-claude-opus-5-5',
    'claude-sonnet-4.6': 'claude-sonnet-5.5',
    'claude-sonnet-5': 'claude-sonnet-5.5',
    'claude-3.5-sonnet': 'claude-sonnet-5.5',
    'claude-3.7-sonnet': 'claude-sonnet-5.5',
    'devstral-free': 'llama-3.3-70b-free',
    'ollama-qwen3:8b': 'ollama-qwen2.5:7b',
    'ollama-qwen3:4b': 'ollama-qwen2.5:7b',
    'ollama-gemma3:4b': 'ollama-gemma2:9b',
    'ollama-mistral': 'ollama-mistral:7b',
    'openai-gpt-4o': 'openai-gpt-6-luna',
    'openai-gpt-3.5-turbo': 'openai-gpt-6-luna',
    'openai-gpt-4-turbo': 'openai-gpt-6-luna',
    'openai-gpt-4o-mini': 'openai-gpt-6-luna',
    'openai-o3-mini': 'openai-gpt-6.1-sol',
    'groq-llama-3.3-70b': 'groq-gpt-oss-120b',
    'groq-llama-3.1-8b': 'groq-gpt-oss-20b',
    'groq-gemma-2-9b': 'groq-gpt-oss-20b',
    'albert-openweight-small': 'albert-openweight-medium',
});

/**
 * Migre un identifiant de modèle obsolète vers son successeur actuel si applicable.
 * @param {string|null|undefined} modelId
 * @returns {string|null|undefined}
 */
export function migrateLegacyModelId(modelId) {
    if (!modelId || typeof modelId !== 'string') return modelId;
    return LEGACY_MODEL_MIGRATIONS[modelId] || modelId;
}

/**
 * Construit la file ordonnée de fallback pour un modèle donné.
 * @param {string} currentModel - Identifiant du modèle actif
 * @returns {string[]} File ordonnée d'identifiants de modèles
 */
export function buildFallbackQueue(currentModel) {
    const currentProvider = getProviderForModel(currentModel);
    const queue = currentModel ? [currentModel] : [];

    const sameProviderModels = FALLBACK_CONFIG[currentProvider] ?? [];
    sameProviderModels.forEach(m => {
        if (m !== currentModel && !queue.includes(m)) {
            queue.push(m);
        }
    });

    FALLBACK_CONFIG.providerOrder.forEach(provider => {
        if (provider !== currentProvider) {
            const providerModels = FALLBACK_CONFIG[provider] ?? [];
            providerModels.forEach(m => {
                if (!queue.includes(m)) {
                    queue.push(m);
                }
            });
        }
    });

    return queue;
}

/**
 * Résout le nom technique du modèle attendu par l'API du fournisseur.
 * @param {string} model - Identifiant applicatif du modèle
 * @returns {string} Identifiant technique du modèle pour l'API
 */
export function getApiModelName(model) {
    if (!model) return 'deepseek/deepseek-chat';
    if (AI_MODELS[model]?.apiModelId) return AI_MODELS[model].apiModelId;
    if (model.startsWith('openai-')) return model.replace('openai-', '');
    if (model.startsWith('mistral-direct-')) return model.replace('mistral-direct-', 'mistral-');
    if (model.startsWith('anthropic-')) return model.replace('anthropic-', '');
    if (model.startsWith('ollama-')) return model.replace('ollama-', '');
    return model;
}

/**
 * Calcule le timeout approprié selon les métadonnées ou le type de modèle.
 * @param {string} model - Nom du modèle
 * @param {number} [ollamaTimeoutMs=OLLAMA_CONFIG.timeoutMs]
 * @param {number} [defaultTimeoutMs=22000]
 * @returns {number} Timeout en ms
 */
export function getModelTimeout(model, ollamaTimeoutMs = OLLAMA_CONFIG.timeoutMs, defaultTimeoutMs = 22000) {
    const m = model || '';
    if (!m) return defaultTimeoutMs;
    const meta = AI_MODELS[m];
    if (meta) {
        if (meta.providerId === 'ollama') return ollamaTimeoutMs;
        if (meta.timeoutMs && meta.timeoutMs !== 22000) return meta.timeoutMs;
        if (meta.isReasoning) return 40000;
        return defaultTimeoutMs;
    }
    if (m.startsWith('ollama')) return ollamaTimeoutMs;
    const isReasoningModel = m.includes('3.7') || m.includes('3.8') || m.includes('gemini-4') || m.includes('3.1-pro') || m.includes('r1') || m.includes('o3') || m.includes('gpt-6') || m.includes('gpt-oss');
    if (isReasoningModel) return 40000;
    if (m.includes('pro') || m.includes('opus')) return 30000;
    return defaultTimeoutMs;
}

/**
 * Valide le format minimal d'une clé API.
 * @param {string|null|undefined} key - La clé à tester
 * @returns {boolean}
 */
export function isValidKeyFormat(key) {
    return typeof key === 'string' && key.trim().length > 5;
}

/**
 * Récupère la clé API configurée pour un fournisseur donné depuis le DOM ou l'état.
 * @param {string} providerId - Identifiant du fournisseur
 * @param {Object} [deps] - Dépendances d'état et DOM
 * @returns {string} La clé API nettoyée ou une chaîne vide
 */
export function getProviderApiKey(providerId, { state, dom } = {}) {
    const config = PROVIDER_CONFIG[providerId];
    if (!config?.keyProperty) return '';

    if (dom && config.domKey && dom[config.domKey]?.value !== undefined) {
        const domVal = dom[config.domKey].value.trim();
        if (domVal || (typeof document !== 'undefined' && document.activeElement === dom[config.domKey])) {
            return domVal;
        }
    }

    return (state && state[config.keyProperty]) ? state[config.keyProperty].trim() : '';
}

/**
 * Vérifie si un fournisseur est fonctionnel (clé API valide ou Ollama activé).
 * @param {string} providerId - Identifiant du fournisseur
 * @param {Object} [deps] - Dépendances d'état et DOM
 * @returns {boolean}
 */
export function hasValidApiKey(providerId, deps = {}) {
    if (providerId === 'ollama') {
        return deps.state ? deps.state.ollamaEnabled === true : false;
    }
    const key = getProviderApiKey(providerId, deps);
    return isValidKeyFormat(key);
}

/**
 * Retourne la liste des fournisseurs qui ont une clé API configurée.
 * @param {Object} [deps] - Dépendances d'état et DOM
 * @returns {Array<{ id: string, name: string, key: string }>}
 */
export function getConfiguredProviders(deps = {}) {
    return API_KEY_PROVIDER_IDS
        .map(id => ({
            id,
            name: PROVIDER_CONFIG[id]?.name || id,
            key: getProviderApiKey(id, deps)
        }))
        .filter(p => isValidKeyFormat(p.key));
}

/**
 * Retourne la configuration d'un provider à partir de son ID ou d'un pattern de nom.
 * @param {string} key - ID (ex: 'google') ou Nom (ex: 'Google Gemini')
 * @returns {Object|null} La config du provider ou null
 */
export function getProviderConfig(key) {
    if (!key) return null;
    const lowerKey = key.toLowerCase();

    if (PROVIDER_CONFIG[lowerKey]) {
        return PROVIDER_CONFIG[lowerKey];
    }

    for (const provider of Object.values(PROVIDER_CONFIG)) {
        const provName = provider.name.toLowerCase();
        if (provName.includes(lowerKey) || lowerKey.includes(provider.id) || lowerKey.includes(provName)) {
            return provider;
        }
    }

    return null;
}
