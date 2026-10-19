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

    it('devrait envelopper le rendu DOM dans .cross-class-results-inner pour l\'accordéon CSS Grid', () => {
        document.body.innerHTML = '<div><div id="outputList"></div></div>';
        CrossClassSearchManager.reset();

        CrossClassSearchManager.updateCrossClassResults('boukhari');
        const container = document.getElementById('crossClassResults');
        expect(container).not.toBeNull();
        expect(container.classList.contains('visible')).toBe(true);
        expect(container.querySelector('.cross-class-results-inner')).not.toBeNull();
        expect(container.querySelector('.cross-class-group-header')).not.toBeNull();
        expect(container.querySelector('.cross-class-total-count')?.textContent).toBe('1');
        expect(container.querySelector('.cross-class-result')).not.toBeNull();

        CrossClassSearchManager.updateCrossClassResults('');
        expect(container.classList.contains('visible')).toBe(false);
    });

    it('devrait débouncer proprement scheduleSearch et annuler les appels précédents', () => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div><div id="outputList"></div></div>';
        CrossClassSearchManager.reset(true);

        const filterSpy = vi.fn();
        CrossClassSearchManager.scheduleSearch('b', filterSpy, 100);
        CrossClassSearchManager.scheduleSearch('bo', filterSpy, 100);
        CrossClassSearchManager.scheduleSearch('boukhari', filterSpy, 100);

        expect(filterSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(filterSpy).toHaveBeenCalledTimes(1);
        expect(document.getElementById('crossClassResults')?.classList.contains('visible')).toBe(true);

        vi.useRealTimers();
    });

    it('devrait réinitialiser toute la recherche Liste via clearListSearch (inputs, conteneur inline et résultats)', () => {
        document.body.innerHTML = `
            <div>
                <div class="search-container has-value">
                    <input id="searchInput" value="boukhari" />
                </div>
                <div id="inlineSearchContainer" class="inline-search-container active has-value">
                    <input id="inlineSearchInput" value="boukhari" />
                </div>
                <div id="outputList"></div>
            </div>
        `;
        CrossClassSearchManager.reset(true);
        CrossClassSearchManager.updateCrossClassResults('boukhari');

        const container = document.getElementById('crossClassResults');
        expect(container.classList.contains('visible')).toBe(true);

        CrossClassSearchManager.clearListSearch({ renderList: false, immediate: true });

        expect(document.getElementById('searchInput').value).toBe('');
        expect(document.querySelector('.search-container').classList.contains('has-value')).toBe(false);
        expect(document.getElementById('inlineSearchInput').value).toBe('');
        expect(document.getElementById('inlineSearchContainer').classList.contains('active')).toBe(false);
        expect(document.getElementById('inlineSearchContainer').classList.contains('has-value')).toBe(false);
        expect(container.classList.contains('visible')).toBe(false);
        expect(container.innerHTML).toBe('');
    });

    it('devrait naviguer au clavier (ArrowDown / ArrowUp) entre les résultats inter-classes', () => {
        document.body.innerHTML = `
            <div>
                <input id="searchInput" value="3" />
                <div id="outputList"></div>
            </div>
        `;
        appState.generatedResults[1].studentData.classe = '3 1';
        CrossClassSearchManager.reset(true);
        CrossClassSearchManager.updateCrossClassResults('3 1');

        const results = document.querySelectorAll('.cross-class-result');
        expect(results.length).toBe(2);

        results[0].focus();
        expect(document.activeElement).toBe(results[0]);

        results[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(results[1]);

        results[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(results[0]);

        results[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(document.getElementById('searchInput'));
    });
});

