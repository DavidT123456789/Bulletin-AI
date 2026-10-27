/**
 * @module config/providers
 * @description Ré-exports de compatibilité depuis la source unique de vérité `aiRegistry.js`.
 */

export {
    AI_PROVIDERS,
    OLLAMA_CONFIG,
    PROVIDER_CONFIG,
    PROVIDER_IDS,
    API_KEY_PROVIDER_IDS,
    FALLBACK_PROVIDER_ORDER,
    isValidKeyFormat,
    getProviderApiKey,
    hasValidApiKey,
    getConfiguredProviders,
    getProviderConfig
} from './aiRegistry.js';
