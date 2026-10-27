import packageJson from '../../package.json';
import { AI_PROVIDERS, OLLAMA_CONFIG } from './aiRegistry.js';

export const RAW_APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : packageJson.version;
export const APP_VERSION = `${RAW_APP_VERSION} Beta`;

export const SCHEMA_VERSIONS = Object.freeze({
    LS_APP_STATE_KEY: 'appreciationGeneratorState_v6.2',
    LS_FIRST_VISIT_KEY: 'appreciationGeneratorFirstVisit_v8',
});

export const CONSTS = {
    INPUT_MODE: { MASS: 'mass', SINGLE: 'single' }
};

export const CONFIG = {
    AUTO_SAVE_INTERVAL_MS: 30000,
    DEBOUNCE_TIME_MS: 300,
    LS_APP_STATE_KEY: SCHEMA_VERSIONS.LS_APP_STATE_KEY,
    LS_FIRST_VISIT_KEY: SCHEMA_VERSIONS.LS_FIRST_VISIT_KEY,
    OPENROUTER_API_BASE: AI_PROVIDERS.openrouter.apiBaseUrl,
    OPENAI_API_BASE: AI_PROVIDERS.openai.apiBaseUrl,
    GOOGLE_API_BASE: AI_PROVIDERS.google.apiBaseUrl,
    ANTHROPIC_API_BASE: AI_PROVIDERS.anthropic.apiBaseUrl,
    MISTRAL_API_BASE: AI_PROVIDERS.mistral.apiBaseUrl,
    GROQ_API_BASE: AI_PROVIDERS.groq.apiBaseUrl,
    API_CALL_TIMEOUT_MS: 45000,
    API_CALL_TIMEOUT_OLLAMA_MS: OLLAMA_CONFIG.timeoutMs, // 2 minutes pour Ollama (modèles locaux lents au premier chargement)
    WORD_COUNT_TOLERANCE: 0.25,
};
