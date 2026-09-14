/**
 * @fileoverview Configuration des modèles IA, coûts et fallback.
 * Support complet des modèles de dernière génération (Gemini 3.8/3.5 Flash, 3.1 Pro, Claude Sonnet 5)
 * et des modèles legacy en fallback (Gemini 2.5, Claude 3.7 / 3.5).
 * @module config/models
 */

export const COSTS_PER_MILLION_TOKENS = {
    // Google (clé API directe)
    'gemini-3.8-flash': { input: 0.75, output: 3.75 },
    'gemini-3.5-flash': { input: 0.15, output: 0.60 },
    'gemini-3.1-pro-preview': { input: 2.00, output: 12.00 },
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
    'gemini-3.5-flash': "<strong>⭐ Recommandé.</strong> Ultra-rapide, performant et réactif.",
    'gemini-3.8-flash': "<strong>🚀 Nouveau.</strong> Raisonnement multi-étapes et agents autonomes.",
    'gemini-3.1-pro-preview': "<strong>🔥 Synthèses complexes.</strong> Raisonnement approfondi pour dossiers denses.",
    'gemini-3.7-flash': "<strong>🧠 Raisonnement avancé.</strong> Réflexion hybride adaptative.",
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
 * Identifie le fournisseur associé à un identifiant de modèle.
 * Source unique de vérité pour le routage des providers.
 * @param {string} model - Identifiant du modèle
 * @returns {string} ID du fournisseur ('mistral'|'google'|'openrouter'|'openai'|'anthropic'|'ollama')
 */
export function getProviderForModel(model) {
    if (!model) return 'openrouter';
    if (model.endsWith('-free')) return 'openrouter';
    if (model.startsWith('mistral-direct')) return 'mistral';
    if (model.startsWith('gemini')) return 'google';
    if (model.startsWith('openai')) return 'openai';
    if (model.startsWith('anthropic')) return 'anthropic';
    if (model.startsWith('ollama')) return 'ollama';
    return 'openrouter';
}

/**
 * Noms courts des modèles pour l'affichage dans l'interface.
 * Les variantes OpenRouter portant un nom identique aux APIs directes sont suffixées par (OR).
 */
export const MODEL_SHORT_NAMES = {
    'gemini-3.8-flash': 'Gemini 3.8 Flash',
    'gemini-3.5-flash': 'Gemini 3.5 Flash',
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
    'gemini-3.7-flash': 'Gemini 3.7 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'openai-o3-mini': 'o3 Mini',
    'openai-gpt-4o-mini': 'GPT-4o Mini',
    // OpenRouter - Gratuits
    'llama-3.3-70b-free': 'Llama 3.3 70B',
    // OpenRouter - Payants
    'claude-sonnet-5': 'Claude Sonnet 5 (OR)',
    'claude-3.7-sonnet': 'Claude 3.7 Sonnet (OR)',
    'claude-3.5-sonnet': 'Claude 3.5 Sonnet (OR)',
    'openrouter': 'DeepSeek V3',
    'deepseek-r1': 'DeepSeek R1',
    'ministral-3b': 'Ministral 3 3B',
    'amazon-nova-v1-lite': 'Nova Lite',
    'mistral-small': 'Mistral Small (OR)',
    'mistral-large': 'Mistral Large (OR)',
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
 * Single Source of Truth : les modèles présents et supportés dans l'application.
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
            { id: 'gemini-3.5-flash', qualifier: 'Recommandé' },
            { id: 'gemini-3.8-flash', qualifier: 'Raisonnement' },
            { id: 'gemini-3.1-pro-preview', qualifier: '💰 Synthèses complexes' },
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
 * Configuration de fallback automatique entre modèles.
 * Dérivée dynamiquement de MODEL_SELECTOR_CONFIG pour garantir une source unique de vérité.
 */
export const FALLBACK_CONFIG = (() => {
    const config = {
        mistral: [],
        google: [],
        openrouter: [],
        ollama: [],
        openai: [],
        anthropic: [],
        providerOrder: ['mistral', 'google', 'openrouter', 'ollama', 'openai', 'anthropic']
    };

    MODEL_SELECTOR_CONFIG.forEach(group => {
        group.models.forEach(({ id }) => {
            const provider = getProviderForModel(id);
            if (config[provider] && !config[provider].includes(id)) {
                config[provider].push(id);
            }
        });
    });

    return config;
})();

/**
 * Modèle recommandé par provider pour les nouveaux utilisateurs.
 * Utilise le premier modèle de chaque chaîne de fallback.
 */
export const PROVIDER_DEFAULT_MODELS = {
    google: FALLBACK_CONFIG.google[0],
    openai: FALLBACK_CONFIG.openai[0],
    openrouter: FALLBACK_CONFIG.openrouter[0],
    ollama: FALLBACK_CONFIG.ollama[0],
    anthropic: FALLBACK_CONFIG.anthropic[0],
    mistral: FALLBACK_CONFIG.mistral[0],
};

/**
 * Construit la file ordonnée de fallback pour un modèle donné.
 * Modèle sélectionné -> Autres modèles du même fournisseur -> Modèles des autres fournisseurs selon providerOrder.
 * @param {string} currentModel - Identifiant du modèle actif
 * @returns {string[]} File ordonnée d'identifiants de modèles
 */
export function buildFallbackQueue(currentModel) {
    const currentProvider = getProviderForModel(currentModel);
    const queue = currentModel ? [currentModel] : [];

    // Modèles du même fournisseur
    const sameProviderModels = FALLBACK_CONFIG[currentProvider] ?? [];
    sameProviderModels.forEach(m => {
        if (m !== currentModel && !queue.includes(m)) {
            queue.push(m);
        }
    });

    // Modèles des autres fournisseurs selon l'ordre de priorité
    FALLBACK_CONFIG.providerOrder.forEach(provider => {
        if (provider !== currentProvider) {
            const providerModels = FALLBACK_CONFIG[provider] ?? [];
            providerModels.forEach(m => {
                if (!queue.includes(m)) {
                    queue.push(m);
                }
            });
        }
    });

    return queue;
}

/**
 * Configuration Ollama
 */
export const OLLAMA_CONFIG = {
    defaultBaseUrl: 'http://localhost:11434',
    apiEndpoint: '/api/generate',
    timeoutMs: 120000,
};
