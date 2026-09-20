import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Utils } from './Utils.js';

// Mock appState for getPeriods
vi.mock('../state/State.js', () => ({
    appState: {
        periodSystem: 'trimestres',  // Use French key 'trimestres'
        currentPeriod: 'T2',
        evolutionThresholds: {
            positive: 0.5,
            negative: -0.5,
            veryPositive: 1.5,
            veryNegative: -1.5
        },
        subjects: {}
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

    describe('getRandomElement', () => {
        it('devrait retourner un élément du tableau', () => {
            const arr = ['a', 'b', 'c'];
            expect(arr).toContain(Utils.getRandomElement(arr));
        });

        it('devrait retourner chaîne vide pour tableau vide', () => {
            expect(Utils.getRandomElement([])).toBe('');
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
            expect(Utils.decodeHtmlEntities('&lt;div&gt;')).toBe('<div>');
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
});
