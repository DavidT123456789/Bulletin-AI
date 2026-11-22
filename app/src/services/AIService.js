/**
 * @fileoverview Service de communication avec les APIs d'IA (OpenAI, Google Gemini, OpenRouter, Ollama)
 * @module services/AIService
 */

import { appState } from '../state/State.js';
import { CONFIG, COSTS_PER_MILLION_TOKENS } from '../config/Config.js';
import { AI_PROVIDERS, OLLAMA_CONFIG, PROVIDER_DEFAULT_MODELS, getModelMeta, getProviderForModel, buildFallbackQueue, getApiModelName, getModelTimeout, hasValidApiKey } from '../config/aiRegistry.js';
import { bus, EVENTS } from '../core/EventBus.js';
import { Utils } from '../utils/Utils.js';

const AI_META_TIMEOUT_MS = 12000;
const AI_VALIDATION_TIMEOUT_MS = 15000;
const OLLAMA_MODELS_TIMEOUT_MS = 5000;

/**
 * Extrait le délai d'attente (en secondes) d'un message d'erreur ou des en-têtes HTTP de rate-limit (429/quota).
 * Supporte les en-têtes standards (Retry-After, x-ratelimit-reset*) et les formats texte (Google, Albert/OpenGateLLM, Groq, OpenAI, Anthropic, Mistral).
 * @param {string} errorMessage
 * @param {Headers|Object|null} [headers=null]
 * @returns {number|null} Délai en secondes ou null si non trouvé
 */
export function parseRetryDelay(errorMessage, headers = null) {
    if (headers && typeof headers.get === 'function') {
        const retryAfter = headers.get('retry-after') || headers.get('x-ratelimit-reset-requests') || headers.get('x-ratelimit-reset');
        if (retryAfter) {
            const parsedHeader = parseRetryDelay(
                /^\d+(\.\d+)?$/.test(retryAfter.trim()) ? `retry after ${retryAfter.trim()}s` : `retry after ${retryAfter.trim()}`
            );
            if (parsedHeader !== null) return parsedHeader;
        }
    }
    if (!errorMessage || typeof errorMessage !== 'string') return null;
    const match = errorMessage.match(/(?:retry|try again|retry after|réessayer dans|wait)\s+(?:in\s+)?(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds?|secondes?|minutes?|min|m)?/i);
    if (!match) return null;
    const val = parseFloat(match[1]);
    if (isNaN(val) || val <= 0) return null;
    const unit = (match[2] || 's').toLowerCase();
    if (unit === 'ms') {
        return Math.max(1, Math.ceil(val / 1000));
    }
    if (unit === 'm' || unit.startsWith('min')) {
        return Math.ceil(val * 60);
    }
    return Math.max(1, Math.ceil(val));
}

/**
 * Pause interruptible par AbortSignal.
 * @param {number} ms - Durée en millisecondes
 * @param {AbortSignal|null} [signal=null] - Signal d'annulation
 * @returns {Promise<void>}
 */
export function sleep(ms, signal = null) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            return reject(new DOMException("Opération annulée par l'utilisateur.", 'AbortError'));
        }

        let abortHandler = null;
        const timeoutId = setTimeout(() => {
            if (signal && abortHandler) {
                signal.removeEventListener('abort', abortHandler);
            }
            resolve();
        }, ms);

        if (signal) {
            abortHandler = () => {
                clearTimeout(timeoutId);
                reject(new DOMException("Opération annulée par l'utilisateur.", 'AbortError'));
            };
            signal.addEventListener('abort', abortHandler, { once: true });
        }
    });
}

// Mode debug : activé uniquement en développement (vite définit import.meta.env.DEV)


/**
 * @typedef {Object} AICallOptions
 * @property {boolean} [isValidation=false] - Mode validation de clé API
 * @property {string} [validationProvider='openai'] - Provider pour validation
 * @property {string|null} [modelOverride=null] - Forcer un modèle spécifique
 * @property {AbortSignal} [signal] - Signal d'annulation externe
 * @property {string} [context=null] - Contexte de l'appel (ex: 'single-student', 'mass-import')
 */

/**
 * @typedef {Object} AIResponse
 * @property {string} text - Texte généré par l'IA
 * @property {Object|null} usage - Statistiques d'utilisation des tokens
 * @property {number} [usage.prompt_tokens] - Tokens du prompt
 * @property {number} [usage.completion_tokens] - Tokens de la réponse
 * @property {number} [usage.total_tokens] - Total des tokens
 */

/**
 * @typedef {Object} GoogleModel
 * @property {string} name - Nom du modèle (ex: "models/gemini-3.8-flash")
 * @property {string} displayName - Nom d'affichage
 */


const MAX_RESPONSE_TOKENS = 1024;
const MAX_REASONING_RESPONSE_TOKENS = 2048;
const MAX_CLASS_SYNTHESIS_REASONING_TOKENS = 4096;
const TASK_TEMPERATURES = Object.freeze({
    appreciation: 0.65,
    refinement: 0.65,
    analysis: 0.2,
    'class-synthesis': 0.2
});

export const AIService = {
    sleep,

    /**
     * Calibre le budget de tokens et la température selon les métadonnées du modèle et la tâche.
     * @param {string} model
     * @param {{ isValidation?: boolean, taskType?: string }} [options]
     * @returns {{ maxTokens: number, temperature: number|undefined, isReasoning: boolean }}
     * @private
     */
    _resolveSamplingParams(model, { isValidation = false, taskType = 'appreciation' } = {}) {
        const meta = getModelMeta(model);
        const isReasoning = Boolean(meta?.isReasoning);
        const maxTokens = isReasoning
            ? (taskType === 'class-synthesis' ? MAX_CLASS_SYNTHESIS_REASONING_TOKENS : MAX_REASONING_RESPONSE_TOKENS)
            : MAX_RESPONSE_TOKENS;
        if (isValidation || meta?.supportsTemperature === false) {
            return { maxTokens, temperature: undefined, isReasoning };
        }
        const temperature = TASK_TEMPERATURES[taskType] ?? TASK_TEMPERATURES.appreciation;
        return { maxTokens, temperature, isReasoning };
    },

    /**
     * Résout l'URL de base d'Albert API (utilise le relais sans état /api/albert/v1 sur localhost
     * et Cloudflare Pages *.pages.dev pour contourner l'absence d'en-têtes CORS sur albert.api.etalab.gouv.fr).
     * @returns {string}
     */
    _getAlbertBaseUrl() {
        const hostname = typeof window !== 'undefined' ? window.location?.hostname || '' : '';
        if (
            hostname &&
            !import.meta.env?.VITEST &&
            (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.pages.dev'))
        ) {
            return '/api/albert/v1';
        }
        return CONFIG.ALBERT_API_BASE;
    },

    /**
     * Valide et normalise l'URL de base d'Ollama sur boucle locale port 11434 uniquement.
     * @returns {string|null}
     * @private
     */
    _getSafeOllamaBaseUrl() {
        return Utils.normalizeLocalOllamaUrl(appState.ollamaBaseUrl || OLLAMA_CONFIG.defaultBaseUrl);
    },

    /**
     * Génère la configuration API pour un provider donné
     * @private
     * @param {string} prompt - Le prompt à envoyer
     * @param {AICallOptions} options - Options de configuration
     * @returns {{apiKey: string, apiUrl: string, headers: Object, payload: Object}}
     * @throws {Error} Si la clé API est manquante
     */
    _getApiConfig(prompt, { isValidation = false, validationProvider = 'openai', modelOverride = null, systemPrompt = null, taskType = 'appreciation' } = {}) {
        const buildChatMessages = (p, sys) => (
            sys ? [{ role: "system", content: sys }, { role: "user", content: p }] : [{ role: "user", content: p }]
        );

        const configs = {
            openai: {
                apiKey: appState.openaiApiKey, apiUrl: `${CONFIG.OPENAI_API_BASE}/chat/completions`,
                headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
                payload: (p, m, sys, sampling) => {
                    const body = {
                        model: getApiModelName(m),
                        messages: buildChatMessages(p, sys)
                    };
                    if (sampling.isReasoning) {
                        body.max_completion_tokens = sampling.maxTokens;
                    } else {
                        body.max_tokens = sampling.maxTokens;
                    }
                    if (sampling.temperature !== undefined) {
                        body.temperature = sampling.temperature;
                    }
                    return body;
                },
            },
            google: {
                apiKey: appState.googleApiKey, 
                apiUrl: (m) => `${CONFIG.GOOGLE_API_BASE}/models/${getApiModelName(m)}:generateContent`,
                headers: (key) => ({ 
                    'Content-Type': 'application/json',
                    'x-goog-api-key': key || appState.googleApiKey
                }),
                payload: (p, m, sys, sampling) => {
                    const body = { contents: [{ role: "user", parts: [{ text: p }] }] };
                    if (sys) {
                        body.systemInstruction = { parts: [{ text: sys }] };
                    }
                    const genConfig = {};
                    const thinkingLevel = getModelMeta(m)?.thinkingLevel;
                    if (thinkingLevel) {
                        genConfig.thinkingConfig = { thinkingLevel };
                    }
                    if (sampling.temperature !== undefined) {
                        genConfig.temperature = sampling.temperature;
                    }
                    // Ne pas plafonner maxOutputTokens sur Gemini reasoning (thinking + réponse partagent ce budget)
                    if (!isValidation && !sampling.isReasoning) {
                        genConfig.maxOutputTokens = sampling.maxTokens;
                    }
                    if (Object.keys(genConfig).length > 0) {
                        body.generationConfig = genConfig;
                    }
                    return body;
                },
            },
            albert: {
                apiKey: appState.albertApiKey,
                apiUrl: `${this._getAlbertBaseUrl()}/chat/completions`,
                headers: (key) => ({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                }),
                payload: (p, m, sys, sampling) => {
                    const body = {
                        model: getApiModelName(m),
                        messages: buildChatMessages(p, sys),
                        top_p: 0.9,
                        max_tokens: sampling.maxTokens
                    };
                    if (sampling.temperature !== undefined) {
                        body.temperature = sampling.temperature;
                    }
                    return body;
                },
            },
            openrouter: {
                apiKey: appState.openrouterApiKey, apiUrl: `${CONFIG.OPENROUTER_API_BASE}/chat/completions`,
                headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'HTTP-Referer': `${window.location.protocol}//${window.location.hostname}`, 'X-Title': `Bulletin Assistant` }),
                payload: (p, m, sys, sampling) => {
                    const body = {
                        model: getApiModelName(m),
                        messages: buildChatMessages(p, sys),
                        max_tokens: sampling.maxTokens
                    };
                    if (sampling.temperature !== undefined) {
                        body.temperature = sampling.temperature;
                    }
                    return body;
                },
            },
            ollama: {
                apiKey: appState.ollamaEnabled ? 'local' : null,
                apiUrl: () => {
                    const baseUrl = this._getSafeOllamaBaseUrl();
                    if (!baseUrl) {
                        throw new Error('URL Ollama invalide : utilisez http://localhost:11434 ou http://127.0.0.1:11434.');
                    }
                    return `${baseUrl}${OLLAMA_CONFIG.apiEndpoint}`;
                },
                headers: () => ({ 'Content-Type': 'application/json' }),
                payload: (p, m, sys, sampling) => ({
                    model: getApiModelName(m),
                    messages: buildChatMessages(p, sys),
                    stream: false,
                    options: {
                        ...(sampling.temperature !== undefined ? { temperature: sampling.temperature } : {}),
                        num_predict: sampling.maxTokens,
                        top_p: 0.9,
                        repeat_penalty: 1.1,
                    }
                }),
            },
            anthropic: {
                apiKey: appState.anthropicApiKey,
                apiUrl: `${CONFIG.ANTHROPIC_API_BASE}/messages`,
                headers: (key) => ({
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                }),
                payload: (p, m, sys, sampling) => {
                    const body = {
                        model: getApiModelName(m),
                        messages: [{ role: 'user', content: p }],
                        max_tokens: sampling.maxTokens
                    };
                    if (sys) {
                        body.system = sys;
                    }
                    if (sampling.temperature !== undefined) {
                        body.temperature = sampling.temperature;
                    }
                    return body;
                },
            },
            mistral: {
                apiKey: appState.mistralApiKey,
                apiUrl: `${CONFIG.MISTRAL_API_BASE}/chat/completions`,
                headers: (key) => ({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                }),
                payload: (p, m, sys, sampling) => {
                    const body = {
                        model: getApiModelName(m),
                        messages: buildChatMessages(p, sys),
                        max_tokens: sampling.maxTokens
                    };
                    if (sampling.temperature !== undefined) {
                        body.temperature = sampling.temperature;
                    }
                    return body;
                },
            },
            groq: {
                apiKey: appState.groqApiKey,
                apiUrl: `${CONFIG.GROQ_API_BASE}/chat/completions`,
                headers: (key) => ({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                }),
                payload: (p, m, sys, sampling) => {
                    const apiModel = getApiModelName(m);
                    const body = {
                        model: apiModel,
                        messages: buildChatMessages(p, sys),
                        max_tokens: sampling.maxTokens
                    };
                    if (sampling.temperature !== undefined) {
                        body.temperature = sampling.temperature;
                    }
                    if (apiModel.includes('gpt-oss')) {
                        body.reasoning_format = 'parsed';
                    }
                    return body;
                }
            }
        };

        if (isValidation) {
            const providerConfig = configs[validationProvider];
            if (!providerConfig) throw new Error("Fournisseur de validation inconnu.");
            const apiKey = providerConfig.apiKey;
            if (!apiKey) throw new Error("Clé API manquante.");
            const validationModel = modelOverride || PROVIDER_DEFAULT_MODELS[validationProvider] || PROVIDER_DEFAULT_MODELS.google;
            const validationSampling = this._resolveSamplingParams(validationModel, { isValidation: true });
            let apiUrl = typeof providerConfig.apiUrl === 'function' ? providerConfig.apiUrl(validationModel) : providerConfig.apiUrl;
            let payload = providerConfig.payload("test", validationModel, null, validationSampling);
            if (payload && typeof payload === 'object') {
                if (validationProvider === 'google') {
                    const genConfig = { ...(payload.generationConfig || {}), maxOutputTokens: 5 };
                    if (genConfig.thinkingConfig) {
                        genConfig.thinkingConfig = { ...genConfig.thinkingConfig, thinkingLevel: 'LOW' };
                    }
                    payload.generationConfig = genConfig;
                } else if (validationProvider === 'ollama' && payload.options) {
                    payload.options.num_predict = 5;
                } else if ('max_completion_tokens' in payload) {
                    payload.max_completion_tokens = 5;
                } else if ('max_tokens' in payload) {
                    payload.max_tokens = 5;
                }
            }
            return { apiKey, apiUrl, headers: providerConfig.headers(apiKey), payload };
        }

        const selectedModel = modelOverride || appState.currentAIModel;
        const provider = this._getProviderForModel(selectedModel);
        const config = configs[provider];
        const apiKey = config.apiKey;
        if (!apiKey) {
            if (provider === 'ollama') {
                throw new Error("Ollama non activé. Activez-le dans les paramètres.");
            }
            throw new Error(`Clé API ${provider.charAt(0).toUpperCase() + provider.slice(1)} manquante.`);
        }

        const sampling = this._resolveSamplingParams(selectedModel, { isValidation: false, taskType });

        return {
            apiKey,
            apiUrl: typeof config.apiUrl === 'function' ? config.apiUrl(selectedModel) : config.apiUrl,
            headers: config.headers(apiKey),
            payload: config.payload(prompt, selectedModel, systemPrompt, sampling)
        };
    },

    /**
     * Inspecte si une réponse IA ressemble à un objet JSON et s'il est complet/valide.
     * Utilisé pour détecter un JSON tronqué (ex. `{ "synthesis": "Au terme...`) avant tout rendu/sauvegarde.
     * @param {string} text
     * @returns {{ looksLikeJson: boolean, isValidObject: boolean }}
     */
    _inspectJsonResponse(text) {
        if (typeof text !== 'string') return { looksLikeJson: false, isValidObject: false };
        const trimmed = text.trim();
        if (!trimmed) return { looksLikeJson: false, isValidObject: false };

        const hasJsonFence = /^```json\b/i.test(trimmed);
        const unfenced = trimmed.startsWith('```')
            ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
            : trimmed;
        const looksLikeJson = hasJsonFence || unfenced.startsWith('{');
        if (!looksLikeJson) {
            return { looksLikeJson: false, isValidObject: false };
        }

        try {
            const parsed = JSON.parse(unfenced);
            const isValidObject = Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
            return { looksLikeJson: true, isValidObject };
        } catch {
            return { looksLikeJson: true, isValidObject: false };
        }
    },

    /**
     * Calcule le timeout approprié selon le type de modèle
     * @param {string} model - Nom du modèle
     * @returns {number} Timeout en ms
     */
    _getModelTimeout(model) {
        return getModelTimeout(model, CONFIG.API_CALL_TIMEOUT_OLLAMA_MS, 22000);
    },

    /**
     * Appelle l'API d'IA pour générer du texte avec gestion de retry transitoire (503/429/50x)
     * @param {string} prompt - Le prompt à envoyer
     * @param {AICallOptions} [options={}] - Options de l'appel
     * @returns {Promise<AIResponse>} La réponse de l'IA
     */
    async callAI(prompt, options = {}) {
        const { isValidation = false, signal: externalSignal, modelOverride, retryOnTimeout = true } = options;
        const selectedModel = modelOverride || appState.currentAIModel;
        const baseTimeoutMs = this._getModelTimeout(selectedModel);
        const timeoutMs = isValidation ? Math.min(baseTimeoutMs, AI_VALIDATION_TIMEOUT_MS) : baseTimeoutMs;
        const maxRetries = isValidation ? 0 : 1; // 1 retry unique pour éviter les ralentissements

        let attempt = 0;
        while (attempt <= maxRetries) {
            attempt++;
            const { apiUrl, headers, payload } = this._getApiConfig(prompt, options);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
            let onExternalAbort = null;

            if (externalSignal) {
                if (externalSignal.aborted) {
                    clearTimeout(timeoutId);
                    return Promise.reject(new DOMException("Opération annulée par l'utilisateur.", "AbortError"));
                }
                onExternalAbort = () => {
                    clearTimeout(timeoutId);
                    controller.abort(externalSignal.reason);
                };
                externalSignal.addEventListener('abort', onExternalAbort, { once: true });
            }

            const cleanup = () => {
                clearTimeout(timeoutId);
                if (externalSignal && onExternalAbort) {
                    externalSignal.removeEventListener('abort', onExternalAbort);
                }
            };
            const startTime = Date.now();

            try {
                const resp = await fetch(apiUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                const res = await resp.json().catch(() => ({}));
                const generationTimeMs = Date.now() - startTime;

                if (!resp.ok) {
                    const status = resp.status;
                    const errorDetails = res.error?.message || res.error || res.message || res.detail || JSON.stringify(res);
                    const isTransient = [408, 429, 500, 502, 503, 504].includes(status);

                    console.warn(`[AI Request] ❌ ${selectedModel} (HTTP ${status} en ${generationTimeMs}ms) [Tentative ${attempt}/${maxRetries + 1}]: ${errorDetails}`);

                    // Si erreur transitoire (surcharge 503, rate limit 429) et qu'il reste 1 tentative
                    if (isTransient && attempt <= maxRetries && !externalSignal?.aborted) {
                        const retrySec = status === 429 ? parseRetryDelay(String(errorDetails), resp.headers) : null;
                        const backoffDelay = retrySec
                            ? Math.min(retrySec * 1000, 15000)
                            : 1200 + Math.round(Math.random() * 800);
                        if (status === 429 && typeof options.onRetryWait === 'function') {
                            options.onRetryWait(Math.max(1, Math.ceil(backoffDelay / 1000)));
                        }
                        console.info(`[AI Retry] ⏳ Réessai pour ${selectedModel} (HTTP ${status}) dans ${backoffDelay}ms...`);
                        cleanup();
                        await sleep(backoffDelay, externalSignal);
                        continue;
                    }

                    let errorMsg = `Erreur API ${status}: ${errorDetails}`;
                    if (isValidation) errorMsg = `Clé invalide (${status}): ${errorDetails}`;
                    throw new Error(errorMsg);
                }

                if (isValidation) return { text: 'Validation réussie', usage: null };

                // Extraction du texte selon le format de réponse
                let text = "";
                if (res.candidates?.[0]?.content?.parts) {
                    // Google Gemini : ne jamais exposer les parties de réflexion interne (thought: true),
                    // même si la réponse a été tronquée avant le texte final (MAX_TOKENS -> réponse vide -> fallback)
                    const nonThoughtParts = res.candidates[0].content.parts
                        .filter(p => !p.thought && p.text)
                        .map(p => p.text);
                    text = nonThoughtParts.join('').trim();
                } else if (Array.isArray(res.content)) {
                    // Anthropic Claude : extraire les blocs text du tableau content
                    text = res.content
                        .filter(p => p.type === 'text' && p.text)
                        .map(p => p.text)
                        .join('').trim();
                } else if (res.message?.content) {
                    text = res.message.content; // Ollama /api/chat
                } else if (res.response) {
                    text = res.response; // Ollama /api/generate (rétrocompatibilité)
                } else if (res.choices?.[0]?.message?.content) {
                    text = res.choices[0].message.content; // OpenAI / OpenRouter / Mistral / Groq / Albert
                }

                // Nettoyage des balises de raisonnement (DeepSeek R1, Qwen, Ollama thinking), y compris non fermées en fin de flux
                text = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();

                if (!text || text.trim().length === 0) {
                    throw new Error("Réponse vide de l'API. Le modèle n'a pas généré de texte.");
                }

                // Détection d'une troncature API (MAX_TOKENS / length) ou d'un JSON incomplet sur les tâches structurées
                const isTruncated =
                    res.candidates?.[0]?.finishReason === 'MAX_TOKENS' ||
                    res.choices?.[0]?.finish_reason === 'length' ||
                    res.stop_reason === 'max_tokens' ||
                    res.done_reason === 'length';
                const expectsStructuredJson = options.taskType === 'class-synthesis' || options.taskType === 'analysis';
                if (expectsStructuredJson) {
                    const { looksLikeJson, isValidObject } = this._inspectJsonResponse(text);
                    if ((looksLikeJson && !isValidObject) || (isTruncated && !isValidObject)) {
                        const truncErr = new Error(
                            isTruncated
                                ? "Réponse IA tronquée (limite de tokens atteinte). Réessayez ou utilisez un autre modèle."
                                : "Réponse IA incomplète (format JSON invalide). Réessayez ou utilisez un autre modèle."
                        );
                        truncErr.name = 'TruncatedResponseError';
                        throw truncErr;
                    }
                }

                let inTokens = 0, outTokens = 0;
                if (res.usageMetadata) {
                    // Google Gemini
                    inTokens = res.usageMetadata.promptTokenCount ?? 0;
                    outTokens = res.usageMetadata.candidatesTokenCount ?? 0;
                } else if (res.usage) {
                    // OpenAI/OpenRouter (prompt_tokens) ou Anthropic (input_tokens)
                    inTokens = res.usage.prompt_tokens ?? res.usage.input_tokens ?? 0;
                    outTokens = res.usage.completion_tokens ?? res.usage.output_tokens ?? 0;
                } else if (res.prompt_eval_count !== undefined) {
                    // Ollama
                    inTokens = res.prompt_eval_count || 0;
                    outTokens = res.eval_count || 0;
                }

                return {
                    text,
                    usage: { prompt_tokens: inTokens, completion_tokens: outTokens, total_tokens: inTokens + outTokens },
                    generationTimeMs
                };
            } catch (error) {
                if (externalSignal?.aborted) {
                    throw new DOMException("Opération annulée par l'utilisateur.", "AbortError");
                }
                const isTimeout = error?.name === 'TimeoutError'
                    || error?.name === 'AbortError'
                    || (controller.signal.aborted && controller.signal.reason?.name === 'TimeoutError');
                if (isTimeout) {
                    console.warn(`[AI Request] ⏱️ Timeout (${timeoutMs}ms) sur ${selectedModel} [Tentative ${attempt}/${maxRetries + 1}]`);
                    if (retryOnTimeout && attempt <= maxRetries && !externalSignal?.aborted) {
                        console.info(`[AI Retry] ⏳ Réessai après timeout pour ${selectedModel}...`);
                        cleanup();
                        await sleep(1000, externalSignal);
                        continue;
                    }
                    const timeoutError = new Error(`La requête a expiré (timeout ${Math.round(timeoutMs / 1000)}s).`);
                    timeoutError.name = 'TimeoutError';
                    throw timeoutError;
                }
                throw error;
            } finally {
                cleanup();
            }
        }
    },

    /**
     * Récupère la liste des modèles disponibles pour un provider
     * @param {'google'|'openai'|'openrouter'} provider - Le provider à interroger
     * @returns {Promise<GoogleModel[]>} Liste des modèles (vide pour OpenAI/OpenRouter)
     * @throws {Error} Si la clé API est manquante ou invalide
     */
    async getAvailableModels(provider) {
        if (provider === 'google') {
            const apiKey = appState.googleApiKey;
            if (!apiKey) throw new Error("Clé API manquante.");
            const url = `${CONFIG.GOOGLE_API_BASE}/models`;
            try {
                const resp = await Utils.fetchWithTimeout(url, { headers: { 'x-goog-api-key': apiKey } }, AI_META_TIMEOUT_MS);
                const data = await resp.json().catch(() => ({}));
                if (!resp.ok) {
                    const detail = data.error?.message || (Object.keys(data).length > 0 ? JSON.stringify(data) : `HTTP ${resp.status}`);
                    const err = new Error(`Erreur HTTP ${resp.status}: ${detail}`);
                    err.status = resp.status;
                    throw err;
                }
                return data.models || [];
            } catch (e) {
                console.error("Failed to list models", e);
                throw e;
            }
        }
        if (provider === 'albert') {
            const apiKey = appState.albertApiKey;
            if (!apiKey) throw new Error("Clé API manquante.");
            const url = `${this._getAlbertBaseUrl()}/models`;
            const resp = await Utils.fetchWithTimeout(url, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            }, AI_META_TIMEOUT_MS);
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const err = resp.status === 403
                    ? new Error("Compte Albert expiré (403) : renouvelez votre accès sur le portail DINUM.")
                    : new Error(data.detail || data.error?.message || `Erreur HTTP ${resp.status}`);
                err.status = resp.status;
                throw err;
            }
            return data.data || [];
        }
        return [];
    },

    /**
     * Récupère les informations de compte et limites de débit Albert API (/v1/me).
     * @param {string|null} [apiKeyOverride=null] - Clé API à utiliser (à défaut de appState.albertApiKey)
     * @returns {Promise<{rpmLimit: number|null, rpdLimit: number|null, budget: number|null, expires: number|null}|null>}
     */
    async getAlbertAccountInfo(apiKeyOverride = null) {
        const apiKey = apiKeyOverride || appState.albertApiKey;
        if (!apiKey) return null;

        try {
            const response = await Utils.fetchWithTimeout(`${this._getAlbertBaseUrl()}/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                }
            }, AI_META_TIMEOUT_MS);

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    const errData = await response.json().catch(() => ({}));
                    const detail = errData.detail || errData.error?.message || `HTTP ${response.status}`;
                    const err = new Error(detail);
                    err.status = response.status;
                    throw err;
                }
                return null;
            }

            const data = await response.json();
            if (!data || typeof data !== 'object') return null;

            const limits = Array.isArray(data.limits) ? data.limits : [];
            const llmRouterIds = new Set(
                limits.filter(l => l?.type === 'tpm' && typeof l.value === 'number' && l.value > 0).map(l => l.router_id)
            );
            const relevantLimits = llmRouterIds.size > 0
                ? limits.filter(l => llmRouterIds.has(l.router_id))
                : limits;
            const rpmValues = relevantLimits.filter(l => l?.type === 'rpm' && typeof l.value === 'number' && l.value > 0).map(l => l.value);
            const rpdValues = relevantLimits.filter(l => l?.type === 'rpd' && typeof l.value === 'number' && l.value > 0).map(l => l.value);

            return {
                rpmLimit: rpmValues.length > 0 ? Math.max(...rpmValues) : null,
                rpdLimit: rpdValues.length > 0 ? Math.max(...rpdValues) : null,
                budget: typeof data.budget === 'number' ? data.budget : null,
                expires: typeof data.expires === 'number' ? data.expires : null
            };
        } catch (error) {
            if (error?.status === 401 || error?.status === 403) {
                throw error;
            }
            return null;
        }
    },

    /**
     * Détermine le provider d'un modèle
     * @param {string} model - Nom du modèle
     * @returns {'google'|'openai'|'openrouter'|'ollama'|'anthropic'|'mistral'} Le provider
     */
    _getProviderForModel(model) {
        return getProviderForModel(model);
    },

    /**
     * Vérifie si la clé API est disponible pour un modèle
     * @param {string} model - Nom du modèle
     * @returns {boolean}
     */
    _hasApiKeyForModel(model) {
        const provider = this._getProviderForModel(model);
        if (provider === 'ollama') {
            if (!appState.ollamaEnabled) return false;
            // Vérifier si ce modèle spécifique est installé
            const modelName = getApiModelName(model);
            const installed = appState.ollamaInstalledModels || [];
            // Si on n'a pas la liste des modèles, on assume qu'il est disponible
            if (installed.length === 0) return true;
            // Vérification flexible pour gérer les variations de nommage Ollama
            // Ex: "qwen3:4b" doit matcher "qwen3:4b", "qwen3:4b-q4_0", etc.
            return installed.some(installedModel => {
                // Match exact
                if (installedModel === modelName) return true;
                // Le modèle installé commence par le nom recherché
                if (installedModel.startsWith(modelName)) return true;
                // Le nom recherché correspond au préfixe du modèle installé (sans le tag secondaire)
                const [baseName, tag] = modelName.split(':');
                const [installedBase, installedTag] = installedModel.split(':');
                if (baseName === installedBase && installedTag && installedTag.startsWith(tag || '')) return true;
                return false;
            });
        }
        return hasValidApiKey(provider, { state: appState });
    },

    /**
     * Vérifie si Ollama est disponible (serveur en cours d'exécution)
     * @returns {Promise<boolean>}
     */
    async checkOllamaAvailability() {
        try {
            const baseUrl = this._getSafeOllamaBaseUrl();
            if (!baseUrl) return false;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

            const response = await fetch(`${baseUrl}/api/tags`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const models = data.models?.map(m => m.name) || [];
                // Mettre à jour la liste des modèles installés dans l'état
                appState.ollamaInstalledModels = models;
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    },

    /**
     * Récupère la liste des modèles Ollama installés
     * @returns {Promise<string[]>}
     */
    async getOllamaModels() {
        try {
            const baseUrl = this._getSafeOllamaBaseUrl();
            if (!baseUrl) return [];
            const response = await Utils.fetchWithTimeout(`${baseUrl}/api/tags`, {}, OLLAMA_MODELS_TIMEOUT_MS);
            if (response.ok) {
                const data = await response.json();
                return data.models?.map(m => m.name) || [];
            }
            return [];
        } catch (e) {
            return [];
        }
    },


    /**
     * Construit la file de fallback à partir du modèle actuel
     * @param {string} currentModel - Le modèle actuellement sélectionné
     * @returns {string[]} Liste ordonnée des modèles à essayer
     */
    _getFallbackQueue(currentModel) {
        return buildFallbackQueue(currentModel);
    },

    /**
     * Appelle l'API d'IA avec fallback automatique en cas d'erreur
     * Si le modèle actuel échoue avec une erreur de quota/rate limit,
     * essaie automatiquement les autres modèles disponibles.
     * @param {string} prompt - Le prompt à envoyer
     * @param {Object} [options={}] - Options de l'appel
     * @returns {Promise<AIResponse>} La réponse de l'IA
     */
    async callAIWithFallback(prompt, options = {}) {
        // Émettre l'événement de début de génération (pour l'animation de la pillule)
        bus.emit(EVENTS.AI_GENERATION_START, {
            context: options.context || null,
            studentName: options.studentName || ''
        });

        // Si le fallback est désactivé, utiliser uniquement le modèle actuel
        const fallbackEnabled = appState.enableApiFallback !== false;
        const fallbackModels = fallbackEnabled
            ? this._getFallbackQueue(appState.currentAIModel)
            : [appState.currentAIModel];
        let lastError = null;
        let attemptedModels = [];
        // Évite d'enchaîner tous les modèles payants d'un même fournisseur si le compte renvoie HTTP 402 (crédit insuffisant)
        const exhaustedPaidProviders = new Set();
        // Évite de retester d'autres modèles du même fournisseur si sa clé est refusée (HTTP 401), tout en laissant le fallback basculer sur un autre fournisseur
        const invalidAuthProviders = new Set();
        const availableFallbackCount = fallbackModels.filter(m => this._hasApiKeyForModel(m)).length;
        const hasFallbackAlternative = availableFallbackCount > 1;
        let outcomeAborted = false;
        let outcomeFailed = false;

        try {

            for (const model of fallbackModels) {
                const modelProvider = getProviderForModel(model);
                const isFreeModel = model.endsWith('-free') || model.endsWith(':free');
                if (invalidAuthProviders.has(modelProvider)) {
                    continue;
                }
                if (exhaustedPaidProviders.has(modelProvider) && !isFreeModel) {
                    continue;
                }

                // Vérifier si la clé API est disponible pour ce modèle
                if (!this._hasApiKeyForModel(model)) {
                    // Modèle ignoré : pas de clé API disponible
                    continue;
                }

                // Plus de cooldown par provider - chaque modèle est traité indépendamment
                // Si un modèle échoue avec 429, on passe simplement au suivant

                attemptedModels.push(model);

                try {
                    const response = await this.callAI(prompt, {
                        ...options,
                        modelOverride: model,
                        retryOnTimeout: !hasFallbackAlternative
                    });

                    // Notifier si on a basculé vers un autre modèle
                    if (model !== appState.currentAIModel && attemptedModels.length > 1) {
                        bus.emit(EVENTS.AI_FALLBACK, {
                            originalModel: appState.currentAIModel,
                            usedModel: model,
                            reason: lastError?.message || 'Erreur inconnue'
                        });
                    }

                    return { ...response, modelUsed: model };
                } catch (error) {
                    const errMsg = String(error?.message || '');
                    const errLower = errMsg.toLowerCase();
                    console.warn(`[AI Fallback] Modèle ${model} a échoué:`, errMsg);
                    lastError = error;

                    // Erreurs non réessayables : annulation utilisateur ou clé manquante
                    const isAborted = error?.name === 'AbortError' ||
                        errMsg.includes('annulé') ||
                        errMsg.includes('abort') ||
                        Boolean(options.signal?.aborted);
                    const isNonRetryable = isAborted || errLower.includes('clé api manquante');

                    if (isNonRetryable) {
                        outcomeAborted = isAborted;
                        outcomeFailed = !isAborted;
                        throw error;
                    }

                    // HTTP 401 : écarter ce fournisseur et basculer vers un autre fournisseur configuré
                    if (error?.status === 401 || errMsg.includes('401')) {
                        invalidAuthProviders.add(modelProvider);
                        continue;
                    }

                    // Si paiement requis / crédits épuisés (HTTP 402), inutile de tester les autres modèles payants du même provider
                    if (errMsg.includes('402') || errLower.includes('insufficient credits') || errLower.includes('payment required')) {
                        exhaustedPaidProviders.add(modelProvider);
                    }

                    // Pour TOUTES les autres erreurs (timeout, quota, 429, 404, troncature JSON, etc.)
                    // → Continuer avec le modèle suivant
                    // Le fallback doit toujours essayer les alternatives disponibles
                    continue;
                }
            }

            outcomeFailed = true;

            // Tous les modèles ont échoué
            if (invalidAuthProviders.size > 0 && attemptedModels.length > 0 && (lastError?.status === 401 || String(lastError?.message || '').includes('401'))) {
                throw lastError;
            }

            // Extraire le temps d'attente suggéré par l'API (ex: "Please retry in 55.35s", "Please try again in 1.45s")
            const retrySeconds = parseRetryDelay(lastError?.message);

            // Créer un message d'erreur clair et actionnable
            const attemptedCount = attemptedModels.length;
            const missingKeysCount = fallbackModels.length - attemptedCount;
            const attemptedProviders = new Set(attemptedModels.map(m => getProviderForModel(m)));

            // Déterminer la cause principale
            const lastMsg = String(lastError?.message || '');
            const isQuotaError = lastMsg.includes('429') || lastMsg.toLowerCase().includes('quota');
            const is404Error = lastMsg.includes('404');
            const isTimeoutError = lastError?.name === 'TimeoutError' || /timeout|expir[ée]/i.test(lastMsg);
            const isTruncatedError = lastError?.name === 'TruncatedResponseError' || /tronqu[ée]|json invalide/i.test(lastMsg);

            let errorMessage = '';

            if (isQuotaError) {
                // Message quota avec temps d'attente
                const retryInfo = retrySeconds ? `Réessayez dans ~${retrySeconds}s` : 'Réessayez dans quelques instants';
                errorMessage = `Quota atteint (${attemptedCount} modèles testés). ${retryInfo}.`;

                // Ajouter un conseil si un seul provider est configuré sans OpenRouter en secours
                if (missingKeysCount > 0 && attemptedProviders.size === 1 && !hasValidApiKey('openrouter', { state: appState })) {
                    errorMessage += ` Ajoutez une clé OpenRouter pour un fallback automatique.`;
                }
            } else if (isTimeoutError) {
                errorMessage = `Délai dépassé (${attemptedCount} modèle${attemptedCount > 1 ? 's' : ''} testé${attemptedCount > 1 ? 's' : ''}). Le serveur IA met trop de temps à répondre, réessayez.`;
            } else if (isTruncatedError) {
                errorMessage = `Réponse IA tronquée (${attemptedCount} modèle${attemptedCount > 1 ? 's' : ''} testé${attemptedCount > 1 ? 's' : ''}). Réessayez ou choisissez un autre modèle.`;
            } else if (is404Error) {
                errorMessage = `Modèle indisponible. ${attemptedCount} modèle${attemptedCount > 1 ? 's' : ''} testé${attemptedCount > 1 ? 's' : ''}.`;
            } else {
                // Erreur générique
                errorMessage = `Échec après ${attemptedCount} modèle${attemptedCount > 1 ? 's' : ''} (${attemptedModels.join(', ')}).`;
            }

            // Ajouter l'info sur les modèles ignorés (seulement si pertinent)
            if (missingKeysCount > 0 && !isQuotaError && !isTimeoutError && !isTruncatedError) {
                errorMessage += ` ${missingKeysCount} ignoré${missingKeysCount > 1 ? 's' : ''} (clés manquantes).`;
            }

            throw new Error(errorMessage);
        } finally {
            // Émettre l'événement de fin de génération (pour arrêter l'animation)
            bus.emit(EVENTS.AI_GENERATION_END, {
                context: options.context || null,
                studentName: options.studentName || '',
                aborted: outcomeAborted,
                hasError: outcomeFailed
            });
        }
    },

    /**
     * Récupère le solde de crédits OpenRouter.
     * @returns {Promise<number|null>} Solde en dollars ou null en cas d'erreur.
     */
    async getOpenRouterCredits() {
        if (!appState.openrouterApiKey) return null;

        try {
            const response = await Utils.fetchWithTimeout('https://openrouter.ai/api/v1/credits', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${appState.openrouterApiKey}`,
                }
            }, AI_META_TIMEOUT_MS);

            if (!response.ok) {
                console.warn('[OpenRouter] Impossible de récupérer les crédits:', response.status);
                return null;
            }

            const data = await response.json();
            // L'API retourne : { data: { total_usage: number, total_credits: number } }
            // Le solde restant = total_credits - total_usage
            if (data && data.data) {
                const credits = data.data.total_credits || 0;
                const usage = data.data.total_usage || 0;
                return Math.max(0, credits - usage);
            }
            return null;

        } catch (error) {
            console.error('[OpenRouter] Erreur récupération crédits:', error);
            return null;
        }
    }
};
