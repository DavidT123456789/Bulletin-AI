import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SeatingChartManager } from '../SeatingChartManager';
import { appState, userSettings } from '../../state/State';
import { ClassManager } from '../ClassManager';
import { HistoryManager } from '../HistoryManager';
import { UI } from '../UIManager';

vi.mock('../../services/DBService.js', () => ({
    DBService: {
        open: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn().mockResolvedValue([]),
        put: vi.fn(),
        putAll: vi.fn().mockResolvedValue(true),
        clear: vi.fn()
    }
}));

function setupPlanDOM(students, gridSetup) {
    document.body.innerHTML = `
        <div class="main-content-wrapper" data-view="plan">
            <div class="main-content">
                <div class="output-section"></div>
            </div>
        </div>
    `;

    userSettings.academic.classes = [];
    userSettings.academic.currentClassId = null;
    userSettings.academic.seatingGrid = {
        rows: 2,
        cols: 3,
        locked: false,
        specialLayout: {}
    };
    appState.classes = userSettings.academic.classes;
    appState.currentClassId = null;
    appState.seatingGrid = userSettings.academic.seatingGrid;
    appState.currentPeriod = 'T1';
    appState.searchQuery = '';
    appState.activeView = 'plan';

    const cls = ClassManager.createClass('4ème A');
    cls.seatingLocked = true;
    appState.currentClassId = cls.id;
    userSettings.academic.currentClassId = cls.id;

    appState.generatedResults = students.map(s => ({ ...s, classId: cls.id }));

    SeatingChartManager._isActive = true;
    SeatingChartManager._planMode = 'course';
    SeatingChartManager._students = appState.generatedResults;
    SeatingChartManager._initGrid(2, 3);
    gridSetup(SeatingChartManager._gridState, cls);

    SeatingChartManager.init();
    SeatingChartManager._applyLockState(true, { skipSmartFit: true });
    SeatingChartManager._render();

    return cls;
}

describe('SeatingRandomPicker — Tirage au sort sur le plan', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        SeatingChartManager._closeRandomPicker({ fromHistory: true });
        HistoryManager._stack = [];
    });

    afterEach(() => {
        SeatingChartManager._closeRandomPicker({ fromHistory: true });
        SeatingChartManager._closeSearch();
        SeatingChartManager._isActive = false;
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('effectue un tirage sans remise complet sur les élèves placés actifs, puis enchaîne un nouveau tour sans répétition immédiate', () => {
        setupPlanDOM([
            { id: 's1', nom: 'DUPONT', prenom: 'Lucas', studentData: {} },
            { id: 's2', nom: 'MARTIN', prenom: 'Sophie', studentData: {} },
            { id: 's3', nom: 'BERNARD', prenom: 'Lucas', studentData: {} },
            { id: 's4', nom: 'DURAND', prenom: 'Chloé', statuses: ['Départ T1'], studentData: {} }, // Partie -> exclue
            { id: 's5', nom: 'PETIT', prenom: 'Noa', studentData: {} } // Non placé -> exclu
        ], (grid) => {
            grid[0][0] = 's1';
            grid[0][1] = 's2';
            grid[1][0] = 's3';
            grid[1][1] = 's4';
        });

        const firstRoundIds = [];
        for (let i = 1; i <= 3; i++) {
            const drawn = SeatingChartManager._drawNextRandomStudent();
            expect(drawn).not.toBeNull();
            expect(['s1', 's2', 's3']).toContain(drawn.id);
            firstRoundIds.push(drawn.id);

            vi.runAllTimers();

            expect(document.getElementById('scRandomCounter').textContent).toBe(`${i}/3`);
            expect(document.getElementById('seatingChartView').classList.contains('sc-random-active')).toBe(true);
            expect(document.getElementById('seatingChartView').classList.contains('sc-random-rolling')).toBe(false);
            expect(document.getElementById('scFloatingActions').classList.contains('random-open')).toBe(true);

            // Vérifie l'usage du libellé homonyme pour les deux Lucas
            const expectedName = drawn.id === 's1' ? 'Lucas D.' : drawn.id === 's3' ? 'Lucas B.' : 'Sophie';
            expect(document.getElementById('scRandomStudentName').textContent).toBe(expectedName);
        }

        // Sans remise : chaque élève actif placé a été tiré exactement une fois
        expect(new Set(firstRoundIds).size).toBe(3);

        // Tour suivant automatique : compteur remis à 1/3 sans répéter immédiatement le dernier élève
        const lastOfRound1 = firstRoundIds[2];
        const firstOfRound2 = SeatingChartManager._drawNextRandomStudent();
        vi.runAllTimers();
        expect(firstOfRound2.id).not.toBe(lastOfRound1);
        expect(document.getElementById('scRandomCounter').textContent).toBe('1/3');
    });

    it('orchestre le ricochet de suspense puis révèle le gagnant et supporte une interruption rapide', () => {
        setupPlanDOM([
            { id: 's1', nom: 'DUPONT', prenom: 'Lucas', studentData: {} },
            { id: 's2', nom: 'MARTIN', prenom: 'Sophie', studentData: {} },
            { id: 's3', nom: 'MOREL', prenom: 'Hugo', studentData: {} },
            { id: 's4', nom: 'ROUX', prenom: 'Chloé', studentData: {} }
        ], (grid) => {
            grid[0][0] = 's1';
            grid[0][1] = 's2';
            grid[1][0] = 's3';
            grid[1][1] = 's4';
        });

        const winner = SeatingChartManager._drawNextRandomStudent();
        const view = document.getElementById('seatingChartView');
        const randomBtn = document.getElementById('scFloatingRandomBtn');

        // Phase suspense active immédiatement (~2,5 s de sauts décélérants avant révélation)
        expect(view.classList.contains('sc-random-active')).toBe(true);
        expect(view.classList.contains('sc-random-rolling')).toBe(true);
        expect(randomBtn.classList.contains('rolling')).toBe(true);
        expect(document.getElementById('scRandomCounter').textContent).toBe('1/4');

        // À mi-parcours (~1 s) -> toujours en plein suspense
        vi.advanceTimersByTime(1000);
        expect(view.classList.contains('sc-random-rolling')).toBe(true);

        // À la fin de la séquence (~2,5 s au total) -> révélation du gagnant exact
        vi.advanceTimersByTime(1600);
        expect(view.classList.contains('sc-random-rolling')).toBe(false);
        expect(view.classList.contains('sc-random-revealed')).toBe(true);
        expect(document.getElementById('scRandomStudentName').textContent).toBe(winner.prenom);
        expect(document.querySelector(`.sc-cell.sc-spotlight-match[data-result-id="${winner.id}"]`)).not.toBeNull();

        // Pendant l'animation de mise en évidence du gagnant (~1 s) -> classe transitoire encore présente
        vi.advanceTimersByTime(500);
        expect(view.classList.contains('sc-random-revealed')).toBe(true);

        // Juste après 1 s -> nettoyage de la classe transitoire sc-random-revealed et levée de l'atténuation
        vi.advanceTimersByTime(550);
        expect(view.classList.contains('sc-random-revealed')).toBe(false);
        expect(view.classList.contains('sc-random-active')).toBe(true);

        // Interruption en plein suspense via fermeture -> aucun timer orphelin
        SeatingChartManager._drawNextRandomStudent();
        expect(view.classList.contains('sc-random-rolling')).toBe(true);
        SeatingChartManager._closeRandomPicker();
        vi.runAllTimers();
        expect(SeatingChartManager._isRandomPickerActive()).toBe(false);
        expect(view.classList.contains('sc-random-active')).toBe(false);
        expect(view.classList.contains('sc-random-rolling')).toBe(false);
    });

    it('applique le Spotlight sur la table et sur le membre ciblé dans un îlot multi-élèves', () => {
        setupPlanDOM([
            { id: 's1', nom: 'DUPONT', prenom: 'Lucas', studentData: {} },
            { id: 's2', nom: 'MARTIN', prenom: 'Sophie', studentData: {} },
            { id: 's3', nom: 'MOREAU', prenom: 'Léo', studentData: {} }
        ], (grid) => {
            grid[0][0] = ['s1', 's2'];
            grid[0][1] = 's3';
        });

        vi.spyOn(Math, 'random').mockReturnValue(0);
        const drawn = SeatingChartManager._drawNextRandomStudent();
        expect(drawn).not.toBeNull();
        vi.runAllTimers();

        const view = document.getElementById('seatingChartView');
        expect(view.classList.contains('sc-random-active')).toBe(true);
        expect(view.classList.contains('sc-search-active')).toBe(false);

        const matchCells = document.querySelectorAll('#scGridContainer .sc-cell.sc-spotlight-match.sc-spotlight-single');
        expect(matchCells.length).toBe(1);

        if (drawn.id === 's1' || drawn.id === 's2') {
            const matchedMember = matchCells[0].querySelector(`.sc-stacked-member.sc-member-match[data-result-id="${drawn.id}"]`);
            expect(matchedMember).not.toBeNull();
            expect(matchCells[0].querySelectorAll('.sc-stacked-member.sc-member-dimmed').length).toBe(1);
        }
    });

    it('refuse le tirage en mode Édition ou sans élève actif placé, et maintient l’état après refreshStudents', () => {
        const notifySpy = vi.spyOn(UI, 'showNotification').mockImplementation(() => {});
        setupPlanDOM([
            { id: 's1', nom: 'DUPONT', prenom: 'Lucas', studentData: {} },
            { id: 's2', nom: 'MARTIN', prenom: 'Sophie', studentData: {} }
        ], (grid) => {
            grid[0][0] = 's1';
            grid[0][1] = 's2';
        });

        // Verrou retiré -> aucun tirage possible
        SeatingChartManager._applyLockState(false, { skipSmartFit: true });
        expect(SeatingChartManager._drawNextRandomStudent()).toBeNull();
        expect(SeatingChartManager._isRandomPickerActive()).toBe(false);

        // Retour en Consultation -> tirage actif
        SeatingChartManager._applyLockState(true, { skipSmartFit: true });
        const drawn = SeatingChartManager._drawNextRandomStudent();
        expect(drawn).not.toBeNull();
        vi.runAllTimers();

        // Mise à jour d'un élève (ex: via FocusPanel) -> Spotlight préservé après re-rendu
        SeatingChartManager.refreshStudents();
        expect(SeatingChartManager._isRandomPickerActive()).toBe(true);
        expect(document.getElementById('seatingChartView').classList.contains('sc-random-active')).toBe(true);
        expect(document.querySelectorAll('#scGridContainer .sc-cell.sc-spotlight-match').length).toBe(1);

        // Classe vidée d'élèves actifs placés -> fermeture propre et notification
        SeatingChartManager._gridState[0][0] = null;
        SeatingChartManager._gridState[0][1] = null;
        expect(SeatingChartManager._drawNextRandomStudent()).toBeNull();
        expect(SeatingChartManager._isRandomPickerActive()).toBe(false);
        expect(notifySpy).toHaveBeenCalled();
    });

    it('se ferme proprement lors des transitions (déverrouillage, changement de mode/classe/vue, recherche, Échap) et gère Espace', () => {
        const cls1 = setupPlanDOM([
            { id: 's1', nom: 'DUPONT', prenom: 'Lucas', studentData: {} },
            { id: 's2', nom: 'MARTIN', prenom: 'Sophie', studentData: {} }
        ], (grid) => {
            grid[0][0] = 's1';
            grid[0][1] = 's2';
        });

        // 1. Démarrage et enchaînement via touche Espace
        const first = SeatingChartManager._drawNextRandomStudent();
        vi.runAllTimers();
        expect(SeatingChartManager._isRandomPickerActive()).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        vi.runAllTimers();
        expect(document.getElementById('scRandomCounter').textContent).toBe('2/2');
        expect(SeatingChartManager._randomPickerState.currentStudentId).not.toBe(first.id);

        // 2. Espace ne double-tire pas si le focus est sur un bouton de contrôle
        const closeBtn = document.getElementById('scFloatingRandomCloseBtn');
        closeBtn.focus();
        const beforeFocusSpace = SeatingChartManager._randomPickerState.currentStudentId;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(SeatingChartManager._randomPickerState.currentStudentId).toBe(beforeFocusSpace);

        // 3. Touche Échap ferme le tirage et nettoie le DOM
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(SeatingChartManager._isRandomPickerActive()).toBe(false);
        expect(document.getElementById('seatingChartView').classList.contains('sc-random-active')).toBe(false);
        expect(document.getElementById('scRandomStudentName').textContent).toBe('');

        // 4. Exclusion mutuelle avec la recherche + transitions de mode / verrou
        SeatingChartManager._drawNextRandomStudent();
        SeatingChartManager._openSearch();
        expect(SeatingChartManager._isRandomPickerActive()).toBe(false);
        SeatingChartManager._closeSearch();

        SeatingChartManager._drawNextRandomStudent();
        SeatingChartManager.switchPlanMode('activity', { animate: false });
        expect(SeatingChartManager._isRandomPickerActive()).toBe(false);

        appState.currentClassId = cls1.id;
        userSettings.academic.currentClassId = cls1.id;
        SeatingChartManager.switchPlanMode('course', { animate: false });
        SeatingChartManager._applyLockState(true, { skipSmartFit: true });
        SeatingChartManager._drawNextRandomStudent();
        expect(SeatingChartManager._isRandomPickerActive()).toBe(true);

        SeatingChartManager._applyLockState(false, { skipSmartFit: true });
        expect(SeatingChartManager._isRandomPickerActive()).toBe(false);
    });

    it('permet de revenir sur un élève précédent au clavier (← / →) sans quitter la vue Plan ni casser la suite du tirage', () => {
        setupPlanDOM([
            { id: 's1', nom: 'DUPONT', prenom: 'Clara', studentData: {} },
            { id: 's2', nom: 'MARTIN', prenom: 'Léo', studentData: {} },
            { id: 's3', nom: 'BERNARD', prenom: 'Maël', studentData: {} },
            { id: 's4', nom: 'DURAND', prenom: 'Inès', studentData: {} }
        ], (grid) => {
            grid[0][0] = 's1';
            grid[0][1] = 's2';
            grid[0][2] = 's3';
            grid[1][0] = 's4';
        });

        const readout = document.getElementById('scRandomReadout');
        const nameEl = document.getElementById('scRandomStudentName');
        const counterEl = document.getElementById('scRandomCounter');
        const switchToViewSpy = vi.spyOn(SeatingChartManager, 'switchToView');

        // 1er tirage : readout statique (pas encore d'historique)
        const first = SeatingChartManager._drawNextRandomStudent({ animate: false });
        expect(readout.classList.contains('is-static')).toBe(true);
        expect(readout.getAttribute('aria-disabled')).toBe('true');
        expect(SeatingChartManager._openRandomHistoryPopover()).toBe(false);
        expect(counterEl.textContent).toBe('1/4');

        // 2e et 3e tirages : readout interactif
        const second = SeatingChartManager._drawNextRandomStudent({ animate: false });
        const third = SeatingChartManager._drawNextRandomStudent({ animate: false });
        expect(readout.classList.contains('is-static')).toBe(false);
        expect(readout.getAttribute('aria-disabled')).toBe('false');
        expect(counterEl.textContent).toBe('3/4');

        // Flèche Gauche -> revient sur le 2e puis sur le 1er
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(SeatingChartManager._randomPickerState.currentStudentId).toBe(second.id);
        expect(nameEl.textContent).toBe(second.prenom);
        expect(counterEl.textContent).toBe('2/4');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(SeatingChartManager._randomPickerState.currentStudentId).toBe(first.id);
        expect(counterEl.textContent).toBe('1/4');

        // Borne basse : un ArrowLeft supplémentaire ne quitte PAS la vue Plan
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(SeatingChartManager._randomPickerState.currentStudentId).toBe(first.id);
        expect(SeatingChartManager._isActive).toBe(true);
        expect(switchToViewSpy).not.toHaveBeenCalled();

        // Flèche Droite -> ré-avance sur le 2e
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(SeatingChartManager._randomPickerState.currentStudentId).toBe(second.id);
        expect(counterEl.textContent).toBe('2/4');

        // Nouveau tirage (Espace) depuis un élève antérieur -> tire le 4e élève inédit et revient en tête
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        vi.runAllTimers();
        const fourthId = SeatingChartManager._randomPickerState.currentStudentId;
        expect([first.id, second.id, third.id]).not.toContain(fourthId);
        expect(SeatingChartManager._randomPickerState.drawnIds).toEqual([first.id, second.id, third.id, fourthId]);
        expect(SeatingChartManager._randomPickerState.currentIndex).toBe(3);
        expect(counterEl.textContent).toBe('4/4');
    });

    it('ouvre la liste des élèves tirés au clic sur la capsule, permet d’en re-sélectionner un et gère Échap en 2 temps', () => {
        setupPlanDOM([
            { id: 's1', nom: 'DUPONT', prenom: 'Clara', studentData: {} },
            { id: 's2', nom: 'MARTIN', prenom: 'Léo', studentData: {} },
            { id: 's3', nom: 'BERNARD', prenom: 'Maël', studentData: {} }
        ], (grid) => {
            grid[0][0] = 's1';
            grid[0][1] = 's2';
            grid[0][2] = 's3';
        });

        const first = SeatingChartManager._drawNextRandomStudent({ animate: false });
        const second = SeatingChartManager._drawNextRandomStudent({ animate: false });
        const third = SeatingChartManager._drawNextRandomStudent({ animate: false });

        const readout = document.getElementById('scRandomReadout');
        const popover = document.getElementById('scRandomHistoryPopover');

        // Ouverture par clic sur le readout
        readout.click();
        expect(SeatingChartManager._randomHistoryPopoverOpen).toBe(true);
        expect(popover.classList.contains('open')).toBe(true);
        expect(readout.getAttribute('aria-expanded')).toBe('true');

        // Liste ordonnée du plus récent (#3) au plus ancien (#1)
        const items = [...popover.querySelectorAll('.sc-random-history-item')];
        expect(items.length).toBe(3);
        expect(items[0].querySelector('.sc-random-history-rank').textContent).toBe('#3');
        expect(items[0].querySelector('.sc-random-history-name').textContent).toBe(third.prenom);
        expect(items[0].classList.contains('active')).toBe(true);
        expect(items[2].querySelector('.sc-random-history-rank').textContent).toBe('#1');
        expect(items[2].querySelector('.sc-random-history-name').textContent).toBe(first.prenom);

        // Clic sur #1 -> revient sur le 1er élève et ferme le popover
        items[2].click();
        expect(SeatingChartManager._randomPickerState.currentStudentId).toBe(first.id);
        expect(SeatingChartManager._randomPickerState.currentIndex).toBe(0);
        expect(document.getElementById('scRandomCounter').textContent).toBe('1/3');
        expect(SeatingChartManager._randomHistoryPopoverOpen).toBe(false);
        expect(popover.classList.contains('open')).toBe(false);

        // Ré-ouverture puis 1er Échap -> ferme uniquement le popover (tirage reste actif)
        readout.click();
        expect(SeatingChartManager._randomHistoryPopoverOpen).toBe(true);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(SeatingChartManager._randomHistoryPopoverOpen).toBe(false);
        expect(SeatingChartManager._isRandomPickerActive()).toBe(true);

        // Ré-ouverture puis refresh retirant un autre élève -> conserve l'indice et met à jour la liste
        SeatingChartManager._selectRandomHistoryIndex(1);
        expect(SeatingChartManager._randomPickerState.currentStudentId).toBe(second.id);
        readout.click();
        appState.generatedResults = appState.generatedResults.filter(s => s.id !== first.id);
        SeatingChartManager.refreshStudents();
        expect(SeatingChartManager._randomPickerState.currentStudentId).toBe(second.id);
        expect(SeatingChartManager._randomPickerState.currentIndex).toBe(0);
        expect(popover.querySelectorAll('.sc-random-history-item').length).toBe(2);

        // 2e séquence Échap -> ferme popover puis ferme le tirage et vide le DOM du popover
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(SeatingChartManager._randomHistoryPopoverOpen).toBe(false);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(SeatingChartManager._isRandomPickerActive()).toBe(false);
        expect(popover.innerHTML).toBe('');
    });

    it('bascule l’icône du dé en nouveau tour (↻) en fin de tour complet uniquement après révélation et jamais pour 1 seul élève', () => {
        setupPlanDOM([
            { id: 's1', nom: 'DUPONT', prenom: 'Clara', studentData: {} },
            { id: 's2', nom: 'MARTIN', prenom: 'Léo', studentData: {} }
        ], (grid) => {
            grid[0][0] = 's1';
            grid[0][1] = 's2';
        });

        const randomBtn = document.getElementById('scFloatingRandomBtn');
        const iconEl = randomBtn.querySelector('iconify-icon');

        // 1/2 -> icône dé classique
        SeatingChartManager._drawNextRandomStudent({ animate: false });
        expect(iconEl.getAttribute('icon')).toBe('solar:dice-linear');
        expect(randomBtn.classList.contains('round-complete')).toBe(false);

        // 2/2 en cours de suspense -> garde l'icône dé pendant le roulement
        SeatingChartManager._drawNextRandomStudent({ animate: true });
        expect(document.getElementById('seatingChartView').classList.contains('sc-random-rolling')).toBe(true);
        expect(iconEl.getAttribute('icon')).toBe('solar:dice-linear');
        expect(randomBtn.classList.contains('round-complete')).toBe(false);

        // 2/2 révélé -> bascule sur ↻ + tooltip Tour complet
        vi.runAllTimers();
        expect(iconEl.getAttribute('icon')).toBe('solar:restart-linear');
        expect(randomBtn.classList.contains('round-complete')).toBe(true);
        expect(randomBtn.getAttribute('data-tooltip')).toBe('Tour complet · Nouveau tour (Espace)');

        // Recul dans l'historique (1/2) -> la pioche reste vide, icône ↻ conservée
        SeatingChartManager._stepRandomHistory(-1);
        expect(iconEl.getAttribute('icon')).toBe('solar:restart-linear');

        // Lancement du nouveau tour (1/2 du tour 2) -> retour à l'icône dé
        SeatingChartManager._drawNextRandomStudent({ animate: false });
        expect(document.getElementById('scRandomCounter').textContent).toBe('1/2');
        expect(iconEl.getAttribute('icon')).toBe('solar:dice-linear');
        expect(randomBtn.classList.contains('round-complete')).toBe(false);

        // Fermeture -> retour à l'état repos
        SeatingChartManager._drawNextRandomStudent({ animate: false });
        expect(iconEl.getAttribute('icon')).toBe('solar:restart-linear');
        SeatingChartManager._closeRandomPicker();
        expect(iconEl.getAttribute('icon')).toBe('solar:dice-linear');
        expect(randomBtn.classList.contains('round-complete')).toBe(false);
        expect(randomBtn.getAttribute('data-tooltip')).toBe('Tirer un élève au sort');

        // Garde 1 seul élève (1/1) -> jamais en mode Nouveau tour
        setupPlanDOM([
            { id: 'only', nom: 'UNIQUE', prenom: 'Sam', studentData: {} }
        ], (grid) => {
            grid[0][0] = 'only';
        });
        const soloBtn = document.getElementById('scFloatingRandomBtn');
        const soloIcon = soloBtn.querySelector('iconify-icon');
        SeatingChartManager._drawNextRandomStudent({ animate: false });
        expect(soloIcon.getAttribute('icon')).toBe('solar:dice-linear');
        expect(soloBtn.classList.contains('round-complete')).toBe(false);
    });
});
