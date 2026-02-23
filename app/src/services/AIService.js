/**
 * @fileoverview Service de communication avec les APIs d'IA (OpenAI, Google Gemini, OpenRouter, Ollama)
 * @module services/AIService
 */

import { appState } from '../state/State.js';
import { CONFIG, COSTS_PER_MILLION_TOKENS, FALLBACK_CONFIG } from '../config/Config.js';
import { OLLAMA_CONFIG } from '../config/models.js';
import { DOM } from '../utils/DOM.js';

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
 * @property {string} name - Nom du modèle (ex: "models/gemini-2.5-flash")
 * @property {string} displayName - Nom d'affichage
 */


export const AIService = {
    /**
     * Génère la configuration API pour un provider donné
     * @private
     * @param {string} prompt - Le prompt à envoyer
     * @param {AICallOptions} options - Options de configuration
     * @returns {{apiKey: string, apiUrl: string, headers: Object, payload: Object}}
     * @throws {Error} Si la clé API est manquante
     */
    _getApiConfig(prompt, { isValidation = false, validationProvider = 'openai', modelOverride = null } = {}) {
        const configs = {
            openai: {
                apiKey: appState.openaiApiKey, apiUrl: `${CONFIG.OPENAI_API_BASE}/chat/completions`,
                headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
                payload: (p, m) => ({ model: m.replace('openai-', ''), messages: [{ role: "user", content: p }] }),
            },
            google: {
                apiKey: appState.googleApiKey, apiUrl: (m) => `${CONFIG.GOOGLE_API_BASE}/models/${m}:generateContent?key=${appState.googleApiKey}`,
                headers: () => ({ 'Content-Type': 'application/json' }),
                payload: (p) => ({ contents: [{ role: "user", parts: [{ text: p }] }] }),
            },
            openrouter: {
                apiKey: appState.openrouterApiKey, apiUrl: `${CONFIG.OPENROUTER_API_BASE}/chat/completions`,
                headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'HTTP-Referer': `${window.location.protocol}//${window.location.hostname}`, 'X-Title': `Bulletin Assistant` }),
                payload: (p, m) => {
                    // Mapping des modèles vers leurs identifiants OpenRouter
                    // IDs vérifiés sur openrouter.ai - Février 2026
                    const modelMap = {
                        'openrouter': 'deepseek/deepseek-chat',
                        'claude-sonnet-4.6': 'anthropic/claude-sonnet-4.6',
                        // === GRATUITS ===
                        'llama-3.3-70b-free': 'meta-llama/llama-3.3-70b-instruct:free', // Quota quotidien partagé
                        // === PAYANTS ÉCONOMIQUES ===
                        'ministral-3b': 'mistralai/ministral-3b-2512',
                        'amazon-nova-v1-lite': 'amazon/nova-lite-v1:1.0',
                        'mistral-small': 'mistralai/mistral-small-3.2-24b-instruct',
                        'mistral-large': 'mistralai/mistral-large-2512'
                    };
                    return {
                        model: modelMap[m] || 'deepseek/deepseek-chat',
                        messages: [{ role: "user", content: p }],
                        max_tokens: 512
                    };
                },
            },
            ollama: {
                // Ollama n'a pas besoin de clé API, mais doit être activé
                apiKey: appState.ollamaEnabled ? 'local' : null,
                apiUrl: (m) => {
                    const baseUrl = appState.ollamaBaseUrl || OLLAMA_CONFIG.defaultBaseUrl;
                    return `${baseUrl}${OLLAMA_CONFIG.apiEndpoint}`;
                },
                headers: () => ({ 'Content-Type': 'application/json' }),
                payload: (p, m) => ({
                    model: m.replace('ollama-', ''), // ex: 'ollama-llama3.1:8b' → 'llama3.1:8b'
                    prompt: p,
                    stream: false,
                    // Paramètres de contrôle pour des réponses cohérentes
                    options: {
                        temperature: 0.7,      // Moins créatif, plus cohérent
                        num_predict: 512,      // Limite à ~512 tokens de sortie (augmenté pour éviter les coupures)
                        top_p: 0.9,
                        repeat_penalty: 1.1,   // Évite les répétitions
                    }
                }),
            },
            anthropic: {
                // Claude (Anthropic) - API directe
                apiKey: appState.anthropicApiKey,
                apiUrl: `${CONFIG.ANTHROPIC_API_BASE}/messages`,
                headers: (key) => ({
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01'
                }),
                payload: (p, m) => ({
                    model: m.replace('anthropic-', ''), // ex: 'anthropic-claude-sonnet-4.6' → 'claude-sonnet-4.6'
                    messages: [{ role: 'user', content: p }],
                    max_tokens: 1024
                }),
            },
            mistral: {
                // Mistral AI - API directe (format OpenAI-compatible)
                apiKey: appState.mistralApiKey,
                apiUrl: `${CONFIG.MISTRAL_API_BASE}/chat/completions`,
                headers: (key) => ({
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                }),
                payload: (p, m) => ({
                    // ex: 'mistral-direct-small-latest' → 'mistral-small-latest'
                    // ex: 'mistral-direct-large-latest' → 'mistral-large-latest'
                    model: m.replace('mistral-direct-', 'mistral-'),
                    messages: [{ role: 'user', content: p }],
                    max_tokens: 512
                }),
            }
        };

        if (isValidation) {
            const providerConfig = configs[validationProvider];
            if (!providerConfig) throw new Error("Fournisseur de validation inconnu.");
            const apiKey = providerConfig.apiKey;
            if (!apiKey) throw new Error("Clé API manquante.");
            const validationModel = modelOverride || 'gemini-2.5-flash';
            let apiUrl = typeof providerConfig.apiUrl === 'function' ? providerConfig.apiUrl(validationModel) : providerConfig.apiUrl;
            let payload = providerConfig.payload("test", validationModel);
            if (validationProvider === 'openai') payload.max_tokens = 1;
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

        return {
            apiKey,
            apiUrl: typeof config.apiUrl === 'function' ? config.apiUrl(selectedModel) : config.apiUrl,
            headers: config.headers(apiKey),
            payload: config.payload(prompt, selectedModel)
        };
    },

    /**
     * Appelle l'API d'IA pour générer du texte
     * @param {string} prompt - Le prompt à envoyer
     * @param {AICallOptions} [options={}] - Options de l'appel
     * @returns {Promise<AIResponse>} La réponse de l'IA
     * @throws {Error} En cas d'erreur API, timeout, ou annulation
     */
    async callAI(prompt, options = {}) {
        // Mode démo : retourne des réponses simulées
        if (appState.isDemoMode && !options.isValidation) {
            await new Promise(resolve => setTimeout(resolve, 1500));

            let fakeText = "Ceci est une appréciation générée en MODE DÉMO. Élève sérieux et appliqué. Les résultats sont en progression constante grâce à une participation active en classe. Continuez ainsi.";

            if (prompt.includes("Points Forts")) {
                fakeText = "### Points Forts\n* Participation active\n* Travail soigné\n### Points Faibles\n* Attention aux bavardages";
            } else if (prompt.includes("pistes d'amélioration")) {
                fakeText = "1. Participer davantage à l'oral.\n2. Relire les copies pour l'orthographe.";
            }

            return {
                text: fakeText,
                usage: { total_tokens: 123 }
            };
        }

        const { isValidation = false, signal: externalSignal, modelOverride } = options;
        const { apiUrl, headers, payload } = this._getApiConfig(prompt, options);

        const signalsToCombine = [];
        if (externalSignal) {
            signalsToCombine.push(externalSignal);
        }

        // Gestion du timeout et de l'annulation
        // Timeout plus long pour Ollama (modèles locaux lents, surtout au premier chargement)
        const selectedModel = modelOverride || appState.currentAIModel;
        const isOllamaModel = selectedModel.startsWith('ollama');
        const timeoutMs = isOllamaModel ? CONFIG.API_CALL_TIMEOUT_OLLAMA_MS : CONFIG.API_CALL_TIMEOUT_MS;

        const controller = new AbortController();
        const combinedSignal = controller.signal;

        const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);

        if (externalSignal) {
            if (externalSignal.aborted) {
                clearTimeout(timeoutId);
                return Promise.reject(new DOMException("Operation was aborted by the user.", "AbortError"));
            }
            externalSignal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                controller.abort(externalSignal.reason);
            });
        }

        const cleanup = () => clearTimeout(timeoutId);

        const startTime = Date.now(); // Mesure du temps de génération

        try {
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: combinedSignal
            });

            const res = await resp.json();
            const generationTimeMs = Date.now() - startTime; // Temps écoulé

            if (!resp.ok) {
                console.error("Erreur API détaillée:", res);
                let errorMsg = `Erreur API ${resp.status}: ${res.error?.message || res.error || res.message || res.detail || JSON.stringify(res)}`;
                if (isValidation) errorMsg = `Clé invalide (${resp.status}): ${res.error?.message || JSON.stringify(res)}`;
                throw new Error(errorMsg);
            }

            if (isValidation) return { text: 'Validation réussie', usage: null };

            // Extraction du texte selon le format de réponse (Google vs OpenAI vs Ollama)
            let text = res.response || // Ollama
                res.candidates?.[0]?.content?.parts?.[0]?.text || // Google
                res.choices?.[0]?.message?.content || // OpenAI
                "";

            // Nettoyage des balises de raisonnement (spécifique aux modèles "Thinking" comme DeepSeek R1)
            // On supprime tout ce qui est entre <think> et </think> (y compris les balises)
            text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

            // Vérifier que le texte n'est pas vide (sinon traiter comme une erreur)
            if (!text || text.trim().length === 0) {
                throw new Error("Réponse vide de l'API. Le modèle n'a pas généré de texte.");
            }
            let inTokens = 0, outTokens = 0;

            if (res.usage) {
                inTokens = res.usage.prompt_tokens;
                outTokens = res.usage.completion_tokens;
            } else if (res.usageMetadata) {
                inTokens = res.usageMetadata.promptTokenCount;
                outTokens = res.usageMetadata.candidatesTokenCount;
            } else if (res.prompt_eval_count !== undefined) {
                // Ollama format
                inTokens = res.prompt_eval_count || 0;
                outTokens = res.eval_count || 0;
            }

            // Calcul du coût de la session et accumulation des tokens
            const totalTokens = inTokens + outTokens;
            appState.sessionTokens += totalTokens;
            if (DOM.sessionTokens) DOM.sessionTokens.textContent = appState.sessionTokens.toLocaleString('fr-FR');

            const modelKey = (options.modelOverride || appState.currentAIModel).replace('openai-', '');
            if (COSTS_PER_MILLION_TOKENS[modelKey]) {
                const cost = (inTokens / 1e6 * COSTS_PER_MILLION_TOKENS[modelKey].input) + (outTokens / 1e6 * COSTS_PER_MILLION_TOKENS[modelKey].output);
                appState.sessionCost += cost;
            }

            return {
                text,
                usage: { prompt_tokens: inTokens, completion_tokens: outTokens, total_tokens: totalTokens },
                generationTimeMs // Temps de génération en millisecondes
            };
        } catch (error) {
            if (error.name === 'AbortError') {
                if (externalSignal?.aborted) {
                    throw new Error("Import annulé par l'utilisateur.");
                }
                throw new Error("La requête a expiré (timeout).");
            }
            throw error;
        } finally {
            cleanup();
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
            const url = `${CONFIG.GOOGLE_API_BASE}/models?key=${apiKey}`;
            try {
                const resp = await fetch(url);
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error?.message || JSON.stringify(data));
                return data.models || [];
            } catch (e) {
                console.error("Failed to list models", e);
                throw e;
            }
        }
        return [];
    },

    /**
     * Détermine le provider d'un modèle
     * @param {string} model - Nom du modèle
     * @returns {'google'|'openai'|'openrouter'|'ollama'|'anthropic'|'mistral'} Le provider
     */
    _getProviderForModel(model) {
        // Les modèles gratuits OpenRouter (suffixe -free) sont toujours routés vers OpenRouter
        // même s'ils contiennent "gemini" dans leur nom (ex: gemini-2.0-flash-exp-free)
        if (model.endsWith('-free')) return 'openrouter';
        if (model.startsWith('openai')) return 'openai';
        if (model.startsWith('gemini')) return 'google';
        if (model.startsWith('ollama')) return 'ollama';
        if (model.startsWith('anthropic')) return 'anthropic';
        if (model.startsWith('mistral-direct')) return 'mistral';
        return 'openrouter';
    },

    /**
     * Vérifie si la clé API est disponible pour un modèle
     * @param {string} model - Nom du modèle
     * @returns {boolean}
     */
    _hasApiKeyForModel(model) {
        const provider = this._getProviderForModel(model);
        if (provider === 'openai') return !!appState.openaiApiKey;
        if (provider === 'google') return !!appState.googleApiKey;
        if (provider === 'anthropic') return !!appState.anthropicApiKey;
        if (provider === 'mistral') return !!appState.mistralApiKey;
        if (provider === 'ollama') {
            if (!appState.ollamaEnabled) return false;
            // Vérifier si ce modèle spécifique est installé
            const modelName = model.replace('ollama-', '');
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
        return !!appState.openrouterApiKey;
    },

    /**
     * Vérifie si Ollama est disponible (serveur en cours d'exécution)
     * @returns {Promise<boolean>}
     */
    async checkOllamaAvailability() {
        try {
            const baseUrl = appState.ollamaBaseUrl || OLLAMA_CONFIG.defaultBaseUrl;
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
            const baseUrl = appState.ollamaBaseUrl || OLLAMA_CONFIG.defaultBaseUrl;
            const response = await fetch(`${baseUrl}/api/tags`);
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
        const currentProvider = this._getProviderForModel(currentModel);
        const queue = [currentModel]; // Toujours essayer le modèle actuel en premier

        // Ajouter les autres modèles du même provider
        const sameProviderModels = FALLBACK_CONFIG[currentProvider] || [];
        sameProviderModels.forEach(model => {
            if (model !== currentModel && !queue.includes(model)) {
                queue.push(model);
            }
        });

        // Ajouter les modèles des autres providers
        FALLBACK_CONFIG.providerOrder.forEach(provider => {
            if (provider !== currentProvider) {
                const providerModels = FALLBACK_CONFIG[provider] || [];
                providerModels.forEach(model => {
                    if (!queue.includes(model)) {
                        queue.push(model);
                    }
                });
            }
        });

        return queue;
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
        window.dispatchEvent(new CustomEvent('ai-generation-start', {
            detail: {
                context: options.context || null,
                studentName: options.studentName || ''
            }
        }));

        // Si le fallback est désactivé, utiliser uniquement le modèle actuel
        const fallbackEnabled = appState.enableApiFallback !== false;
        const fallbackModels = fallbackEnabled
            ? this._getFallbackQueue(appState.currentAIModel)
            : [appState.currentAIModel];
        let lastError = null;
        let attemptedModels = [];

        // Log conditionnel (visible uniquement en développement)


        try {

            for (const model of fallbackModels) {
                // Vérifier si la clé API est disponible pour ce modèle
                if (!this._hasApiKeyForModel(model)) {
                    // Modèle ignoré : pas de clé API disponible
                    continue;
                }

                // Plus de cooldown par provider - chaque modèle est traité indépendamment
                // Si un modèle échoue avec 429, on passe simplement au suivant

                attemptedModels.push(model);

                try {
                    const response = await this.callAI(prompt, { ...options, modelOverride: model });

                    // Notifier si on a basculé vers un autre modèle
                    if (model !== appState.currentAIModel && attemptedModels.length > 1) {
                        // Émettre un événement personnalisé pour notifier l'UI
                        window.dispatchEvent(new CustomEvent('ai-fallback', {
                            detail: {
                                originalModel: appState.currentAIModel,
                                usedModel: model,
                                reason: lastError?.message || 'Erreur inconnue'
                            }
                        }));
                    }

                    return { ...response, modelUsed: model };
                } catch (error) {
                    console.warn(`[AI Fallback] Modèle ${model} a échoué:`, error.message);
                    lastError = error;

                    // Erreurs non réessayables : annulation utilisateur, clé invalide
                    const isNonRetryable = error.message.includes('annulé') ||
                        error.message.includes('401') ||
                        error.message.includes('Invalid API');

                    if (isNonRetryable) {
                        throw error;
                    }

                    // Pour TOUTES les autres erreurs (timeout, quota, 429, 404, etc.)
                    // → Continuer avec le modèle suivant
                    // Le fallback doit toujours essayer les alternatives disponibles
                    continue;
                }
            }

            // Tous les modèles ont échoué

            // Extraire le temps d'attente suggéré par l'API (ex: "Please retry in 55.35s")
            let retrySeconds = null;
            if (lastError?.message) {
                const retryMatch = lastError.message.match(/retry in (\d+(?:\.\d+)?)/i);
                if (retryMatch) {
                    retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
                }
            }

            // Créer un message d'erreur clair et actionnable
            const attemptedCount = attemptedModels.length;
            const missingKeysCount = fallbackModels.length - attemptedCount;

            // Déterminer la cause principale
            const isQuotaError = lastError?.message?.includes('429') || lastError?.message?.toLowerCase().includes('quota');
            const is404Error = lastError?.message?.includes('404');

            let errorMessage = '';

            if (isQuotaError) {
                // Message quota avec temps d'attente
                const retryInfo = retrySeconds ? `Réessayez dans ~${retrySeconds}s` : 'Réessayez dans quelques instants';
                errorMessage = `Quota atteint (${attemptedCount} modèles testés). ${retryInfo}.`;

                // Ajouter un conseil si pas de provider de secours
                if (missingKeysCount > 0 && attemptedCount === missingKeysCount) {
                    // Tous les modèles testés sont du même provider
                    errorMessage += ` Ajoutez une clé OpenRouter pour un fallback automatique.`;
                }
            } else if (is404Error) {
                errorMessage = `Modèle indisponible. ${attemptedCount} modèle${attemptedCount > 1 ? 's' : ''} testé${attemptedCount > 1 ? 's' : ''}.`;
            } else {
                // Erreur générique
                errorMessage = `Échec après ${attemptedCount} modèle${attemptedCount > 1 ? 's' : ''} (${attemptedModels.join(', ')}).`;
            }

            // Ajouter l'info sur les modèles ignorés (seulement si pertinent)
            if (missingKeysCount > 0 && !isQuotaError) {
                errorMessage += ` ${missingKeysCount} ignoré${missingKeysCount > 1 ? 's' : ''} (clés manquantes).`;
            }

            throw new Error(errorMessage);
        } finally {
            // Émettre l'événement de fin de génération (pour arrêter l'animation)
            window.dispatchEvent(new CustomEvent('ai-generation-end', {
                detail: {
                    context: options.context || null, // Pass context for Single Source of Truth
                    studentName: options.studentName || ''
                }
            }));
        }
    },

    /**
     * Récupère le solde de crédits OpenRouter.
     * @returns {Promise<number|null>} Solde en dollars ou null en cas d'erreur.
     */
    async getOpenRouterCredits() {
        if (!appState.openrouterApiKey) return null;

        try {
            const response = await fetch('https://openrouter.ai/api/v1/credits', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${appState.openrouterApiKey}`,
                }
            });

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
