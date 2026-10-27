/**
 * @fileoverview Source de vérité unique (SSOT 3) pour les constantes métier scolaires :
 * - Statuts d'élèves (accompagnement médico-scolaire Art. 9 RGPD, mouvements, rôles)
 * - Systèmes de périodes (Trimestres T1/T2/T3 vs Semestres S1/S2)
 * - Tranches et seuils de notes (0-4, 4-8, 8-12, 12-16, 16-20)
 * @module config/academicConstants
 */

/**
 * Registre canonique des statuts d'élèves.
 * Réconcilie les définitions d'interface (Focus Panel, Formulaire, Plan de classe, Liste)
 * et la traduction pédagogique neutre RGPD (Art. 9) pour les prompts IA.
 */
export const STUDENT_STATUS_REGISTRY = Object.freeze({
    NOUVEAU: Object.freeze({
        id: 'Nouveau',
        label: 'Nouveau',
        fullName: 'Élève arrivé récemment dans la classe',
        description: 'Élève arrivé récemment dans la classe',
        category: 'movement',
        movementKind: 'new',
        cssModifier: 'status-nouveau',
        badgeClass: 'tag-badge tag-badge--new',
        hasDateSubfield: true,
        isDevice: false,
        isSelectableInUI: true,
        isGdprSensitive: false,
        aliases: Object.freeze(['nouveau']),
        promptInstruction: "Tenir compte de l'arrivée récente de l'élève en cours d'année et valoriser son adaptation.",
        formatPromptInstruction: (raw) => `Tenir compte de l'arrivée récente de l'élève en cours d'année (${raw}) et valoriser son adaptation.`,
    }),
    DEPART: Object.freeze({
        id: 'Départ',
        label: 'Départ',
        fullName: 'Élève qui quitte la classe prochainement',
        description: 'Élève qui quitte la classe prochainement',
        category: 'movement',
        movementKind: 'depart',
        cssModifier: 'status-depart',
        badgeClass: 'tag-badge tag-badge--depart',
        hasDateSubfield: true,
        isDevice: false,
        isSelectableInUI: true,
        isGdprSensitive: false,
        aliases: Object.freeze(['départ', 'depart']),
        promptInstruction: "Tenir compte du départ de l'élève en dressant un bilan factuel et bienveillant de sa présence.",
        formatPromptInstruction: (raw) => `Tenir compte du départ de l'élève (${raw}) en dressant un bilan factuel et bienveillant de sa présence.`,
    }),
    PPRE: Object.freeze({
        id: 'PPRE',
        label: 'PPRE',
        fullName: 'Programme Personnalisé de Réussite Éducative',
        description: 'Programme Personnalisé de Réussite Éducative',
        category: 'accompaniment',
        cssModifier: 'status-ppre',
        badgeClass: 'tag-badge tag-badge--device',
        isDevice: true,
        isSelectableInUI: true,
        isGdprSensitive: false,
        aliases: Object.freeze(['ppre']),
        promptInstruction: "Encourager les efforts sur les compétences fondamentales ciblées et donner des conseils méthodologiques accessibles, sans mentionner de programme d'accompagnement.",
    }),
    PAP: Object.freeze({
        id: 'PAP',
        label: 'PAP',
        fullName: "Plan d'Accompagnement Personnalisé",
        description: "Plan d'Accompagnement Personnalisé",
        category: 'accompaniment',
        cssModifier: 'status-pap',
        badgeClass: 'tag-badge tag-badge--device',
        isDevice: true,
        isSelectableInUI: true,
        isGdprSensitive: true,
        aliases: Object.freeze(['pap']),
        promptInstruction: "Valoriser les progrès réalisés au regard des aménagements pédagogiques mis en place, avec un ton bienveillant, sans jamais mentionner de dispositif administratif ou médical.",
    }),
    PAI: Object.freeze({
        id: 'PAI',
        label: 'PAI',
        fullName: "Projet d'Accueil Individualisé",
        description: "Projet d'Accueil Individualisé",
        category: 'accompaniment',
        cssModifier: 'status-pai',
        badgeClass: 'tag-badge tag-badge--device',
        isDevice: true,
        isSelectableInUI: true,
        isGdprSensitive: true,
        aliases: Object.freeze(['pai']),
        promptInstruction: "Tenir compte avec bienveillance du rythme de l'élève sans jamais faire allusion à sa santé ou à un protocole médical.",
    }),
    AESH: Object.freeze({
        id: 'AESH',
        label: 'AESH',
        fullName: "Accompagnant d'Élève en Situation de Handicap",
        description: "Accompagnant d'Élève en Situation de Handicap",
        category: 'accompaniment',
        cssModifier: 'status-aesh',
        badgeClass: 'tag-badge tag-badge--device',
        isDevice: true,
        isSelectableInUI: true,
        isGdprSensitive: true,
        aliases: Object.freeze(['aesh']),
        promptInstruction: "Mettre en avant l'autonomie progressive et les réussites de l'élève, sans mentionner d'accompagnement humain en classe.",
    }),
    ULIS: Object.freeze({
        id: 'ULIS',
        label: 'ULIS',
        fullName: "Unité Localisée pour l'Inclusion Scolaire",
        description: "Unité Localisée pour l'Inclusion Scolaire",
        category: 'accompaniment',
        cssModifier: 'status-ulis',
        badgeClass: 'tag-badge tag-badge--ulis',
        isDevice: true,
        isSelectableInUI: true,
        isGdprSensitive: true,
        aliases: Object.freeze(['ulis']),
        promptInstruction: "Évaluer les acquis par rapport aux objectifs personnalisés de l'élève en valorisant son implication et ses progrès, sans jamais mentionner de dispositif d'inclusion scolaire ou de handicap.",
    }),
    GEVASCO: Object.freeze({
        id: 'Geva-Sco',
        label: 'Geva-Sco',
        fullName: "Guide d'Évaluation des Besoins de Compensation en Matière de Scolarisation",
        description: "Guide d'Évaluation des Besoins de Compensation en Matière de Scolarisation",
        category: 'accompaniment',
        cssModifier: 'status-gevasco',
        badgeClass: 'tag-badge tag-badge--device',
        isDevice: true,
        isSelectableInUI: false,
        isGdprSensitive: true,
        aliases: Object.freeze(['geva-sco', 'gevasco', 'geva', 'mdph', 'pps']),
        promptInstruction: "Valoriser les progrès et l'investissement de l'élève au regard de son parcours adapté, sans jamais mentionner de dossier médico-scolaire ou administratif.",
    }),
    DELEGUE: Object.freeze({
        id: 'Délégué',
        label: 'Délégué',
        fullName: 'Délégué de classe',
        description: 'Délégué de classe',
        category: 'role',
        cssModifier: 'status-delegue',
        badgeClass: 'tag-badge tag-badge--delegate',
        hasRoleSubfield: true,
        isDevice: false,
        isSelectableInUI: true,
        isGdprSensitive: false,
        aliases: Object.freeze(['délégué', 'delegue']),
        promptInstruction: "Prendre en compte l'engagement citoyen de l'élève si pertinent.",
        formatPromptInstruction: (raw) => `Prendre en compte l'engagement citoyen de l'élève (${raw}) si pertinent.`,
    }),
});

/**
 * Dictionnaire des descriptions info-bulles par identifiant canonique de statut.
 */
export const STATUS_DESCRIPTIONS = Object.freeze(
    Object.values(STUDENT_STATUS_REGISTRY).reduce((acc, entry) => {
        acc[entry.id] = entry.description;
        return acc;
    }, {})
);

/**
 * Expression régulière de filet de sécurité RGPD (Art. 9) détectant tout terme médico-scolaire
 * librement saisi qui ne correspondrait pas directement à une entrée canonique.
 */
export const GDPR_SENSITIVE_STATUS_PATTERN = /\b(pap|ppre|ulis|pai|geva[-\s]?sco|aesh|pps|mdph|segpa|dys\w*|tdah|tsa|handicap)\b/i;

/**
 * Consigne pédagogique neutre de repli pour tout statut médico-scolaire libre détecté.
 */
export const DEFAULT_GDPR_SENSITIVE_PROMPT_INSTRUCTION =
    "Adapter le propos avec bienveillance aux aménagements pédagogiques de l'élève, sans jamais mentionner de dispositif médical ou administratif.";

/**
 * Résout une chaîne de statut brute (ex: "ULIS", "Nouveau T2", "depart", "Geva-Sco", "pps")
 * vers son descripteur canonique dans STUDENT_STATUS_REGISTRY.
 * @param {string} rawStatus
 * @returns {Object|null}
 */
export function resolveStudentStatus(rawStatus) {
    const trimmed = String(rawStatus || '').trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('nouveau')) return STUDENT_STATUS_REGISTRY.NOUVEAU;
    if (lower.startsWith('départ') || lower.startsWith('depart')) return STUDENT_STATUS_REGISTRY.DEPART;
    if (lower.includes('délégué') || lower.includes('delegue')) return STUDENT_STATUS_REGISTRY.DELEGUE;

    if (lower === 'pap' || lower.startsWith('pap ')) return STUDENT_STATUS_REGISTRY.PAP;
    if (lower === 'ppre' || lower.startsWith('ppre ')) return STUDENT_STATUS_REGISTRY.PPRE;
    if (lower === 'ulis' || lower.startsWith('ulis ')) return STUDENT_STATUS_REGISTRY.ULIS;
    if (lower === 'pai' || lower.startsWith('pai ')) return STUDENT_STATUS_REGISTRY.PAI;
    if (lower === 'aesh' || lower.startsWith('aesh ')) return STUDENT_STATUS_REGISTRY.AESH;
    if (
        lower === 'geva-sco' ||
        lower === 'gevasco' ||
        lower.startsWith('geva') ||
        lower === 'mdph' ||
        lower.startsWith('mdph ') ||
        lower === 'pps' ||
        lower.startsWith('pps ')
    ) {
        return STUDENT_STATUS_REGISTRY.GEVASCO;
    }

    return null;
}

/**
 * Retourne la description info-bulle associée à un statut brut (ex: "Nouveau T2" -> description de "Nouveau").
 * @param {string} rawStatus
 * @returns {string}
 */
export function getStatusDescription(rawStatus) {
    if (STATUS_DESCRIPTIONS[rawStatus]) return STATUS_DESCRIPTIONS[rawStatus];
    const resolved = resolveStudentStatus(rawStatus);
    return resolved ? resolved.description : String(rawStatus || '');
}

/**
 * Retourne la liste des libellés de statuts sélectionnables en interface (Focus Panel / Formulaire).
 * @param {Object} [options]
 * @param {boolean} [options.includeMovement=true] - Inclure Nouveau/Départ
 * @returns {string[]}
 */
export function getSelectableStatusLabels({ includeMovement = true } = {}) {
    return Object.values(STUDENT_STATUS_REGISTRY)
        .filter(entry => entry.isSelectableInUI && (includeMovement || entry.category !== 'movement'))
        .map(entry => entry.label);
}

/**
 * Retourne les libellés de statuts de mouvement, qualifiés ou non par une période.
 * @param {string|null} [period=null]
 * @returns {string[]}
 */
export function getMovementStatusLabels(period = null) {
    return Object.values(STUDENT_STATUS_REGISTRY)
        .filter(entry => entry.category === 'movement')
        .map(entry => (period ? `${entry.label} ${period}` : entry.label));
}

/**
 * Systèmes de périodes scolaires supportés.
 */
export const PERIOD_SYSTEMS = Object.freeze({
    trimestres: Object.freeze(['T1', 'T2', 'T3']),
    semestres: Object.freeze(['S1', 'S2']),
});

/**
 * Liste ordonnée de tous les identifiants de périodes connus.
 */
export const ALL_PERIODS = Object.freeze([
    ...PERIOD_SYSTEMS.trimestres,
    ...PERIOD_SYSTEMS.semestres,
]);

/**
 * Retourne la liste des périodes pour le système spécifié ('trimestres' par défaut, ou 'semestres').
 * @param {string} [periodSystem='trimestres']
 * @returns {string[]}
 */
export function getPeriodsForSystem(periodSystem = 'trimestres') {
    const periods = periodSystem === 'semestres' ? PERIOD_SYSTEMS.semestres : PERIOD_SYSTEMS.trimestres;
    return [...periods];
}

/**
 * Retourne la période immédiatement précédente dans le même système (ex: 'T2' -> 'T1', 'T1' -> null).
 * @param {string} period
 * @returns {string|null}
 */
export function getPreviousPeriod(period) {
    for (const systemPeriods of Object.values(PERIOD_SYSTEMS)) {
        const idx = systemPeriods.indexOf(period);
        if (idx !== -1) {
            return idx > 0 ? systemPeriods[idx - 1] : null;
        }
    }
    return null;
}

/**
 * Tranches canoniques de notes sur 20 pour l'histogramme, les statistiques et le codage couleur.
 */
export const GRADE_BRACKETS = Object.freeze([
    Object.freeze({ id: '0-4',   min: 0,  max: 4,  cssClass: 'grade-range-0-4',   semanticClass: 'grade-very-low',  label: '< 4' }),
    Object.freeze({ id: '4-8',   min: 4,  max: 8,  cssClass: 'grade-range-4-8',   semanticClass: 'grade-low',       label: '4 – 8' }),
    Object.freeze({ id: '8-12',  min: 8,  max: 12, cssClass: 'grade-range-8-12',  semanticClass: 'grade-average',   label: '8 – 12' }),
    Object.freeze({ id: '12-16', min: 12, max: 16, cssClass: 'grade-range-12-16', semanticClass: 'grade-good',      label: '12 – 16' }),
    Object.freeze({ id: '16-20', min: 16, max: 21, cssClass: 'grade-range-16-20', semanticClass: 'grade-excellent', label: '16 – 20' }),
]);

/** Alias de compatibilité pour GRADE_BRACKETS. */
export const GRADE_RANGES = GRADE_BRACKETS;

/** Liste ordonnée des identifiants de tranches ('0-4', '4-8', '8-12', '12-16', '16-20'). */
export const GRADE_BRACKET_IDS = Object.freeze(GRADE_BRACKETS.map(b => b.id));

/** Liste ordonnée des classes CSS de tranches ('grade-range-0-4', ...). */
export const GRADE_BRACKET_CLASSES = Object.freeze(GRADE_BRACKETS.map(b => b.cssClass));

/**
 * Retourne l'indice de tranche (0 à 4) pour une note numérique, ou -1 si invalide.
 * @param {number} grade
 * @returns {number}
 */
export function getGradeBracketIndex(grade) {
    if (typeof grade !== 'number' || Number.isNaN(grade)) return -1;
    for (let i = 0; i < GRADE_BRACKETS.length - 1; i++) {
        if (grade < GRADE_BRACKETS[i].max) return i;
    }
    return GRADE_BRACKETS.length - 1;
}

/**
 * Retourne le descripteur de tranche correspondant à une note, ou null si invalide.
 * @param {number} grade
 * @returns {Object|null}
 */
export function getGradeBracket(grade) {
    const idx = getGradeBracketIndex(grade);
    return idx === -1 ? null : GRADE_BRACKETS[idx];
}

/**
 * Retourne la classe CSS ('grade-range-0-4', ...) associée à une note.
 * @param {number} grade
 * @returns {string}
 */
export function getGradeCssClass(grade) {
    const bracket = getGradeBracket(grade);
    return bracket ? bracket.cssClass : '';
}

/**
 * Calcule la distribution des notes sous forme de tableau de 5 entiers [0-4, 4-8, 8-12, 12-16, 16-20].
 * @param {Array<number>} grades
 * @returns {number[]}
 */
export function computeGradeDistributionArray(grades) {
    const distribution = new Array(GRADE_BRACKETS.length).fill(0);
    if (!Array.isArray(grades)) return distribution;
    for (const g of grades) {
        const idx = getGradeBracketIndex(g);
        if (idx !== -1) distribution[idx]++;
    }
    return distribution;
}

/**
 * Calcule la distribution des notes sous forme d'objet indexé par identifiant de tranche {'0-4': n, ...}.
 * @param {Array<number>} grades
 * @returns {Object.<string, number>}
 */
export function computeGradeDistributionMap(grades) {
    const counts = computeGradeDistributionArray(grades);
    const map = {};
    GRADE_BRACKETS.forEach((bracket, idx) => {
        map[bracket.id] = counts[idx];
    });
    return map;
}
