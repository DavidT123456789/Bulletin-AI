import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SeatingChartManager } from './SeatingChartManager';
import { appState, userSettings } from '../state/State';
import { ClassManager } from './ClassManager';
import { HistoryManager } from './HistoryManager';
import { FocusPanelManager } from './FocusPanelManager';
import { ClassUIManager } from './ClassUIManager';
import { CrossClassSearchManager } from './CrossClassSearchManager';
import { TooltipsUI } from './TooltipsManager';
import { UI } from './UIManager';

vi.mock('../services/DBService.js', () => ({
    DBService: {
        open: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn().mockResolvedValue([]),
        put: vi.fn(),
        putAll: vi.fn().mockResolvedValue(true),
        clear: vi.fn()
    }
}));

describe('SeatingChartManager - Scope des places spéciales (Salle vs Classe)', () => {
    let classA, classB;

    beforeEach(() => {
        // Reset state
        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        userSettings.academic.seatingGrid = {
            rows: 5,
            cols: 6,
            locked: false,
            specialLayout: {}
        };
        appState.classes = userSettings.academic.classes;
        appState.currentClassId = null;
        appState.seatingGrid = userSettings.academic.seatingGrid;
        appState.generatedResults = [];

        // Create 2 distinct classes
        classA = ClassManager.createClass('6ème A');
        classB = ClassManager.createClass('5ème B');

        // Set active class to classA
        appState.currentClassId = classA.id;
        userSettings.academic.currentClassId = classA.id;
    });

    it('devrait définir une Allée au niveau global (toutes les classes / salle)', () => {
        SeatingChartManager._setCellSpecialType(0, 0, 'aisle');

        // Vérification dans la classe A
        const specialA = SeatingChartManager._getCellSpecial(0, 0);
        expect(specialA).toEqual({ type: 'aisle', scope: 'global' });
        expect(appState.seatingGrid.specialLayout['0,0']).toBe('aisle');
        expect(classA.seatingSpecialLayout?.['0,0']).toBeUndefined();

        // Bascule vers classe B : l'allée doit toujours être présente
        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;

        const specialB = SeatingChartManager._getCellSpecial(0, 0);
        expect(specialB).toEqual({ type: 'aisle', scope: 'global' });
    });

    it('devrait définir une place AESH au niveau de la classe active uniquement', () => {
        SeatingChartManager._setCellSpecialType(0, 1, 'aesh');

        // Présent dans classe A
        const specialA = SeatingChartManager._getCellSpecial(0, 1);
        expect(specialA).toEqual({ type: 'aesh', scope: 'class' });
        expect(classA.seatingSpecialLayout['0,1']).toBe('aesh');
        expect(appState.seatingGrid.specialLayout['0,1']).toBeUndefined();

        // Bascule vers classe B : la place doit être LIBRE
        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;

        const specialB = SeatingChartManager._getCellSpecial(0, 1);
        expect(specialB).toBeNull();
    });

    it('devrait condamner une place au niveau de la classe active par défaut', () => {
        SeatingChartManager._setCellSpecialType(1, 2, 'blocked');

        // Présent dans classe A
        const specialA = SeatingChartManager._getCellSpecial(1, 2);
        expect(specialA).toEqual({ type: 'blocked', scope: 'class' });
        expect(classA.seatingSpecialLayout['1,2']).toBe('blocked');
        expect(appState.seatingGrid.specialLayout['1,2']).toBeUndefined();

        // Bascule vers classe B : la place doit être disponible
        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;

        expect(SeatingChartManager._getCellSpecial(1, 2)).toBeNull();
        expect(SeatingChartManager._isSpecialSpot(1, 2)).toBe(false);
    });

    it('devrait permettre de basculer une place condamnée de classe vers toute la salle (global)', () => {
        // Condamnation initiale pour classe A
        SeatingChartManager._setCellSpecialType(1, 2, 'blocked');
        expect(classA.seatingSpecialLayout['1,2']).toBe('blocked');

        // Bascule de portée en 1 clic
        SeatingChartManager._toggleBlockedScope(1, 2);

        // Doit maintenant être globale
        expect(classA.seatingSpecialLayout['1,2']).toBeUndefined();
        expect(appState.seatingGrid.specialLayout['1,2']).toBe('blocked');

        const specialA = SeatingChartManager._getCellSpecial(1, 2);
        expect(specialA).toEqual({ type: 'blocked', scope: 'global' });

        // Vérification dans classe B : la place est maintenant aussi condamnée dans classe B
        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;

        const specialB = SeatingChartManager._getCellSpecial(1, 2);
        expect(specialB).toEqual({ type: 'blocked', scope: 'global' });
    });

    it('devrait permettre de restreindre une place globale à la classe en cours', () => {
        // Place globale initiale
        appState.seatingGrid.specialLayout['2,3'] = 'blocked';

        SeatingChartManager._toggleBlockedScope(2, 3);

        expect(appState.seatingGrid.specialLayout['2,3']).toBeUndefined();
        expect(classA.seatingSpecialLayout['2,3']).toBe('blocked');

        // Vérification dans classe B : la place est désormais libre
        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;

        expect(SeatingChartManager._getCellSpecial(2, 3)).toBeNull();
    });

    it('devrait rétablir (libérer) une place condamnée quel que soit son scope', () => {
        // Rétablissement d'une place classe
        SeatingChartManager._setCellSpecialType(1, 1, 'blocked');
        expect(SeatingChartManager._isSpecialSpot(1, 1)).toBe(true);

        SeatingChartManager._setCellSpecialType(1, 1, null);
        expect(SeatingChartManager._isSpecialSpot(1, 1)).toBe(false);
        expect(classA.seatingSpecialLayout['1,1']).toBeUndefined();

        // Rétablissement d'une place globale
        appState.seatingGrid.specialLayout['0,0'] = 'aisle';
        SeatingChartManager._setCellSpecialType(0, 0, null);
        expect(SeatingChartManager._isSpecialSpot(0, 0)).toBe(false);
        expect(appState.seatingGrid.specialLayout['0,0']).toBeUndefined();
    });

    it('devrait capturer et restaurer les deux niveaux de layout via Undo / Redo', () => {
        SeatingChartManager._initGrid(5, 6);
        SeatingChartManager._undoStack = [];
        SeatingChartManager._redoStack = [];

        // État 1 : Allée en 0,0 et Condamné classe en 1,2
        SeatingChartManager._setCellSpecialType(0, 0, 'aisle');
        SeatingChartManager._setCellSpecialType(1, 2, 'blocked');

        expect(SeatingChartManager._getCellSpecial(1, 2)).toEqual({ type: 'blocked', scope: 'class' });

        // Action : Rétablir 1,2
        SeatingChartManager._setCellSpecialType(1, 2, null);
        expect(SeatingChartManager._getCellSpecial(1, 2)).toBeNull();

        // Undo : 1,2 doit réapparaître
        SeatingChartManager._undo();
        expect(SeatingChartManager._getCellSpecial(1, 2)).toEqual({ type: 'blocked', scope: 'class' });

        // Redo : 1,2 redevient vide
        SeatingChartManager._redo();
        expect(SeatingChartManager._getCellSpecial(1, 2)).toBeNull();
    });

    it('devrait considérer une place condamnée par classe comme cible de drop invalide pour cette classe uniquement', () => {
        SeatingChartManager._isLocked = false;
        SeatingChartManager._initGrid(5, 6);

        SeatingChartManager._setCellSpecialType(2, 2, 'blocked');

        // Invalide dans classe A
        expect(SeatingChartManager._isValidDropTarget(2, 2)).toBe(false);

        // Valide dans classe B
        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;

        expect(SeatingChartManager._isValidDropTarget(2, 2)).toBe(true);
    });
});

describe('SeatingChartManager - Ordre de placement (A-Z, Z-A, Hasard) et Tri Sidebar', () => {
    let classTest;

    beforeEach(() => {
        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        userSettings.academic.seatingGrid = {
            rows: 3,
            cols: 3,
            locked: false,
            specialLayout: {}
        };
        appState.classes = userSettings.academic.classes;
        appState.seatingGrid = userSettings.academic.seatingGrid;

        classTest = ClassManager.createClass('4ème C');
        appState.currentClassId = classTest.id;
        userSettings.academic.currentClassId = classTest.id;

        appState.generatedResults = [
            { id: 's1', classId: classTest.id, nom: 'Dupont', prenom: 'Alice', seatingPosition: null },
            { id: 's2', classId: classTest.id, nom: 'Martin', prenom: 'Benoit', seatingPosition: null },
            { id: 's3', classId: classTest.id, nom: 'Bernard', prenom: 'Chloe', seatingPosition: null },
            { id: 's4', classId: classTest.id, nom: 'Zidane', prenom: 'David', seatingPosition: null }
        ];

        SeatingChartManager._isLocked = false;
        SeatingChartManager._undoStack = [];
        SeatingChartManager._redoStack = [];
        SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
        SeatingChartManager._initGrid(3, 3);
    });

    it('devrait placer les élèves dans l\'ordre alphabétique A-Z par défaut', () => {
        SeatingChartManager._autoPlace('alpha-asc');

        const placedIds = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                if (SeatingChartManager._gridState[r][c]) {
                    placedIds.push(SeatingChartManager._gridState[r][c]);
                }
            }
        }

        // 4 élèves placés
        expect(placedIds.length).toBe(4);
        // Ordre alphabétique croissant : Bernard (s3), Dupont (s1), Martin (s2), Zidane (s4)
        expect(placedIds).toEqual(['s3', 's1', 's2', 's4']);
    });

    it('devrait placer les élèves dans l\'ordre alphabétique inversé Z-A', () => {
        SeatingChartManager._autoPlace('alpha-desc');

        const placedIds = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                if (SeatingChartManager._gridState[r][c]) {
                    placedIds.push(SeatingChartManager._gridState[r][c]);
                }
            }
        }

        expect(placedIds.length).toBe(4);
        // Ordre alphabétique décroissant : Zidane (s4), Martin (s2), Dupont (s1), Bernard (s3)
        expect(placedIds).toEqual(['s4', 's2', 's1', 's3']);
    });

    it('devrait placer tous les élèves au hasard en mode random', () => {
        SeatingChartManager._autoPlace('random');

        const placedIds = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                if (SeatingChartManager._gridState[r][c]) {
                    placedIds.push(SeatingChartManager._gridState[r][c]);
                }
            }
        }

        expect(placedIds.length).toBe(4);
        expect(new Set(placedIds)).toEqual(new Set(['s1', 's2', 's3', 's4']));
    });

    it('devrait utiliser _shuffle sur une grille vide pour faire un placement aléatoire', () => {
        // Grille initialement vide
        expect(SeatingChartManager._getPlacedIds().size).toBe(0);

        SeatingChartManager._shuffle();

        // Après shuffle sur grille vide, les 4 élèves doivent être placés
        expect(SeatingChartManager._getPlacedIds().size).toBe(4);
    });

    it('devrait préserver strictement la place d\'un élève épinglé lors de la réorganisation (A-Z, Z-A, shuffle)', () => {
        // Place initialement tous les élèves
        SeatingChartManager._autoPlace('alpha-asc');

        // On épingle l'élève s1 (Dupont Alice) à sa place actuelle
        const student1 = appState.generatedResults.find(s => s.id === 's1');
        student1.seatingPosition = { ...student1.seatingPosition, pinned: true };

        // Trouver la position de s1
        let s1Row = -1, s1Col = -1;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                if (SeatingChartManager._gridState[r][c] === 's1') {
                    s1Row = r;
                    s1Col = c;
                }
            }
        }
        expect(s1Row).toBeGreaterThanOrEqual(0);

        // Réorganisation en Z-A : s1 DOIT rester exactement à (s1Row, s1Col)
        SeatingChartManager._autoPlace('alpha-desc');
        expect(SeatingChartManager._gridState[s1Row][s1Col]).toBe('s1');

        // Réorganisation aléatoire : s1 DOIT toujours rester à (s1Row, s1Col)
        SeatingChartManager._autoPlace('random');
        expect(SeatingChartManager._gridState[s1Row][s1Col]).toBe('s1');

        // Shuffle : s1 DOIT toujours rester à (s1Row, s1Col)
        SeatingChartManager._shuffle();
        expect(SeatingChartManager._gridState[s1Row][s1Col]).toBe('s1');
    });

    it('devrait préserver un élève épinglé sur une grille partiellement remplie lors du placement automatique', () => {
        // Épingle un élève s2 à la case (0, 0)
        const student2 = appState.generatedResults.find(s => s.id === 's2');
        student2.seatingPosition = { row: 0, col: 0, pinned: true };
        SeatingChartManager._gridState[0][0] = 's2';

        // Placer les autres élèves non placés
        SeatingChartManager._autoPlace('alpha-asc');

        // s2 est toujours en (0, 0)
        expect(SeatingChartManager._gridState[0][0]).toBe('s2');
        // Tous les 4 élèves sont maintenant placés
        expect(SeatingChartManager._getPlacedIds().size).toBe(4);
    });

    it('devrait disperser les élèves dans toute la salle en mode random-disperse tout en protégeant les épinglés', () => {
        // Épingle s3 à (1, 1)
        const student3 = appState.generatedResults.find(s => s.id === 's3');
        student3.seatingPosition = { row: 1, col: 1, pinned: true };
        SeatingChartManager._gridState[1][1] = 's3';

        SeatingChartManager._autoPlace('random-disperse');

        // s3 est toujours en (1, 1)
        expect(SeatingChartManager._gridState[1][1]).toBe('s3');
        // Les 4 élèves sont placés
        expect(SeatingChartManager._getPlacedIds().size).toBe(4);

        // Vérifier que tous les 4 identifiants uniques sont bien sur la grille
        const placedIds = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                if (SeatingChartManager._gridState[r][c]) {
                    placedIds.push(SeatingChartManager._gridState[r][c]);
                }
            }
        }
        expect(new Set(placedIds)).toEqual(new Set(['s1', 's2', 's3', 's4']));
    });
});

describe('SeatingChartManager - Orientation (Vue Enseignant ⇄ Vue Élèves / Projection)', () => {
    let classA;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="seatingChartView">
                <div id="scClassroomBoard" class="sc-classroom-board">
                    <div id="scGridContainer" class="sc-grid-container"></div>
                    <div class="sc-desk-row">
                        <div id="scDesk" class="sc-desk"><span>Tableau</span></div>
                    </div>
                </div>
                <div id="scSidebarTitle"></div>
                <div id="scFooterInfo"></div>
                <button id="scOrientationBtn" class="sc-orientation-btn"><iconify-icon></iconify-icon></button>
                <button id="scFloatingOrientationBtn" class="sc-orientation-btn"><iconify-icon></iconify-icon></button>
            </div>
        `;

        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        userSettings.academic.seatingGrid = {
            rows: 3,
            cols: 3,
            locked: false,
            orientation: 'teacher',
            specialLayout: {}
        };
        appState.classes = userSettings.academic.classes;
        appState.currentClassId = null;
        appState.seatingGrid = userSettings.academic.seatingGrid;
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: 'c1' },
            { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: 'c1' }
        ];

        classA = ClassManager.createClass('6ème A');
        classA.id = 'c1';
        appState.currentClassId = 'c1';
        userSettings.academic.currentClassId = 'c1';

        SeatingChartManager._students = appState.generatedResults;
        SeatingChartManager._initGrid(3, 3);
        SeatingChartManager._orientation = 'teacher';
    });

    it('devrait basculer de la vue Enseignant vers la vue Élèves et inversement', () => {
        expect(SeatingChartManager._orientation).toBe('teacher');
        expect(document.getElementById('scDesk').textContent).toContain('Tableau');
        expect(document.getElementById('scOrientationBtn').classList.contains('active')).toBe(false);

        SeatingChartManager._toggleOrientation();
        expect(SeatingChartManager._orientation).toBe('student');
        expect(document.getElementById('seatingChartView').dataset.orientation).toBe('student');
        expect(localStorage.getItem('bulletin_seating_orientation')).toBe('student');
        expect(document.getElementById('scDesk').textContent).toContain('Tableau');
        expect(document.getElementById('scDesk').textContent).not.toContain('Vue élèves');
        expect(document.getElementById('scOrientationBtn').classList.contains('active')).toBe(true);
        expect(document.getElementById('scOrientationBtn').querySelector('iconify-icon').getAttribute('icon')).toBe('solar:users-group-rounded-linear');
        expect(document.getElementById('scFooterInfo').innerHTML).not.toContain('Vue Élèves');

        SeatingChartManager._toggleOrientation();
        expect(SeatingChartManager._orientation).toBe('teacher');
        expect(document.getElementById('seatingChartView').dataset.orientation).toBe('teacher');
        expect(localStorage.getItem('bulletin_seating_orientation')).toBe('teacher');
        expect(document.getElementById('scDesk').textContent).toBe('Tableau');
        expect(document.getElementById('scOrientationBtn').classList.contains('active')).toBe(false);
        expect(document.getElementById('scOrientationBtn').querySelector('iconify-icon').getAttribute('icon')).toBe('solar:users-group-rounded-linear');
    });

    it('devrait ordonner les cellules de la grille en miroir 180° en vue Élèves', () => {
        // En vue teacher :
        SeatingChartManager._applyOrientation('teacher');
        let cells = document.querySelectorAll('#scGridContainer .sc-cell');
        expect(cells[0].dataset.row).toBe('0');
        expect(cells[0].dataset.col).toBe('0');
        expect(cells[cells.length - 1].dataset.row).toBe('2');
        expect(cells[cells.length - 1].dataset.col).toBe('2');

        // En vue student : la première cellule affichée est le premier rang face au tableau (row=2, col=2)
        SeatingChartManager._applyOrientation('student');
        cells = document.querySelectorAll('#scGridContainer .sc-cell');
        expect(cells[0].dataset.row).toBe('2');
        expect(cells[0].dataset.col).toBe('2');
        expect(cells[cells.length - 1].dataset.row).toBe('0');
        expect(cells[cells.length - 1].dataset.col).toBe('0');
    });

    it('devrait restaurer l\'orientation depuis localStorage ou la configuration sauvegardée', () => {
        localStorage.setItem('bulletin_seating_orientation', 'student');
        SeatingChartManager._loadGridConfig();
        expect(SeatingChartManager._orientation).toBe('student');
        expect(document.getElementById('seatingChartView').dataset.orientation).toBe('student');

        localStorage.removeItem('bulletin_seating_orientation');
        appState.seatingGrid.orientation = 'student';
        SeatingChartManager._loadGridConfig();
        expect(SeatingChartManager._orientation).toBe('student');
    });

    it('devrait basculer l\'orientation au clic et au clavier sur le Tableau (scDesk)', () => {
        SeatingChartManager._setupEventListeners();

        expect(SeatingChartManager._orientation).toBe('teacher');
        const desk = document.getElementById('scDesk');

        // Clic sur le tableau
        desk.click();
        expect(SeatingChartManager._orientation).toBe('student');
        expect(desk.getAttribute('data-tooltip')).toBe('Vue Élèves active • Inverser');
        expect(desk.getAttribute('aria-label')).toBe('Vue Élèves active (cliquer pour inverser la vue)');

        // Touche Entrée sur le tableau
        desk.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(SeatingChartManager._orientation).toBe('teacher');
        expect(desk.getAttribute('data-tooltip')).toBe('Vue Prof active • Inverser');
        expect(desk.getAttribute('aria-label')).toBe('Vue Prof active (cliquer pour inverser la vue)');

        // Touche Espace sur le tableau
        desk.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(SeatingChartManager._orientation).toBe('student');
    });

    it('devrait mettre à jour l\'état et le tooltip harmonisé de la capsule flottante', () => {
        const floatingBtn = document.getElementById('scFloatingOrientationBtn');

        SeatingChartManager._applyOrientation('student');
        expect(floatingBtn.classList.contains('active')).toBe(true);
        expect(floatingBtn.getAttribute('data-tooltip')).toBe('Vue Élèves active • Inverser');
        expect(floatingBtn.getAttribute('aria-label')).toBe('Vue Élèves active (cliquer pour inverser la vue)');

        SeatingChartManager._applyOrientation('teacher');
        expect(floatingBtn.classList.contains('active')).toBe(false);
        expect(floatingBtn.getAttribute('data-tooltip')).toBe('Vue Prof active • Inverser');
        expect(floatingBtn.getAttribute('aria-label')).toBe('Vue Prof active (cliquer pour inverser la vue)');
    });

    it('devrait afficher le statut des élèves dans le titre en mode édition', () => {
        // 2 élèves, grille 3x3 (9 places), 0 placé -> unplaced = 2, available = 9
        SeatingChartManager._isLocked = false;
        SeatingChartManager._updateFooter();
        expect(document.getElementById('scSidebarTitle').textContent).toContain('Élèves non placés');
        expect(document.getElementById('scSidebarTitle').textContent).toContain('2');
        expect(document.getElementById('scFooterInfo').textContent).toBe('9 places libres');

        // Placer tous les élèves
        SeatingChartManager._gridState[0][0] = 's1';
        SeatingChartManager._gridState[0][1] = 's2';
        SeatingChartManager._students[0].seatingPosition = { row: 0, col: 0 };
        SeatingChartManager._students[1].seatingPosition = { row: 0, col: 1 };

        // Tous placés en édition
        SeatingChartManager._isLocked = false;
        SeatingChartManager._updateFooter();
        expect(document.getElementById('scSidebarTitle').textContent).toContain('Tous les élèves sont placés');
        expect(document.getElementById('scFooterInfo').textContent).toBe('7 places libres');
    });
});

describe('SeatingChartManager - Individualisation du verrouillage et cycle de vie par classe', () => {
    let classA, classB;

    beforeEach(() => {
        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        userSettings.academic.seatingGrid = {
            rows: 5,
            cols: 6,
            locked: false,
            specialLayout: {}
        };
        appState.classes = userSettings.academic.classes;
        appState.seatingGrid = userSettings.academic.seatingGrid;
        appState.generatedResults = [];

        classA = ClassManager.createClass('6ème A');
        classB = ClassManager.createClass('5ème B');

        // Ajouter 3 élèves à classA et 2 élèves à classB
        appState.generatedResults = [
            { id: 'a1', classId: classA.id, nom: 'Alpha', prenom: 'Alice', seatingPosition: { row: 0, col: 0 } },
            { id: 'a2', classId: classA.id, nom: 'Bravo', prenom: 'Bob', seatingPosition: { row: 0, col: 1 } },
            { id: 'a3', classId: classA.id, nom: 'Charlie', prenom: 'Chloé', seatingPosition: null },
            { id: 'b1', classId: classB.id, nom: 'Delta', prenom: 'David', seatingPosition: { row: 1, col: 0 } },
            { id: 'b2', classId: classB.id, nom: 'Echo', prenom: 'Emma', seatingPosition: { row: 1, col: 1 } }
        ];

        document.body.innerHTML = `
            <div id="seatingChartView" data-locked="false">
                <div class="sc-floating-status">
                    <div class="sc-status-pill" id="scStatusPill"></div>
                    <div class="sc-toolbar-info" id="scFooterInfo"></div>
                </div>
                <div id="scLockBtn" class="sc-toggle-switch"></div>
                <button id="scUnlockFloatingBtn"></button>
                <div id="scGridContainer"></div>
                <div id="scSidebarTitle"></div>
            </div>
            <div id="viewToggle"></div>
        `;
    });

    it('devrait isoler le verrouillage : verrouiller la classe A n\'impacte pas la classe B et referme le volet d\'édition en mode En test', () => {
        appState.currentClassId = classA.id;
        userSettings.academic.currentClassId = classA.id;
        SeatingChartManager._isActive = true;
        SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
        SeatingChartManager._initGrid(5, 6);
        SeatingChartManager._loadPositionsFromState();

        // Verrouiller classe A
        SeatingChartManager._isLocked = false;
        SeatingChartManager._toggleLock();

        expect(SeatingChartManager._isLocked).toBe(true);
        expect(classA.seatingLocked).toBe(true);
        expect(classA.seatingValidatedAt).toBeTruthy();
        expect(classB.seatingLocked).toBe(false);

        // Bascule vers classe B via onClassChange (2 élèves placés, plan non validé)
        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;
        SeatingChartManager.onClassChange(true);

        // Le volet d'édition se referme (consultation) mais le plan de la classe B reste "En test"
        expect(SeatingChartManager._isLocked).toBe(true);
        expect(classB.seatingLocked).toBe(false);
        const pill = document.getElementById('scStatusPill');
        expect(pill.classList.contains('sc-status-testing')).toBe(true);
        expect(pill.textContent).toContain('En test');

        // Une classe avec 0 élève placé ouvre automatiquement le volet d'édition
        const classC = ClassManager.createClass('4ème C');
        appState.generatedResults.push({ id: 'c1', classId: classC.id, nom: 'Foxtrot', prenom: 'Fanny', seatingPosition: null });
        appState.currentClassId = classC.id;
        userSettings.academic.currentClassId = classC.id;
        SeatingChartManager.onClassChange(true);
        expect(SeatingChartManager._isLocked).toBe(false);

        // Revenir vers classe A
        appState.currentClassId = classA.id;
        userSettings.academic.currentClassId = classA.id;
        SeatingChartManager.onClassChange(true);

        // Classe A doit restaurer son état verrouillé et validé
        expect(SeatingChartManager._isLocked).toBe(true);
        expect(classA.seatingLocked).toBe(true);
        expect(pill.classList.contains('sc-status-locked')).toBe(true);
    });

    it('devrait valider et figer un plan même si un élève (parti) reste non placé dans la liste', () => {
        appState.currentClassId = classA.id;
        userSettings.academic.currentClassId = classA.id;
        SeatingChartManager._isActive = true;
        SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
        SeatingChartManager._initGrid(5, 6);
        SeatingChartManager._loadPositionsFromState();

        // 2 placés sur 3 élèves (1 élève parti non placé)
        expect(SeatingChartManager._getPlacedIds().size).toBe(2);

        // Le prof verrouille/valide le plan
        SeatingChartManager._isLocked = false;
        SeatingChartManager._toggleLock();

        expect(SeatingChartManager._isLocked).toBe(true);
        expect(classA.seatingLocked).toBe(true);

        // Statut de la classe
        const status = SeatingChartManager.getClassSeatingStatus(classA);
        expect(status.status).toBe('locked');
        expect(status.unplaced).toBe(1);
        expect(status.placed).toBe(2);

        // La pilule de statut doit afficher « Validé »
        const pill = document.getElementById('scStatusPill');
        expect(pill.textContent).toContain('Validé');
    });

    it('devrait retourner le bon statut de cycle de vie (empty, testing, locked)', () => {
        // Classe sans aucun élève placé
        const classEmpty = ClassManager.createClass('3ème D');
        const emptyStatus = SeatingChartManager.getClassSeatingStatus(classEmpty);
        expect(emptyStatus.status).toBe('empty');
        expect(emptyStatus.shortLabel).toBe('À faire');

        // Classe B avec élèves placés mais non verrouillée
        classB.seatingLocked = false;
        classB.seatingUpdatedAt = Date.now();
        const testingStatus = SeatingChartManager.getClassSeatingStatus(classB);
        expect(testingStatus.status).toBe('testing');
        expect(testingStatus.shortLabel).toBe('En test');

        // Classe B verrouillée
        classB.seatingLocked = true;
        classB.seatingValidatedAt = Date.now();
        const lockedStatus = SeatingChartManager.getClassSeatingStatus(classB);
        expect(lockedStatus.status).toBe('locked');
        expect(lockedStatus.shortLabel).toBe('Validé');
    });

    it('devrait masquer la pastille flottante en mode édition (pour éviter la redondance) et sur plan vide', () => {
        const pill = document.getElementById('scStatusPill');
        appState.currentClassId = classA.id;

        // En mode édition (non verrouillé) : la pastille doit être masquée
        SeatingChartManager._isLocked = false;
        SeatingChartManager._updateStatusPill();
        expect(pill.style.display).toBe('none');

        // En mode consultation/verrouillé avec des élèves placés : la pastille s'affiche
        SeatingChartManager._isLocked = true;
        classA.seatingLocked = true;
        SeatingChartManager._updateStatusPill();
        expect(pill.style.display).toBe('');
        expect(pill.textContent).toContain('Validé');

        // Classe vide en mode verrouillé/consultation : pas de pastille "Mode Édition"
        const emptyClass = ClassManager.createClass('6ème Test Empty');
        appState.currentClassId = emptyClass.id;
        SeatingChartManager._isLocked = true;
        SeatingChartManager._updateStatusPill();
        expect(pill.style.display).toBe('none');
        expect(pill.innerHTML).toBe('');
    });

    it('ne devrait pas afficher la carte d\'onboarding hint si le mode verrouillé/consultation est actif', () => {
        const gridArea = document.createElement('div');
        gridArea.id = 'scGridArea';
        document.body.appendChild(gridArea);

        // Pas d'élèves placés mais verrouillé
        SeatingChartManager._gridState = [[null, null]];
        SeatingChartManager._isLocked = true;

        SeatingChartManager._maybeShowOnboardingHint();
        expect(gridArea.querySelector('.sc-onboarding-hint')).toBeNull();

        // En mode édition : l'onboarding hint doit apparaître
        SeatingChartManager._isLocked = false;
        SeatingChartManager._maybeShowOnboardingHint();
        expect(gridArea.querySelector('.sc-onboarding-hint')).not.toBeNull();
        gridArea.remove();
    });

    it('devrait afficher l\'avertissement d\'élèves non placés dans la pastille de statut unifiée', () => {
        const pill = document.getElementById('scStatusPill');
        appState.currentClassId = classA.id; // classA : 3 élèves, 2 placés, 1 non placé
        SeatingChartManager._isLocked = true;
        classA.seatingLocked = true;

        SeatingChartManager._updateStatusPill();
        expect(pill.style.display).toBe('');
        expect(pill.textContent).toContain('Validé');
        expect(pill.textContent).toContain('1 non placé');

        // Si tous les élèves sont placés (classe B : 2 sur 2)
        appState.currentClassId = classB.id;
        classB.seatingLocked = true;
        SeatingChartManager._updateStatusPill();
        expect(pill.textContent).toContain('Validé');
        expect(pill.textContent).not.toContain('non placé');
    });

    it('devrait comptabiliser comme non placés dans scStatusPill les élèves éjectés hors-grille après réduction de la grille et éviter toute collision au ré-agrandissement', () => {
        // Placer b1 au rang 0 et b2 au rang 1
        const b1 = appState.generatedResults.find(r => r.id === 'b1');
        const b2 = appState.generatedResults.find(r => r.id === 'b2');
        b1.seatingPosition = { row: 0, col: 0 };
        b2.seatingPosition = { row: 1, col: 0 };

        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;
        appState.seatingGrid = { rows: 2, cols: 2, locked: false, specialLayout: {} };
        userSettings.academic.seatingGrid = appState.seatingGrid;

        document.body.insertAdjacentHTML('beforeend', `
            <input id="scRowsSlider" type="range" min="1" max="10" value="2" />
            <span id="scRowsValue">2</span>
            <input id="scColsSlider" type="range" min="1" max="10" value="2" />
            <span id="scColsValue">2</span>
        `);

        SeatingChartManager._isActive = true;
        SeatingChartManager._isLocked = false;
        SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
        SeatingChartManager._initGrid(2, 2);
        SeatingChartManager._loadPositionsFromState();
        expect(SeatingChartManager._getPlacedIds().size).toBe(2);

        // Réduire le nombre de rangées de 2 à 1 (le rang 0 du fond est supprimé, b1 est éjecté en hors-grille row: -1)
        document.getElementById('scRowsSlider').value = '1';
        SeatingChartManager._onGridConfigChange();

        expect(SeatingChartManager._getPlacedIds().size).toBe(1);
        expect(b1.seatingPosition.row).toBe(-1);
        expect(b2.seatingPosition.row).toBe(0);

        const statusShrunk = SeatingChartManager.getClassSeatingStatus(classB, 'course');
        expect(statusShrunk.placed).toBe(1);
        expect(statusShrunk.unplaced).toBe(1);
        expect(statusShrunk.status).toBe('testing');

        // En mode consultation, la pilule dynamique affiche bien "En test" ET "1 non placé"
        SeatingChartManager._isLocked = true;
        SeatingChartManager._updateStatusPill();
        const pill = document.getElementById('scStatusPill');
        expect(pill.textContent).toContain('En test');
        expect(pill.textContent).toContain('1 non placé');

        // Ré-augmenter le nombre de rangées de 1 à 2 : b1 retrouve sa place au rang 0 et b2 au rang 1 sans collision
        SeatingChartManager._isLocked = false;
        document.getElementById('scRowsSlider').value = '2';
        SeatingChartManager._onGridConfigChange();
        expect(SeatingChartManager._getPlacedIds().size).toBe(2);
        expect(b1.seatingPosition.row).toBe(0);
        expect(b2.seatingPosition.row).toBe(1);
    });

    it('devrait basculer en mode édition au clic et au clavier sur la capsule de statut (scStatusPill)', () => {
        appState.currentClassId = classA.id;
        SeatingChartManager._isLocked = true;
        classA.seatingLocked = true;
        SeatingChartManager._updateStatusPill();

        const pill = document.getElementById('scStatusPill');
        expect(pill.getAttribute('role')).toBe('button');
        expect(pill.getAttribute('tabindex')).toBe('0');
        expect(pill.textContent).toContain('Validé');
        expect(pill.textContent).toContain('Modifier');

        // Attacher les écouteurs pour ce test
        SeatingChartManager._setupEventListeners();

        // Clic sur la capsule
        pill.click();
        expect(SeatingChartManager._isLocked).toBe(false);

        // Verrouiller à nouveau et tester la touche Entrée
        SeatingChartManager._isLocked = true;
        pill.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(SeatingChartManager._isLocked).toBe(false);

        // Verrouiller à nouveau et tester la touche Espace
        SeatingChartManager._isLocked = true;
        pill.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(SeatingChartManager._isLocked).toBe(false);
    });
});

describe('SeatingChartManager - Mémorisation de la vue et restauration au démarrage', () => {
    let classA, emptyClass;

    beforeEach(() => {
        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        userSettings.ui.activeView = 'list';
        appState.classes = userSettings.academic.classes;
        appState.currentClassId = null;
        appState.activeView = 'list';
        appState.generatedResults = [];

        classA = ClassManager.createClass('3ème A');
        emptyClass = ClassManager.createClass('3ème Vide');

        appState.generatedResults = [
            { id: 's1', classId: classA.id, nom: 'Dupont', prenom: 'Jean', seatingPosition: null },
            { id: 's2', classId: classA.id, nom: 'Martin', prenom: 'Sophie', seatingPosition: null }
        ];

        document.body.innerHTML = `
            <div class="main-content-wrapper" data-view="list">
                <header class="header">
                    <div class="header-actions">
                        <div class="ui-segmented-control view-toggle" id="viewToggle">
                            <button class="ui-segment view-toggle-btn active" data-view="list">Liste</button>
                            <button class="ui-segment view-toggle-btn" data-view="plan">Plan</button>
                        </div>
                    </div>
                </header>
                <div class="main-content">
                    <section class="output-section">
                        <div id="seatingChartView" style="display: none;">
                            <div id="scGridContainer"></div>
                            <div id="scDesk"></div>
                        </div>
                    </section>
                </div>
            </div>
        `;
    });

    it('devrait basculer en vue plan et enregistrer activeView = plan', () => {
        appState.currentClassId = classA.id;
        SeatingChartManager.switchToView('plan', { immediate: true });

        expect(appState.activeView).toBe('plan');
        expect(document.querySelector('.main-content-wrapper').dataset.view).toBe('plan');
        expect(document.getElementById('seatingChartView').style.display).toBe('');
    });

    it('devrait basculer en vue liste et enregistrer activeView = list', () => {
        appState.currentClassId = classA.id;
        SeatingChartManager.switchToView('plan', { immediate: true });
        expect(appState.activeView).toBe('plan');

        SeatingChartManager.switchToView('list', { immediate: true });
        expect(appState.activeView).toBe('list');
        expect(document.querySelector('.main-content-wrapper').dataset.view).toBe('list');
        expect(document.getElementById('seatingChartView').style.display).toBe('none');
    });

    it('devrait restaurer automatiquement la vue plan au démarrage si des élèves sont présents', () => {
        appState.currentClassId = classA.id;
        appState.activeView = 'plan';

        SeatingChartManager.restoreActiveView();

        expect(appState.activeView).toBe('plan');
        expect(document.querySelector('.main-content-wrapper').dataset.view).toBe('plan');
        expect(document.getElementById('seatingChartView').style.display).toBe('');
    });

    it('devrait se replier élégamment sur la vue liste si la classe courante est vide', () => {
        appState.currentClassId = emptyClass.id;
        appState.activeView = 'plan';

        SeatingChartManager.restoreActiveView();

        expect(appState.activeView).toBe('list');
        expect(document.querySelector('.main-content-wrapper').dataset.view).toBe('list');
    });

    it('devrait synchroniser les boutons du toggle et le glider en vue liste lors de restoreActiveView', () => {
        appState.currentClassId = classA.id;
        appState.activeView = 'list';
        const updateGliderSpy = vi.fn();
        window.UI = { ...window.UI, updateGlider: updateGliderSpy };

        SeatingChartManager.restoreActiveView();

        const listBtn = document.querySelector('.view-toggle-btn[data-view="list"]');
        const planBtn = document.querySelector('.view-toggle-btn[data-view="plan"]');
        expect(listBtn.classList.contains('active')).toBe(true);
        expect(planBtn.classList.contains('active')).toBe(false);
        expect(updateGliderSpy).toHaveBeenCalledWith(document.getElementById('viewToggle'), true);
    });

    it('devrait animer horizontalement la transition Liste <-> Plan avec apparition progressive des cartes et lignes', async () => {
        vi.useFakeTimers();
        appState.currentClassId = classA.id;
        SeatingChartManager._isActive = false;

        const outputSection = document.querySelector('.output-section');
        const statsContainer = document.createElement('div');
        statsContainer.className = 'stats-container';
        statsContainer.innerHTML = '<div class="stat-card"></div><div class="stat-card"></div>';
        outputSection.insertBefore(statsContainer, document.getElementById('seatingChartView'));

        const outputList = document.createElement('div');
        outputList.id = 'outputList';
        outputList.innerHTML = '<table class="student-list-table"><tbody><tr class="student-row"></tr><tr class="student-row"></tr></tbody></table>';
        outputSection.insertBefore(outputList, document.getElementById('seatingChartView'));

        const viewEl = document.getElementById('seatingChartView');
        const wrapper = document.querySelector('.main-content-wrapper');

        // 1. Liste -> Plan : sortie gauche de la liste puis entrée droite du plan + apparition progressive des cellules
        SeatingChartManager.switchToView('plan');
        expect(outputList.classList.contains('view-slide-out-left')).toBe(true);

        await vi.advanceTimersByTimeAsync(95);
        expect(wrapper.dataset.view).toBe('plan');
        expect(viewEl.classList.contains('sc-entering')).toBe(true);
        const cells = document.querySelectorAll('#scGridContainer .sc-cell');
        expect(cells.length).toBeGreaterThan(0);
        expect(cells[0].classList.contains('sc-cell-stagger')).toBe(true);

        await vi.advanceTimersByTimeAsync(260);
        expect(viewEl.classList.contains('sc-entering')).toBe(false);

        // 2. Plan -> Liste : sortie droite du plan puis entrée gauche de la liste + apparition progressive des cartes et lignes
        SeatingChartManager.switchToView('list');
        expect(viewEl.classList.contains('sc-exiting')).toBe(true);

        await vi.advanceTimersByTimeAsync(95);
        expect(wrapper.dataset.view).toBe('list');
        expect(outputList.classList.contains('view-slide-in-left')).toBe(true);
        const statCards = statsContainer.querySelectorAll('.stat-card');
        const studentRows = outputList.querySelectorAll('.student-row');
        expect(statCards[0].classList.contains('stat-card-stagger')).toBe(true);
        expect(studentRows[0].classList.contains('row-stagger-enter')).toBe(true);

        await vi.advanceTimersByTimeAsync(260);
        expect(outputList.classList.contains('view-slide-in-left')).toBe(false);

        await vi.advanceTimersByTimeAsync(600);
        expect(statCards[0].classList.contains('stat-card-stagger')).toBe(false);
        expect(studentRows[0].classList.contains('row-stagger-enter')).toBe(false);

        vi.useRealTimers();
    });

    it('devrait nettoyer table-fade-in et les classes résiduelles pour animer les 5 premières lignes lors du retour Plan -> Liste', async () => {
        vi.useFakeTimers();
        appState.currentClassId = classA.id;
        SeatingChartManager._isActive = true;
        const wrapper = document.querySelector('.main-content-wrapper');
        wrapper.dataset.view = 'plan';

        const outputSection = document.querySelector('.output-section');
        const statsContainer = document.createElement('div');
        statsContainer.className = 'stats-container';
        statsContainer.innerHTML = '<div class="stat-card stat-card-animate-in"></div>';
        outputSection.insertBefore(statsContainer, document.getElementById('seatingChartView'));

        const outputList = document.createElement('div');
        outputList.id = 'outputList';
        const rowsHtml = Array.from({ length: 8 }, (_, idx) =>
            `<tr class="student-row ${idx < 5 ? 'row-animate-in focus-closed-flash' : ''}"></tr>`
        ).join('');
        outputList.innerHTML = `<div class="student-list-view table-fade-in"><table class="student-list-table"><tbody>${rowsHtml}</tbody></table></div>`;
        outputSection.insertBefore(outputList, document.getElementById('seatingChartView'));

        SeatingChartManager.switchToView('list');
        await vi.advanceTimersByTimeAsync(95);

        const listView = outputList.querySelector('.student-list-view');
        expect(listView.classList.contains('table-fade-in')).toBe(false);

        const studentRows = Array.from(outputList.querySelectorAll('.student-row'));
        expect(studentRows).toHaveLength(8);
        studentRows.forEach((row, index) => {
            expect(row.classList.contains('row-stagger-enter')).toBe(true);
            expect(row.classList.contains('row-animate-in')).toBe(false);
            expect(row.classList.contains('focus-closed-flash')).toBe(false);
            expect(row.style.getPropertyValue('--row-i')).toBe(String(index));
        });

        const statCard = statsContainer.querySelector('.stat-card');
        expect(statCard.classList.contains('stat-card-stagger')).toBe(true);
        expect(statCard.classList.contains('stat-card-animate-in')).toBe(false);

        vi.useRealTimers();
    });
});

describe('SeatingChartManager - Classes reconstituées et empilement des élèves', () => {
    it('devrait afficher le toggle de plan de classe pour une classe reconstituée avec élèves', () => {
        const group1 = ClassManager.createClass('3 TECHNOLOGIE G1');
        appState.generatedResults = [
            { id: 's1', classId: group1.id, nom: 'Dupont', prenom: 'Alice', studentData: { classe: '3 1' } }
        ];

        document.body.innerHTML = `<div id="viewToggle" class="view-toggle"></div>`;
        appState.currentClassId = 'virtual_31';

        SeatingChartManager.updateToggleVisibility(true);
        expect(document.getElementById('viewToggle').classList.contains('visible')).toBe(true);
    });

    it('devrait empiler plusieurs élèves partageant la même place dans une classe reconstituée', () => {
        const group1 = ClassManager.createClass('3 TECHNOLOGIE G1');
        const group2 = ClassManager.createClass('3 TECHNOLOGIE G2');

        // Deux élèves issus de deux groupes différents, placés aux mêmes coordonnées (row 0, col 0)
        appState.generatedResults = [
            { id: 's1', classId: group1.id, nom: 'Dupont', prenom: 'Alice', studentData: { classe: '3 1' }, seatingPosition: { row: 0, col: 0 } },
            { id: 's2', classId: group2.id, nom: 'Martin', prenom: 'Bob', studentData: { classe: '3 1' }, seatingPosition: { row: 0, col: 0 } }
        ];

        appState.currentClassId = 'virtual_31';
        SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
        expect(SeatingChartManager._students.length).toBe(2);

        SeatingChartManager._loadPositionsFromState();

        // La case [0][0] doit contenir un tableau avec les deux élèves empilés
        expect(SeatingChartManager._gridState[0][0]).toEqual(['s1', 's2']);

        // _getPlacedIds doit inclure les deux élèves
        const placedIds = SeatingChartManager._getPlacedIds();
        expect(placedIds.has('s1')).toBe(true);
        expect(placedIds.has('s2')).toBe(true);

        // Rendu de la cellule
        SeatingChartManager._studentMap = new Map(SeatingChartManager._students.map(s => [s.id, s]));
        const cell = SeatingChartManager._createCell(0, 0);

        expect(cell.classList.contains('sc-cell-stacked')).toBe(true);
        expect(cell.dataset.groupSize).toBe('2');
        expect(cell.querySelectorAll('.sc-stacked-avatar').length).toBe(2);
        expect(cell.querySelector('.sc-stacked-count-pill')).toBeNull();
        expect(cell.textContent).toContain('Alice');
        expect(cell.textContent).toContain('Bob');
    });

    describe('Gestion des statuts Départ et Nouveau (Audit et alerte non placé)', () => {
        let testClass;

        beforeEach(() => {
            document.body.innerHTML = `
                <div id="seatingChartView" data-locked="false">
                    <div class="sc-floating-status">
                        <div class="sc-status-pill" id="scStatusPill"></div>
                        <div class="sc-toolbar-info" id="scFooterInfo"></div>
                    </div>
                    <div id="scLockBtn" class="sc-toggle-switch"></div>
                    <button id="scUnlockFloatingBtn"></button>
                    <div id="scGridContainer"></div>
                    <div id="scSidebarTitle"></div>
                    <div id="scStudentList"></div>
                </div>
                <div id="viewToggle"></div>
            `;

            testClass = ClassManager.createClass('4°1');
            appState.currentClassId = testClass.id;
            userSettings.academic.currentClassId = testClass.id;
            appState.currentPeriod = 'S1';
            SeatingChartManager._isActive = true;
            SeatingChartManager._isLocked = false;

            // 3 élèves : 2 élèves actifs placés, 1 élève avec badge Départ non placé
            appState.generatedResults = [
                {
                    id: 'act1',
                    classId: testClass.id,
                    nom: 'Dupont',
                    prenom: 'Alex',
                    studentData: { statuses: [] },
                    seatingPosition: { row: 0, col: 0 }
                },
                {
                    id: 'act2',
                    classId: testClass.id,
                    nom: 'Durand',
                    prenom: 'Béatrice',
                    studentData: { statuses: ['Nouveau S1'] },
                    seatingPosition: { row: 0, col: 1 }
                },
                {
                    id: 'dep1',
                    classId: testClass.id,
                    nom: 'Moreau',
                    prenom: 'Claire',
                    studentData: { statuses: ['Départ S1'] },
                    seatingPosition: null
                }
            ];

            SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
            SeatingChartManager._initGrid(5, 6);
            SeatingChartManager._loadPositionsFromState();
        });

        it('ne doit pas compter un élève avec badge Départ non placé comme "non placé" dans le statut', () => {
            testClass.seatingLocked = true;
            const status = SeatingChartManager.getClassSeatingStatus(testClass);

            // Total des actifs attendus = 2, placés = 2, unplaced = 0 !
            expect(status.total).toBe(2);
            expect(status.placed).toBe(2);
            expect(status.unplaced).toBe(0);
            expect(status.status).toBe('locked');
            expect(status.shortLabel).toBe('Validé');
        });

        it('doit afficher "Validé" sans avertissement "non placé" dans scStatusPill quand verrouillé', () => {
            testClass.seatingLocked = true;
            SeatingChartManager._isLocked = true;
            SeatingChartManager._updateStatusPill();

            const pill = document.getElementById('scStatusPill');
            expect(pill.textContent).toContain('Validé');
            expect(pill.textContent).not.toContain('non placé');
            expect(pill.querySelector('.sc-status-pill-unplaced')).toBeNull();
        });

        it('ne doit pas placer un élève marqué Départ lors de l\'agencement automatique', () => {
            // Vider la grille
            SeatingChartManager._gridState = Array.from({ length: 5 }, () => Array(6).fill(null));
            appState.generatedResults.forEach(r => { r.seatingPosition = null; });
            SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();

            SeatingChartManager._autoPlace('alpha-asc');

            const placedIds = SeatingChartManager._getPlacedIds();
            // Alex et Béatrice (les actifs) sont placés
            expect(placedIds.has('act1')).toBe(true);
            expect(placedIds.has('act2')).toBe(true);
            // Claire (Départ) n'est PAS placée automatiquement sur la grille
            expect(placedIds.has('dep1')).toBe(false);
        });

        it('doit afficher les badges Nouveau et Départ sur les cellules appropriées', () => {
            // Placer l'élève Départ pour vérifier le rendu de sa cellule
            SeatingChartManager._gridState[0][2] = 'dep1';
            SeatingChartManager._studentMap = new Map(SeatingChartManager._students.map(s => [s.id, s]));

            // Cellule 0,1 (Béatrice - Nouveau)
            const cellNew = SeatingChartManager._createCell(0, 1);
            expect(cellNew.classList.contains('sc-cell-new')).toBe(true);
            expect(cellNew.classList.contains('has-status-badge')).toBe(true);
            expect(cellNew.querySelector('.sc-cell-status-badge.sc-badge-new')?.textContent).toBe('Nouveau');

            // Cellule 0,2 (Claire - Départ)
            const cellDepart = SeatingChartManager._createCell(0, 2);
            expect(cellDepart.classList.contains('sc-cell-departed')).toBe(true);
            expect(cellDepart.classList.contains('has-status-badge')).toBe(true);
            expect(cellDepart.querySelector('.sc-cell-status-badge.sc-badge-depart')?.textContent).toBe('Départ');
        });

        it('doit isoler l\'élève Départ dans la section dédiée du volet latéral sans bloquer le succès', () => {
            const listContainer = document.getElementById('scStudentList');

            SeatingChartManager._renderSidebar();

            // Le succès "Tous les élèves sont placés !" s'affiche pour les élèves actifs
            expect(listContainer.innerHTML).toContain('Tous les élèves sont placés');

            // L'élève parti apparaît dans sa sous-section dédiée
            expect(listContainer.querySelector('.sc-sidebar-departed-section')).not.toBeNull();
            expect(listContainer.querySelector('.sc-chip-badge-depart')?.textContent).toBe('Départ');
        });

        it('doit synchroniser en temps réel la cellule si un élève passe en statut Départ', () => {
            // L'élève act1 (Dupont Alex) est placé en (0,0) et initialement actif
            SeatingChartManager._gridState[0][0] = 'act1';
            let cell = SeatingChartManager._createCell(0, 0);
            expect(cell.classList.contains('sc-cell-departed')).toBe(false);

            // Simulation d'une modification du statut dans le FocusPanel
            const targetStudent = appState.generatedResults.find(r => r.id === 'act1');
            targetStudent.studentData.statuses = ['Départ'];

            // Déclenchement de l'événement de mise à jour
            window.dispatchEvent(new CustomEvent('student-updated', { detail: { studentId: 'act1' } }));

            // Vérification que la cellule créée reflète immédiatement le statut Départ
            cell = SeatingChartManager._createCell(0, 0);
            expect(cell.classList.contains('sc-cell-departed')).toBe(true);
            expect(cell.querySelector('.sc-cell-status-badge.sc-badge-depart')?.textContent).toBe('Départ');
        });
    });

    describe('SeatingChartManager - Smart-Fit & Minimalist Zoom', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="main-content">
                    <div class="output-section"></div>
                </div>
            `;
            SeatingChartManager.init();
        });

        it('devrait calculer une échelle adaptée et positionner data-fitted en mode verrouillé', () => {
            SeatingChartManager._isLocked = true;
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            // Simuler des dimensions d'écran mobile (largeur 390px, hauteur 800px)
            Object.defineProperty(gridArea, 'clientWidth', { value: 390, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 700, configurable: true });

            // Simuler une carte mère de classe (largeur 600px, hauteur 500px)
            Object.defineProperty(board, 'offsetWidth', { value: 600, configurable: true });
            Object.defineProperty(board, 'offsetHeight', { value: 500, configurable: true });

            SeatingChartManager._applySmartFit(true);

            expect(SeatingChartManager._isFitted).toBe(true);
            expect(board.style.getPropertyValue('--sc-scale')).toBeTruthy();
            const scale = parseFloat(board.style.getPropertyValue('--sc-scale'));
            expect(scale).toBeLessThan(1.0);
            expect(scale).toBeGreaterThan(0.35);
            expect(gridArea.getAttribute('data-fitted')).toBe('true');
        });

        it('devrait basculer entre la vue ajustée et le zoom 100% via _toggleZoom sur mobile et réinitialiser le scroll', () => {
            SeatingChartManager._isLocked = true;
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            Object.defineProperty(gridArea, 'clientWidth', { value: 400, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 600, configurable: true });
            Object.defineProperty(board, 'offsetWidth', { value: 600, configurable: true });
            Object.defineProperty(board, 'offsetHeight', { value: 500, configurable: true });

            SeatingChartManager._applySmartFit(true);
            expect(SeatingChartManager._isFitted).toBe(true);
            expect(SeatingChartManager._fitScale).toBeLessThan(0.95);

            // Bascule vers 100%
            SeatingChartManager._toggleZoom();
            expect(SeatingChartManager._isFitted).toBe(false);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('1');
            expect(gridArea.getAttribute('data-fitted')).toBe('false');

            // Simuler un défilement horizontal par l'utilisateur
            gridArea.scrollLeft = 250;
            gridArea.scrollTop = 100;

            // Bascule de retour vers Fit : le scroll doit impérativement être remis à 0
            SeatingChartManager._toggleZoom();
            expect(SeatingChartManager._isFitted).toBe(true);
            expect(gridArea.scrollLeft).toBe(0);
            expect(gridArea.scrollTop).toBe(0);
            expect(gridArea.getAttribute('data-fitted')).toBe('true');
        });

        it('devrait cadrer automatiquement jusqu’à 1.65x sur grand écran PC et agrandir à +125% relatif au clic sur la loupe', () => {
            SeatingChartManager._isLocked = true;
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            // Dimensions larges PC (availW = 1400 - 260 - 48 = 1092, availH = 800 - 80 - 24 = 696)
            Object.defineProperty(gridArea, 'clientWidth', { value: 1400, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 800, configurable: true });
            Object.defineProperty(board, 'offsetWidth', { value: 600, configurable: true });
            Object.defineProperty(board, 'offsetHeight', { value: 500, configurable: true });

            SeatingChartManager._applySmartFit(true);
            expect(SeatingChartManager._isFitted).toBe(true);
            expect(SeatingChartManager._fitScale).toBe(1.39);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('1.39');
            expect(board.style.getPropertyValue('zoom')).toBe('');
            expect(board.style.getPropertyValue('--sc-margin-x')).toBe('117px');
            expect(board.style.getPropertyValue('--sc-margin-y')).toBe('97.5px');

            // Sur grand écran PC, le premier clic zoome à 125% de l'échelle ajustée (1.39 * 1.25 = 1.74)
            SeatingChartManager._toggleZoom();
            expect(SeatingChartManager._isFitted).toBe(false);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('1.74');
            expect(board.style.getPropertyValue('zoom')).toBe('');

            // Le deuxième clic revient à 1.39 (ajusté)
            SeatingChartManager._toggleZoom();
            expect(SeatingChartManager._isFitted).toBe(true);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('1.39');
        });

        it('devrait agrandir à 125% (1.25) lorsque la vue ajustée est à 100% (1.0)', () => {
            SeatingChartManager._isLocked = true;
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            // availW = 908 - 260 - 48 = 600, availH = 604 - 80 - 24 = 500 -> fitScale = 1.0
            Object.defineProperty(gridArea, 'clientWidth', { value: 908, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 648, configurable: true });
            Object.defineProperty(board, 'offsetWidth', { value: 600, configurable: true });
            Object.defineProperty(board, 'offsetHeight', { value: 500, configurable: true });

            SeatingChartManager._applySmartFit(true);
            expect(SeatingChartManager._isFitted).toBe(true);
            expect(SeatingChartManager._fitScale).toBe(1.0);

            SeatingChartManager._toggleZoom();
            expect(SeatingChartManager._isFitted).toBe(false);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('1.25');

            SeatingChartManager._toggleZoom();
            expect(SeatingChartManager._isFitted).toBe(true);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('1');
        });

        it('devrait ajuster harmonieusement la carte Activité sur tablette verticale (540-768px) tout en préservant l’échelle Cours et le plafond smartphone', () => {
            const prevInnerWidth = window.innerWidth;
            try {
                SeatingChartManager._isLocked = true;
                const gridArea = document.getElementById('scGridArea');
                const board = document.getElementById('scClassroomBoard');

                // 1. Tablette verticale / pliable déplié (645px x 800px) -> availW = 645 - 76 = 569
                Object.defineProperty(window, 'innerWidth', { value: 645, configurable: true, writable: true });
                Object.defineProperty(gridArea, 'clientWidth', { value: 645, configurable: true });
                Object.defineProperty(gridArea, 'clientHeight', { value: 800, configurable: true });

                // Carte Cours (8 colonnes = 568px x 446px) -> reste à 1.00
                Object.defineProperty(board, 'offsetWidth', { value: 568, configurable: true });
                Object.defineProperty(board, 'offsetHeight', { value: 446, configurable: true });
                SeatingChartManager._applySmartFit(true);
                expect(SeatingChartManager._fitScale).toBe(1.0);

                // Carte Activité (5 postes = 478px x 205px) -> agrandie à 1.19 pour égaler l'envergure de Cours
                Object.defineProperty(board, 'offsetWidth', { value: 478, configurable: true });
                Object.defineProperty(board, 'offsetHeight', { value: 205, configurable: true });
                SeatingChartManager._applySmartFit(true);
                expect(SeatingChartManager._fitScale).toBe(1.19);
                expect(board.style.getPropertyValue('--sc-scale')).toBe('1.19');

                // 2. Tablette horizontale en consultation (853px x 585px, verrouillé) -> récupère la largeur de la sidebar cachée (853 - 96 = 757)
                Object.defineProperty(window, 'innerWidth', { value: 853, configurable: true, writable: true });
                Object.defineProperty(gridArea, 'clientWidth', { value: 853, configurable: true });
                Object.defineProperty(gridArea, 'clientHeight', { value: 585, configurable: true });
                Object.defineProperty(board, 'offsetWidth', { value: 672, configurable: true });
                Object.defineProperty(board, 'offsetHeight', { value: 272, configurable: true });
                SeatingChartManager._isLocked = true;
                SeatingChartManager._applySmartFit(true);
                expect(SeatingChartManager._fitScale).toBe(1.13);

                // En mode édition déverrouillé sur la même tablette horizontale, réserve les 260px de la sidebar ouverte (853 - 260 - 48 = 545)
                SeatingChartManager._isLocked = false;
                SeatingChartManager._applySmartFit(true);
                expect(SeatingChartManager._fitScale).toBe(0.81);

                // Carte Cours sur la même tablette horizontale en consultation (853px x 563px) -> marge verticale harmonisée (46px haut/bas = 0.73)
                SeatingChartManager._isLocked = true;
                Object.defineProperty(gridArea, 'clientHeight', { value: 563, configurable: true });
                Object.defineProperty(board, 'offsetWidth', { value: 676, configurable: true });
                Object.defineProperty(board, 'offsetHeight', { value: 568, configurable: true });
                SeatingChartManager._applySmartFit(true);
                expect(SeatingChartManager._fitScale).toBe(0.73);

                // Mobile horizontal en consultation (615px x 413px, <= 768px) -> marge verticale réduite à 30px (availH = 413 - 86 - 30 = 297 -> scale = 0.68)
                Object.defineProperty(window, 'innerWidth', { value: 615, configurable: true, writable: true });
                Object.defineProperty(gridArea, 'clientWidth', { value: 615, configurable: true });
                Object.defineProperty(gridArea, 'clientHeight', { value: 413, configurable: true });
                Object.defineProperty(board, 'offsetWidth', { value: 566, configurable: true });
                Object.defineProperty(board, 'offsetHeight', { value: 436, configurable: true });
                SeatingChartManager._applySmartFit(true);
                expect(SeatingChartManager._fitScale).toBe(0.68);
                Object.defineProperty(gridArea, 'clientHeight', { value: 800, configurable: true });

                // 3. Smartphone étroit (< 540px) avec petite grille -> plafond strict maintenu à 1.0
                SeatingChartManager._isLocked = true;
                Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true, writable: true });
                Object.defineProperty(gridArea, 'clientWidth', { value: 390, configurable: true });
                Object.defineProperty(board, 'offsetWidth', { value: 250, configurable: true });
                Object.defineProperty(board, 'offsetHeight', { value: 200, configurable: true });
                SeatingChartManager._applySmartFit(true);
                expect(SeatingChartManager._fitScale).toBe(1.0);
            } finally {
                Object.defineProperty(window, 'innerWidth', { value: prevInnerWidth, configurable: true, writable: true });
            }
        });

        it('devrait appliquer le smart-fit et permettre le zoom également en mode édition (déverrouillé)', () => {
            SeatingChartManager._isLocked = false;
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            Object.defineProperty(gridArea, 'clientWidth', { value: 400, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 600, configurable: true });
            Object.defineProperty(board, 'offsetWidth', { value: 600, configurable: true });
            Object.defineProperty(board, 'offsetHeight', { value: 500, configurable: true });

            SeatingChartManager._applySmartFit(true);

            expect(SeatingChartManager._isFitted).toBe(true);
            expect(gridArea.getAttribute('data-fitted')).toBe('true');
            expect(parseFloat(board.style.getPropertyValue('--sc-scale'))).toBeLessThan(1.0);

            // Toggle zoom en mode édition
            SeatingChartManager._toggleZoom();
            expect(SeatingChartManager._isFitted).toBe(false);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('1');
            expect(gridArea.getAttribute('data-fitted')).toBe('false');

            // Retour au fit
            SeatingChartManager._toggleZoom();
            expect(SeatingChartManager._isFitted).toBe(true);
            expect(gridArea.getAttribute('data-fitted')).toBe('true');
        });

        it('devrait mettre à jour l’icône et le tooltip du bouton zoom flottant selon l’appareil', () => {
            const zoomBtn = document.getElementById('scFloatingZoomBtn');
            expect(zoomBtn).not.toBeNull();

            // Mobile (fitScale < 0.95) -> "Agrandir (100%)"
            SeatingChartManager._fitScale = 0.65;
            SeatingChartManager._updateZoomButtonUI(true, 0.65);
            expect(zoomBtn.getAttribute('aria-label')).toBe('Agrandir (100%)');
            expect(zoomBtn.querySelector('iconify-icon')?.getAttribute('icon')).toBe('solar:magnifer-zoom-in-linear');

            // PC (fitScale >= 0.95) -> "Agrandir (125%)"
            SeatingChartManager._fitScale = 1.0;
            SeatingChartManager._updateZoomButtonUI(true, 1.0);
            expect(zoomBtn.getAttribute('aria-label')).toBe('Agrandir (125%)');
            expect(zoomBtn.querySelector('iconify-icon')?.getAttribute('icon')).toBe('solar:magnifer-zoom-in-linear');

            // État déjà zoomé -> "Ajuster à l’écran"
            SeatingChartManager._updateZoomButtonUI(false, 1.25);
            expect(zoomBtn.getAttribute('aria-label')).toBe('Ajuster à l’écran');
            expect(zoomBtn.querySelector('iconify-icon')?.getAttribute('icon')).toBe('solar:minimize-square-linear');
        });

        it('devrait appliquer une animation FLIP centrée (50% 50%) sans dérive asymétrique', () => {
            const board = document.getElementById('scClassroomBoard');
            const rBefore = { left: 100, top: 80, width: 400, height: 300 };

            vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
                left: 100,
                top: 80,
                width: 600,
                height: 450
            });

            SeatingChartManager._animateFLIPTransition(rBefore);

            // Vérifie que transform-origin est centré à 50% 50%
            expect(board.style.transformOrigin).toBe('50% 50%');
            expect(board.style.transform).toContain('scale(');
        });

        it('devrait interpoler l’échelle dans _animateFLIPTransition lors d’un lockToggle si l’utilisateur était zoomé', () => {
            const board = document.getElementById('scClassroomBoard');
            board.style.setProperty('--sc-scale', '1');
            const rBefore = { left: 100, top: 80, width: 750, height: 625 };

            const spy = vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
                left: 230,
                top: 80,
                width: 600,
                height: 500
            });

            // _animateFLIPTransition applique d'abord scale(1.25, 1.25) puis déclenche la transition vers scale(1, 1)
            SeatingChartManager._animateFLIPTransition(rBefore, { lockToggle: true });
            expect(board.style.transformOrigin).toBe('50% 50%');
            expect(board.style.transition).toContain('transform 0.54s cubic-bezier(0.28, 1.2, 0.46, 1)');

            spy.mockRestore();
        });

        it('devrait supporter le pinch-to-zoom à deux doigts et rebondir élastiquement vers le fitScale', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            SeatingChartManager._fitScale = 0.6;
            SeatingChartManager._zoomScale = 0.6;
            SeatingChartManager._isFitted = true;

            // Simuler pinchState avec un dézoom sous minScale (overshoot vers 0.35)
            const pinchState = {
                startDist: 200,
                startScale: 0.6,
                minScale: 0.6,
                maxScale: 1.5,
                initialMidX: 200,
                initialMidY: 200,
                boardRect: { left: 50, top: 50, width: 300, height: 300 },
                currentScale: 0.38,
                hasOverstretched: true
            };

            const hapticSpy = vi.spyOn(SeatingChartManager, '_haptic');
            const applySmartFitSpy = vi.spyOn(SeatingChartManager, '_applySmartFit');

            // Fin de geste sous le plafond min -> doit rebondir vers minScale (0.6)
            SeatingChartManager._endPinch(pinchState, gridArea);

            expect(hapticSpy).not.toHaveBeenCalled();
            expect(board.style.transition).toContain('transform');

            // Simuler transitionend
            board.dispatchEvent(new Event('transitionend'));

            expect(applySmartFitSpy).toHaveBeenCalledWith(true);
        });

        it('devrait supporter le pinch-to-zoom et rebondir vers maxScale lors d’un dépassement haut', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            SeatingChartManager._fitScale = 0.7;
            SeatingChartManager._zoomScale = 1.0;
            SeatingChartManager._isFitted = false;

            const pinchState = {
                startDist: 200,
                startScale: 1.0,
                minScale: 0.7,
                maxScale: 1.5,
                initialMidX: 200,
                initialMidY: 200,
                boardRect: { left: 50, top: 50, width: 300, height: 300 },
                currentScale: 1.85,
                hasOverstretched: true
            };

            const hapticSpy = vi.spyOn(SeatingChartManager, '_haptic');

            // Fin de geste au dessus du plafond max -> rebond vers maxScale (1.5)
            SeatingChartManager._endPinch(pinchState, gridArea);

            expect(hapticSpy).not.toHaveBeenCalled();
            expect(board.style.transition).toContain('transform');

            // Simuler transitionend
            board.dispatchEvent(new Event('transitionend'));

            expect(SeatingChartManager._zoomScale).toBe(1.5);
            expect(SeatingChartManager._isFitted).toBe(false);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('1.5');
        });

        it('devrait calculer et ancrer le transformOrigin sur le centre focal des deux doigts lors du pinch', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
                left: 100,
                top: 50,
                width: 400,
                height: 300
            });

            // Touche 1 à (150, 150), Touche 2 à (250, 250) -> Milieu (200, 200)
            // Origine relative au board: X = 200 - 100 = 100px, Y = 200 - 50 = 150px
            const touchStart = new Event('touchstart', { cancelable: true });
            touchStart.touches = [
                { clientX: 150, clientY: 150 },
                { clientX: 250, clientY: 250 }
            ];

            gridArea.dispatchEvent(touchStart);

            expect(board.style.transformOrigin).toBe('25.00% 50.00%');
            expect(SeatingChartManager._isPinching).toBe(true);

            // Simuler fin de geste
            const touchEnd = new Event('touchend');
            touchEnd.touches = [];
            gridArea.dispatchEvent(touchEnd);
            expect(SeatingChartManager._isPinching).toBe(false);
        });

        it('devrait supporter le double-tap tactile sur mobile pour basculer le zoom', () => {
            const gridArea = document.getElementById('scGridArea');
            const toggleZoomSpy = vi.spyOn(SeatingChartManager, '_toggleZoom');

            const now = Date.now();
            vi.spyOn(Date, 'now').mockReturnValue(now);

            // Premier tap
            const touchEnd1 = new Event('touchend', { cancelable: true });
            touchEnd1.touches = [];
            touchEnd1.changedTouches = [{ clientX: 150, clientY: 200 }];
            gridArea.dispatchEvent(touchEnd1);

            // Deuxième tap 120ms plus tard
            vi.spyOn(Date, 'now').mockReturnValue(now + 120);
            const touchEnd2 = new Event('touchend', { cancelable: true });
            touchEnd2.touches = [];
            touchEnd2.changedTouches = [{ clientX: 154, clientY: 202 }];
            gridArea.dispatchEvent(touchEnd2);

            expect(toggleZoomSpy).toHaveBeenCalled();
        });

        it('devrait supporter le zoom molette trackpad avec Ctrl sur ordinateur', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            SeatingChartManager._fitScale = 0.8;
            SeatingChartManager._zoomScale = 0.8;
            SeatingChartManager._isFitted = true;

            const wheelEvent = new WheelEvent('wheel', {
                deltaY: -100,
                ctrlKey: true,
                cancelable: true
            });

            gridArea.dispatchEvent(wheelEvent);

            expect(SeatingChartManager._zoomScale).toBeGreaterThan(0.8);
            expect(board.style.getPropertyValue('--sc-scale')).toBeTruthy();
        });

        it('devrait calculer un plafond de zoom généreux et adapté selon l’échelle d’ajustement', () => {
            expect(SeatingChartManager._getMaxZoomScale(0.4)).toBe(1.8);
            expect(SeatingChartManager._getMaxZoomScale(0.7)).toBe(1.96);
            expect(SeatingChartManager._getMaxZoomScale(0.8)).toBe(2.24);
            expect(SeatingChartManager._getMaxZoomScale(1.0)).toBe(2.5);
        });

        it('devrait déclencher un rebond élastique (overscroll bounce) sur les bords lors du scroll', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            const hapticSpy = vi.spyOn(SeatingChartManager, '_haptic');

            // Simuler un glissement au delà de la limite haute
            gridArea.scrollTop = 0;
            const touchStart = new Event('touchstart');
            touchStart.touches = [{ clientX: 200, clientY: 200 }];
            gridArea.dispatchEvent(touchStart);

            const touchMove = new Event('touchmove');
            touchMove.touches = [{ clientX: 200, clientY: 320 }]; // +120px vers le bas alors que scrollTop est 0
            gridArea.dispatchEvent(touchMove);

            expect(board.style.transform).toContain('translate3d');
            expect(hapticSpy).not.toHaveBeenCalled();

            // Relâchement
            const touchEnd = new Event('touchend');
            touchEnd.touches = [];
            gridArea.dispatchEvent(touchEnd);

            expect(board.style.transition).toContain('cubic-bezier');
            expect(board.style.transform).toBe('translate3d(0, 0, 0)');
        });

        it('devrait nettoyer le rebond d’overscroll à la fin de l’animation', () => {
            const board = document.getElementById('scClassroomBoard');
            board.style.transform = 'translate3d(0px, 30px, 0)';

            SeatingChartManager._releaseOverscrollBounce();

            expect(board.style.transform).toBe('translate3d(0, 0, 0)');
            expect(board.style.transition).toContain('0.42s');

            board.dispatchEvent(new Event('transitionend'));

            expect(board.style.transform).toBe('');
            expect(board.style.transition).toBe('');
        });

        it('devrait interrompre immédiatement la phase sortante d’un rebond d’impact si l’utilisateur pose le doigt pour repartir', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            SeatingChartManager._triggerEdgeImpactBounce(20, 15);
            expect(board.style.transition).toContain('0.09s');
            expect(board.style.transform).toBe('translate3d(20px, 15px, 0)');
            expect(SeatingChartManager._overscrollApexTimer).not.toBeNull();

            // L'utilisateur pose le doigt pendant les 85ms de poussée sortante
            const touchStart = new Event('touchstart');
            touchStart.touches = [{ clientX: 200, clientY: 200 }];
            gridArea.dispatchEvent(touchStart);

            expect(SeatingChartManager._overscrollApexTimer).toBeNull();
            expect(board.style.transition).toContain('0.22s');
            expect(board.style.transform).toBe('translate3d(0, 0, 0)');
        });

        it('devrait déclencher un rebond élastique sur le bord droit et le bord bas', async () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            // Configurer des dimensions simulant un dépassement scrollable
            Object.defineProperty(gridArea, 'scrollWidth', { value: 800, configurable: true });
            Object.defineProperty(gridArea, 'clientWidth', { value: 400, configurable: true });
            Object.defineProperty(gridArea, 'scrollHeight', { value: 600, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 300, configurable: true });
            // maxScrollX = 400, maxScrollY = 300

            // 1. Bord droit : scrollLeft est au max (399.5px, subpixel tolerance), glissement vers la gauche (deltaX < 0)
            gridArea.scrollLeft = 399.5;
            gridArea.scrollTop = 100;
            const touchStart = new Event('touchstart');
            touchStart.touches = [{ clientX: 200, clientY: 200 }];
            gridArea.dispatchEvent(touchStart);

            const touchMove = new Event('touchmove');
            touchMove.touches = [{ clientX: 100, clientY: 200 }]; // -100px vers la gauche
            gridArea.dispatchEvent(touchMove);

            expect(board.style.transform).toContain('translate3d');
            // ox doit être négatif (traction vers la gauche pour rebond droit)
            expect(board.style.transform).toMatch(/translate3d\(-[0-9.]+px/);

            // Relâchement
            const touchEnd = new Event('touchend');
            touchEnd.touches = [];
            gridArea.dispatchEvent(touchEnd);
            await new Promise(r => setTimeout(r, 100));
            expect(['translate3d(0, 0, 0)', '']).toContain(board.style.transform);

            // 2. Bord bas : scrollTop est au max (299px), glissement vers le haut (deltaY < 0)
            gridArea.scrollLeft = 100;
            gridArea.scrollTop = 299;
            const touchStart2 = new Event('touchstart');
            touchStart2.touches = [{ clientX: 200, clientY: 200 }];
            gridArea.dispatchEvent(touchStart2);

            const touchMove2 = new Event('touchmove');
            touchMove2.touches = [{ clientX: 200, clientY: 100 }]; // -100px vers le haut
            gridArea.dispatchEvent(touchMove2);

            expect(board.style.transform).toContain('translate3d');
            // oy doit être négatif (traction vers le haut pour rebond bas)
            expect(board.style.transform).toMatch(/translate3d\(0px, -[0-9.]+px/);

            const touchEnd2 = new Event('touchend');
            touchEnd2.touches = [];
            gridArea.dispatchEvent(touchEnd2);
            await new Promise(r => setTimeout(r, 100));
            expect(['translate3d(0, 0, 0)', '']).toContain(board.style.transform);
        });

        it('devrait amortir et déclencher le rebond d’impact lorsqu’un scroll inertiel heurte un bord', () => {
            const board = document.getElementById('scClassroomBoard');
            const hapticSpy = vi.spyOn(SeatingChartManager, '_haptic');

            // Bord gauche (positif)
            SeatingChartManager._triggerEdgeImpactBounce(28, 0);
            expect(hapticSpy).not.toHaveBeenCalled();
            expect(board.style.transition).toContain('0.09s');
            expect(board.style.transform).toBe('translate3d(28px, 0px, 0)');

            // Bord droit (négatif)
            SeatingChartManager._triggerEdgeImpactBounce(-24, 0);
            expect(board.style.transform).toBe('translate3d(-24px, 0px, 0)');

            // Bord bas (négatif)
            SeatingChartManager._triggerEdgeImpactBounce(0, -26);
            expect(board.style.transform).toBe('translate3d(0px, -26px, 0)');
        });

        it('devrait ramener directement la carte vers 0 sans poussée sortante parasite lors de _releaseOverscrollBounce', () => {
            const board = document.getElementById('scClassroomBoard');
            board.style.transform = 'translate3d(-20px, -25px, 0)';

            SeatingChartManager._releaseOverscrollBounce();

            expect(board.style.transition).toContain('0.42s');
            expect(board.style.transform).toBe('translate3d(0, 0, 0)');
        });

        it('devrait bloquer strictement les tooltips (isIgnoringTooltips) pendant tout le zoom à deux doigts et durant le cooldown post-geste', () => {
            const gridArea = document.getElementById('scGridArea');
            TooltipsUI.isIgnoringTooltips = false;

            const touchStart = new Event('touchstart', { cancelable: true });
            touchStart.touches = [
                { clientX: 140, clientY: 140 },
                { clientX: 260, clientY: 260 }
            ];
            gridArea.dispatchEvent(touchStart);

            // Dès le début du pinch à 2 doigts, le flag global bloque le timer hold (500ms) de Tippy
            expect(TooltipsUI.isIgnoringTooltips).toBe(true);

            const touchEnd = new Event('touchend');
            touchEnd.touches = [];
            gridArea.dispatchEvent(touchEnd);

            // Reste bloqué immédiatement après le relâchement pour absorber les événements synthétiques
            expect(TooltipsUI.isIgnoringTooltips).toBe(true);
        });

        it('devrait résorber progressivement l’overscroll au bord puis passer le relais au GPU dès que le scroll natif repart vers le centre', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            Object.defineProperty(gridArea, 'scrollWidth', { value: 800, configurable: true });
            Object.defineProperty(gridArea, 'clientWidth', { value: 400, configurable: true });
            Object.defineProperty(gridArea, 'scrollHeight', { value: 600, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 300, configurable: true });

            // Au bord gauche (scrollLeft = 0)
            gridArea.scrollLeft = 0;
            gridArea.scrollTop = 100;

            const touchStart = new Event('touchstart');
            touchStart.touches = [{ clientX: 200, clientY: 200 }];
            gridArea.dispatchEvent(touchStart);

            // Étirement au-delà du bord gauche (+80px vers la droite)
            const moveOut = new Event('touchmove');
            moveOut.touches = [{ clientX: 280, clientY: 200 }];
            gridArea.dispatchEvent(moveOut);

            const matchStretch = board.style.transform.match(/translate3d\(([0-9.]+)px/);
            expect(matchStretch).not.toBeNull();
            const stretchOx = parseFloat(matchStretch[1]);
            expect(stretchOx).toBeGreaterThan(10);

            // 1. Inversion du doigt tant que scrollLeft reste à 0 : l'étirement diminue progressivement
            const moveUnwind = new Event('touchmove');
            moveUnwind.touches = [{ clientX: 265, clientY: 200 }];
            gridArea.dispatchEvent(moveUnwind);

            const matchUnwind = board.style.transform.match(/translate3d\(([0-9.]+)px/);
            expect(matchUnwind).not.toBeNull();
            const unwindOx = parseFloat(matchUnwind[1]);
            expect(unwindOx).toBeGreaterThan(0);
            expect(unwindOx).toBeLessThan(stretchOx);

            // 2. Dès que le scroll natif repart vers le centre (scrollLeft = 5), relais immédiat par transition GPU fluide sans saccade
            gridArea.scrollLeft = 5;
            const moveBack = new Event('touchmove');
            moveBack.touches = [{ clientX: 250, clientY: 200 }];
            gridArea.dispatchEvent(moveBack);

            expect(board.style.transition).toContain('cubic-bezier');
            expect(board.style.transform).toBe('translate3d(0, 0, 0)');

            const touchEnd = new Event('touchend');
            touchEnd.touches = [];
            gridArea.dispatchEvent(touchEnd);
        });
    });

    describe('SeatingChartManager - Mode Édition Mobile & Tap-to-Place (2026 Gold Standard)', () => {
        beforeEach(() => {
            SeatingChartManager._gridState = [
                ['s1', 's2', null],
                [null, 's3', null]
            ];
            SeatingChartManager._students = [
                { id: 's1', prenom: 'Lucas', nom: 'Martin' },
                { id: 's2', prenom: 'Emma', nom: 'Bernard' },
                { id: 's3', prenom: 'Noah', nom: 'Dubois' },
                { id: 's4', prenom: 'Chloe', nom: 'Thomas' }
            ];
            SeatingChartManager._studentMap = new Map(SeatingChartManager._students.map(s => [s.id, s]));
            SeatingChartManager._isLocked = false;
            SeatingChartManager._orientation = 'teacher';
            SeatingChartManager._selectedChipIds = [];
            SeatingChartManager._closeMobileSheet();
        });

        it('devrait détecter la vue mobile selon la largeur d’écran', () => {
            const originalWidth = window.innerWidth;
            window.innerWidth = 390;
            expect(SeatingChartManager._isMobileView()).toBe(true);

            window.innerWidth = 1200;
            expect(SeatingChartManager._isMobileView()).toBe(false);
            window.innerWidth = originalWidth;
        });

        it('devrait trouver la position exacte d’un élève sur la grille', () => {
            expect(SeatingChartManager._findStudentGridPos('s1')).toEqual({ row: 0, col: 0 });
            expect(SeatingChartManager._findStudentGridPos('s2')).toEqual({ row: 0, col: 1 });
            expect(SeatingChartManager._findStudentGridPos('s3')).toEqual({ row: 1, col: 1 });
            expect(SeatingChartManager._findStudentGridPos('s4')).toBeNull();
        });

        it('devrait permuter (swap) deux élèves placés au clic avec trajectoire FLIP croisée et nettoyage en fin d’animation', () => {
            SeatingChartManager._swapGridPositions(0, 0, 0, 1);
            expect(SeatingChartManager._gridState[0][0]).toBe('s2');
            expect(SeatingChartManager._gridState[0][1]).toBe('s1');

            const cell1 = document.querySelector('.sc-cell[data-row="0"][data-col="0"]');
            const cell2 = document.querySelector('.sc-cell[data-row="0"][data-col="1"]');
            expect(cell1.classList.contains('sc-cell-swapped')).toBe(true);
            expect(cell2.classList.contains('sc-cell-swapped')).toBe(true);
            expect(cell2.classList.contains('sc-cell-swap-secondary')).toBe(true);
            expect(cell1.style.getPropertyValue('--swap-dx')).toBe('96px');
            expect(cell2.style.getPropertyValue('--swap-dx')).toBe('-96px');

            cell1.dispatchEvent(new Event('animationend'));
            cell2.dispatchEvent(new Event('animationend'));
            expect(cell1.classList.contains('sc-cell-swapped')).toBe(false);
            expect(cell2.classList.contains('sc-cell-swapped')).toBe(false);
            expect(cell2.classList.contains('sc-cell-swap-secondary')).toBe(false);
            expect(cell1.style.getPropertyValue('--swap-dx')).toBe('');
            expect(cell2.style.getPropertyValue('--swap-dx')).toBe('');
        });

        it('devrait en drag & drop faire rebondir sur place la cellule déposée et faire glisser (FLIP) la cellule permutée tout en nettoyant le clone de drag', () => {
            const ghostClone = document.createElement('div');
            ghostClone.className = 'sc-drag-clone';
            document.body.appendChild(ghostClone);

            SeatingChartManager._dragSource = { type: 'cell', resultId: 's1', row: 0, col: 0 };
            SeatingChartManager._handleDrop(1, 1);

            expect(document.querySelector('.sc-drag-clone')).toBeNull();
            expect(SeatingChartManager._gridState[0][0]).toBe('s3');
            expect(SeatingChartManager._gridState[1][1]).toBe('s1');

            const displacedCell = document.querySelector('.sc-cell[data-row="0"][data-col="0"]');
            const droppedCell = document.querySelector('.sc-cell[data-row="1"][data-col="1"]');
            expect(displacedCell.classList.contains('sc-cell-swapped')).toBe(true);
            expect(displacedCell.classList.contains('sc-cell-swap-dropped')).toBe(false);
            expect(displacedCell.style.getPropertyValue('--swap-dx')).toBe('96px');
            expect(displacedCell.style.getPropertyValue('--swap-dy')).toBe('104px');

            expect(droppedCell.classList.contains('sc-cell-swapped')).toBe(true);
            expect(droppedCell.classList.contains('sc-cell-swap-dropped')).toBe(true);
            expect(droppedCell.style.getPropertyValue('--swap-dx')).toBe('');

            displacedCell.dispatchEvent(new Event('animationend'));
            droppedCell.dispatchEvent(new Event('animationend'));
            expect(displacedCell.classList.contains('sc-cell-swapped')).toBe(false);
            expect(droppedCell.classList.contains('sc-cell-swapped')).toBe(false);
            expect(droppedCell.classList.contains('sc-cell-swap-dropped')).toBe(false);
        });

        it('devrait remplacer un élève par un élève non placé', () => {
            SeatingChartManager._replaceOccupantWithUnplaced(0, 0, 's4');
            expect(SeatingChartManager._gridState[0][0]).toBe('s4');
        });

        it('devrait ouvrir et fermer le Mobile Action Sheet pour un élève placé', () => {
            const student = SeatingChartManager._students[0];
            SeatingChartManager._openOccupiedCellSheet(0, 0, student);

            const sheet = document.getElementById('scMobileSheet');
            const backdrop = document.getElementById('scMobileSheetBackdrop');
            expect(sheet).not.toBeNull();
            expect(backdrop).not.toBeNull();
            expect(sheet.textContent).toContain('Lucas Martin');
            expect(sheet.querySelector('[data-action="move"]')).not.toBeNull();
            expect(sheet.querySelector('[data-action="remove"]')).not.toBeNull();
            expect(sheet.querySelector('[data-action="pin"]')).not.toBeNull();

            SeatingChartManager._closeMobileSheet();
            expect(SeatingChartManager._activeMobileSheet).toBeNull();
        });

        it('devrait ouvrir le Mobile Sheet pour une table vide avec sélecteur d’élèves trié A→Z par NOM Prénom et formaté avec .student-nom / .student-prenom', () => {
            SeatingChartManager._gridState = [
                ['s1', null, null],
                [null, null, null]
            ];
            // Non placés : s2 (Bernard Emma), s3 (Dubois Noah), s4 (Thomas Chloe)
            // Ajoutons un élève Azoulay Yanis à la fin pour vérifier le tri alphabétique par NOM
            SeatingChartManager._students.push({ id: 's5', prenom: 'Yanis', nom: 'Azoulay' });
            SeatingChartManager._studentMap.set('s5', SeatingChartManager._students[4]);

            SeatingChartManager._openEmptyCellSheet(0, 2, null);

            const sheet = document.getElementById('scMobileSheet');
            expect(sheet).not.toBeNull();
            expect(sheet.textContent).toContain('Rangée 1 • Table 3');
            expect(sheet.textContent).toContain('Attribuer à un élève non placé');
            expect(sheet.querySelector('[data-special-type="aisle"]')).not.toBeNull();

            const pickerNames = Array.from(sheet.querySelectorAll('#scSheetPickerList .sc-sheet-picker-name'));
            expect(pickerNames.map(el => el.textContent.trim())).toEqual([
                'AZOULAY Yanis',
                'BERNARD Emma',
                'DUBOIS Noah',
                'THOMAS Chloe'
            ]);
            expect(pickerNames[0].querySelector('.student-nom')?.textContent).toBe('AZOULAY');
            expect(pickerNames[0].querySelector('.student-prenom')?.textContent).toBe('Yanis');

            SeatingChartManager._closeMobileSheet();
            expect(SeatingChartManager._activeMobileSheet).toBeNull();
        });

        it('devrait convertir le libellé du clone de drag (.sc-drag-clone / .sc-touch-ghost) en Prénom seul sans homonyme et en Prénom N. avec homonyme', () => {
            const chip = document.createElement('div');
            chip.className = 'sc-student-chip sc-chip-new';
            chip.dataset.resultId = 's1';
            chip.innerHTML = `
                <div class="student-avatar">LM</div>
                <span class="sc-student-chip-name"><span class="student-nom">MARTIN</span> <span class="student-prenom">Lucas</span></span>
                <span class="sc-chip-badge sc-chip-badge-new">Nouveau</span>
            `;

            const mockDragEvent = {
                clientX: 120,
                clientY: 160,
                dataTransfer: { setDragImage: vi.fn() }
            };

            // 1. Sans homonyme dans la classe -> Prénom seul ("Lucas")
            SeatingChartManager._setCleanDragImage(mockDragEvent, chip, 1);
            const dragClone = document.querySelector('.sc-drag-clone');
            expect(dragClone).not.toBeNull();
            expect(dragClone.querySelector('.sc-student-chip-name')).toBeNull();
            expect(dragClone.querySelector('.sc-chip-badge')).toBeNull();
            const cellName = dragClone.querySelector('.sc-cell-name');
            expect(cellName).not.toBeNull();
            expect(cellName.textContent).toBe('Lucas');
            expect(cellName.querySelector('.sc-cell-initial')).toBeNull();
            SeatingChartManager._removeDragClones();

            SeatingChartManager._createTouchGhost(chip, { clientX: 120, clientY: 160 });
            const touchGhost = document.querySelector('.sc-touch-ghost');
            expect(touchGhost).not.toBeNull();
            expect(touchGhost.querySelector('.sc-student-chip-name')).toBeNull();
            expect(touchGhost.querySelector('.sc-chip-badge')).toBeNull();
            expect(touchGhost.querySelector('.sc-cell-name')?.textContent).toBe('Lucas');
            SeatingChartManager._removeTouchGhost();

            // 2. Avec un homonyme de prénom dans la classe -> "Lucas M."
            SeatingChartManager._students.push({ id: 's-homonym', nom: 'BERNARD', prenom: 'Lucas', seatingPos: null });
            SeatingChartManager._setCleanDragImage(mockDragEvent, chip, 1);
            const dragCloneHomonym = document.querySelector('.sc-drag-clone');
            const cellNameHomonym = dragCloneHomonym.querySelector('.sc-cell-name');
            expect(cellNameHomonym.textContent).toBe('Lucas M.');
            expect(cellNameHomonym.querySelector('.sc-cell-initial')?.textContent).toBe('M.');
            SeatingChartManager._removeDragClones();
        });

        it('devrait harmoniser le drag tactile en un état unique (désarmement du drag HTML5 natif, échelle --sc-drag-scale alignée sur le plateau, et 1 seule vibration que le geste parte en glissement immédiat ou en maintien)', () => {
            vi.useFakeTimers();
            try {
                SeatingChartManager._isFitted = true;
                SeatingChartManager._render();
                const board = document.getElementById('scClassroomBoard');
                board?.style.setProperty('--sc-scale', '0.75');

                const cell = document.querySelector('.sc-cell.occupied[data-row="0"][data-col="0"]');
                expect(cell).not.toBeNull();
                expect(cell.draggable).toBe(true);

                const hapticSpy = vi.spyOn(SeatingChartManager, '_haptic');

                // 1. Cas A : Glissement immédiat (< 200ms) sur une table du plateau ajusté (_isFitted = true)
                const ts = new Event('touchstart');
                ts.touches = [{ clientX: 100, clientY: 100 }];
                cell.dispatchEvent(ts);

                // Le drag HTML5 natif est immédiatement désarmé pendant l'appui tactile
                expect(cell.draggable).toBe(false);
                const nativeDragStart = new Event('dragstart', { cancelable: true });
                cell.dispatchEvent(nativeDragStart);
                expect(nativeDragStart.defaultPrevented).toBe(true);
                expect(document.querySelector('.sc-drag-clone')).toBeNull();

                // Mouvement de 4px (> 3px) à t = 30ms -> engage dès la 1ère frame de glissement l'état unique de drag tactile
                vi.advanceTimersByTime(30);
                const tm = new Event('touchmove', { cancelable: true });
                tm.touches = [{ clientX: 104, clientY: 100 }];
                cell.dispatchEvent(tm);

                const ghost = document.querySelector('.sc-touch-ghost');
                expect(ghost).not.toBeNull();
                expect(ghost.style.getPropertyValue('--sc-drag-scale')).toBe('0.75');
                expect(cell.classList.contains('dragging')).toBe(true);
                expect(hapticSpy).toHaveBeenCalledTimes(1);
                expect(hapticSpy).toHaveBeenCalledWith(18);

                // Franchissement du délai de maintien (115ms) pendant le déplacement : aucun second état ni seconde vibration
                vi.advanceTimersByTime(150);
                expect(hapticSpy).toHaveBeenCalledTimes(1);
                expect(document.querySelectorAll('.sc-touch-ghost').length).toBe(1);

                const te = new Event('touchend', { cancelable: true });
                te.touches = [];
                te.changedTouches = [{ clientX: 104, clientY: 100 }];
                cell.dispatchEvent(te);

                expect(document.querySelector('.sc-touch-ghost')).toBeNull(); vi.advanceTimersByTime(400);
                expect(cell.classList.contains('dragging')).toBe(false);
                expect(cell.draggable).toBe(true);

                // 2. Cas B : Maintien sur place (115ms) avant de bouger -> produit exactement le même état et la même échelle
                hapticSpy.mockClear();
                const tsHold = new Event('touchstart');
                tsHold.touches = [{ clientX: 100, clientY: 100 }];
                cell.dispatchEvent(tsHold);

                vi.advanceTimersByTime(115);
                const ghostHold = document.querySelector('.sc-touch-ghost');
                expect(ghostHold).not.toBeNull();
                expect(ghostHold.style.getPropertyValue('--sc-drag-scale')).toBe('0.75');
                expect(cell.classList.contains('dragging')).toBe(true);
                expect(hapticSpy).toHaveBeenCalledTimes(1);
                expect(hapticSpy).toHaveBeenCalledWith(18);

                const teHold = new Event('touchend', { cancelable: true });
                teHold.touches = [];
                teHold.changedTouches = [{ clientX: 100, clientY: 100 }];
                cell.dispatchEvent(teHold);

                expect(document.querySelector('.sc-touch-ghost')).toBeNull();
                vi.advanceTimersByTime(400);
                expect(cell.draggable).toBe(true);

                // 3. Cas C : Appui tactile sur un élève d'un binôme (.sc-stacked-member) extrait uniquement cet élève (group-member)
                SeatingChartManager._gridState[0][0] = ['s1', 's2'];
                SeatingChartManager._gridState[0][1] = null;
                SeatingChartManager._renderGrid();
                const stackedCell = document.querySelector('.sc-cell.sc-cell-stacked[data-row="0"][data-col="0"]');
                const memberPill = stackedCell.querySelector('.sc-stacked-member[data-result-id="s2"]');
                expect(memberPill).not.toBeNull();

                const tsMember = new Event('touchstart', { bubbles: true });
                tsMember.touches = [{ clientX: 110, clientY: 110 }];
                memberPill.dispatchEvent(tsMember);

                vi.advanceTimersByTime(200);
                const memberGhost = document.querySelector('.sc-touch-ghost');
                expect(memberGhost).not.toBeNull();
                expect(SeatingChartManager._touchSourceInfo).toEqual({
                    type: 'group-member',
                    resultId: 's2',
                    row: 0,
                    col: 0
                });
                expect(memberPill.classList.contains('dragging-member')).toBe(true);
                expect(memberGhost.querySelector('.sc-cell-name')?.textContent).toBe('Emma');

                const teMember = new Event('touchend', { cancelable: true });
                teMember.touches = [];
                teMember.changedTouches = [{ clientX: 110, clientY: 110 }];
                stackedCell.dispatchEvent(teMember);

                expect(document.querySelector('.sc-touch-ghost')).toBeNull();
                expect(memberPill.classList.contains('dragging-member')).toBe(false);
                vi.advanceTimersByTime(400);
                hapticSpy.mockRestore();
            } finally {
                vi.useRealTimers();
            }
        });

        it('devrait afficher uniquement le prénom sans homonyme et ajouter l’initiale uniquement en cas d’homonyme (y compris avec accents)', () => {
            const sShort = { id: 's-short-1', nom: 'DUPONT', prenom: 'Chloé' };
            const sLong = { id: 's-long-1', nom: 'DUPONT', prenom: 'Justin Nolan' };
            SeatingChartManager._students = [sShort, sLong];

            expect(SeatingChartManager._getStudentCellNameInfo(sShort).plain).toBe('Chloé');
            const infoSolo = SeatingChartManager._getStudentCellNameInfo(sLong);
            expect(infoSolo.plain).toBe('Justin Nolan');
            expect(infoSolo.isLong).toBe(true);
            expect(infoSolo.modifierClass).toContain('is-long-name');

            const sShortHomonym = { id: 's-short-2', nom: 'MARTIN', prenom: 'Chloe' };
            const sLongHomonym = { id: 's-long-2', nom: 'MARTIN', prenom: 'Justin Nolan' };
            SeatingChartManager._students = [sShort, sShortHomonym, sLong, sLongHomonym];

            expect(SeatingChartManager._getStudentCellNameInfo(sShort).plain).toBe('Chloé D.');
            expect(SeatingChartManager._getStudentCellNameInfo(sShortHomonym).plain).toBe('Chloe M.');

            const infoHomonym = SeatingChartManager._getStudentCellNameInfo(sLong);
            expect(infoHomonym.plain).toBe('Justin Nolan D.');
            expect(infoHomonym.isLong).toBe(true);
            expect(infoHomonym.isExtraLong).toBe(true);
            expect(infoHomonym.modifierClass).toContain('is-extra-long-name');
        });

        it('devrait sélectionner l’élève lors du clic sur Déplacer et fermer la feuille', () => {
            const student = SeatingChartManager._students[0];
            SeatingChartManager._openOccupiedCellSheet(0, 0, student);

            const moveBtn = document.querySelector('[data-action="move"]');
            expect(moveBtn).not.toBeNull();
            moveBtn.click();

            // La feuille doit être fermée
            expect(document.getElementById('scMobileSheet')).toBeNull();
            // L'élève doit être sélectionné pour le déplacement
            expect(SeatingChartManager._selectedChipIds).toEqual([student.id]);
            expect(SeatingChartManager._lastSelectedGridPos).toEqual({ row: 0, col: 0 });
        });

        it('devrait déplacer l’élève vers une case vide après sélection via Déplacer', () => {
            const student = SeatingChartManager._students[0];
            SeatingChartManager._openOccupiedCellSheet(0, 0, student);
            document.querySelector('[data-action="move"]').click();

            // Clic sur table vide (0, 2)
            const emptyCell = document.querySelector('.sc-cell[data-row="0"][data-col="2"]');
            expect(emptyCell).not.toBeNull();
            emptyCell.click();

            // L'élève s1 doit être à (0, 2) et (0, 0) doit être vide
            expect(SeatingChartManager._gridState[0][0]).toBeNull();
            expect(SeatingChartManager._gridState[0][2]).toBe('s1');
            expect(SeatingChartManager._selectedChipIds).toEqual([]);
        });

        it('devrait permuter deux élèves après sélection via Déplacer', () => {
            const student = SeatingChartManager._students[0];
            SeatingChartManager._openOccupiedCellSheet(0, 0, student);
            document.querySelector('[data-action="move"]').click();

            // Clic sur table occupée (0, 1) où se trouve s2
            const occupiedCell = document.querySelector('.sc-cell[data-row="0"][data-col="1"]');
            expect(occupiedCell).not.toBeNull();
            occupiedCell.click();

            // s1 et s2 doivent être permutés
            expect(SeatingChartManager._gridState[0][0]).toBe('s2');
            expect(SeatingChartManager._gridState[0][1]).toBe('s1');
            expect(SeatingChartManager._selectedChipIds).toEqual([]);
        });
    });

    describe('SeatingChartManager - Navigation Mobile & Touche Retour (HistoryManager)', () => {
        beforeEach(() => {
            HistoryManager.destroy();
            document.body.innerHTML = `
                <div class="main-content-wrapper" data-view="plan">
                    <div class="ui-segmented-control view-toggle" id="viewToggle">
                        <button class="ui-segment view-toggle-btn" data-view="list"></button>
                        <button class="ui-segment view-toggle-btn active" data-view="plan"></button>
                    </div>
                    <div id="seatingChartView" data-locked="true">
                        <div id="scLockBtn" class="locked"></div>
                        <div id="scPlacementPopover"></div>
                        <div id="scConfigPopover"></div>
                    </div>
                </div>
            `;
            SeatingChartManager._isLocked = true;
        });

        afterEach(() => {
            HistoryManager.destroy();
        });

        it('devrait empiler seatingChartEdit dans HistoryManager lors du passage en mode édition', () => {
            SeatingChartManager._toggleLock();
            expect(SeatingChartManager._isLocked).toBe(false);
            expect(HistoryManager.isOpen('seatingChartEdit')).toBe(true);
        });

        it('devrait quitter le mode édition et verrouiller le plan lors du popstate / retour', () => {
            SeatingChartManager._toggleLock();
            expect(SeatingChartManager._isLocked).toBe(false);

            // Simuler la touche retour du mobile
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

            expect(SeatingChartManager._isLocked).toBe(true);
            expect(HistoryManager.isOpen('seatingChartEdit')).toBe(false);
        });

        it('devrait empiler scMobileSheet dans HistoryManager lors de l’ouverture d’une feuille mobile', () => {
            SeatingChartManager._openEmptyCellSheet(0, 0, null);
            expect(HistoryManager.isOpen('scMobileSheet')).toBe(true);

            // Retour ferme le sheet
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(HistoryManager.isOpen('scMobileSheet')).toBe(false);
            expect(document.querySelector('.sc-mobile-sheet')).toBeNull();
        });

        it('devrait empiler les popovers de config et d’agencement', () => {
            SeatingChartManager._openConfigPopover();
            expect(HistoryManager.isOpen('scConfigPopover')).toBe(true);

            // Retour ferme le popover
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
            expect(HistoryManager.isOpen('scConfigPopover')).toBe(false);
            expect(SeatingChartManager._configPopoverOpen).toBe(false);
        });

        it('devrait formater le tooltip de l’élève en vue Plan sous la forme Prénom NOM', () => {
            const student = { id: 's-tooltip-test', nom: 'Vervy', prenom: 'Paul' };
            SeatingChartManager._isLocked = true;
            SeatingChartManager._studentMap = new Map([['s-tooltip-test', student]]);
            SeatingChartManager._gridState = [['s-tooltip-test']];

            const cell = SeatingChartManager._createCell(0, 0);

            expect(cell.getAttribute('data-tooltip')).toBe('Paul VERVY');
        });
    });

    describe('Drag & Drop après déverrouillage d\'un plan validé', () => {
        let testClass;

        beforeEach(() => {
            testClass = ClassManager.createClass('3ème Alpha');
            appState.currentClassId = testClass.id;
            userSettings.academic.currentClassId = testClass.id;

            appState.generatedResults = [
                { id: 's-unlock-1', classId: testClass.id, nom: 'Hugo', prenom: 'Victor', seatingPosition: { row: 0, col: 0 } },
                { id: 's-unlock-2', classId: testClass.id, nom: 'Sand', prenom: 'George', seatingPosition: null }
            ];

            document.body.innerHTML = `
                <div id="seatingChartView" data-locked="true">
                    <div id="scLockBtn" class="sc-toggle-switch locked"></div>
                    <button id="scUnlockFloatingBtn"></button>
                    <div id="scGridContainer"></div>
                    <div id="scSidebarTitle"></div>
                    <div id="scFooterInfo"></div>
                </div>
            `;

            SeatingChartManager._isLocked = true;
            testClass.seatingLocked = true;
            SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
            SeatingChartManager._initGrid(2, 2);
            SeatingChartManager._loadPositionsFromState();
        });

        it('devrait rendre le drag and drop immédiatement opérationnel dès le déverrouillage sans clic-déplacement préalable', () => {
            // Le plan est affiché verrouillé (plan validé)
            SeatingChartManager._isLocked = true;
            SeatingChartManager._renderGrid();

            const cell = document.querySelector('.sc-cell.occupied[data-row="0"][data-col="0"]');
            expect(cell).not.toBeNull();
            expect(cell.draggable).toBe(false);

            // Simuler un essai de dragstart pendant que c'est verrouillé
            const dragStartLocked = new Event('dragstart', { bubbles: true, cancelable: true });
            dragStartLocked.dataTransfer = {
                setData: vi.fn(),
                setDragImage: vi.fn(),
                effectAllowed: 'none'
            };
            cell.dispatchEvent(dragStartLocked);

            // Doit être annulé et aucun _dragSource enregistré
            expect(dragStartLocked.defaultPrevented).toBe(true);
            expect(SeatingChartManager._dragSource).toBeNull();

            // L'utilisateur déverrouille le plan pour l'éditer
            SeatingChartManager._toggleLock();
            expect(SeatingChartManager._isLocked).toBe(false);
            expect(cell.draggable).toBe(true);

            // Immédiatement (sans aucun clic ni swap préalable), l'utilisateur commence à glisser la cellule
            const dragStartUnlocked = new Event('dragstart', { bubbles: true, cancelable: true });
            dragStartUnlocked.dataTransfer = {
                setData: vi.fn(),
                setDragImage: vi.fn(),
                effectAllowed: 'none'
            };
            cell.dispatchEvent(dragStartUnlocked);

            // Le dragstart doit fonctionner immédiatement !
            expect(dragStartUnlocked.defaultPrevented).toBe(false);
            expect(SeatingChartManager._dragSource).toEqual({
                type: 'cell',
                resultId: 's-unlock-1',
                row: 0,
                col: 0
            });
            expect(dragStartUnlocked.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 's-unlock-1');

            // Déposer sur la case (0, 1) vide
            SeatingChartManager._handleDrop(0, 1);
            expect(SeatingChartManager._gridState[0][0]).toBeNull();
            expect(SeatingChartManager._gridState[0][1]).toBe('s-unlock-1');
        });
    });

    describe('SeatingChartManager - Recherche Spatiale & Spotlight', () => {
        let classTest, classOther;

        beforeEach(() => {
            document.body.innerHTML = `
                <div class="main-content-wrapper" data-view="plan">
                    <div class="main-content">
                        <div class="output-section"></div>
                    </div>
                </div>
            `;

            userSettings.academic.classes = [];
            userSettings.academic.currentClassId = null;
            classTest = ClassManager.createClass('4ème C');
            classOther = ClassManager.createClass('3ème A');

            appState.currentClassId = classTest.id;
            userSettings.academic.currentClassId = classTest.id;

            appState.generatedResults = [
                { id: 's1', classId: classTest.id, nom: 'DUPONT', prenom: 'Lucas', studentData: {} },
                { id: 's2', classId: classTest.id, nom: 'MARTIN', prenom: 'Sophie', studentData: {} },
                { id: 's3', classId: classTest.id, nom: 'BERNARD', prenom: 'Lucas', studentData: {} },
                { id: 's-other', classId: classOther.id, nom: 'LAMBERT', prenom: 'Emma', studentData: {} }
            ];

            SeatingChartManager.init();
            SeatingChartManager._students = appState.generatedResults.filter(r => r.classId === classTest.id);
            SeatingChartManager._initGrid(2, 2);
            SeatingChartManager._gridState[0][0] = 's1';
            SeatingChartManager._gridState[0][1] = 's2';
            SeatingChartManager._gridState[1][0] = 's3';
            SeatingChartManager._renderGrid();
        });

        it('devrait ouvrir et fermer la capsule de recherche flottante', () => {
            expect(SeatingChartManager._isSearchOpen()).toBe(false);

            SeatingChartManager._openSearch();
            expect(SeatingChartManager._isSearchOpen()).toBe(true);
            expect(document.getElementById('scFloatingSearch').classList.contains('open')).toBe(true);

            SeatingChartManager._closeSearch();
            expect(SeatingChartManager._isSearchOpen()).toBe(false);
            expect(document.getElementById('scFloatingSearch').classList.contains('open')).toBe(false);
        });

        it('devrait mettre en évidence (spotlight) l’élève unique et atténuer les autres', () => {
            SeatingChartManager._applySearchHighlight('sophie');

            const view = document.getElementById('seatingChartView');
            expect(view.classList.contains('sc-search-active')).toBe(true);

            const countBadge = document.getElementById('scFloatingSearchCount');
            expect(countBadge.textContent).toBe('1');

            const cellSophie = document.querySelector('.sc-cell[data-result-id="s2"]');
            expect(cellSophie.classList.contains('sc-spotlight-match')).toBe(true);
            expect(cellSophie.classList.contains('sc-spotlight-single')).toBe(true);

            const cellDupont = document.querySelector('.sc-cell[data-result-id="s1"]');
            expect(cellDupont.classList.contains('sc-spotlight-dimmed')).toBe(true);
            expect(cellDupont.classList.contains('sc-spotlight-match')).toBe(false);
        });

        it('devrait gérer les correspondances multiples sans le pulse unique', () => {
            SeatingChartManager._applySearchHighlight('lucas');

            const countBadge = document.getElementById('scFloatingSearchCount');
            expect(countBadge.textContent).toBe('2');

            const cellS1 = document.querySelector('.sc-cell[data-result-id="s1"]');
            const cellS3 = document.querySelector('.sc-cell[data-result-id="s3"]');
            const cellS2 = document.querySelector('.sc-cell[data-result-id="s2"]');

            expect(cellS1.classList.contains('sc-spotlight-match')).toBe(true);
            expect(cellS1.classList.contains('sc-spotlight-single')).toBe(false);
            expect(cellS3.classList.contains('sc-spotlight-match')).toBe(true);
            expect(cellS3.classList.contains('sc-spotlight-single')).toBe(false);
            expect(cellS2.classList.contains('sc-spotlight-dimmed')).toBe(true);
        });

        it('devrait réinitialiser la vue quand le terme est vide', () => {
            SeatingChartManager._applySearchHighlight('sophie');
            expect(document.getElementById('seatingChartView').classList.contains('sc-search-active')).toBe(true);

            SeatingChartManager._applySearchHighlight('');
            expect(document.getElementById('seatingChartView').classList.contains('sc-search-active')).toBe(false);

            const cells = document.querySelectorAll('.sc-cell');
            cells.forEach(cell => {
                expect(cell.classList.contains('sc-spotlight-match')).toBe(false);
                expect(cell.classList.contains('sc-spotlight-dimmed')).toBe(false);
            });
        });

        it('devrait proposer une autre classe en cas d’absence dans la classe courante', () => {
            SeatingChartManager._applySearchHighlight('lambert');

            const countBadge = document.getElementById('scFloatingSearchCount');
            expect(countBadge.textContent).toBe('0');
            expect(countBadge.classList.contains('sc-count-zero')).toBe(true);

            const suggestions = document.getElementById('scFloatingSearchSuggestions');
            expect(suggestions.style.display).toBe('block');
            expect(suggestions.innerHTML).toContain('3ème A');
            expect(suggestions.innerHTML).toContain('Emma LAMBERT');
        });

        it('devrait ouvrir le FocusPanel sur Entrée en mode consultation (verrouillé)', () => {
            const openSpy = vi.spyOn(FocusPanelManager, 'open').mockImplementation(() => {});
            SeatingChartManager._isLocked = true;

            SeatingChartManager._handleSearchEnter('sophie');
            expect(openSpy).toHaveBeenCalledWith('s2');

            openSpy.mockRestore();
        });

        it('devrait sélectionner la carte sur Entrée en mode édition (déverrouillé)', () => {
            SeatingChartManager._isLocked = false;
            SeatingChartManager._clearSelection();

            SeatingChartManager._handleSearchEnter('sophie');
            expect(SeatingChartManager._selectedChipIds).toContain('s2');
        });

        it('devrait cycler entre plusieurs correspondances lors d’appuis successifs sur Entrée', () => {
            const openSpy = vi.spyOn(FocusPanelManager, 'open').mockImplementation(() => {});
            SeatingChartManager._isLocked = true;
            SeatingChartManager._searchMatchIndex = 0;

            // 1er appui sur Entrée : premier match (s1 Lucas DUPONT)
            SeatingChartManager._handleSearchEnter('lucas');
            expect(openSpy).toHaveBeenCalledWith('s1');

            // 2e appui sur Entrée : second match (s3 Lucas BERNARD)
            SeatingChartManager._handleSearchEnter('lucas');
            expect(openSpy).toHaveBeenCalledWith('s3');

            const countBadge = document.getElementById('scFloatingSearchCount');
            expect(countBadge.textContent).toBe('2/2');

            openSpy.mockRestore();
        });

        it('devrait basculer de classe lors du clic sur la suggestion cross-classe', async () => {
            const switchSpy = vi.spyOn(SeatingChartManager, '_switchClassFromSearch').mockResolvedValue();

            SeatingChartManager._applySearchHighlight('lambert');
            const actionBtn = document.querySelector('.sc-cross-action');
            expect(actionBtn).not.toBeNull();
            expect(actionBtn.dataset.classId).toBe(classOther.id);
            expect(actionBtn.dataset.studentId).toBe('s-other');

            actionBtn.click();
            expect(switchSpy).toHaveBeenCalledWith(classOther.id, 's-other', 'lambert');

            switchSpy.mockRestore();
        });

        it('devrait basculer de classe sur Entrée si l’élève est trouvé dans une autre classe', async () => {
            const switchSpy = vi.spyOn(SeatingChartManager, '_switchClassFromSearch').mockResolvedValue();

            await SeatingChartManager._handleSearchEnter('lambert');
            expect(switchSpy).toHaveBeenCalledWith(classOther.id, 's-other', 'lambert');

            switchSpy.mockRestore();
        });

        it('devrait maintenir la barre de recherche ouverte et focaliser l’élève après bascule', async () => {
            const classSwitchSpy = vi.spyOn(ClassUIManager, 'handleClassSwitch').mockResolvedValue();
            const focusSpy = vi.spyOn(SeatingChartManager, '_focusStudentAfterSwitch').mockImplementation(() => {});
            const highlightSpy = vi.spyOn(SeatingChartManager, '_applySearchHighlight').mockImplementation(() => {});
            
            await SeatingChartManager._switchClassFromSearch(classOther.id, 's-other', 'lambert');

            expect(classSwitchSpy).toHaveBeenCalledWith(classOther.id, 's-other');
            expect(document.getElementById('scFloatingSearch').classList.contains('open')).toBe(true);
            expect(document.getElementById('scFloatingSearchInput').value).toBe('lambert');
            expect(highlightSpy).toHaveBeenCalledWith('lambert');
            expect(focusSpy).toHaveBeenCalledWith('s-other');

            classSwitchSpy.mockRestore();
            focusSpy.mockRestore();
            highlightSpy.mockRestore();
        });

        it('devrait réinitialiser la recherche de la vue Liste et masquer Autres classes lors du passage en vue Plan', () => {
            const clearListSpy = vi.spyOn(CrossClassSearchManager, 'clearListSearch');
            const wrapper = document.querySelector('.main-content-wrapper');
            if (wrapper) wrapper.dataset.view = 'list';
            SeatingChartManager._isActive = false;

            SeatingChartManager.switchToView('plan', { immediate: true });

            expect(clearListSpy).toHaveBeenCalledWith({ renderList: true, immediate: true });
            clearListSpy.mockRestore();
        });
    });

    describe('SeatingChartManager - Ergonomie avancée et raccourcis', () => {
        it('devrait déclencher _undo sur Ctrl+Z et _redo sur Ctrl+Y / Ctrl+Shift+Z', () => {
            const undoSpy = vi.spyOn(SeatingChartManager, '_undo').mockImplementation(() => {});
            const redoSpy = vi.spyOn(SeatingChartManager, '_redo').mockImplementation(() => {});

            SeatingChartManager._isActive = true;

            // Ctrl+Z -> Undo
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
            expect(undoSpy).toHaveBeenCalledTimes(1);

            // Cmd+Z (Mac) -> Undo
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }));
            expect(undoSpy).toHaveBeenCalledTimes(2);

            // Ctrl+Shift+Z -> Redo
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
            expect(redoSpy).toHaveBeenCalledTimes(1);

            // Ctrl+Y -> Redo
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
            expect(redoSpy).toHaveBeenCalledTimes(2);

            undoSpy.mockRestore();
            redoSpy.mockRestore();
        });

        it('ne devrait pas intercepter Ctrl+Z lorsque l’utilisateur saisit du texte', () => {
            const undoSpy = vi.spyOn(SeatingChartManager, '_undo').mockImplementation(() => {});

            const input = document.createElement('input');
            document.body.appendChild(input);
            input.focus();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
            expect(undoSpy).not.toHaveBeenCalled();

            document.body.removeChild(input);
            undoSpy.mockRestore();
        });

        it('devrait basculer le zoom lors d’un double-clic sur le fond de la grille', () => {
            const gridArea = document.getElementById('scGridArea');
            const toggleSpy = vi.spyOn(SeatingChartManager, '_toggleZoom').mockImplementation(() => {});

            // Double-clic sur l'espace vide
            gridArea.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            expect(toggleSpy).toHaveBeenCalledTimes(1);

            // Double-clic sur une cellule élève -> ne doit pas zoomer
            const cell = document.querySelector('.sc-cell');
            if (cell) {
                cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                expect(toggleSpy).toHaveBeenCalledTimes(1);
            }

            toggleSpy.mockRestore();
        });

        it('devrait déclencher un rebond élastique visuel d’impact aux bords sans vibration', () => {
            const board = document.getElementById('scClassroomBoard');
            const hapticSpy = vi.spyOn(SeatingChartManager, '_haptic');

            SeatingChartManager._triggerEdgeImpactBounce(20, 0);

            expect(board.style.transform).toBe('translate3d(20px, 0px, 0)');
            expect(hapticSpy).not.toHaveBeenCalled();

            hapticSpy.mockRestore();
        });

        it('devrait respecter strictement les plafonds de zoom et ne jamais permettre de dézoomer sous _fitScale', async () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            const initialFit = 0.75;
            SeatingChartManager._fitScale = initialFit;
            SeatingChartManager._zoomScale = initialFit;
            SeatingChartManager._isFitted = true;
            board.style.setProperty('--sc-scale', initialFit.toString());

            // Dézoom violent au trackpad (deltaY très positif)
            const zoomOutEvent = new WheelEvent('wheel', {
                deltaY: 500,
                ctrlKey: true,
                cancelable: true,
                bubbles: true
            });
            gridArea.dispatchEvent(zoomOutEvent);

            // Le zoom ne doit JAMAIS descendre en dessous du plafond minScale (0.75)
            expect(SeatingChartManager._zoomScale).toBeGreaterThanOrEqual(initialFit);
            expect(SeatingChartManager._fitScale).toBe(initialFit);
            expect(board.style.getPropertyValue('--sc-scale')).toBe('0.75');
            expect(SeatingChartManager._isFitted).toBe(true);

            // Zoom avant maximal (deltaY négatif important)
            const maxScale = SeatingChartManager._getMaxZoomScale(initialFit);
            for (let i = 0; i < 10; i++) {
                gridArea.dispatchEvent(new WheelEvent('wheel', {
                    deltaY: -300,
                    ctrlKey: true,
                    cancelable: true,
                    bubbles: true
                }));
            }

            // Ne doit pas dépasser maxScale
            expect(SeatingChartManager._zoomScale).toBeLessThanOrEqual(maxScale);

            // Simuler la fin du geste de zoom (déclenchement du debounce timer)
            await new Promise(r => setTimeout(r, 180));

            // _fitScale doit toujours rester strictement invariant
            expect(SeatingChartManager._fitScale).toBe(initialFit);
        });

        it('devrait arrêter net le zoom au trackpad sur les plafonds min et max sans dériver', async () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            const initialFit = 0.75;
            SeatingChartManager._fitScale = initialFit;
            SeatingChartManager._zoomScale = initialFit;
            SeatingChartManager._isFitted = true;
            board.style.setProperty('--sc-scale', initialFit.toString());

            const flipSpy = vi.spyOn(SeatingChartManager, '_animateFLIPTransition');

            // Pincement vers le bas (dézoom au trackpad)
            gridArea.dispatchEvent(new WheelEvent('wheel', {
                deltaY: 150,
                ctrlKey: true,
                cancelable: true,
                bubbles: true
            }));

            // Arrêt net sans dépasser minScale et sans oscillation différée
            expect(SeatingChartManager._zoomScale).toBe(initialFit);
            expect(SeatingChartManager._fitScale).toBe(initialFit);
            expect(SeatingChartManager._isFitted).toBe(true);

            // Attente du timer de debounce (120ms)
            await new Promise(r => setTimeout(r, 160));

            // Sur trackpad de bureau, aucun FLIP artificiel différé qui causerait un décalage
            expect(flipSpy).not.toHaveBeenCalled();
            expect(SeatingChartManager._fitScale).toBe(initialFit);
            expect(SeatingChartManager._zoomScale).toBe(initialFit);

            // Zoom avant maximal au trackpad
            const maxScale = SeatingChartManager._getMaxZoomScale(initialFit);
            for (let i = 0; i < 15; i++) {
                gridArea.dispatchEvent(new WheelEvent('wheel', {
                    deltaY: -150,
                    ctrlKey: true,
                    cancelable: true,
                    bubbles: true
                }));
            }

            expect(SeatingChartManager._zoomScale).toBe(maxScale);
            await new Promise(r => setTimeout(r, 160));
            expect(SeatingChartManager._zoomScale).toBe(maxScale);
            expect(flipSpy).not.toHaveBeenCalled();

            flipSpy.mockRestore();
        });

        it('devrait déclencher un rebond FLIP doux en tactile lors du relâchement au-delà des plafonds', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            const initialFit = 0.75;
            SeatingChartManager._fitScale = initialFit;
            SeatingChartManager._zoomScale = 1.0;
            SeatingChartManager._isFitted = false;
            board.style.setProperty('--sc-scale', '1');

            const flipSpy = vi.spyOn(SeatingChartManager, '_animateFLIPTransition');
            const maxScale = SeatingChartManager._getMaxZoomScale(initialFit);

            // Simulation d'un geste tactile relâché au-delà du maxScale
            SeatingChartManager._endPinch({
                startScale: 1.0,
                currentScale: maxScale * 1.15,
                minScale: initialFit,
                maxScale: maxScale,
                currentMidX: 200,
                currentMidY: 200,
                initialMidX: 200,
                initialMidY: 200,
                boardRect: { left: 50, top: 50, width: 400, height: 300 }
            }, gridArea);

            // Doit revenir à maxScale avec transition FLIP douce
            expect(SeatingChartManager._zoomScale).toBe(maxScale);
            expect(flipSpy).toHaveBeenCalled();

            flipSpy.mockRestore();
        });

        it('ne doit pas sauter en haut à gauche (0, 0) lors d\'un zoom tactile centré', () => {
            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');

            const initialFit = 0.75;
            SeatingChartManager._fitScale = initialFit;
            SeatingChartManager._zoomScale = 1.0;
            SeatingChartManager._isFitted = false;
            board.style.setProperty('--sc-scale', '1');

            Object.defineProperty(gridArea, 'scrollWidth', { value: 1200, configurable: true });
            Object.defineProperty(gridArea, 'clientWidth', { value: 600, configurable: true });
            Object.defineProperty(gridArea, 'scrollHeight', { value: 1000, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 500, configurable: true });

            board.getBoundingClientRect = () => ({
                left: 100,
                top: 80,
                width: 800,
                height: 600
            });

            SeatingChartManager._endPinch({
                startScale: 0.75,
                currentScale: 1.0,
                minScale: initialFit,
                maxScale: 1.5,
                currentMidX: 300,
                currentMidY: 250,
                initialMidX: 300,
                initialMidY: 250,
                originPercentX: 50,
                originPercentY: 50,
                boardRect: { left: 100, top: 80, width: 800, height: 600 }
            }, gridArea);

            expect(gridArea.scrollLeft).toBeGreaterThan(0);
            expect(gridArea.scrollTop).toBeGreaterThan(0);
        });
    });

    describe('Glisser-déposer vers la réserve / panneau latéral (Unseating via Sidebar Drop)', () => {
        let testClass;

        beforeEach(() => {
            testClass = ClassManager.createClass('4ème B');
            appState.currentClassId = testClass.id;
            userSettings.academic.currentClassId = testClass.id;

            appState.generatedResults = [
                { id: 's-drop-1', classId: testClass.id, nom: 'Curie', prenom: 'Marie', seatingPosition: { row: 0, col: 0 } },
                { id: 's-drop-2', classId: testClass.id, nom: 'Pasteur', prenom: 'Louis', seatingPosition: { row: 0, col: 1 } },
                { id: 's-drop-3', classId: testClass.id, nom: 'Lovelace', prenom: 'Ada', seatingPosition: null }
            ];

            document.body.innerHTML = `
                <div id="seatingChartView" data-locked="false">
                    <div class="sc-sidebar" id="scSidebar">
                        <div class="sc-sidebar-toolbar">
                            <div id="scLockBtn" class="sc-toggle-switch"></div>
                            <button id="scUndoBtn" disabled></button>
                            <button id="scRedoBtn" disabled></button>
                        </div>
                        <div class="sc-sidebar-header">
                            <div id="scSidebarTitle"></div>
                            <span id="scFooterInfo"></span>
                            <input type="text" id="scSearchInput" class="custom-input">
                            <button id="scSearchClear"></button>
                        </div>
                        <div class="sc-student-list" id="scStudentList"></div>
                    </div>
                    <div class="sc-grid-area" id="scGridArea">
                        <div id="scGridContainer"></div>
                    </div>
                </div>
            `;

            SeatingChartManager._isLocked = false;
            testClass.seatingLocked = false;
            SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
            SeatingChartManager._initGrid(2, 2);
            SeatingChartManager._loadPositionsFromState();
            SeatingChartManager._renderGrid();
            SeatingChartManager._renderSidebar();
            SeatingChartManager._setupEventListeners();
        });

        it('devrait ajouter la classe drag-over sur la sidebar et sc-drag-over-sidebar sur body lors du dragenter/dragover d\'un élève du plan', () => {
            const sidebar = document.getElementById('scSidebar');
            expect(sidebar.classList.contains('drag-over')).toBe(false);
            expect(document.body.classList.contains('sc-drag-over-sidebar')).toBe(false);

            SeatingChartManager._dragSource = { type: 'cell', resultId: 's-drop-1', row: 0, col: 0 };

            const dragEnterEv = new Event('dragenter', { bubbles: true, cancelable: true });
            sidebar.dispatchEvent(dragEnterEv);
            expect(sidebar.classList.contains('drag-over')).toBe(true);
            expect(document.body.classList.contains('sc-drag-over-sidebar')).toBe(true);

            const dragOverEv = new Event('dragover', { bubbles: true, cancelable: true });
            sidebar.dispatchEvent(dragOverEv);
            expect(dragOverEv.defaultPrevented).toBe(true);
            expect(sidebar.classList.contains('drag-over')).toBe(true);
            expect(document.body.classList.contains('sc-drag-over-sidebar')).toBe(true);

            const dragLeaveEv = new Event('dragleave', { bubbles: true, cancelable: true });
            sidebar.dispatchEvent(dragLeaveEv);
            expect(sidebar.classList.contains('drag-over')).toBe(false);
            expect(document.body.classList.contains('sc-drag-over-sidebar')).toBe(false);
        });

        it('devrait désassigner un élève et le replacer dans la réserve lors du drop sur la sidebar', () => {
            const sidebar = document.getElementById('scSidebar');
            expect(SeatingChartManager._gridState[0][0]).toBe('s-drop-1');

            SeatingChartManager._dragSource = { type: 'cell', resultId: 's-drop-1', row: 0, col: 0 };

            vi.useFakeTimers();
            const dropEv = new Event('drop', { bubbles: true, cancelable: true });
            sidebar.dispatchEvent(dropEv);

            expect(dropEv.defaultPrevented).toBe(true);
            vi.advanceTimersByTime(400);

            expect(SeatingChartManager._gridState[0][0]).toBeNull();
            expect(sidebar.classList.contains('drag-over')).toBe(false);

            // Vérifier que l'état appState est bien mis à jour
            const studentResult = appState.generatedResults.find(r => r.id === 's-drop-1');
            expect(studentResult.seatingPosition).toBeNull();

            // Vérifier que l'élève apparaît dans la réserve non placée
            const unplaced = SeatingChartManager._getUnplacedStudents();
            expect(unplaced.some(s => s.id === 's-drop-1')).toBe(true);

            vi.useRealTimers();
        });

        it('devrait supporter le drop multi-élèves sur la sidebar pour désassigner plusieurs élèves', () => {
            const sidebar = document.getElementById('scSidebar');
            expect(SeatingChartManager._gridState[0][0]).toBe('s-drop-1');
            expect(SeatingChartManager._gridState[0][1]).toBe('s-drop-2');

            SeatingChartManager._selectedChipIds = ['s-drop-1', 's-drop-2'];
            SeatingChartManager._dragSource = { type: 'multi-cell', ids: ['s-drop-1', 's-drop-2'] };

            vi.useFakeTimers();
            const dropEv = new Event('drop', { bubbles: true, cancelable: true });
            sidebar.dispatchEvent(dropEv);

            expect(dropEv.defaultPrevented).toBe(true);
            expect(SeatingChartManager._gridState[0][0]).toBeNull();
            expect(SeatingChartManager._gridState[0][1]).toBeNull();

            vi.advanceTimersByTime(400);
            expect(SeatingChartManager._selectedChipIds).toEqual([]);

            const r1 = appState.generatedResults.find(r => r.id === 's-drop-1');
            const r2 = appState.generatedResults.find(r => r.id === 's-drop-2');
            expect(r1.seatingPosition).toBeNull();
            expect(r2.seatingPosition).toBeNull();

            vi.useRealTimers();
        });

        it('ne doit pas autoriser le drop sur la sidebar si le plan est verrouillé (Consultation)', () => {
            const sidebar = document.getElementById('scSidebar');
            SeatingChartManager._isLocked = true;
            SeatingChartManager._dragSource = { type: 'cell', resultId: 's-drop-1', row: 0, col: 0 };

            const dropEv = new Event('drop', { bubbles: true, cancelable: true });
            sidebar.dispatchEvent(dropEv);

            expect(dropEv.defaultPrevented).toBe(false);
            expect(SeatingChartManager._gridState[0][0]).toBe('s-drop-1');
        });

        it('devrait déclencher la classe sc-sidebar-receiving lors de l\'appel à _pulseSidebarReceiving', () => {
            const sidebar = document.getElementById('scSidebar');
            expect(sidebar.classList.contains('sc-sidebar-receiving')).toBe(false);

            SeatingChartManager._pulseSidebarReceiving();
            expect(sidebar.classList.contains('sc-sidebar-receiving')).toBe(true);

            sidebar.dispatchEvent(new Event('animationend'));
            expect(sidebar.classList.contains('sc-sidebar-receiving')).toBe(false);
        });

        it('devrait déclencher le pulse d\'accueil du volet lors de la désassignation via la croix (_removeFromCell)', () => {
            const sidebar = document.getElementById('scSidebar');
            expect(sidebar.classList.contains('sc-sidebar-receiving')).toBe(false);

            SeatingChartManager._isLocked = false;
            SeatingChartManager._removeFromCell(0, 0);

            expect(sidebar.classList.contains('sc-sidebar-receiving')).toBe(true);
        });

        it('devrait exécuter _flyStudentToSidebar et nettoyer le token volant', () => {
            const cell = document.createElement('div');
            cell.className = 'sc-cell occupied';
            cell.dataset.row = '0';
            cell.dataset.col = '0';
            document.body.appendChild(cell);

            let completed = false;
            SeatingChartManager._flyStudentToSidebar(cell, () => {
                completed = true;
            });

            const flyer = document.querySelector('.sc-flight-token');
            expect(flyer).not.toBeNull();

            // Simuler la fin de transition
            flyer.dispatchEvent(new Event('transitionend'));
            expect(completed).toBe(true);
            expect(document.querySelector('.sc-flight-token')).toBeNull();

            cell.remove();
        });

        it('devrait ignorer l\'animation de vol si prefers-reduced-motion est activé', () => {
            const originalMatchMedia = window.matchMedia;
            window.matchMedia = vi.fn().mockImplementation(query => ({
                matches: query === '(prefers-reduced-motion: reduce)',
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }));

            const cell = document.createElement('div');
            let completed = false;
            SeatingChartManager._flyStudentToSidebar(cell, () => {
                completed = true;
            });

            expect(completed).toBe(true);
            expect(document.querySelector('.sc-flight-token')).toBeNull();

            window.matchMedia = originalMatchMedia;
        });
    });

    describe('Mode Duo Universel (Cours ⇄ Activité) & Gestion des Binômes / Groupes', () => {
        let classAct;

        beforeEach(() => {
            document.body.innerHTML = `
                <div class="main-content-wrapper" data-view="plan">
                    <div class="main-content">
                        <section class="output-section"></section>
                    </div>
                </div>
            `;

            userSettings.academic.classes = [];
            userSettings.academic.currentClassId = null;
            userSettings.academic.seatingGrid = {
                rows: 4,
                cols: 5,
                locked: false,
                specialLayout: {}
            };
            userSettings.academic.seatingActivityGrid = null;
            appState.classes = userSettings.academic.classes;
            appState.seatingGrid = userSettings.academic.seatingGrid;
            appState.seatingActivityGrid = null;

            classAct = ClassManager.createClass('3ème Techno');
            appState.currentClassId = classAct.id;
            userSettings.academic.currentClassId = classAct.id;

            appState.generatedResults = [
                { id: 'u1', classId: classAct.id, nom: 'Alpha', prenom: 'Alice', seatingPosition: { row: 0, col: 0 }, seatingActivityPosition: null },
                { id: 'u2', classId: classAct.id, nom: 'Bravo', prenom: 'Bob', seatingPosition: { row: 0, col: 1 }, seatingActivityPosition: null },
                { id: 'u3', classId: classAct.id, nom: 'Charlie', prenom: 'Chloé', seatingPosition: { row: 1, col: 0 }, seatingActivityPosition: null },
                { id: 'u4', classId: classAct.id, nom: 'Delta', prenom: 'David', seatingPosition: { row: 1, col: 1 }, seatingActivityPosition: null }
            ];

            SeatingChartManager._planMode = 'course';
            SeatingChartManager._injectView();
            SeatingChartManager._setupEventListeners();
            SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
            SeatingChartManager._studentMap = new Map(SeatingChartManager._students.map(s => [s.id, s]));
            localStorage.setItem('bulletin_seating_orientation', 'teacher');
            SeatingChartManager._orientation = 'teacher';
            SeatingChartManager._loadGridConfig();
            SeatingChartManager._initGrid(SeatingChartManager._getRows(), SeatingChartManager._getCols());
            SeatingChartManager._loadPositionsFromState();
        });

        afterEach(() => {
            SeatingChartManager._planMode = 'course';
        });

        it('devrait masquer le sélecteur Cours | Activité en consultation si aucun plan Activité n\'existe (0 intrusion)', () => {
            classAct.seatingLocked = true;
            SeatingChartManager._applyLockState(true);

            const switcher = document.getElementById('scPlanModeSwitch');
            expect(switcher.classList.contains('sc-mode-switch-hidden')).toBe(true);

            // En mode Édition, le sélecteur apparaît pour permettre de créer un plan Activité
            SeatingChartManager._applyLockState(false);
            expect(switcher.classList.contains('sc-mode-switch-hidden')).toBe(false);
        });

        it('devrait afficher le sélecteur Cours | Activité en consultation dès qu\'un plan Activité existe pour la classe', () => {
            // On place un élève en mode Activité
            appState.generatedResults[0].seatingActivityPosition = { row: 0, col: 0 };
            classAct.seatingLocked = true;
            SeatingChartManager._applyLockState(true);

            const switcher = document.getElementById('scPlanModeSwitch');
            expect(switcher.classList.contains('sc-mode-switch-hidden')).toBe(false);
        });

        it('devrait isoler totalement les placements et dimensions entre Cours et Activité', () => {
            // En mode Cours : 4x5, 4 élèves placés
            expect(SeatingChartManager._isActivityMode()).toBe(false);
            expect(SeatingChartManager._getRows()).toBe(4);
            expect(SeatingChartManager._getCols()).toBe(5);
            expect(SeatingChartManager._getPlacedIds().size).toBe(4);

            // Basculer en mode Activité : grille par défaut 3x5, 0 élève placé
            SeatingChartManager.switchPlanMode('activity');
            expect(SeatingChartManager._isActivityMode()).toBe(true);
            expect(SeatingChartManager._getRows()).toBe(3);
            expect(SeatingChartManager._getCols()).toBe(5);
            expect(SeatingChartManager._getPlacedIds().size).toBe(0);

            // Placer des binômes en mode Activité
            SeatingChartManager._isLocked = false;
            SeatingChartManager._autoPlace('pairs-alpha');

            expect(SeatingChartManager._getPlacedIds().size).toBe(4);
            expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['u1', 'u2']);
            expect(SeatingChartManager._getCellStudentIds(0, 1)).toEqual(['u3', 'u4']);

            // Vérifier que seatingActivityPosition est sauvegardé sans altérer seatingPosition du mode Cours
            const r1 = appState.generatedResults.find(r => r.id === 'u1');
            const r2 = appState.generatedResults.find(r => r.id === 'u2');
            expect(r1.seatingActivityPosition).toEqual({ row: 0, col: 0, pinned: false, order: 0 });
            expect(r2.seatingActivityPosition).toEqual({ row: 0, col: 0, pinned: false, order: 1 });
            expect(r1.seatingPosition).toEqual({ row: 0, col: 0 });
            expect(r2.seatingPosition).toEqual({ row: 0, col: 1 });

            // Revenir en mode Cours : les élèves sont toujours sur leurs tables individuelles
            SeatingChartManager.switchPlanMode('course');
            expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['u1']);
            expect(SeatingChartManager._getCellStudentIds(0, 1)).toEqual(['u2']);
        });

        it('devrait associer un élève en binôme lors d\'un glisser-déposer sur un poste occupé en mode Activité', () => {
            SeatingChartManager.switchPlanMode('activity');
            SeatingChartManager._isLocked = false;

            // Placer u1 sur le Poste #1 (0, 0)
            SeatingChartManager._dragSource = { type: 'sidebar', resultId: 'u1' };
            SeatingChartManager._handleDrop(0, 0);
            expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['u1']);

            // Déposer u2 sur le même Poste #1 (0, 0) -> rejoint u1 en binôme au lieu d'écraser
            SeatingChartManager._dragSource = { type: 'sidebar', resultId: 'u2' };
            expect(SeatingChartManager._willDropJoinGroup(0, 0, SeatingChartManager._dragSource)).toBe(true);
            SeatingChartManager._handleDrop(0, 0);
            expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['u1', 'u2']);

            // Retirer uniquement u1 du binôme -> u2 reste sur le Poste #1
            SeatingChartManager._removeStudentFromCell(0, 0, 'u1');
            expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['u2']);
        });

        it('devrait former des binômes voisins du cours avec pairs-neighbors et des groupes de 4 avec groups-4', () => {
            // En Cours : u1 est en (0,0), u3 est en (0,1), u2 est en (1,0), u4 est en (1,1)
            appState.generatedResults.find(r => r.id === 'u1').seatingPosition = { row: 0, col: 0 };
            appState.generatedResults.find(r => r.id === 'u3').seatingPosition = { row: 0, col: 1 };
            appState.generatedResults.find(r => r.id === 'u2').seatingPosition = { row: 1, col: 0 };
            appState.generatedResults.find(r => r.id === 'u4').seatingPosition = { row: 1, col: 1 };
            SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
            SeatingChartManager._loadPositionsFromState();

            SeatingChartManager.switchPlanMode('activity');
            SeatingChartManager._isLocked = false;

            // Placement par voisins du cours : (u1, u3) sur Poste #1 et (u2, u4) sur Poste #2
            SeatingChartManager._autoPlace('pairs-neighbors');
            expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['u1', 'u3']);
            expect(SeatingChartManager._getCellStudentIds(0, 1)).toEqual(['u2', 'u4']);

            // Réorganisation en groupe de 4 (Terrain #1)
            SeatingChartManager._autoPlace('groups-4');
            expect(SeatingChartManager._getCellStudentIds(0, 0).length).toBe(4);
            expect(SeatingChartManager._getCellStudentIds(0, 1).length).toBe(0);
        });

        it('devrait réajuster automatiquement l\'échelle (_applySmartFit) lorsque Binômes aléatoires agrandit la grille d\'activité (ex: 25 élèves -> 4x4)', () => {
            const classId = appState.currentClassId;
            appState.generatedResults = Array.from({ length: 25 }, (_, idx) => ({
                id: `u${idx + 1}`,
                classId,
                nom: `ELEVE${idx + 1}`,
                prenom: `Prenom${idx + 1}`,
                seatingPosition: null,
                seatingActivityPosition: null
            }));
            SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();
            SeatingChartManager.switchPlanMode('activity');
            SeatingChartManager._isLocked = false;

            // Grille initiale 3x4 (12 postes) insuffisante pour 13 binômes (25 élèves)
            const rowSlider = document.getElementById('scRowsSlider');
            const colSlider = document.getElementById('scColsSlider');
            rowSlider.value = '3';
            colSlider.value = '4';
            SeatingChartManager._initGrid(3, 4);

            const smartFitSpy = vi.spyOn(SeatingChartManager, '_applySmartFit');

            // Cas 1 (nominal + redimensionnement même si dézoomé) : 3x4 -> 4x4 déclenche _applySmartFit(true)
            SeatingChartManager._isFitted = false;
            SeatingChartManager._autoPlace('pairs-random');

            expect(SeatingChartManager._getRows()).toBe(4);
            expect(SeatingChartManager._getCols()).toBe(4);
            expect(SeatingChartManager._getPlacedIds().size).toBe(25);
            expect(smartFitSpy).toHaveBeenCalledWith(true);

            // Cas 2 (limite : grille déjà 4x4 et zoom manuel actif _isFitted = false) -> préserve le zoom manuel
            smartFitSpy.mockClear();
            SeatingChartManager._isFitted = false;
            SeatingChartManager._autoPlace('pairs-random');
            expect(smartFitSpy).not.toHaveBeenCalled();

            // Cas 3 (nominal : grille déjà 4x4 et mode ajusté _isFitted = true) -> maintient l'ajustement
            smartFitSpy.mockClear();
            SeatingChartManager._isFitted = true;
            SeatingChartManager._autoPlace('pairs-random');
            expect(smartFitSpy).toHaveBeenCalledWith(true);

            // Cas 4 (passage de 13 binômes 4x4 à Individuel 1/poste pour 25 élèves) -> agrandit en 5x5 équilibré et ajuste l'échelle
            smartFitSpy.mockClear();
            SeatingChartManager._autoPlace('alpha-asc');
            expect(SeatingChartManager._getRows()).toBe(5);
            expect(SeatingChartManager._getCols()).toBe(5);
            expect(SeatingChartManager._getPlacedIds().size).toBe(25);
            expect(SeatingChartManager._getCellStudentIds(0, 0).length).toBe(1);
            expect(smartFitSpy).toHaveBeenCalledWith(true);

            // Cas 5 (remise à zéro _clearAll après un zoom manuel) -> réajuste automatiquement l'échelle
            vi.useFakeTimers();
            const confirmSpy = vi.spyOn(UI, 'showCustomConfirm').mockImplementation((_desc, onConfirm) => onConfirm());
            smartFitSpy.mockClear();
            SeatingChartManager._isFitted = false;
            SeatingChartManager._clearAll();
            vi.runAllTimers();
            expect(SeatingChartManager._getPlacedIds().size).toBe(0);
            expect(smartFitSpy).toHaveBeenCalledWith(true);

            confirmSpy.mockRestore();
            vi.useRealTimers();
            smartFitSpy.mockRestore();
        });

        it('devrait numéroter séquentiellement les postes actifs (#1, #2...) en ignorant les allées et places condamnées', () => {
            SeatingChartManager.switchPlanMode('activity');
            SeatingChartManager._isLocked = false;

            expect(SeatingChartManager._getStationNumber(0, 0)).toBe(1);
            expect(SeatingChartManager._getStationNumber(0, 1)).toBe(2);

            // Si (0, 0) devient une allée, (0, 0) n'a plus de numéro et (0, 1) devient le Poste #1
            SeatingChartManager._setCellSpecialType(0, 0, 'aisle');
            expect(SeatingChartManager._getStationNumber(0, 0)).toBeNull();
            expect(SeatingChartManager._getStationNumber(0, 1)).toBe(1);
        });

        it('devrait toujours afficher le mode Activité dans le sens naturel (#1 en haut à gauche) même si le mode Cours est en Vue Élèves, et restaurer la Vue Élèves au retour en mode Cours', () => {
            const view = document.getElementById('seatingChartView');

            // 1. Activer la Vue Élèves en mode Cours
            SeatingChartManager.switchPlanMode('course', { animate: false });
            SeatingChartManager._toggleOrientation();
            expect(SeatingChartManager._orientation).toBe('student');
            expect(view.dataset.orientation).toBe('student');
            let cells = document.querySelectorAll('#scGridContainer .sc-cell');
            expect(cells[0].dataset.row).toBe('3');
            expect(cells[0].dataset.col).toBe('4');

            // 2. Basculer en mode Activité : la grille des groupes reste en lecture naturelle (0,0 = #1 en haut à gauche)
            SeatingChartManager.switchPlanMode('activity', { animate: false });
            expect(view.dataset.orientation).toBe('teacher');
            expect(SeatingChartManager._isStudentOrientation()).toBe(false);
            cells = document.querySelectorAll('#scGridContainer .sc-cell');
            expect(cells[0].dataset.row).toBe('0');
            expect(cells[0].dataset.col).toBe('0');
            expect(cells[0].querySelector('.sc-station-badge')?.textContent).toBe('#1');

            // _toggleOrientation est sans effet en mode Activité
            SeatingChartManager._toggleOrientation();
            expect(SeatingChartManager._orientation).toBe('student');
            expect(view.dataset.orientation).toBe('teacher');

            // 3. Revenir en mode Cours : la Vue Élèves mémorisée est fidèlement restaurée
            SeatingChartManager.switchPlanMode('course', { animate: false });
            expect(SeatingChartManager._orientation).toBe('student');
            expect(view.dataset.orientation).toBe('student');
            cells = document.querySelectorAll('#scGridContainer .sc-cell');
            expect(cells[0].dataset.row).toBe('3');
            expect(cells[0].dataset.col).toBe('4');
        });

        it('devrait animer le passage Cours <-> Activité avec un effet carrousel directionnel sans ré-animer les cartes une à une', () => {
            localStorage.setItem('bulletin_seating_orientation', 'teacher');
            SeatingChartManager._orientation = 'teacher';
            const board = document.getElementById('scClassroomBoard');
            const bodyEl = document.querySelector('#seatingChartView .sc-body');

            // Simuler des dimensions réelles pour la capture du clone sortant (ghost)
            vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
                left: 120, top: 80, width: 520, height: 340, right: 640, bottom: 420
            });
            vi.spyOn(bodyEl, 'getBoundingClientRect').mockReturnValue({
                left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600
            });

            // 1. Cours -> Activité : le plateau entrant glisse depuis la droite, le clone sortant vers la gauche, avec onde d'inertie gauche -> droite
            SeatingChartManager.switchPlanMode('activity', { animate: true });
            expect(board.classList.contains('sc-mode-carousel-in-right')).toBe(true);
            expect(board.dataset.planMode).toBe('activity');
            const ghostToLeft = document.querySelector('#seatingChartView .sc-board-carousel-ghost');
            expect(ghostToLeft).not.toBeNull();
            expect(ghostToLeft.classList.contains('sc-mode-carousel-out-left')).toBe(true);
            expect(ghostToLeft.dataset.planMode).toBe('course');
            expect(document.querySelectorAll('#scGridContainer .sc-cell.sc-cell-stagger').length).toBe(0);
            const firstColCellAct = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="0"]');
            const lastColCellAct = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="4"]');
            expect(parseFloat(firstColCellAct.style.getPropertyValue('--carousel-col-i'))).toBeLessThan(
                parseFloat(lastColCellAct.style.getPropertyValue('--carousel-col-i'))
            );

            // 2. Activité -> Cours : le plateau entrant glisse depuis la gauche, le clone sortant vers la droite, avec onde d'inertie droite -> gauche
            SeatingChartManager.switchPlanMode('course', { animate: true });
            expect(board.classList.contains('sc-mode-carousel-in-left')).toBe(true);
            expect(board.dataset.planMode).toBe('course');
            const ghostToRight = document.querySelector('#seatingChartView .sc-board-carousel-ghost');
            expect(ghostToRight).not.toBeNull();
            expect(ghostToRight.classList.contains('sc-mode-carousel-out-right')).toBe(true);
            expect(ghostToRight.dataset.planMode).toBe('activity');
            expect(document.querySelectorAll('#scGridContainer .sc-cell.sc-cell-stagger').length).toBe(0);
            const firstColCellCourse = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="0"]');
            const lastColCellCourse = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="4"]');
            expect(parseFloat(lastColCellCourse.style.getPropertyValue('--carousel-col-i'))).toBeLessThan(
                parseFloat(firstColCellCourse.style.getPropertyValue('--carousel-col-i'))
            );
        });

        it('devrait figer les transitions enfants via sc-lock-sliding pendant le glissement FLIP de _toggleLock pour garantir le 120Hz', () => {
            SeatingChartManager.switchPlanMode('course', { animate: false });
            SeatingChartManager._isLocked = true;
            const board = document.getElementById('scClassroomBoard');
            const sidebar = document.getElementById('scSidebar');

            let callCount = 0;
            vi.spyOn(board, 'getBoundingClientRect').mockImplementation(() => {
                callCount++;
                return callCount === 1
                    ? { left: 100, top: 80, width: 600, height: 400 }
                    : { left: 230, top: 80, width: 600, height: 400 };
            });

            SeatingChartManager._toggleLock();

            expect(SeatingChartManager._isLocked).toBe(false);
            expect(sidebar.inert).toBe(false);
            expect(board.classList.contains('sc-lock-sliding')).toBe(true);
            expect(board.style.transition).toContain('transform 0.52s cubic-bezier(0.32, 0.72, 0, 1)');

            const endEvent = new Event('transitionend');
            Object.defineProperty(endEvent, 'propertyName', { value: 'transform' });
            board.dispatchEvent(endEvent);

            expect(board.classList.contains('sc-lock-sliding')).toBe(false);
        });

        it('devrait conserver data-tooltip (ancré sur la photo .sc-stacked-avatar correspondante) sur la pilule .sc-stacked-member en mode Édition comme en mode Lecture', () => {
            SeatingChartManager.switchPlanMode('activity', { animate: false });
            SeatingChartManager._isLocked = false;
            SeatingChartManager._autoPlace('pairs-alpha');

            const cell = document.querySelector('#scGridContainer .sc-cell.sc-cell-stacked[data-row="0"][data-col="0"]');
            expect(cell).not.toBeNull();
            const memberPills = cell.querySelectorAll('.sc-stacked-member');
            expect(memberPills.length).toBe(2);

            // En mode Édition : tooltip présent sur les pilules de prénoms et ancré sur la photo de l'élève correspondant
            expect(memberPills[0].getAttribute('data-tooltip')).toBe('Alice ALPHA');
            expect(memberPills[0].getAttribute('data-tooltip-anchor')).toBe(".sc-stacked-avatar[data-result-id='u1']");
            expect(memberPills[1].getAttribute('data-tooltip')).toBe('Bob BRAVO');
            expect(memberPills[1].getAttribute('data-tooltip-anchor')).toBe(".sc-stacked-avatar[data-result-id='u2']");

            // Passage en mode Lecture : data-tooltip et ancrage sur la photo conservés sur .sc-stacked-member
            SeatingChartManager._applyLockState(true);
            expect(memberPills[0].getAttribute('data-tooltip')).toBe('Alice ALPHA');
            expect(memberPills[0].getAttribute('data-tooltip-anchor')).toBe(".sc-stacked-avatar[data-result-id='u1']");
            expect(memberPills[1].getAttribute('data-tooltip')).toBe('Bob BRAVO');

            // Retour en mode Édition : data-tooltip et ancrage sur la photo toujours présents sur .sc-stacked-member
            SeatingChartManager._applyLockState(false);
            expect(memberPills[0].getAttribute('data-tooltip')).toBe('Alice ALPHA');
            expect(memberPills[0].getAttribute('data-tooltip-anchor')).toBe(".sc-stacked-avatar[data-result-id='u1']");
            expect(memberPills[1].getAttribute('data-tooltip')).toBe('Bob BRAVO');
        });

        it('devrait mettre à jour la cellule épinglée sur place (_updateCellPinDOM) sans reconstruire la grille (_renderGrid)', () => {
            SeatingChartManager.switchPlanMode('course', { animate: false });
            SeatingChartManager._isLocked = false;
            SeatingChartManager._autoPlace('alpha-asc');

            const cell = document.querySelector('#scGridContainer .sc-cell.occupied');
            expect(cell).not.toBeNull();
            const resultId = cell.dataset.resultId;
            const renderGridSpy = vi.spyOn(SeatingChartManager, '_renderGrid');

            SeatingChartManager._togglePin(resultId);

            expect(renderGridSpy).not.toHaveBeenCalled();
            expect(cell.classList.contains('pinned')).toBe(true);
            expect(cell.draggable).toBe(false);
            expect(cell.querySelector('.sc-cell-pin')?.getAttribute('data-tooltip')).toBe('Détacher');
            expect(cell.querySelector('.sc-cell-pin iconify-icon')?.getAttribute('icon')).toBe('solar:pin-bold');

            SeatingChartManager._togglePin(resultId);

            expect(renderGridSpy).not.toHaveBeenCalled();
            expect(cell.classList.contains('pinned')).toBe(false);
            expect(cell.draggable).toBe(true);
            expect(cell.querySelector('.sc-cell-pin')?.getAttribute('data-tooltip')).toBe('Fixer');
            expect(cell.querySelector('.sc-cell-pin iconify-icon')?.getAttribute('icon')).toBe('solar:pin-linear');
            renderGridSpy.mockRestore();
        });

        it('devrait permettre de glisser-déposer un élève depuis sa pilule de prénom (.sc-stacked-member) et synchroniser l\'écho visuel Photo ↔ Prénom au survol', () => {
            SeatingChartManager.switchPlanMode('activity', { animate: false });
            SeatingChartManager._isLocked = false;
            SeatingChartManager._autoPlace('pairs-alpha');

            const cell = document.querySelector('#scGridContainer .sc-cell.sc-cell-stacked[data-row="0"][data-col="0"]');
            expect(cell).not.toBeNull();
            const avatars = cell.querySelectorAll('.sc-stacked-avatar');
            const members = cell.querySelectorAll('.sc-stacked-member');
            expect(avatars.length).toBe(2);
            expect(members.length).toBe(2);

            // 1. Écho visuel au survol : survoler le prénom illumine l'avatar correspondant (et inversement)
            members[1].dispatchEvent(new MouseEvent('mouseenter'));
            expect(avatars[1].classList.contains('is-member-hovered')).toBe(true);
            expect(members[1].classList.contains('is-member-hovered')).toBe(true);
            expect(avatars[0].classList.contains('is-member-hovered')).toBe(false);

            members[1].dispatchEvent(new MouseEvent('mouseleave'));
            expect(avatars[1].classList.contains('is-member-hovered')).toBe(false);
            expect(members[1].classList.contains('is-member-hovered')).toBe(false);

            // 2. Glisser-déposer depuis la pilule de prénom extrait uniquement cet élève vers un poste vide
            expect(members[1].draggable).toBe(true);
            const dragStartEvent = new Event('dragstart', { bubbles: true, cancelable: true });
            dragStartEvent.dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' };
            members[1].dispatchEvent(dragStartEvent);

            expect(SeatingChartManager._dragSource).toEqual({
                type: 'group-member',
                resultId: 'u2',
                row: 0,
                col: 0
            });

            // Déposer sur le poste libre (1, 0)
            SeatingChartManager._handleDrop(1, 0);
            expect(SeatingChartManager._getCellStudentIds(0, 0)).toEqual(['u1']);
            expect(SeatingChartManager._getCellStudentIds(1, 0)).toEqual(['u2']);
        });

        it('devrait afficher data-tooltip sur la cellule entière (.sc-cell.occupied) en mode Édition (ancré sur .student-avatar) comme en mode Consultation', () => {
            SeatingChartManager.switchPlanMode('course', { animate: false });
            SeatingChartManager._isLocked = false;
            SeatingChartManager._autoPlace('alpha-asc');

            const cell = document.querySelector('#scGridContainer .sc-cell.occupied');
            expect(cell).not.toBeNull();
            const nameEl = cell.querySelector('.sc-cell-name');

            // Mode Édition : tooltip directement sur la cellule (car .sc-cell-name a pointer-events: none) ancré au-dessus de .student-avatar
            expect(cell.getAttribute('data-tooltip')).toBe('Alice ALPHA');
            expect(cell.getAttribute('data-tooltip-anchor')).toBe('.student-avatar');
            expect(nameEl.getAttribute('data-tooltip')).toBeNull();

            // Passage en mode Consultation : tooltip conservé sur la cellule entière
            SeatingChartManager._applyLockState(true);
            expect(cell.getAttribute('data-tooltip')).toBe('Alice ALPHA');
            expect(cell.getAttribute('data-tooltip-anchor')).toBeNull();
            expect(nameEl.getAttribute('data-tooltip')).toBeNull();

            // Retour en mode Édition : tooltip maintenu sur la cellule avec ancrage sur .student-avatar
            SeatingChartManager._applyLockState(false);
            expect(cell.getAttribute('data-tooltip')).toBe('Alice ALPHA');
            expect(cell.getAttribute('data-tooltip-anchor')).toBe('.student-avatar');
            expect(nameEl.getAttribute('data-tooltip')).toBeNull();
        });
    });

    describe('Onboarding en 2 étapes & Calibration adaptative de la salle', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="main-content-wrapper" data-view="list">
                    <div class="main-content">
                        <section class="output-section"></section>
                    </div>
                </div>
            `;

            userSettings.academic.classes = [];
            appState.classes = userSettings.academic.classes;
            appState.generatedResults = [];
            appState.seatingGrid = null;
            appState.seatingActivityGrid = null;
            userSettings.academic.seatingGrid = null;
            userSettings.academic.seatingActivityGrid = null;

            const classSmall = ClassManager.createClass('6ème A');
            const classLarge = ClassManager.createClass('3ème B');

            for (let i = 1; i <= 24; i++) {
                appState.generatedResults.push({
                    id: `s-small-${i}`,
                    classId: classSmall.id,
                    nom: `NOM${i}`,
                    prenom: `Prenom${i}`,
                    seatingPosition: null
                });
            }
            for (let i = 1; i <= 34; i++) {
                appState.generatedResults.push({
                    id: `s-large-${i}`,
                    classId: classLarge.id,
                    nom: `GRANDE${i}`,
                    prenom: `Eleve${i}`,
                    seatingPosition: null
                });
            }

            appState.currentClassId = classSmall.id;
            userSettings.academic.currentClassId = classSmall.id;
            SeatingChartManager._planMode = 'course';
            SeatingChartManager._onboardingStep = null;
            SeatingChartManager._injectView();
            SeatingChartManager._setupEventListeners();
            SeatingChartManager.switchToView('plan', { immediate: true });
        });

        it('devrait calibrer automatiquement le nombre de rangées par défaut selon la plus grande classe importée (34 élèves -> 6 rangées / 36 places)', () => {
            expect(SeatingChartManager._getMaxClassStudentCount()).toBe(34);
            expect(SeatingChartManager._getDefaultRows('course')).toBe(6);
            expect(SeatingChartManager._getRows()).toBe(6);
            expect(SeatingChartManager._getCols()).toBe(6);

            const capInfo = SeatingChartManager._getRoomCapacityInfo();
            expect(capInfo.totalSeats).toBe(36);
            expect(capInfo.maxClassStudents).toBe(34);
            expect(capInfo.isShortForCurrent).toBe(false);
            expect(capInfo.isShortForMax).toBe(false);
        });

        it('devrait afficher l\'Étape 1 (Configuration de la salle) à la toute première ouverture, puis passer à l\'Étape 2 (Placement) après validation et mémoriser la salle pour les autres classes', () => {
            const hint = document.querySelector('#scGridArea .sc-onboarding-hint');
            expect(hint).not.toBeNull();
            expect(hint.dataset.step).toBe('room');
            expect(hint.querySelector('#scHintConfirmRoomBtn')).not.toBeNull();
            expect(appState.seatingGrid).toBeNull();

            // Valider la salle à l'étape 1
            hint.querySelector('#scHintConfirmRoomBtn').click();

            expect(appState.seatingGrid).not.toBeNull();
            expect(appState.seatingGrid.rows).toBe(6);
            expect(appState.seatingGrid.cols).toBe(6);
            expect(hint.dataset.step).toBe('placement');
            expect(hint.querySelector('#scHintAutoBtn')).not.toBeNull();

            // Changement vers la seconde classe vide : passe directement à l'étape 2 sans redemander la salle
            const secondClass = appState.classes[1];
            appState.currentClassId = secondClass.id;
            userSettings.academic.currentClassId = secondClass.id;
            SeatingChartManager.onClassChange(true, { immediate: true });

            const hintSecondClass = document.querySelector('#scGridArea .sc-onboarding-hint');
            expect(hintSecondClass).not.toBeNull();
            expect(hintSecondClass.dataset.step).toBe('placement');
        });

        it('devrait permettre de changer de modèle de salle (2 allées, 1 allée centrale, sans allée) et conserver les élèves déjà placés', () => {
            SeatingChartManager._confirmRoomSetup();
            SeatingChartManager._autoPlace('alpha-asc');
            expect(SeatingChartManager._getPlacedIds().size).toBe(24);

            // Passer au modèle "3 doubles (2 allées)" (8 colonnes, allées en col 2 et 5)
            SeatingChartManager._applyRoomPreset('double-aisles');
            expect(SeatingChartManager._getCols()).toBe(8);
            expect(SeatingChartManager._detectCurrentRoomPreset()).toBe('double-aisles');
            expect(SeatingChartManager._getCellSpecial(0, 2)).toEqual({ type: 'aisle', scope: 'global' });
            expect(SeatingChartManager._getCellSpecial(0, 5)).toEqual({ type: 'aisle', scope: 'global' });
            expect(SeatingChartManager._getPlacedIds().size).toBe(24);

            // Passer au modèle "1 allée centrale" (7 colonnes, allée en col 3)
            SeatingChartManager._applyRoomPreset('center-aisle');
            expect(SeatingChartManager._getCols()).toBe(7);
            expect(SeatingChartManager._detectCurrentRoomPreset()).toBe('center-aisle');
            expect(SeatingChartManager._getCellSpecial(0, 3)).toEqual({ type: 'aisle', scope: 'global' });
            expect(SeatingChartManager._getPlacedIds().size).toBe(24);

            // Passer au modèle "Sans allée" (6 colonnes continues)
            SeatingChartManager._applyRoomPreset('compact');
            expect(SeatingChartManager._getCols()).toBe(6);
            expect(SeatingChartManager._detectCurrentRoomPreset()).toBe('compact');
            expect(Object.keys(appState.seatingGrid.specialLayout || {}).length).toBe(0);
            expect(SeatingChartManager._getPlacedIds().size).toBe(24);
        });

        it('devrait prolonger automatiquement les allées verticales lors de l\'ajout d\'une rangée via les boutons +/-', () => {
            SeatingChartManager._applyRoomPreset('double-aisles');
            expect(SeatingChartManager._getRows()).toBe(6);

            SeatingChartManager._stepGridDimension('rows', 1);
            expect(SeatingChartManager._getRows()).toBe(7);
            // La nouvelle rangée 0 doit conserver les allées aux colonnes 2 et 5
            expect(SeatingChartManager._getCellSpecial(0, 2)).toEqual({ type: 'aisle', scope: 'global' });
            expect(SeatingChartManager._getCellSpecial(0, 5)).toEqual({ type: 'aisle', scope: 'global' });
        });

        it('devrait proposer un bouton d\'adaptation en 1 clic à l\'étape 2 si une salle déjà configurée est trop petite pour la classe active', () => {
            // Configurer une petite salle de 4 rangées x 6 colonnes (24 places)
            appState.seatingGrid = {
                rows: 4,
                cols: 6,
                locked: false,
                roomConfigured: true,
                specialLayout: {}
            };
            // Ouvrir la grande classe de 34 élèves
            appState.currentClassId = appState.classes[1].id;
            userSettings.academic.currentClassId = appState.classes[1].id;
            SeatingChartManager.onClassChange(true, { immediate: true });

            const hint = document.querySelector('#scGridArea .sc-onboarding-hint');
            expect(hint).not.toBeNull();
            expect(hint.dataset.step).toBe('placement');

            const adaptBtn = hint.querySelector('#scHintAutoExpandRowsBtn');
            expect(adaptBtn).not.toBeNull();
            expect(adaptBtn.textContent).toContain('+2 rangées');

            adaptBtn.click();
            expect(SeatingChartManager._getRows()).toBe(6);
            expect(hint.querySelector('#scHintAutoExpandRowsBtn')).toBeNull();
        });

        it('devrait permettre d\'annuler les modifications de salle (Retour sans modifier) lorsqu\'on ouvre le réglage depuis l\'étape 2', () => {
            SeatingChartManager._confirmRoomSetup();
            const hint = document.querySelector('#scGridArea .sc-onboarding-hint');
            expect(hint.dataset.step).toBe('placement');
            expect(SeatingChartManager._getCols()).toBe(6);

            // Cliquer sur "Régler la salle"
            hint.querySelector('#scHintEditRoomBtn').click();
            expect(hint.dataset.step).toBe('room');
            expect(hint.querySelector('#scHintCancelRoomBtn')).not.toBeNull();

            // Tester le modèle "2 allées" (8 colonnes) puis annuler
            SeatingChartManager._applyRoomPreset('double-aisles');
            expect(SeatingChartManager._getCols()).toBe(8);

            hint.querySelector('#scHintCancelRoomBtn').click();
            expect(hint.dataset.step).toBe('placement');
            expect(SeatingChartManager._getCols()).toBe(6);
            expect(SeatingChartManager._detectCurrentRoomPreset()).toBe('compact');
        });
    });

    describe('Accès à la fiche élève depuis le panneau latéral et statut Départ', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="main-content-wrapper" data-view="list">
                    <div class="main-content">
                        <section class="output-section"></section>
                    </div>
                </div>
            `;

            userSettings.academic.classes = [];
            appState.classes = userSettings.academic.classes;
            appState.generatedResults = [];
            appState.seatingGrid = { rows: 5, cols: 6, locked: false, roomConfigured: true, specialLayout: {} };
            userSettings.academic.seatingGrid = appState.seatingGrid;

            const cls = ClassManager.createClass('4ème A');
            appState.generatedResults.push(
                {
                    id: 'st-placed',
                    classId: cls.id,
                    nom: 'MARTIN',
                    prenom: 'Lucas',
                    studentData: { statuses: [] },
                    seatingPosition: { row: 0, col: 0 }
                },
                {
                    id: 'st-unplaced',
                    classId: cls.id,
                    nom: 'BERNARD',
                    prenom: 'Emma',
                    studentData: { statuses: [] },
                    seatingPosition: null
                }
            );

            appState.currentClassId = cls.id;
            userSettings.academic.currentClassId = cls.id;
            SeatingChartManager._planMode = 'course';
            SeatingChartManager._injectView();
            SeatingChartManager._setupEventListeners();
            SeatingChartManager.switchToView('plan', { immediate: true });
            // Unlock to enter Edit Mode where sidebar is active
            if (SeatingChartManager._isLocked) {
                SeatingChartManager._toggleLock();
            }
        });

        it('devrait ouvrir le FocusPanel au clic sur le bouton fiche (.sc-chip-profile-btn) sans sélectionner l\'étiquette pour le placement', () => {
            const openSpy = vi.spyOn(FocusPanelManager, 'open').mockImplementation(() => {});
            const chip = document.querySelector('#scStudentList .sc-student-chip[data-result-id="st-unplaced"]');
            expect(chip).not.toBeNull();

            // 1. Le clic sur le corps de l'étiquette sélectionne l'élève sans ouvrir le FocusPanel
            chip.click();
            expect(SeatingChartManager._selectedChipIds).toEqual(['st-unplaced']);
            expect(openSpy).not.toHaveBeenCalled();

            // 2. Le clic sur le bouton fiche ouvre le FocusPanel et nettoie la sélection de placement
            const profileBtn = chip.querySelector('.sc-chip-profile-btn');
            expect(profileBtn).not.toBeNull();
            profileBtn.click();

            expect(openSpy).toHaveBeenCalledWith('st-unplaced');
            expect(SeatingChartManager._selectedChipIds).toEqual([]);
            openSpy.mockRestore();
        });

        it('devrait basculer l\'étiquette dans "Élèves partis" et débloquer l\'état "Tous les élèves sont placés" dès que le statut Départ est enregistré dans le FocusPanel', () => {
            // Initialement : 1 élève non placé
            expect(document.getElementById('scSidebarTitle')?.textContent).toContain('1');
            expect(document.querySelector('.sc-sidebar-departed-section')).toBeNull();

            // Sélectionner l'étiquette puis simuler l'ajout du statut "Départ" via FocusPanel
            SeatingChartManager._toggleChipSelection('st-unplaced');
            expect(SeatingChartManager._selectedChipIds).toEqual(['st-unplaced']);

            const unplacedResult = appState.generatedResults.find(r => r.id === 'st-unplaced');
            unplacedResult.studentData.statuses = ['Départ'];
            window.dispatchEvent(new CustomEvent('student-updated', { detail: { studentId: 'st-unplaced' } }));

            // L'étiquette est passée dans la sous-section "Élève parti (1)", la sélection est purgée, et tous les élèves actifs sont placés
            expect(SeatingChartManager._selectedChipIds).toEqual([]);
            expect(document.getElementById('scSidebarTitle')?.textContent).toContain('Tous les élèves sont placés');

            const departedChip = document.querySelector('.sc-sidebar-departed-section .sc-student-chip.sc-chip-departed[data-result-id="st-unplaced"]');
            expect(departedChip).not.toBeNull();
            expect(departedChip.querySelector('.sc-chip-profile-btn')).not.toBeNull();
        });

        it('devrait ignorer les raccourcis clavier du Plan de classe (/, Échap, Ctrl+Z) lorsque le FocusPanel est ouvert par-dessus', () => {
            const isOpenSpy = vi.spyOn(FocusPanelManager, 'isOpen').mockReturnValue(true);
            SeatingChartManager._toggleChipSelection('st-unplaced');
            expect(SeatingChartManager._selectedChipIds).toEqual(['st-unplaced']);

            document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
            expect(SeatingChartManager._isSearchOpen()).toBe(false);

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            // La sélection du plan ne doit pas être consommée par l'Échap destiné au FocusPanel
            expect(SeatingChartManager._selectedChipIds).toEqual(['st-unplaced']);

            isOpenSpy.mockRestore();
        });

        it('devrait filtrer les pastilles de statut selon appState.seatingStatusDots tout en conservant tous les statuts dans le tooltip', () => {
            const ulisStudent = {
                id: 'st-ulis',
                nom: 'BERNARD',
                prenom: 'Léo',
                studentData: { statuses: ['ULIS', 'PAP'] }
            };
            const delegateStudent = {
                id: 'st-del',
                nom: 'MOREAU',
                prenom: 'Emma',
                studentData: { statuses: ['Délégué'] }
            };
            const multiStudent = {
                id: 'st-multi',
                nom: 'PETIT',
                prenom: 'Hugo',
                studentData: { statuses: ['Nouveau', 'PPRE', 'Délégué'] }
            };

            // 1. Par défaut (movements: true, devices: false, delegates: false)
            appState.seatingStatusDots = { movements: true, devices: false, delegates: false };
            expect(SeatingChartManager._getStudentStatusBadgeInfo(ulisStudent)).toBeNull();
            expect(SeatingChartManager._getStudentStatusBadgeInfo(delegateStudent)).toBeNull();
            expect(SeatingChartManager._getStudentStatusBadgeInfo(multiStudent)).toEqual({
                type: 'new',
                className: 'sc-badge-new',
                cellClass: 'sc-cell-new',
                label: 'Nouveau'
            });

            // Le tooltip contient toujours l'intégralité des statuts actifs
            expect(SeatingChartManager._getStudentTooltipText(ulisStudent)).toBe('Léo BERNARD • ULIS • PAP');
            expect(SeatingChartManager._getStudentTooltipText(delegateStudent)).toBe('Emma MOREAU • Délégué');
            expect(SeatingChartManager._getStudentTooltipText(multiStudent)).toBe('Hugo PETIT • Nouveau • PPRE • Délégué');

            // 2. Activation de Dispositifs et Délégués
            appState.seatingStatusDots = { movements: true, devices: true, delegates: true };
            expect(SeatingChartManager._getStudentStatusBadgeInfo(ulisStudent)).toEqual({
                type: 'ulis',
                className: 'sc-badge-ulis',
                cellClass: 'sc-cell-ulis',
                label: 'ULIS • PAP'
            });
            expect(SeatingChartManager._getStudentStatusBadgeInfo(delegateStudent)).toEqual({
                type: 'delegate',
                className: 'sc-badge-delegate',
                cellClass: 'sc-cell-delegate',
                label: 'Délégué'
            });

            // 3. Si Mouvements est désactivé mais Dispositifs activé, multiStudent affiche la pastille Dispositif
            appState.seatingStatusDots = { movements: false, devices: true, delegates: true };
            expect(SeatingChartManager._getStudentStatusBadgeInfo(multiStudent)).toEqual({
                type: 'device',
                className: 'sc-badge-device',
                cellClass: 'sc-cell-device',
                label: 'PPRE'
            });

            // Remise par défaut
            appState.seatingStatusDots = { movements: true, devices: false, delegates: false };
        });

        it('devrait basculer entre Cours et Activité par glissement horizontal (swipe) en mode Consultation ajusté uniquement si un plan Activité existe', () => {
            SeatingChartManager.switchToView('plan');
            SeatingChartManager.switchPlanMode('course', { animate: false });

            const gridArea = document.getElementById('scGridArea');
            const board = document.getElementById('scClassroomBoard');
            Object.defineProperty(gridArea, 'scrollWidth', { value: 400, configurable: true });
            Object.defineProperty(gridArea, 'clientWidth', { value: 400, configurable: true });
            Object.defineProperty(gridArea, 'scrollHeight', { value: 300, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 300, configurable: true });

            SeatingChartManager._isFitted = true;
            SeatingChartManager._isLocked = true;

            const performSwipe = (startX, endX, startY = 200, endY = 200, cancel = false) => {
                const ts = new Event('touchstart');
                ts.touches = [{ clientX: startX, clientY: startY }];
                gridArea.dispatchEvent(ts);

                const tm = new Event('touchmove');
                tm.touches = [{ clientX: endX, clientY: endY }];
                gridArea.dispatchEvent(tm);

                const te = new Event(cancel ? 'touchcancel' : 'touchend');
                te.touches = [];
                te.changedTouches = [{ clientX: endX, clientY: endY }];
                gridArea.dispatchEvent(te);
            };

            // 1. Sans plan Activité configuré en mode Consultation : le swipe gauche rebondit sans changer de mode
            performSwipe(240, 120);
            expect(SeatingChartManager._planMode).toBe('course');
            expect(board.style.transform).toBe('translate3d(0, 0, 0)');

            // 2. Avec un plan Activité configuré : swipe gauche -> Activité
            appState.generatedResults[0].seatingActivityPosition = { row: 0, col: 0, slot: 0 };
            performSwipe(240, 120);
            expect(SeatingChartManager._planMode).toBe('activity');

            // 3. Butée franche à droite : un nouveau swipe gauche depuis Activité ne change pas de mode
            performSwipe(240, 120);
            expect(SeatingChartManager._planMode).toBe('activity');

            // 4. Swipe droite depuis Activité -> retour en mode Cours
            SeatingChartManager._isLocked = true;
            SeatingChartManager._isFitted = true;
            performSwipe(120, 240);
            expect(SeatingChartManager._planMode).toBe('course');

            // 5. En mode Édition (_isLocked = false) ou zoomé (_isFitted = false) ou edge-swipe (< 24px) ou touchcancel : pas de bascule
            SeatingChartManager._isLocked = false;
            performSwipe(240, 120);
            expect(SeatingChartManager._planMode).toBe('course');

            SeatingChartManager._isLocked = true;
            SeatingChartManager._isFitted = false;
            performSwipe(240, 120);
            expect(SeatingChartManager._planMode).toBe('course');

            SeatingChartManager._isFitted = true;
            performSwipe(12, 140); // Edge swipe système
            expect(SeatingChartManager._planMode).toBe('course');

            performSwipe(240, 120, 200, 200, true); // touchcancel
            expect(SeatingChartManager._planMode).toBe('course');

            // 6. Swipe droite depuis Cours -> retour vers la vue Liste (et swipe gauche depuis Liste -> retour Plan Cours)
            const switchToViewSpy = vi.spyOn(SeatingChartManager, 'switchToView');
            performSwipe(120, 240);
            expect(switchToViewSpy).toHaveBeenCalledWith('list');

            SeatingChartManager.switchToView('list', { immediate: true });
            const outputSection = document.querySelector('.main-content .output-section');
            const tsList = new Event('touchstart');
            tsList.touches = [{ clientX: 260, clientY: 200 }];
            outputSection.dispatchEvent(tsList);
            const teList = new Event('touchend');
            teList.changedTouches = [{ clientX: 140, clientY: 205 }];
            outputSection.dispatchEvent(teList);
            expect(switchToViewSpy).toHaveBeenCalledWith('plan');
            switchToViewSpy.mockRestore();
        });

        it('devrait chaîner Liste ↔ Plan (Cours) ↔ Plan (Activité) avec les flèches Gauche/Droite (avec ou sans Ctrl) sans contour focus parasite', () => {
            SeatingChartManager.switchToView('list', { immediate: true });

            // 1. En vue Liste : ArrowRight (avec ou sans Ctrl) ouvre directement le Plan en mode Cours
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            SeatingChartManager.switchToView('plan', { immediate: true });
            expect(SeatingChartManager._isActive).toBe(true);
            expect(SeatingChartManager._planMode).toBe('course');
            expect(document.activeElement?.closest?.('#viewToggle') ?? null).toBeNull();

            SeatingChartManager._isFitted = true;

            // 2. En mode Consultation sans plan Activité : ArrowRight est bloqué (butée droite)
            SeatingChartManager._isLocked = true;
            appState.generatedResults.forEach(s => { delete s.seatingActivityPosition; });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            expect(SeatingChartManager._planMode).toBe('course');

            // 3. En mode Édition (ou si un plan Activité existe) : ArrowRight -> Activité
            SeatingChartManager._isLocked = false;
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            expect(SeatingChartManager._planMode).toBe('activity');

            // Butée franche à droite : un second ArrowRight reste sur Activité
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            expect(SeatingChartManager._planMode).toBe('activity');

            // 4. ArrowLeft depuis Activité -> retour sur Cours
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
            expect(SeatingChartManager._planMode).toBe('course');

            // 5. Second ArrowLeft depuis Cours -> retour vers la vue Liste !
            const switchToViewSpy = vi.spyOn(SeatingChartManager, 'switchToView');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
            expect(switchToViewSpy).toHaveBeenCalledWith('list');
            switchToViewSpy.mockRestore();

            // 6. Garde zoom (_isFitted = false) : les flèches nues sont laissées au scroll du plan zoomé, mais Ctrl + ArrowRight ou le focus sur #scPlanModeSwitch bascule
            SeatingChartManager.switchToView('plan', { immediate: true });
            SeatingChartManager.switchPlanMode('course', { animate: false });
            SeatingChartManager._isFitted = false;
            SeatingChartManager._isLocked = false;
            document.body.focus();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            expect(SeatingChartManager._planMode).toBe('course');

            const courseTab = document.querySelector('#scPlanModeSwitch .sc-mode-tab[data-plan-mode="course"]');
            const activityTab = document.querySelector('#scPlanModeSwitch .sc-mode-tab[data-plan-mode="activity"]');
            courseTab?.focus();
            courseTab?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            expect(SeatingChartManager._planMode).toBe('activity');
            expect(document.activeElement).toBe(activityTab);
        });

        it('devrait permettre de changer de classe avec Ctrl + Flèches Haut/Bas au clavier sans déclencher de changement de classe au swipe vertical sur tactile', () => {
            const c1 = appState.classes[0];
            const c2 = ClassManager.createClass('4ème B');
            appState.currentClassId = c1.id;
            userSettings.academic.currentClassId = c1.id;
            userSettings.academic.classesCustomOrder = true;

            const switchClassSpy = vi.spyOn(ClassUIManager, 'switchAdjacentClass').mockResolvedValue(true);

            // 1. En vue Liste : ArrowDown nu cible et fait défiler directement .main-content sans clic préalable, Ctrl + ArrowUp en butée haute est bloqué, Ctrl + ArrowDown passe à la classe suivante
            SeatingChartManager.switchToView('list', { immediate: true });
            const mainContent = document.querySelector('.main-content');
            const scrollBySpy = vi.fn();
            if (mainContent) mainContent.scrollBy = scrollBySpy;
            mainContent.blur();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            expect(switchClassSpy).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(mainContent);
            expect(scrollBySpy).toHaveBeenCalledWith({ top: 56, behavior: 'smooth' });

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true }));
            expect(switchClassSpy).not.toHaveBeenCalled();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true }));
            expect(switchClassSpy).toHaveBeenCalledWith(1);
            switchClassSpy.mockClear();

            // 2. En vue Plan : Ctrl + ArrowUp depuis la 2e classe remonte vers la 1re, Ctrl + ArrowDown en butée basse est bloqué
            appState.currentClassId = c2.id;
            userSettings.academic.currentClassId = c2.id;
            appState.generatedResults.push({ id: 'u-c2', nom: 'MARTIN', prenom: 'Luc', classId: c2.id, seatingPosition: { row: 0, col: 0 } });
            SeatingChartManager.switchToView('plan', { immediate: true });
            SeatingChartManager._isFitted = true;
            SeatingChartManager._isLocked = true;

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true }));
            expect(switchClassSpy).not.toHaveBeenCalled();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true }));
            expect(switchClassSpy).toHaveBeenCalledWith(-1);
            switchClassSpy.mockClear();

            // 3. Sur mobile en vue Plan Consultation ajustée : un swipe vertical applique un rebond élastique avec verrouillage d'axe sans changer de classe
            const gridArea = document.getElementById('scGridArea');
            gridArea.setAttribute('data-fitted', 'true');
            Object.defineProperty(gridArea, 'scrollWidth', { value: 420, configurable: true });
            Object.defineProperty(gridArea, 'clientWidth', { value: 400, configurable: true });
            Object.defineProperty(gridArea, 'scrollHeight', { value: 325, configurable: true });
            Object.defineProperty(gridArea, 'clientHeight', { value: 300, configurable: true });

            const tsDown = new Event('touchstart');
            tsDown.touches = [{ clientX: 200, clientY: 120 }];
            gridArea.dispatchEvent(tsDown);
            const tmDown = new Event('touchmove');
            tmDown.touches = [{ clientX: 215, clientY: 240 }];
            gridArea.dispatchEvent(tmDown);
            expect(document.getElementById('scClassroomBoard').style.transform).toMatch(/^translate3d\(0px, [0-9.]+px, 0\)$/);
            const teDown = new Event('touchend');
            teDown.changedTouches = [{ clientX: 215, clientY: 240 }];
            gridArea.dispatchEvent(teDown);

            expect(switchClassSpy).not.toHaveBeenCalled();

            // 4. En vue Liste : un swipe vertical (même en bout de course) ne change jamais de classe
            SeatingChartManager.switchToView('list', { immediate: true });
            const outputSection = document.querySelector('.main-content .output-section');
            mainContent.scrollTop = 0;
            const tsTop = new Event('touchstart');
            tsTop.touches = [{ clientX: 200, clientY: 120 }];
            outputSection.dispatchEvent(tsTop);
            const tmTop = new Event('touchmove');
            tmTop.touches = [{ clientX: 200, clientY: 240 }];
            outputSection.dispatchEvent(tmTop);
            const teTop = new Event('touchend');
            teTop.changedTouches = [{ clientX: 200, clientY: 240 }];
            outputSection.dispatchEvent(teTop);
            expect(switchClassSpy).not.toHaveBeenCalled();
            switchClassSpy.mockRestore();
        });

        it('devrait verrouiller strictement l\'édition sur une classe reconstituée (isVirtual) et afficher les badges de groupe (G1, G2) ainsi que la capsule "Vue combinée"', () => {
            const g1 = ClassManager.createClass('3 TECHNOLOGIE G1');
            const g2 = ClassManager.createClass('3 TECHNOLOGIE G2');
            appState.generatedResults = [
                { id: 's-charly', nom: 'MARTIN', prenom: 'Charly', classId: g1.id, studentData: { classe: '3 1' }, seatingPosition: { row: 0, col: 1 } },
                { id: 's-noah', nom: 'DUPONT', prenom: 'Noah', classId: g2.id, studentData: { classe: '3 1' }, seatingPosition: { row: 0, col: 1 } },
                { id: 's-sami', nom: 'BOUKHARI', prenom: 'Sami', classId: g1.id, studentData: { classe: '3 1' }, seatingPosition: { row: 0, col: 0 } },
                { id: 's-unplaced', nom: 'LEROY', prenom: 'Jade', classId: g2.id, studentData: { classe: '3 1' }, seatingPosition: null }
            ];

            appState.currentClassId = 'virtual_31';
            userSettings.academic.currentClassId = 'virtual_31';

            SeatingChartManager.switchToView('plan', { immediate: true });

            // 1. La classe reconstituée s'ouvre en lecture seule (verrouillée)
            expect(SeatingChartManager._isLocked).toBe(true);
            const view = document.getElementById('seatingChartView');
            expect(view.dataset.virtual).toBe('true');

            // 2. La capsule de statut affiche "Vue combinée · 3ᵉG1 & 3ᵉG2" sans bouton d'action "Modifier"
            const pill = document.getElementById('scStatusPill');
            expect(pill.classList.contains('sc-status-virtual')).toBe(true);
            expect(pill.textContent).toContain('Vue combinée');
            expect(pill.textContent).toContain('3ᵉG1 & 3ᵉG2');
            expect(pill.textContent).toContain('1 non placé');
            expect(pill.querySelector('.sc-status-pill-hover')).toBeNull();

            // 3. Toute tentative de déverrouillage (_toggleLock ou clic sur la capsule) est bloquée et ne corrompt pas les positions des groupes sources
            SeatingChartManager._toggleLock();
            expect(SeatingChartManager._isLocked).toBe(true);
            pill.click();
            expect(SeatingChartManager._isLocked).toBe(true);

            SeatingChartManager._gridState[0][0] = null;
            SeatingChartManager._savePositionsToState();
            const samiSource = appState.generatedResults.find(r => r.id === 's-sami');
            expect(samiSource.seatingPosition).toEqual({ row: 0, col: 0 });

            // 4. Les cellules affichent clairement le groupe de chaque élève (G1 sur cellule simple, G1 et G2 sur cellule superposée)
            SeatingChartManager._loadPositionsFromState();
            SeatingChartManager._renderGrid();

            const singleCell = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="0"]');
            expect(singleCell.querySelector('.sc-cell-group-badge')).toBeNull();
            expect(singleCell.querySelector('.sc-cell-name .sc-stacked-group-tag')?.textContent).toBe('G1');
            expect(singleCell.getAttribute('data-tooltip')).toBe('Sami BOUKHARI • Groupe 3ᵉG1');

            const stackedCell = document.querySelector('#scGridContainer .sc-cell.sc-cell-stacked[data-row="0"][data-col="1"]');
            expect(stackedCell).not.toBeNull();
            const groupTags = Array.from(stackedCell.querySelectorAll('.sc-stacked-group-tag')).map(el => el.textContent);
            expect(groupTags).toEqual(['G2', 'G1']);
            const memberPills = Array.from(stackedCell.querySelectorAll('.sc-stacked-member'));
            expect(memberPills.map(el => el.getAttribute('data-tooltip'))).toEqual([
                'Noah DUPONT • Groupe 3ᵉG2',
                'Charly MARTIN • Groupe 3ᵉG1'
            ]);

            // 5. En vue Groupe (3ᵉG1), aucun badge permanent sur la carte du plan (pureté visuelle), mais classe d'origine dans le tooltip au survol
            appState.currentClassId = g1.id;
            userSettings.academic.currentClassId = g1.id;
            SeatingChartManager.onClassChange(true);
            const g1Cell = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="0"]');
            expect(g1Cell.querySelector('.sc-stacked-group-tag')).toBeNull();
            expect(g1Cell.querySelector('.sc-cell-group-badge')).toBeNull();
            expect(g1Cell.getAttribute('data-tooltip')).toBe('Sami BOUKHARI • Classe 3ᵉ1');
        });
    });

    describe('Foldable Continuum (Galaxy Z Fold Smartphone ↔ Tablet Transition)', () => {
        let originalWidth;
        let originalHeight;
        let originalMatchMedia;

        beforeEach(() => {
            originalWidth = window.innerWidth;
            originalHeight = window.innerHeight;
            originalMatchMedia = window.matchMedia;
            SeatingChartManager._cleanupFoldContinuum();
            SeatingChartManager._pendingFoldDirection = null;
            SeatingChartManager._pendingFoldTimestamp = 0;
        });

        afterEach(() => {
            window.innerWidth = originalWidth;
            window.innerHeight = originalHeight;
            window.matchMedia = originalMatchMedia;
            SeatingChartManager._cleanupFoldContinuum();
        });

        it('devrait distinguer _isCompactLayout (<= 768px) de _isMobileView sur tablette tactile dépliée (pointer: coarse)', () => {
            window.innerWidth = 880;
            window.matchMedia = vi.fn().mockImplementation((query) => ({
                matches: query === '(pointer: coarse)',
                addEventListener: vi.fn(),
                removeEventListener: vi.fn()
            }));

            expect(SeatingChartManager._isCompactLayout()).toBe(false);
            expect(SeatingChartManager._isMobileView()).toBe(true);

            window.innerWidth = 390;
            expect(SeatingChartManager._isCompactLayout()).toBe(true);
            expect(SeatingChartManager._isMobileView()).toBe(true);
        });

        it('devrait orchestrer l’animation d’ouverture (unfold: 390px -> 880px) avec vague radiale depuis la charnière centrale et nettoyage automatique', () => {
            vi.useFakeTimers();
            try {
                window.innerWidth = 390;
                window.innerHeight = 844;
                SeatingChartManager.switchToView('plan', { immediate: true });
                SeatingChartManager._wasCompactLayout = true;
                SeatingChartManager._lastViewportW = 390;
                SeatingChartManager._lastViewportH = 844;
                SeatingChartManager._isLocked = false;
                SeatingChartManager._openConfigPopover();

                const smartFitSpy = vi.spyOn(SeatingChartManager, '_applySmartFit');

                // Ouverture du téléphone (Smartphone -> Tablette)
                window.innerWidth = 880;
                window.innerHeight = 844;
                const triggered = SeatingChartManager._handleFormFactorCheck();

                expect(triggered).toBe(true);
                expect(SeatingChartManager._wasCompactLayout).toBe(false);
                expect(SeatingChartManager._configPopoverOpen).toBe(false);
                expect(smartFitSpy).toHaveBeenCalledWith(true);

                const view = document.getElementById('seatingChartView');
                expect(view.classList.contains('sc-fold-transitioning')).toBe(true);
                expect(view.classList.contains('sc-unfolding-to-tablet')).toBe(true);
                expect(view.classList.contains('sc-folding-to-mobile')).toBe(false);

                const leftCell = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="0"]');
                const rightCell = document.querySelector('#scGridContainer .sc-cell[data-row="0"][data-col="3"]');
                expect(leftCell.classList.contains('sc-fold-cell-wave')).toBe(true);
                expect(rightCell.classList.contains('sc-fold-cell-wave')).toBe(true);
                // En ouverture, les colonnes de gauche partent légèrement décalées vers la droite (> 0) et celles de droite vers la gauche (< 0)
                expect(parseFloat(leftCell.style.getPropertyValue('--fold-hinge-dx'))).toBeGreaterThan(0);
                expect(parseFloat(rightCell.style.getPropertyValue('--fold-hinge-dx'))).toBeLessThan(0);

                // Nettoyage complet après la fin de l'animation (620ms)
                vi.advanceTimersByTime(650);
                expect(view.classList.contains('sc-fold-transitioning')).toBe(false);
                expect(view.classList.contains('sc-unfolding-to-tablet')).toBe(false);
                expect(leftCell.classList.contains('sc-fold-cell-wave')).toBe(false);
                expect(leftCell.style.getPropertyValue('--fold-hinge-dx')).toBe('');
                expect(leftCell.style.getPropertyValue('--fold-cell-i')).toBe('');

                // Fermeture du téléphone (Tablette -> Smartphone)
                window.innerWidth = 390;
                const folded = SeatingChartManager._handleFormFactorCheck();
                expect(folded).toBe(true);
                expect(view.classList.contains('sc-folding-to-mobile')).toBe(true);
                expect(parseFloat(leftCell.style.getPropertyValue('--fold-hinge-dx'))).toBeLessThan(0);
                expect(parseFloat(rightCell.style.getPropertyValue('--fold-hinge-dx'))).toBeGreaterThan(0);

                vi.advanceTimersByTime(650);
                expect(view.classList.contains('sc-folding-to-mobile')).toBe(false);
                smartFitSpy.mockRestore();
            } finally {
                vi.useRealTimers();
            }
        });

        it('devrait détecter le dépliage même avec un fort zoom d’affichage One UI (344x780 -> 690x780) mais ignorer un simple changement de hauteur (clavier/barre d’adresse)', () => {
            window.innerWidth = 344;
            window.innerHeight = 780;
            SeatingChartManager.switchToView('plan', { immediate: true });
            SeatingChartManager._wasCompactLayout = true;
            SeatingChartManager._lastViewportW = 344;
            SeatingChartManager._lastViewportH = 780;

            // Simple changement de hauteur (barre d'adresse ou clavier virtuel) -> ignoré
            window.innerHeight = 520;
            expect(SeatingChartManager._handleFormFactorCheck()).toBe(false);

            // Dépliage vers l'écran interne avec zoom d'écran élevé (largeur x2, surface x2, tout en restant <= 768px)
            window.innerWidth = 690;
            window.innerHeight = 780;
            expect(SeatingChartManager._handleFormFactorCheck()).toBe(true);
            const view = document.getElementById('seatingChartView');
            expect(view.classList.contains('sc-unfolding-to-tablet')).toBe(true);

            // Maximisation d'une fenêtre desktop (> 768px -> > 768px) -> ignorée (aucun faux positif)
            SeatingChartManager._cleanupFoldContinuum();
            SeatingChartManager._wasCompactLayout = false;
            SeatingChartManager._lastViewportW = 820;
            SeatingChartManager._lastViewportH = 700;
            window.innerWidth = 1920;
            window.innerHeight = 1080;
            expect(SeatingChartManager._handleFormFactorCheck()).toBe(false);
            expect(view.classList.contains('sc-fold-transitioning')).toBe(false);
        });

        it('devrait différer l’animation si l’écran est en cours de bascule matérielle (visibilityState === hidden) et respecter prefers-reduced-motion', () => {
            window.innerWidth = 390;
            window.innerHeight = 844;
            SeatingChartManager.switchToView('plan', { immediate: true });
            SeatingChartManager._wasCompactLayout = true;
            SeatingChartManager._lastViewportW = 390;
            SeatingChartManager._lastViewportH = 844;

            const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
            window.innerWidth = 880;
            expect(SeatingChartManager._handleFormFactorCheck()).toBe(true);

            const view = document.getElementById('seatingChartView');
            expect(view.classList.contains('sc-unfolding-to-tablet')).toBe(false);
            expect(SeatingChartManager._pendingFoldDirection).toBe(true);

            // L'écran interne s'allume
            visibilitySpy.mockReturnValue('visible');
            document.dispatchEvent(new Event('visibilitychange'));
            expect(SeatingChartManager._pendingFoldDirection).toBeNull();
            expect(view.classList.contains('sc-unfolding-to-tablet')).toBe(true);

            // Respect de prefers-reduced-motion: reduce
            SeatingChartManager._cleanupFoldContinuum();
            window.matchMedia = vi.fn().mockImplementation((query) => ({
                matches: query === '(prefers-reduced-motion: reduce)',
                addEventListener: vi.fn(),
                removeEventListener: vi.fn()
            }));
            window.innerWidth = 390;
            expect(SeatingChartManager._handleFormFactorCheck()).toBe(true);
            expect(view.classList.contains('sc-fold-transitioning')).toBe(false);

            visibilitySpy.mockRestore();
        });
    });

    describe('Isolation clavier des modales (Flèches Haut/Bas/Gauche/Droite)', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <main class="main-content" tabindex="-1">
                    <div id="outputAndActionsWrapper" data-view="list">
                        <div id="outputSection"></div>
                        <div id="seatingChartView" style="display: none;">
                            <div id="scGridContainer"></div>
                        </div>
                    </div>
                </main>
                <div id="trombiWizardModal" class="trombi-modal">
                    <button id="trombiBtn" type="button">Zone</button>
                </div>
                <div id="appSettingsModal" class="modal">
                    <div class="modal-content">
                        <button id="settingsBtn" type="button">Paramètres</button>
                    </div>
                </div>
            `;
            SeatingChartManager._globalListenersInitialized = false;
            SeatingChartManager._isActive = false;
            appState.activeView = 'list';
            appState.generatedResults = [
                { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: appState.currentClassId }
            ];
            SeatingChartManager.init();
        });

        it('ne doit ni basculer en vue Plan ni scroller .main-content quand les flèches sont utilisées dans #trombiWizardModal ou une modale ouverte', () => {
            const mainContent = document.querySelector('.main-content');
            mainContent.scrollBy = vi.fn();
            const switchSpy = vi.spyOn(SeatingChartManager, 'switchToView');

            // Cas 1 : Modale autonome #trombiWizardModal ouverte (.visible)
            const trombiModal = document.getElementById('trombiWizardModal');
            const trombiBtn = document.getElementById('trombiBtn');
            trombiModal.classList.add('visible');
            trombiBtn.focus();

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true }));

            expect(switchSpy).not.toHaveBeenCalled();
            expect(mainContent.scrollBy).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(trombiBtn);

            // _focusListScrollContainer ne doit pas voler le focus tant qu'une modale est ouverte
            SeatingChartManager._focusListScrollContainer();
            expect(document.activeElement).toBe(trombiBtn);

            trombiModal.classList.remove('visible');

            // Cas 2 : Modale standard ouverte via UI.openModal
            const settingsModal = document.getElementById('appSettingsModal');
            UI.openModal(settingsModal);

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

            expect(switchSpy).not.toHaveBeenCalled();
            expect(mainContent.scrollBy).not.toHaveBeenCalled();

            UI.activeModal = null;
            document.body.classList.remove('modal-open');
            switchSpy.mockRestore();
        });
    });
});
