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
