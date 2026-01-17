/**
 * @fileoverview Parsers modulaires pour l'import de données PDF
 * 
 * Architecture extensible : chaque format PDF a son propre parser
 * Pour ajouter un nouveau format :
 *   1. Créer une fonction detect[FormatName](text) -> boolean
 *   2. Créer une fonction convert[FormatName](text) -> string (tab-separated)
 *   3. Ajouter le parser à PDF_PARSERS array
 * 
 * @module utils/PdfParsers
 */

// ============================================================================
// HELPERS COMMUNS
// ============================================================================

/**
 * Normalise les espaces spéciaux (non-breaking spaces, etc.)
 */
function normalizeWhitespace(text) {
    return text.replace(/[\u00A0\u2007\u202F]/g, ' ');
}

/**
 * Vérifie si une ligne est un en-tête/titre à exclure
 */
const EXCLUDE_KEYWORDS = /appréciations|parcours|collège|semestre|éducatif|classe|citoyen|avenir|santé|artistique|culturelle|individuelles|bilan|édité|page/i;

function isHeaderLine(line) {
    return EXCLUDE_KEYWORDS.test(line);
}

/**
 * Vérifie si une ligne est un NOM complet en majuscules (sans chiffres, sans minuscules)
 */
function isAllCapsName(line) {
    return line &&
        !/\d/.test(line) &&
        !/[a-zàâäéèêëïîôùûüç]/.test(line) &&
        line.length > 2;
}

/**
 * Vérifie si une ligne est un prénom seul (minuscules, sans chiffres)
 */
function isFirstNameOnly(line) {
    return line &&
        !/\d/.test(line) &&
        /[a-zàâäéèêëïîôùûüç]/.test(line);
}

// ============================================================================
// PARSER : FORMAT BILAN PRONOTE
// ============================================================================
// Format : NOM Prénom + count + note (ex: "DUPONT Marie315,5")
// Variante multi-lignes quand noms longs

/**
 * Détecte le format PDF Bilan Pronote
 */
export function detectPronoteReport(rawData) {
    const pdfLinePattern = /^.+[a-zàâäéèêëïîôùûüç]\d{1,2}\d{1,2}[.,]\d$/;
    const lines = rawData.split('\n').map(l => l.trim()).filter(l => l !== '');

    let matchCount = 0;
    for (const line of lines) {
        if (pdfLinePattern.test(line)) {
            matchCount++;
            if (matchCount >= 3) return true;
        }
    }
    return false;
}

/**
 * Convertit le format Pronote Bilan en tabulaire
 */
export function convertPronoteReport(rawData) {
    const normalizedData = normalizeWhitespace(rawData);
    let lines = normalizedData.split('\n').map(l => l.trim()).filter(l => l !== '');

    // Étape 1 : Fusionner les lignes de noms découpés
    lines = mergeMultiLineNames(lines);

    // Étape 2 : Extraire les élèves
    return extractStudents(lines);
}

/**
 * Fusionne les noms sur plusieurs lignes
 */
function mergeMultiLineNames(lines) {
    const merged = [];

    for (let i = 0; i < lines.length; i++) {
        const line1 = lines[i];
        const line2 = lines[i + 1];
        const line3 = lines[i + 2];

        // Format 3 lignes : NOM / Prénom / Notes
        if (isAllCapsName(line1) && isFirstNameOnly(line2) &&
            line3 && /^\d/.test(line3) && /\d[.,]\d/.test(line3)) {
            const gradeData = line3.replace(/\s+/g, '');
            merged.push(line1 + ' ' + line2 + gradeData);
            i += 2;
            continue;
        }

        // Format 2 lignes : NOM / PrénomNotes
        if (isAllCapsName(line1) && line2 && /\d[.,]\d$/.test(line2)) {
            merged.push(line1 + ' ' + line2);
            i++;
            continue;
        }

        // Format 2 lignes SANS notes : NOM / Prénom (quand pas de note du tout)
        // Ex: "BRYCHE CRASSET" + "Evie" suivi d'un autre nom ou rien
        // line3 est soit vide, soit un autre élève (ALL CAPS ou NOM Prénom), soit un header
        const line3IsNewStudent = line3 && (
            isAllCapsName(line3) ||
            /^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)?\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç]/.test(line3)
        );
        if (isAllCapsName(line1) && isFirstNameOnly(line2) &&
            (!line3 || line3IsNewStudent || isHeaderLine(line3))) {
            merged.push(line1 + ' ' + line2);
            i++;
            continue;
        }

        merged.push(line1);
    }

    return merged;
}

/**
 * Extrait les élèves depuis les lignes fusionnées
 */
function extractStudents(lines) {
    const students = [];

    // Pattern élève avec notes
    const patternWithGrade = /^(.+[a-zàâäéèêëïîôùûüç])(\d{1,2}?)(\d{1,2}[.,]\d)$/;

    // Pattern élève sans notes (NOM MAJUSCULES + Prénom)
    const patternNoGrade = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)*)$/;

    for (const line of lines) {
        // Skip headers
        if (isHeaderLine(line)) continue;

        // Avec notes
        let match = line.match(patternWithGrade);
        if (match) {
            const name = match[1].trim();
            const grade = match[3].replace(',', '.');
            students.push(`${name}\t\t${grade}\t`);
            continue;
        }

        // Sans notes
        match = line.match(patternNoGrade);
        if (match) {
            students.push(`${match[1].trim()}\t\t\t`);
        }
    }

    return students.join('\n');
}

// ============================================================================
// REGISTRY DES PARSERS PDF
// ============================================================================

/**
 * Liste des parsers PDF disponibles
 * Ordre = priorité de détection
 */
export const PDF_PARSERS = [
    {
        name: 'pronote-bilan',
        description: 'Bilan appréciations Pronote',
        detect: detectPronoteReport,
        convert: convertPronoteReport
    }
    // Ajouter ici les futurs parsers :
    // {
    //     name: 'autre-format',
    //     description: 'Description du format',
    //     detect: detectAutreFormat,
    //     convert: convertAutreFormat
    // }
];

/**
 * Détecte et convertit automatiquement un PDF
 * @returns {{ name: string, data: string } | null}
 */
export function autoConvertPdf(rawData) {
    for (const parser of PDF_PARSERS) {
        if (parser.detect(rawData)) {
            return {
                name: parser.name,
                description: parser.description,
                data: parser.convert(rawData)
            };
        }
    }
    return null;
}
