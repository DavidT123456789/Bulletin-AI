/**
 * @fileoverview Configuration des modèles IA, coûts et fallback.
 * Support complet des modèles de dernière génération (Gemini 3.7, Claude Sonnet 5)
 * et de la génération éprouvée (Gemini 2.5, Claude 3.7 / 3.5).
 * @module config/models
 */

export const COSTS_PER_MILLION_TOKENS = {
    // Google (clé API directe)
    'gemini-3.5-flash': { input: 0.15, output: 0.60 },
    'gemini-3.7-flash': { input: 0.15, output: 0.60 },
    'gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'gemini-2.5-pro': { input: 1.25, output: 10.00 },
    // OpenAI
    'openai-o3-mini': { input: 1.10, output: 4.40 },
    'openai-gpt-4o-mini': { input: 0.15, output: 0.60 },
    // OpenRouter - Gratuits
    'llama-3.3-70b-free': { input: 0, output: 0 },   // Quota partagé quotidien
    // OpenRouter - Payants économiques
    'ministral-3b': { input: 0.10, output: 0.10 },   // Ultra économique ~0.00005$/requête
    'amazon-nova-v1-lite': { input: 0.06, output: 0.24 },
    'openrouter': { input: 0.14, output: 0.28 },     // DeepSeek V3
    'deepseek-r1': { input: 0.55, output: 2.19 },    // DeepSeek R1 Raisonnement
    'mistral-small': { input: 0.15, output: 0.60 },
    'mistral-large': { input: 2.00, output: 6.00 },
    'claude-sonnet-5': { input: 3.00, output: 15.00 },   // Via OpenRouter
    'claude-3.7-sonnet': { input: 3.00, output: 15.00 }, // Via OpenRouter
    'claude-3.5-sonnet': { input: 3.00, output: 15.00 }, // Via OpenRouter
    // Ollama (local - gratuit)
    'ollama-qwen2.5:7b': { input: 0, output: 0 },
    'ollama-mistral:7b': { input: 0, output: 0 },
    'ollama-deepseek-r1:8b': { input: 0, output: 0 },
    'ollama-gemma2:9b': { input: 0, output: 0 },
    // Anthropic (Claude) - API directe
    'anthropic-claude-sonnet-5': { input: 3.00, output: 15.00 },
    'anthropic-claude-3-7-sonnet-latest': { input: 3.00, output: 15.00 },
    'anthropic-claude-3-5-sonnet-latest': { input: 3.00, output: 15.00 },
    'anthropic-claude-3-5-haiku-latest': { input: 0.80, output: 4.00 },
    'anthropic-claude-opus-5': { input: 5.00, output: 25.00 },
    // Mistral - API directe (Plan Experiment gratuit : 1B tokens/mois !)
    // Les alias -latest pointent automatiquement vers la dernière version
    'mistral-direct-large-latest': { input: 0.50, output: 1.50 },
    'mistral-direct-small-latest': { input: 0.15, output: 0.60 },
};

export const MODEL_DESCRIPTIONS = {
    // OpenAI
    'openai-o3-mini': "<strong>⭐ Raisonnement.</strong> Modèle de raisonnement avancé d'OpenAI.",
    'openai-gpt-4o-mini': "Économique et performant.",
    // Google
    'gemini-3.7-flash': "<strong>⭐ Recommandé.</strong> Dernière génération Google, raisonnement hybride ultra-rapide.",
    'gemini-3.5-flash': "<strong>Rapide & Éprouvé.</strong> Réponse instantanée et grande fluidité.",
    'gemini-2.5-pro': "<strong>🔥 Synthèses complexes.</strong> Idéal pour les dossiers denses et nuancés.",
    'gemini-2.5-flash': "<strong>Stable.</strong> Flash éprouvé, excellent rapport qualité/prix.",
    // OpenRouter - Gratuits
    'llama-3.3-70b-free': "<strong>🆓 GRATUIT</strong> Llama 3.3 70B. Quota partagé quotidien.",
    // OpenRouter - Payants
    'claude-sonnet-5': "<strong>✨ Recommandé.</strong> Claude Sonnet 5 (via OpenRouter). Finesse stylistique.",
    'claude-3.7-sonnet': "Claude 3.7 Sonnet (via OpenRouter). Raisonnement hybride.",
    'claude-3.5-sonnet': "Claude 3.5 Sonnet (via OpenRouter). Précis et fluide.",
    'openrouter': "DeepSeek V3. Performant et très économique.",
    'deepseek-r1': "<strong>⭐ Raisonnement.</strong> DeepSeek R1 (via OpenRouter).",
    'ministral-3b': "<strong>~0€</strong> Ministral 3 3B. Ultra économique, excellent français.",
    'amazon-nova-v1-lite': "<strong>Économique.</strong> Amazon Nova Lite 1.0.",
    'mistral-small': "<strong>Français.</strong> Mistral Small (via OpenRouter).",
    'mistral-large': "Mistral Large (via OpenRouter). Pour textes nuancés.",
    // Ollama
    'ollama-qwen2.5:7b': "<strong>🏠 Local - Recommandé.</strong> Qwen 2.5 7B. Excellent en français.",
    'ollama-mistral:7b': "🏠 Local - Équilibré. Le standard Mistral 7B.",
    'ollama-deepseek-r1:8b': "<strong>🏠 Local.</strong> DeepSeek R1 8B (Raisonnement).",
    'ollama-gemma2:9b': "🏠 Local. Google Gemma 2 9B.",
    // Anthropic (Claude) - API directe
    'anthropic-claude-sonnet-5': "<strong>✨ Recommandé.</strong> Claude Sonnet 5. Finesse stylistique et équilibre.",
    'anthropic-claude-3-7-sonnet-latest': "Claude 3.7 Sonnet. Raisonnement hybride et style rédactionnel.",
    'anthropic-claude-3-5-sonnet-latest': "Claude 3.5 Sonnet. Rédaction fluide et nuancée.",
    'anthropic-claude-3-5-haiku-latest': "<strong>⚡ Économique & Rapide.</strong> Claude 3.5 Haiku.",
    'anthropic-claude-opus-5': "<strong>🔥 Puissance maximale.</strong> Claude Opus 5. Qualité maximale.",
    // Mistral - API directe (Plan Experiment GRATUIT : 1B tokens/mois !)
    'mistral-direct-small-latest': "<strong>🆓 GRATUIT ⭐</strong> Mistral Small. Multimodal + raisonnement. 1B tokens/mois offerts.",
    'mistral-direct-large-latest': "<strong>🆓 GRATUIT</strong> Mistral Large. Le plus puissant. 1B tokens/mois offerts.",
};

/**
 * Configuration de fallback automatique entre modèles
 * Quand un modèle échoue (quota, 404, rate limit), le système essaiera les suivants
 */
export const FALLBACK_CONFIG = {
    // Modèles les plus récents d'abord, stables en fallback
    google: ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    openai: ['openai-o3-mini', 'openai-gpt-4o-mini'],
    openrouter: ['llama-3.3-70b-free', 'claude-sonnet-5', 'claude-3.7-sonnet', 'claude-3.5-sonnet', 'ministral-3b', 'openrouter', 'deepseek-r1', 'amazon-nova-v1-lite', 'mistral-small', 'mistral-large'],
    ollama: ['ollama-qwen2.5:7b', 'ollama-mistral:7b', 'ollama-deepseek-r1:8b', 'ollama-gemma2:9b'],
    anthropic: ['anthropic-claude-sonnet-5', 'anthropic-claude-3-7-sonnet-latest', 'anthropic-claude-3-5-sonnet-latest', 'anthropic-claude-3-5-haiku-latest', 'anthropic-claude-opus-5'],
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
    google: FALLBACK_CONFIG.google[0],       // gemini-3.7-flash
    openai: FALLBACK_CONFIG.openai[0],       // openai-o3-mini
    openrouter: FALLBACK_CONFIG.openrouter[0], // llama-3.3-70b-free 🆓
    ollama: FALLBACK_CONFIG.ollama[0],       // ollama-qwen2.5:7b
    anthropic: FALLBACK_CONFIG.anthropic[0], // anthropic-claude-sonnet-5
    mistral: FALLBACK_CONFIG.mistral[0],     // mistral-direct-small-latest 🆓
};

/**
 * Noms courts des modèles pour l'affichage dans l'interface
 */
export const MODEL_SHORT_NAMES = {
    'gemini-3.7-flash': 'Gemini 3.7 Flash',
    'gemini-3.5-flash': 'Gemini 3.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'openai-o3-mini': 'o3 Mini',
    'openai-gpt-4o-mini': 'GPT-4o Mini',
    // OpenRouter - Gratuits
    'llama-3.3-70b-free': 'Llama 3.3 70B',
    // OpenRouter - Payants
    'claude-sonnet-5': 'Claude Sonnet 5',
    'claude-3.7-sonnet': 'Claude 3.7 Sonnet',
    'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
    'openrouter': 'DeepSeek V3',
    'deepseek-r1': 'DeepSeek R1',
    'ministral-3b': 'Ministral 3 3B',
    'amazon-nova-v1-lite': 'Nova Lite',
    'mistral-small': 'Mistral Small',
    'mistral-large': 'Mistral Large',
    // Ollama (local)
    'ollama-qwen2.5:7b': '🏠 Qwen 2.5 7B',
    'ollama-mistral:7b': '🏠 Mistral 7B',
    'ollama-deepseek-r1:8b': '🏠 DeepSeek R1',
    'ollama-gemma2:9b': '🏠 Gemma 2 9B',
    // Anthropic (Claude)
    'anthropic-claude-sonnet-5': 'Claude Sonnet 5',
    'anthropic-claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet',
    'anthropic-claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
    'anthropic-claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
    'anthropic-claude-opus-5': 'Claude Opus 5',
    // Mistral (API directe - GRATUIT)
    'mistral-direct-small-latest': 'Mistral Small',
    'mistral-direct-large-latest': 'Mistral Large',
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
            { id: 'gemini-3.7-flash', qualifier: 'Recommandé' },
            { id: 'gemini-3.5-flash', qualifier: 'Rapide & Éprouvé' },
            { id: 'gemini-2.5-pro', qualifier: 'Synthèses complexes' },
            { id: 'gemini-2.5-flash', qualifier: 'Stable' },
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
            { id: 'claude-sonnet-5', qualifier: 'Recommandé' },
            { id: 'claude-3.7-sonnet', qualifier: 'Raisonnement' },
            { id: 'claude-3.5-sonnet', qualifier: 'Stable' },
            { id: 'openrouter', qualifier: 'Économique' },
            { id: 'deepseek-r1', qualifier: 'Raisonnement' },
            { id: 'ministral-3b', qualifier: '~0€, Mistral' },
            { id: 'amazon-nova-v1-lite', qualifier: 'Très économique' },
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
            { id: 'anthropic-claude-sonnet-5', qualifier: 'Recommandé' },
            { id: 'anthropic-claude-3-7-sonnet-latest', qualifier: 'Raisonnement' },
            { id: 'anthropic-claude-3-5-sonnet-latest', qualifier: 'Stable' },
            { id: 'anthropic-claude-3-5-haiku-latest', qualifier: 'Économique & Rapide' },
            { id: 'anthropic-claude-opus-5', qualifier: 'Puissance maximale' },
        ]
    },
    {
        label: '🏠 Ollama — LOCAL',
        models: [
            { id: 'ollama-qwen2.5:7b', qualifier: 'Recommandé' },
            { id: 'ollama-mistral:7b', qualifier: 'Standard' },
            { id: 'ollama-deepseek-r1:8b', qualifier: 'Raisonnement' },
            { id: 'ollama-gemma2:9b', qualifier: 'Google Local' },
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
