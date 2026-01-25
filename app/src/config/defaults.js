/**
 * @fileoverview Valeurs par défaut et templates de configuration.
 * @module config/defaults
 */

export const DEFAULT_IA_CONFIG = {
    length: 40,
    tone: 3,
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

export const DEFAULT_MASS_IMPORT_FORMATS = {
    trimestres: {
        'T1': '{{NOM_PRENOM}} | {{STATUT}} | {{MOY_T1}} | {{INSTRUCTIONS}}',
        'T2': '{{NOM_PRENOM}} | {{STATUT}} | {{MOY_T1}} | {{APP_T1}} | {{MOY_T2}} | {{INSTRUCTIONS}}',
        'T3': '{{NOM_PRENOM}} | {{STATUT}} | {{MOY_T1}} | {{APP_T1}} | {{MOY_T2}} | {{APP_T2}} | {{MOY_T3}} | {{INSTRUCTIONS}}'
    },
    semestres: {
        'S1': '{{NOM_PRENOM}} | {{STATUT}} | {{MOY_S1}} | {{INSTRUCTIONS}}',
        'S2': '{{NOM_PRENOM}} | {{STATUT}} | {{MOY_S1}} | {{APP_S1}} | {{MOY_S2}} | {{INSTRUCTIONS}}'
    }
};

/**
 * Données d'exemple unifiées pour le laboratoire d'aperçu ET l'import de masse.
 * Ces 5 profils représentent différents cas typiques d'élèves.
 */

// Texte d'exemple pour l'import de masse (format: NOM Prénom | Statut | Moy T1 | App T1 | Moy T2 | Instructions)
export const SAMPLE_IMPORT_TEXT = `MARTIN Lucas |  | 12.5 | Bon début. | 13.2 | Participe bien.
DURAND Sophie | PPRE | 9.1 | Doit s'investir. | 10.5 | Élève discrète.
LEFEVRE Thomas |  | 15.0 | Très bonne participation. | 14.5 | Maintenir le cap.
PETIT Camille |  | 8.2 | Difficultés persistantes. | 7.0 | Besoins spécifiques.
ROUSSEAU Emma | Délégué | 17.1 | Excellents résultats. | 18.0 | Rôle moteur.
MOREAU Axel |  | 10.5 | Résultats corrects mais bavardages inacceptables. | 11.2 | Trop de bavardages, concentration à revoir.
THOMAS Léa |  | 8.5 | Des difficultés malgré du sérieux. | 9.8 | Poursuivre les efforts, ne pas se décourager.
BERNARD Hugo |  | 11.0 | Ensemble fragile. | 14.5 | Progression spectaculaire, bravo !`;

/**
 * Profils de démonstration pour le laboratoire d'aperçu.
 * Structure identique à celle générée par parseStudentLine.
 * Synchronisés avec SAMPLE_IMPORT_TEXT.
 */
export const DEMO_STUDENT_PROFILES = [
    {
        id: 'demo-martin',
        nom: 'MARTIN',
        prenom: 'Lucas',
        appreciation: '',
        studentData: {
            nom: 'MARTIN',
            prenom: 'Lucas',
            periods: {
                'T1': { grade: 12.5, appreciation: 'Bon début.' },
                'T2': { grade: 13.2, appreciation: '' },
                'T3': { grade: null, appreciation: '' },
                'S1': { grade: 12.5, appreciation: 'Bon début.' },
                'S2': { grade: 13.2, appreciation: '' }
            },
            statuses: [],
            currentPeriod: 'T2',
            subject: 'Générique',
            negativeInstructions: 'Participe bien.'
        },
        isDemo: true
    },
    {
        id: 'demo-durand',
        nom: 'DURAND',
        prenom: 'Sophie',
        appreciation: '',
        studentData: {
            nom: 'DURAND',
            prenom: 'Sophie',
            periods: {
                'T1': { grade: 9.1, appreciation: 'Doit s\'investir.' },
                'T2': { grade: 10.5, appreciation: '' },
                'T3': { grade: null, appreciation: '' },
                'S1': { grade: 9.1, appreciation: 'Doit s\'investir.' },
                'S2': { grade: 10.5, appreciation: '' }
            },
            statuses: ['PPRE'],
            currentPeriod: 'T2',
            subject: 'Générique',
            negativeInstructions: 'Élève discrète.'
        },
        isDemo: true
    },
    {
        id: 'demo-lefevre',
        nom: 'LEFEVRE',
        prenom: 'Thomas',
        appreciation: '',
        studentData: {
            nom: 'LEFEVRE',
            prenom: 'Thomas',
            periods: {
                'T1': { grade: 15.0, appreciation: 'Très bonne participation.' },
                'T2': { grade: 14.5, appreciation: '' },
                'T3': { grade: null, appreciation: '' },
                'S1': { grade: 15.0, appreciation: 'Très bonne participation.' },
                'S2': { grade: 14.5, appreciation: '' }
            },
            statuses: [],
            currentPeriod: 'T2',
            subject: 'Générique',
            negativeInstructions: 'Maintenir le cap.'
        },
        isDemo: true
    },
    {
        id: 'demo-petit',
        nom: 'PETIT',
        prenom: 'Camille',
        appreciation: '',
        studentData: {
            nom: 'PETIT',
            prenom: 'Camille',
            periods: {
                'T1': { grade: 8.2, appreciation: 'Difficultés persistantes.' },
                'T2': { grade: 7.0, appreciation: '' },
                'T3': { grade: null, appreciation: '' },
                'S1': { grade: 8.2, appreciation: 'Difficultés persistantes.' },
                'S2': { grade: 7.0, appreciation: '' }
            },
            statuses: [],
            currentPeriod: 'T2',
            subject: 'Générique',
            negativeInstructions: 'Besoins spécifiques.'
        },
        isDemo: true
    },
    {
        id: 'demo-rousseau',
        nom: 'ROUSSEAU',
        prenom: 'Emma',
        appreciation: '',
        studentData: {
            nom: 'ROUSSEAU',
            prenom: 'Emma',
            periods: {
                'T1': { grade: 17.1, appreciation: 'Excellents résultats.' },
                'T2': { grade: 18.0, appreciation: '' },
                'T3': { grade: null, appreciation: '' },
                'S1': { grade: 17.1, appreciation: 'Excellents résultats.' },
                'S2': { grade: 18.0, appreciation: '' }
            },
            statuses: ['Délégué'],
            currentPeriod: 'T2',
            subject: 'Générique',
            negativeInstructions: 'Rôle moteur.'
        },
        isDemo: true
    },
    {
        id: 'demo-moreau',
        nom: 'MOREAU',
        prenom: 'Axel',
        appreciation: '',
        studentData: {
            nom: 'MOREAU',
            prenom: 'Axel',
            periods: {
                'T1': { grade: 10.5, appreciation: 'Résultats corrects mais bavardages inacceptables.' },
                'T2': { grade: 11.2, appreciation: '' },
                'T3': { grade: null, appreciation: '' },
                'S1': { grade: 10.5, appreciation: 'Résultats corrects mais bavardages.' },
                'S2': { grade: 11.2, appreciation: '' }
            },
            statuses: [],
            currentPeriod: 'T2',
            subject: 'Générique',
            negativeInstructions: 'Trop de bavardages, concentration à revoir.'
        },
        isDemo: true
    },
    {
        id: 'demo-thomas',
        nom: 'THOMAS',
        prenom: 'Léa',
        appreciation: '',
        studentData: {
            nom: 'THOMAS',
            prenom: 'Léa',
            periods: {
                'T1': { grade: 8.5, appreciation: 'Des difficultés malgré du sérieux.' },
                'T2': { grade: 9.8, appreciation: '' },
                'T3': { grade: null, appreciation: '' },
                'S1': { grade: 8.5, appreciation: 'Des difficultés malgré du sérieux.' },
                'S2': { grade: 9.8, appreciation: '' }
            },
            statuses: [],
            currentPeriod: 'T2',
            subject: 'Générique',
            negativeInstructions: 'Poursuivre les efforts, ne pas se décourager.'
        },
        isDemo: true
    },
    {
        id: 'demo-bernard',
        nom: 'BERNARD',
        prenom: 'Hugo',
        appreciation: '',
        studentData: {
            nom: 'BERNARD',
            prenom: 'Hugo',
            periods: {
                'T1': { grade: 11.0, appreciation: 'Ensemble fragile.' },
                'T2': { grade: 14.5, appreciation: '' },
                'T3': { grade: null, appreciation: '' },
                'S1': { grade: 11.0, appreciation: 'Ensemble fragile.' },
                'S2': { grade: 14.5, appreciation: '' }
            },
            statuses: [],
            currentPeriod: 'T2',
            subject: 'Générique',
            negativeInstructions: 'Progression spectaculaire, bravo !'
        },
        isDemo: true
    }
];
