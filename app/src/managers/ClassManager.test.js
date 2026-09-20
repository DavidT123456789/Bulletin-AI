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

describe('ClassManager - Virtual Classes (Classes complètes)', () => {
    beforeEach(() => {
        userSettings.academic.classes = [];
        userSettings.academic.currentClassId = null;
        appState.currentClassId = null;
        appState.generatedResults = [];
        appState.filteredResults = [];
    });

    it('devrait identifier correctement un ID de classe virtuelle', () => {
        expect(ClassManager.isVirtualClass('virtual_31')).toBe(true);
        expect(ClassManager.isVirtualClass('class-123')).toBe(false);
        expect(ClassManager.isVirtualClass(null)).toBe(false);
    });

    it('devrait reconstituer dynamiquement les classes virtuelles complètes à partir des groupes', () => {
        // Simuler deux groupes : 3 G1 et 3 G2
        const group1 = ClassManager.createClass('3 TECHNOLOGIE G1');
        const group2 = ClassManager.createClass('3 TECHNOLOGIE G2');

        appState.generatedResults = [
            // Élèves de 3 1 dans G1
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } },
            { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: group1.id, studentData: { classe: '3 1' } },
            // Élèves de 3 1 et 3 2 dans G2
            { id: 's3', nom: 'BERNARD', prenom: 'Chloe', classId: group2.id, studentData: { classe: '3 1' } },
            { id: 's4', nom: 'DURAND', prenom: 'David', classId: group2.id, studentData: { classe: '3 2' } }
        ];

        const virtuals = ClassManager.getVirtualClasses();
        expect(virtuals.length).toBe(2);

        // 3 1 doit rassembler s1, s2 et s3 (3 élèves issus de 3ᵉG1 et 3ᵉG2)
        const v31 = virtuals.find(v => v.normName === '31');
        expect(v31).toBeDefined();
        expect(v31.id).toBe('virtual_31');
        expect(v31.name).toBe('3ᵉ1');
        expect(v31.studentCount).toBe(3);
        expect(v31.sourceGroupIds).toContain(group1.id);
        expect(v31.sourceGroupIds).toContain(group2.id);

        // 3 2 doit contenir s4 (1 élève issu de 3ᵉG2)
        const v32 = virtuals.find(v => v.normName === '32');
        expect(v32).toBeDefined();
        expect(v32.studentCount).toBe(1);
    });

    it('ne devrait pas créer de classe virtuelle si la classe physique non-groupe existe déjà', () => {
        // Classe complète 5 1 déjà existante
        const realClass = ClassManager.createClass('5 1');
        appState.generatedResults = [
            { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: realClass.id, studentData: { classe: '5 1' } }
        ];

        const virtuals = ClassManager.getVirtualClasses();
        expect(virtuals.length).toBe(0);
    });

    it('devrait basculer (switchClass) sur une classe virtuelle et filtrer appState.filteredResults', async () => {
        const group1 = ClassManager.createClass('3 G1');
        const group2 = ClassManager.createClass('3 G2');

        const student1 = { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } };
        const student2 = { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: group2.id, studentData: { classe: '3 1' } };
        const student3 = { id: 's3', nom: 'DURAND', prenom: 'David', classId: group2.id, studentData: { classe: '3 2' } };

        appState.generatedResults = [student1, student2, student3];

        await ClassManager.switchClass('virtual_31');

        expect(appState.currentClassId).toBe('virtual_31');
        expect(userSettings.academic.currentClassId).toBe('virtual_31');
        expect(appState.filteredResults.length).toBe(2);
        expect(appState.filteredResults.map(s => s.id)).toEqual(['s1', 's2']);

        const current = ClassManager.getCurrentClass();
        expect(current).toBeDefined();
        expect(current.name).toBe('3ᵉ1');
        expect(current.isVirtual).toBe(true);
    });

    it('devrait retourner les bons élèves via getStudentsForClass pour les classes réelles et reconstituées', () => {
        const group1 = ClassManager.createClass('3 G1');
        const group2 = ClassManager.createClass('3 G2');

        const student1 = { id: 's1', nom: 'DUPONT', prenom: 'Alice', classId: group1.id, studentData: { classe: '3 1' } };
        const student2 = { id: 's2', nom: 'MARTIN', prenom: 'Bob', classId: group2.id, studentData: { classe: '3 1' } };
        const student3 = { id: 's3', nom: 'DURAND', prenom: 'David', classId: group2.id, studentData: { classe: '3 2' } };

        appState.generatedResults = [student1, student2, student3];

        // Groupe physique 3 G1 -> student1
        expect(ClassManager.getStudentsForClass(group1.id).map(s => s.id)).toEqual(['s1']);
        // Groupe physique 3 G2 -> student2, student3
        expect(ClassManager.getStudentsForClass(group2.id).map(s => s.id)).toEqual(['s2', 's3']);
        // Classe reconstituée 3 1 -> student1, student2
        expect(ClassManager.getStudentsForClass('virtual_31').map(s => s.id)).toEqual(['s1', 's2']);
        // Classe reconstituée 3 2 -> student3
        expect(ClassManager.getStudentsForClass('virtual_32').map(s => s.id)).toEqual(['s3']);
    });
});
