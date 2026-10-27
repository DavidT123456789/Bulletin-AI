/**
 * @fileoverview Valeurs par défaut et templates de configuration.
 * @module config/defaults
 */

export { DEMO_STUDENT_PROFILES } from '../data/SampleData.js';

export const DEFAULT_IA_CONFIG = {
    length: 40,
    tone: 3,
    enableTone: false,
    voice: 'default',
    styleInstructions: "",
    enableStyleInstructions: true,
    discipline: "",  // Optionnel: Mathématiques, Français, etc.
};

/**
 * Liens externes de l'application (Source de vérité).
 */
export const APP_LINKS = {
    GITHUB: 'https://github.com/davidt123456789/Bulletin-AI',
    KOFI: 'https://ko-fi.com/profassistant',
    FEEDBACK: 'https://docs.google.com/forms/d/e/1FAIpQLScMfb2MVugiZpgq-ITF5RxG8dKQAd8zKvHuTHHIfhN18Ucmag/viewform',
    LICENSE: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr'
};

/**
 * Configuration par défaut du style personnalisé.
 * Un seul profil "MonStyle" remplace l'ancien système multi-matières.
 */
export const DEFAULT_PERSONAL_STYLE = {
    iaConfig: { ...DEFAULT_IA_CONFIG }
};

/**
 * Templates de prompt par défaut.
 * Simplifié : "Générique" pour le mode OFF, "MonStyle" pour le mode ON.
 */
export const DEFAULT_PROMPT_TEMPLATES = {
    "Générique": {
        iaConfig: { ...DEFAULT_IA_CONFIG }
    },
    "MonStyle": {
        iaConfig: { ...DEFAULT_IA_CONFIG }
    }
};

export const DEFAULT_EVOLUTION_THRESHOLDS = {
    positive: 0.5,
    veryPositive: 2.0,
    negative: -0.5,
    veryNegative: -2.0
};

export const DEFAULT_PRIVACY_SETTINGS = {
    anonymizeData: false
};

export const DEFAULT_SEATING_STATUS_DOTS = {
    movements: true,
    devices: false,
    delegates: false
};
