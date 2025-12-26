/**
 * @fileoverview Configuration des modèles IA, coûts et fallback.
 * @module config/models
 */

export const COSTS_PER_MILLION_TOKENS = {
    'gemini-1.5-flash-001': { input: 0.35, output: 0.70 },
    'gemini-1.5-pro-001': { input: 3.50, output: 10.50 },
    'gemini-1.5-flash': { input: 0.35, output: 0.70 }, // Alias backward compat
    'gemini-2.5-flash': { input: 0.35, output: 0.70 },
    'gemini-3-flash-preview': { input: 0.35, output: 0.70 },
    'gemini-2.5-pro': { input: 3.50, output: 10.50 },
    'gemini-2.0-flash': { input: 0.35, output: 0.70 },
    'gemini-2.0-flash-lite': { input: 0.20, output: 0.40 },
    'openai-gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'openai-gpt-4o': { input: 5.00, output: 15.00 },
    'openai-gpt-4o-mini': { input: 0.15, output: 0.60 },
    'openai-gpt-4-turbo': { input: 10.00, output: 30.00 },
    'openrouter': { input: 0.14, output: 0.28 },
    'devstral-free': { input: 0, output: 0 }, // Gratuit sur OpenRouter !
    'qwen3-235b-free': { input: 0, output: 0 }, // Gratuit sur OpenRouter !
    'qwen3-4b-free': { input: 0, output: 0 }, // Gratuit sur OpenRouter !
    'gemini-2.0-flash-exp-free': { input: 0, output: 0 }, // Gemini GRATUIT !
    'mistral-small-free': { input: 0, output: 0 }, // Mistral Small GRATUIT !
    'llama-3.3-70b-free': { input: 0, output: 0 }, // Llama 70B GRATUIT !
    'amazon-nova-lite-free': { input: 0, output: 0 }, // Amazon Nova 2 Lite GRATUIT !
    'deepseek-nex-free': { input: 0, output: 0 }, // DeepSeek V3.1 Nex N1 GRATUIT !
    'deepseek-r1-free': { input: 0, output: 0 }, // DeepSeek R1 GRATUIT !
    'minimax-m21': { input: 0.50, output: 1.50 }, // MiniMax M2.1 - léger et concis
    'mistral-small': { input: 0.10, output: 0.30 },
    'mistral-large': { input: 2.00, output: 6.00 },
    // Ollama (local) - gratuit
    'ollama-qwen3:8b': { input: 0, output: 0 },
    'ollama-qwen3:4b': { input: 0, output: 0 },
    'ollama-gemma3:4b': { input: 0, output: 0 },
};

export const MODEL_DESCRIPTIONS = {
    'openai-gpt-3.5-turbo': "Modèle rapide et économique d'OpenAI. Un excellent point de départ.",
    'openai-gpt-4o': "Le modèle le plus puissant d'OpenAI. Idéal pour des nuances complexes.",
    'openai-gpt-4o-mini': "<strong>Recommandé.</strong> Modèle économique et performant d'OpenAI. Excellent rapport qualité/prix.",
    'openai-gpt-4-turbo': "Version turbo de GPT-4. Rapide et très capable pour les tâches complexes.",
    'gemini-1.5-flash': "<strong>Stable.</strong> Modèle Gemini 1.5 Flash. Bon rapport qualité/prix.",
    'gemini-1.5-flash-001': "<strong>Stable.</strong> Le modèle standard (v001). Bon rapport qualité/prix.",
    'gemini-1.5-pro-001': "Le modèle Gemini Pro (v001). Idéal pour une qualité de rédaction maximale.",
    'gemini-2.5-flash': "<strong>Stable.</strong> Version éprouvée de Flash. Fiable et performant.",
    'gemini-3-flash-preview': "<strong>⭐</strong> Intelligence Pro, vitesse Flash. Raisonnement dynamique, +50% plus performant.",
    'gemini-2.5-pro': "<strong>Nouveau.</strong> Version avancée de Pro. (Vérifiez votre accès).",
    'gemini-2.0-flash-lite': "Modèle très rapide et extrêmement économique, parfait pour les tâches à grand volume.",

    'openrouter': "Utilise votre clé OpenRouter pour accéder à de nombreux modèles. Par défaut, l'application utilise une option performante et très économique (DeepSeek V3).",
    'devstral-free': "<strong>🆓 GRATUIT !</strong> Mistral Devstral 123B via OpenRouter. Puissant et sans frais.",
    'qwen3-235b-free': "<strong>🆓 GRATUIT !</strong> Qwen3 235B (22B actifs). Très puissant, excellent en français.",
    'qwen3-4b-free': "<strong>🆓 GRATUIT !</strong> Qwen3 4B. Rapide et léger, bon rapport qualité/vitesse.",
    'gemini-2.0-flash-exp-free': "<strong>🆓 GRATUIT !</strong> Google Gemini 2.0 Flash Experimental. Rapide et puissant.",
    'mistral-small-free': "<strong>🆓 GRATUIT !</strong> Mistral Small 3.1 24B. Excellent modèle polyvalent.",
    'llama-3.3-70b-free': "<strong>🆓 GRATUIT !</strong> Meta Llama 3.3 70B. Très puissant, bon en français.",
    'amazon-nova-lite-free': "<strong>Ultra Rapide (2s).</strong> Amazon Nova 2 Lite. Idéal pour les gros volumes, qualité standard.",
    'deepseek-nex-free': "<strong>🆓 GRATUIT !</strong> DeepSeek V3.1 Nex N1. Très capable, bon en texte.",
    'deepseek-r1-free': "<strong>🆓 GRATUIT !</strong> DeepSeek R1 (Raisonnement). Très intelligent mais plus lent.",
    'minimax-m21': "<strong>Qualité supérieure (~7s).</strong> MiniMax M2.1. Réponses concises et efficaces.",
    'mistral-small': "<strong>Économique.</strong> Modèle Mistral léger et rapide via OpenRouter. Excellent pour les appréciations.",
    'mistral-large': "Modèle Mistral puissant via OpenRouter. Idéal pour des textes nuancés.",
    // Ollama (local)
    'ollama-qwen3:8b': "<strong>🏠 Local - Recommandé.</strong> Qwen 3 8B d'Alibaba. Excellent en français, rapide et précis.",
    'ollama-qwen3:4b': "🏠 Local - Léger. Qwen 3 4B. Très rapide, idéal pour PC modestes.",
    'ollama-gemma3:4b': "🏠 Local. Google Gemma 3. Bonne qualité.",
    'ollama-deepseek-r1:8b': "<strong>🏠 Local - Puissant.</strong> DeepSeek R1. Très performant pour le raisonnement.",
};

/**
 * Configuration de fallback automatique entre modèles
 * Quand un modèle échoue (quota, erreur), le système essaiera les suivants
 */
export const FALLBACK_CONFIG = {
    // Ordre de fallback par provider (du plus prioritaire au moins prioritaire)
    google: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro-001', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'],
    openai: ['openai-gpt-4o-mini', 'openai-gpt-3.5-turbo', 'openai-gpt-4o'],
    openrouter: ['amazon-nova-lite-free', 'deepseek-nex-free', 'deepseek-r1-free', 'gemini-2.0-flash-exp-free', 'llama-3.3-70b-free', 'mistral-small-free', 'qwen3-235b-free', 'qwen3-4b-free', 'devstral-free', 'minimax-m21', 'mistral-small', 'openrouter', 'mistral-large'],
    // Ollama (local) - Qwen3 recommandé car excellent en français
    ollama: ['ollama-qwen3:8b', 'ollama-deepseek-r1:8b', 'ollama-qwen3:4b', 'ollama-gemma3:4b'],

    // Ordre de fallback inter-providers (si le provider principal échoue complètement)
    // Ollama en premier car local, gratuit et sans limite de quota
    providerOrder: ['ollama', 'google', 'openrouter', 'openai'],
};

/**
 * Noms courts des modèles pour l'affichage dans l'interface
 */
export const MODEL_SHORT_NAMES = {
    'gemini-2.5-flash': '2.5 Flash',
    'gemini-3-flash-preview': '3 Flash ⚡',

    'gemini-2.0-flash-lite': '2.0 Flash Lite',
    'gemini-1.5-flash': '1.5 Flash',
    'gemini-2.5-pro': '2.5 Pro',
    'openai-gpt-4o-mini': 'GPT-4o Mini',
    'openai-gpt-4o': 'GPT-4o',
    'openai-gpt-3.5-turbo': 'GPT-3.5',
    'mistral-small': 'Mistral Small',
    'mistral-large': 'Mistral Large',
    'devstral-free': 'Devstral',
    'qwen3-235b-free': 'Qwen3 235B',
    'qwen3-4b-free': 'Qwen3 4B',
    'gemini-2.0-flash-exp-free': 'Gemini 2.0',
    'mistral-small-free': 'Mistral Small',
    'llama-3.3-70b-free': 'Llama 3.3 70B',
    'amazon-nova-lite-free': 'Amazon Nova',
    'deepseek-nex-free': 'DeepSeek V3.1',
    'deepseek-r1-free': 'DeepSeek R1',
    'minimax-m21': 'MiniMax M2.1',
    'openrouter': 'DeepSeek V3',
    // Ollama (local)
    'ollama-qwen3:8b': '🏠 Qwen 3 (8B)',
    'ollama-qwen3:4b': '🏠 Qwen 3 (4B)',
    'ollama-gemma3:4b': '🏠 Gemma 3',
    'ollama-deepseek-r1:8b': '🏠 DeepSeek R1',
};

/**
 * Configuration Ollama
 */
export const OLLAMA_CONFIG = {
    // URL par défaut du serveur Ollama
    defaultBaseUrl: 'http://localhost:11434',
    // Endpoint API compatible OpenAI
    apiEndpoint: '/api/generate',
    // Timeout plus long pour les modèles locaux (peuvent être plus lents)
    timeoutMs: 120000, // 2 minutes
};

/**
 * Rate limits par modèle (tier gratuit Google)
 * delayMs = délai minimum entre requêtes pour respecter le quota RPM
 * rpm = requêtes par minute autorisées
 */
export const RATE_LIMITS = {
    // Google Gemini (tier gratuit) - quotas stricts
    'gemini-2.5-flash': { rpm: 10, delayMs: 6000 },      // 10 RPM → 6s entre requêtes
    'gemini-3-flash-preview': { rpm: 10, delayMs: 6000 }, // Preview: mêmes limites que 2.5 Flash
    'gemini-2.0-flash': { rpm: 15, delayMs: 4000 },      // 15 RPM → 4s entre requêtes
    'gemini-2.0-flash-lite': { rpm: 30, delayMs: 2000 }, // 30 RPM → 2s entre requêtes
    'gemini-2.5-pro': { rpm: 5, delayMs: 12000 },        // 5 RPM → 12s entre requêtes

    // OpenAI et OpenRouter - payants, pas de limite stricte par minute
    'openai-gpt-4o-mini': { rpm: 500, delayMs: 200 },
    'openai-gpt-4o': { rpm: 500, delayMs: 200 },
    'openai-gpt-3.5-turbo': { rpm: 500, delayMs: 200 },
    'mistral-small': { rpm: 100, delayMs: 600 },
    'mistral-large': { rpm: 100, delayMs: 600 },
    'devstral-free': { rpm: 20, delayMs: 3000 }, // Gratuit → rate limit plus strict probable
    'qwen3-235b-free': { rpm: 20, delayMs: 3000 }, // Gratuit → rate limit conservateur
    'qwen3-4b-free': { rpm: 30, delayMs: 2000 }, // Gratuit petit modèle → un peu plus souple
    'gemini-2.0-flash-exp-free': { rpm: 20, delayMs: 3000 }, // Gratuit Google
    'mistral-small-free': { rpm: 20, delayMs: 3000 }, // Gratuit Mistral
    'llama-3.3-70b-free': { rpm: 15, delayMs: 4000 }, // Gratuit Meta, modèle lourd
    'amazon-nova-lite-free': { rpm: 20, delayMs: 3000 }, // Gratuit Amazon
    'deepseek-nex-free': { rpm: 20, delayMs: 3000 }, // Gratuit DeepSeek Nex
    'deepseek-r1-free': { rpm: 10, delayMs: 6000 }, // Gratuit R1 (lourd)
    'minimax-m21': { rpm: 60, delayMs: 1000 }, // MiniMax M2.1 - modèle léger, rapide
    'openrouter': { rpm: 100, delayMs: 600 },

    // Ollama (local) - pas de rate limit
    'ollama-qwen3:8b': { rpm: 999, delayMs: 500 },
    'ollama-qwen3:4b': { rpm: 999, delayMs: 300 },
    'ollama-gemma3:4b': { rpm: 999, delayMs: 500 },
    'ollama-deepseek-r1:8b': { rpm: 999, delayMs: 1000 }, // DeepSeek R1 peut être plus lent (pensée)

    // Valeur par défaut (conservative)
    'default': { rpm: 10, delayMs: 6000 }
};
