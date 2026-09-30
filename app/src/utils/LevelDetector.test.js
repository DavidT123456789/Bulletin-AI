import { describe, it, expect } from 'vitest';
import { detectLevelFromName, compareClassesPedagogically, getClassSortRank } from './LevelDetector.js';

describe('LevelDetector - detectLevelFromName', () => {
    describe('Collège (6ème, 5ème, 4ème)', () => {
        it('devrait détecter à partir de suffixes de classe standard', () => {
            expect(detectLevelFromName('6ème Picasso')).toBe('college');
            expect(detectLevelFromName('6ème')).toBe('college');
            expect(detectLevelFromName('6e')).toBe('college');
            expect(detectLevelFromName('6°')).toBe('college');
            expect(detectLevelFromName('5ème Matisse')).toBe('college');
            expect(detectLevelFromName('5e')).toBe('college');
            expect(detectLevelFromName('4e')).toBe('college');
            expect(detectLevelFromName('4°1')).toBe('college');
        });

        it('devrait détecter à partir de codes administratifs à 3 chiffres', () => {
            expect(detectLevelFromName('602')).toBe('college');
            expect(detectLevelFromName('503')).toBe('college');
            expect(detectLevelFromName('409')).toBe('college');
        });

        it('devrait détecter à partir de chiffre + lettre', () => {
            expect(detectLevelFromName('6 A')).toBe('college');
            expect(detectLevelFromName('5 B')).toBe('college');
            expect(detectLevelFromName('4 C')).toBe('college');
        });

        it('devrait détecter à partir de mots entiers', () => {
            expect(detectLevelFromName('Classe de sixième')).toBe('college');
            expect(detectLevelFromName('Collège Montesquieu')).toBe('college');
        });
    });

    describe('3ème', () => {
        it('devrait détecter à partir des suffixes de classe', () => {
            expect(detectLevelFromName('3ème G1')).toBe('college');
            expect(detectLevelFromName('3ème')).toBe('college');
            expect(detectLevelFromName('3e')).toBe('college');
            expect(detectLevelFromName('3°')).toBe('college');
            expect(detectLevelFromName('3°G1')).toBe('college');
            expect(detectLevelFromName('3 B')).toBe('college');
            expect(detectLevelFromName('3G1')).toBe('college');
            expect(detectLevelFromName('3A2')).toBe('college');
        });

        it('devrait détecter à partir de codes administratifs', () => {
            expect(detectLevelFromName('305')).toBe('college');
        });

        it('devrait détecter à partir de mots clés de diplôme', () => {
            expect(detectLevelFromName('Brevet Blanc')).toBe('college');
            expect(detectLevelFromName('Troisième')).toBe('college');
        });
    });

    describe('Lycée (2nde, 1ère)', () => {
        it('devrait détecter à partir des suffixes de classe', () => {
            expect(detectLevelFromName('2nde 4')).toBe('lycee');
            expect(detectLevelFromName('2nd 2')).toBe('lycee');
            expect(detectLevelFromName('1ère STI')).toBe('lycee');
            expect(detectLevelFromName('1ere')).toBe('lycee');
            expect(detectLevelFromName('1re B')).toBe('lycee');
            expect(detectLevelFromName('1 G1')).toBe('lycee');
            expect(detectLevelFromName('2 A')).toBe('lycee');
        });

        it('devrait détecter à partir de codes administratifs', () => {
            expect(detectLevelFromName('208')).toBe('lycee');
            expect(detectLevelFromName('104')).toBe('lycee');
        });

        it('devrait détecter à partir de mots entiers', () => {
            expect(detectLevelFromName('Seconde générale')).toBe('lycee');
            expect(detectLevelFromName('Première STMG')).toBe('lycee');
            expect(detectLevelFromName('Lycée Condorcet')).toBe('lycee');
        });
    });

    describe('Terminale (Baccalauréat / Parcoursup)', () => {
        it('devrait détecter à partir de mots entiers ou abréviations', () => {
            expect(detectLevelFromName('Terminale L')).toBe('terminale');
            expect(detectLevelFromName('Term S')).toBe('terminale');
            expect(detectLevelFromName('Tle ES')).toBe('terminale');
        });

        it('devrait détecter à partir de codes administratifs ou avancés', () => {
            expect(detectLevelFromName('T02')).toBe('terminale');
            expect(detectLevelFromName('T05')).toBe('terminale');
            expect(detectLevelFromName('TG3')).toBe('terminale');
            expect(detectLevelFromName('TS1')).toBe('terminale');
            expect(detectLevelFromName('TG')).toBe('terminale');
        });
    });

    describe('Enseignement Supérieur', () => {
        it('devrait détecter les cycles du supérieur', () => {
            expect(detectLevelFromName('BTS SIO')).toBe('superieur');
            expect(detectLevelFromName('CPGE Littéraire')).toBe('superieur');
            expect(detectLevelFromName('Master 1')).toBe('superieur');
            expect(detectLevelFromName('L3 Informatique')).toBe('superieur');
            expect(detectLevelFromName('Enseignement Supérieur')).toBe('superieur');
        });
    });

    describe('École Élémentaire', () => {
        it('devrait détecter les niveaux élémentaires', () => {
            expect(detectLevelFromName('CM2 A')).toBe('elementaire');
            expect(detectLevelFromName('CM1 - CM2')).toBe('elementaire');
            expect(detectLevelFromName('CE1')).toBe('elementaire');
            expect(detectLevelFromName('CP')).toBe('elementaire');
            expect(detectLevelFromName('Élémentaire Picasso')).toBe('elementaire');
        });
    });

    describe('Maternelle', () => {
        it('devrait détecter les niveaux maternelles', () => {
            expect(detectLevelFromName('Grande Section (GS)')).toBe('maternelle');
            expect(detectLevelFromName('Moyenne Section')).toBe('maternelle');
            expect(detectLevelFromName('MS/GS')).toBe('maternelle');
            expect(detectLevelFromName('TPS-PS')).toBe('maternelle');
            expect(detectLevelFromName('Maternelle A')).toBe('maternelle');
        });
    });

    describe('Faux positifs exclus et gestion des cas limites', () => {
        it('devrait ignorer les trimestres', () => {
            expect(detectLevelFromName('Trimestre 1')).toBe('generique');
            expect(detectLevelFromName('T1')).toBe('generique');
            expect(detectLevelFromName('T2')).toBe('generique');
            expect(detectLevelFromName('T3')).toBe('generique');
            expect(detectLevelFromName('T4')).toBe('generique');
        });

        it('devrait ignorer les groupes ou salles de classe généraux', () => {
            expect(detectLevelFromName('Groupe 3')).toBe('generique');
            expect(detectLevelFromName('Salle 2')).toBe('generique');
            expect(detectLevelFromName('Groupe A')).toBe('generique');
        });

        it('devrait nettoyer et ignorer les années scolaires', () => {
            expect(detectLevelFromName('Année 2025-2026')).toBe('generique');
            expect(detectLevelFromName('2025/2026')).toBe('generique');
            expect(detectLevelFromName('4e - 2025-2026')).toBe('college');
            expect(detectLevelFromName('3°G1 2024')).toBe('college');
        });

        it('devrait retourner générique pour les chaînes vides ou inconnues', () => {
            expect(detectLevelFromName('')).toBe('generique');
            expect(detectLevelFromName(null)).toBe('generique');
            expect(detectLevelFromName('  ')).toBe('generique');
            expect(detectLevelFromName('Groupe de projet')).toBe('generique');
        });
    });

    describe('Ordre pédagogique - getClassSortRank et compareClassesPedagogically', () => {
        it('devrait ordonner les niveaux dans le sens du cycle de l\'élève (6e -> 5e -> 4e -> 3e)', () => {
            const classes = ['3ᵉG1', '5ᵉ2', '6ᵉ1', '4ᵉ3', '3ᵉG2', '6ᵉ2'];
            classes.sort(compareClassesPedagogically);
            expect(classes).toEqual(['6ᵉ1', '6ᵉ2', '5ᵉ2', '4ᵉ3', '3ᵉG1', '3ᵉG2']);
        });

        it('devrait ordonner du primaire au supérieur en respectant le parcours scolaire', () => {
            const classes = ['Terminale 1', '6ᵉ1', 'CP B', '2nde 2', 'CM2 A', '1ère STI', 'BTS SIO'];
            classes.sort(compareClassesPedagogically);
            expect(classes).toEqual([
                'CP B',
                'CM2 A',
                '6ᵉ1',
                '2nde 2',
                '1ère STI',
                'Terminale 1',
                'BTS SIO'
            ]);
        });

        it('devrait placer les classes entières avant les groupes pour un même niveau', () => {
            const classes = ['3ᵉG2', '3ᵉ1', '3ᵉG1', '3ᵉ2'];
            classes.sort(compareClassesPedagogically);
            expect(classes).toEqual(['3ᵉ1', '3ᵉ2', '3ᵉG1', '3ᵉG2']);
        });

        it('devrait assigner correctement le rang de 3ème à 3°4 et 3ᵉ4 sans confusion avec la 4ème', () => {
            expect(getClassSortRank('3°4')).toBe(230);
            expect(getClassSortRank('3ᵉ4')).toBe(230);
            expect(getClassSortRank('3-4')).toBe(230);
            expect(getClassSortRank('3 4')).toBe(230);
            expect(getClassSortRank('3e4')).toBe(230);
            expect(getClassSortRank('3ème 4')).toBe(230);
            expect(getClassSortRank('3ᵉ4 Reconstituée')).toBe(230);
        });

        it('ne doit pas confondre le numéro de division (4, 5, 6) avec le niveau scolaire', () => {
            expect(getClassSortRank('3ᵉ5')).toBe(230);
            expect(getClassSortRank('3ᵉ6')).toBe(230);
            expect(getClassSortRank('4ᵉ5')).toBe(220);
            expect(getClassSortRank('4ᵉ6')).toBe(220);
            expect(getClassSortRank('5ᵉ6')).toBe(210);
            expect(getClassSortRank('5ᵉ4')).toBe(210);
        });

        it('devrait ordonner fidèlement 5ᵉ4, 4ᵉ1, 4ᵉ2 et 3ᵉ4 (la 3ᵉ4 reconstituée après les 4èmes)', () => {
            const classes = ['5ᵉ4', '3ᵉ4', '4ᵉ1', '4ᵉ2'];
            classes.sort(compareClassesPedagogically);
            expect(classes).toEqual(['5ᵉ4', '4ᵉ1', '4ᵉ2', '3ᵉ4']);
        });
    });
});
