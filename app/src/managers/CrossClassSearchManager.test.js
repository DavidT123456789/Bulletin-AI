import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CrossClassSearchManager } from './CrossClassSearchManager.js';
import { appState } from '../state/State.js';
import { ClassManager } from './ClassManager.js';

describe('CrossClassSearchManager', () => {
    beforeEach(() => {
        appState.currentClassId = 'class-group-1';
        appState.currentPeriod = 'T1';
        appState.generatedResults = [
            {
                id: 's1',
                nom: 'BOUKHARI',
                prenom: 'Sami',
                classId: 'class-other-group',
                studentData: {
                    classe: '3 1',
                    periods: { T1: { grade: 14 } }
                }
            },
            {
                id: 's2',
                nom: 'ERDOGAN PAUTRAS',
                prenom: 'Helin',
                classId: 'class-other-group',
                studentData: {
                    classe: '3 4',
                    periods: { T1: { grade: 16 } }
                }
            },
            {
                id: 's3',
                nom: 'MARTIN',
                prenom: 'Lucas',
                classId: 'class-group-1', // Classe courante -> ignorée
                studentData: {
                    classe: '3 1'
                }
            }
        ];

        vi.spyOn(ClassManager, 'getClassById').mockImplementation(id => {
            if (id === 'class-other-group') {
                return { id: 'class-other-group', name: 'Groupe Techno G2' };
            }
            return null;
        });
    });

    it('devrait trouver les élèves par leur nom et prénom', () => {
        const results = CrossClassSearchManager.searchAcrossClasses('boukhari');
        expect(results.totalMatches).toBe(1);
        expect(results.groups[0].students[0].nom).toBe('BOUKHARI');
        expect(results.groups[0].students[0].originClass).toBe('3 1');
    });

    it('devrait trouver les élèves par leur classe d\'origine ("3 1", "31" ou "3ᵉ1")', () => {
        const resultsSpace = CrossClassSearchManager.searchAcrossClasses('3 1');
        expect(resultsSpace.totalMatches).toBe(1);
        expect(resultsSpace.groups[0].students[0].nom).toBe('BOUKHARI');

        const resultsNorm = CrossClassSearchManager.searchAcrossClasses('31');
        expect(resultsNorm.totalMatches).toBe(1);
        expect(resultsNorm.groups[0].students[0].nom).toBe('BOUKHARI');

        const resultsExposant = CrossClassSearchManager.searchAcrossClasses('3ᵉ1');
        expect(resultsExposant.totalMatches).toBe(1);
        expect(resultsExposant.groups[0].students[0].nom).toBe('BOUKHARI');
    });

    it('devrait ignorer la classe courante lors de la recherche', () => {
        const results = CrossClassSearchManager.searchAcrossClasses('Martin');
        expect(results.totalMatches).toBe(0);
    });

    it('devrait retourner une liste vide pour un terme trop court', () => {
        const results = CrossClassSearchManager.searchAcrossClasses('a');
        expect(results.totalMatches).toBe(0);
        expect(results.groups).toEqual([]);
    });
});
