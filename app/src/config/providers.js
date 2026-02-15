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
    },
    openrouter: {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: 'solar:bolt-bold-duotone',
        class: 'provider-openrouter',
        style: 'color: var(--secondary-color);' // Adapte la couleur si nécessaire
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
        style: 'color: #fd6f00;' // Orange Mistral
    },
    ollama: {
        id: 'ollama',
        name: 'Ollama',
        icon: 'solar:server-square-bold', // Alternative: logos:ollama (si disponible)
        class: 'provider-ollama',
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
