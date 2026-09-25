/**
 * @fileoverview Détecteur automatique de niveau scolaire basé sur le nom de la classe.
 * Supporte les conventions de nommage des enseignants français.
 * 
 * @module utils/LevelDetector
 */

export const LEVELS = {
    generique: { label: "Générique", icon: "solar:minimalistic-bounds-linear" },
    maternelle: { label: "Maternelle", icon: "solar:emoji-funny-circle-linear" },
    elementaire: { label: "Élémentaire", icon: "solar:backpack-linear" },
    college: { label: "Collège", icon: "solar:school-linear" },
    lycee: { label: "Lycée", icon: "solar:notebook-linear" },
    terminale: { label: "Terminale", icon: "solar:cup-star-linear" },
    superieur: { label: "Supérieur", icon: "solar:mortarboard-linear" }
};

/**
 * Détecte automatiquement le niveau scolaire d'une classe à partir de son nom.
 * 
 * @param {string} name - Le nom de la classe (ex: "3°G1", "6ème Picasso", "CM2")
 * @returns {string} La clé du niveau détecté (correspondant à LEVELS)
 */
export function detectLevelFromName(name) {
    if (!name || typeof name !== 'string') return 'generique';

    // 1. Nettoyage préventif des années scolaires pour éviter les faux positifs (ex: "2025-2026", "2025")
    let cleanName = name
        .replace(/\b\d{4}[-/]\d{4}\b/g, '')
        .replace(/\b\d{4}\b/g, '')
        .trim();

    if (!cleanName) return 'generique';

    // 2. Enseignement Supérieur (BTS, CPGE, Licence, Master, etc.)
    if (
        /\b(?:bts|cpge|licence|master|l[1-3]|m[12])\b/i.test(cleanName) ||
        /sup[eéè]rieur/i.test(cleanName)
    ) {
        return 'superieur';
    }

    // 3. Terminale
    // Gère "Terminale", "Tle", "Term", "T02", "TG3", "TS1", "TG"
    // Exclut "T1", "T2", "T3", "T4" (qui sont des trimestres)
    if (
        /\b(?:terminale|term|tle)\b/i.test(cleanName) ||
        /\bT0[1-9]\b/i.test(cleanName) ||
        /\bT[1-9]\d+\b/i.test(cleanName) ||
        /\bT[G-Z]\d*\b/i.test(cleanName)
    ) {
        // S'assurer qu'il ne s'agit pas d'un trimestre seul (T1, T2, T3, T4)
        if (!/^\s*T[1-4]\s*$/i.test(cleanName) && !/\bT[1-4]\b/i.test(cleanName)) {
            return 'terminale';
        }
    }

    // 4. Lycée (2nde, 1ère)
    // Gère "2nde", "2nd", "Seconde", "1ère", "1ere", "1re", "Première", "Lycée", "208" (seconde), "104" (première)
    if (
        /\b(?:seconde|2nde|2nd|1ere|1re)\b/i.test(cleanName) ||
        /premi[eéè]re/i.test(cleanName) ||
        /lyc[eéè]e/i.test(cleanName) ||
        /\b[12]0[1-9]\b/.test(cleanName) ||
        /(?:^|\b)[12]\s*(?:eme|ème|è|e|ère|ere|re|nde|nd|°|º|o|\u1D49|ᵉ|\u02B3\u1D49|ʳᵉ|\u207F\u1D48|ⁿᵈ)/i.test(cleanName) ||
        /\b[12]\s*[A-Z]\d*\b/i.test(cleanName)
    ) {
        return 'lycee';
    }

    // 5. Collège (6e à 3e)
    // Gère "6ème", "5e", "4°", "3e", "305", "602", "4 B", "Picasso 6ème", "3ᵉG1"
    if (
        /sixi[eéè]me/i.test(cleanName) ||
        /cinqui[eéè]me/i.test(cleanName) ||
        /quatri[eéè]me/i.test(cleanName) ||
        /troisi[eéè]me/i.test(cleanName) ||
        /\bbrevet\b/i.test(cleanName) ||
        /coll[eéè]ge/i.test(cleanName) ||
        /\b[6543]0[1-9]\b/.test(cleanName) ||
        /(?:^|\b)[6543]\s*(?:eme|ème|è|e|°|º|o|\u1D49|ᵉ)/i.test(cleanName) ||
        /\b[6543]\s*[A-Z]\d*\b/i.test(cleanName)
    ) {
        return 'college';
    }

    // 7. École Élémentaire (CP à CM2)
    if (
        /\b(?:cp|ce1|ce2|cm1|cm2|primaire)\b/i.test(cleanName) ||
        /[eéè]l[eéè]mentaire/i.test(cleanName) ||
        /cours\s+(?:pr[eé]paratoire|[eé]l[eé]mentaire|moyen)/i.test(cleanName)
    ) {
        return 'elementaire';
    }

    // 8. Maternelle (TPS, PS, MS, GS)
    if (
        /\b(?:tps|ps|ms|gs)\b/i.test(cleanName) ||
        /maternelle/i.test(cleanName) ||
        /(?:toute\s+)?petite\s+section/i.test(cleanName) ||
        /moyenne\s+section/i.test(cleanName) ||
        /grande\s+section/i.test(cleanName)
    ) {
        return 'maternelle';
    }

    return 'generique';
}

/**
 * Calcule le rang d'ordre pédagogique officiel
 * Progression : Maternelle -> Élémentaire -> 6e -> 5e -> 4e -> 3e -> 2nde -> 1ere -> Terminale -> Supérieur
 * 
 * @param {string} name - Nom brut ou formaté de la classe
 * @returns {number} Rang numérique pour le tri
 */
export function getClassSortRank(name) {
    if (!name || typeof name !== 'string') return 999;
    const clean = name.trim();
    const withoutYear = clean.replace(/\b\d{4}[-/]\d{4}\b/g, '').replace(/\b\d{4}\b/g, '').trim();
    if (!withoutYear) return 999;

    // 1. Maternelle (TPS -> PS -> MS -> GS)
    if (/\btps\b|toute\s+petite/i.test(withoutYear)) return 10;
    if (/\bps\b|petite\s+section/i.test(withoutYear)) return 20;
    if (/\bms\b|moyenne\s+section/i.test(withoutYear)) return 30;
    if (/\bgs\b|grande\s+section/i.test(withoutYear)) return 40;
    if (/maternelle/i.test(withoutYear)) return 45;

    // 2. Primaire / Élémentaire (CP -> CE1 -> CE2 -> CM1 -> CM2)
    if (/\bcp\b|cours\s+pr[eéè]paratoire/i.test(withoutYear)) return 100;
    if (/\bce1\b/i.test(withoutYear)) return 110;
    if (/\bce2\b/i.test(withoutYear)) return 120;
    if (/\bcm1\b/i.test(withoutYear)) return 130;
    if (/\bcm2\b/i.test(withoutYear)) return 140;

    // 3. Collège : 6ème -> 5ème -> 4ème -> 3ème (sens officiel de progression de l'élève)
    if (/(?:^|\b)6(?:\u1D49|ᵉ|\s*(?:e|ème|eme|i[eèé]me|°|\^|-)|0[1-9]|\s*[a-z]|\s*\d|$)/i.test(withoutYear) || /sixi[eéè]me/i.test(withoutYear)) return 200;
    if (/(?:^|\b)5(?:\u1D49|ᵉ|\s*(?:e|ème|eme|i[eèé]me|°|\^|-)|0[1-9]|\s*[a-z]|\s*\d|$)/i.test(withoutYear) || /cinqui[eéè]me/i.test(withoutYear)) return 210;
    if (/(?:^|\b)4(?:\u1D49|ᵉ|\s*(?:e|ème|eme|i[eèé]me|°|\^|-)|0[1-9]|\s*[a-z]|\s*\d|$)/i.test(withoutYear) || /quatri[eéè]me/i.test(withoutYear)) return 220;
    if (/(?:^|\b)3(?:\u1D49|ᵉ|\s*(?:e|ème|eme|i[eèé]me|°|\^|-)|0[1-9]|\s*[a-z]|\s*\d|$)/i.test(withoutYear) || /troisi[eéè]me|\bbrevet\b/i.test(withoutYear)) return 230;

    // 4. Lycée : 2nde -> 1ère -> Terminale
    if (/\b(?:2nde|2nd|seconde)\b|\b20[1-9]\b|(?:^|\b)2(?:\u207F\u1D48|\u207F\u1D48\u1D49|ⁿᵈ|ⁿᵈᵉ|\s*(?:nde|nd|de|e|ème)|\s*g\d*)/i.test(withoutYear)) return 300;
    if (/\b(?:1ere|1ère|1re|premi[eèé]re)\b|\b10[1-9]\b|(?:^|\b)1(?:\u02B3\u1D49|ʳᵉ|\s*(?:ere|ère|re|er|e)|\s*g\d*)/i.test(withoutYear)) return 310;
    if (/\b(?:terminale|term|tle)\b|\bt0[1-9]\b|\bt[g-z]\d*/i.test(withoutYear)) return 320;

    // 5. Supérieur
    if (/\b(?:bts|cpge|licence|master|l[1-3]|m[12])\b|sup[eéè]rieur/i.test(withoutYear)) return 400;

    return 500;
}

/**
 * Comparateur pédagogique pour trier deux classes ou noms de classes
 * @param {string|Object} a
 * @param {string|Object} b
 * @returns {number}
 */
export function compareClassesPedagogically(a, b) {
    const nameA = typeof a === 'string' ? a : (a?.displayName || a?.name || '');
    const nameB = typeof b === 'string' ? b : (b?.displayName || b?.name || '');

    const rankA = getClassSortRank(nameA);
    const rankB = getClassSortRank(nameB);

    if (rankA !== rankB) {
        return rankA - rankB;
    }

    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}
