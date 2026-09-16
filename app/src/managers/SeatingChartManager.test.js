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
