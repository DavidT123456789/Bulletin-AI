/**
 * @fileoverview Sample data for demonstration and testing purposes
 * @module data/SampleData
 * 
 * Single source of truth for all sample/demo data in the application.
 */

/**
 * Sample student data for import demonstrations
 * Format: NOM Prénom | STATUT | MOYENNE | APPRECIATION | CONTEXTE
 */
const SAMPLE_STUDENTS = [
    { nom: "MARTIN Lucas", statut: "", moy: "12.5", app: "Élève sérieux et appliqué.", ctx: "Participation active, élève moteur de la classe.", photo: "martin.jpg" },
    { nom: "DURAND Sophie", statut: "PPRE", moy: "9", app: "Difficultés persistantes mais efforts visibles.", ctx: "Accompagnement suivi, encourager les petits progrès.", photo: "durand.jpg" },
    { nom: "BERNARD Thomas", statut: "", moy: "15", app: "Très bon travail, résultats excellents.", ctx: "Maintien des efforts, félicitations.", photo: "bernard.jpg" },
    { nom: "PETIT Emma", statut: "", moy: "12", app: "Convenable, peut mieux faire avec plus de régularité.", ctx: "Travail régulier et soigné.", photo: "petit.jpg" },
    { nom: "ROBERT Antoine", statut: "PAP", moy: "10", app: "Doit travailler davantage pour progresser.", ctx: "Manque de travail, ressaisissez-vous.", photo: "robert.jpg" },
    { nom: "MOREAU Julie", statut: "Délégué", moy: "17", app: "Excellent travail, félicitations.", ctx: "Toujours au top, bravo !", photo: "moreau.jpg" },
    { nom: "LEFEVRE Hugo", statut: "", moy: "11", app: "Moyen mais bon potentiel à exploiter.", ctx: "Bon potentiel à exploiter pleinement.", photo: "lefevre.jpg" },
    { nom: "SIMON Clara", statut: "ULIS", moy: "14", app: "Bien intégrée, travail de qualité.", ctx: "Élève en progression constante, félicitations.", photo: "simon.jpg" }
];

/**
 * Gets the sample data string for import wizard
 * @returns {string} The sample data with pipe separator
 */
export function getSampleImportData() {
    return SAMPLE_STUDENTS.map(s =>
        `${s.nom} | ${s.statut} | ${s.moy} | ${s.app} | ${s.ctx}`
    ).join('\n');
}

/**
 * Builds a complete demo class dataset ready for direct injection.
 * Creates student result objects with P1 data filled (grades, statuses),
 * no appreciations (left for AI generation).
 * 
 * @param {string} periodSystem - 'trimestres' or 'semestres'
 * @returns {{ className: string, students: Array<Object> }}
 */
export function getDemoClassData(periodSystem = 'trimestres') {
    const currentPeriod = periodSystem === 'semestres' ? 'S1' : 'T1';
    const allPeriods = periodSystem === 'semestres'
        ? ['S1', 'S2']
        : ['T1', 'T2', 'T3'];

    const students = SAMPLE_STUDENTS.map(s => {
        const [nom, prenom] = _splitName(s.nom);
        const grade = parseFloat(s.moy);
        const statuses = s.statut ? [s.statut] : [];

        const periods = {};
        for (const p of allPeriods) {
            periods[p] = p === currentPeriod
                ? { grade, appreciation: '', context: s.ctx }
                : { grade: null, appreciation: '' };
        }

        return {
            nom,
            prenom,
            statuses,
            periods,
            currentPeriod,
            subject: 'Générique',
            photoFile: s.photo
        };
    });

    return {
        className: 'Classe Exemple',
        students
    };
}

/**
 * Splits "NOM Prénom" into [nom, prenom]
 * @private
 */
function _splitName(fullName) {
    const parts = fullName.split(' ');
    return [parts[0], parts.slice(1).join(' ')];
}
