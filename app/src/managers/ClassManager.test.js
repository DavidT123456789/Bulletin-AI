import { describe, it, expect, beforeEach } from 'vitest';
import { ClassManager } from './ClassManager';
import { appState, userSettings } from '../state/State';

describe('ClassManager - isDemoClass and Demo Handling', () => {
    beforeEach(() => {
        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        appState.currentClassId = null;
    });

    it('should correctly identify "Classe Exemple" as a demo class', () => {
        const demoClass = ClassManager.createClass('Classe Exemple');
        expect(ClassManager.isDemoClass(demoClass.id)).toBe(true);
    });

    it('should correctly identify a standard class as not a demo class', () => {
        const realClass = ClassManager.createClass('3ème B');
        expect(ClassManager.isDemoClass(realClass.id)).toBe(false);
    });

    it('should check the current active class when no classId is passed', () => {
        const demoClass = ClassManager.createClass('Classe Exemple');
        appState.currentClassId = demoClass.id;
        userSettings.academic.currentClassId = demoClass.id;

        expect(ClassManager.isDemoClass()).toBe(true);

        const realClass = ClassManager.createClass('6ème A');
        appState.currentClassId = realClass.id;
        userSettings.academic.currentClassId = realClass.id;

        expect(ClassManager.isDemoClass()).toBe(false);
    });

    it('should return false if no class is found', () => {
        expect(ClassManager.isDemoClass('non-existent-id')).toBe(false);
        expect(ClassManager.isDemoClass(null)).toBe(false);
    });
});
