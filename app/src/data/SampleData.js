/**
 * @fileoverview Sample data for demonstration and testing purposes
 * @module data/SampleData
 * 
 * Single source of truth for all sample/demo data in the application
 * (Import Wizard, Onboarding Demo Class, Trombinoscope fallback, and Settings AI Lab).
 */

/**
 * Canonical list of 8 sample students sorted alphabetically by last name
 * to match `sample-trombinoscope.png` and `./images/Demo/*.jpg`.
 * Covers all evolution profiles (++ strong rise, + rise, = stable, - drop, -- strong drop)
 * and pedagogical statuses (PPRE, Délégué, PAP, ULIS).
 */
export const SAMPLE_STUDENTS = [
    {
        id: 'bernard',
        nom: 'BERNARD',
        prenom: 'Thomas',
        statut: '',
        photo: 'bernard.jpg',
        periods: {
            P1: {
                moy: '15',
                app: 'Très bon travail, résultats excellents.',
                ctx: 'Maintien des efforts, félicitations.'
            },
            P2: {
                moy: '15.2',
                app: 'Une grande régularité dans les résultats, poursuivez ainsi.',
                ctx: 'Toujours aussi investi et pertinent à l\'oral.'
            },
            P3: {
                moy: '16',
                app: 'Excellente année scolaire, travail exemplaire de bout en bout.',
                ctx: 'Bilan très positif, félicitations pour cette année.'
            }
        }
    },
    {
        id: 'durand',
        nom: 'DURAND',
        prenom: 'Sophie',
        statut: 'PPRE',
        photo: 'durand.jpg',
        periods: {
            P1: {
                moy: '9',
                app: 'Difficultés persistantes mais efforts visibles.',
                ctx: 'Accompagnement suivi, encourager les petits progrès.'
            },
            P2: {
                moy: '10.5',
                app: 'Des progrès encourageants grâce à un travail plus régulier.',
                ctx: 'Les efforts portent leurs fruits, gagne en confiance.'
            },
            P3: {
                moy: '11.5',
                app: 'Belle progression tout au long de l\'année, bravo pour la persévérance.',
                ctx: 'Objectifs du PPRE atteints, attitude très positive.'
            }
        }
    },
    {
        id: 'lefevre',
        nom: 'LEFEVRE',
        prenom: 'Hugo',
        statut: '',
        photo: 'lefevre.jpg',
        periods: {
            P1: {
                moy: '11',
                app: 'Moyen mais bon potentiel à exploiter.',
                ctx: 'Bon potentiel à exploiter pleinement.'
            },
            P2: {
                moy: '12.5',
                app: 'En nette progression, l\'investissement est plus soutenu.',
                ctx: 'Meilleure implication en classe, continuer sur cette lancée.'
            },
            P3: {
                moy: '13.5',
                app: 'Un troisième trimestre très satisfaisant qui confirme les progrès.',
                ctx: 'Belle évolution, travail sérieux en fin d\'année.'
            }
        }
    },
    {
        id: 'martin',
        nom: 'MARTIN',
        prenom: 'Lucas',
        statut: '',
        photo: 'martin.jpg',
        periods: {
            P1: {
                moy: '12.5',
                app: 'Élève sérieux et appliqué.',
                ctx: 'Participation active, élève moteur de la classe.'
            },
            P2: {
                moy: '14',
                app: 'Belle évolution des résultats, participation toujours dynamique.',
                ctx: 'Rôle moteur à l\'oral, travail approfondi.'
            },
            P3: {
                moy: '14.5',
                app: 'Ensemble très solide et attitude irréprochable toute l\'année.',
                ctx: 'Élève curieux et impliqué jusqu\'au bout.'
            }
        }
    },
    {
        id: 'moreau',
        nom: 'MOREAU',
        prenom: 'Julie',
        statut: 'Délégué',
        photo: 'moreau.jpg',
        periods: {
            P1: {
                moy: '17',
                app: 'Excellent travail, félicitations.',
                ctx: 'Toujours au top, bravo !'
            },
            P2: {
                moy: '18',
                app: 'Des résultats remarquables et un investissement sans faille.',
                ctx: 'Rôle moteur et attitude exemplaire en tant que déléguée.'
            },
            P3: {
                moy: '18.5',
                app: 'Année brillante à tous points de vue, toutes mes félicitations.',
                ctx: 'Excellente maîtrise des attendus, bravo !'
            }
        }
    },
    {
        id: 'petit',
        nom: 'PETIT',
        prenom: 'Emma',
        statut: '',
        photo: 'petit.jpg',
        periods: {
            P1: {
                moy: '12',
                app: 'Convenable, peut mieux faire avec plus de régularité.',
                ctx: 'Travail régulier et soigné.'
            },
            P2: {
                moy: '10',
                app: 'Ensemble en baisse, le travail personnel est devenu trop irrégulier.',
                ctx: 'Relâchement notable sur la période, il faut se remobiliser.'
            },
            P3: {
                moy: '11.5',
                app: 'Un bon rebond au dernier trimestre grâce à des efforts retrouvés.',
                ctx: 'A su tenir compte des conseils pour redresser la barre.'
            }
        }
    },
    {
        id: 'robert',
        nom: 'ROBERT',
        prenom: 'Antoine',
        statut: 'PAP',
        photo: 'robert.jpg',
        periods: {
            P1: {
                moy: '10',
                app: 'Doit travailler davantage pour progresser.',
                ctx: 'Manque de travail, ressaisissez-vous.'
            },
            P2: {
                moy: '8.5',
                app: 'Résultats en recul, l\'attention en classe est trop fluctuante.',
                ctx: 'Trop de bavardages et travail personnel insuffisant.'
            },
            P3: {
                moy: '9.5',
                app: 'Quelques efforts en fin d\'année mais l\'ensemble demeure fragile.',
                ctx: 'Du mieux dans l\'attitude, consolider les bases.'
            }
        }
    },
    {
        id: 'simon',
        nom: 'SIMON',
        prenom: 'Clara',
        statut: 'ULIS',
        photo: 'simon.jpg',
        periods: {
            P1: {
                moy: '14',
                app: 'Bien intégrée, travail de qualité.',
                ctx: 'Élève en progression constante, félicitations.'
            },
            P2: {
                moy: '16',
                app: 'Progression spectaculaire sur la période, le travail est très soigné.',
                ctx: 'Beaucoup de sérieux et d\'autonomie, félicitations !'
            },
            P3: {
                moy: '16.5',
                app: 'Un parcours exemplaire et des résultats de grande qualité.',
                ctx: 'Investissement remarquable toute l\'année, bravo.'
            }
        }
    }
];

/**
 * Gets the sample data string for the import wizard, cumulative up to the active period:
 * - S1 / T1 (5 cols): NOM Prénom | STATUT | MOY_P1 | APP_P1 | CTX_P1
 * - S2 / T2 (7 cols): NOM Prénom | STATUT | MOY_P1 | APP_P1 | MOY_P2 | APP_P2 | CTX_P2
 * - T3      (9 cols): NOM Prénom | STATUT | MOY_T1 | APP_T1 | MOY_T2 | APP_T2 | MOY_T3 | APP_T3 | CTX_T3
 *
 * @param {string} [period='T1'] - Active period code ('S1', 'S2', 'T1', 'T2', 'T3')
 * @returns {string} The sample data with pipe separator
 */
export function getSampleImportData(period = 'T1') {
    const normalizedPeriod = String(period || 'T1').toUpperCase();

    return SAMPLE_STUDENTS.map(s => {
        const fullName = `${s.nom} ${s.prenom}`;
        const { P1, P2, P3 } = s.periods;

        if (normalizedPeriod === 'T3') {
            return `${fullName} | ${s.statut} | ${P1.moy} | ${P1.app} | ${P2.moy} | ${P2.app} | ${P3.moy} | ${P3.app} | ${P3.ctx}`;
        }
        if (normalizedPeriod === 'S2' || normalizedPeriod === 'T2') {
            return `${fullName} | ${s.statut} | ${P1.moy} | ${P1.app} | ${P2.moy} | ${P2.app} | ${P2.ctx}`;
        }
        return `${fullName} | ${s.statut} | ${P1.moy} | ${P1.app} | ${P1.ctx}`;
    }).join('\n');
}

/**
 * Builds a complete demo class dataset ready for direct injection during onboarding.
 * Creates student result objects with P1 data filled (grades, statuses, context),
 * no appreciations (left pending for AI generation).
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
        const grade = parseFloat(s.periods.P1.moy);
        const statuses = s.statut ? [s.statut] : [];

        const periods = {};
        for (const p of allPeriods) {
            periods[p] = p === currentPeriod
                ? { grade, appreciation: '', context: s.periods.P1.ctx }
                : { grade: null, appreciation: '' };
        }

        return {
            nom: s.nom,
            prenom: s.prenom,
            statuses,
            periods,
            currentPeriod,
            subject: 'Générique',
            photoFile: s.photo
        };
    });

    return {
        className: 'Classe exemple',
        students
    };
}

/**
 * Returns the 8 fallback sample students for `sample-trombinoscope.png` in an empty class.
 * Guaranteed to match the alphabetical visual layout of `sample-trombinoscope.png`.
 *
 * @returns {Array<{id: string, nom: string, prenom: string}>}
 */
export function getSampleTrombiStudents() {
    return SAMPLE_STUDENTS.map(s => ({
        id: `sample-${s.id}`,
        nom: s.nom,
        prenom: s.prenom
    }));
}

/**
 * Demo profiles for the Settings AI Preview Laboratory (`PreviewManager` & `SettingsModalListeners`).
 * Synchronized with `SAMPLE_STUDENTS` and `./images/Demo/*.jpg`.
 */
export const DEMO_STUDENT_PROFILES = SAMPLE_STUDENTS.map(s => {
    const p1Grade = parseFloat(s.periods.P1.moy);
    const p2Grade = parseFloat(s.periods.P2.moy);
    const p3Grade = parseFloat(s.periods.P3.moy);
    const statuses = s.statut ? [s.statut] : [];

    return {
        id: `demo-${s.id}`,
        nom: s.nom,
        prenom: s.prenom,
        photo: `./images/Demo/${s.photo}`,
        appreciation: '',
        studentData: {
            nom: s.nom,
            prenom: s.prenom,
            periods: {
                'T1': { grade: p1Grade, appreciation: s.periods.P1.app, context: s.periods.P1.ctx },
                'T2': { grade: p2Grade, appreciation: s.periods.P2.app, context: s.periods.P2.ctx },
                'T3': { grade: p3Grade, appreciation: '', context: s.periods.P3.ctx },
                'S1': { grade: p1Grade, appreciation: s.periods.P1.app, context: s.periods.P1.ctx },
                'S2': { grade: p2Grade, appreciation: '', context: s.periods.P2.ctx }
            },
            statuses,
            currentPeriod: 'T2',
            subject: 'Générique'
        },
        isDemo: true
    };
});
