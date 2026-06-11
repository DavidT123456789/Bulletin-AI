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
    '3eme': { label: "3ème (Brevet)", icon: "solar:diploma-linear" },
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
        /\b[12]\s*(?:eme|ème|è|e|ère|ere|re|nde|nd|°|º|o)/i.test(cleanName) ||
        /\b[12]\s*[A-Z]\d*\b/i.test(cleanName)
    ) {
        return 'lycee';
    }

    // 5. 3ème (séparé du collège)
    // Gère "3ème", "3e", "3°", "305", "3 A", "3G1"
    if (
        /troisi[eéè]me/i.test(cleanName) ||
        /\bbrevet\b/i.test(cleanName) ||
        /\b30[1-9]\b/.test(cleanName) ||
        /\b3\s*(?:eme|ème|è|e|°|º|o)/i.test(cleanName) ||
        /\b3\s*[A-Z]\d*\b/i.test(cleanName)
    ) {
        return '3eme';
    }

    // 6. Collège (6e, 5e, 4e)
    // Gère "6ème", "5e", "4°", "602", "4 B", "Picasso 6ème"
    if (
        /sixi[eéè]me/i.test(cleanName) ||
        /cinqui[eéè]me/i.test(cleanName) ||
        /quatri[eéè]me/i.test(cleanName) ||
        /coll[eéè]ge/i.test(cleanName) ||
        /\b[654]0[1-9]\b/.test(cleanName) ||
        /\b[654]\s*(?:eme|ème|è|e|°|o)/i.test(cleanName) ||
        /\b[654]\s*[A-Z]\d*\b/i.test(cleanName)
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
