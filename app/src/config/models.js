/**
 * @fileoverview Configuration des modèles IA, coûts et fallback.
 * @module config/models
 */

export const COSTS_PER_MILLION_TOKENS = {
    // Google (clé API directe)
    'gemini-1.5-flash-001': { input: 0.35, output: 0.70 },
    'gemini-1.5-pro-001': { input: 3.50, output: 10.50 },
    'gemini-1.5-flash': { input: 0.35, output: 0.70 },
    'gemini-2.5-flash': { input: 0.35, output: 0.70 },
    'gemini-3-flash-preview': { input: 0.35, output: 0.70 },
    'gemini-2.5-pro': { input: 1.25, output: 10.00 },
    'gemini-3-pro': { input: 2.00, output: 12.00 },
    'gemini-2.0-flash': { input: 0.35, output: 0.70 },
    'gemini-2.0-flash-lite': { input: 0.20, output: 0.40 },
    // OpenAI
    'openai-gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'openai-gpt-4o': { input: 5.00, output: 15.00 },
    'openai-gpt-4o-mini': { input: 0.15, output: 0.60 },
    'openai-gpt-4-turbo': { input: 10.00, output: 30.00 },
    // OpenRouter - Gratuits
    'devstral-free': { input: 0, output: 0 },        // ⭐ Quota indépendant
    'llama-3.3-70b-free': { input: 0, output: 0 },   // Quota partagé quotidien
    // OpenRouter - Payants économiques
    'ministral-3b': { input: 0.10, output: 0.10 },   // Ultra économique ~0.00005$/requête
    'amazon-nova-v1-lite': { input: 0.06, output: 0.24 },
    'openrouter': { input: 0.14, output: 0.28 },     // DeepSeek V3
    'mistral-small': { input: 0.10, output: 0.30 },
    'mistral-large': { input: 2.00, output: 6.00 },
    'claude-sonnet-4.5': { input: 3.00, output: 15.00 }, // Via OpenRouter
    // Ollama (local - gratuit)
    'ollama-qwen3:8b': { input: 0, output: 0 },
    'ollama-mistral': { input: 0, output: 0 },
    'ollama-gemma3:4b': { input: 0, output: 0 },
    // Anthropic (Claude) - API directe
    'anthropic-claude-sonnet-4.5': { input: 3.00, output: 15.00 },  // Meilleur rapport qualité/prix
    'anthropic-claude-opus-4.5': { input: 5.00, output: 25.00 },    // Le plus puissant
    // Mistral - API directe (Plan Experiment gratuit : 1B tokens/mois !)
    'mistral-direct-large-latest': { input: 0.50, output: 1.50 },  // Mistral Large 3
    'mistral-direct-small-latest': { input: 0.10, output: 0.30 },  // Mistral Small 3.1
};

export const MODEL_DESCRIPTIONS = {
    // OpenAI
    'openai-gpt-3.5-turbo': "Modèle rapide et économique d'OpenAI.",
    'openai-gpt-4o': "Le modèle le plus puissant d'OpenAI.",
    'openai-gpt-4o-mini': "Économique et performant.",
    'openai-gpt-4-turbo': "Version turbo de GPT-4. Rapide.",
    // Google
    'gemini-1.5-flash': "<strong>Stable.</strong> Gemini 1.5 Flash.",
    'gemini-1.5-flash-001': "<strong>Stable.</strong> Le modèle standard.",
    'gemini-1.5-pro-001': "Gemini Pro. Qualité maximale.",
    'gemini-2.5-flash': "<strong>Stable.</strong> Flash éprouvé.",
    'gemini-3-flash-preview': "<strong>⭐</strong> +50% plus performant.",
    'gemini-2.5-pro': "<strong>Standard.</strong> Excellent rapport qualité/prix.",
    'gemini-3-pro': "<strong>Nouveau.</strong> Le plus puissant.",
    'gemini-2.0-flash-lite': "Très rapide et économique.",
    // OpenRouter - Gratuits
    'devstral-free': "<strong>⭐ GRATUIT</strong> Devstral. Quota indépendant (illimité).",
    'llama-3.3-70b-free': "<strong>🆓 GRATUIT</strong> Llama 3.3 70B. Quota partagé quotidien.",
    // OpenRouter - Payants
    'ministral-3b': "<strong>~0€</strong> Mistral 3B. Ultra économique, excellent français.",
    'amazon-nova-v1-lite': "<strong>Économique.</strong> Amazon Nova Lite 1.0.",
    'openrouter': "DeepSeek V3. Performant et économique.",
    'mistral-small': "<strong>Français.</strong> Mistral Small.",
    'mistral-large': "Mistral Large. Pour textes nuancés.",
    'claude-sonnet-4.5': "<strong>✨ Recommandé.</strong> Claude Sonnet 4.5 (via OpenRouter).",
    // Ollama
    'ollama-qwen3:8b': "<strong>🏠 Local - Recommandé.</strong> Qwen 3 8B.",
    'ollama-mistral': "🏠 Local - Équilibré. Le standard Mistral 7B.",
    'ollama-gemma3:4b': "🏠 Local. Google Gemma 3.",
    'ollama-deepseek-r1:8b': "<strong>🏠 Local.</strong> DeepSeek R1.",
    // Anthropic (Claude) - API directe
    'anthropic-claude-sonnet-4.5': "Claude Sonnet 4.5. Excellent rapport qualité/prix.",
    'anthropic-claude-opus-4.5': "<strong>🔥 Le plus puissant.</strong> Claude Opus 4.5. Qualité maximale.",
    // Mistral - API directe (Plan Experiment GRATUIT : 1B tokens/mois !)
    'mistral-direct-large-latest': "<strong>🆓 GRATUIT</strong> Mistral Large 3. Le plus puissant. 1B tokens/mois offerts.",
    'mistral-direct-small-latest': "<strong>🆓 GRATUIT ⭐</strong> Mistral Small 3.1. Excellent français. 1B tokens/mois offerts.",
};

/**
 * Configuration de fallback automatique entre modèles
 * Quand un modèle échoue (quota, erreur), le système essaiera les suivants
 */
export const FALLBACK_CONFIG = {
    // Gratuits sponsorisés d'abord, puis payants économiques
    google: ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro-001', 'gemini-2.0-flash-lite'],
    openai: ['openai-gpt-4o-mini', 'openai-gpt-3.5-turbo', 'openai-gpt-4o'],
    openrouter: ['devstral-free', 'llama-3.3-70b-free', 'claude-sonnet-4.5', 'ministral-3b', 'amazon-nova-v1-lite', 'openrouter', 'mistral-small', 'mistral-large'],
    ollama: ['ollama-qwen3:8b', 'ollama-mistral', 'ollama-deepseek-r1:8b', 'ollama-gemma3:4b'],
    anthropic: ['anthropic-claude-sonnet-4.5', 'anthropic-claude-opus-4.5'],
    mistral: ['mistral-direct-small-latest', 'mistral-direct-large-latest'],

    // Ordre inter-providers (priorité : local > gratuits > payants)
    // Mistral avant Anthropic car plan gratuit généreux (1B tokens/mois)
    providerOrder: ['ollama', 'google', 'mistral', 'openrouter', 'anthropic', 'openai'],
};

/**
 * Modèle recommandé par provider pour les nouveaux utilisateurs
 * Utilise le premier modèle de chaque chaîne de fallback (le plus recommandé)
 * Single Source of Truth - importé par WelcomeManager et ApiValidationManager
 */
export const PROVIDER_DEFAULT_MODELS = {
    google: FALLBACK_CONFIG.google[0],       // gemini-3-flash-preview
    openai: FALLBACK_CONFIG.openai[0],       // openai-gpt-4o-mini
    openrouter: FALLBACK_CONFIG.openrouter[0], // devstral-free 🆓
    ollama: FALLBACK_CONFIG.ollama[0],       // ollama-qwen3:8b
    anthropic: FALLBACK_CONFIG.anthropic[0], // anthropic-claude-sonnet-4.5
    mistral: FALLBACK_CONFIG.mistral[0],     // mistral-direct-small-latest 🆓
};

/**
 * Noms courts des modèles pour l'affichage dans l'interface
 */
export const MODEL_SHORT_NAMES = {
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-3-flash-preview': 'Gemini 3 Flash',
    'gemini-2.0-flash-lite': 'Gemini 2.0 Lite',
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-3-pro': 'Gemini 3 Pro',
    'openai-gpt-4o-mini': 'GPT-4o Mini',
    'openai-gpt-4o': 'GPT-4o',
    'openai-gpt-3.5-turbo': 'GPT-3.5',
    // OpenRouter - Gratuits
    'devstral-free': 'Devstral',
    'llama-3.3-70b-free': 'Llama 3.3 70B',
    // OpenRouter - Payants
    'ministral-3b': 'Ministral 3B',
    'amazon-nova-v1-lite': 'Nova Lite',
    'openrouter': 'DeepSeek V3',
    'mistral-small': 'Mistral Small',
    'mistral-large': 'Mistral Large',
    'claude-sonnet-4.5': 'Claude Sonnet 4.5',
    // Ollama (local)
    'ollama-qwen3:8b': '🏠 Qwen 3 8B',
    'ollama-mistral': '🏠 Mistral 7B',
    'ollama-gemma3:4b': '🏠 Gemma 3',
    'ollama-deepseek-r1:8b': '🏠 DeepSeek R1',
    // Anthropic (Claude)
    'anthropic-claude-sonnet-4.5': 'Claude Sonnet 4.5',
    'anthropic-claude-opus-4.5': 'Claude Opus 4.5',
    // Mistral (API directe - GRATUIT)
    'mistral-direct-large-latest': 'Mistral Large 3',
    'mistral-direct-small-latest': 'Mistral Small 3.1',
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
