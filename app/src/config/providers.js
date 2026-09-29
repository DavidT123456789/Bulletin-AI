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
        description: '<strong>Google Gemini (Recommandé)</strong> est la solution idéale : <strong>100% gratuite et sans carte bancaire</strong> via Google AI Studio (15 req/min, 1 500 req/jour).'
    },
    groq: {
        id: 'groq',
        name: 'Groq Cloud',
        icon: 'solar:bolt-circle-bold',
        class: 'provider-groq',
        style: 'color: #f55036;', // Groq coral orange
        description: '<strong>Groq Cloud (Sprinteur)</strong> offre une vitesse fulgurante (~500 tokens/s) et héberge <strong>Llama 3.3</strong> et <strong>Gemma 2</strong> gratuitement sans carte bancaire.'
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: 'solar:bolt-bold-duotone',
        class: 'provider-openrouter',
        style: 'color: var(--secondary-color);', // Adapte la couleur si nécessaire
        description: '<strong>OpenRouter</strong> est une passerelle unifiée donnant accès aux meilleurs modèles ouverts (Llama 3.3, Gemma 2) et propriétaires (Claude, DeepSeek…)'
    },
    openai: {
        id: 'openai',
        name: 'OpenAI',
        icon: 'logos:openai-icon',
        class: 'provider-openai',
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic Claude',
        icon: 'logos:anthropic-icon',
        class: 'provider-anthropic',
    },
    mistral: {
        id: 'mistral',
        name: 'Mistral AI',
        icon: 'solar:cat-bold',
        class: 'provider-mistral',
        style: 'color: #fd6f00;', // Orange Mistral
        description: '<strong>Mistral AI</strong> est une solution française performante (nécessite un compte La Plateforme avec crédits pay-as-you-go).'
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama',
        icon: 'solar:server-square-bold', // Alternative: logos:ollama (si disponible)
        class: 'provider-ollama',
        style: 'color: #708090;', // Gris acier professionnel
    }
};

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

    // Recherche par pattern dans le nom
    for (const provider of Object.values(PROVIDER_CONFIG)) {
        if (lowerKey.includes(provider.id) || lowerKey.includes(provider.name.toLowerCase())) {
            return provider;
        }
    }

    return null;
}
