/**
 * @fileoverview Sample data for demonstration and testing purposes
 * @module data/SampleData
 * 
 * Single source of truth for all sample/demo data in the application.
 * Uses pipe (|) separator for better readability in demos.
 */

/**
 * Sample student data for import demonstrations
 * Format: NOM Prénom | STATUT | MOY T1 | APP T1 | MOY T2 | APP T2 | MOY T3 | CONTEXTE
 * 
 * Note: Always include the STATUT column (empty string for students without status)
 * to maintain consistent column count for proper auto-mapping.
 */
export const SAMPLE_IMPORT_DATA = `MARTIN Lucas |  | 12.5 | Élève sérieux et appliqué. | 14 | Continuez ainsi, très bonne progression. | 14.5 | Participation active, élève moteur de la classe.
DURAND Sophie | PPRE | 9 | Difficultés persistantes. | 10 | Légers progrès, à encourager. | 11 | Efforts notables, continuez sur cette lancée.
BERNARD Thomas |  | 15 | Très bon trimestre. | 15.5 | Excellente attitude en classe. | 16 | Maintien des efforts, félicitations.
PETIT Emma |  | 12 | Convenable, peut mieux faire. | 13 | En hausse, bravo ! | 13.5 | Travail régulier et soigné.
ROBERT Antoine |  | 10 | Doit s'investir davantage. | 9.5 | Baisse d'attention inquiétante. | 9 | Manque d'investissement, ressaisissez-vous.
MOREAU Julie |  | 17 | Excellent travail. | 17.5 | Parfait, rien à redire. | 17.5 | Toujours au top, bravo !
LEFEVRE Hugo | Délégué | 11 | Moyen mais potentiel présent. | 11.5 | Du mieux, continuez. | 12 | Bon potentiel à exploiter pleinement.
SIMON Clara | ULIS | 14 | Bien intégrée, bon travail. | 14.5 | Très bonne progression. | 15 | Élève en progression constante, félicitations.`;

/**
 * Gets the sample data string
 * @returns {string} The sample data with pipe separator
 */
export function getSampleImportData() {
    return SAMPLE_IMPORT_DATA;
}
