import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SeatingChartManager } from './SeatingChartManager';
import { appState, userSettings } from '../state/State';
import { ClassManager } from './ClassManager';

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

    it('devrait afficher la capacité et le statut de placement (« Tous placés / X non placés · Y places libres ») en mode édition', () => {
        // 2 élèves, grille 3x3 (9 places), 0 placé -> unplaced = 2, available = 9
        SeatingChartManager._isLocked = false;
        SeatingChartManager._updateFooter();
        expect(document.getElementById('scFooterInfo').textContent).toContain('2 non placés');
        expect(document.getElementById('scFooterInfo').textContent).toContain('9 places libres');

        // Placer tous les élèves
        SeatingChartManager._gridState[0][0] = 's1';
        SeatingChartManager._gridState[0][1] = 's2';
        SeatingChartManager._students[0].seatingPosition = { row: 0, col: 0 };
        SeatingChartManager._students[1].seatingPosition = { row: 0, col: 1 };

        // Tous placés en édition : « Tous placés · 7 places libres »
        SeatingChartManager._isLocked = false;
        SeatingChartManager._updateFooter();
        expect(document.getElementById('scFooterInfo').textContent).toBe('Tous placés · 7 places libres');
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

    it('devrait isoler le verrouillage : verrouiller la classe A n\'impacte pas la classe B', () => {
        appState.currentClassId = classA.id;
        userSettings.academic.currentClassId = classA.id;
        SeatingChartManager._isActive = true;
        SeatingChartManager._students = SeatingChartManager._getCurrentClassStudents();

        // Verrouiller classe A
        SeatingChartManager._isLocked = false;
        SeatingChartManager._toggleLock();

        expect(SeatingChartManager._isLocked).toBe(true);
        expect(classA.seatingLocked).toBe(true);
        expect(classA.seatingValidatedAt).toBeTruthy();
        expect(classB.seatingLocked).toBe(false);

        // Bascule vers classe B via onClassChange
        appState.currentClassId = classB.id;
        userSettings.academic.currentClassId = classB.id;
        SeatingChartManager.onClassChange(true);

        // Classe B doit être en mode édition (non verrouillée)
        expect(SeatingChartManager._isLocked).toBe(false);

        // Revenir vers classe A
        appState.currentClassId = classA.id;
        userSettings.academic.currentClassId = classA.id;
        SeatingChartManager.onClassChange(true);

        // Classe A doit restaurer son état verrouillé
        expect(SeatingChartManager._isLocked).toBe(true);
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
        expect(cell.querySelector('.sc-stacked-count-pill').textContent).toBe('2');
        expect(cell.textContent).toContain('Alice');
        expect(cell.textContent).toContain('Bob');
    });
});



