/**
 * @fileoverview Configuration des modèles IA, coûts et fallback.
 * Dernière vérification : 20 mars 2026
 * @module config/models
 */

export const COSTS_PER_MILLION_TOKENS = {
    // Google (clé API directe)
    'gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'gemini-2.5-pro': { input: 1.25, output: 10.00 },
    'gemini-3-flash-preview': { input: 0.20, output: 0.80 },
    'gemini-3.1-flash-lite-preview': { input: 0.25, output: 1.50 },
    'gemini-3.1-pro-preview': { input: 1.25, output: 5.00 },
    // OpenAI
    'openai-o3-mini': { input: 1.10, output: 4.40 },
    'openai-gpt-4o-mini': { input: 0.15, output: 0.60 },
    // OpenRouter - Gratuits
    'llama-3.3-70b-free': { input: 0, output: 0 },   // Quota partagé quotidien
    // OpenRouter - Payants économiques
    'ministral-3b': { input: 0.10, output: 0.10 },   // Ultra économique ~0.00005$/requête
    'amazon-nova-v1-lite': { input: 0.06, output: 0.24 },
    'openrouter': { input: 0.14, output: 0.28 },     // DeepSeek V3
    'mistral-small': { input: 0.15, output: 0.60 },
    'mistral-large': { input: 2.00, output: 6.00 },
    'claude-sonnet-4.6': { input: 3.00, output: 15.00 }, // Via OpenRouter
    // Ollama (local - gratuit)
    'ollama-qwen3:8b': { input: 0, output: 0 },
    'ollama-mistral': { input: 0, output: 0 },
    'ollama-gemma3:4b': { input: 0, output: 0 },
    // Anthropic (Claude) - API directe
    'anthropic-claude-sonnet-4.6': { input: 3.00, output: 15.00 },
    'anthropic-claude-opus-4.6': { input: 5.00, output: 25.00 },
    // Mistral - API directe (Plan Experiment gratuit : 1B tokens/mois !)
    // Les alias -latest pointent automatiquement vers la dernière version
    'mistral-direct-large-latest': { input: 0.50, output: 1.50 },
    'mistral-direct-small-latest': { input: 0.15, output: 0.60 },
};

export const MODEL_DESCRIPTIONS = {
    // OpenAI
    'openai-o3-mini': "<strong>⭐ Raisonnement.</strong> Modèle de raisonnement avancé d'OpenAI.",
    'openai-gpt-4o-mini': "Économique et performant (fin de vie prévue).",
    // Google
    'gemini-2.5-flash': "<strong>Stable.</strong> Flash éprouvé, excellent rapport qualité/prix.",
    'gemini-2.5-pro': "<strong>Standard.</strong> Excellent pour les tâches complexes.",
    'gemini-3-flash-preview': "<strong>⭐ Performant.</strong> +50% plus performant que 2.5 Flash.",
    'gemini-3.1-flash-lite-preview': "<strong>🆕 Ultra-rapide.</strong> Le plus rapide/économique de la série Gemini 3.",
    'gemini-3.1-pro-preview': "<strong>🔥 Puissant.</strong> Dernier Gemini Pro, raisonnement avancé.",
    // OpenRouter - Gratuits
    'llama-3.3-70b-free': "<strong>🆓 GRATUIT</strong> Llama 3.3 70B. Quota partagé quotidien.",
    // OpenRouter - Payants
    'ministral-3b': "<strong>~0€</strong> Ministral 3 3B. Ultra économique, excellent français.",
    'amazon-nova-v1-lite': "<strong>Économique.</strong> Amazon Nova Lite 1.0.",
    'openrouter': "DeepSeek V3. Performant et économique.",
    'mistral-small': "<strong>Français.</strong> Mistral Small 4 (via OpenRouter). Multimodal, raisonnement.",
    'mistral-large': "Mistral Large 3 (via OpenRouter). Pour textes nuancés.",
    'claude-sonnet-4.6': "<strong>✨ Recommandé.</strong> Claude Sonnet 4.6 (via OpenRouter).",
    // Ollama
    'ollama-qwen3:8b': "<strong>🏠 Local - Recommandé.</strong> Qwen 3 8B.",
    'ollama-mistral': "🏠 Local - Équilibré. Le standard Mistral 7B.",
    'ollama-gemma3:4b': "🏠 Local. Google Gemma 3.",
    'ollama-deepseek-r1:8b': "<strong>🏠 Local.</strong> DeepSeek R1.",
    // Anthropic (Claude) - API directe
    'anthropic-claude-sonnet-4.6': "Claude Sonnet 4.6. Excellent rapport qualité/prix.",
    'anthropic-claude-opus-4.6': "<strong>🔥 Le plus puissant.</strong> Claude Opus 4.6. Qualité maximale.",
    // Mistral - API directe (Plan Experiment GRATUIT : 1B tokens/mois !)
    // -latest = toujours la dernière version (actuellement Small 4, Large 3)
    'mistral-direct-large-latest': "<strong>🆓 GRATUIT</strong> Mistral Large. Le plus puissant. 1B tokens/mois offerts.",
    'mistral-direct-small-latest': "<strong>🆓 GRATUIT ⭐</strong> Mistral Small 4. Multimodal + raisonnement. 1B tokens/mois offerts.",
};

/**
 * Configuration de fallback automatique entre modèles
 * Quand un modèle échoue (quota, erreur), le système essaiera les suivants
 */
export const FALLBACK_CONFIG = {
    // Modèles les plus récents d'abord, stables en fallback
    google: ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-pro', 'gemini-3.1-pro-preview'],
    openai: ['openai-o3-mini', 'openai-gpt-4o-mini'],
    openrouter: ['llama-3.3-70b-free', 'claude-sonnet-4.6', 'ministral-3b', 'amazon-nova-v1-lite', 'openrouter', 'mistral-small', 'mistral-large'],
    ollama: ['ollama-qwen3:8b', 'ollama-mistral', 'ollama-deepseek-r1:8b', 'ollama-gemma3:4b'],
    anthropic: ['anthropic-claude-sonnet-4.6', 'anthropic-claude-opus-4.6'],
    mistral: ['mistral-direct-small-latest', 'mistral-direct-large-latest'],

    // Ordre inter-providers (priorité : local > gratuits > payants)
    // Mistral avant Anthropic car plan gratuit généreux (1B tokens/mois)
    providerOrder: ['google', 'openrouter', 'openai', 'anthropic', 'mistral', 'ollama'],
};

/**
 * Modèle recommandé par provider pour les nouveaux utilisateurs
 * Utilise le premier modèle de chaque chaîne de fallback (le plus recommandé)
 * Single Source of Truth - importé par WelcomeManager et ApiValidationManager
 */
export const PROVIDER_DEFAULT_MODELS = {
    google: FALLBACK_CONFIG.google[0],       // gemini-2.5-flash (stable, fiable)
    openai: FALLBACK_CONFIG.openai[0],       // openai-o3-mini
    openrouter: FALLBACK_CONFIG.openrouter[0], // llama-3.3-70b-free 🆓
    ollama: FALLBACK_CONFIG.ollama[0],       // ollama-qwen3:8b
    anthropic: FALLBACK_CONFIG.anthropic[0], // anthropic-claude-sonnet-4.6
    mistral: FALLBACK_CONFIG.mistral[0],     // mistral-direct-small-latest 🆓
};

/**
 * Noms courts des modèles pour l'affichage dans l'interface
 */
export const MODEL_SHORT_NAMES = {
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-3-flash-preview': 'Gemini 3 Flash',
    'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Flash-Lite',
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
    'openai-o3-mini': 'o3 Mini',
    'openai-gpt-4o-mini': 'GPT-4o Mini',
    // OpenRouter - Gratuits
    'llama-3.3-70b-free': 'Llama 3.3 70B',
    // OpenRouter - Payants
    'ministral-3b': 'Ministral 3 3B',
    'amazon-nova-v1-lite': 'Nova Lite',
    'openrouter': 'DeepSeek V3',
    'mistral-small': 'Mistral Small 4',
    'mistral-large': 'Mistral Large 3',
    'claude-sonnet-4.6': 'Claude Sonnet 4.6',
    // Ollama (local)
    'ollama-qwen3:8b': '🏠 Qwen 3 8B',
    'ollama-mistral': '🏠 Mistral 7B',
    'ollama-gemma3:4b': '🏠 Gemma 3',
    'ollama-deepseek-r1:8b': '🏠 DeepSeek R1',
    // Anthropic (Claude)
    'anthropic-claude-sonnet-4.6': 'Claude Sonnet 4.6',
    'anthropic-claude-opus-4.6': 'Claude Opus 4.6',
    // Mistral (API directe - GRATUIT)
    'mistral-direct-large-latest': 'Mistral Large 3',
    'mistral-direct-small-latest': 'Mistral Small 4',
};


/**
 * Configuration du sélecteur de modèle dans l'interface.
 * Single Source of Truth : les noms viennent de MODEL_SHORT_NAMES,
 * seuls les qualificatifs et le groupement sont définis ici.
 */
export const MODEL_SELECTOR_CONFIG = [
    {
        label: '🐱 Mistral AI — GRATUIT 🇫🇷 (1B tokens/mois)',
        models: [
            { id: 'mistral-direct-small-latest', qualifier: 'Recommandé' },
            { id: 'mistral-direct-large-latest', qualifier: 'Puissant' },
        ]
    },
    {
        label: '💚 Google Gemini — QUOTA GRATUIT',
        models: [
            { id: 'gemini-2.5-flash', qualifier: 'Stable' },
            { id: 'gemini-3-flash-preview', qualifier: 'Rapide' },
            { id: 'gemini-3.1-flash-lite-preview', qualifier: 'Ultra-rapide' },
            { id: 'gemini-2.5-pro', qualifier: 'Équilibré' },
            { id: 'gemini-3.1-pro-preview', qualifier: 'Puissant' },
        ]
    },
    {
        label: '💚 OpenRouter — QUOTA GRATUIT',
        models: [
            { id: 'llama-3.3-70b-free', qualifier: 'Puissant - Journalier' },
        ]
    },
    {
        label: '💰 OpenRouter — PAYANT (économique)',
        models: [
            { id: 'claude-sonnet-4.6', qualifier: 'Puissant' },
            { id: 'ministral-3b', qualifier: '~0€, Mistral' },
            { id: 'amazon-nova-v1-lite', qualifier: 'Très économique' },
            { id: 'openrouter', qualifier: 'Économique' },
            { id: 'mistral-small', qualifier: 'Français' },
            { id: 'mistral-large', qualifier: 'Puissant' },
        ]
    },
    {
        label: '💰 OpenAI — PAYANT',
        models: [
            { id: 'openai-o3-mini', qualifier: 'Raisonnement' },
            { id: 'openai-gpt-4o-mini', qualifier: 'Économique' },
        ]
    },
    {
        label: '💰 Anthropic Claude — PAYANT',
        models: [
            { id: 'anthropic-claude-sonnet-4.6', qualifier: 'Puissant' },
            { id: 'anthropic-claude-opus-4.6', qualifier: 'Le plus puissant' },
        ]
    },
    {
        label: '🏠 Ollama — LOCAL',
        models: [
            { id: 'ollama-qwen3:8b', qualifier: 'Recommandé' },
            { id: 'ollama-mistral', qualifier: 'Standard' },
            { id: 'ollama-deepseek-r1:8b', qualifier: 'Raisonnement' },
        ]
    },
];

/**
 * Configuration Ollama
 */
export const OLLAMA_CONFIG = {
    defaultBaseUrl: 'http://localhost:11434',
    apiEndpoint: '/api/generate',
    timeoutMs: 120000,
};
