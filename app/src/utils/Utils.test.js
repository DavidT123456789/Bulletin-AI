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
    });

    describe('normalizeName', () => {
        it('devrait normaliser pour comparaison', () => {
            expect(Utils.normalizeName('MARTIN', 'Lucas')).toBe('martin-lucas');
            expect(Utils.normalizeName('Martin', 'LUCAS')).toBe('martin-lucas');
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
            expect(Utils.translateErrorMessage('Failed to fetch')).toContain('connexion');
            expect(Utils.translateErrorMessage('timed out')).toContain('expiré');
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
