/**
 * @fileoverview Sample data for demonstration and testing purposes
 * @module data/SampleData
 * 
 * Single source of truth for all sample/demo data in the application.
 * Simplified to single-period format for clarity and consistency.
 */

/**
 * Sample student data for import demonstrations
 * Format: NOM Prénom | STATUT | MOYENNE | APPRECIATION | CONTEXTE
 * 
 * This is a single-period template matching the current wizard behavior.
 */
const SAMPLE_STUDENTS = [
    { nom: "MARTIN Lucas", statut: "", moy: "12.5", app: "Élève sérieux et appliqué.", ctx: "Participation active, élève moteur de la classe." },
    { nom: "DURAND Sophie", statut: "PPRE", moy: "9", app: "Difficultés persistantes mais efforts visibles.", ctx: "Accompagnement suivi, encourager les petits progrès." },
    { nom: "BERNARD Thomas", statut: "", moy: "15", app: "Très bon travail, résultats excellents.", ctx: "Maintien des efforts, félicitations." },
    { nom: "PETIT Emma", statut: "", moy: "12", app: "Convenable, peut mieux faire avec plus de régularité.", ctx: "Travail régulier et soigné." },
    { nom: "ROBERT Antoine", statut: "", moy: "10", app: "Doit travailler davantage pour progresser.", ctx: "Manque de travail, ressaisissez-vous." },
    { nom: "MOREAU Julie", statut: "", moy: "17", app: "Excellent travail, félicitations.", ctx: "Toujours au top, bravo !" },
    { nom: "LEFEVRE Hugo", statut: "Délégué", moy: "11", app: "Moyen mais bon potentiel à exploiter.", ctx: "Bon potentiel à exploiter pleinement." },
    { nom: "SIMON Clara", statut: "ULIS", moy: "14", app: "Bien intégrée, travail de qualité.", ctx: "Élève en progression constante, félicitations." }
];

/**
 * Gets the sample data string for import wizard
 * @returns {string} The sample data with pipe separator
 */
export function getSampleImportData() {
    // Format: NOM Prénom | STATUT | MOYENNE | APPRECIATION | CONTEXTE
    return SAMPLE_STUDENTS.map(s =>
        `${s.nom} | ${s.statut} | ${s.moy} | ${s.app} | ${s.ctx}`
    ).join('\n');
}
