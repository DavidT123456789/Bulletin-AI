/**
 * @fileoverview Utilitaires pour l'import de données en masse
 * @module utils/ImportUtils
 */

/**
 * @typedef {Object} SeparatorInfo
 * @property {number} count - Nombre d'occurrences du séparateur par ligne
 * @property {number} lines - Nombre de lignes avec ce séparateur
 */

/**
 * Détecte automatiquement le séparateur utilisé dans des données tabulaires
 * Analyse les 10 premières lignes et cherche un séparateur cohérent
 * 
 * @param {string} rawData - Les données brutes (texte multi-lignes)
 * @returns {string} Le séparateur détecté ('\t', '|', ';', ou ',')
 * 
 * @example
 * detectSeparator("Nom\tPrénom\tNote\nMartin\tLucas\t15");
 * // returns '\t'
 * 
 * @example
 * detectSeparator("Nom | Prénom | Note\nMartin | Lucas | 15");
 * // returns '|'
 */
export function detectSeparator(rawData) {
    const lines = rawData.split('\n').filter(line => line.trim() !== '').slice(0, 10);
    if (lines.length === 0) return '\t';

    const separators = ['\t', '|', ';', ','];
    /** @type {Object.<string, SeparatorInfo>} */
    const counts = {};

    separators.forEach(sep => {
        const sepCounts = lines.map(line => (line.match(new RegExp(`\\${sep}`, 'g')) || []).length);

        const validCounts = sepCounts.filter(count => count > 0);
        if (validCounts.length === 0) return;

        const firstCount = validCounts[0];
        const isConsistent = validCounts.every(count => count === firstCount);

        if (isConsistent) {
            counts[sep] = {
                count: firstCount,
                lines: validCounts.length
            };
        }
    });

    // Trie par nombre de lignes cohérentes, puis par nombre d'occurrences
    const bestSep = Object.keys(counts).sort((a, b) => {
        if (counts[b].lines !== counts[a].lines) return counts[b].lines - counts[a].lines;
        return counts[b].count - counts[a].count;
    })[0];

    return bestSep || '\t';
}

/**
 * Parse une ligne de données avec le séparateur donné
 * 
 * @param {string} line - La ligne à parser
 * @param {string} separator - Le séparateur à utiliser
 * @returns {string[]} Tableau des valeurs splittées et trimées
 */
export function parseLine(line, separator) {
    if (separator === '\t') {
        return line.split('\t').map(p => p.trim());
    }
    return line.split(separator).map(p => p.trim());
}

/**
 * Détecte si les données sont au format vertical multi-lignes
 * Format attendu : 4 lignes par élève
 *   1. NOM Prénom
 *   2. Nombre de notes (entier)
 *   3. Moyenne (décimal avec virgule ou point)
 *   4. Prénom NOM - Période - Matière
 * 
 * @param {string} rawData - Les données brutes
 * @returns {boolean} True si le format vertical est détecté
 */
export function detectVerticalFormat(rawData) {
    const lines = rawData.split('\n').map(l => l.trim()).filter(l => l !== '');

    // Besoin d'au moins 8 lignes (2 élèves) pour confirmer le pattern
    if (lines.length < 8) return false;

    // Vérifie si aucune ligne ne contient les séparateurs classiques
    const hasTabularSeparator = lines.some(l =>
        l.includes('\t') || (l.match(/\|/g) || []).length >= 2
    );
    if (hasTabularSeparator) return false;

    // Pattern de validation pour les blocs de 4 lignes
    const isValidBlock = (startIdx) => {
        if (startIdx + 3 >= lines.length) return false;

        const line1 = lines[startIdx];     // NOM Prénom
        const line2 = lines[startIdx + 1]; // Nombre de notes
        const line3 = lines[startIdx + 2]; // Moyenne
        const line4 = lines[startIdx + 3]; // Contexte avec " - "

        // Ligne 1: Doit contenir au moins 2 mots (nom + prénom)
        const words = line1.split(/\s+/).filter(w => w.length > 0);
        if (words.length < 2) return false;

        // Ligne 2: Doit être un entier (nombre de notes)
        if (!/^\d+$/.test(line2)) return false;

        // Ligne 3: Doit être un nombre décimal (moyenne) - virgule ou point
        if (!/^\d+([.,]\d+)?$/.test(line3)) return false;

        // Ligne 4: Doit contenir " - " (séparateur de contexte)
        if (!line4.includes(' - ')) return false;

        return true;
    };

    // Vérifie au moins 2 blocs consécutifs valides
    let validBlocks = 0;
    for (let i = 0; i + 3 < lines.length; i += 4) {
        if (isValidBlock(i)) {
            validBlocks++;
            if (validBlocks >= 2) return true;
        } else {
            break; // Pattern cassé, arrête la vérification
        }
    }

    return false;
}

/**
 * Convertit le format vertical multi-lignes en format tabulaire
 * 
 * @param {string} rawData - Les données au format vertical
 * @returns {string} Les données converties au format tabulaire (tab-separated)
 */
export function convertVerticalToTabular(rawData) {
    const lines = rawData.split('\n').map(l => l.trim()).filter(l => l !== '');
    const students = [];

    // Traite les lignes par blocs de 4
    for (let i = 0; i + 3 < lines.length; i += 4) {
        const nameLine = lines[i];           // NOM Prénom
        // const noteCount = lines[i + 1];   // Nombre de notes (ignoré)
        const average = lines[i + 2];        // Moyenne
        const contextLine = lines[i + 3];    // Prénom NOM - Période - Matière

        // Parse le contexte : "Prénom NOM - Période - Matière"
        const contextParts = contextLine.split(' - ');
        // On ignore la première partie (nom répété), on garde période + matière
        const context = contextParts.slice(1).join(' - ');

        // Normalise la moyenne (remplace virgule par point pour cohérence)
        const normalizedAvg = average.replace(',', '.');

        // Format: NOM Prénom | (vide=statut) | Moyenne | Contexte
        students.push(`${nameLine}\t\t${normalizedAvg}\t${context}`);
    }

    return students.join('\n');
}

// Les fonctions PDF ont été déplacées vers PdfParsers.js
// pour une architecture modulaire extensible
