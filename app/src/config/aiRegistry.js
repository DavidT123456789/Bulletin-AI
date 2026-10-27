/**
 * @fileoverview Source unique de vérité (SSOT) pour les 7 fournisseurs et l'ensemble des modèles IA :
 * métadonnées d'affichage, routage API, tarification, timeouts, sélecteur UI et chaînes de repli.
 * @module config/aiRegistry
 */

/**
 * Configuration Ollama
 */
export const OLLAMA_CONFIG = {
    defaultBaseUrl: 'http://localhost:11434',
    apiEndpoint: '/api/generate',
    timeoutMs: 120000,
};

/**
 * Registre unifié des 7 fournisseurs d'IA (Icônes, Noms, Styles, Clés, Endpoints).
 */
export const AI_PROVIDERS = {
    google: {
        id: 'google',
        name: 'Google Gemini',
        shortLabel: 'Google',
        icon: 'logos:google-icon',
        class: 'provider-google',
        keyProperty: 'googleApiKey',
        domKey: 'googleApiKey',
        apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        description: '<strong>Google Gemini (Recommandé)</strong> : solution officielle, <strong>100% gratuite et sans carte bancaire</strong>, idéale pour débuter sereinement.'
    },
    groq: {
        id: 'groq',
        name: 'Groq Cloud',
        shortLabel: 'Groq',
        icon: 'solar:bolt-circle-bold',
        class: 'provider-groq',
        style: 'color: #f55036;',
        keyProperty: 'groqApiKey',
        domKey: 'groqApiKey',
        apiBaseUrl: 'https://api.groq.com/openai/v1',
        description: '<strong>Groq Cloud</strong> : génération ultra-rapide avec des modèles libres, également gratuit sans carte bancaire.'
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        shortLabel: 'OpenRouter',
        icon: 'solar:bolt-bold-duotone',
        class: 'provider-openrouter',
        style: 'color: var(--secondary-color);',
        keyProperty: 'openrouterApiKey',
        domKey: 'openrouterApiKey',
        apiBaseUrl: 'https://openrouter.ai/api/v1',
        description: '<strong>OpenRouter</strong> : passerelle multi-modèles donnant accès à Claude, DeepSeek et aux modèles ouverts.'
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        shortLabel: 'OpenAI',
        icon: 'logos:openai-icon',
        class: 'provider-openai',
        keyProperty: 'openaiApiKey',
        domKey: 'openaiApiKey',
        apiBaseUrl: 'https://api.openai.com/v1',
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic Claude',
        shortLabel: 'Anthropic',
        icon: 'logos:anthropic-icon',
        class: 'provider-anthropic',
        keyProperty: 'anthropicApiKey',
        domKey: 'anthropicApiKey',
        apiBaseUrl: 'https://api.anthropic.com/v1',
    },
    mistral: {
        id: 'mistral',
        name: 'Mistral AI',
        shortLabel: 'Mistral',
        icon: 'solar:cat-bold',
        class: 'provider-mistral',
        style: 'color: #fd6f00;',
        keyProperty: 'mistralApiKey',
        domKey: 'mistralApiKey',
        apiBaseUrl: 'https://api.mistral.ai/v1',
        description: '<strong>Mistral AI</strong> : solution française de grande qualité, <strong>payante</strong> (crédits à acheter sur son site).'
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama',
        shortLabel: 'Ollama',
        icon: 'solar:server-square-bold',
        class: 'provider-ollama',
        style: 'color: #708090;',
        keyProperty: null,
        domKey: null,
        apiBaseUrl: OLLAMA_CONFIG.defaultBaseUrl,
    }
};

export const PROVIDER_CONFIG = AI_PROVIDERS;

/** Liste ordonnée de tous les identifiants de fournisseurs */
export const PROVIDER_IDS = ['google', 'groq', 'openrouter', 'mistral', 'openai', 'anthropic', 'ollama'];

/** Liste des fournisseurs nécessitant une clé API distante */
export const API_KEY_PROVIDER_IDS = ['google', 'groq', 'openrouter', 'mistral', 'openai', 'anthropic'];

/** Ordre de priorité des fournisseurs pour le fallback automatique */
export const FALLBACK_PROVIDER_ORDER = ['google', 'groq', 'openrouter', 'mistral', 'ollama', 'openai', 'anthropic'];

/**
 * Registre unifié des modèles IA (27 modèles actifs dans le sélecteur + 7 alias historiques).
 */
export const AI_MODELS = {
    // 1. GOOGLE GEMINI
    'gemini-3.6-flash': {
        id: 'gemini-3.6-flash',
        providerId: 'google',
        apiModelId: 'gemini-3.6-flash',
        shortName: 'Gemini 3.6 Flash',
        qualifier: 'Recommandé',
        selectorGroup: 'Google Gemini — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.75, output: 3.75 },
        description: "<strong>⭐ Recommandé.</strong> Ultra-rapide, performant et réactif."
    },
    'gemini-3.8-flash': {
        id: 'gemini-3.8-flash',
        providerId: 'google',
        apiModelId: 'gemini-3.8-flash',
        shortName: 'Gemini 3.8 Flash',
        qualifier: 'Raisonnement',
        selectorGroup: 'Google Gemini — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0.75, output: 3.75 },
        description: "<strong>🚀 Nouveau.</strong> Raisonnement multi-étapes et agents autonomes."
    },
    'gemini-3.1-pro-preview': {
        id: 'gemini-3.1-pro-preview',
        providerId: 'google',
        apiModelId: 'gemini-3.1-pro-preview',
        shortName: 'Gemini 3.1 Pro',
        qualifier: 'Synthèses complexes',
        selectorGroup: 'Google Gemini — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 2.00, output: 12.00 },
        description: "<strong>🔥 Synthèses complexes.</strong> Raisonnement approfondi pour dossiers denses."
    },
    // Alias / legacy Google
    'gemini-3.5-flash': {
        id: 'gemini-3.5-flash',
        providerId: 'google',
        apiModelId: 'gemini-3.5-flash',
        shortName: 'Gemini 3.5 Flash',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
        description: "<strong>Stable.</strong> Flash éprouvé, redirigé vers Gemini 3.6 Flash."
    },
    'gemini-3.7-flash': {
        id: 'gemini-3.7-flash',
        providerId: 'google',
        apiModelId: 'gemini-3.7-flash',
        shortName: 'Gemini 3.7 Flash',
        inSelector: false,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0.15, output: 0.60 },
        description: "<strong>🧠 Raisonnement avancé.</strong> Réflexion hybride adaptative."
    },
    'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        providerId: 'google',
        apiModelId: 'gemini-2.5-flash',
        shortName: 'Gemini 2.5 Flash',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
        description: "<strong>Stable.</strong> Flash éprouvé, excellent rapport qualité/prix."
    },
    'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        providerId: 'google',
        apiModelId: 'gemini-2.5-pro',
        shortName: 'Gemini 2.5 Pro',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 30000,
        costs: { input: 1.25, output: 10.00 },
        description: "<strong>🔥 Synthèses complexes.</strong> Idéal pour les dossiers denses et nuancés."
    },

    // 2. GROQ CLOUD
    'groq-gpt-oss-120b': {
        id: 'groq-gpt-oss-120b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-120b',
        shortName: 'GPT-OSS 120B (Groq)',
        qualifier: 'Recommandé',
        selectorGroup: 'Groq Cloud — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0, output: 0 },
        description: "<strong>⚡ Ultra-rapide (~500 t/s) ⭐</strong> GPT-OSS 120B via Groq. Modèle ouvert phare d'OpenAI, raisonnement et style de pointe, gratuit sans CB."
    },
    'groq-gpt-oss-20b': {
        id: 'groq-gpt-oss-20b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-20b',
        shortName: 'GPT-OSS 20B (Groq)',
        qualifier: 'Instantané',
        selectorGroup: 'Groq Cloud — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0, output: 0 },
        description: "<strong>⚡ Instantané (~1000 t/s)</strong> GPT-OSS 20B via Groq. Modèle ultra-vif, idéal pour retouches rapides, gratuit sans CB."
    },
    // Alias rétrocompatibles Groq
    'groq-llama-3.3-70b': {
        id: 'groq-llama-3.3-70b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-120b',
        shortName: 'GPT-OSS 120B (Groq)',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0, output: 0 },
        description: "<strong>⚡ Ultra-rapide (~500 t/s) ⭐</strong> GPT-OSS 120B via Groq. Modèle ouvert phare d'OpenAI, gratuit sans CB."
    },
    'groq-gemma-2-9b': {
        id: 'groq-gemma-2-9b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-20b',
        shortName: 'GPT-OSS 20B (Groq)',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0, output: 0 },
        description: "<strong>⚡ Instantané</strong> GPT-OSS 20B via Groq. Gratuit sans CB."
    },
    'groq-llama-3.1-8b': {
        id: 'groq-llama-3.1-8b',
        providerId: 'groq',
        apiModelId: 'openai/gpt-oss-20b',
        shortName: 'GPT-OSS 20B (Groq)',
        inSelector: false,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0, output: 0 },
        description: "<strong>⚡ Instantané</strong> GPT-OSS 20B via Groq. Gratuit sans CB."
    },

    // 3. MISTRAL AI DIRECT
    'mistral-direct-small-latest': {
        id: 'mistral-direct-small-latest',
        providerId: 'mistral',
        apiModelId: 'mistral-small-latest',
        shortName: 'Mistral Small',
        qualifier: 'Recommandé',
        selectorGroup: 'Mistral AI — PAY-AS-YOU-GO',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
        description: "<strong>Français ⭐</strong> Mistral Small. Multimodal + raisonnement rapide."
    },
    'mistral-direct-large-latest': {
        id: 'mistral-direct-large-latest',
        providerId: 'mistral',
        apiModelId: 'mistral-large-latest',
        shortName: 'Mistral Large',
        qualifier: 'Puissant',
        selectorGroup: 'Mistral AI — PAY-AS-YOU-GO',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.50, output: 1.50 },
        description: "<strong>Français</strong> Mistral Large. Le modèle le plus puissant de Mistral."
    },

    // 4. OPENROUTER — QUOTA GRATUIT
    'llama-3.3-70b-free': {
        id: 'llama-3.3-70b-free',
        providerId: 'openrouter',
        apiModelId: 'meta-llama/llama-3.3-70b-instruct:free',
        shortName: 'Llama 3.3 70B',
        qualifier: 'Journalier',
        selectorGroup: 'OpenRouter — QUOTA GRATUIT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0, output: 0 },
        description: "<strong>🆓 GRATUIT</strong> Llama 3.3 70B. Quota partagé quotidien."
    },

    // 5. OPENROUTER — PAYANT
    'claude-sonnet-5': {
        id: 'claude-sonnet-5',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-sonnet-5',
        shortName: 'Claude Sonnet 5 (OR)',
        qualifier: 'Recommandé',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 3.00, output: 15.00 },
        description: "<strong>✨ Recommandé.</strong> Claude Sonnet 5 (via OpenRouter). Finesse stylistique."
    },
    'claude-3.7-sonnet': {
        id: 'claude-3.7-sonnet',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-3.7-sonnet',
        shortName: 'Claude 3.7 Sonnet (OR)',
        qualifier: 'Raisonnement',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 3.00, output: 15.00 },
        description: "Claude 3.7 Sonnet (via OpenRouter). Raisonnement hybride."
    },
    'claude-3.5-sonnet': {
        id: 'claude-3.5-sonnet',
        providerId: 'openrouter',
        apiModelId: 'anthropic/claude-3.5-sonnet',
        shortName: 'Claude 3.5 Sonnet (OR)',
        qualifier: 'Stable',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 3.00, output: 15.00 },
        description: "Claude 3.5 Sonnet (via OpenRouter). Précis et fluide."
    },
    'openrouter': {
        id: 'openrouter',
        providerId: 'openrouter',
        apiModelId: 'deepseek/deepseek-chat',
        shortName: 'DeepSeek V3',
        qualifier: 'Économique',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.14, output: 0.28 },
        description: "DeepSeek V3. Performant et très économique."
    },
    'deepseek-r1': {
        id: 'deepseek-r1',
        providerId: 'openrouter',
        apiModelId: 'deepseek/deepseek-r1',
        shortName: 'DeepSeek R1',
        qualifier: 'Raisonnement',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 0.55, output: 2.19 },
        description: "<strong>⭐ Raisonnement.</strong> DeepSeek R1 (via OpenRouter)."
    },
    'ministral-3b': {
        id: 'ministral-3b',
        providerId: 'openrouter',
        apiModelId: 'mistralai/ministral-3b-2512',
        shortName: 'Ministral 3 3B',
        qualifier: 'Économique',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.10, output: 0.10 },
        description: "<strong>~0€</strong> Ministral 3 3B. Ultra économique, excellent français."
    },
    'amazon-nova-v1-lite': {
        id: 'amazon-nova-v1-lite',
        providerId: 'openrouter',
        apiModelId: 'amazon/nova-lite-v1:1.0',
        shortName: 'Nova Lite',
        qualifier: 'Économique',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.06, output: 0.24 },
        description: "<strong>Économique.</strong> Amazon Nova Lite 1.0."
    },
    'mistral-small': {
        id: 'mistral-small',
        providerId: 'openrouter',
        apiModelId: 'mistralai/mistral-small-24b-instruct-2501',
        shortName: 'Mistral Small (OR)',
        qualifier: 'Standard',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
        description: "<strong>Français.</strong> Mistral Small (via OpenRouter)."
    },
    'mistral-large': {
        id: 'mistral-large',
        providerId: 'openrouter',
        apiModelId: 'mistralai/mistral-large-2411',
        shortName: 'Mistral Large (OR)',
        qualifier: 'Puissant',
        selectorGroup: 'OpenRouter — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 2.00, output: 6.00 },
        description: "Mistral Large (via OpenRouter). Pour textes nuancés."
    },

    // 6. OPENAI DIRECT
    'openai-o3-mini': {
        id: 'openai-o3-mini',
        providerId: 'openai',
        apiModelId: 'o3-mini',
        shortName: 'o3 Mini',
        qualifier: 'Raisonnement',
        selectorGroup: 'OpenAI — PAYANT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 1.10, output: 4.40 },
        description: "<strong>⭐ Raisonnement.</strong> Modèle de raisonnement avancé d'OpenAI."
    },
    'openai-gpt-4o-mini': {
        id: 'openai-gpt-4o-mini',
        providerId: 'openai',
        apiModelId: 'gpt-4o-mini',
        shortName: 'GPT-4o Mini',
        qualifier: 'Économique',
        selectorGroup: 'OpenAI — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.15, output: 0.60 },
        description: "Économique et performant."
    },

    // 7. ANTHROPIC CLAUDE DIRECT
    'anthropic-claude-sonnet-5': {
        id: 'anthropic-claude-sonnet-5',
        providerId: 'anthropic',
        apiModelId: 'claude-sonnet-5',
        shortName: 'Claude Sonnet 5',
        qualifier: 'Recommandé',
        selectorGroup: 'Anthropic Claude — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 3.00, output: 15.00 },
        description: "<strong>✨ Recommandé.</strong> Claude Sonnet 5. Finesse stylistique et équilibre."
    },
    'anthropic-claude-3-7-sonnet-latest': {
        id: 'anthropic-claude-3-7-sonnet-latest',
        providerId: 'anthropic',
        apiModelId: 'claude-3-7-sonnet-latest',
        shortName: 'Claude 3.7 Sonnet',
        qualifier: 'Raisonnement',
        selectorGroup: 'Anthropic Claude — PAYANT',
        inSelector: true,
        isReasoning: true,
        timeoutMs: 40000,
        costs: { input: 3.00, output: 15.00 },
        description: "Claude 3.7 Sonnet. Raisonnement hybride et style rédactionnel."
    },
    'anthropic-claude-3-5-sonnet-latest': {
        id: 'anthropic-claude-3-5-sonnet-latest',
        providerId: 'anthropic',
        apiModelId: 'claude-3-5-sonnet-latest',
        shortName: 'Claude 3.5 Sonnet',
        qualifier: 'Stable',
        selectorGroup: 'Anthropic Claude — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 3.00, output: 15.00 },
        description: "Claude 3.5 Sonnet. Rédaction fluide et nuancée."
    },
    'anthropic-claude-3-5-haiku-latest': {
        id: 'anthropic-claude-3-5-haiku-latest',
        providerId: 'anthropic',
        apiModelId: 'claude-3-5-haiku-latest',
        shortName: 'Claude 3.5 Haiku',
        qualifier: 'Rapide',
        selectorGroup: 'Anthropic Claude — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 22000,
        costs: { input: 0.80, output: 4.00 },
        description: "<strong>⚡ Économique & Rapide.</strong> Claude 3.5 Haiku."
    },
    'anthropic-claude-opus-5': {
        id: 'anthropic-claude-opus-5',
        providerId: 'anthropic',
        apiModelId: 'claude-opus-5',
        shortName: 'Claude Opus 5',
        qualifier: 'Puissant',
        selectorGroup: 'Anthropic Claude — PAYANT',
        inSelector: true,
        isReasoning: false,
        timeoutMs: 30000,
        costs: { input: 5.00, output: 25.00 },
        description: "<strong>🔥 Puissance maximale.</strong> Claude Opus 5. Qualité maximale."
    },

    // 8. OLLAMA LOCAL
    'ollama-qwen2.5:7b': {
        id: 'ollama-qwen2.5:7b',
        providerId: 'ollama',
        apiModelId: 'qwen2.5:7b',
        shortName: 'Qwen 2.5 7B',
        qualifier: 'Recommandé',
        selectorGroup: 'Ollama — LOCAL',
        inSelector: true,
        isReasoning: false,
        timeoutMs: OLLAMA_CONFIG.timeoutMs,
        costs: { input: 0, output: 0 },
        description: "<strong>Local - Recommandé.</strong> Qwen 2.5 7B. Excellent en français."
    },
    'ollama-mistral:7b': {
        id: 'ollama-mistral:7b',
        providerId: 'ollama',
        apiModelId: 'mistral:7b',
        shortName: 'Mistral 7B',
        qualifier: 'Standard',
        selectorGroup: 'Ollama — LOCAL',
        inSelector: true,
        isReasoning: false,
        timeoutMs: OLLAMA_CONFIG.timeoutMs,
        costs: { input: 0, output: 0 },
        description: "Local - Équilibré. Le standard Mistral 7B."
    },
    'ollama-deepseek-r1:8b': {
        id: 'ollama-deepseek-r1:8b',
        providerId: 'ollama',
        apiModelId: 'deepseek-r1:8b',
        shortName: 'DeepSeek R1',
        qualifier: 'Raisonnement',
        selectorGroup: 'Ollama — LOCAL',
        inSelector: true,
        isReasoning: true,
        timeoutMs: OLLAMA_CONFIG.timeoutMs,
        costs: { input: 0, output: 0 },
        description: "<strong>Local.</strong> DeepSeek R1 8B (Raisonnement)."
    },
    'ollama-gemma2:9b': {
        id: 'ollama-gemma2:9b',
        providerId: 'ollama',
        apiModelId: 'gemma2:9b',
        shortName: 'Gemma 2 9B',
        qualifier: 'Standard',
        selectorGroup: 'Ollama — LOCAL',
        inSelector: true,
        isReasoning: false,
        timeoutMs: OLLAMA_CONFIG.timeoutMs,
        costs: { input: 0, output: 0 },
        description: "Local. Google Gemma 2 9B."
    }
};

const SELECTOR_GROUP_ORDER = [
    'Google Gemini — QUOTA GRATUIT',
    'Groq Cloud — QUOTA GRATUIT',
    'Mistral AI — PAY-AS-YOU-GO',
    'OpenRouter — QUOTA GRATUIT',
    'OpenRouter — PAYANT',
    'OpenAI — PAYANT',
    'Anthropic Claude — PAYANT',
    'Ollama — LOCAL'
];

export const COSTS_PER_MILLION_TOKENS = Object.fromEntries(
    Object.entries(AI_MODELS)
        .filter(([, m]) => m.costs)
        .map(([id, m]) => [id, m.costs])
);

export const MODEL_DESCRIPTIONS = Object.fromEntries(
    Object.entries(AI_MODELS)
        .filter(([, m]) => m.description)
        .map(([id, m]) => [id, m.description])
);

export const MODEL_SHORT_NAMES = Object.fromEntries(
    Object.entries(AI_MODELS)
        .filter(([, m]) => m.shortName)
        .map(([id, m]) => [id, m.shortName])
);

export const API_MODEL_MAPPINGS = Object.fromEntries(
    Object.entries(AI_MODELS)
        .filter(([, m]) => m.providerId === 'openrouter' || m.providerId === 'groq')
        .map(([id, m]) => [id, m.apiModelId])
);

export const MODEL_SELECTOR_CONFIG = SELECTOR_GROUP_ORDER.map(label => ({
    label,
    models: Object.values(AI_MODELS)
        .filter(m => m.inSelector && m.selectorGroup === label)
        .map(m => ({ id: m.id, qualifier: m.qualifier }))
}));

/**
 * Retourne les métadonnées complètes d'un modèle depuis le registre.
 * @param {string} modelId
 * @returns {Object|null}
 */
export function getModelMeta(modelId) {
    if (!modelId) return null;
    return AI_MODELS[modelId] || null;
}

/**
 * Identifie le fournisseur associé à un identifiant de modèle (interne ou API direct).
 * @param {string} model - Identifiant du modèle
 * @returns {string} ID du fournisseur ('mistral'|'google'|'groq'|'openrouter'|'openai'|'anthropic'|'ollama')
 */
export function getProviderForModel(model) {
    if (!model) return 'openrouter';
    if (AI_MODELS[model]?.providerId) {
        return AI_MODELS[model].providerId;
    }
    if (model.endsWith('-free') || model.endsWith(':free')) return 'openrouter';
    if (model.startsWith('mistral-direct')) return 'mistral';
    if (model.startsWith('gemini')) return 'google';
    if (
        model.startsWith('groq-') ||
        model.startsWith('meta-llama/') ||
        model.startsWith('openai/gpt-oss-') ||
        model === 'llama-3.3-70b-versatile' ||
        model === 'llama-3.1-8b-instant'
    ) {
        return 'groq';
    }
    if (model.startsWith('openai')) return 'openai';
    if (model.startsWith('anthropic')) return 'anthropic';
    if (model.startsWith('ollama')) return 'ollama';
    return 'openrouter';
}

export const FALLBACK_CONFIG = (() => {
    const config = {
        google: [],
        groq: [],
        mistral: [],
        openrouter: [],
        ollama: [],
        openai: [],
        anthropic: [],
        providerOrder: [...FALLBACK_PROVIDER_ORDER]
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

export const PROVIDER_DEFAULT_MODELS = {
    google: FALLBACK_CONFIG.google[0],
    groq: FALLBACK_CONFIG.groq[0],
    mistral: FALLBACK_CONFIG.mistral[0],
    openai: FALLBACK_CONFIG.openai[0],
    openrouter: FALLBACK_CONFIG.openrouter[0],
    ollama: FALLBACK_CONFIG.ollama[0],
    anthropic: FALLBACK_CONFIG.anthropic[0],
};

export const PROVIDER_SHOWCASE_MODELS = {
    google: ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'],
    groq: ['groq-gpt-oss-120b', 'groq-gpt-oss-20b'],
    anthropic: ['anthropic-claude-sonnet-5', 'anthropic-claude-3-7-sonnet-latest', 'anthropic-claude-opus-5'],
    mistral: ['mistral-direct-small-latest', 'mistral-direct-large-latest'],
    openai: ['openai-gpt-4o-mini', 'openai-o3-mini'],
    openrouter: ['openrouter', 'deepseek-r1', 'llama-3.3-70b-free'],
    ollama: ['ollama-qwen2.5:7b', 'ollama-mistral:7b', 'ollama-deepseek-r1:8b'],
};

/**
 * Construit la file ordonnée de fallback pour un modèle donné.
 * @param {string} currentModel - Identifiant du modèle actif
 * @returns {string[]} File ordonnée d'identifiants de modèles
 */
export function buildFallbackQueue(currentModel) {
    const currentProvider = getProviderForModel(currentModel);
    const queue = currentModel ? [currentModel] : [];

    const sameProviderModels = FALLBACK_CONFIG[currentProvider] ?? [];
    sameProviderModels.forEach(m => {
        if (m !== currentModel && !queue.includes(m)) {
            queue.push(m);
        }
    });

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
 * Résout le nom technique du modèle attendu par l'API du fournisseur.
 * @param {string} model - Identifiant applicatif du modèle
 * @returns {string} Identifiant technique du modèle pour l'API
 */
export function getApiModelName(model) {
    if (!model) return 'deepseek/deepseek-chat';
    if (AI_MODELS[model]?.apiModelId) return AI_MODELS[model].apiModelId;
    if (model.startsWith('openai-')) return model.replace('openai-', '');
    if (model.startsWith('mistral-direct-')) return model.replace('mistral-direct-', 'mistral-');
    if (model.startsWith('anthropic-')) return model.replace('anthropic-', '');
    if (model.startsWith('ollama-')) return model.replace('ollama-', '');
    return model;
}

/**
 * Calcule le timeout approprié selon les métadonnées ou le type de modèle.
 * @param {string} model - Nom du modèle
 * @param {number} [ollamaTimeoutMs=OLLAMA_CONFIG.timeoutMs]
 * @param {number} [defaultTimeoutMs=22000]
 * @returns {number} Timeout en ms
 */
export function getModelTimeout(model, ollamaTimeoutMs = OLLAMA_CONFIG.timeoutMs, defaultTimeoutMs = 22000) {
    const m = model || '';
    if (!m) return defaultTimeoutMs;
    const meta = AI_MODELS[m];
    if (meta) {
        if (meta.providerId === 'ollama') return ollamaTimeoutMs;
        if (meta.isReasoning) return 40000;
        if (meta.timeoutMs && meta.timeoutMs !== 22000) return meta.timeoutMs;
        return defaultTimeoutMs;
    }
    if (m.startsWith('ollama')) return ollamaTimeoutMs;
    const isReasoningModel = m.includes('3.7') || m.includes('3.8') || m.includes('3.1-pro') || m.includes('r1') || m.includes('o3') || m.includes('gpt-oss');
    if (isReasoningModel) return 40000;
    if (m.includes('pro') || m.includes('opus')) return 30000;
    return defaultTimeoutMs;
}

/**
 * Valide le format minimal d'une clé API.
 * @param {string|null|undefined} key - La clé à tester
 * @returns {boolean}
 */
export function isValidKeyFormat(key) {
    return typeof key === 'string' && key.trim().length > 5;
}

/**
 * Récupère la clé API configurée pour un fournisseur donné depuis le DOM ou l'état.
 * @param {string} providerId - Identifiant du fournisseur
 * @param {Object} [deps] - Dépendances d'état et DOM
 * @returns {string} La clé API nettoyée ou une chaîne vide
 */
export function getProviderApiKey(providerId, { state, dom } = {}) {
    const config = PROVIDER_CONFIG[providerId];
    if (!config?.keyProperty) return '';

    if (dom && config.domKey && dom[config.domKey]?.value !== undefined) {
        const domVal = dom[config.domKey].value.trim();
        if (domVal || (typeof document !== 'undefined' && document.activeElement === dom[config.domKey])) {
            return domVal;
        }
    }

    return (state && state[config.keyProperty]) ? state[config.keyProperty].trim() : '';
}

/**
 * Vérifie si un fournisseur est fonctionnel (clé API valide ou Ollama activé).
 * @param {string} providerId - Identifiant du fournisseur
 * @param {Object} [deps] - Dépendances d'état et DOM
 * @returns {boolean}
 */
export function hasValidApiKey(providerId, deps = {}) {
    if (providerId === 'ollama') {
        return deps.state ? deps.state.ollamaEnabled === true : false;
    }
    const key = getProviderApiKey(providerId, deps);
    return isValidKeyFormat(key);
}

/**
 * Retourne la liste des fournisseurs qui ont une clé API configurée.
 * @param {Object} [deps] - Dépendances d'état et DOM
 * @returns {Array<{ id: string, name: string, key: string }>}
 */
export function getConfiguredProviders(deps = {}) {
    return API_KEY_PROVIDER_IDS
        .map(id => ({
            id,
            name: PROVIDER_CONFIG[id]?.name || id,
            key: getProviderApiKey(id, deps)
        }))
        .filter(p => isValidKeyFormat(p.key));
}

/**
 * Retourne la configuration d'un provider à partir de son ID ou d'un pattern de nom.
 * @param {string} key - ID (ex: 'google') ou Nom (ex: 'Google Gemini')
 * @returns {Object|null} La config du provider ou null
 */
export function getProviderConfig(key) {
    if (!key) return null;
    const lowerKey = key.toLowerCase();

    if (PROVIDER_CONFIG[lowerKey]) {
        return PROVIDER_CONFIG[lowerKey];
    }

    for (const provider of Object.values(PROVIDER_CONFIG)) {
        const provName = provider.name.toLowerCase();
        if (provName.includes(lowerKey) || lowerKey.includes(provider.id) || lowerKey.includes(provName)) {
            return provider;
        }
    }

    return null;
}
