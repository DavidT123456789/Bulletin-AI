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

    it('devrait afficher la pastille compteur et le popover #scFloatingSearchSuggestions (avec mini-avatar) uniquement si 0 résultat dans la classe active', async () => {
        const { SeatingChartManager } = await import('./SeatingChartManager.js');
        SeatingChartManager._isActive = false;
        document.body.innerHTML = `
            <div class="header-actions">
                <div id="headerGenWrapper"></div>
            </div>
        `;
        SeatingChartManager._injectHeaderSearch();

        // 0 résultat dans la classe courante ('boukhari' est dans class-other-group) -> compteur = 0 + popover visible
        SeatingChartManager._updateSearchCountAndSuggestions('boukhari');
        const countBadge = document.getElementById('scFloatingSearchCount');
        const suggestions = document.getElementById('scFloatingSearchSuggestions');
        expect(countBadge.textContent).toBe('0');
        expect(countBadge.classList.contains('sc-count-zero')).toBe(true);
        expect(suggestions.classList.contains('visible')).toBe(true);
        expect(suggestions.querySelector('.sc-cross-action .student-avatar')).not.toBeNull();
        expect(suggestions.querySelector('.sc-cross-action')?.dataset.studentId).toBe('s1');

        // 1 résultat dans la classe courante ('martin' est dans class-group-1) -> compteur = 1 + popover masqué
        SeatingChartManager._updateSearchCountAndSuggestions('martin');
        expect(countBadge.textContent).toBe('1');
        expect(countBadge.classList.contains('sc-count-zero')).toBe(false);
        expect(suggestions.classList.contains('visible')).toBe(false);
    });

    it('devrait débouncer proprement scheduleSearch et annuler les appels précédents', () => {
        vi.useFakeTimers();
        CrossClassSearchManager.reset();

        const filterSpy = vi.fn();
        CrossClassSearchManager.scheduleSearch('b', filterSpy, 100);
        CrossClassSearchManager.scheduleSearch('bo', filterSpy, 100);
        CrossClassSearchManager.scheduleSearch('boukhari', filterSpy, 100);

        expect(filterSpy).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(filterSpy).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });

    it('devrait réinitialiser toute la recherche via clearListSearch (appState.searchQuery, barre header, compteur et suggestions)', async () => {
        const { SeatingChartManager } = await import('./SeatingChartManager.js');
        SeatingChartManager._isActive = false;
        document.body.innerHTML = `
            <div class="header-actions">
                <div id="headerGenWrapper"></div>
            </div>
        `;
        SeatingChartManager._injectHeaderSearch();
        const searchWrap = document.getElementById('scFloatingSearch');
        const searchInput = document.getElementById('scFloatingSearchInput');
        searchWrap.classList.add('open', 'has-value');
        searchInput.value = 'boukhari';
        appState.searchQuery = 'boukhari';

        SeatingChartManager._updateSearchCountAndSuggestions('boukhari');
        const suggestions = document.getElementById('scFloatingSearchSuggestions');
        expect(suggestions.classList.contains('visible')).toBe(true);

        CrossClassSearchManager.clearListSearch({ renderList: false });

        expect(appState.searchQuery).toBe('');
        expect(searchInput.value).toBe('');
        expect(searchWrap.classList.contains('open')).toBe(false);
        expect(searchWrap.classList.contains('has-value')).toBe(false);
        expect(document.getElementById('scFloatingSearchCount').style.display).toBe('none');
        expect(suggestions.classList.contains('visible')).toBe(false);
        expect(suggestions.innerHTML).toBe('');
    });

    it('devrait naviguer au clavier (ArrowDown / ArrowUp) entre les suggestions inter-classes du popover', async () => {
        const { SeatingChartManager } = await import('./SeatingChartManager.js');
        SeatingChartManager._isActive = false;
        document.body.innerHTML = `
            <div class="header-actions">
                <div id="headerGenWrapper"></div>
            </div>
        `;
        SeatingChartManager._injectHeaderSearch();
        appState.generatedResults[1].studentData.classe = '3 1';
        appState.generatedResults[2].studentData.classe = '4 2';

        SeatingChartManager._updateSearchCountAndSuggestions('3 1');

        const results = document.querySelectorAll('.sc-cross-action');
        expect(results.length).toBe(2);

        results[0].focus();
        expect(document.activeElement).toBe(results[0]);

        results[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(document.activeElement).toBe(results[1]);

        results[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(results[0]);

        results[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
        expect(document.activeElement).toBe(document.getElementById('scFloatingSearchInput'));
    });

    it('devrait permettre une nouvelle recherche inter-classes après avoir cliqué sur un élève d\'une autre classe en vue Liste', async () => {
        const { SeatingChartManager } = await import('./SeatingChartManager.js');
        const { ClassUIManager } = await import('./ClassUIManager.js');
        SeatingChartManager._isActive = false;
        document.body.innerHTML = `
            <div class="header-actions">
                <div id="headerGenWrapper"></div>
            </div>
        `;
        SeatingChartManager._injectHeaderSearch();
        appState.searchQuery = 'boukhari';
        vi.spyOn(ClassManager, 'getClassById').mockImplementation(id => {
            if (id === 'class-other-group') return { id: 'class-other-group', name: 'Groupe Techno G2' };
            if (id === 'class-group-1') return { id: 'class-group-1', name: 'Groupe Techno G1' };
            return null;
        });

        SeatingChartManager._updateSearchCountAndSuggestions('boukhari');
        const suggestions = document.getElementById('scFloatingSearchSuggestions');
        expect(suggestions.classList.contains('visible')).toBe(true);

        const switchSpy = vi.spyOn(ClassUIManager, 'handleClassSwitch').mockImplementation(async (targetClassId) => {
            appState.currentClassId = targetClassId;
            CrossClassSearchManager.clearListSearch({ renderList: false });
        });

        const firstResult = suggestions.querySelector('.sc-cross-action');
        firstResult.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(switchSpy).toHaveBeenCalledWith('class-other-group', 's1');
        expect(appState.currentClassId).toBe('class-other-group');
        expect(suggestions.classList.contains('visible')).toBe(false);

        // Nouvelle recherche depuis la nouvelle classe vers un élève de l'ancienne classe (Martin dans class-group-1)
        SeatingChartManager._updateSearchCountAndSuggestions('martin');

        expect(suggestions.classList.contains('visible')).toBe(true);
        expect(suggestions.querySelector('.sc-cross-action')?.dataset.studentId).toBe('s3');

        switchSpy.mockRestore();
    });

    it('devrait surligner la correspondance, afficher le badge de classe d\'origine uniquement en groupe et gérer clic extérieur / focus / refreshStudents', async () => {
        const { SeatingChartManager } = await import('./SeatingChartManager.js');
        SeatingChartManager._isActive = false;
        SeatingChartManager._globalListenersInitialized = false;
        document.body.innerHTML = `
            <div class="header-actions">
                <div id="viewToggle"><button class="view-toggle-btn" data-view="plan">Plan</button></div>
                <div id="headerGenWrapper"></div>
            </div>
            <div id="seatingChartView"></div>
            <div id="outsideArea"></div>
        `;
        SeatingChartManager._injectHeaderSearch();
        SeatingChartManager._setupEventListeners();

        vi.spyOn(ClassManager, 'getClassById').mockImplementation(id => {
            if (id === 'class-other-group') return { id: 'class-other-group', name: 'Groupe Techno G2' };
            if (id === 'class-3e2') return { id: 'class-3e2', name: '3e2' };
            return null;
        });
        vi.spyOn(SeatingChartManager, '_getCurrentClassStudents').mockImplementation(() =>
            appState.generatedResults.filter(s => s.classId === appState.currentClassId)
        );

        // Élève s1 est dans 'Groupe Techno G2' avec originClass '3e1' (différent -> badge affiché)
        SeatingChartManager._openSearch();
        const searchInput = document.getElementById('scFloatingSearchInput');
        searchInput.value = 'bouk';
        SeatingChartManager._handleSearchInput('bouk', { immediate: true });

        const suggestions = document.getElementById('scFloatingSearchSuggestions');
        expect(suggestions.classList.contains('visible')).toBe(true);
        expect(suggestions.querySelector('.search-highlight')?.textContent).toBe('BOUK');
        expect(suggestions.querySelector('.student-origin-class-tag')?.textContent).toBe('3ᵉ1');

        // Clic sur #viewToggle ne doit PAS fermer le popover
        document.querySelector('#viewToggle .view-toggle-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(suggestions.classList.contains('visible')).toBe(true);

        // Clic extérieur : retire .visible et masque le popover sans fermer la recherche (car input non vide)
        document.getElementById('outsideArea').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(suggestions.classList.contains('visible')).toBe(false);
        expect(suggestions.style.display).toBe('none');
        expect(SeatingChartManager._isSearchOpen()).toBe(true);

        // Re-focus sur l'input : ré-affiche le popover si toujours 0 match dans la classe active
        searchInput.dispatchEvent(new FocusEvent('focus'));
        expect(suggestions.classList.contains('visible')).toBe(true);
        expect(suggestions.style.display).toBe('block');

        // Si s1 rejoint la classe active et refreshStudents() est appelé en vue Liste : le compteur passe à 1 et le popover se ferme
        appState.generatedResults[0].classId = 'class-group-1';
        SeatingChartManager.refreshStudents();
        expect(document.getElementById('scFloatingSearchCount').textContent).toBe('1');
        expect(suggestions.classList.contains('visible')).toBe(false);
    });
});

