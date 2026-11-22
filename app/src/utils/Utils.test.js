import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Utils } from './Utils.js';
import { appState, userSettings } from '../state/State.js';
import {
    EPICENE_FIRST_NAMES,
    FEMININ_FIRST_NAMES,
    MASCULIN_FIRST_NAMES,
    FEMININ_ENDINGS,
    MASCULIN_ENDINGS
} from '../config/frenchFirstNames.js';

// Mock appState & userSettings
vi.mock('../state/State.js', () => ({
    appState: {
        periodSystem: 'trimestres',  // Use French key 'trimestres'
        currentPeriod: 'T2',
        currentClassId: null,
        classes: [],
        generatedResults: [],
        evolutionThresholds: {
            positive: 0.5,
            negative: -0.5,
            veryPositive: 1.5,
            veryNegative: -1.5
        },
        subjects: {}
    },
    userSettings: {
        academic: {
            classes: [],
            currentClassId: null
        }
    }
}));

describe('Utils', () => {
    describe('validateGrade', () => {
        const createInput = (val) => ({
            value: val,
            id: 'test',
            classList: { toggle: vi.fn(), remove: vi.fn() }
        });

        it('devrait accepter les notes valides (0-20)', () => {
            expect(Utils.validateGrade(createInput('10'))).toBe(true);
            expect(Utils.validateGrade(createInput('0'))).toBe(true);
            expect(Utils.validateGrade(createInput('20'))).toBe(true);
            expect(Utils.validateGrade(createInput('15.5'))).toBe(true);
            expect(Utils.validateGrade(createInput('12,75'))).toBe(true);
        });

        it('devrait refuser les notes invalides', () => {
            expect(Utils.validateGrade(createInput('-1'))).toBe(false);
            expect(Utils.validateGrade(createInput('21'))).toBe(false);
            expect(Utils.validateGrade(createInput('abc'))).toBe(false);
        });

        it('devrait accepter les champs vides', () => {
            expect(Utils.validateGrade(createInput(''))).toBe(true);
        });
    });

    describe('countWords', () => {
        it('devrait compter correctement les mots', () => {
            expect(Utils.countWords('')).toBe(0);
            expect(Utils.countWords('Un')).toBe(1);
            expect(Utils.countWords('Un deux trois')).toBe(3);
            expect(Utils.countWords('  Espaces   multiples  ')).toBe(2);
        });

        it('devrait gérer les cas spéciaux', () => {
            expect(Utils.countWords(null)).toBe(0);
            expect(Utils.countWords(undefined)).toBe(0);
        });
    });

    describe('isNumeric', () => {
        it('devrait valider les nombres entre 0 et 20', () => {
            expect(Utils.isNumeric('10')).toBe(true);
            expect(Utils.isNumeric('0')).toBe(true);
            expect(Utils.isNumeric('20')).toBe(true);
            expect(Utils.isNumeric('15.5')).toBe(true);
        });

        it('devrait refuser les valeurs hors limites', () => {
            expect(Utils.isNumeric('-1')).toBe(false);
            expect(Utils.isNumeric('21')).toBe(false);
            expect(Utils.isNumeric('abc')).toBe(false);
            expect(Utils.isNumeric('')).toBe(false);
        });
    });

    describe('debounce', () => {
        it('devrait retarder l\'exécution', async () => {
            vi.useFakeTimers();
            const fn = vi.fn();
            const debounced = Utils.debounce(fn, 100);

            debounced();
            debounced();
            debounced();

            expect(fn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(1);

            vi.useRealTimers();
        });
    });

    describe('parseNomPrenom', () => {
        it('devrait parser NOM Prénom (uppercase nom conservé)', () => {
            const result = Utils.parseNomPrenom('MARTIN Lucas');
            expect(result.nom).toBe('MARTIN');  // Keeps uppercase
            expect(result.prenom).toBe('Lucas');
        });

        it('devrait parser Prénom Nom (capitalized)', () => {
            const result = Utils.parseNomPrenom('Lucas Martin');
            expect(result.nom).toBe('Martin');  // Last word is nom
            expect(result.prenom).toBe('Lucas');
        });

        it('devrait gérer les noms composés', () => {
            const result = Utils.parseNomPrenom('DUPONT-MORETTI Jean-Pierre');
            expect(result.nom).toBe('DUPONT-MORETTI');  // Keeps uppercase
            expect(result.prenom).toBe('Jean-Pierre');
        });

        it('devrait gérer un seul mot', () => {
            const result = Utils.parseNomPrenom('Martin');
            expect(result.nom).toBe('Martin');
            expect(result.prenom).toBe('');
        });

        it('devrait ignorer les annotations de classe entre parenthèses', () => {
            const result1 = Utils.parseNomPrenom('BOUKHARI Sami (3 1)');
            expect(result1.nom).toBe('BOUKHARI');
            expect(result1.prenom).toBe('Sami');

            const result2 = Utils.parseNomPrenom('ERDOGAN PAUTRAS Helin (3 4)');
            expect(result2.nom).toBe('ERDOGAN PAUTRAS');
            expect(result2.prenom).toBe('Helin');
        });
    });

    describe('normalizeName', () => {
        it('devrait normaliser pour comparaison', () => {
            expect(Utils.normalizeName('MARTIN', 'Lucas')).toBe('martin-lucas');
            expect(Utils.normalizeName('Martin', 'LUCAS')).toBe('martin-lucas');
        });

        it('devrait ignorer les annotations de classe entre parenthèses', () => {
            expect(Utils.normalizeName('BOUKHARI (3 1)', 'Sami')).toBe('boukhari-sami');
            expect(Utils.normalizeName('BOUKHARI', 'Sami')).toBe('boukhari-sami');
        });
    });

    describe('normalizeClassName', () => {
        it('devrait normaliser et faire correspondre "5°1", "5 1", "5ème 1", "5-1"', () => {
            const expected = '51';
            expect(Utils.normalizeClassName('5°1')).toBe(expected);
            expect(Utils.normalizeClassName('5 1')).toBe(expected);
            expect(Utils.normalizeClassName('5ème 1')).toBe(expected);
            expect(Utils.normalizeClassName('5eme 1')).toBe(expected);
            expect(Utils.normalizeClassName('5-1')).toBe(expected);
        });

        it('devrait normaliser d\'autres formats (ex: 6°A, 6 A, 3ème Picasso)', () => {
            expect(Utils.normalizeClassName('6°A')).toBe('6a');
            expect(Utils.normalizeClassName('6 A')).toBe('6a');
            expect(Utils.normalizeClassName('3ème Picasso')).toBe('3picasso');
            expect(Utils.normalizeClassName('CM2-A')).toBe('cm2a');
        });

        it('devrait gérer les valeurs vides ou nulles', () => {
            expect(Utils.normalizeClassName('')).toBe('');
            expect(Utils.normalizeClassName(null)).toBe('');
        });

        it('devrait normaliser les classes avec exposants Unicode (3ᵉ1 -> 31)', () => {
            expect(Utils.normalizeClassName('3ᵉ1')).toBe('31');
            expect(Utils.normalizeClassName('6ᵉA')).toBe('6a');
            expect(Utils.normalizeClassName('2ⁿᵈ3')).toBe('23');
            expect(Utils.normalizeClassName('1ʳᵉ2')).toBe('12');
        });
    });

    describe('formatClassDisplayName', () => {
        it('devrait formater les classes de collège avec exposant conventionnel ᵉ', () => {
            expect(Utils.formatClassDisplayName('3 1')).toBe('3ᵉ1');
            expect(Utils.formatClassDisplayName('3-1')).toBe('3ᵉ1');
            expect(Utils.formatClassDisplayName('3°1')).toBe('3ᵉ1');
            expect(Utils.formatClassDisplayName('3e1')).toBe('3ᵉ1');
            expect(Utils.formatClassDisplayName('3ème 1')).toBe('3ᵉ1');
            expect(Utils.formatClassDisplayName('3eme 1')).toBe('3ᵉ1');
            expect(Utils.formatClassDisplayName('6 A')).toBe('6ᵉA');
            expect(Utils.formatClassDisplayName('5°2')).toBe('5ᵉ2');
            expect(Utils.formatClassDisplayName('4 B')).toBe('4ᵉB');
            expect(Utils.formatClassDisplayName('3 Picasso')).toBe('3ᵉ Picasso');
            expect(Utils.formatClassDisplayName('3')).toBe('3ᵉ');
        });

        it('devrait formater les classes de lycée (2nde, 1ere, Term)', () => {
            expect(Utils.formatClassDisplayName('2nde 3')).toBe('2ⁿᵈ3');
            expect(Utils.formatClassDisplayName('1ere 2')).toBe('1ʳᵉ2');
            expect(Utils.formatClassDisplayName('1ère 1')).toBe('1ʳᵉ1');
            expect(Utils.formatClassDisplayName('Term 4')).toBe('Tle4');
        });

        it('devrait formater les groupes de collège et lycée selon la convention (ex: 3ᵉG1, 2ⁿᵈG1)', () => {
            expect(Utils.formatClassDisplayName('3 TECHNOLOGIE G1')).toBe('3ᵉG1');
            expect(Utils.formatClassDisplayName('3 G1')).toBe('3ᵉG1');
            expect(Utils.formatClassDisplayName('3 G 1')).toBe('3ᵉG1');
            expect(Utils.formatClassDisplayName('4 SCIENCES G2')).toBe('4ᵉG2');
            expect(Utils.formatClassDisplayName('2nde G1')).toBe('2ⁿᵈG1');
            expect(Utils.formatClassDisplayName('1ere G2')).toBe('1ʳᵉG2');
            expect(Utils.formatClassDisplayName('Term G1')).toBe('TleG1');
        });

        it('devrait préserver les autres dénominations ou valeurs vides', () => {
            expect(Utils.formatClassDisplayName('CM2 B')).toBe('CM2 B');
            expect(Utils.formatClassDisplayName('Groupe Techno')).toBe('Groupe Techno');
            expect(Utils.formatClassDisplayName('')).toBe('');
            expect(Utils.formatClassDisplayName(null)).toBe('');
        });
    });

    describe('isGroupClassName', () => {
        it('devrait identifier correctement les dénominations de groupes', () => {
            expect(Utils.isGroupClassName('3 TECHNOLOGIE G1')).toBe(true);
            expect(Utils.isGroupClassName('3 G1')).toBe(true);
            expect(Utils.isGroupClassName('3ᵉG1')).toBe(true);
            expect(Utils.isGroupClassName('3 G 1')).toBe(true);
            expect(Utils.isGroupClassName('4 SCIENCES G2')).toBe(true);
            expect(Utils.isGroupClassName('3 Groupe 1')).toBe(true);
            expect(Utils.isGroupClassName('2nde G1')).toBe(true);
            expect(Utils.isGroupClassName('1ere G2')).toBe(true);
            expect(Utils.isGroupClassName('Term G1')).toBe(true);
            expect(Utils.isGroupClassName('Groupe Techno')).toBe(true);
        });

        it('devrait identifier comme non-groupe les classes complètes ordinaires', () => {
            expect(Utils.isGroupClassName('5 1')).toBe(false);
            expect(Utils.isGroupClassName('5ᵉ1')).toBe(false);
            expect(Utils.isGroupClassName('3 4')).toBe(false);
            expect(Utils.isGroupClassName('6 A')).toBe(false);
            expect(Utils.isGroupClassName('CM2 B')).toBe(false);
            expect(Utils.isGroupClassName('')).toBe(false);
            expect(Utils.isGroupClassName(null)).toBe(false);
        });
    });

    describe('formatStudentName', () => {
        it('devrait formater le nom et prénom en texte brut', () => {
            expect(Utils.formatStudentName('BOUKHARI', 'Sami')).toBe('BOUKHARI Sami');
            expect(Utils.formatStudentName('martin', 'lucas')).toBe('MARTIN lucas');
        });

        it('devrait formater en HTML sans badge si aucune classe d\'origine fournie', () => {
            const html = Utils.formatStudentName('BOUKHARI', 'Sami', true);
            expect(html).toBe('<span class="student-nom">BOUKHARI</span> <span class="student-prenom">Sami</span>');
        });

        it('devrait inclure le badge de classe d\'origine en HTML formaté de façon conventionnelle (3ᵉ1)', () => {
            const html = Utils.formatStudentName('BOUKHARI', 'Sami', true, '', '3 1');
            expect(html).toContain('<span class="student-origin-class-tag" title="Classe d\'origine : 3ᵉ1">3ᵉ1</span>');
        });
    });

    describe('formatStudentName (provenance classe + groupe)', () => {
        it('devrait afficher une pilule unifiée classe + groupe (3ᵉ1 · G1) quand les deux provenances diffèrent', () => {
            const html = Utils.formatStudentName('EL ORABI', 'Elyas', true, '', {
                originClass: '3°1',
                originGroup: '3ᵉG1'
            });
            expect(html).toContain('<span class="student-origin-class-tag" title="Classe 3ᵉ1 • Groupe 3ᵉG1">3ᵉ1 · G1</span>');

            const customGroupHtml = Utils.formatStudentName('EL ORABI', 'Elyas', true, '', {
                originClass: '3°1',
                originGroup: 'Atelier Maths'
            });
            expect(customGroupHtml).toContain('<span class="student-origin-class-tag" title="Classe 3ᵉ1 • Groupe Atelier Maths">3ᵉ1 · Atelier Maths</span>');
        });
    });

    describe('formatStudentFirstLastName', () => {
        it('devrait formater le prénom suivi du NOM en majuscule', () => {
            expect(Utils.formatStudentFirstLastName('VERVY', 'Paul')).toBe('Paul VERVY');
            expect(Utils.formatStudentFirstLastName('vervy', 'paul')).toBe('paul VERVY');
            expect(Utils.formatStudentFirstLastName('MARTIN', 'Lucas')).toBe('Lucas MARTIN');
        });

        it('devrait gérer les valeurs nulles ou manquantes gracieusement', () => {
            expect(Utils.formatStudentFirstLastName('VERVY', null)).toBe('VERVY');
            expect(Utils.formatStudentFirstLastName(null, 'Paul')).toBe('Paul');
            expect(Utils.formatStudentFirstLastName('', '')).toBe('');
        });
    });

    describe('formatStudentInitialLabel', () => {
        it('devrait formater en texte brut (Prénom I.)', () => {
            expect(Utils.formatStudentInitialLabel('Vervy', 'Paul')).toBe('Paul V.');
            expect(Utils.formatStudentInitialLabel('martin', 'Lucas')).toBe('Lucas M.');
        });

        it('devrait formater en HTML avec le span pour l’initiale', () => {
            expect(Utils.formatStudentInitialLabel('Vervy', 'Paul', true)).toBe('Paul <span class="sc-cell-initial">V.</span>');
        });

        it('devrait gérer l’absence de nom ou de prénom', () => {
            expect(Utils.formatStudentInitialLabel('', 'Paul')).toBe('Paul');
            expect(Utils.formatStudentInitialLabel('Vervy', '')).toBe('V.');
            expect(Utils.formatStudentInitialLabel('Vervy', '', true)).toBe('<span class="sc-cell-initial">V.</span>');
            expect(Utils.formatStudentInitialLabel('', '')).toBe('');
        });

        it('devrait omettre l’initiale du nom pour un prénom long (≥ 11 caractères) sauf si forceInitial est actif', () => {
            expect(Utils.formatStudentInitialLabel('Dupont', 'Justin Nolan')).toBe('Justin Nolan');
            expect(Utils.formatStudentInitialLabel('Dupont', 'Justin Nolan', true)).toBe('Justin Nolan');
            expect(Utils.formatStudentInitialLabel('Dupont', 'Justin Nolan', false, { forceInitial: true })).toBe('Justin Nolan D.');
            expect(Utils.formatStudentInitialLabel('Dupont', 'Justin Nolan', true, { forceInitial: true })).toBe('Justin Nolan <span class="sc-cell-initial">D.</span>');
            expect(Utils.formatStudentInitialLabel('Vervy', 'Paul', true, { showInitial: false })).toBe('Paul');
            expect(Utils.formatStudentInitialLabel('Vervy', '', true, { showInitial: false })).toBe('<span class="sc-cell-initial">V.</span>');
        });
    });

    describe('getOriginClass', () => {
        it('devrait retourner la classe d\'origine si différente de la classe courante', () => {
            const student = { nom: 'BOUKHARI', prenom: 'Sami', studentData: { classe: '3 1' } };
            expect(Utils.getOriginClass(student, 'Groupe Techno')).toBe('3 1');
        });

        it('devrait retourner vide si la classe d\'origine correspond à la classe courante', () => {
            const student = { nom: 'MARTIN', prenom: 'Lucas', studentData: { classe: '3°1' } };
            expect(Utils.getOriginClass(student, '3 1')).toBe('');
        });

        it('devrait fallback sur result.classe ou result.originClass', () => {
            expect(Utils.getOriginClass({ classe: '3 4' }, 'Groupe')).toBe('3 4');
            expect(Utils.getOriginClass({ originClass: '3 2' }, 'Groupe')).toBe('3 2');
        });

        it('devrait retourner vide si aucun élève ou aucune classe', () => {
            expect(Utils.getOriginClass(null, 'Groupe')).toBe('');
            expect(Utils.getOriginClass({}, 'Groupe')).toBe('');
        });

        it('devrait retourner le groupe source quand on consulte une classe reconstituée (même classe d\'origine)', () => {
            userSettings.academic.classes = [
                { id: 'grp-1', name: '3 TECHNOLOGIE G1' },
                { id: 'grp-2', name: '3 TECHNOLOGIE G2' }
            ];
            const studentG1 = { id: 's1', nom: 'MARTIN', prenom: 'Charly', classId: 'grp-1', studentData: { classe: '3 1' } };
            const studentG2 = { id: 's2', nom: 'DUPONT', prenom: 'Noah', classId: 'grp-2', studentData: { classe: '3 1' } };

            expect(Utils.getOriginClass(studentG1, '3ᵉ1')).toBe('3 TECHNOLOGIE G1');
            expect(Utils.getOriginClass(studentG2, '3 1')).toBe('3 TECHNOLOGIE G2');
            expect(Utils.formatShortGroupLabel(Utils.getOriginClass(studentG1, '3ᵉ1'))).toBe('G1');
            expect(Utils.formatShortGroupLabel(Utils.getOriginClass(studentG2, '3ᵉ1'))).toBe('G2');

            // Recherche par groupe dans une classe reconstituée
            expect(Utils.matchesStudent(studentG1, 'G1', { currentClassName: '3ᵉ1' })).toBe(true);
            expect(Utils.matchesStudent(studentG1, '3ᵉG1', { currentClassName: '3ᵉ1' })).toBe(true);
            expect(Utils.matchesStudent(studentG1, 'G2', { currentClassName: '3ᵉ1' })).toBe(false);

            userSettings.academic.classes = [];
        });

        it('devrait résoudre correctement le nom de la classe active (physique ou reconstituée)', () => {
            userSettings.academic.classes = [{ id: 'grp-1', name: '3 TECHNOLOGIE G1' }];
            appState.generatedResults = [{ id: 's1', studentData: { classe: '3 1' } }];

            expect(Utils.getCurrentClassName('grp-1')).toBe('3 TECHNOLOGIE G1');
            expect(Utils.getCurrentClassName('virtual_31')).toBe('3ᵉ1');

            userSettings.academic.classes = [];
            appState.generatedResults = [];
        });
    });

    describe('getOriginGroup & provenance dans un groupe personnalisé (PAPD)', () => {
        it('devrait résoudre dynamiquement le groupe d\'enseignement dans un groupe personnalisé (PAPD) et le supporter dans la recherche', () => {
            userSettings.academic.classes = [
                { id: 'grp-1', name: '3ᵉG1', isGroup: true },
                { id: 'grp-papd', name: 'PAPD', isGroup: true }
            ];
            const sourceG1 = {
                id: 's-g1',
                nom: 'EL ORABI',
                prenom: 'Elyas',
                classId: 'grp-1',
                originClass: '3°1',
                studentData: { classe: '3°1' }
            };
            const papdLegacy = {
                id: 's-papd',
                nom: 'EL ORABI',
                prenom: 'Elyas',
                classId: 'grp-papd',
                originClass: '3°1',
                isCopiedProfile: true,
                studentData: { classe: '3°1' }
            };
            appState.generatedResults = [sourceG1, papdLegacy];

            expect(Utils.getStudentOriginInfo(papdLegacy, 'PAPD')).toEqual({
                originClass: '3°1',
                originGroup: '3ᵉG1'
            });
            expect(Utils.getStudentOriginInfo(sourceG1, '3ᵉG1')).toEqual({
                originClass: '3°1',
                originGroup: ''
            });
            expect(Utils.getStudentOriginInfo(sourceG1, '3ᵉ1')).toEqual({
                originClass: '3ᵉG1',
                originGroup: ''
            });

            expect(Utils.matchesStudent(papdLegacy, 'G1', { currentClassName: 'PAPD' })).toBe(true);
            expect(Utils.matchesStudent(papdLegacy, '3eG1', { currentClassName: 'PAPD' })).toBe(true);
            expect(Utils.matchesStudent(papdLegacy, '3e1', { currentClassName: 'PAPD' })).toBe(true);
            expect(Utils.matchesStudent(papdLegacy, 'G2', { currentClassName: 'PAPD' })).toBe(false);

            appState.generatedResults = [{ ...papdLegacy, sourceGroupName: '3ᵉG1' }];
            expect(Utils.getOriginGroup(appState.generatedResults[0], 'PAPD')).toBe('3ᵉG1');

            userSettings.academic.classes = [];
            appState.generatedResults = [];
        });
    });

    describe('stripAccents', () => {
        it('devrait retirer les accents et passer en minuscules', () => {
            expect(Utils.stripAccents('HÉLOÏSE')).toBe('heloise');
            expect(Utils.stripAccents('Noëlyne')).toBe('noelyne');
            expect(Utils.stripAccents('Célestin')).toBe('celestin');
            expect(Utils.stripAccents('')).toBe('');
        });
    });

    describe('matchesSearch', () => {
        it('devrait matcher sans tenir compte des accents ni de la casse', () => {
            expect(Utils.matchesSearch(['FOISELLE', 'Morgane'], 'morgane')).toBe(true);
            expect(Utils.matchesSearch(['FOISELLE', 'Morgane'], 'foiselle')).toBe(true);
            expect(Utils.matchesSearch(['MORGAND', 'Noëlyne'], 'noelyne')).toBe(true);
            expect(Utils.matchesSearch(['MORGAND', 'Noelyne'], 'noëlyne')).toBe(true);
        });

        it('devrait matcher quel que soit l\'ordre des mots recherchés', () => {
            expect(Utils.matchesSearch(['FOISELLE', 'Morgane'], 'Morgane Foiselle')).toBe(true);
            expect(Utils.matchesSearch(['FOISELLE', 'Morgane'], 'Foiselle Morgane')).toBe(true);
            expect(Utils.matchesSearch(['FOISELLE', 'Morgane'], 'Mor Foi')).toBe(true);
            expect(Utils.matchesSearch(['FOISELLE', 'Morgane'], 'Lucas')).toBe(false);
        });

        it('devrait matcher la classe d\'origine dans les champs de recherche', () => {
            const originClass = '3 1';
            const displayOriginClass = Utils.formatClassDisplayName(originClass);
            const fields = [
                'BOUKHARI',
                'Sami',
                originClass,
                displayOriginClass,
                `classe ${originClass}`,
                `classe ${displayOriginClass}`,
                Utils.normalizeClassName(originClass)
            ];
            expect(Utils.matchesSearch(fields, '3 1')).toBe(true);
            expect(Utils.matchesSearch(fields, '31')).toBe(true);
            expect(Utils.matchesSearch(fields, '3ᵉ1')).toBe(true);
            expect(Utils.matchesSearch(fields, 'classe 3 1')).toBe(true);
            expect(Utils.matchesSearch(fields, 'classe 3ᵉ1')).toBe(true);
            expect(Utils.matchesSearch(fields, 'Sami 3 1')).toBe(true);
            expect(Utils.matchesSearch(fields, '3 4')).toBe(false);
        });
    });

    describe('matchesStudent', () => {
        const student = {
            id: 'stu-1',
            nom: 'BOUKHARI',
            prenom: 'Sami',
            classe: '3 1',
            appreciation: 'Très bon trimestre, travail sérieux et régulier.'
        };

        it('devrait matcher par nom et prénom (accents, casse, ordre)', () => {
            expect(Utils.matchesStudent(student, 'sami')).toBe(true);
            expect(Utils.matchesStudent(student, 'boukhari')).toBe(true);
            expect(Utils.matchesStudent(student, 'Sami Boukhari')).toBe(true);
            expect(Utils.matchesStudent(student, 'bou sam')).toBe(true);
            expect(Utils.matchesStudent(student, 'Lucas')).toBe(false);
        });

        it('devrait matcher les accents de manière transparente', () => {
            const studentWithAccents = { nom: 'DÉPRÉ', prenom: 'Élise' };
            expect(Utils.matchesStudent(studentWithAccents, 'elise')).toBe(true);
            expect(Utils.matchesStudent(studentWithAccents, 'depre')).toBe(true);
            expect(Utils.matchesStudent(studentWithAccents, 'Elise Depre')).toBe(true);
        });

        it('devrait matcher la classe d\'origine', () => {
            expect(Utils.matchesStudent(student, '3 1')).toBe(true);
            expect(Utils.matchesStudent(student, '31')).toBe(true);
            expect(Utils.matchesStudent(student, '3ᵉ1')).toBe(true);
            expect(Utils.matchesStudent(student, 'classe 3 1')).toBe(true);
            expect(Utils.matchesStudent(student, '4 2')).toBe(false);
        });

        it('devrait respecter l\'option includeAppreciation', () => {
            // Par défaut, l'appréciation n'est pas incluse (vue plan)
            expect(Utils.matchesStudent(student, 'sérieux')).toBe(false);
            expect(Utils.matchesStudent(student, 'serieux')).toBe(false);

            // Avec includeAppreciation: true (vue tableau)
            expect(Utils.matchesStudent(student, 'sérieux', { includeAppreciation: true })).toBe(true);
            expect(Utils.matchesStudent(student, 'serieux', { includeAppreciation: true })).toBe(true);
            expect(Utils.matchesStudent(student, 'trimestre', { includeAppreciation: true })).toBe(true);
        });

        it('devrait gérer les requêtes vides et objets null de manière robuste', () => {
            expect(Utils.matchesStudent(student, '')).toBe(true);
            expect(Utils.matchesStudent(student, '   ')).toBe(true);
            expect(Utils.matchesStudent(student, null)).toBe(true);
            expect(Utils.matchesStudent(null, 'sami')).toBe(false);
        });
    });

    describe('deepClone', () => {
        it('devrait produire une copie profonde indépendante', () => {
            const source = { nom: 'Sami', periods: { T1: { grade: 12 } }, statuses: ['PAI'] };
            const copy = Utils.deepClone(source);

            copy.periods.T1.grade = 18;
            copy.statuses.push('ULIS');

            expect(copy).not.toBe(source);
            expect(source.periods.T1.grade).toBe(12);
            expect(source.statuses).toEqual(['PAI']);
        });

        it('devrait renvoyer les primitives et null tels quels', () => {
            expect(Utils.deepClone(null)).toBeNull();
            expect(Utils.deepClone(5)).toBe(5);
            expect(Utils.deepClone('a')).toBe('a');
        });

        it('devrait retomber sur la copie manuelle pour les valeurs non clonables', () => {
            const source = { nom: 'Sami', onChange: () => 'ok', nested: { value: 1 } };
            const copy = Utils.deepClone(source);

            expect(copy.nested).toEqual({ value: 1 });
            expect(copy.nested).not.toBe(source.nested);
            expect(copy.nom).toBe('Sami');
        });
    });

    describe('highlightMatch', () => {
        it('devrait surligner les correspondances en gérant les accents et la casse', () => {
            expect(Utils.highlightMatch('Morgane', 'mor')).toContain('<mark class="search-highlight">Mor</mark>gane');
            expect(Utils.highlightMatch('FOISELLE', 'foi')).toContain('<mark class="search-highlight">FOI</mark>SELLE');
            expect(Utils.highlightMatch('Noëlyne', 'noe')).toContain('<mark class="search-highlight">Noë</mark>lyne');
        });

        it('devrait retourner le texte inchangé si query vide ou < 2 caractères', () => {
            expect(Utils.highlightMatch('Morgane', '')).toBe('Morgane');
            expect(Utils.highlightMatch('Morgane', 'm')).toBe('Morgane');
        });
    });

    describe('cleanMarkdown', () => {
        it('devrait convertir le gras en HTML', () => {
            expect(Utils.cleanMarkdown('**texte gras**')).toContain('<strong>');
        });

        it('devrait gérer le texte sans markdown', () => {
            expect(Utils.cleanMarkdown('texte simple')).toBe('texte simple');
        });
    });

    describe('decodeHtmlEntities', () => {
        it('devrait décoder les entités HTML', () => {
            expect(Utils.decodeHtmlEntities('&lt;strong&gt;ok&lt;/strong&gt; &lt;div&gt;')).toBe('<strong>ok</strong> &lt;div&gt;');
            expect(Utils.decodeHtmlEntities('&amp;')).toBe('&');
        });
    });

    describe('translateErrorMessage', () => {
        it('devrait traduire les erreurs API reconnues', () => {
            expect(Utils.translateErrorMessage('Failed to fetch')).toContain('onnexion');
            expect(Utils.translateErrorMessage('timed out')).toContain('Délai');
            expect(Utils.translateErrorMessage('quota exceeded')).toContain('Quota');
        });

        it('devrait retourner le message original si non reconnu', () => {
            expect(Utils.translateErrorMessage('Unknown error')).toBe('Unknown error');
        });
    });

    describe('getPeriods', () => {
        it('devrait retourner les trimestres quand periodSystem=trimestres', () => {
            const periods = Utils.getPeriods();
            expect(periods).toEqual(['T1', 'T2', 'T3']);
        });
    });

    describe('getPeriodLabel', () => {
        it('devrait formater les labels courts', () => {
            expect(Utils.getPeriodLabel('T1', false)).toBe('T1');
            expect(Utils.getPeriodLabel('T2', false)).toBe('T2');
        });

        it('devrait formater les labels longs', () => {
            expect(Utils.getPeriodLabel('T1', true)).toBe('Trimestre 1');
            expect(Utils.getPeriodLabel('T2', true)).toBe('Trimestre 2');
        });
    });

    describe('getStatusBadgeInfo', () => {
        it('devrait attribuer tag-badge--new pour Nouveau et ses variantes de période', () => {
            expect(Utils.getStatusBadgeInfo('Nouveau')).toEqual({
                className: 'tag-badge tag-badge--new',
                label: 'Nouveau'
            });
            expect(Utils.getStatusBadgeInfo('Nouveau T2')).toEqual({
                className: 'tag-badge tag-badge--new',
                label: 'Nouveau T2'
            });
        });

        it('devrait attribuer tag-badge--depart pour Départ (avec ou sans accent / période)', () => {
            expect(Utils.getStatusBadgeInfo('Départ')).toEqual({
                className: 'tag-badge tag-badge--depart',
                label: 'Départ'
            });
            expect(Utils.getStatusBadgeInfo('Départ S1')).toEqual({
                className: 'tag-badge tag-badge--depart',
                label: 'Départ S1'
            });
            expect(Utils.getStatusBadgeInfo('depart')).toEqual({
                className: 'tag-badge tag-badge--depart',
                label: 'depart'
            });
        });

        it('devrait attribuer tag-badge--ulis pour ULIS et AESH, et tag-badge--device pour PPRE, PAP, PAI', () => {
            expect(Utils.getStatusBadgeInfo('ULIS')).toEqual({ className: 'tag-badge tag-badge--ulis', label: 'ULIS' });
            expect(Utils.getStatusBadgeInfo('PPRE')).toEqual({ className: 'tag-badge tag-badge--device', label: 'PPRE' });
            expect(Utils.getStatusBadgeInfo('PAP')).toEqual({ className: 'tag-badge tag-badge--device', label: 'PAP' });
            expect(Utils.getStatusBadgeInfo('PAI')).toEqual({ className: 'tag-badge tag-badge--device', label: 'PAI' });
            expect(Utils.getStatusBadgeInfo('AESH')).toEqual({ className: 'tag-badge tag-badge--ulis', label: 'AESH' });
        });

        it('devrait attribuer tag-badge--delegate pour Délégué (avec ou sans accent)', () => {
            expect(Utils.getStatusBadgeInfo('Délégué')).toEqual({ className: 'tag-badge tag-badge--delegate', label: 'Délégué' });
            expect(Utils.getStatusBadgeInfo('delegue')).toEqual({ className: 'tag-badge tag-badge--delegate', label: 'delegue' });
        });

        it('devrait conserver la classe neutre tag-badge pour les autres statuts et valeurs limites', () => {
            expect(Utils.getStatusBadgeInfo('Autre')).toEqual({ className: 'tag-badge', label: 'Autre' });
            expect(Utils.getStatusBadgeInfo('')).toEqual({ className: 'tag-badge', label: '' });
            expect(Utils.getStatusBadgeInfo(null)).toEqual({ className: 'tag-badge', label: null });
        });
    });

    describe('isStudentDeparted', () => {
        it('devrait détecter un élève parti via le statut Départ (sans période ou cumulatif sur la période active)', () => {
            expect(Utils.isStudentDeparted({ statuses: ['Départ'] }, 'T2')).toBe(true);
            expect(Utils.isStudentDeparted({ statuses: ['Départ T2'] }, 'T2')).toBe(true);
            expect(Utils.isStudentDeparted({ statuses: ['Départ T1'] }, 'T2')).toBe(true);
            expect(Utils.isStudentDeparted({ statuses: ['Départ T2'] }, 'T1')).toBe(false);
            expect(Utils.isStudentDeparted({ studentData: { statuses: ['depart'] } }, 'T2')).toBe(true);
        });

        it('devrait supporter le fallback booléen isDeparted quand statuses est vide', () => {
            expect(Utils.isStudentDeparted({ isDeparted: true }, 'T2')).toBe(true);
            expect(Utils.isStudentDeparted({ isDeparted: false }, 'T2')).toBe(false);
        });

        it('devrait retourner false pour un élève actif ou des valeurs nulles/vides', () => {
            expect(Utils.isStudentDeparted({ statuses: ['Nouveau', 'PPRE'] }, 'T2')).toBe(false);
            expect(Utils.isStudentDeparted({}, 'T2')).toBe(false);
            expect(Utils.isStudentDeparted(null, 'T2')).toBe(false);
            expect(Utils.isStudentDeparted(undefined)).toBe(false);
        });
    });

    describe('isStudentDepartedBeforePeriod', () => {
        it('devrait retourner true uniquement si le départ est daté d\'une période strictement antérieure', () => {
            expect(Utils.isStudentDepartedBeforePeriod({ statuses: ['Départ T1'] }, 'T2')).toBe(true);
            expect(Utils.isStudentDepartedBeforePeriod({ statuses: ['Départ T1'] }, 'T3')).toBe(true);
            expect(Utils.isStudentDepartedBeforePeriod({ statuses: ['Départ T2'] }, 'T2')).toBe(false);
            expect(Utils.isStudentDepartedBeforePeriod({ statuses: ['Départ T2'] }, 'T1')).toBe(false);
            expect(Utils.isStudentDepartedBeforePeriod({ statuses: ['Départ'] }, 'T2')).toBe(false);
        });

        it('devrait retourner false pour un élève sans statut de départ ou valeurs limites', () => {
            expect(Utils.isStudentDepartedBeforePeriod({ statuses: ['Nouveau T2'] }, 'T3')).toBe(false);
            expect(Utils.isStudentDepartedBeforePeriod({}, 'T2')).toBe(false);
            expect(Utils.isStudentDepartedBeforePeriod(null, 'T2')).toBe(false);
            expect(Utils.isStudentDepartedBeforePeriod(undefined)).toBe(false);
        });
    });

    describe('isStudentNew', () => {
        it('devrait détecter un élève Nouveau (sans période ou sur la période active uniquement)', () => {
            expect(Utils.isStudentNew({ statuses: ['Nouveau'] }, 'T1')).toBe(true);
            expect(Utils.isStudentNew({ statuses: ['Nouveau'] }, 'T3')).toBe(true);
            expect(Utils.isStudentNew({ statuses: ['Nouveau T2'] }, 'T2')).toBe(true);
            expect(Utils.isStudentNew({ statuses: ['Nouveau T2'] }, 'T1')).toBe(false);
            expect(Utils.isStudentNew({ statuses: ['Nouveau T2'] }, 'T3')).toBe(false);
            expect(Utils.isStudentNew({ studentData: { statuses: ['nouveau T2'] } }, 'T2')).toBe(true);
        });

        it('devrait supporter le fallback booléen isNew quand statuses est vide', () => {
            expect(Utils.isStudentNew({ isNew: true }, 'T2')).toBe(true);
            expect(Utils.isStudentNew({ isNew: false }, 'T2')).toBe(false);
        });

        it('devrait retourner false pour un élève non nouveau ou des valeurs limites', () => {
            expect(Utils.isStudentNew({ statuses: ['PPRE', 'Départ'] }, 'T2')).toBe(false);
            expect(Utils.isStudentNew({}, 'T2')).toBe(false);
            expect(Utils.isStudentNew(null, 'T2')).toBe(false);
            expect(Utils.isStudentNew(undefined)).toBe(false);
        });
    });

    describe('getActiveStatuses', () => {
        it('devrait filtrer Nouveau <P> et Départ <P> selon la période active tout en conservant les dispositifs permanents', () => {
            const student = {
                studentData: {
                    statuses: ['Nouveau T2', 'Départ T3', 'PPRE', 'Délégué']
                }
            };

            expect(Utils.getActiveStatuses(student, 'T1')).toEqual(['PPRE', 'Délégué']);
            expect(Utils.getActiveStatuses(student, 'T2')).toEqual(['Nouveau T2', 'PPRE', 'Délégué']);
            expect(Utils.getActiveStatuses(student, 'T3')).toEqual(['Départ T3', 'PPRE', 'Délégué']);
        });

        it('devrait conserver Nouveau et Départ sans période quelle que soit la période active', () => {
            expect(Utils.getActiveStatuses(['Nouveau', 'Départ', 'ULIS'], 'T1')).toEqual(['Nouveau', 'Départ', 'ULIS']);
            expect(Utils.getActiveStatuses(['Nouveau', 'Départ', 'ULIS'], 'T3')).toEqual(['Nouveau', 'Départ', 'ULIS']);
        });

        it('devrait gérer les valeurs nulles ou vides sans erreur', () => {
            expect(Utils.getActiveStatuses(null, 'T1')).toEqual([]);
            expect(Utils.getActiveStatuses(undefined)).toEqual([]);
            expect(Utils.getActiveStatuses([], 'T1')).toEqual([]);
        });
    });

    describe('statuts multiples et périodes inconnues', () => {
        it('devrait évaluer chaque statut de mouvement (historique + requalification)', () => {
            const student = { statuses: ['Nouveau T2', 'Nouveau T3'] };
            expect(Utils.isStudentNew(student, 'T3')).toBe(true);
            expect(Utils.isStudentNew(student, 'T1')).toBe(false);
            expect(Utils.isStudentDeparted({ statuses: ['Départ T3', 'Départ T1'] }, 'T2')).toBe(true);
        });

        it('devrait traiter une période inconnue comme un statut sans période, de façon cohérente entre helpers', () => {
            const student = { statuses: ['Nouveau arrivant'] };
            expect(Utils.isStudentNew(student, 'T2')).toBe(true);
            expect(Utils.getActiveStatuses(student, 'T2')).toEqual(['Nouveau arrivant']);
            expect(Utils.isStudentDepartedBeforePeriod({ statuses: ['Départ X9'] }, 'T3')).toBe(false);
        });
    });

    describe('isPlaceholderAppreciation', () => {
        it('devrait reconnaître les textes vides ou placeholders', () => {
            expect(Utils.isPlaceholderAppreciation('')).toBe(true);
            expect(Utils.isPlaceholderAppreciation(null)).toBe(true);
            expect(Utils.isPlaceholderAppreciation('<p>  </p>')).toBe(true);
            expect(Utils.isPlaceholderAppreciation('En attente de génération')).toBe(true);
            expect(Utils.isPlaceholderAppreciation('Remplissez les notes')).toBe(true);
        });

        it('devrait accepter une vraie appréciation', () => {
            expect(Utils.isPlaceholderAppreciation('<p>Bon trimestre, élève sérieux.</p>')).toBe(false);
        });
    });

    describe('getPeriodAppreciation', () => {
        it('devrait privilégier la période puis le champ racine seulement s\'il a été généré pour cette période', () => {
            expect(Utils.getPeriodAppreciation({ studentData: { periods: { T2: { appreciation: 'A' } } } }, 'T2')).toBe('A');
            expect(Utils.getPeriodAppreciation({ appreciation: 'B', generationPeriod: 'T2' }, 'T2')).toBe('B');
            expect(Utils.getPeriodAppreciation({ appreciation: 'B', generationPeriod: 'T1' }, 'T2')).toBe('');
            expect(Utils.getPeriodAppreciation(null, 'T2')).toBe('');
        });
    });

    describe('markStudentModified', () => {
        it('devrait horodater la période et la fiche avec le même timestamp', () => {
            const result = { studentData: { periods: { T2: { context: 'x' } } } };
            Utils.markStudentModified(result, 'T2');
            expect(result._lastModified).toBeTypeOf('number');
            expect(result.studentData.periods.T2._lastModified).toBe(result._lastModified);
            expect(result.studentData.periods.T2.context).toBe('x');
        });

        it('devrait créer la structure de période manquante', () => {
            const result = {};
            Utils.markStudentModified(result, 'T1');
            expect(result.studentData.periods.T1._lastModified).toBe(result._lastModified);
        });

        it('devrait n\'horodater que la fiche sans période', () => {
            const result = { studentData: { periods: { T1: {} } } };
            Utils.markStudentModified(result);
            expect(result._lastModified).toBeTypeOf('number');
            expect(result.studentData.periods.T1._lastModified).toBeUndefined();
        });
    });

    describe('isPendingForPeriod', () => {
        const withPeriod = (data, statuses = []) => ({ studentData: { statuses, periods: { T2: data } } });

        it('devrait considérer en attente un élève sans appréciation', () => {
            expect(Utils.isPendingForPeriod(withPeriod({ grade: 12 }), 'T2')).toBe(true);
            expect(Utils.isPendingForPeriod({ isPending: true, studentData: { statuses: [] } }, 'T2')).toBe(true);
        });

        it('ne devrait pas considérer en attente un élève déjà évalué ou en erreur sur la période', () => {
            expect(Utils.isPendingForPeriod(withPeriod({ appreciation: 'Très bien.' }), 'T2')).toBe(false);
            expect(Utils.isPendingForPeriod({ ...withPeriod({}), errorMessage: 'quota', errorPeriod: 'T2' }, 'T2')).toBe(false);
            expect(Utils.isPendingForPeriod({ ...withPeriod({}), errorMessage: 'quota', errorPeriod: 'T1' }, 'T2')).toBe(true);
        });

        it('devrait exclure un élève parti avant la période', () => {
            expect(Utils.isPendingForPeriod(withPeriod({ grade: 10 }, ['Départ T1']), 'T2')).toBe(false);
        });

        it('devrait exclure un élève parti sur la période sans note ni contexte, mais garder celui qui a des données', () => {
            expect(Utils.isPendingForPeriod(withPeriod({}, ['Départ T2']), 'T2')).toBe(false);
            expect(Utils.isPendingForPeriod(withPeriod({ grade: 0 }, ['Départ T2']), 'T2')).toBe(true);
            expect(Utils.isPendingForPeriod(withPeriod({ context: 'Part fin novembre' }, ['Départ T2']), 'T2')).toBe(true);
        });

        it('devrait gérer les valeurs nulles', () => {
            expect(Utils.isPendingForPeriod(null, 'T2')).toBe(false);
        });
    });

    describe('getStudentIdentityKey & countUniqueStudents', () => {
        it('devrait générer une clé d\'identité normalisée insensible aux accents, à la casse et aux annotations de classe', () => {
            expect(Utils.getStudentIdentityKey('BOUKHARI (3 1)', 'Sami')).toBe('boukhari-sami');
            expect(Utils.getStudentIdentityKey('boukhari', 'SAMI')).toBe('boukhari-sami');
            expect(Utils.getStudentIdentityKey('DÉPRÉ', 'Élise')).toBe('depre-elise');
            expect(Utils.getStudentIdentityKey('', '')).toBe('');
            expect(Utils.getStudentIdentityKey(null, undefined)).toBe('');
        });

        it('devrait compter une seule fois un élève partagé entre sa classe et un groupe, tout en distinguant les homonymes', () => {
            const classes = [
                { id: 'c-31', name: '3°1', isGroup: false },
                { id: 'c-32', name: '3°2', isGroup: false },
                { id: 'g-papd', name: 'PAPD', isGroup: true },
                { id: 'c-demo', name: 'Classe Exemple', isDemo: true }
            ];
            const results = [
                { id: '1', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'c-31' },
                { id: '2', nom: 'MIRZAI', prenom: 'Brikhna', classId: 'g-papd' },
                { id: '3', nom: 'MARTIN', prenom: 'Lucas', classId: 'c-31' },
                { id: '4', nom: 'MARTIN', prenom: 'Emma', classId: 'c-32' },
                // Même nom dans la classe démo : isolé du périmètre réel
                { id: '5', nom: 'MARTIN', prenom: 'Lucas', classId: 'c-demo' }
            ];

            expect(Utils.countUniqueStudents(results, classes)).toBe(4);
            // Sans la classe démo : 3 élèves réels uniques pour 4 fiches
            expect(Utils.countUniqueStudents(results.slice(0, 4), classes)).toBe(3);
        });

        it('devrait gérer les cas limites (null, vide, entrées anonymes)', () => {
            expect(Utils.countUniqueStudents(null)).toBe(0);
            expect(Utils.countUniqueStudents(undefined)).toBe(0);
            expect(Utils.countUniqueStudents([])).toBe(0);
            expect(Utils.countUniqueStudents([null, { id: 's1' }, { id: 's2' }])).toBe(2);
        });
    });

    describe('sortResults', () => {
        const sampleResults = [
            { id: '3', nom: 'PETIT', prenom: 'Emma', timestamp: '2026-01-02T10:00:00Z', studentData: { statuses: [], periods: { T1: { grade: 12 }, T2: { grade: 10 } } } },
            { id: '1', nom: 'BERNARD', prenom: 'Thomas', timestamp: '2026-01-03T10:00:00Z', studentData: { statuses: ['Délégué'], periods: { T1: { grade: 15 }, T2: { grade: 15.2 } } } },
            { id: '2', nom: 'DURAND', prenom: 'Sophie', timestamp: '2026-01-01T10:00:00Z', studentData: { statuses: ['PPRE'], periods: { T1: { grade: 9 }, T2: { grade: 10.5 } } } },
            { id: '4', nom: 'MARTIN', prenom: 'Lucas', timestamp: '2026-01-04T10:00:00Z', errorMessage: 'Erreur IA', studentData: { statuses: [], periods: { T1: { grade: null }, T2: { grade: null } } } }
        ];

        it('devrait gérer les cas limites (null, undefined, vide, 1 élément) sans muter la source', () => {
            expect(Utils.sortResults(null)).toEqual([]);
            expect(Utils.sortResults(undefined)).toEqual([]);
            expect(Utils.sortResults([])).toEqual([]);

            const single = [sampleResults[0]];
            const res = Utils.sortResults(single);
            expect(res).toEqual(single);
            expect(res).not.toBe(single);
        });

        it('devrait trier par nom (asc / desc) sans muter le tableau original', () => {
            const originalOrder = sampleResults.map(r => r.id);
            const asc = Utils.sortResults(sampleResults, { field: 'name', direction: 'asc' }, 'T2');
            expect(asc.map(r => r.nom)).toEqual(['BERNARD', 'DURAND', 'MARTIN', 'PETIT']);
            expect(sampleResults.map(r => r.id)).toEqual(originalOrder);

            const desc = Utils.sortResults(sampleResults, { field: 'name', direction: 'desc' }, 'T2');
            expect(desc.map(r => r.nom)).toEqual(['PETIT', 'MARTIN', 'DURAND', 'BERNARD']);
        });

        it('devrait trier par note et maintenir les notes absentes en fin de liste', () => {
            const asc = Utils.sortResults(sampleResults, { field: 'grade', direction: 'asc', param: 'T2' }, 'T2');
            expect(asc.map(r => r.nom)).toEqual(['PETIT', 'DURAND', 'BERNARD', 'MARTIN']);

            const desc = Utils.sortResults(sampleResults, { field: 'grade', direction: 'desc', param: 'T2' }, 'T2');
            expect(desc.map(r => r.nom)).toEqual(['BERNARD', 'DURAND', 'PETIT', 'MARTIN']);
        });

        it('devrait trier par statut (erreurs en premier, puis tags A-Z, puis sans statut)', () => {
            const asc = Utils.sortResults(sampleResults, { field: 'status', direction: 'asc' }, 'T2');
            expect(asc.map(r => r.nom)).toEqual(['MARTIN', 'BERNARD', 'DURAND', 'PETIT']);
        });

        it('devrait départager les ex-aequo (même note ou aucun statut) par ordre alphabétique déterministe (A-Z)', () => {
            const tied = [
                { id: 'z', nom: 'ZOLA', prenom: 'Émile', studentData: { statuses: [], periods: { T2: { grade: 12 } } } },
                { id: 'a', nom: 'ARAGON', prenom: 'Louis', studentData: { statuses: [], periods: { T2: { grade: 12 } } } },
                { id: 'h', nom: 'HUGO', prenom: 'Victor', studentData: { statuses: [], periods: { T2: { grade: 12 } } } }
            ];

            expect(Utils.sortResults(tied, { field: 'grade', direction: 'desc', param: 'T2' }, 'T2').map(r => r.nom))
                .toEqual(['ARAGON', 'HUGO', 'ZOLA']);
            expect(Utils.sortResults(tied, { field: 'status', direction: 'asc' }, 'T2').map(r => r.nom))
                .toEqual(['ARAGON', 'HUGO', 'ZOLA']);
        });
    });

    describe('extractAnalysisItems', () => {
        it('extrait forces et faiblesses depuis un objet structuré', () => {
            const data = {
                strengths: ['Participation active', '', null],
                weaknesses: ['Soigner la rédaction']
            };
            expect(Utils.extractAnalysisItems(data, 'forces')).toEqual(['Participation active']);
            expect(Utils.extractAnalysisItems(data, 'weaknesses')).toEqual(['Soigner la rédaction']);
        });

        it('extrait forces et faiblesses depuis un texte Markdown brut', () => {
            const md = [
                '**Points Forts :**',
                '- Bonne maîtrise des notions de cours',
                '- Investissement régulier en classe',
                '',
                "**Axes d'amélioration :**",
                '- Approfondir la justification des réponses'
            ].join('\n');
            expect(Utils.extractAnalysisItems(md, 'forces')).toEqual([
                'Bonne maîtrise des notions de cours',
                'Investissement régulier en classe'
            ]);
            expect(Utils.extractAnalysisItems(md, 'weaknesses')).toEqual([
                'Approfondir la justification des réponses'
            ]);
        });

        it('gère les entrées vides ou nulles sans lever d erreur', () => {
            expect(Utils.extractAnalysisItems(null, 'forces')).toEqual([]);
            expect(Utils.extractAnalysisItems('', 'weaknesses')).toEqual([]);
            expect(Utils.extractAnalysisItems(42, 'forces')).toEqual([]);
        });
    });

    describe('buildStudentAnalysisSnapshot', () => {
        it('cloisonne le compteur du journal et les statuts datés sur la période ciblée', () => {
            const student = {
                journal: [
                    { id: 'j1', period: 'T1', note: 'Participation T1' },
                    { id: 'j2', period: 'T2', note: 'Remarque T2' },
                    { id: 'j3', note: 'Note sans période' }
                ],
                studentData: {
                    statuses: ['DYS', 'Nouveau T2', 'Départ T3'],
                    periods: {
                        T1: { grade: 13.5, appreciation: 'Bon T1', context: 'Sérieux' },
                        T2: { grade: 14.0, appreciation: 'Bon T2', context: '' }
                    }
                }
            };

            const snapT1 = Utils.buildStudentAnalysisSnapshot(student, 'T1');
            expect(snapT1.period).toBe('T1');
            expect(snapT1.journalCount).toBe(2);
            expect(snapT1.statuses).toEqual(['DYS']);

            const snapT2 = Utils.buildStudentAnalysisSnapshot(student, 'T2');
            expect(snapT2.journalCount).toBe(2);
            expect(snapT2.statuses).toEqual(['DYS', 'Nouveau T2']);
        });

        it('getStudentAnalysisForPeriod résout la période ciblée, isole les périodes et gère le repli legacy sans fuite', () => {
            expect(Utils.getStudentAnalysisForPeriod(null, 'T1')).toBeNull();
            expect(Utils.getStudentAnalysisForPeriod({}, '')).toBeNull();

            // 1. Cas nominal multi-périodes (isolation T1 vs T2)
            const scoped = {
                analysisPerPeriod: {
                    T1: { strengths: ['Participation'], weaknesses: ['Soin'], nextSteps: ['Relire'], source: 'ai', _lastModified: 100 },
                    T2: { strengths: ['Rigueur'], weaknesses: [], nextSteps: [], source: 'manual', hasManualEdits: true, _lastModified: 200 }
                }
            };
            const t1 = Utils.getStudentAnalysisForPeriod(scoped, 'T1');
            expect(t1).toMatchObject({ strengths: ['Participation'], weaknesses: ['Soin'], nextSteps: ['Relire'], source: 'ai', isLegacy: false });
            const t2 = Utils.getStudentAnalysisForPeriod(scoped, 'T2');
            expect(t2).toMatchObject({ strengths: ['Rigueur'], hasManualEdits: true, source: 'manual', isLegacy: false });
            expect(Utils.getStudentAnalysisForPeriod(scoped, 'T3')).toBeNull();

            // 2. Repli legacy autorisé uniquement sur la période d'origine (pas de fuite vers T2)
            const legacy = {
                strengthsWeaknesses: { strengths: ['Sérieux'], weaknesses: ['Rapidité'] },
                nextSteps: ['S’entraîner au brouillon'],
                analysisGenerationPeriod: 'T1'
            };
            expect(Utils.getStudentAnalysisForPeriod(legacy, 'T1')).toMatchObject({
                strengths: ['Sérieux'],
                weaknesses: ['Rapidité'],
                nextSteps: ['S’entraîner au brouillon'],
                source: 'legacy',
                isLegacy: true
            });
            expect(Utils.getStudentAnalysisForPeriod(legacy, 'T2')).toBeNull();

            // 3. Si analysisPerPeriod contient déjà des entrées, les anciens champs plats sans période explicite ne fuient pas
            const mixed = {
                analysisPerPeriod: { T1: { strengths: ['OK'], weaknesses: [], nextSteps: [], source: 'ai' } },
                strengthsWeaknesses: { strengths: ['Ancien'], weaknesses: [] },
                generationPeriod: 'T2'
            };
            expect(Utils.getStudentAnalysisForPeriod(mixed, 'T2')).toBeNull();
        });

        it('syncStudentAnalysisRootCache projette les champs racine depuis analysisPerPeriod et nettoie quand vide', () => {
            const student = {
                studentData: { currentPeriod: 'T2' },
                analysisPerPeriod: {
                    T2: {
                        strengths: ['Autonomie'],
                        weaknesses: ['Rédaction'],
                        nextSteps: ['Développer les justifications'],
                        source: 'ai',
                        snapshot: { period: 'T2', grade: 13 },
                        sourceAppreciation: 'Bon trimestre.'
                    }
                }
            };

            Utils.syncStudentAnalysisRootCache(student, 'T2');
            expect(student.strengthsWeaknesses).toEqual({ strengths: ['Autonomie'], weaknesses: ['Rédaction'] });
            expect(student.nextSteps).toEqual(['Développer les justifications']);
            expect(student.analysisGenerationPeriod).toBe('T2');
            expect(student.analysisSnapshot).toEqual({ period: 'T2', grade: 13 });
            expect(student.analysisSourceAppreciation).toBe('Bon trimestre.');

            // Période vidée manuellement -> miroir racine nettoyé
            student.analysisPerPeriod.T2 = { strengths: [], weaknesses: [], nextSteps: [], source: 'manual' };
            Utils.syncStudentAnalysisRootCache(student, 'T2');
            expect(student.strengthsWeaknesses).toBeNull();
            expect(student.nextSteps).toBeNull();
            expect(student.analysisGenerationPeriod).toBeNull();
        });

        it('mergeAnalysisPerPeriod applique un LWW par période, ignore les entrées plus anciennes et reste idempotent', () => {
            expect(Utils.mergeAnalysisPerPeriod(null, { analysisPerPeriod: {} })).toBe(false);
            expect(Utils.mergeAnalysisPerPeriod({}, null)).toBe(false);

            const target = {
                analysisPerPeriod: {
                    T1: { strengths: ['Local récent'], weaknesses: [], nextSteps: [], source: 'manual', _lastModified: 500 },
                    T2: { strengths: ['Local ancien'], weaknesses: [], nextSteps: [], source: 'ai', _lastModified: 100 }
                }
            };
            const source = {
                analysisPerPeriod: {
                    T1: { strengths: ['Distant ancien'], weaknesses: [], nextSteps: [], source: 'ai', _lastModified: 200 },
                    T2: { strengths: ['Distant plus récent'], weaknesses: ['Orthographe'], nextSteps: [], source: 'manual', _lastModified: 300 },
                    T3: { strengths: ['Nouvelle période'], weaknesses: [], nextSteps: ['Continuer'], source: 'ai', _lastModified: 400 }
                }
            };

            const changed = Utils.mergeAnalysisPerPeriod(target, source);
            expect(changed).toBe(true);
            // T1 local conservé (500 > 200)
            expect(target.analysisPerPeriod.T1.strengths).toEqual(['Local récent']);
            // T2 mis à jour (300 > 100) et cloné sans alias de référence
            expect(target.analysisPerPeriod.T2.strengths).toEqual(['Distant plus récent']);
            expect(target.analysisPerPeriod.T2).not.toBe(source.analysisPerPeriod.T2);
            // T3 adopté
            expect(target.analysisPerPeriod.T3.strengths).toEqual(['Nouvelle période']);

            // Deuxième fusion identique : idempotente (aucun changement)
            expect(Utils.mergeAnalysisPerPeriod(target, source)).toBe(false);
        });
    });

    describe('withTimeout & fetchWithTimeout', () => {
        it('withTimeout résout normalement avant expiration et rejette en TimeoutError après délai', async () => {
            vi.useFakeTimers();
            try {
                await expect(Utils.withTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');

                const never = new Promise(() => {});
                const timed = Utils.withTimeout(never, 50, 'Expiration test');
                const assertion = expect(timed).rejects.toMatchObject({ name: 'TimeoutError', message: 'Expiration test' });
                await vi.advanceTimersByTimeAsync(60);
                await assertion;
            } finally {
                vi.useRealTimers();
            }
        });

        it('fetchWithTimeout transmet un signal qui expire en TimeoutError si fetch ne répond pas', async () => {
            vi.useFakeTimers();
            const originalFetch = globalThis.fetch;
            globalThis.fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason || new DOMException('Aborted', 'AbortError')));
            }));
            try {
                const req = Utils.fetchWithTimeout('https://example.test/api', {}, 100);
                const assertion = expect(req).rejects.toMatchObject({ name: 'TimeoutError' });
                await vi.advanceTimersByTimeAsync(120);
                await assertion;
            } finally {
                globalThis.fetch = originalFetch;
                vi.useRealTimers();
            }
        });
    });

    describe('normalizeLocalOllamaUrl', () => {
        it('accepte et normalise localhost et 127.0.0.1 sur le port 11434', () => {
            expect(Utils.normalizeLocalOllamaUrl('http://localhost:11434')).toBe('http://localhost:11434');
            expect(Utils.normalizeLocalOllamaUrl('  http://localhost:11434/  ')).toBe('http://localhost:11434');
            expect(Utils.normalizeLocalOllamaUrl('http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
        });

        it('rejette les URLs non autorisées, ports alternatifs, chemins, query strings et fragments', () => {
            const rejected = [
                null,
                undefined,
                '',
                '   ',
                'not-a-url',
                'https://localhost:11434',
                'http://[::1]:11434',
                'http://localhost:9222',
                'http://localhost:11434/api',
                'http://localhost:11434/?x=1',
                'http://localhost:11434/#frag',
                'http://user:pass@localhost:11434',
                'https://evil.example:11434',
                'http://192.168.1.10:11434'
            ];
            for (const candidate of rejected) {
                expect(Utils.normalizeLocalOllamaUrl(candidate)).toBeNull();
            }
        });
    });

    describe('detectGender & frenchFirstNames', () => {
        it('garantit l\'intégrité des listes module-level (ASCII minuscules, sans accents ni chevauchement)', () => {
            const asciiLower = /^[a-z]+$/;
            for (const set of [EPICENE_FIRST_NAMES, FEMININ_FIRST_NAMES, MASCULIN_FIRST_NAMES]) {
                expect(set.size).toBeGreaterThan(0);
                for (const name of set) {
                    expect(name).toMatch(asciiLower);
                }
            }
            for (const name of EPICENE_FIRST_NAMES) {
                expect(FEMININ_FIRST_NAMES.has(name)).toBe(false);
                expect(MASCULIN_FIRST_NAMES.has(name)).toBe(false);
            }
            for (const name of FEMININ_FIRST_NAMES) {
                expect(MASCULIN_FIRST_NAMES.has(name)).toBe(false);
            }
            expect(new Set(FEMININ_ENDINGS).size).toBe(FEMININ_ENDINGS.length);
            expect(new Set(MASCULIN_ENDINGS).size).toBe(MASCULIN_ENDINGS.length);
        });

        it('détecte les prénoms féminins et masculins contemporains (accents, casse, diversité des classes)', () => {
            const girls = [
                'Chloé', 'Léa', 'Maëlys', 'Inès', 'Inaya', 'Margaux', 'Mila', 'Noémie',
                'Aya', 'Assia', 'Fatoumata', 'Kenza', 'Zélie', 'Maud', 'Mahault', '  AMBRE  '
            ];
            for (const name of girls) {
                expect(Utils.detectGender(name), name).toBe('féminin');
            }

            const boys = [
                'Timéo', 'Raphaël', 'Théo', 'Noam', 'Milo', 'Malo', 'Yanis', 'Rayan',
                'Rayane', 'Ilyes', 'Amine', 'Sofiane', 'Zakaria', 'Moussa', 'Louka',
                'Timothée', 'Tiago', 'Titouan', 'Erwan', 'Gaël', '  LUCAS  '
            ];
            for (const name of boys) {
                expect(Utils.detectGender(name), name).toBe('masculin');
            }
        });

        it('retourne neutre pour les prénoms épicènes', () => {
            const epicene = [
                'Camille', 'Sacha', 'Sasha', 'Eden', 'Charlie', 'Lou', 'Louison',
                'Noa', 'Nour', 'Alix', 'Swann', 'Yaël', 'Andréa', 'Mahé', 'Loïs', 'Dominique'
            ];
            for (const name of epicene) {
                expect(Utils.detectGender(name), name).toBe('neutre');
            }
        });

        it('gère les prénoms composés (tiret et espace)', () => {
            expect(Utils.detectGender('Jean-Baptiste')).toBe('masculin');
            expect(Utils.detectGender('Jean-Marie')).toBe('masculin');
            expect(Utils.detectGender('Léo-Paul')).toBe('masculin');
            expect(Utils.detectGender('Mohamed-Amine')).toBe('masculin');
            expect(Utils.detectGender('Jean Baptiste')).toBe('masculin');
            expect(Utils.detectGender('Marie-Lou')).toBe('féminin');
            expect(Utils.detectGender('Fatima-Zahra')).toBe('féminin');
            expect(Utils.detectGender('Lou-Anne')).toBe('féminin');
            expect(Utils.detectGender('Lou-Ann')).toBe('féminin');
            expect(Utils.detectGender('Camille-Lou')).toBe('neutre');
        });

        it('applique des terminaisons conservatrices sans mégenrer les cas piégeux (-a, -ane, -ine, -ie, -ee, -in)', () => {
            // Terminaisons conservatrices fiables sur prénoms hors liste
            expect(Utils.detectGender('Bernadette')).toBe('féminin');
            expect(Utils.detectGender('Médard')).toBe('masculin');
            expect(Utils.detectGender('Ulric')).toBe('masculin');

            // Prénoms hors liste aux terminaisons ambiguës → neutre plutôt que mégenrage
            expect(Utils.detectGender('Suleymana')).toBe('neutre');
            expect(Utils.detectGender('Mouslimane')).toBe('neutre');
            expect(Utils.detectGender('Zineddine')).toBe('neutre');
            expect(Utils.detectGender('Zacharie')).toBe('masculin');
            expect(Utils.detectGender('Caitlin')).toBe('neutre');
            expect(Utils.detectGender('Nisrin')).toBe('neutre');
        });

        it('gère proprement les entrées nulles, vides, invalides ou inconnues', () => {
            expect(Utils.detectGender(null)).toBe('neutre');
            expect(Utils.detectGender(undefined)).toBe('neutre');
            expect(Utils.detectGender('')).toBe('neutre');
            expect(Utils.detectGender('   ')).toBe('neutre');
            expect(Utils.detectGender(42)).toBe('neutre');
            expect(Utils.detectGender('Xyz')).toBe('neutre');
        });
    });

    describe('formatDuration', () => {
        it('formate les durées très courtes (< 100 ms) en "< 0,1 s" avec espaces insécables', () => {
            expect(Utils.formatDuration(1)).toBe('<\u00A00,1\u00A0s');
            expect(Utils.formatDuration(42)).toBe('<\u00A00,1\u00A0s');
            expect(Utils.formatDuration(99)).toBe('<\u00A00,1\u00A0s');
        });

        it('formate les durées entre 100 ms et 9,9 s avec 1 décimale, virgule française et espace insécable', () => {
            expect(Utils.formatDuration(100)).toBe('0,1\u00A0s');
            expect(Utils.formatDuration(815)).toBe('0,8\u00A0s');
            expect(Utils.formatDuration(1000)).toBe('1,0\u00A0s');
            expect(Utils.formatDuration(2440)).toBe('2,4\u00A0s');
            expect(Utils.formatDuration(9949)).toBe('9,9\u00A0s');
        });

        it('bascule en secondes entières entre 10 s et 59 s sans artefact 10,0 s', () => {
            expect(Utils.formatDuration(9950)).toBe('10\u00A0s');
            expect(Utils.formatDuration(14300)).toBe('14\u00A0s');
            expect(Utils.formatDuration(59499)).toBe('59\u00A0s');
        });

        it('bascule en minutes et secondes dès 60 s sans afficher 0 s ou 60 s', () => {
            expect(Utils.formatDuration(59500)).toBe('1\u00A0min');
            expect(Utils.formatDuration(60000)).toBe('1\u00A0min');
            expect(Utils.formatDuration(65000)).toBe('1\u00A0min 5\u00A0s');
            expect(Utils.formatDuration(75400)).toBe('1\u00A0min 15\u00A0s');
            expect(Utils.formatDuration(120000)).toBe('2\u00A0min');
        });

        it('retourne une chaîne vide pour les valeurs nulles, négatives ou non numériques', () => {
            expect(Utils.formatDuration(0)).toBe('');
            expect(Utils.formatDuration(-250)).toBe('');
            expect(Utils.formatDuration(null)).toBe('');
            expect(Utils.formatDuration(undefined)).toBe('');
            expect(Utils.formatDuration(NaN)).toBe('');
            expect(Utils.formatDuration(Infinity)).toBe('');
            expect(Utils.formatDuration('815')).toBe('');
        });
    });

    describe('getGenerationModeInfo', () => {
        it('formate le tooltip avec modèle, tokens (séparateur de milliers) et durée lisible', () => {
            const shortInfo = Utils.getGenerationModeInfo({
                studentData: { currentAIModel: 'gemini-4-hydrogen' },
                tokenUsage: { appreciation: { total_tokens: 699 }, generationTimeMs: 815 }
            });
            expect(shortInfo).toEqual({
                tooltip: 'Gemini 4 Hydrogen • 699\u00A0tokens • 0,8\u00A0s'
            });

            const longInfo = Utils.getGenerationModeInfo({
                studentData: { currentAIModel: 'ollama-qwen3-8b' },
                tokenUsage: { appreciation: { total_tokens: 1482 }, generationTimeMs: 75400 }
            });
            expect(longInfo.tooltip).toContain(`${(1482).toLocaleString('fr-FR')}\u00A0tokens • 1\u00A0min 15\u00A0s`);
        });

        it('gère le singulier (1 token) et les replis sans modèle ou sans métadonnées', () => {
            const singleToken = Utils.getGenerationModeInfo({
                studentData: { currentAIModel: 'gemini-4-hydrogen' },
                tokenUsage: { appreciation: { total_tokens: 1 }, generationTimeMs: 0 }
            });
            expect(singleToken.tooltip).toBe('Gemini 4 Hydrogen • 1\u00A0token');

            const fallbackWithModel = Utils.getGenerationModeInfo({
                studentData: { currentAIModel: 'gemini-4-hydrogen' },
                tokenUsage: { appreciation: { total_tokens: 0 }, generationTimeMs: 0 }
            });
            expect(fallbackWithModel.tooltip).toBe('Gemini 4 Hydrogen • Généré par IA');

            const fallbackEmpty = Utils.getGenerationModeInfo(null);
            expect(fallbackEmpty.tooltip).toBe('Généré par IA');
        });
    });

    describe('normalizeMaxChars & getCharLimitState', () => {
        it('normalise, borne et filtre les limites de caractères invalides', () => {
            expect(Utils.normalizeMaxChars(null)).toBeNull();
            expect(Utils.normalizeMaxChars(undefined)).toBeNull();
            expect(Utils.normalizeMaxChars('')).toBeNull();
            expect(Utils.normalizeMaxChars(0)).toBeNull();
            expect(Utils.normalizeMaxChars(-50)).toBeNull();
            expect(Utils.normalizeMaxChars('abc')).toBeNull();
            expect(Utils.normalizeMaxChars(20)).toBe(50);
            expect(Utils.normalizeMaxChars(5000)).toBe(2000);
            expect(Utils.normalizeMaxChars('255')).toBe(255);
            expect(Utils.normalizeMaxChars(400.4)).toBe(400);
        });

        it('calcule correctement les états none / ok / near / over et le dépassement exact', () => {
            expect(Utils.getCharLimitState(300, null)).toEqual({ limit: null, state: 'none', overBy: 0 });
            expect(Utils.getCharLimitState(180, 255)).toEqual({ limit: 255, state: 'ok', overBy: 0 });
            expect(Utils.getCharLimitState(235, 255)).toEqual({ limit: 255, state: 'near', overBy: 0 });
            expect(Utils.getCharLimitState(255, 255)).toEqual({ limit: 255, state: 'near', overBy: 0 });
            expect(Utils.getCharLimitState(256, 255)).toEqual({ limit: 255, state: 'over', overBy: 1 });
            expect(Utils.getCharLimitState(310, '255')).toEqual({ limit: 255, state: 'over', overBy: 55 });
        });

        it('computeSafeWordCap applique la marge de sécurité (~14 %) avec un plancher à 8 mots', () => {
            expect(Utils.computeSafeWordCap(400)).toBe(52);
            expect(Utils.computeSafeWordCap(255)).toBe(33);
            expect(Utils.computeSafeWordCap(500)).toBe(66);
            expect(Utils.computeSafeWordCap(40)).toBe(8);
            expect(Utils.computeSafeWordCap(0)).toBe(8);
            expect(Utils.computeSafeWordCap(-100)).toBe(8);
            expect(Utils.computeSafeWordCap(null)).toBe(8);
            expect(Utils.computeSafeWordCap(undefined)).toBe(8);
            expect(Utils.computeSafeWordCap('abc')).toBe(8);
        });
    });
});

