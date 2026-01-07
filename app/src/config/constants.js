/**
 * @fileoverview Constantes techniques de l'application.
 * @module config/constants
 */

export const APP_VERSION = "0.1.0 Beta";

export const CONSTS = {
    INPUT_MODE: { MASS: 'mass', SINGLE: 'single' }
};

export const CONFIG = {
    AUTO_SAVE_INTERVAL_MS: 30000,
    DEBOUNCE_TIME_MS: 300,
    LS_APP_STATE_KEY: 'appreciationGeneratorState_v6.2',
    LS_FIRST_VISIT_KEY: 'appreciationGeneratorFirstVisit_v8',
    OPENROUTER_API_BASE: 'https://openrouter.ai/api/v1',
    OPENAI_API_BASE: 'https://api.openai.com/v1',
    GOOGLE_API_BASE: 'https://generativelanguage.googleapis.com/v1beta',
    ANTHROPIC_API_BASE: 'https://api.anthropic.com/v1',
    MISTRAL_API_BASE: 'https://api.mistral.ai/v1',
    API_CALL_TIMEOUT_MS: 25000,
    API_CALL_TIMEOUT_OLLAMA_MS: 120000, // 2 minutes pour Ollama (modèles locaux lents au premier chargement)
    WORD_COUNT_TOLERANCE: 0.25,
};
