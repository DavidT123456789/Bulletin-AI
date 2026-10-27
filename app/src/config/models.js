/**
 * @module config/models
 * @description Ré-exports de compatibilité depuis la source unique de vérité `aiRegistry.js`.
 */

export {
    AI_MODELS,
    OLLAMA_CONFIG,
    COSTS_PER_MILLION_TOKENS,
    MODEL_DESCRIPTIONS,
    MODEL_SHORT_NAMES,
    API_MODEL_MAPPINGS,
    MODEL_SELECTOR_CONFIG,
    FALLBACK_CONFIG,
    PROVIDER_DEFAULT_MODELS,
    PROVIDER_SHOWCASE_MODELS,
    getModelMeta,
    getProviderForModel,
    getApiModelName,
    getModelTimeout,
    buildFallbackQueue
} from './aiRegistry.js';
