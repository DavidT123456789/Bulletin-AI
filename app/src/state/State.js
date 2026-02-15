/**
 * @fileoverview État centralisé de l'application Bulletin AI.
 * 
 * Structure réorganisée en catégories :
 * - userSettings : Paramètres persistés en localStorage
 * - runtimeState : État de session (non persisté directement)
 * - UIState : État transient de l'UI
 * 
 * @module state/State
 */

import { CONSTS, DEFAULT_EVOLUTION_THRESHOLDS, DEFAULT_PRIVACY_SETTINGS } from '../config/Config.js';

// ============================================================================
// PARAMÈTRES UTILISATEUR (persistés en localStorage)
// ============================================================================

/**
 * Paramètres utilisateur persistés.
 * Ces valeurs sont sauvegardées dans localStorage via StorageManager.
 */
export const userSettings = {
    /** Préférences d'interface */
    ui: {
        theme: 'light',
        isAppreciationFullView: false,
    },

    /** Configuration académique */
    academic: {
        periodSystem: 'trimestres',
        useSubjectPersonalization: false,
        evolutionThresholds: { ...DEFAULT_EVOLUTION_THRESHOLDS },
        subjects: {},
        // Journal threshold: minimum occurrences for a tag to be included in AI prompt
        journalThreshold: 2,
        // Multi-class support
        classes: [],           // Array of Class objects: { id, name, year, subject, createdAt, updatedAt }
        currentClassId: null,  // Currently selected class ID (null = default/legacy mode)
    },

    /** Configuration API */
    api: {
        currentAIModel: 'mistral-direct-small-latest',
        enableApiFallback: true,
        openaiApiKey: '',
        googleApiKey: '',
        openrouterApiKey: '',
        anthropicApiKey: '',   // Claude (Anthropic)
        mistralApiKey: '',     // Mistral AI direct
        // Ollama (IA locale)
        ollamaEnabled: false,
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaInstalledModels: [], // Liste des modèles réellement installés
    },

    /** Configuration d'import */
    import: {
        massImportFormats: { trimestres: {}, semestres: {} },
    },

    /** Confidentialité */
    privacy: { ...DEFAULT_PRIVACY_SETTINGS },
};

// ============================================================================
// ÉTAT RUNTIME (session, non persisté directement)
// ============================================================================

/**
 * État de session et runtime.
 * Certaines valeurs de navigation sont persistées, mais la structure
 * principale n'est pas sauvegardée telle quelle.
 */
export const runtimeState = {
    /** Statistiques de session */
    session: {
        sessionCost: 0,
        sessionTokens: 0,
        isDemoMode: false,
        isUpdateAvailable: false,
    },

    /** État de navigation et sélection */
    navigation: {
        currentPeriod: 'T1',
        currentSubject: 'MonStyle',
        currentInputMode: CONSTS.INPUT_MODE.SINGLE,
        currentEditingId: null,
        currentRefiningAppreciationId: null,
        activeStatFilter: null,
        modalNav: { currentIndex: -1 },
        lastUsedFallbackModel: null,
        lastFallbackReason: null,
        sortState: { field: 'name', direction: 'asc' },
    },

    /** États des processus en cours */
    process: {
        isMassImportCancelled: false,
        importJustCompleted: false,
        pendingRefinementGeneration: null,
    },

    /** Statuts de validation des API */
    apiStatus: {
        google: 'not-configured',
        openai: 'not-configured',
        openrouter: 'not-configured',
        anthropic: 'not-configured',
        mistral: 'not-configured',
        ollama: 'not-configured',
    },

    /** Rétro-compatibilité: clés validées */
    validatedApiKeys: {
        google: false,
        openai: false,
        openrouter: false,
        anthropic: false,
        mistral: false,
        ollama: false,
    },

    /** Données de travail */
    data: {
        generatedResults: [],
        filteredResults: [],
        refinementEdits: {},
        variationHistory: {},
        /** Tombstones for deleted items (for sync conflict resolution) */
        deletedItems: {
            students: [],  // [{ id, classId, deletedAt }]
            classes: [],   // [{ id, deletedAt }]
        },
    },
};

// ============================================================================
// RÉTROCOMPATIBILITÉ : appState plat
// ============================================================================

/**
 * Mapping des propriétés vers leurs catégories.
 * Utilisé par le Proxy pour la rétrocompatibilité.
 */
const propertyMap = {
    // userSettings.ui
    theme: () => userSettings.ui,
    isAppreciationFullView: () => userSettings.ui,

    // userSettings.academic
    periodSystem: () => userSettings.academic,
    useSubjectPersonalization: () => userSettings.academic,
    evolutionThresholds: () => userSettings.academic,
    subjects: () => userSettings.academic,
    journalThreshold: () => userSettings.academic,
    classes: () => userSettings.academic,
    currentClassId: () => userSettings.academic,

    // userSettings.api
    currentAIModel: () => userSettings.api,
    enableApiFallback: () => userSettings.api,
    openaiApiKey: () => userSettings.api,
    googleApiKey: () => userSettings.api,
    openrouterApiKey: () => userSettings.api,
    anthropicApiKey: () => userSettings.api,
    mistralApiKey: () => userSettings.api,
    ollamaEnabled: () => userSettings.api,
    ollamaBaseUrl: () => userSettings.api,
    ollamaInstalledModels: () => userSettings.api,

    // userSettings.import
    massImportFormats: () => userSettings.import,

    // userSettings.privacy
    anonymizeData: () => userSettings.privacy,
    privacy: () => userSettings,

    // runtimeState.session
    sessionCost: () => runtimeState.session,
    sessionTokens: () => runtimeState.session,
    isDemoMode: () => runtimeState.session,
    isUpdateAvailable: () => runtimeState.session,

    // runtimeState.navigation
    currentPeriod: () => runtimeState.navigation,
    currentSubject: () => runtimeState.navigation,
    currentInputMode: () => runtimeState.navigation,
    currentEditingId: () => runtimeState.navigation,
    currentRefiningAppreciationId: () => runtimeState.navigation,
    activeStatFilter: () => runtimeState.navigation,
    modalNav: () => runtimeState.navigation,
    lastUsedFallbackModel: () => runtimeState.navigation,
    lastFallbackReason: () => runtimeState.navigation,
    sortState: () => runtimeState.navigation,

    // runtimeState.process
    isMassImportCancelled: () => runtimeState.process,
    importJustCompleted: () => runtimeState.process,
    pendingRefinementGeneration: () => runtimeState.process,

    // runtimeState.apiStatus (renommé pour compatibilité)
    apiKeyStatus: () => runtimeState,

    // runtimeState.validatedApiKeys
    validatedApiKeys: () => runtimeState,

    // runtimeState.data
    generatedResults: () => runtimeState.data,
    filteredResults: () => runtimeState.data,
    refinementEdits: () => runtimeState.data,
    variationHistory: () => runtimeState.data,
};

/**
 * appState plat avec Proxy pour la rétrocompatibilité.
 * Permet à tous les fichiers existants de continuer à utiliser appState.propriété
 * sans modification de leur code.
 */
export const appState = new Proxy({}, {
    get(target, prop) {
        // Propriété spéciale pour apiStatus (mapping vers apiKeyStatus original)
        if (prop === 'apiKeyStatus') {
            return runtimeState.apiStatus;
        }

        const categoryGetter = propertyMap[prop];
        if (categoryGetter) {
            const category = categoryGetter();
            return category[prop];
        }

        // Fallback : cherche dans toutes les catégories
        for (const settings of [userSettings, runtimeState]) {
            for (const cat of Object.values(settings)) {
                if (typeof cat === 'object' && cat !== null && prop in cat) {
                    return cat[prop];
                }
            }
        }

        return undefined;
    },

    set(target, prop, value) {
        // Propriété spéciale pour apiStatus
        if (prop === 'apiKeyStatus') {
            Object.assign(runtimeState.apiStatus, value);
            return true;
        }

        const categoryGetter = propertyMap[prop];
        if (categoryGetter) {
            const category = categoryGetter();
            category[prop] = value;
            return true;
        }

        // Fallback : cherche dans toutes les catégories
        for (const settings of [userSettings, runtimeState]) {
            for (const cat of Object.values(settings)) {
                if (typeof cat === 'object' && cat !== null && prop in cat) {
                    cat[prop] = value;
                    return true;
                }
            }
        }

        // Propriété non trouvée - log en développement
        console.warn(`[State] Propriété inconnue: ${String(prop)}`);
        return false;
    },

    has(target, prop) {
        return prop in propertyMap;
    },

    ownKeys() {
        return Object.keys(propertyMap);
    },

    getOwnPropertyDescriptor(target, prop) {
        if (prop in propertyMap) {
            return { enumerable: true, configurable: true };
        }
        return undefined;
    }
});

// ============================================================================
// ÉTATS D'IMPORT (inchangés)
// ============================================================================

export let massImportMappingState = {
    rawData: [],
    lines: [],
    columnCount: 0,
    separator: '\t',
    formatMap: {}
};

export let currentImportPreviewData = {};

export function setMassImportMappingState(newState) {
    massImportMappingState = newState;
}

export function setCurrentImportPreviewData(newData) {
    currentImportPreviewData = newData;
}

// ============================================================================
// ÉTAT UI (transient, jamais sauvegardé)
// ============================================================================

export const UIState = {
    lastFocusedElement: null,
    activeModal: null,
    stackedModal: null,
    settingsBeforeEdit: {}
};
