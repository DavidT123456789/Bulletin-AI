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

        // Avec notes : format "NOM Prénom[count][note]" (ex: "DUPONT Marie215,5")
        let match = line.match(patternWithGrade);
        if (match) {
            const name = match[1].trim();
            const count = match[2] || ''; // Nombre d'évaluations (Dev.)
            const grade = match[3].replace(',', '.');
            // Output: NOM Prénom \t count \t grade \t
            students.push(`${name}\t${count}\t${grade}\t`);
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
// PARSER : FORMAT MBN BILAN APPRÉCIATIONS (ENT Mon Bureau Numérique)
// ============================================================================
// Format : Bilan des appréciations avec notes et textes multi-lignes
// Structure : NOM Prénom + Dev. + Moy. + Appréciation (plusieurs lignes)
// Certains élèves n'ont pas de notes, et certains fichiers n'ont pas d'appréciations

/**
 * Détecte le format PDF MBN Bilan Appréciations
 * Recherche les marqueurs spécifiques : "Bilan des appréciations", colonnes "Dev. Moy."
 */
export function detectMbnBilan(rawData) {
    const lines = rawData.split('\n').map(l => l.trim());

    // Marqueurs MBN caractéristiques
    const hasBilanHeader = lines.some(l => /^Bilan des appréciations/i.test(l));
    const hasDevMoyHeader = lines.some(l => /Élève\s+Dev\.\s+Moy\./i.test(l) || /Dev\.\s+Moy\.\s+Acquisitions/i.test(l));
    const hasPageFooter = lines.some(l => /^Édité le\s*:/i.test(l));

    // Au moins 2 marqueurs sur 3 pour confirmer
    const markers = [hasBilanHeader, hasDevMoyHeader, hasPageFooter].filter(Boolean).length;
    return markers >= 2;
}

/**
 * Convertit le format MBN Bilan en tabulaire
 * Output: NOM Prénom \t Dev \t Moy \t Appréciation
 */
export function convertMbnBilan(rawData) {
    const normalizedData = normalizeWhitespace(rawData);
    const lines = normalizedData.split('\n').map(l => l.trim()).filter(l => l !== '');

    const students = [];
    let currentStudent = null;
    let pendingName = null; // Pour les noms sur 2 lignes

    // Pattern unifié pour lignes à ignorer (header/footer/matières)
    const IGNORE_PATTERN = /^(Bilan des appréciations|Collège|Année scolaire|TECHNOLOGIE|FRANÇAIS|MATHÉMATIQUES|HISTOIRE|ANGLAIS|ESPAGNOL|ARTS|Éléments travaillés|Appréciations individuelles|Élève\s+Dev\.|et difficultés|Édité le|Page \d|EA\s*:|Appréciations de la classe|Premier semestre|Second semestre|Parcours|Algorithme|Programmation)/i;
    const isIgnorableLine = (line) => IGNORE_PATTERN.test(line);

    // Fonction pour sauvegarder l'élève courant
    const saveCurrentStudent = () => {
        if (currentStudent) {
            const appreciation = currentStudent.appreciation.join(' ').trim();
            const dev = currentStudent.dev || '';
            const moy = currentStudent.moy ? currentStudent.moy.replace(',', '.') : '';
            students.push(`${currentStudent.name}\t${dev}\t${moy}\t${appreciation}`);
            currentStudent = null;
        }
    };

    // Helper : fusionne pendingName + lastName détecté sur la ligne suivante
    // Gère la concaténation directe (MAKARS--TREUTENA + ERE) vs espace (DOUILLOT + DARDENNE)
    const mergePendingName = (pending, detectedLastName) => {
        if (!pending) return detectedLastName;
        const startsLowercase = /^[a-zàâäéèêëïîôùûüç]/.test(detectedLastName);
        const pendingEndsHyphen = pending.endsWith('-');
        const isCompoundSplit = pending.includes('--') && /^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ]{1,4}$/.test(detectedLastName);
        const needsDirectConcat = startsLowercase || pendingEndsHyphen || isCompoundSplit;
        return needsDirectConcat
            ? pending + detectedLastName
            : `${pending} ${detectedLastName}`;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Ignorer les lignes de header/footer
        if (isIgnorableLine(line)) continue;

        // === PATTERN 1 : NOM Prénom Dev Moy Texte (avec notes ET appréciation) ===
        const fullPattern = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*)\s+([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)?)\s+(\d+)\s+(\d{1,2}[.,]\d)\s+(.+)$/;
        let match = line.match(fullPattern);
        if (match) {
            saveCurrentStudent();
            const [, lastName, firstName, dev, moy, appreciationStart] = match;
            const fullLastName = mergePendingName(pendingName, lastName);
            currentStudent = { name: `${fullLastName} ${firstName}`, dev, moy, appreciation: [appreciationStart] };
            pendingName = null;
            continue;
        }

        // === PATTERN 2 : NOM Prénom Dev Moy (avec notes, SANS appréciation) ===
        const noAppPattern = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*)\s+([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)?)\s+(\d+)\s+(\d{1,2}[.,]\d)$/;
        match = line.match(noAppPattern);
        if (match) {
            saveCurrentStudent();
            const [, lastName, firstName, dev, moy] = match;
            const fullLastName = mergePendingName(pendingName, lastName);
            currentStudent = { name: `${fullLastName} ${firstName}`, dev, moy, appreciation: [] };
            pendingName = null;
            continue;
        }

        // === PATTERN 3 : NOM Prénom Texte (sans notes, avec texte) ===
        const noGradeWithTextPattern = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*)\s+([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)?)\s+([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç].{10,})$/;
        match = line.match(noGradeWithTextPattern);
        if (match) {
            saveCurrentStudent();
            const [, lastName, firstName, appreciationStart] = match;
            const fullLastName = mergePendingName(pendingName, lastName);
            currentStudent = { name: `${fullLastName} ${firstName}`, dev: '', moy: '', appreciation: [appreciationStart] };
            pendingName = null;
            continue;
        }

        // === PATTERN 4 : NOM Prénom seul (sans notes, sans texte) ===
        const nameOnlyPattern = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*)\s+([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)?)$/;
        match = line.match(nameOnlyPattern);
        if (match) {
            saveCurrentStudent();
            const [, lastName, firstName] = match;
            const fullLastName = mergePendingName(pendingName, lastName);
            currentStudent = { name: `${fullLastName} ${firstName}`, dev: '', moy: '', appreciation: [] };
            pendingName = null;
            continue;
        }

        // === PATTERN 4b : NOM_CAPS Dev Moy Texte (nom multi-lignes, prénom sur ligne suivante) ===
        const capsNameWithGradeTextPattern = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*)\s+(\d+)\s+(\d{1,2}[.,]\d)\s+(.+)$/;
        match = line.match(capsNameWithGradeTextPattern);
        if (match) {
            saveCurrentStudent();
            const [, lastName, dev, moy, appreciationStart] = match;
            currentStudent = { name: lastName, dev, moy, appreciation: [appreciationStart] };
            pendingName = lastName; // Attend le prénom ensuite
            continue;
        }

        // === PATTERN 4c : NOM_CAPS Dev Moy (nom multi-lignes, notes sans appréciation) ===
        const capsNameWithGradePattern = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*)\s+(\d+)\s+(\d{1,2}[.,]\d)$/;
        match = line.match(capsNameWithGradePattern);
        if (match) {
            saveCurrentStudent();
            const [, lastName, dev, moy] = match;
            currentStudent = { name: lastName, dev, moy, appreciation: [] };
            pendingName = lastName;
            continue;
        }

        // === PATTERN 4d : NOM_CAPS Texte (nom multi-lignes, appréciation sans notes) ===
        const capsNameWithTextPattern = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*)\s+([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç].{10,})$/;
        match = line.match(capsNameWithTextPattern);
        if (match) {
            saveCurrentStudent();
            const [, lastName, appreciationStart] = match;
            currentStudent = { name: lastName, dev: '', moy: '', appreciation: [appreciationStart] };
            pendingName = lastName;
            continue;
        }

        // === PATTERN 5 : NOM seul (nom composé ou simple sur 2 lignes) ===
        const lastNameOnlyPattern = /^([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*)$/;
        if (!pendingName && lastNameOnlyPattern.test(line)) {
            saveCurrentStudent();
            pendingName = line;
            continue;
        }

        // === PATTERN 5b : Notes + Appréciation quand un nom est en attente ===
        // Arrive si les notes sont décalées en dessous du NOM mais au dessus du prénom par pdf.js
        const pendingNotesTextPattern = /^(\d+)\s+(\d{1,2}[.,]\d)(?:\s+(.+))?$/;
        if (pendingName && pendingNotesTextPattern.test(line)) {
            match = line.match(pendingNotesTextPattern);
            currentStudent = {
                name: pendingName,
                dev: match[1],
                moy: match[2],
                appreciation: match[3] ? [match[3]] : []
            };
            continue; // Keep pendingName active pour rattraper le prénom sur la ligne suivante
        }

        // === PATTERN 6 : Prénom seul ou Prénom+données (suite d'un nom composé / multi-lignes) ===
        // Gère aussi le cas où un élève complet a été créé (sans notes) mais son prénom continue sur la ligne suivante (ex: SALI Zeynel Abedin \n Yasir 2 12,0)
        const isStudentAwaitingGrades = currentStudent && !currentStudent.moy && !currentStudent.dev;
        if (pendingName || isStudentAwaitingGrades) {
            const activeName = pendingName || currentStudent.name;

            const fn6a = /^([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)?)\s+(\d+)\s+(\d{1,2}[.,]\d)\s+(.+)$/;
            match = line.match(fn6a);
            if (match) {
                const [, firstName, dev, moy, appText] = match;
                if (currentStudent && (currentStudent.name === pendingName || isStudentAwaitingGrades)) {
                    currentStudent.name = `${activeName} ${firstName}`;
                    currentStudent.dev = dev;
                    currentStudent.moy = moy;
                    currentStudent.appreciation.push(appText);
                } else {
                    currentStudent = { name: `${activeName} ${firstName}`, dev, moy, appreciation: [appText] };
                }
                pendingName = null;
                continue;
            }

            const fn6b = /^([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)?)\s+(\d+)\s+(\d{1,2}[.,]\d)$/;
            match = line.match(fn6b);
            if (match) {
                const [, firstName, dev, moy] = match;
                if (currentStudent && (currentStudent.name === pendingName || isStudentAwaitingGrades)) {
                    currentStudent.name = `${activeName} ${firstName}`;
                    currentStudent.dev = dev;
                    currentStudent.moy = moy;
                } else {
                    currentStudent = { name: `${activeName} ${firstName}`, dev, moy, appreciation: [] };
                }
                pendingName = null;
                continue;
            }

            const fn6c = /^([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)?)\s+([a-zàâäéèêëïîôùûüç].{5,})$/;
            match = line.match(fn6c);
            if (match) {
                const [, firstName, appText] = match;
                if (currentStudent && (currentStudent.name === pendingName || isStudentAwaitingGrades)) {
                    currentStudent.name = `${activeName} ${firstName}`;
                    currentStudent.appreciation.push(appText);
                } else {
                    currentStudent = { name: `${activeName} ${firstName}`, dev: '', moy: '', appreciation: [appText] };
                }
                pendingName = null;
                continue;
            }

            const firstNameOnlyPattern = /^([A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+(?:\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç'-]+)?)$/;
            if (firstNameOnlyPattern.test(line)) {
                if (currentStudent && (currentStudent.name === pendingName || isStudentAwaitingGrades)) {
                    currentStudent.name = `${activeName} ${line}`;
                } else {
                    currentStudent = { name: `${activeName} ${line}`, dev: '', moy: '', appreciation: [] };
                }
                pendingName = null;
                continue;
            }

            pendingName = null;
        }

        // === PATTERN 7 : Notes seules sur une ligne ===
        const notesOnlyPattern = /^(\d+)\s+(\d{1,2}[.,]\d)$/;
        if (currentStudent && !currentStudent.moy && notesOnlyPattern.test(line)) {
            const notesMatch = line.match(notesOnlyPattern);
            if (notesMatch) {
                currentStudent.dev = notesMatch[1];
                currentStudent.moy = notesMatch[2];
                continue;
            }
        }

        // === PATTERN 7b : Notes + Appréciation sur une ligne ===
        const notesAndTextPattern = /^(\d+)\s+(\d{1,2}[.,]\d)(?:\s+(.+))?$/;
        if (currentStudent && !currentStudent.moy && notesAndTextPattern.test(line)) {
            const notesMatch = line.match(notesAndTextPattern);
            if (notesMatch) {
                currentStudent.dev = notesMatch[1];
                currentStudent.moy = notesMatch[2];
                if (notesMatch[3]) currentStudent.appreciation.push(notesMatch[3]);
                continue;
            }
        }

        // === Suite d'appréciation ===
        if (currentStudent && line.length > 0 && !pendingName) {
            const looksLikeNewStudent = /^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]+\s+[A-ZÀ-ÿ][a-zàâäéèêëïîôùûüç]/.test(line) &&
                (/\d{1,2}[.,]\d/.test(line) || line.includes(' 2 '));
            const looksLikeNotes = /^\d+\s+\d{1,2}[.,]\d/.test(line);
            const looksLikeAllCapsName = /^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*$/.test(line) &&
                !/[a-zàâäéèêëïîôùûüç]/.test(line);
            const looksLikeCapsNameWithGrades = /^[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*(?:\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ][A-ZÀÂÄÉÈÊËÏÎÔÙÛÜÇ'-]*)*\s+\d+\s+\d{1,2}[.,]\d/.test(line);

            if (looksLikeAllCapsName) {
                saveCurrentStudent();
                pendingName = line;
            } else if (looksLikeCapsNameWithGrades || looksLikeNewStudent || looksLikeNotes) {
                // Ignore, let next loop iterations handle it
            } else {
                currentStudent.appreciation.push(line);
            }
        }
    }

    saveCurrentStudent();
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
        name: 'mbn-bilan',
        description: 'Bilan appréciations MBN (ENT)',
        detect: detectMbnBilan,
        convert: convertMbnBilan
    },
    {
        name: 'pronote-bilan',
        description: 'Bilan appréciations Pronote',
        detect: detectPronoteReport,
        convert: convertPronoteReport
    }
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
