import { describe, it, expect } from 'vitest';
import { detectLevelFromName } from './LevelDetector.js';

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

    describe('3ème (Préparation Brevet)', () => {
        it('devrait détecter à partir des suffixes de classe', () => {
            expect(detectLevelFromName('3ème G1')).toBe('3eme');
            expect(detectLevelFromName('3ème')).toBe('3eme');
            expect(detectLevelFromName('3e')).toBe('3eme');
            expect(detectLevelFromName('3°')).toBe('3eme');
            expect(detectLevelFromName('3°G1')).toBe('3eme');
            expect(detectLevelFromName('3 B')).toBe('3eme');
            expect(detectLevelFromName('3G1')).toBe('3eme');
            expect(detectLevelFromName('3A2')).toBe('3eme');
        });

        it('devrait détecter à partir de codes administratifs', () => {
            expect(detectLevelFromName('305')).toBe('3eme');
        });

        it('devrait détecter à partir de mots clés de diplôme', () => {
            expect(detectLevelFromName('Brevet Blanc')).toBe('3eme');
            expect(detectLevelFromName('Troisième')).toBe('3eme');
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
            expect(detectLevelFromName('3°G1 2024')).toBe('3eme');
        });

        it('devrait retourner générique pour les chaînes vides ou inconnues', () => {
            expect(detectLevelFromName('')).toBe('generique');
            expect(detectLevelFromName(null)).toBe('generique');
            expect(detectLevelFromName('  ')).toBe('generique');
            expect(detectLevelFromName('Groupe de projet')).toBe('generique');
        });
    });
});
