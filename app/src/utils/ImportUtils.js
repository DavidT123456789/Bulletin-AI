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
 * Format attendu : 2-4 lignes par élève (variable selon si l'élève a une note)
 *   - Avec note (4 lignes):
 *     1. NOM Prénom
 *     2. Nombre de notes (entier) - peut être "Saisir un commentaire" à ignorer
 *     3. Moyenne (décimal avec virgule ou point)
 *     4. Prénom NOM - Période - Matière (contexte avec " - ")
 *   - Sans note (2 lignes):
 *     1. NOM Prénom
 *     2. Prénom NOM - Période - Matière (contexte avec " - ")
 * 
 * @param {string} rawData - Les données brutes
 * @returns {boolean} True si le format vertical est détecté
 */
export function detectVerticalFormat(rawData) {
    const lines = rawData.split('\n').map(l => l.trim()).filter(l => l !== '' && !l.startsWith('Saisir un commentaire'));

    // Besoin d'au moins 4 lignes (2 élèves sans notes) pour confirmer le pattern
    if (lines.length < 4) return false;

    // Vérifie si aucune ligne ne contient les séparateurs classiques
    const hasTabularSeparator = lines.some(l =>
        l.includes('\t') || (l.match(/\|/g) || []).length >= 2
    );
    if (hasTabularSeparator) return false;

    // Détecte le pattern : cherche des lignes contexte contenant " - "
    // qui suivent soit un nom (sans note) soit une moyenne (avec note)
    let contextLines = 0;
    let nameLines = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Ligne contexte : contient " - " (ex: "Prénom NOM - Période - Matière")
        if (line.includes(' - ')) {
            contextLines++;
        }
        // Ligne nom : au moins 2 mots, tout en majuscules pour le nom de famille
        else if (/^[A-ZÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ\s-]+\s+[A-Za-zéèêëàâäùûüôöîïç]+/.test(line)) {
            nameLines++;
        }
    }

    // Le format est valide si on a au moins 2 élèves (2 contextes et 2 noms)
    return contextLines >= 2 && nameLines >= 2;
}

// ========== HELPERS pour le parsing vertical ==========

/** Vérifie si une ligne est un nom d'élève (NOM Prénom) */
const isStudentName = (line) =>
    /^[A-ZÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ][A-ZÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ\s-]*\s+[A-Za-zéèêëàâäùûüôöîïç]/.test(line)
    && !line.includes(' - ');

/** Vérifie si une ligne est un contexte (contient " - ") */
const isContextLine = (line) => line.includes(' - ');

/** Vérifie si une ligne est un nombre (entier ou décimal) */
const isNumber = (line) => /^\d+([.,]\d+)?$/.test(line);

/** Vérifie si c'est un petit entier (compte de notes: 1-9) */
const isSmallInt = (line) => /^[1-9]$/.test(line);

/** Extrait la moyenne depuis une ligne (normalise virgule → point) */
const parseAverage = (line) => isNumber(line) ? line.replace(',', '.') : '';

/** Extrait le contexte (partie après le premier " - ") */
const parseContext = (line) => line.split(' - ').slice(1).join(' - ');

/**
 * Convertit le format vertical multi-lignes en format tabulaire
 * Gère les élèves avec ou sans notes de manière dynamique
 * 
 * @param {string} rawData - Les données au format vertical
 * @returns {string} Les données converties au format tabulaire (tab-separated)
 */
export function convertVerticalToTabular(rawData) {
    const lines = rawData.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('Saisir un commentaire'));

    const students = [];
    let i = 0;

    while (i < lines.length) {
        // Cherche la prochaine ligne nom
        if (!isStudentName(lines[i])) { i++; continue; }

        const name = lines[i];
        const block = lines.slice(i + 1, i + 4); // Max 3 lignes après le nom

        // Trouve le contexte dans le bloc
        const ctxIdx = block.findIndex(isContextLine);

        let average = '';
        let context = '';
        let skip = 1;

        if (ctxIdx === -1) {
            // Données tronquées : cherche juste la moyenne
            for (const line of block) {
                if (isStudentName(line)) break;
                if (isNumber(line) && !isSmallInt(line)) { average = parseAverage(line); break; }
                if (isSmallInt(line)) continue; // Ignore le compte
            }
            skip = block.findIndex(isStudentName);
            skip = skip === -1 ? block.length + 1 : skip + 1;
        }
        else if (ctxIdx === 0) {
            // Sans note : Nom → Contexte
            context = parseContext(block[0]);
            skip = 2;
        }
        else {
            // Avec note : la ligne avant le contexte est la moyenne
            context = parseContext(block[ctxIdx]);
            average = parseAverage(block[ctxIdx - 1]);
            skip = ctxIdx + 2;
        }

        students.push(`${name}\t\t${average}\t${context}`);
        i += skip;
    }

    return students.join('\n');
}

// Les fonctions PDF ont été déplacées vers PdfParsers.js
// pour une architecture modulaire extensible
