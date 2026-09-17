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
        SeatingChartManager._sidebarSortOrder = 'asc';
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

