/**
 * @fileoverview Configuration centralisée des fournisseurs d'IA (Icônes, Noms, Styles).
 * Source de vérité unique pour l'affichage (Dropdowns, Paramètres, etc.).
 * @module config/providers
 */

export const PROVIDER_CONFIG = {
    google: {
        id: 'google',
        name: 'Google Gemini',
        icon: 'logos:google-icon',
        class: 'provider-google',
        keyProperty: 'googleApiKey',
        domKey: 'googleApiKey',
        description: '<strong>Google Gemini (Recommandé)</strong> : solution officielle, <strong>100% gratuite et sans carte bancaire</strong>, idéale pour débuter sereinement.'
    },
    groq: {
        id: 'groq',
        name: 'Groq Cloud',
        icon: 'solar:bolt-circle-bold',
        class: 'provider-groq',
        style: 'color: #f55036;', // Groq coral orange
        keyProperty: 'groqApiKey',
        domKey: 'groqApiKey',
        description: '<strong>Groq Cloud</strong> : génération ultra-rapide avec des modèles libres, également gratuit sans carte bancaire.'
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: 'solar:bolt-bold-duotone',
        class: 'provider-openrouter',
        style: 'color: var(--secondary-color);', // Adapte la couleur si nécessaire
        keyProperty: 'openrouterApiKey',
        domKey: 'openrouterApiKey',
        description: '<strong>OpenRouter</strong> : passerelle multi-modèles donnant accès à Claude, DeepSeek et aux modèles ouverts.'
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        icon: 'logos:openai-icon',
        class: 'provider-openai',
        keyProperty: 'openaiApiKey',
        domKey: 'openaiApiKey',
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic Claude',
        icon: 'logos:anthropic-icon',
        class: 'provider-anthropic',
        keyProperty: 'anthropicApiKey',
        domKey: 'anthropicApiKey',
    },
    mistral: {
        id: 'mistral',
        name: 'Mistral AI',
        icon: 'solar:cat-bold',
        class: 'provider-mistral',
        style: 'color: #fd6f00;', // Orange Mistral
        keyProperty: 'mistralApiKey',
        domKey: 'mistralApiKey',
        description: '<strong>Mistral AI</strong> : solution française de grande qualité, <strong>payante</strong> (crédits à acheter sur son site).'
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama',
        icon: 'solar:server-square-bold', // Alternative: logos:ollama (si disponible)
        class: 'provider-ollama',
        style: 'color: #708090;', // Gris acier professionnel
        keyProperty: null,
        domKey: null,
    }
};

/** Liste ordonnée de tous les identifiants de fournisseurs */
export const PROVIDER_IDS = ['google', 'groq', 'openrouter', 'mistral', 'openai', 'anthropic', 'ollama'];

/** Liste des fournisseurs nécessitant une clé API distante */
export const API_KEY_PROVIDER_IDS = ['google', 'groq', 'openrouter', 'mistral', 'openai', 'anthropic'];

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

    // Priorité à la saisie DOM si disponible (clés modifiées mais non encore validées)
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

    // Recherche par ID exact
    if (PROVIDER_CONFIG[lowerKey]) {
        return PROVIDER_CONFIG[lowerKey];
    }

    // Recherche par pattern dans le nom ou l'id (bidirectionnel)
    for (const provider of Object.values(PROVIDER_CONFIG)) {
        const provName = provider.name.toLowerCase();
        if (provName.includes(lowerKey) || lowerKey.includes(provider.id) || lowerKey.includes(provName)) {
            return provider;
        }
    }

    return null;
}
